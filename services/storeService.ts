/**
 * Steam Store 数据层：所有 Steam Store 请求由此统一管理
 * - 批量请求 appdetails（每批最多 30，自动分批）
 * - Redis 缓存 steam_store_meta:{appid}，TTL 24h
 * - p-limit 最大并发 3
 * - 支持 STEAM_STORE_BASE_URL 代理
 */
import pLimit from 'p-limit';

const BATCH_SIZE = 30;
const CONCURRENCY = 3;
const CACHE_KEY_PREFIX = 'steam_store_meta:';
const CACHE_TTL_SEC = 24 * 60 * 60; // 24h

export interface GameMeta {
  appId: number;
  appType: string;
  name: string;
  posterImage: string;
  headerImage: string;
  shortDescription: string;
  trailerUrl: string;
  trailerPoster: string;
  genres: string[];
  releaseDate: string;
  isFree: boolean;
  price: string;
  positiveRate: string;
  currentPlayers: string;
  steamUrl: string;
}

interface StoreLocale {
  cc: string;
  l: string;
}

type FetchJson = (url: string) => Promise<unknown>;
type GetRedis = () => { get: (k: string) => Promise<string | null>; set: (k: string, v: string, opts?: { EX?: number }) => Promise<unknown> } | null;

let fetchJsonFn: FetchJson | null = null;
let getRedisFn: GetRedis | null = null;
let getRedisHealthyFn: (() => boolean) | null = null;
let steamStoreBaseUrl = 'https://store.steampowered.com';
let storeLocaleForLangFn: (lang: string) => StoreLocale = () => ({ cc: 'cn', l: 'schinese' });
let onSteamStoreCall: (() => void) | null = null;
let onCacheHit: (() => void) | null = null;
let onCacheMiss: (() => void) | null = null;

function normalizeLang(lang: string): string {
  return lang === 'zh-CN' ? 'zh-CN' : 'en-US';
}

export function init(config: {
  fetchJson: FetchJson;
  getRedisClient: GetRedis;
  getRedisHealthy?: () => boolean;
  steamStoreBaseUrl?: string;
  storeLocaleForLang?: (lang: string) => StoreLocale;
  onSteamStoreCall?: () => void;
  onCacheHit?: () => void;
  onCacheMiss?: () => void;
}): void {
  fetchJsonFn = config.fetchJson;
  getRedisFn = config.getRedisClient;
  getRedisHealthyFn = config.getRedisHealthy ?? null;
  steamStoreBaseUrl = (config.steamStoreBaseUrl || process.env.STEAM_STORE_BASE_URL || 'https://store.steampowered.com').replace(/\/$/, '');
  if (config.storeLocaleForLang) storeLocaleForLangFn = config.storeLocaleForLang;
  onSteamStoreCall = config.onSteamStoreCall ?? null;
  onCacheHit = config.onCacheHit ?? null;
  onCacheMiss = config.onCacheMiss ?? null;
}

function ensureInit(): void {
  if (!fetchJsonFn || !storeLocaleForLangFn) {
    throw new Error('storeService not initialized: call storeService.init(config) first');
  }
}

function buildGameMeta(appId: number, data: Record<string, unknown>): GameMeta {
  const id = Number(appId);
  return {
    appId: id,
    appType: String(data.type || ''),
    name: (data.name as string) || `App ${id}`,
    posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    headerImage: (data.header_image as string) || `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`,
    shortDescription: (data.short_description as string) || 'Detailed description is temporarily unavailable for this game.',
    trailerUrl: (() => {
      const m = (data.movies as { mp4?: { max?: string; '480'?: string }; thumbnail?: string }[])?.[0];
      return m?.mp4?.max ?? m?.mp4?.['480'] ?? '';
    })(),
    trailerPoster: String((data.movies as { thumbnail?: string }[])?.[0]?.thumbnail ?? ''),
    genres: Array.isArray(data.genres) ? (data.genres as { description?: string }[]).map((g) => String(g?.description ?? '')).filter(Boolean) : [],
    releaseDate: (data.release_date as { date?: string })?.date ?? 'Unknown',
    isFree: Boolean(data.is_free),
    price: data.is_free ? 'Free' : ((data.price_overview as { final_formatted?: string })?.final_formatted ?? 'N/A'),
    positiveRate: 'N/A',
    currentPlayers: 'N/A',
    steamUrl: `https://store.steampowered.com/app/${id}`,
  };
}

