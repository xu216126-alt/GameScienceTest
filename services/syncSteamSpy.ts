/**
 * SteamSpy 数据同步：供 GET /api/cron/sync-steamspy 与 scripts/syncSteamSpy.ts 调用。
 * 串行执行、每页间隔 1s、429/503/连接失败指数退避、每日 top100×3 + 2 页 all（10 天建库）。
 */

const STEAM_META_KEY_PREFIX = 'steam_meta:';
const LAST_SYNC_TIMESTAMP_KEY = 'steamspy:last_sync_timestamp';
const ALL_NEXT_PAGE_KEY = 'steamspy:all:next_page';
const IDEMPOTENCY_TTL_SEC = 24 * 3600; // 24h 内不重复同步
const PAGE_INTERVAL_MS = 2000; // 每页/每次请求间隔 2s，减轻 SteamSpy "Too many connections"
const BACKOFF_MS = [2000, 4000, 8000]; // 指数退避：2s → 4s → 8s
const MAX_RETRIES = 3;
const ALL_PAGES_TOTAL = 20; // all 共 20 页，每天 2 页，10 天建库
const ALL_PAGES_PER_RUN = 2;

interface SteamSpyRawItem {
  appid?: number;
  name?: string;
  owners?: string;
  positive?: number;
  negative?: number;
  average_forever?: number;
  median_forever?: number;
  ccu?: number;
  [k: string]: unknown;
}

interface SteamMetaValue {
  appid: number;
  name: string;
  owners: string;
  positive: number;
  negative: number;
  average_forever: number;
  median_forever: number;
  ccu: number;
  score_ratio: number;
  last_sync: number;
}

export interface SyncSteamSpyResult {
  total_pages: number;
  total_games: number;
  successful_batches: number;
  failed_batches: number;
  duration_ms: number;
  skipped?: boolean;
  totalSync?: number;
  elapsedSec?: number;
}

export interface SyncSteamSpyConfig {
  redis: {
    get?: (key: string) => Promise<string | null>;
    set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
    pipeline?: () => {
      set: (key: string, value: string, opts?: { EX?: number }) => void;
      exec: () => Promise<unknown[]>;
    };
  };
  /** 兼容旧调用；与 fetchWithStatus 二选一，无 fetchWithStatus 时用 fetchJson 包装（无法区分 429/503） */
  fetchJson?: (url: string) => Promise<unknown>;
  /** 推荐：返回 status 与 body，用于 429/503 重试 */
  fetchWithStatus?: (url: string) => Promise<{ status: number; data: unknown }>;
  steamSpyBaseUrl?: string;
  steamSpyCacheTtlSec?: number;
}

function toSteamMeta(raw: SteamSpyRawItem): SteamMetaValue | null {
  const appid = Number(raw?.appid);
  if (!Number.isInteger(appid) || appid <= 0) return null;
  const positive = Number(raw?.positive) || 0;
  const negative = Number(raw?.negative) || 0;
  const total = positive + negative;
  const score_ratio = total > 0 ? Math.round((positive / total) * 10000) / 10000 : 0;
  return {
    appid,
    name: String(raw?.name ?? '').trim() || `App ${appid}`,
    owners: String(raw?.owners ?? ''),
    positive,
    negative,
    average_forever: Number(raw?.average_forever) || 0,
    median_forever: Number(raw?.median_forever) || 0,
    ccu: Number(raw?.ccu) || 0,
    score_ratio,
    last_sync: Math.floor(Date.now() / 1000),
  };
}

function parseSteamSpyData(data: unknown): SteamSpyRawItem[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, SteamSpyRawItem>;
  return Object.values(obj);
}

