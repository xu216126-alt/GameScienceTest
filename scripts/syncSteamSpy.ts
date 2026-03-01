/**
 * SteamSpy 数据同步脚本（独立运行，不影响推荐流程）
 * 支持 maxPages、断点续传（24h 内已同步页跳过）、进度日志。
 */
import 'dotenv/config';
import { createClient } from 'redis';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { runSyncSteamSpy } from '../services/syncSteamSpy';

const STEAMSPY_BASE_URL = (process.env.STEAMSPY_BASE_URL || 'https://steamspy.com').replace(/\/$/, '');
const STEAMSPY_CACHE_TTL = Number(process.env.STEAMSPY_CACHE_TTL || 7 * 24 * 3600);
/** 最大同步页数（page 0 到 maxPages-1），默认 20，约 1–2 万条 */
const STEAMSPY_SYNC_MAX_PAGES = Math.max(1, Math.min(100, Number(process.env.STEAMSPY_SYNC_MAX_PAGES) || 20));
/** 断点续传：某页在此小时数内已同步则跳过，0 表示不跳过 */
const STEAMSPY_SKIP_PAGE_WITHIN_HOURS = Math.max(0, Number(process.env.STEAMSPY_SKIP_PAGE_WITHIN_HOURS) ?? 24);

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
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.error('[syncSteamSpy] REDIS_URL is required');
    process.exit(1);
  }

  const client = createClient({ url: redisUrl });
  client.on('error', (err) => console.warn('[syncSteamSpy] Redis error:', err?.message));
  await client.connect();

  try {
    await runSyncSteamSpy({
      redis: client,
      fetchJson: (url: string) => fetch(url, { signal: AbortSignal.timeout(30000) }).then((r) => r.json()),
      steamSpyBaseUrl: STEAMSPY_BASE_URL,
      steamSpyCacheTtlSec: STEAMSPY_CACHE_TTL,
      maxPages: STEAMSPY_SYNC_MAX_PAGES,
      skipPageWithinHours: STEAMSPY_SKIP_PAGE_WITHIN_HOURS,
    });
  } finally {
    await client.quit();
  }
}

run().catch((err) => {
  console.error('[syncSteamSpy]', err?.message || err);
  process.exit(1);
});