async function fetchAppDetailsBatch(appIds: number[], lang: string): Promise<Record<number, GameMeta>> {
  if (!appIds.length || !fetchJsonFn) return {};
  onSteamStoreCall?.();
  const locale = storeLocaleForLangFn(normalizeLang(lang));
  const idsParam = appIds.slice(0, BATCH_SIZE).join(',');
  const url = `${steamStoreBaseUrl}/api/appdetails?appids=${idsParam}&cc=${locale.cc}&l=${locale.l}`;
  const data = await fetchJsonFn(url).catch(() => null) as Record<string, { success?: boolean; data?: Record<string, unknown> }> | null;
  if (!data || typeof data !== 'object') return {};
  const out: Record<number, GameMeta> = {};
  for (const id of appIds) {
    const node = data[String(id)];
    if (node?.success && node.data) {
      const meta = buildGameMeta(id, node.data);
      const isGame = meta.appType.toLowerCase() === 'game';
      const validName = meta.name && !/^App\s+\d+$/i.test(meta.name);
      const validMedia = Boolean(meta.headerImage);
      if (isGame && validName && validMedia) out[id] = meta;
    }
  }
  return out;
}

async function fetchMissingFromSteam(
  missIds: number[],
  lang: string,
  limit: (fn: () => Promise<Record<number, GameMeta>>) => Promise<Record<number, GameMeta>>
): Promise<{ results: Record<number, GameMeta>; steamBatches: number }> {
  const results: Record<number, GameMeta> = {};
  const chunks: number[][] = [];
  for (let i = 0; i < missIds.length; i += BATCH_SIZE) {
    chunks.push(missIds.slice(i, i + BATCH_SIZE));
  }
  let steamBatches = 0;
  for (const chunk of chunks) {
    const batchResults = await limit(() => fetchAppDetailsBatch(chunk, lang));
    steamBatches += 1;
    Object.assign(results, batchResults);
    const got = new Set(Object.keys(batchResults).map(Number));
    const stillMiss = chunk.filter((id) => !got.has(id));
    if (stillMiss.length > 0) {
      await Promise.all(
        stillMiss.map((id) =>
          limit(async () => {
            const one = await fetchAppDetailsBatch([id], lang);
            steamBatches += 1;
            if (one[id]) results[id] = one[id];
            return one;
          })
        )
      );
    }
  }
  return { results, steamBatches };
}

/**
 * 批量获取游戏元数据：先查 Redis 缓存，缺失再请求 Steam，成功后写回缓存。
 * 批量请求（每批最多 30）、p-limit 并发 3、支持 STEAM_STORE_BASE_URL。
 */
export async function getGamesMeta(appIds: number[], lang: string = 'en-US'): Promise<GameMeta[]> {
  ensureInit();
  const normalized = (appIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  const unique = [...new Set(normalized)];
  if (unique.length === 0) {
    console.log('[store-service] getGamesMeta: requested=0 cacheHits=0 steamBatches=0');
    return [];
  }

  const redis = (getRedisHealthyFn && !getRedisHealthyFn()) ? null : (getRedisFn?.() ?? null);
  const limit = pLimit(CONCURRENCY);
  const result: GameMeta[] = [];
  const missIds: number[] = [];

  if (redis) {
    for (const appId of unique) {
      try {
        const raw = await redis.get(`${CACHE_KEY_PREFIX}${appId}`);
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as GameMeta;
            if (parsed?.appId && parsed?.name) {
              result.push(parsed);
              onCacheHit?.();
              continue;
            }
          } catch {
            // invalid json
          }
        }
      } catch {
        // redis get failed
      }
      onCacheMiss?.();
      missIds.push(appId);
    }
  } else {
    for (const _ of unique) onCacheMiss?.();
    missIds.push(...unique);
  }

  const cacheHits = unique.length - missIds.length;
  let steamBatches = 0;

  if (missIds.length > 0) {
    const { results: fromSteam, steamBatches: n } = await fetchMissingFromSteam(missIds, lang, limit);
    steamBatches = n;
    for (const meta of Object.values(fromSteam)) {
      result.push(meta);
      if (redis) {
        try {
          await redis.set(`${CACHE_KEY_PREFIX}${meta.appId}`, JSON.stringify(meta), { EX: CACHE_TTL_SEC });
        } catch {
          // ignore
        }
      }
    }
  }

  console.log(
    `[store-service] getGamesMeta: requested=${unique.length} cacheHits=${cacheHits} steamBatches=${steamBatches}`
  );
  return result;
}

