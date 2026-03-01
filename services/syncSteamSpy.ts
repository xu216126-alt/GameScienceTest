/**
 * SteamSpy 数据同步：供 GET /api/cron/sync-steamspy 与 scripts/syncSteamSpy.ts 调用。
 * 支持 maxPages、断点续传（24h 内已同步页跳过）、进度日志。不修改推荐逻辑。
 */

const STEAM_META_KEY_PREFIX = 'steam_meta:';
const PAGE_SYNC_KEY_PREFIX = 'steam_spy_sync:page:';

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

export interface SyncSteamSpyConfig {
  redis: {
    get?: (key: string) => Promise<string | null>;
    set: (key: string, value: string, opts?: { EX?: number }) => Promise<unknown>;
  };
  fetchJson: (url: string) => Promise<unknown>;
  steamSpyBaseUrl?: string;
  steamSpyCacheTtlSec?: number;
  /** 最大同步页数（page 0 到 maxPages-1），默认 20 */
  maxPages?: number;
  /** 若某页在此小时数内已同步则跳过（断点续传），0 表示不跳过，默认 24 */
  skipPageWithinHours?: number;
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

export async function runSyncSteamSpy(config: SyncSteamSpyConfig): Promise<{ totalSync: number; success: number; fail: number; elapsedSec: number }> {
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
      } catch (_) {
        /* 检查失败则照常拉取 */
      }
    }

    const url = `${baseUrl}/api.php?request=all&page=${page}`;
    let data: Record<string, SteamSpyRawItem>;
    try {
      data = (await fetchJson(url)) as Record<string, SteamSpyRawItem>;
    } catch (err) {
      console.warn(`[syncSteamSpy] page ${page + 1} / ${maxPages} 请求失败:`, (err as Error)?.message);
      continue;
    }
    const items = data && typeof data === 'object' ? (Object.values(data) as SteamSpyRawItem[]) : [];
    const pageSuccess: number[] = [];
    const pageFail: number[] = [];
    for (const raw of items) {
      const meta = toSteamMeta(raw);
      if (!meta) {
        pageFail.push(1);
        continue;
      }
      try {
        await redis.set(`${STEAM_META_KEY_PREFIX}${meta.appid}`, JSON.stringify(meta), { EX: ttlSec });
        pageSuccess.push(1);
      } catch {
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
      } catch (_) {}
    }
  }

  const elapsedSec = (Date.now() - started) / 1000;
  console.log(`[syncSteamSpy] Done. 本次同步数量=${totalSync} 成功=${success} 失败=${fail} 耗时=${elapsedSec.toFixed(2)}s`);
  return { totalSync, success, fail, elapsedSec };
}
