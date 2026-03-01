"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.init = init;
exports.getGamesMeta = getGamesMeta;
exports.getGamesMetaMap = getGamesMetaMap;
exports.getGamesMetaMapCacheOnly = getGamesMetaMapCacheOnly;
exports.syncStoreMetaToRedis = syncStoreMetaToRedis;
exports.setGetTopAppIdsForSyncImpl = setGetTopAppIdsForSyncImpl;
exports.getTopAppIdsForSync = getTopAppIdsForSync;
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
let fetchJsonFn = null;
let getRedisFn = null;
let getRedisHealthyFn = null;
let steamStoreBaseUrl = 'https://store.steampowered.com';
let storeLocaleForLangFn = () => ({ cc: 'cn', l: 'schinese' });
let onSteamStoreCall = null;
let onCacheHit = null;
let onCacheMiss = null;
function normalizeLang(lang) {
    return lang === 'zh-CN' ? 'zh-CN' : 'en-US';
}
function init(config) {
    fetchJsonFn = config.fetchJson;
    getRedisFn = config.getRedisClient;
    getRedisHealthyFn = config.getRedisHealthy ?? null;
    steamStoreBaseUrl = (config.steamStoreBaseUrl || process.env.STEAM_STORE_BASE_URL || 'https://store.steampowered.com').replace(/\/$/, '');
    if (config.storeLocaleForLang)
        storeLocaleForLangFn = config.storeLocaleForLang;
    onSteamStoreCall = config.onSteamStoreCall ?? null;
    onCacheHit = config.onCacheHit ?? null;
    onCacheMiss = config.onCacheMiss ?? null;
}
function ensureInit() {
    if (!fetchJsonFn || !storeLocaleForLangFn) {
        throw new Error('storeService not initialized: call storeService.init(config) first');
    }
}
const STEAM_HEADER_CDN = (appId) => `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
function buildGameMeta(appId, data) {
    const id = Number(appId);
    return {
        appId: id,
        appType: String(data.type || ''),
        name: data.name || `App ${id}`,
        posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
        headerImage: data.header_image || STEAM_HEADER_CDN(id),
        shortDescription: data.short_description || 'Detailed description is temporarily unavailable for this game.',
        trailerUrl: (() => {
            const m = data.movies?.[0];
            return m?.mp4?.max ?? m?.mp4?.['480'] ?? '';
        })(),
        trailerPoster: String(data.movies?.[0]?.thumbnail ?? ''),
        genres: Array.isArray(data.genres) ? data.genres.map((g) => String(g?.description ?? '')).filter(Boolean) : [],
        releaseDate: data.release_date?.date ?? 'Unknown',
        isFree: Boolean(data.is_free),
        price: data.is_free ? 'Free' : (data.price_overview?.final_formatted ?? 'N/A'),
        positiveRate: 'N/A',
        currentPlayers: 'N/A',
        steamUrl: `https://store.steampowered.com/app/${id}`,
    };
}
async function fetchAppDetailsBatch(appIds, lang) {
    if (!appIds.length || !fetchJsonFn)
        return {};
    onSteamStoreCall?.();
    const locale = storeLocaleForLangFn(normalizeLang(lang));
    const idsParam = appIds.slice(0, BATCH_SIZE).join(',');
    const url = `${steamStoreBaseUrl}/api/appdetails?appids=${idsParam}&cc=${locale.cc}&l=${locale.l}`;
    const data = await fetchJsonFn(url).catch(() => null);
    if (!data || typeof data !== 'object')
        return {};
    const out = {};
    for (const id of appIds) {
        const node = data[String(id)];
        if (node?.success && node.data) {
            const meta = buildGameMeta(id, node.data);
            const isGame = meta.appType.toLowerCase() === 'game';
            const validName = meta.name && !/^App\s+\d+$/i.test(meta.name);
            const validMedia = Boolean(meta.headerImage);
            if (isGame && validName && validMedia)
                out[id] = meta;
        }
    }
    return out;
}
async function fetchMissingFromSteam(missIds, lang, limit) {
    const results = {};
    const chunks = [];
    for (let i = 0; i < missIds.length; i += BATCH_SIZE) {
        chunks.push(missIds.slice(i, i + BATCH_SIZE));
    }
    const batchResultsList = await Promise.all(chunks.map((chunk) => limit(() => fetchAppDetailsBatch(chunk, lang))));
    let steamBatches = batchResultsList.length;
    const allStillMiss = [];
    for (let i = 0; i < chunks.length; i++) {
        const batchResults = batchResultsList[i];
        const chunk = chunks[i];
        Object.assign(results, batchResults);
        const got = new Set(Object.keys(batchResults).map(Number));
        allStillMiss.push(...chunk.filter((id) => !got.has(id)));
    }
    if (allStillMiss.length > 0) {
        const retryList = await Promise.all(allStillMiss.map((id) => limit(async () => {
            const one = await fetchAppDetailsBatch([id], lang);
            if (one[id])
                results[id] = one[id];
            return one;
        })));
        steamBatches += retryList.length;
    }
    return { results, steamBatches };
}
/**
 * 批量获取游戏元数据：先查 Redis 缓存，缺失再请求 Steam，成功后写回缓存。
 * 批量请求（每批最多 30）、p-limit 并发 3、支持 STEAM_STORE_BASE_URL。
 */