/**
 * 兼容旧调用：返回 Map<appId, GameMeta>，便于 server 侧 .get(appId)。
 */
export async function getGamesMetaMap(appIds: number[], lang: string = 'en-US'): Promise<Map<number, GameMeta>> {
  const list = await getGamesMeta(appIds, lang);
  return new Map(list.map((g) => [g.appId, g]));
}

/**
 * 仅读 Redis 缓存，不请求 Steam。用于 fallback 阶段，禁止触发 Steam 请求。
 * 返回 Map：仅包含缓存中存在的 appId；未命中缓存的游戏不包含在结果中。
 */
export async function getGamesMetaMapCacheOnly(appIds: number[], _lang: string = 'en-US'): Promise<Map<number, GameMeta>> {
  ensureInit();
  const unique = [...new Set((appIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map<number, GameMeta>();
  const redis = (getRedisHealthyFn && !getRedisHealthyFn()) ? null : (getRedisFn?.() ?? null);
  if (!redis) {
    console.log('[store-service] getGamesMetaMapCacheOnly: requested=' + unique.length + ' cacheHits=0 steamBatches=0 (cache-only, no Redis)');
    return result;
  }
  let cacheHits = 0;
  for (const appId of unique) {
    try {
      const raw = await redis.get(`${CACHE_KEY_PREFIX}${appId}`);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as GameMeta;
          if (parsed?.appId && parsed?.name) {
            result.set(appId, parsed);
            cacheHits += 1;
            onCacheHit?.();
            continue;
          }
        } catch {
          // invalid
        }
      }
    } catch {
      // redis get failed
    }
    onCacheMiss?.();
  }
  console.log('[store-service] getGamesMetaMapCacheOnly: requested=' + unique.length + ' cacheHits=' + cacheHits + ' steamBatches=0 (fallback cache-only)');
  return result;
}

/** 批量同步 store meta 到 Redis（cron 用），强制拉取并写入，不读缓存 */
export async function syncStoreMetaToRedis(
  appIds: number[],
  lang: string = 'en-US'
): Promise<{ synced: number; failed: number; steamBatches: number }> {
  ensureInit();
  const unique = [...new Set((appIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) {
    console.log('[store-service] syncStoreMetaToRedis: 0 appIds');
    return { synced: 0, failed: 0, steamBatches: 0 };
  }
  const redis = getRedisFn?.() ?? null;
  const limit = pLimit(CONCURRENCY);
  const { results, steamBatches } = await fetchMissingFromSteam(unique, lang, limit);
  let synced = 0;
  let failed = unique.length - Object.keys(results).length;
  if (redis) {
    for (const meta of Object.values(results)) {
      try {
        await redis.set(`${CACHE_KEY_PREFIX}${meta.appId}`, JSON.stringify(meta), { EX: CACHE_TTL_SEC });
        synced += 1;
      } catch {
        failed += 1;
      }
    }
  }
  console.log(`[store-service] syncStoreMetaToRedis: requested=${unique.length} synced=${synced} failed=${failed} steamBatches=${steamBatches}`);
  return { synced, failed, steamBatches };
}

let getTopAppIdsForSyncImpl: ((topN: number) => Promise<number[]>) | null = null;

export function setGetTopAppIdsForSyncImpl(fn: ((topN: number) => Promise<number[]>) | null): void {
  getTopAppIdsForSyncImpl = typeof fn === 'function' ? fn : null;
}

export async function getTopAppIdsForSync(topN: number = 1000): Promise<number[]> {
  ensureInit();
  if (getTopAppIdsForSyncImpl) return getTopAppIdsForSyncImpl(topN);
  return [];
}
