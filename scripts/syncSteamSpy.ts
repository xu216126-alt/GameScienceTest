/**
 * SteamSpy 数据同步脚本（独立运行，不影响推荐流程）
 * 串行执行、每页间隔 1s、429/503 指数退避、每日 top100×3 + 2 页 all。
 * 支持 REDIS_URL（node-redis）或 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN（Upstash REST）。
 */
import 'dotenv/config';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runSyncSteamSpy } from '../services/syncSteamSpy';

const STEAMSPY_BASE_URL = (process.env.STEAMSPY_BASE_URL || 'https://steamspy.com').replace(/\/$/, '');
const STEAMSPY_CACHE_TTL = Number(process.env.STEAMSPY_CACHE_TTL || 7 * 24 * 3600);
/** 伪装成真实浏览器，避免 SteamSpy/Cloudflare 识别为机器人；Referer 尤其重要 */
const STEAMSPY_HEADERS: HeadersInit = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  Referer: 'https://steamspy.com/',
  'X-Requested-With': 'XMLHttpRequest',
};

async function createSteamSpyFetch(): Promise<(url: string, init?: RequestInit) => Promise<Response>> {
  const proxyUrl = (process.env.STEAMSPY_PROXY_URL || '').trim();
  if (proxyUrl) {
    const { fetch: undiciFetch, ProxyAgent } = await import('undici');
    const agent = new ProxyAgent(proxyUrl);
    console.log('[syncSteamSpy] 使用代理:', proxyUrl.replace(/:[^:@]+@/, ':****@'));
    return (url: string, init?: RequestInit) =>
      undiciFetch(url, { ...init, dispatcher: agent } as any) as unknown as Promise<Response>;
  }
  return (url: string, init?: RequestInit) => fetch(url, init);
}

async function fetchWithStatus(url: string, steamSpyFetch: (url: string, init?: RequestInit) => Promise<Response>): Promise<{ status: number; data: unknown }> {
  try {
    const res = await steamSpyFetch(url, { signal: AbortSignal.timeout(30000), headers: STEAMSPY_HEADERS });
    const text = await res.text();
    if (res.status === 403) {
      if (text.includes('Just a moment') || text.includes('Cloudflare')) {
        console.warn('[syncSteamSpy] 403 来自 Cloudflare 挑战，建议设置 STEAMSPY_PROXY_URL 通过代理访问');
      }
      console.warn('[syncSteamSpy] 403 响应片段:', text.slice(0, 300));
    }
    if (res.status === 500) {
      const snippet = text.slice(0, 400);
      if (!snippet.trim()) {
        console.warn('[syncSteamSpy] 500 且 body 为空，可能是代理连接上游失败，请用浏览器开代理访问 https://steamspy.com/api.php?request=top100in2weeks 测试');
      } else {
        console.warn('[syncSteamSpy] 500 响应片段:', snippet);
      }
    }
    let data: unknown = null;
    try {
      data = text.trim().startsWith('{') ? JSON.parse(text) : null;
    } catch (_) {}
    const tooManyConnections = /too many connections|connection failed/i.test(text);
    if (tooManyConnections && !data) {
      console.warn('[syncSteamSpy] 响应含 "Too many connections"，按 503 重试');
      return { status: 503, data: null };
    }
    return { status: res.status, data };
  } catch (err) {
    console.warn('[syncSteamSpy] 请求异常:', (err as Error)?.message ?? err);
    return { status: 0, data: null };
  }
}

function loadEnvFromFile(): void {
  const root = join(__dirname, '..');
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  const content = readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

async function run(): Promise<void> {
  loadEnvFromFile();

  const steamSpyFetch = await createSteamSpyFetch();
  const fetchWithStatusForSync = (url: string) => fetchWithStatus(url, steamSpyFetch);

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  type RedisAdapter = {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
    pipeline?: () => { set: (k: string, v: string, opts?: { EX?: number }) => void; exec: () => Promise<unknown[]> };
  };
  let redis: RedisAdapter;

  if (upstashUrl && upstashToken) {
    const { Redis } = await import('@upstash/redis');
    const upstash = new Redis({ url: upstashUrl, token: upstashToken });
    redis = {
      get: (key: string) => upstash.get(key).then((v) => (v == null ? null : String(v))),
      set: (key: string, value: string, opts?: { EX?: number }) =>
        upstash.set(key, value, opts?.EX != null ? { ex: opts.EX } : undefined),
      pipeline: () => {
        const p = upstash.pipeline();
        return {
          set: (key: string, value: string, opts?: { EX?: number }) =>
            p.set(key, value, opts?.EX != null ? { ex: opts.EX } : undefined),
          exec: () => p.exec(),
        };
      },
    };
    console.log('[syncSteamSpy] Using Upstash REST (pipeline batch writes)');
  } else if (redisUrl) {
    const { createClient } = await import('redis');
    const client = createClient({ url: redisUrl });
    client.on('error', (err) => console.warn('[syncSteamSpy] Redis error:', err?.message));
    await client.connect();
    redis = {
      get: (key: string) => client.get(key),
      set: (key: string, value: string, opts?: { EX?: number }) => client.set(key, value, opts),
    };
    try {
      await runSyncSteamSpy({
        redis,
        fetchWithStatus: fetchWithStatusForSync,
        steamSpyBaseUrl: STEAMSPY_BASE_URL,
        steamSpyCacheTtlSec: STEAMSPY_CACHE_TTL,
      });
    } finally {
      await client.quit();
    }
    return;
  } else {
    console.error('[syncSteamSpy] Set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env');
    process.exit(1);
  }

  await runSyncSteamSpy({
    redis,
    fetchWithStatus: fetchWithStatusForSync,
    steamSpyBaseUrl: STEAMSPY_BASE_URL,
    steamSpyCacheTtlSec: STEAMSPY_CACHE_TTL,
  });
}

run().catch((err) => {
  console.error('[syncSteamSpy]', err?.message || err);
  process.exit(1);
});
