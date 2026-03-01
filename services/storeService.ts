/**
 * Steam Store 数据层：所有 Steam Store 请求由此统一管理
 * - 批量请求 appdetails（每批最多 30，自动分批）
 * - Redis 缓存 steam_store_meta:{appid}，TTL 24h
 * - p-limit 最大并发 3（使用 p-limit@3 以兼容 CommonJS/require）
 * - 支持 STEAM_STORE_BASE_URL 代理
 */
const pLimit = require('p-limit');

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
/** When provided, used for Store API calls; on 429 we return empty batch and do not throw. */
type FetchWithStatus = (url: string) => Promise<{ status: number; data: unknown }>;
type GetRedis = () => { get: (k: string) => Promise<string | null>; set: (k: string, v: string, opts?: { EX?: number }) => Promise<unknown> } | null;

let fetchJsonFn: FetchJson | null = null;
let fetchWithStatusFn: FetchWithStatus | null = null;
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
  /** Optional: return { status, data }; on 429 we do not throw and return empty batch so caller can use Redis + static image. */
  fetchWithStatus?: FetchWithStatus;
}): void {
  fetchJsonFn = config.fetchJson;
  fetchWithStatusFn = config.fetchWithStatus ?? null;
  getRedisFn = config.getRedisClient;
  getRedisHealthyFn = config.getRedisHealthy ?? null;
  steamStoreBaseUrl = (config.steamStoreBaseUrl || process.env.STEAM_STORE_BASE_URL || 'https://store.steampowered.com').replace(/\/$/, '');
  if (config.storeLocaleForLang) storeLocaleForLangFn = config.storeLocaleForLang;
  onSteamStoreCall = config.onSteamStoreCall ?? null;
  onCacheHit = config.onCacheHit ?? null;
  onCacheMiss = config.onCacheMiss ?? null;
}

function ensureInit(): void {
  if ((!fetchJsonFn && !fetchWithStatusFn) || !storeLocaleForLangFn) {
    throw new Error('storeService not initialized: call storeService.init(config) first');
  }
}

/** Static image URL for every game; do not wait for Steam Store API. */
export const STEAM_HEADER_CDN = (appId: number) =>
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

const DEFAULT_DESCRIPTION = 'Detailed description is temporarily unavailable for this game.';

/**
 * 翻译官：无论数据来自 Redis 还是 Steam API，都转换成统一格式。
 * 保证输出始终包含 name, header_image, description, price；header_image 一律用 CDN 构造。
 * 列表与模态框共用此格式，避免“列表空但弹窗有数据”的结构不一致。
 */
export function formatGameResponse(data: unknown, appId: number): GameMeta {
  const id = Number(appId);
  const headerImage = STEAM_HEADER_CDN(id);
  const d = data as Record<string, unknown> | null | undefined;
  if (!d || typeof d !== 'object') {
    return {
      appId: id,
      appType: 'game',
      name: 'Unknown Game',
      posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
      headerImage,
      shortDescription: DEFAULT_DESCRIPTION,
      trailerUrl: '',
      trailerPoster: '',
      genres: [],
      releaseDate: 'Unknown',
      isFree: false,
      price: 'N/A',
      positiveRate: 'N/A',
      currentPlayers: 'N/A',
      steamUrl: `https://store.steampowered.com/app/${id}`,
    };
  }
  const gm = d as unknown as Partial<GameMeta>;
  const isGameMeta = typeof gm.appId === 'number' && typeof gm.name === 'string';
  const name =
    (isGameMeta && gm.name)
      ? gm.name
      : typeof d.name === 'string' && !/^App\s+\d+$/i.test(d.name)
        ? String(d.name).trim()
        : 'Unknown Game';
  const description =
    (isGameMeta && gm.shortDescription)
      ? gm.shortDescription
      : typeof (d as { short_description?: string }).short_description === 'string'
        ? (d as { short_description: string }).short_description
        : DEFAULT_DESCRIPTION;
  let price: string;
  if (isGameMeta && gm.price != null) {
    price = String(gm.price);
  } else if (typeof d.price === 'string' && d.price !== '') {
    price = d.price;
  } else if (typeof (d as { initialprice?: string }).initialprice === 'string') {
    price = (d as { initialprice: string }).initialprice;
  } else if ((d as { is_free?: boolean }).is_free) {
    price = 'Free';
  } else {
    const po = (d as { price_overview?: { final_formatted?: string } }).price_overview;
    price = po?.final_formatted ?? 'N/A';
  }
  return {
    appId: id,
    appType: gm.appType ?? String((d as { type?: string }).type ?? 'game'),
    name,
    posterImage: gm.posterImage ?? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    headerImage,
    shortDescription: description,
    trailerUrl: gm.trailerUrl ?? '',
    trailerPoster: gm.trailerPoster ?? '',
    genres: Array.isArray(gm.genres) ? gm.genres : (Array.isArray((d as { genres?: { description?: string }[] }).genres) ? (d as { genres: { description?: string }[] }).genres.map((g) => String(g?.description ?? '')).filter(Boolean) : []),
    releaseDate: gm.releaseDate ?? (d as { release_date?: { date?: string } }).release_date?.date ?? 'Unknown',
    isFree: Boolean(gm.isFree ?? (d as { is_free?: boolean }).is_free ?? (price === 'Free' || price === '0')),
    price,
    positiveRate: gm.positiveRate ?? 'N/A',
    currentPlayers: gm.currentPlayers ?? 'N/A',
    steamUrl: gm.steamUrl ?? `https://store.steampowered.com/app/${id}`,
  };
}

