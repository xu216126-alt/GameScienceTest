"use strict";
/**
 * SteamSpy 数据同步：供 GET /api/cron/sync-steamspy 与 scripts/syncSteamSpy.ts 调用。
 * 支持 maxPages、断点续传（24h 内已同步页跳过）、进度日志。不修改推荐逻辑。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSyncSteamSpy = runSyncSteamSpy;
const STEAM_META_KEY_PREFIX = 'steam_meta:';
const PAGE_SYNC_KEY_PREFIX = 'steam_spy_sync:page:';
function toSteamMeta(raw) {
    const appid = Number(raw?.appid);
    if (!Number.isInteger(appid) || appid <= 0)
        return null;
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
async function runSyncSteamSpy(config) {
    const started = Date.now();
    const baseUrl = (config.steamSpyBaseUrl || 'https://steamspy.com').replace(/\/$/, '');
    const ttlSec = config.steamSpyCacheTtlSec ?? 7 * 24 * 3600;
    const maxPages = Math.max(1, Math.min(100, config.maxPages ?? 20));
    const skipHours = config.skipPageWithinHours ?? 24;
    const fetchJson = config.fetchJson;
    const redis = config.redis;
    const redisGet = redis.get && typeof redis.get === 'function' ? redis.get.bind(redis) : null;
    let totalSync = 0;
    let success = 0;
    let fail = 0;
    for (let page = 0; page < maxPages; page++) {
        const pageKey = `${PAGE_SYNC_KEY_PREFIX}${page}`;
        if (skipHours > 0 && redisGet) {
            try {
                const existing = await redisGet(pageKey);
                if (existing != null && String(existing).trim() !== '') {
                    console.log(`[syncSteamSpy] page ${page + 1} / ${maxPages} 已跳过（${skipHours}h 内已同步），当前累计 ${totalSync} 条`);
                    continue;
                }
            }
            catch (_) {
                /* 检查失败则照常拉取 */
            }
        }
        const url = `${baseUrl}/api.php?request=all&page=${page}`;
        let data;
        try {
            data = (await fetchJson(url));
        }
        catch (err) {
            console.warn(`[syncSteamSpy] page ${page + 1} / ${maxPages} 请求失败:`, err?.message);
            continue;
        }
        const items = data && typeof data === 'object' ? Object.values(data) : [];
        const pageSuccess = [];
        const pageFail = [];
        for (const raw of items) {
            const meta = toSteamMeta(raw);
            if (!meta) {
                pageFail.push(1);
                continue;
            }
            try {
                await redis.set(`${STEAM_META_KEY_PREFIX}${meta.appid}`, JSON.stringify(meta), { EX: ttlSec });
                pageSuccess.push(1);
            }
            catch {
                pageFail.push(1);
            }
        }
        const pageOk = pageSuccess.length;
        const pageKo = pageFail.length;
        success += pageOk;
        fail += pageKo;
        totalSync += pageOk + pageKo;
        console.log(`[syncSteamSpy] page ${page + 1} / ${maxPages}，当前累计 ${totalSync} 条`);
        if (skipHours > 0) {
            try {
                await redis.set(pageKey, String(Date.now()), { EX: skipHours * 3600 });
            }
            catch (_) { }
        }
    }
    const elapsedSec = (Date.now() - started) / 1000;
    console.log(`[syncSteamSpy] Done. 本次同步数量=${totalSync} 成功=${success} 失败=${fail} 耗时=${elapsedSec.toFixed(2)}s`);
    return { totalSync, success, fail, elapsedSec };
}