async function getGamesMeta(appIds, lang = 'en-US') {
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
    const result = [];
    const missIds = [];
    if (redis) {
        const keys = unique.map((id) => `${CACHE_KEY_PREFIX}${id}`);
        const redisAny = redis;
        const rawList = typeof redisAny.mget === 'function'
            ? await redisAny.mget(...keys)
            : await Promise.all(keys.map((k) => redis.get(k)));
        for (let i = 0; i < unique.length; i++) {
            const raw = rawList[i];
            if (raw) {
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed?.appId && parsed?.name) {
                        result.push(parsed);
                        onCacheHit?.();
                        continue;
                    }
                }
                catch {
                    // invalid json
                }
            }
            onCacheMiss?.();
            missIds.push(unique[i]);
        }
    }
    else {
        for (const _ of unique)
            onCacheMiss?.();
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
                }
                catch {
                    // ignore
                }
            }
        }
    }
    console.log(`[store-service] getGamesMeta: requested=${unique.length} cacheHits=${cacheHits} steamBatches=${steamBatches}`);
    return result;
}
/**
 * 兼容旧调用：返回 Map<appId, GameMeta>，便于 server 侧 .get(appId)。
 */
async function getGamesMetaMap(appIds, lang = 'en-US') {
    const list = await getGamesMeta(appIds, lang);
    return new Map(list.map((g) => [g.appId, g]));
}
/**
 * 仅读 Redis 缓存，不请求 Steam。用于 fallback 阶段，禁止触发 Steam 请求。
 * 返回 Map：仅包含缓存中存在的 appId；未命中缓存的游戏不包含在结果中。
 */
async function getGamesMetaMapCacheOnly(appIds, _lang = 'en-US') {
    ensureInit();
    const unique = [...new Set((appIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
    const result = new Map();
    const redis = (getRedisHealthyFn && !getRedisHealthyFn()) ? null : (getRedisFn?.() ?? null);
    if (!redis) {
        console.log('[store-service] getGamesMetaMapCacheOnly: requested=' + unique.length + ' cacheHits=0 steamBatches=0 (cache-only, no Redis)');
        return result;
    }
    let cacheHits = 0;
    const keys = unique.map((id) => `${CACHE_KEY_PREFIX}${id}`);
    const redisAny = redis;
    const rawList = typeof redisAny.mget === 'function'
        ? await redisAny.mget(...keys)
        : await Promise.all(keys.map((k) => redis.get(k)));
    for (let i = 0; i < unique.length; i++) {
        const appId = unique[i];
        const raw = rawList[i];
        if (raw) {
            try {
                const parsed = JSON.parse(raw);
                if (parsed?.appId && parsed?.name) {
                    result.set(appId, parsed);
                    cacheHits += 1;
                    onCacheHit?.();
                    continue;
                }
            }
            catch {
                // invalid json
            }
        }
        onCacheMiss?.();
    }
    console.log('[store-service] getGamesMetaMapCacheOnly: requested=' + unique.length + ' cacheHits=' + cacheHits + ' steamBatches=0 (fallback cache-only)');
    return result;
}
/** 批量同步 store meta 到 Redis（cron 用），强制拉取并写入，不读缓存 */
async function syncStoreMetaToRedis(appIds, lang = 'en-US') {
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
            }
            catch {
                failed += 1;
            }
        }
    }
    console.log(`[store-service] syncStoreMetaToRedis: requested=${unique.length} synced=${synced} failed=${failed} steamBatches=${steamBatches}`);
    return { synced, failed, steamBatches };
}
let getTopAppIdsForSyncImpl = null;
function setGetTopAppIdsForSyncImpl(fn) {
    getTopAppIdsForSyncImpl = typeof fn === 'function' ? fn : null;
}
async function getTopAppIdsForSync(topN = 1000) {
    ensureInit();
    if (getTopAppIdsForSyncImpl)
        return getTopAppIdsForSyncImpl(topN);
    return [];
}