/** SteamSpy/redis steam_meta shape (partial). */
export interface SteamSpyMeta {
  name?: string;
  price?: string;
  initialprice?: string;
  tags?: Record<string, string>;
  positive?: number;
  negative?: number;
  ccu?: number;
}

/**
 * Normalize game data from Redis (SteamSpy) + optional Steam API.
 * Name: steamApiData.name (e.g. Chinese) > redisData.name (English) > 'Unknown Game'.
 * Image: always CDN URL (static injection).
 * Price: SteamSpy price/initialprice when present.
 * Tags: Steam API genres when present, else Object.keys(redisData.tags || {}).
 */
export function normalizeGameData(
  appId: number,
  redisData: SteamSpyMeta | null,
  steamApiData: GameMeta | Record<string, unknown> | null
): GameMeta {
  const id = Number(appId);
  const steamMeta = steamApiData && typeof (steamApiData as GameMeta).appId === 'number'
    ? (steamApiData as GameMeta)
    : null;
  const steamRaw = steamMeta
    ? null
    : (steamApiData as Record<string, unknown> | null);

  const name =
    (steamMeta?.name && !/^App\s+\d+$/i.test(steamMeta.name))
      ? steamMeta.name
      : (redisData?.name && !/^App\s+\d+$/i.test(String(redisData.name)))
        ? String(redisData.name).trim()
        : 'Unknown Game';

  const priceFromRedis =
    redisData?.price !== undefined && redisData?.price !== ''
      ? String(redisData.price)
      : redisData?.initialprice !== undefined && redisData?.initialprice !== ''
        ? String(redisData.initialprice)
        : null;
  const isFree = Boolean(
    steamMeta?.isFree ??
    (steamRaw ? (steamRaw as { is_free?: boolean }).is_free : undefined) ??
    (priceFromRedis === '0' || priceFromRedis === '0.00' ? true : undefined)
  );
  const price =
    isFree ? 'Free' : (priceFromRedis ?? steamMeta?.price ?? (steamRaw as { price_overview?: { final_formatted?: string } })?.price_overview?.final_formatted ?? 'N/A');

  const genresFromSteam =
    steamMeta?.genres?.length
      ? steamMeta.genres
      : Array.isArray((steamRaw as { genres?: { description?: string }[] })?.genres)
        ? ((steamRaw as { genres: { description?: string }[] }).genres.map((g) => String(g?.description ?? '')).filter(Boolean))
        : [];
  const tagsFromRedis = redisData?.tags && typeof redisData.tags === 'object' ? Object.keys(redisData.tags) : [];
  const genres = genresFromSteam.length > 0 ? genresFromSteam : tagsFromRedis;

  const pos = Number(redisData?.positive ?? 0);
  const neg = Number(redisData?.negative ?? 0);
  const total = pos + neg;
  const positiveRate = total > 0 ? `${Math.round((pos / total) * 100)}%` : (steamMeta?.positiveRate ?? 'N/A');
  const ccu = Number(redisData?.ccu ?? 0);
  const currentPlayers = ccu > 0 ? `${ccu.toLocaleString()} online` : (steamMeta?.currentPlayers ?? 'N/A');

  return {
    appId: id,
    appType: steamMeta?.appType ?? (steamRaw ? String((steamRaw as { type?: string }).type || '') : 'game'),
    name,
    posterImage: steamMeta?.posterImage ?? `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    headerImage: STEAM_HEADER_CDN(id),
    shortDescription: (steamMeta?.shortDescription ?? ((steamRaw ? String((steamRaw as { short_description?: string }).short_description ?? '') : '') || 'Detailed description is temporarily unavailable for this game.')),
    trailerUrl: steamMeta?.trailerUrl ?? '',
    trailerPoster: steamMeta?.trailerPoster ?? '',
    genres,
    releaseDate: steamMeta?.releaseDate ?? (steamRaw ? (steamRaw as { release_date?: { date?: string } }).release_date?.date ?? 'Unknown' : 'Unknown'),
    isFree: Boolean(isFree),
    price,
    positiveRate,
    currentPlayers,
    steamUrl: `https://store.steampowered.com/app/${id}`,
  };
}