export async function runSyncSteamSpy(config: SyncSteamSpyConfig): Promise<SyncSteamSpyResult> {
  const started = Date.now();
  const baseUrl = (config.steamSpyBaseUrl || 'https://steamspy.com').replace(/\/$/, '');
  const ttlSec = config.steamSpyCacheTtlSec ?? 7 * 24 * 3600;
  const redis = config.redis;
  const redisGet = redis.get && typeof redis.get === 'function' ? redis.get.bind(redis) : null;
  const pipelineFn = redis.pipeline && typeof redis.pipeline === 'function' ? redis.pipeline.bind(redis) : null;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const doFetch = config.fetchWithStatus ?? (async (url: string) => {
    try {
      const data = config.fetchJson ? await config.fetchJson(url) : null;
      return { status: 200, data };
    } catch {
      return { status: 0, data: null };
    }
  });

  // 幂等保护：24h 内已同步则直接返回
  if (redisGet) {
    try {
      const lastSync = await redisGet(LAST_SYNC_TIMESTAMP_KEY);
      if (lastSync != null && String(lastSync).trim() !== '') {
        const duration_ms = Math.round(Date.now() - started);
        const result: SyncSteamSpyResult = {
          total_pages: 0,
          total_games: 0,
          successful_batches: 0,
          failed_batches: 0,
          duration_ms,
          skipped: true,
        };
        console.log('[syncSteamSpy] skipped (synced within 24h)', JSON.stringify({ total_pages: 0, total_games: 0, successful_batches: 0, failed_batches: 0, duration_ms }));
        return result;
      }
    } catch (_) {
      /* 检查失败则继续执行 */
    }
  }

  let total_games = 0;
  let successful_batches = 0;
  let failed_batches = 0;
  let total_requests = 0;

  const writeBatch = async (label: string, items: SteamSpyRawItem[]): Promise<boolean> => {
    const entries: { key: string; value: string }[] = [];
    for (const raw of items) {
      const meta = toSteamMeta(raw);
      if (!meta) continue;
      entries.push({ key: `${STEAM_META_KEY_PREFIX}${meta.appid}`, value: JSON.stringify(meta) });
    }
    if (entries.length === 0) return true;
    if (pipelineFn) {
      try {
        const pipe = pipelineFn();
        for (const { key, value } of entries) pipe.set(key, value, { EX: ttlSec });
        await pipe.exec();
        total_games += entries.length;
        return true;
      } catch (err) {
        console.warn(`[syncSteamSpy] ${label} pipeline.exec 失败:`, (err as Error)?.message ?? err);
        return false;
      }
    }
    let ok = 0;
    for (const { key, value } of entries) {
      try {
        await redis.set(key, value, { EX: ttlSec });
        ok += 1;
      } catch (_) {}
    }
    total_games += ok;
    return true;
  };

  const fetchWithBackoff = async (url: string, label: string): Promise<SteamSpyRawItem[] | null> => {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await doFetch(url);
      const status = res.status;
      const isRetryable = status === 429 || status === 503 || status === 500 || status === 0;
      if (status === 200 && res.data != null) {
        return parseSteamSpyData(res.data);
      }
      if (isRetryable && attempt < MAX_RETRIES) {
        const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
        console.warn(`[syncSteamSpy] ${label} status=${status}，${delay / 1000}s 后重试 (${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
      } else {
        console.warn(`[syncSteamSpy] ${label} 请求失败 status=${status}`);
        return null;
      }
    }
    return null;
  };

  const topEndpoints: { name: string; request: string }[] = [
    { name: 'top100in2weeks', request: 'top100in2weeks' },
    { name: 'top100forever', request: 'top100forever' },
    { name: 'top100owned', request: 'top100owned' },
  ];

  for (const { name, request } of topEndpoints) {
    const url = `${baseUrl}/api.php?request=${request}`;
    const items = await fetchWithBackoff(url, name);
    total_requests += 1;
    if (items && items.length > 0) {
      const ok = await writeBatch(name, items);
      if (ok) successful_batches += 1;
      else failed_batches += 1;
    }
    await sleep(PAGE_INTERVAL_MS);
  }

  let nextPage = 0;
  if (redisGet) {
    try {
      const v = await redisGet(ALL_NEXT_PAGE_KEY);
      if (v != null && v.trim() !== '') nextPage = Math.max(0, Math.min(ALL_PAGES_TOTAL - 1, parseInt(v, 10) || 0));
    } catch (_) {}
  }

  for (let i = 0; i < ALL_PAGES_PER_RUN; i++) {
    const page = nextPage + i;
    if (page >= ALL_PAGES_TOTAL) break;
    const url = `${baseUrl}/api.php?request=all&page=${page}`;
    const items = await fetchWithBackoff(url, `all&page=${page}`);
    total_requests += 1;
    if (items && items.length > 0) {
      const ok = await writeBatch(`all page ${page}`, items);
      if (ok) successful_batches += 1;
      else failed_batches += 1;
    }
    await sleep(PAGE_INTERVAL_MS);
  }

  const newNextPage = Math.min(ALL_PAGES_TOTAL, nextPage + ALL_PAGES_PER_RUN);
  if (redis.set) {
    try {
      await redis.set(ALL_NEXT_PAGE_KEY, String(newNextPage), { EX: 30 * 24 * 3600 });
    } catch (_) {}
  }

  if (successful_batches > 0 && redis.set) {
    try {
      await redis.set(LAST_SYNC_TIMESTAMP_KEY, String(Math.floor(Date.now() / 1000)), { EX: IDEMPOTENCY_TTL_SEC });
    } catch (_) {}
  }

  const duration_ms = Math.round(Date.now() - started);
  const result: SyncSteamSpyResult = {
    total_pages: total_requests,
    total_games,
    successful_batches,
    failed_batches,
    duration_ms,
    totalSync: total_games,
    elapsedSec: duration_ms / 1000,
  };
  console.log('[syncSteamSpy]', JSON.stringify({ total_pages: result.total_pages, total_games: result.total_games, successful_batches: result.successful_batches, failed_batches: result.failed_batches, duration_ms: result.duration_ms, all_next_page: newNextPage }));
  return result;
}