function buildGameMeta(appId: number, data: Record<string, unknown>): GameMeta {
  const id = Number(appId);
  return {
    appId: id,
    appType: String(data.type || ''),
    name: (data.name as string) || `App ${id}`,
    posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    headerImage: STEAM_HEADER_CDN(id),
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
  if (!appIds.length) return {};
  const hasFetch = fetchWithStatusFn ?? fetchJsonFn;
  if (!hasFetch) return {};
  onSteamStoreCall?.();
  const locale = storeLocaleForLangFn(normalizeLang(lang));
  const idsParam = appIds.slice(0, BATCH_SIZE).join(',');
  const url = `${steamStoreBaseUrl}/api/appdetails?appids=${idsParam}&cc=${locale.cc}&l=${locale.l}`;

  let data: Record<string, { success?: boolean; data?: Record<string, unknown> }> | null = null;
  if (fetchWithStatusFn) {
    const { status, data: body } = await fetchWithStatusFn(url).catch(() => ({ status: 0, data: null }));
    if (status === 429 || status === 503) {
      return {};
    }
    data = body as Record<string, { success?: boolean; data?: Record<string, unknown> }> | null;
  } else {
    data = await (fetchJsonFn!(url).catch(() => null)) as Record<string, { success?: boolean; data?: Record<string, unknown> }> | null;
  }
  if (!data || typeof data !== 'object') return {};
  const out: Record<number, GameMeta> = {};
    for (const id of appIds) {
    const node = data[String(id)];
    if (node?.success && node.data) {
      const meta = buildGameMeta(id, node.data);
      const isGame = meta.appType.toLowerCase() === 'game';
      const validName = meta.name && !/^App\s+\d+$/i.test(meta.name);
      const validMedia = Boolean(meta.headerImage);
      if (isGame && validName && validMedia) out[id] = formatGameResponse(meta, id);
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
  const batchResultsList = await Promise.all(
    chunks.map((chunk) => limit(() => fetchAppDetailsBatch(chunk, lang)))
  );
  let steamBatches = batchResultsList.length;
  const allStillMiss: number[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const batchResults = batchResultsList[i];
    const chunk = chunks[i];
    Object.assign(results, batchResults);
    const got = new Set(Object.keys(batchResults).map(Number));
    allStillMiss.push(...chunk.filter((id) => !got.has(id)));
  }
  if (allStillMiss.length > 0) {
    const retryList = await Promise.all(
      allStillMiss.map((id) =>
        limit(async () => {
          const one = await fetchAppDetailsBatch([id], lang);
          if (one[id]) results[id] = one[id];
          return one;
        })
      )
    );
    steamBatches += retryList.length;
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
    const keys = unique.map((id) => `${CACHE_KEY_PREFIX}${id}`);
    const redisAny = redis as { get: (k: string) => Promise<string | null>; mget?: (...k: string[]) => Promise<(string | null)[]> };
    const rawList: (string | null)[] =
      typeof redisAny.mget === 'function'
        ? await redisAny.mget(...keys)
        : await Promise.all(keys.map((k) => redis.get(k)));
    for (let i = 0; i < unique.length; i++) {
      const raw = rawList[i];
      const appId = unique[i];
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as GameMeta;
          if (parsed?.appId && parsed?.name) {
            result.push(formatGameResponse(parsed, appId));
            onCacheHit?.();
            continue;
          }
        } catch {
          // invalid json
        }
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
      const formatted = formatGameResponse(meta, meta.appId);
      result.push(formatted);
      if (redis) {
        try {
          await redis.set(`${CACHE_KEY_PREFIX}${formatted.appId}`, JSON.stringify(formatted), { EX: CACHE_TTL_SEC });
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
  const keys = unique.map((id) => `${CACHE_KEY_PREFIX}${id}`);
  const redisAny = redis as { get: (k: string) => Promise<string | null>; mget?: (...k: string[]) => Promise<(string | null)[]> };
  const rawList: (string | null)[] =
    typeof redisAny.mget === 'function'
      ? await redisAny.mget(...keys)
      : await Promise.all(keys.map((k) => redis.get(k)));
  for (let i = 0; i < unique.length; i++) {
    const appId = unique[i];
    const raw = rawList[i];
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as GameMeta;
        if (parsed?.appId && parsed?.name) {
          result.set(appId, formatGameResponse(parsed, appId));
          cacheHits += 1;
          onCacheHit?.();
          continue;
        }
      } catch {
        // invalid json
      }
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
