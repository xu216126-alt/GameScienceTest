const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT || 3000);
const STEAM_API_KEY = process.env.STEAM_API_KEY || '';
const STEAM_API_BASE_URL = (process.env.STEAM_API_BASE_URL || 'https://api.steampowered.com').replace(/\/$/, '');
const STEAM_STORE_BASE_URL = (process.env.STEAM_STORE_BASE_URL || 'https://store.steampowered.com').replace(/\/$/, '');
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || process.env.THIRD_PARTY_OPENAI_API_KEY || '';
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
const OPENAI_DIRECT_BASE_URL = process.env.OPENAI_DIRECT_BASE_URL ? process.env.OPENAI_DIRECT_BASE_URL.replace(/\/$/, '') : '';
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_SITE_URL = process.env.OPENAI_SITE_URL || process.env.SITE_URL || '';
const OPENAI_SITE_NAME = process.env.OPENAI_SITE_NAME || 'SteamSense AI';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, '');
const DEEPSEEK_DIRECT_BASE_URL = process.env.DEEPSEEK_DIRECT_BASE_URL ? process.env.DEEPSEEK_DIRECT_BASE_URL.replace(/\/$/, '') : '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const AI_PRIMARY_TIMEOUT_MS = Number(process.env.AI_PRIMARY_TIMEOUT_MS || 60000);
const AI_FALLBACK_TIMEOUT_MS = Number(process.env.AI_FALLBACK_TIMEOUT_MS || 90000);
const STEAM_OPENID_STRICT = String(process.env.STEAM_OPENID_STRICT || 'false').toLowerCase() === 'true';
const DEFAULT_AVATAR = 'https://avatars.steamstatic.com/015a945c254efbf116a5d296e31a906080aead7d_full.jpg';
const UPSTREAM_TIMEOUT_MS = Number(process.env.UPSTREAM_TIMEOUT_MS || 12000);
const UPSTREAM_RETRIES = Number(process.env.UPSTREAM_RETRIES || 2);
const PROFILE_CACHE_TTL_MS = Number(process.env.PROFILE_CACHE_TTL_MS || 30 * 60 * 1000);
const ANALYSIS_PROFILE_CACHE_TTL_MS = Number(process.env.ANALYSIS_PROFILE_CACHE_TTL_MS || 20 * 60 * 1000);
const GAME_DETAILS_CACHE_TTL_MS = Number(process.env.GAME_DETAILS_CACHE_TTL_MS || 15 * 60 * 1000);
const TOP_GAME_CATEGORY_CACHE_TTL_MS = Number(process.env.TOP_GAME_CATEGORY_CACHE_TTL_MS || 6 * 60 * 60 * 1000);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const FALLBACK_SCENARIOS = {
  trendingOnline: {
    title: 'Trending Online Games',
    description: 'Currently popular multiplayer games with active matchmaking.',
    games: [
      { appId: 553850, reason: 'Strong co-op momentum and social play.', compatibility: 'playable', handheldCompatibility: 'unknown' },
      { appId: 2073850, reason: 'High-energy FPS matches with active players.', compatibility: 'playable', handheldCompatibility: 'playable' },
    ],
  },
  tasteMatch: {
    title: 'Games That Fit Your Taste',
    description: 'Close match to your existing preferences and play habits.',
    games: [
      { appId: 548430, reason: 'Co-op and progression style match your profile.', compatibility: 'playable', handheldCompatibility: 'verified' },
      { appId: 588650, reason: 'Action pacing aligns with your play style.', compatibility: 'playable', handheldCompatibility: 'verified' },
    ],
  },
  exploreNewAreas: {
    title: 'Explore New Areas',
    description: 'High-quality picks outside your most played comfort zone.',
    games: [
      { appId: 632470, reason: 'Narrative depth from a different genre lane.', compatibility: 'playable', handheldCompatibility: 'playable' },
      { appId: 255710, reason: 'City-building strategy expands your library mix.', compatibility: 'playable', handheldCompatibility: 'unsupported' },
    ],
  },
  backlogReviver: {
    title: 'Backlog Reviver',
    description: 'Rediscover games from your own library that deserve another chance.',
    games: [],
  },
};

const FALLBACK_SCENARIOS_ZH = {
  trendingOnline: {
    title: '热门联机',
    description: '当前人气高、匹配活跃的联机作品。',
    games: [
      { appId: 553850, reason: '热度高、协作强，适合一起开黑。', compatibility: 'playable', handheldCompatibility: 'unknown' },
      { appId: 2073850, reason: '对局节奏快，玩家活跃度高。', compatibility: 'playable', handheldCompatibility: 'playable' },
    ],
  },
  tasteMatch: {
    title: '口味匹配',
    description: '与现有偏好高度贴合的选择。',
    games: [
      { appId: 548430, reason: '合作与成长曲线符合你的偏好。', compatibility: 'playable', handheldCompatibility: 'verified' },
      { appId: 588650, reason: '战斗节奏和反馈感与你的习惯一致。', compatibility: 'playable', handheldCompatibility: 'verified' },
    ],
  },
  exploreNewAreas: {
    title: '探索新领域',
    description: '跳出舒适圈的高质量新类型。',
    games: [
      { appId: 632470, reason: '叙事驱动的体验能拓展你的口味。', compatibility: 'playable', handheldCompatibility: 'playable' },
      { appId: 255710, reason: '策略经营带来新的思维挑战。', compatibility: 'playable', handheldCompatibility: 'unsupported' },
    ],
  },
  backlogReviver: {
    title: '回坑唤醒',
    description: '翻翻自己的库存里被冷落的宝藏。',
    games: [],
  },
};

function getFallbackScenariosForLang(lang = 'en-US') {
  return lang === 'zh-CN' ? FALLBACK_SCENARIOS_ZH : FALLBACK_SCENARIOS;
}

const SNAPSHOT_TTL_SEC = Number(process.env.PROFILE_SNAPSHOT_TTL_SEC || 30 * 24 * 60 * 60);
const DIFF_TTL_SEC = Number(process.env.PROFILE_DIFF_TTL_SEC || 15 * 60);
const REDIS_URL = process.env.REDIS_URL || '';
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL || '';
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || '';
const SESSION_BLACKLIST_TTL_SEC = Number(process.env.SESSION_BLACKLIST_TTL_SEC || 10 * 60);
const SESSION_BLACKLIST_MAX_SIZE = Number(process.env.SESSION_BLACKLIST_MAX_SIZE || 50);
const FALLBACK_POOL_KEY = 'steam_sense:fallback_pool';
const FALLBACK_POOL_KEY_V2 = 'steam_sense:fallback_pool_v2';
const POOL_CATEGORY_CASUAL = 'steam_sense:pool:casual';
const POOL_CATEGORY_HARDCORE = 'steam_sense:pool:hardcore';
let redisClient = null;
let redisHealthy = false;
let redisReadyResolve = null;
const redisReadyPromise = new Promise((resolve) => {
  redisReadyResolve = resolve;
});
const FALLBACK_SNAPSHOT_CACHE = new Map();
const FALLBACK_DIFF_CACHE = new Map();
const FALLBACK_SESSION_BLACKLIST = new Map();

let lastRedisErrorLog = 0;
const REDIS_ERROR_LOG_INTERVAL_MS = 10000;

let cron = null;
try {
  cron = require('node-cron');
} catch (_) {}

function createUpstashRedisAdapter(upstash) {
  return {
    get: (key) => upstash.get(key),
    mget: (...keys) => (keys.length ? upstash.mget(...keys) : Promise.resolve([])),
    set: (key, value, opts) => {
      const options = {};
      if (opts && opts.EX != null) options.ex = opts.EX;
      if (opts && opts.NX) options.nx = true;
      return upstash.set(key, value, Object.keys(options).length ? options : undefined);
    },
    pipeline: () => {
      const p = upstash.pipeline();
      return {
        set: (key, value, opts) => {
          const options = opts && opts.EX != null ? { ex: opts.EX } : undefined;
          p.set(key, value, options);
        },
        exec: () => p.exec(),
      };
    },
    del: (key) => upstash.del(key),
    sAdd: (key, ...args) => {
      const members = Array.isArray(args[0]) ? args[0] : args;
      return members.length ? upstash.sadd(key, ...members) : Promise.resolve(0);
    },
    sMembers: (key) => upstash.smembers(key),
    sRandMember: (key, count) => upstash.srandmember(key, count),
    zAdd: (key, scored) => {
      if (!scored || scored.length === 0) return Promise.resolve(0);
      const entries = scored.map((e) => ({ score: e.score, member: e.value }));
      return upstash.zadd(key, ...entries);
    },
    zRange: (key, start, stop, opts) => upstash.zrange(key, start, stop, opts && opts.REV ? { rev: true } : {}),
    zCard: (key) => upstash.zcard(key),
    expire: (key, seconds) => upstash.expire(key, seconds),
  };
}

// 在 Vercel 上仅使用 Upstash（HTTP），不使用 TCP Redis，避免 "Socket closed unexpectedly"
const isVercel = Boolean(process.env.VERCEL);
if (UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN) {
  try {
    const { Redis } = require('@upstash/redis');
    const upstash = new Redis({ url: UPSTASH_REDIS_REST_URL, token: UPSTASH_REDIS_REST_TOKEN });
    redisClient = createUpstashRedisAdapter(upstash);
    redisHealthy = true;
    if (typeof redisReadyResolve === 'function') redisReadyResolve();
    seedFallbackPool().catch((err) => console.warn('seedFallbackPool failed:', err?.message ?? err?.toString?.() ?? err));
    if (cron) {
      cron.schedule('0 0 */3 * *', () => {
        refreshFallbackPoolFromSteam().catch((err) =>
          console.warn('refreshFallbackPoolFromSteam scheduled run failed:', err?.message ?? err?.toString?.() ?? err)
        );
      });
      setTimeout(() => {
        refreshFallbackPoolFromSteam().catch((err) =>
          console.warn('refreshFallbackPoolFromSteam startup run failed:', err?.message ?? err?.toString?.() ?? err)
        );
      }, 15000);
    }
  } catch (e) {
    console.warn('Upstash Redis not available:', e?.message ?? e?.toString?.() ?? e);
    redisHealthy = false;
    redisClient = null;
  }
} else if (REDIS_URL && !isVercel) {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({ url: REDIS_URL });
    redisClient.on('error', (err) => {
      redisHealthy = false;
      const now = Date.now();
      if (now - lastRedisErrorLog >= REDIS_ERROR_LOG_INTERVAL_MS) {
        const msg = err?.message ?? err?.toString?.() ?? (typeof err === 'string' ? err : 'Unknown Redis error');
        console.warn('Redis error:', msg || '(no message)');
        lastRedisErrorLog = now;
      }
    });
    redisClient.on('ready', () => {
      redisHealthy = true;
      if (typeof redisReadyResolve === 'function') redisReadyResolve();
      seedFallbackPool().catch((err) => console.warn('seedFallbackPool failed:', err?.message ?? err?.toString?.() ?? err));
      if (cron) {
        cron.schedule('0 0 */3 * *', () => {
          refreshFallbackPoolFromSteam().catch((err) =>
            console.warn('refreshFallbackPoolFromSteam scheduled run failed:', err?.message ?? err?.toString?.() ?? err)
          );
        });
        setTimeout(() => {
          refreshFallbackPoolFromSteam().catch((err) =>
            console.warn('refreshFallbackPoolFromSteam startup run failed:', err?.message ?? err?.toString?.() ?? err)
          );
        }, 15000);
      }
    });
    redisClient.connect().catch((err) => {
      const msg = err?.message ?? err?.toString?.() ?? (typeof err === 'string' ? err : 'Unknown');
      console.warn('Redis connect failed:', msg);
      redisHealthy = false;
      redisClient = null;
    });
  } catch (e) {
    console.warn('Redis not available:', e?.message ?? e?.toString?.() ?? e);
    redisHealthy = false;
    redisClient = null;
  }
}

const FALLBACK_POOL_TOP_N_FOR_PICK = 100;
const STEAMSPY_TAGS_TOP_N = 5;
const STEAMSPY_ENRICH_CONCURRENCY = 5;
const STEAMSPY_ENRICH_BATCH_DELAY_MS = 200;
const CASUAL_TAGS = new Set(['casual', 'relaxing', 'indie', 'singleplayer', 'puzzle', 'simulation', 'cute', 'cozy', 'story rich', 'adventure']);
const HARDCORE_TAGS = new Set(['souls-like', 'hardcore', 'difficult', 'competitive', 'multiplayer', 'fps', 'action', 'pvp', 'roguelike', 'strategy']);

/**
 * 场景映射字典 (Scenario Mapper): 每个场景对应的标签集合，用于判断游戏与场景的匹配度。
 * - pickles / 碎片时间 (fragmented): 短时、轻量、可随时暂停。
 * - flow / 沉浸时光 (immersive): 长时、深度、需要连续投入。
 */
const SCENARIO_TAG_MAP = {
  pickles: [
    'casual', 'roguelite', 'roguelike', 'puzzle', 'platformer', 'card game', 'arcade',
    'relaxing', 'short', 'quick', 'endless', 'tactical', 'turn-based',
  ],
  flow: [
    'open world', 'rpg', 'strategy', 'simulation', 'adventure', 'story rich',
    'souls-like', 'exploration', 'building', 'management', 'grand strategy',
  ],
};

const SCENARIO_ALIASES = {
  fragmented: 'pickles',
  碎片时间: 'pickles',
  immersive: 'flow',
  沉浸时光: 'flow',
};

/**
 * Returns a fit score (0..n) for a game in a given scenario based on how many tags match.
 * @param {string[]} gameTags - Array of tag strings (e.g. from Steam/SteamSpy; will be lowercased).
 * @param {string} scenario - One of: 'pickles' | 'flow' | '碎片时间' | '沉浸时光' | 'fragmented' | 'immersive'.
 * @returns {number} Number of matching tags (0 = no match, higher = better fit).
 */
function isGameFitForScenario(gameTags, scenario) {
  const key = SCENARIO_ALIASES[scenario] || (scenario === 'flow' ? 'flow' : 'pickles');
  const allowedSet = new Set((SCENARIO_TAG_MAP[key] || []).map((t) => String(t).toLowerCase().trim()));
  const tags = Array.isArray(gameTags)
    ? gameTags.map((t) => String(t || '').toLowerCase().trim()).filter(Boolean)
    : [];
  return tags.filter((t) => allowedSet.has(t)).length;
}

const FALLBACK_POOL_COUNT = 32;
const FALLBACK_POOL_TARGET_SIZE = 250;
const FALLBACK_POOL_RECENCY_MONTHS = 12;
const STEAMSPY_API_BASE = (process.env.STEAMSPY_API_BASE || 'https://steamspy.com/api.php').replace(/\/$/, '');
const SESSION_BLACKLIST_KEY_PREFIX = 'steam_sense:session_blacklist:';

// Daily Fortune (塔罗式每日运势): 按自然日（UTC）区分，同用户同日同牌同本命游戏，跨日即更新
const DAILY_FORTUNE_KEY_PREFIX = 'steam_sense:daily_fortune:';
const DAILY_FORTUNE_TTL_SEC = 86400; // 24 hours

/** 当日日期串（UTC），用于塔罗缓存键与抽牌/候选种子，保证每日更新 */
function getDailyFortuneDateString() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * 赛博塔罗牌组：每张牌包含 cardId、中文牌名、静态图片路径。
 * 图片需自行放置于项目静态目录（如 public/images/tarot/ 或与 index 同级的 images/tarot/）。
 */
const CYBER_TAROT_DECK = [
  { cardId: 'goblin', cardName: '掉宝哥布林', cardImageUrl: '/images/tarot/goblin.png' },
  { cardId: 'void_drifter', cardName: '虚空漂流者', cardImageUrl: '/images/tarot/void_drifter.png' },
  { cardId: 'lag_phantom', cardName: '掉帧幻影', cardImageUrl: '/images/tarot/lag_phantom.png' },
  { cardId: 'pker', cardName: '红名玩家', cardImageUrl: '/images/tarot/pker.png' },
  { cardId: 'modder', cardName: '模组师', cardImageUrl: '/images/tarot/modder.png' },
  { cardId: 'speedrunner', cardName: '速通者', cardImageUrl: '/images/tarot/speedrunner.png' },
  { cardId: 'coop_legend', cardName: '联机侠', cardImageUrl: '/images/tarot/coop_legend.png' },
  { cardId: 'achievement_hunter', cardName: '成就猎人', cardImageUrl: '/images/tarot/achievement_hunter.png' },
];

/** Extract Steam app IDs from store search HTML fragment (e.g. results_html or full page). */
function parseAppIdsFromStoreHtml(html) {
  if (!html || typeof html !== 'string') return [];
  const ids = new Set();
  const re = /(?:data-ds-appid|href\s*=\s*["'](?:\/app\/)?)(\d{4,})/gi;
  let m;
  while ((m = re.exec(html)) !== null) ids.add(Number(m[1]));
  return Array.from(ids);
}

/**
 * Fetch "New and Trending" style app IDs from Steam store (sort by release date desc).
 * Returns up to ~300 appids from multiple pages. No API key required.
 */
async function fetchSteamNewReleases() {
  const appIds = [];
  const pageSize = 100;
  let start = 0;
  const maxPages = 4;

  for (let page = 0; page < maxPages; page++) {
    try {
      const formBody = new URLSearchParams({
        query: '',
        start: String(start),
        count: String(pageSize),
        dynamic_data: '1',
        sort_by: 'Released_Desc',
        category1: '998',
        supportedlang: 'english',
        l: 'english',
        cc: 'us',
      }).toString();

      const res = await fetch(`${STEAM_STORE_BASE_URL}/search/results/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formBody,
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });

      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        const fromHtml = parseAppIdsFromStoreHtml(text);
        fromHtml.forEach((id) => appIds.push(id));
        start += pageSize;
        if (fromHtml.length < pageSize) break;
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const html = data.results_html || data.results_html_encoded || '';
      const pageIds = parseAppIdsFromStoreHtml(html);
      pageIds.forEach((id) => appIds.push(id));
      if (pageIds.length < pageSize) break;
      start += pageSize;
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      const msg = err?.message || '';
      if (msg.includes('timeout') || msg.includes('aborted')) {
        console.warn('fetchSteamNewReleases page timeout (will use SteamSpy supplement if needed):', msg.slice(0, 60));
      } else {
        console.warn('fetchSteamNewReleases page error:', msg);
      }
      break;
    }
  }

  const unique = [...new Set(appIds)].filter((id) => Number.isInteger(id) && id > 0);
  return unique;
}

/**
 * Fetch tags and optional release info for one app from SteamSpy appdetails.
 * Returns { id, tags: string[], releaseDate: string } (top 5 tags by count).
 */
async function fetchSteamSpyAppDetails(appId) {
  try {
    const url = `${STEAMSPY_API_BASE}?request=appdetails&appid=${appId}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    const data = await res.json();
    if (!data || typeof data !== 'object') return { id: appId, tags: [], releaseDate: '' };
    const tagsObj = data.tags;
    const tags =
      tagsObj && typeof tagsObj === 'object'
        ? Object.entries(tagsObj)
            .sort((a, b) => (b[1] || 0) - (a[1] || 0))
            .slice(0, STEAMSPY_TAGS_TOP_N)
            .map(([name]) => String(name || '').trim())
            .filter(Boolean)
        : [];
    const releaseDate = typeof data.release_date === 'string' ? data.release_date : '';
    return { id: appId, tags, releaseDate };
  } catch {
    return { id: appId, tags: [], releaseDate: '' };
  }
}

/**
 * Run async tasks in batches with concurrency limit and delay between batches.
 */
async function runBatched(tasks, concurrency = STEAMSPY_ENRICH_CONCURRENCY, delayMs = STEAMSPY_ENRICH_BATCH_DELAY_MS) {
  const results = [];
  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map((fn) => fn()));
    results.push(...batchResults);
    if (i + concurrency < tasks.length && delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return results;
}

/**
 * Fetch top games from SteamSpy (by ownership/relevance). Used as fallback when store search returns few.
 * Prioritize games with decent positive ratio; no release-date filter.
 * 若 SteamSpy 返回 HTML/错误页（非 JSON），安全跳过并记录片段，避免 JSON 解析抛错。
 */
async function fetchSteamSpyTopGames(limit = 300) {
  const all = [];

  for (let page = 0; page < 3; page++) {
    try {
      const url = `${STEAMSPY_API_BASE}?request=all&page=${page}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
      const text = await res.text();
      if (!res.ok) {
        console.warn(`fetchSteamSpyTopGames page ${page}: HTTP ${res.status}, body snippet: ${text.slice(0, 120)}`);
        break;
      }
      const trimmed = text.trim();
      if (!trimmed.startsWith('{')) {
        console.warn(
          `fetchSteamSpyTopGames page ${page}: response is not JSON (starts with "${trimmed.slice(0, 50)}..."), skipping`
        );
        break;
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch (parseErr) {
        console.warn(`fetchSteamSpyTopGames page ${page}: JSON parse error: ${parseErr?.message}, snippet: ${trimmed.slice(0, 120)}`);
        break;
      }
      if (!data || typeof data !== 'object') break;

      const entries = Object.values(data).filter((e) => e && Number.isInteger(e.appid) && e.appid > 0);
      const total = (e) => (e.positive || 0) + (e.negative || 0);
      entries
        .filter((e) => total(e) >= 100)
        .forEach((e) => {
          all.push({
            appid: e.appid,
            ratio: (e.positive || 0) / Math.max(1, total(e)),
          });
        });
      if (Object.keys(data).length < 500) break;
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      console.warn('fetchSteamSpyTopGames page error:', err?.message);
      break;
    }
  }

  const sorted = [...all].sort((a, b) => b.ratio - a.ratio);
  const seen = new Set();
  return sorted.filter((e) => !seen.has(e.appid) && seen.add(e.appid)).slice(0, limit).map((e) => e.appid);
}

/** 预留：nightly 同步 store meta 时使用的 top appIds 来源。优先从 env STORE_SYNC_APPIDS 读取（逗号分隔，测试用），否则从 SteamSpy 拉 top N（STORE_META_SYNC_TOP_N，默认 1000）。 */
const STORE_META_SYNC_TOP_N = Number(process.env.STORE_META_SYNC_TOP_N || 1000);
async function getSteamSpyTopAppIdsForStoreSync(limit = STORE_META_SYNC_TOP_N) {
  const fromEnv = process.env.STORE_SYNC_APPIDS;
  if (fromEnv && typeof fromEnv === 'string') {
    const ids = fromEnv.split(',').map((s) => Number(s.trim())).filter((id) => Number.isInteger(id) && id > 0);
    return ids.slice(0, limit);
  }
  return fetchSteamSpyTopGames(limit);
}

/**
 * Refresh the Redis fallback pool from Steam (new releases + SteamSpy fallback).
 * Fetches top 5 tags per game from SteamSpy; stores rich JSON in ZSET; fills category sets (casual/hardcore).
 */
async function refreshFallbackPoolFromSteam() {
  if (!redisClient || !redisHealthy) {
    console.warn('refreshFallbackPoolFromSteam: Redis not available');
    return;
  }

  const startedAt = new Date().toISOString();
  let appIds = await fetchSteamNewReleases();
  const usedSteamSpy = appIds.length < 100;
  if (usedSteamSpy) {
    console.warn('Steam new releases returned few IDs, supplementing with SteamSpy');
    const spyIds = await fetchSteamSpyTopGames(FALLBACK_POOL_TARGET_SIZE);
    const combined = [...new Set([...appIds, ...spyIds])];
    appIds = combined.slice(0, FALLBACK_POOL_TARGET_SIZE);
  } else {
    appIds = appIds.slice(0, FALLBACK_POOL_TARGET_SIZE);
  }

  if (appIds.length === 0) {
    console.warn('refreshFallbackPoolFromSteam: no app IDs from Steam/SteamSpy, using hardcoded fallback pool');
    appIds = TRENDING_FALLBACK_POOL.slice(0, FALLBACK_POOL_TARGET_SIZE);
  }
  if (appIds.length === 0) {
    console.warn('refreshFallbackPoolFromSteam: still no app IDs, skipping Redis update');
    return;
  }

  const tasks = appIds.map((id) => () => fetchSteamSpyAppDetails(id));
  const enriched = await runBatched(tasks, STEAMSPY_ENRICH_CONCURRENCY, STEAMSPY_ENRICH_BATCH_DELAY_MS);
  const withTags = enriched.filter((e) => e && Number.isInteger(e.id));

  const sampleFirst = withTags.slice(0, 3).map((e) => `${e.id}(${(e.tags || []).slice(0, 2).join(',')})`).join('; ');
  const sampleLast = withTags.slice(-2).map((e) => `${e.id}`).join(', ');
  console.log(
    `[FallbackPool] Refreshed at ${startedAt}: ${withTags.length} games with tags (new releases${usedSteamSpy ? ' + SteamSpy' : ''}). ` +
    `Sample: [${sampleFirst}], ... [${sampleLast}]`
  );

  try {
    const baseScore = 1e10;
    const scored = withTags.map((entry, i) => {
      const value = JSON.stringify({
        id: entry.id,
        tags: Array.isArray(entry.tags) ? entry.tags.slice(0, STEAMSPY_TAGS_TOP_N) : [],
        releaseDate: String(entry.releaseDate || ''),
      });
      return {
        score: baseScore + (withTags.length - 1 - i),
        value,
      };
    });

    await redisClient.del(FALLBACK_POOL_KEY_V2);
    await redisClient.del(FALLBACK_POOL_KEY);
    await redisClient.del(POOL_CATEGORY_CASUAL);
    await redisClient.del(POOL_CATEGORY_HARDCORE);

    if (scored.length > 0) {
      await redisClient.zAdd(FALLBACK_POOL_KEY_V2, scored);
    }
    for (const entry of withTags) {
      const id = entry.id;
      await redisClient.sAdd(FALLBACK_POOL_KEY, String(id));
      const tags = (entry.tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
      const hasCasual = tags.some((t) => CASUAL_TAGS.has(t));
      const hasHardcore = tags.some((t) => HARDCORE_TAGS.has(t));
      if (hasCasual) await redisClient.sAdd(POOL_CATEGORY_CASUAL, String(id));
      if (hasHardcore) await redisClient.sAdd(POOL_CATEGORY_HARDCORE, String(id));
    }
    console.log(
      `Fallback pool written: ${FALLBACK_POOL_KEY_V2} (ZSET rich), ${FALLBACK_POOL_KEY} (Set), ` +
      `${POOL_CATEGORY_CASUAL}/${POOL_CATEGORY_HARDCORE} (category sets)`
    );
  } catch (err) {
    console.warn('refreshFallbackPoolFromSteam Redis error:', err?.message);
  }
}

async function seedFallbackPool() {
  if (!redisClient) return;
  const filePath = path.join(ROOT, 'fallback_games.json');
  if (!fs.existsSync(filePath)) {
    console.warn('fallback_games.json not found, skip seeding fallback pool');
    return;
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const ids = JSON.parse(raw);
    const appIds = Array.isArray(ids) ? ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
    if (appIds.length === 0) return;
    const defaultScore = 1e8;
    const scored = appIds.map((appId) => ({
      score: defaultScore,
      value: JSON.stringify({ id: appId, tags: [], releaseDate: '' }),
    }));
    await redisClient.del(FALLBACK_POOL_KEY_V2);
    await redisClient.del(FALLBACK_POOL_KEY);
    await redisClient.del(POOL_CATEGORY_CASUAL);
    await redisClient.del(POOL_CATEGORY_HARDCORE);
    if (scored.length > 0) {
      await redisClient.zAdd(FALLBACK_POOL_KEY_V2, scored);
    }
    for (const appId of appIds) {
      await redisClient.sAdd(FALLBACK_POOL_KEY, String(appId));
    }
    console.log(`Seeded fallback pool: ${appIds.length} game IDs -> ${FALLBACK_POOL_KEY_V2} (ZSET rich), ${FALLBACK_POOL_KEY} (Set)`);
  } catch (err) {
    console.warn('seedFallbackPool error:', err?.message);
  }
}

let getGameDetailsForFallbackTest = null;
function setGetGameDetailsForFallbackTest(fn) {
  getGameDetailsForFallbackTest = fn;
}

/**
 * Get app IDs from a category set (steam_sense:pool:casual or steam_sense:pool:hardcore) for lightning-fast scenario filtering.
 * Returns up to `count` random IDs from the set, excluding owned and blacklisted.
 */
async function getFallbackPoolIdsByCategory(category, count = 15, ownedAppIds = [], sessionBlacklistAppIds = []) {
  if (!redisClient || !redisHealthy) return [];
  const key = category === 'hardcore' ? POOL_CATEGORY_HARDCORE : POOL_CATEGORY_CASUAL;
  const ownedSet = new Set((ownedAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const blacklistSet = new Set((sessionBlacklistAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  try {
    const size = await redisClient.sCard(key).catch(() => 0);
    if (size === 0) return [];
    const requestCount = Math.min(count * 3, size);
    const raw = await redisClient.sRandMember(key, requestCount);
    const list = Array.isArray(raw) ? raw.map((v) => Number(String(v))) : raw != null ? [Number(String(raw))] : [];
    const filtered = list.filter((id) => Number.isInteger(id) && id > 0 && !ownedSet.has(id) && !blacklistSet.has(id));
    return [...new Set(filtered)].slice(0, count);
  } catch {
    return [];
  }
}

async function getFallbackPoolGamesFromRedis(
  ownedAppIds,
  sessionBlacklistAppIds = [],
  count = FALLBACK_POOL_COUNT,
  seedHint = '',
  preferredTags = [],
  currentScenario = 'pickles'
) {
  if (!redisClient || !redisHealthy) {
    console.log('[fallback-pool] Redis unavailable, returning []');
    return [];
  }
  const ownedSet = new Set((ownedAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const blacklistSet = new Set((sessionBlacklistAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  try {
    const currentMinute = Math.floor(Date.now() / 60000);
    const seedBase = (seedHint || '').trim();
    const seed = seedBase ? `${seedBase}:${currentMinute}` : `${Date.now()}:${currentMinute}`;
    const rng = createSeededRng(seed);

    let rawList = [];
    const v2Size = await redisClient.zCard(FALLBACK_POOL_KEY_V2).catch(() => 0);
    console.log('[fallback-pool] v2Size=', v2Size, 'blacklistSize=', blacklistSet.size, 'ownedSize=', ownedSet.size);
    if (v2Size > 0) {
      const windowSize = Math.min(FALLBACK_POOL_TOP_N_FOR_PICK, v2Size);
      let rangeStart = 0;
      let rangeEnd = windowSize - 1;
      if (v2Size > windowSize) {
        const maxOffset = v2Size - windowSize;
        const offset = Math.floor(rng() * (maxOffset + 1));
        rangeStart = offset;
        rangeEnd = offset + windowSize - 1;
      }
      const raw = await redisClient.zRange(FALLBACK_POOL_KEY_V2, rangeStart, rangeEnd, { REV: true });
      if (Array.isArray(raw)) {
        rawList = raw
          .map((v) => {
            if (v && typeof v === 'object' && v.member != null) return String(v.member);
            if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) return v;
            return null;
          })
          .filter(Boolean);
      } else {
        rawList = raw != null ? [String(raw)] : [];
      }
    } else {
      const size = await redisClient.sCard(FALLBACK_POOL_KEY);
      if (size === 0) return [];
      const requestCount = Math.min(Math.max(count * 4, 50), size);
      const raw = await redisClient.sRandMember(FALLBACK_POOL_KEY, requestCount);
      rawList = Array.isArray(raw) ? raw.map((v) => String(v)) : raw != null ? [String(raw)] : [];
    }

    function parsePoolEntry(s) {
      const str = String(s || '').trim();
      if (!str) return null;
      if (str.startsWith('{')) {
        try {
          const o = JSON.parse(str);
          const id = Number(o?.id ?? o?.appId ?? o?.Id ?? o?.ID);
          return Number.isInteger(id) && id > 0
            ? { id, tags: Array.isArray(o.tags) ? o.tags : [], releaseDate: String(o.releaseDate || o.发布日期 || '') }
            : null;
        } catch {
          const id = Number(str);
          return Number.isInteger(id) && id > 0 ? { id, tags: [], releaseDate: '' } : null;
        }
      }
      const id = Number(str);
      return Number.isInteger(id) && id > 0 ? { id, tags: [], releaseDate: '' } : null;
    }

    const entries = rawList.map(parsePoolEntry).filter(Boolean);
    const baseFiltered = entries.filter(
      (e) => e && !ownedSet.has(e.id) && !blacklistSet.has(e.id)
    );
    console.log('[fallback-pool] rawList=', rawList.length, 'parsed=', entries.length, 'baseFiltered=', baseFiltered.length);
    if (baseFiltered.length === 0) return [];

    const scenarioKey = SCENARIO_ALIASES[currentScenario] || (currentScenario === 'flow' ? 'flow' : 'pickles');
    const oppositeKey = scenarioKey === 'pickles' ? 'flow' : 'pickles';
    const MIN_TAGS_FOR_FIT = 2;

    const withScores = baseFiltered.map((e) => {
      const fitScore = isGameFitForScenario(e.tags, scenarioKey);
      const conflictScore = isGameFitForScenario(e.tags, oppositeKey);
      return { ...e, fitScore, conflictScore };
    });

    const tier1 = withScores.filter((e) => e.fitScore >= MIN_TAGS_FOR_FIT).sort((a, b) => b.fitScore - a.fitScore);
    const tier2 = withScores.filter((e) => e.fitScore < MIN_TAGS_FOR_FIT && e.conflictScore < MIN_TAGS_FOR_FIT);

    function shuffleArray(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        const tmp = a[i];
        a[i] = a[j];
        a[j] = tmp;
      }
      return a;
    }
    const shuffled = [...shuffleArray(tier1), ...shuffleArray(tier2)];

    let meta;
    if (typeof getGameDetailsForFallbackTest === 'function') {
      meta = await Promise.all(
        shuffled.map(async (entry) => {
          const id = entry.id;
          if (entry.tags && entry.tags.length > 0) {
            return { id, primaryGenre: String(entry.tags[0]).trim() || `id-${id}` };
          }
          try {
            const details = await getGameDetailsForFallbackTest(id, 'en-US');
            const genres = Array.isArray(details?.genres)
              ? details.genres.map((g) => String(g || '').trim()).filter(Boolean)
              : [];
            return { id, primaryGenre: genres[0] || `id-${id}` };
          } catch {
            return { id, primaryGenre: `id-${id}` };
          }
        })
      );
    } else {
      const idsNeedingMeta = shuffled.filter((e) => !e.tags || e.tags.length === 0).map((e) => e.id);
      const storeMeta = idsNeedingMeta.length > 0 ? await storeService.getGamesMetaMapCacheOnly(idsNeedingMeta, 'en-US') : new Map();
      meta = shuffled.map((entry) => {
        const id = entry.id;
        if (entry.tags && entry.tags.length > 0) {
          return { id, primaryGenre: String(entry.tags[0]).trim() || `id-${id}` };
        }
        const details = storeMeta.get(id);
        const genres = Array.isArray(details?.genres)
          ? details.genres.map((g) => String(g || '').trim()).filter(Boolean)
          : [];
        return { id, primaryGenre: genres[0] || `id-${id}` };
      });
    }

    const preferredSet = new Set(
      (preferredTags || [])
        .map((t) => String(t || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const selected = [];
    const taken = new Set();
    const primaryGenres = new Set();

    for (const { id, primaryGenre } of meta) {
      if (selected.length >= count) break;
      if (taken.has(id)) continue;
      const genreKey = primaryGenre || `id-${id}`;
      const genreKeyNorm = genreKey.toLowerCase();
      const isPreferred = preferredSet.has(genreKeyNorm);
      if (!isPreferred && primaryGenres.has(genreKey) && primaryGenres.size < 5) continue;
      primaryGenres.add(genreKey);
      taken.add(id);
      selected.push(id);
    }

    if (selected.length < count) {
      for (const { id } of meta) {
        if (selected.length >= count) break;
        if (taken.has(id)) continue;
        taken.add(id);
        selected.push(id);
      }
    }

    if (selected.length > 0 && redisClient) {
      const steamSpyMeta = await getSteamSpyMetaFromRedis(redisClient, selected);
      selected.sort((a, b) => {
        const metaA = steamSpyMeta.get(a);
        const metaB = steamSpyMeta.get(b);
        const scoreA = metaA ? scoreService.calculateScore(metaA) : 0;
        const scoreB = metaB ? scoreService.calculateScore(metaB) : 0;
        return scoreB - scoreA;
      });
    }

    console.log('[fallback-pool] selected count=', selected.length);
    return selected;
  } catch (err) {
    console.warn('[fallback-pool] getFallbackPoolGamesFromRedis error:', err?.message ?? err);
    return [];
  }
}

const profileCache = new Map();
const analysisProfileCache = new Map();
const gameDetailsCache = new Map();
const topGameCategoryCache = new Map();
const DIVERSITY_APP_POOL = [
  1145360, 1675200, 548430, 588650, 413150, 1086940, 620, 739630, 990080, 1817070,
  1593500, 1245620, 1174180, 1938090, 1091500, 582010, 1716740, 1627720,
  275850, 367520, 782330, 242760, 236390, 252490, 1158310, 1129580, 945360, 2399830,
];

const TRENDING_FALLBACK_POOL = [
  730, 570, 271590, 1086940, 252490, 1172470, 1238810, 1817070, 1145360, 1091500,
  413150, 1174180, 892970, 1245620, 550, 620, 440, 1593500, 242760, 548430, 588650,
  632470, 255710, 553850, 2073850, 739630, 990080, 582010, 1716740, 275850, 367520,
  782330, 236390, 1158310, 1129580, 945360, 2399830, 1174180, 1938090, 1627720,
];

function buildScenarioSkeleton(lang = 'en-US') {
  const fallbackScenarios = getFallbackScenariosForLang(lang);
  const out = {};
  for (const [key, lane] of Object.entries(fallbackScenarios)) {
    out[key] = {
      title: lane.title,
      description: lane.description,
      games: [],
    };
  }
  return out;
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;

  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;

    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

function buildRecentSnapshot(profile) {
  const recentGames = Array.isArray(profile?.recentGames) ? profile.recentGames : [];
  const mapped = recentGames
    .map((g) => ({
      appId: Number(g?.appId),
      name: String(g?.name || ''),
      playtime2WeeksHours: Number(g?.playtime2WeeksHours || 0),
    }))
    .filter((g) => Number.isInteger(g.appId) && g.appId > 0);
  const recentTotalHours = mapped.reduce((acc, g) => acc + (Number(g.playtime2WeeksHours) || 0), 0);
  return {
    recentTotalHours,
    recentGames: mapped,
  };
}

function diffRecentSnapshot(prev, next) {
  if (!prev) {
    return {
      hasDiff: false,
      recentTotalHoursDelta: 0,
      newRecentGames: [],
      topGainers: [],
    };
  }
  const prevMap = new Map(prev.recentGames.map((g) => [g.appId, g]));
  const newRecentGames = [];
  const topGainers = [];
  for (const g of next.recentGames) {
    const prior = prevMap.get(g.appId);
    if (!prior) {
      newRecentGames.push(g);
    } else {
      const delta = (Number(g.playtime2WeeksHours) || 0) - (Number(prior.playtime2WeeksHours) || 0);
      if (delta > 0.3) {
        topGainers.push({ ...g, deltaHours: Number(delta.toFixed(2)) });
      }
    }
  }
  topGainers.sort((a, b) => b.deltaHours - a.deltaHours);
  const deltaTotal = Number(((next.recentTotalHours || 0) - (prev.recentTotalHours || 0)).toFixed(2));
  return {
    hasDiff: newRecentGames.length > 0 || topGainers.length > 0 || Math.abs(deltaTotal) >= 0.5,
    recentTotalHoursDelta: deltaTotal,
    newRecentGames: newRecentGames.slice(0, 5),
    topGainers: topGainers.slice(0, 5),
  };
}

function formatDiffSummary(diff, lang = 'en-US') {
  if (!diff || !diff.hasDiff) return '';
  if (lang === 'zh-CN') {
    const parts = [];
    if (diff.newRecentGames?.length) {
      parts.push(`近两周新玩：${diff.newRecentGames.map((g) => g.name).filter(Boolean).join('、')}`);
    }
    if (diff.topGainers?.length) {
      parts.push(`最近投入增加：${diff.topGainers.map((g) => g.name).filter(Boolean).join('、')}`);
    }
    if (Math.abs(diff.recentTotalHoursDelta) >= 0.5) {
      parts.push(`近两周总时长变化约 ${diff.recentTotalHoursDelta} 小时`);
    }
    return parts.join('；');
  }
  const parts = [];
  if (diff.newRecentGames?.length) {
    parts.push(`New in last 2 weeks: ${diff.newRecentGames.map((g) => g.name).filter(Boolean).join(', ')}`);
  }
  if (diff.topGainers?.length) {
    parts.push(`Playtime spike: ${diff.topGainers.map((g) => g.name).filter(Boolean).join(', ')}`);
  }
  if (Math.abs(diff.recentTotalHoursDelta) >= 0.5) {
    parts.push(`Total 2-week hours change ~${diff.recentTotalHoursDelta}h`);
  }
  return parts.join('; ');
}

const SNAPSHOT_KEY_PREFIX = 'steam_sense:snapshot:';
const DIFF_KEY_PREFIX = 'steam_sense:diff:';

function parseRedisJson(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object' && raw !== null) return raw;
  if (typeof raw !== 'string') return null;
  if (raw === '[object Object]') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function getProfileSnapshot(steamId) {
  if (!steamId) return null;
  // Prefer Redis when healthy
  if (redisClient && redisHealthy) {
    try {
      const raw = await redisClient.get(`${SNAPSHOT_KEY_PREFIX}${steamId}`);
      const parsed = parseRedisJson(raw);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Redis getProfileSnapshot failed, falling back to in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }
  // Fallback in-memory cache with TTL
  const hit = FALLBACK_SNAPSHOT_CACHE.get(steamId);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > SNAPSHOT_TTL_SEC * 1000) {
    FALLBACK_SNAPSHOT_CACHE.delete(steamId);
    return null;
  }
  return hit.data;
}

async function setProfileSnapshot(steamId, snapshot) {
  if (!steamId || !snapshot) return;
  if (redisClient && redisHealthy) {
    try {
      await redisClient.set(`${SNAPSHOT_KEY_PREFIX}${steamId}`, JSON.stringify(snapshot), { EX: SNAPSHOT_TTL_SEC });
    } catch (err) {
      console.warn('Redis setProfileSnapshot failed, opening Redis circuit and using in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }
  FALLBACK_SNAPSHOT_CACHE.set(steamId, { timestamp: Date.now(), data: snapshot });
}

async function getProfileDiff(steamId) {
  if (!steamId) return null;
  if (redisClient && redisHealthy) {
    try {
      const raw = await redisClient.get(`${DIFF_KEY_PREFIX}${steamId}`);
      const parsed = parseRedisJson(raw);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Redis getProfileDiff failed, falling back to in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }
  const hit = FALLBACK_DIFF_CACHE.get(steamId);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > DIFF_TTL_SEC * 1000) {
    FALLBACK_DIFF_CACHE.delete(steamId);
    return null;
  }
  return hit.data;
}

async function setProfileDiff(steamId, diff) {
  if (!steamId || !diff) return;
  if (redisClient && redisHealthy) {
    try {
      await redisClient.set(`${DIFF_KEY_PREFIX}${steamId}`, JSON.stringify(diff), { EX: DIFF_TTL_SEC });
    } catch (err) {
      console.warn('Redis setProfileDiff failed, opening Redis circuit and using in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }
  FALLBACK_DIFF_CACHE.set(steamId, { timestamp: Date.now(), data: diff });
}

const DAILY_FORTUNE_FALLBACK_CACHE = new Map();

async function getDailyFortuneCache(steamId) {
  if (!steamId) return null;
  const dateStr = getDailyFortuneDateString();
  const cacheKey = `${DAILY_FORTUNE_KEY_PREFIX}${steamId}:${dateStr}`;
  const memoryKey = `${steamId}:${dateStr}`;
  if (redisClient && redisHealthy) {
    try {
      const raw = await redisClient.get(cacheKey);
      const parsed = parseRedisJson(raw);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('Redis getDailyFortuneCache failed:', err?.message);
    }
  }
  const hit = DAILY_FORTUNE_FALLBACK_CACHE.get(memoryKey);
  if (hit && Date.now() - hit.timestamp < DAILY_FORTUNE_TTL_SEC * 1000) return hit.data;
  return null;
}

async function setDailyFortuneCache(steamId, data) {
  if (!steamId || !data) return;
  const dateStr = getDailyFortuneDateString();
  const cacheKey = `${DAILY_FORTUNE_KEY_PREFIX}${steamId}:${dateStr}`;
  const memoryKey = `${steamId}:${dateStr}`;
  if (redisClient && redisHealthy) {
    try {
      await redisClient.set(cacheKey, JSON.stringify(data), { EX: DAILY_FORTUNE_TTL_SEC });
    } catch (err) {
      console.warn('Redis setDailyFortuneCache failed:', err?.message);
    }
  }
  DAILY_FORTUNE_FALLBACK_CACHE.set(memoryKey, { timestamp: Date.now(), data });
}

/** Deterministic card index for steamId + today (UTC date). Same user same day = same card; different user or day = different card. */
function pickCardForUser(steamId) {
  const dateStr = getDailyFortuneDateString();
  let hash = 0;
  const str = `${steamId}:${dateStr}`;
  for (let i = 0; i < str.length; i++) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  const index = Math.abs(hash) % CYBER_TAROT_DECK.length;
  return CYBER_TAROT_DECK[index];
}

async function getCandidateGamesForFortune(steamId, lang = 'zh-CN') {
  const ownedAppIds = [];
  try {
    const profile = getCachedAnalysisProfile(steamId, lang);
    if (profile && Array.isArray(profile.ownedAppIds)) ownedAppIds.push(...profile.ownedAppIds);
  } catch {
    // ignore
  }
  const dateStr = getDailyFortuneDateString();
  const seedHint = `${steamId}:${dateStr}`;
  const fallbackIds = await getFallbackPoolGamesFromRedis(
    ownedAppIds,
    [],
    20,
    seedHint,
    [],
    'pickles'
  );
  let ids = (fallbackIds || []).map((e) => Number(e)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) ids = [...TRENDING_FALLBACK_POOL].slice(0, 15);
  const unique = [...new Set(ids)].slice(0, 15);
  const metaMap = await getGamesMetaMapWithSteamSpyFirst(unique, lang);
  const candidates = [];
  for (const appId of unique) {
    const details = metaMap.get(Number(appId));
    if (details && details.name && !/^App\s+\d+$/i.test(details.name)) {
      candidates.push({ appId: details.appId, name: details.name });
    }
  }
  return candidates.length > 0 ? candidates : [{ appId: 1145360, name: 'Hades' }];
}

async function callAiForDailyFortune(cardName, activityDiff, candidates, lang = 'zh-CN') {
  const isZh = lang === 'zh-CN';
  const systemPrompt = isZh
    ? `你是一位赛博神谕（Cyber-Oracle）。根据用户抽到的赛博塔罗牌「${cardName}」和其近期 Steam 游玩动态，给出约 50 字的中文运势解读，并从给定的游戏列表中选出恰好一款与之契合的游戏推荐。只输出 JSON，格式：{"fortune":"运势正文，约50字","appId":选中的游戏appId数字}。不要输出其他任何文字。`
    : `You are a Cyber-Oracle. Based on the user's drawn Cyber Tarot card "${cardName}" and their recent Steam activity, give a ~50-word fortune in English and pick exactly ONE game from the given list that fits. Output only JSON: {"fortune":"fortune text","appId":<number>}. No other text.`;

  const activitySummary = activityDiff && activityDiff.hasDiff
    ? JSON.stringify({
        topGainers: activityDiff.topGainers?.slice(0, 3) || [],
        newRecentGames: activityDiff.newRecentGames?.slice(0, 5) || [],
        recentTotalHoursDelta: activityDiff.recentTotalHoursDelta,
      })
    : '无';

  const userPrompt = isZh
    ? `用户近期活动摘要：${activitySummary}\n\n可选游戏列表（必须从中选一个 appId）：\n${candidates.map((c) => `${c.appId}: ${c.name}`).join('\n')}`
    : `User recent activity: ${activitySummary}\n\nGame list (pick one appId):\n${candidates.map((c) => `${c.appId}: ${c.name}`).join('\n')}`;

  const providers = [
    { name: 'primary', apiKey: process.env.OPENAI_API_KEY, baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', model: process.env.OPENAI_MODEL || 'gpt-4o-mini' },
    { name: 'deepseek', apiKey: process.env.DEEPSEEK_API_KEY, baseUrl: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com', model: process.env.DEEPSEEK_MODEL || 'deepseek-chat' },
  ].filter((p) => p.apiKey);

  if (providers.length === 0) throw new Error('No AI provider configured for daily fortune');

  for (const provider of providers) {
    try {
      const res = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify({
          model: provider.model,
          temperature: 0.7,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          response_format: { type: 'json_object' },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`AI ${res.status}`);
      const json = await res.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content) throw new Error('No content');
      const parsed = JSON.parse(content);
      const fortune = String(parsed.fortune || '').trim() || (isZh ? '今日运势平稳，宜放松游玩。' : 'Today the stars align for a calm session.');
      let appId = Number(parsed.appId);
      const validIds = new Set(candidates.map((c) => c.appId));
      if (!Number.isInteger(appId) || !validIds.has(appId)) appId = candidates[0]?.appId;
      return { fortune, appId };
    } catch (err) {
      continue;
    }
  }
  throw new Error('AI providers failed for daily fortune');
}

async function getSessionBlacklist(steamId) {
  if (!steamId) return [];
  if (redisClient && redisHealthy) {
    try {
      const members = await redisClient.sMembers(`${SESSION_BLACKLIST_KEY_PREFIX}${steamId}`);
      return Array.isArray(members)
        ? members.map((v) => Number(v)).filter((id) => Number.isInteger(id) && id > 0)
        : [];
    } catch (err) {
      console.warn('Redis getSessionBlacklist failed, falling back to in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }
  const hit = FALLBACK_SESSION_BLACKLIST.get(steamId);
  if (!hit) return [];
  if (Date.now() - hit.timestamp > SESSION_BLACKLIST_TTL_SEC * 1000) {
    FALLBACK_SESSION_BLACKLIST.delete(steamId);
    return [];
  }
  return hit.ids;
}

async function addToSessionBlacklist(steamId, appIds) {
  if (!steamId) return;
  const ids = (appIds || [])
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0);
  if (!ids.length) return;

  const existing = await getSessionBlacklist(steamId);
  const seen = new Set();
  const merged = [];
  for (const id of [...ids, ...existing]) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  const trimmed = merged.slice(0, SESSION_BLACKLIST_MAX_SIZE);

  if (redisClient && redisHealthy) {
    const key = `${SESSION_BLACKLIST_KEY_PREFIX}${steamId}`;
    try {
      await redisClient.del(key);
      if (trimmed.length > 0) {
        const members = trimmed.map(String);
        await redisClient.sAdd(key, ...members);
        await redisClient.expire(key, SESSION_BLACKLIST_TTL_SEC);
      }
    } catch (err) {
      console.warn('Redis addToSessionBlacklist failed, falling back to in-memory cache:', err?.message);
      redisHealthy = false;
    }
  }

  FALLBACK_SESSION_BLACKLIST.set(steamId, { timestamp: Date.now(), ids: trimmed });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function redirect(res, url) {
  res.writeHead(302, { Location: url });
  res.end();
}

function redirectWithAuthError(res, req, code) {
  const origin = buildOrigin(req);
  const safeCode = encodeURIComponent(String(code || 'steam_login_failed'));
  redirect(res, `${origin}/?authError=${safeCode}`);
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') return sendJson(res, 404, { error: 'Not found' });
      return sendJson(res, 500, { error: 'Server error' });
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function validSteamId(steamId) {
  return /^[0-9]{17}$/.test(steamId);
}

function hoursFromMinutes(minutes) {
  const hours = minutes / 60;
  return `${hours.toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs`;
}

function formatPlaytimeHours(minutes) {
  return Number((minutes / 60).toFixed(1));
}

function truncate(text, max = 260) {
  return String(text || '').replace(/\s+/g, ' ').slice(0, max);
}

async function mapWithConcurrency(items, concurrency, worker) {
  const out = new Array(items.length);
  let index = 0;
  async function runner() {
    while (index < items.length) {
      const current = index;
      index += 1;
      out[current] = await worker(items[current], current);
    }
  }
  const count = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: count }, () => runner()));
  return out;
}

async function fetchJson(url, options) {
  const method = options?.method || 'GET';
  let attempt = 0;
  let lastError;

  while (attempt <= UPSTREAM_RETRIES) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...(options || {}), signal: controller.signal });
      clearTimeout(timer);

      if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        const error = new Error(`Upstream request failed: ${response.status} ${response.statusText}`);
        error.upstreamStatus = response.status;
        error.upstreamBody = truncate(bodyText);
        error.upstreamUrl = url;
        const retryable = response.status >= 500 || response.status === 429;
        if (retryable && attempt < UPSTREAM_RETRIES) {
          attempt += 1;
          await new Promise((r) => setTimeout(r, 350 * attempt));
          continue;
        }
        throw error;
      }

      return response.json();
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      const isAbort = error?.name === 'AbortError';
      const isNetwork = /fetch failed|network|timeout|socket|econn|etimedout|aborted/i.test(String(error?.message || ''));
      if ((isAbort || isNetwork) && attempt < UPSTREAM_RETRIES) {
        attempt += 1;
        await new Promise((r) => setTimeout(r, 350 * attempt));
        continue;
      }
      break;
    }
  }

  const wrapped = new Error(`Upstream ${method} failed after retries: ${lastError?.message || 'unknown error'}`);
  wrapped.upstreamStatus = lastError?.upstreamStatus;
  wrapped.upstreamBody = lastError?.upstreamBody;
  wrapped.upstreamUrl = url;
  throw wrapped;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON payload'));
      }
    });
    req.on('error', reject);
  });
}

function buildOrigin(req) {
  const host = req.headers.host || `localhost:${PORT}`;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${host}`;
}

async function validateSteamOpenId(requestUrl) {
  const params = new URLSearchParams();
  for (const [key, value] of requestUrl.searchParams.entries()) {
    if (key.startsWith('openid.')) params.append(key, value);
  }
  params.set('openid.mode', 'check_authentication');

  let response;
  try {
    response = await fetch('https://steamcommunity.com/openid/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'SteamSenseAI/1.0',
        Accept: 'text/plain',
      },
      body: params.toString(),
    });
  } catch (error) {
    const cause = error?.cause?.message ? ` (${error.cause.message})` : '';
    throw new Error(`Steam OpenID verification fetch failed${cause}`);
  }

  if (!response.ok) throw new Error('Steam OpenID verification failed');

  const text = await response.text();
  if (!text.includes('is_valid:true')) throw new Error('Invalid Steam login assertion');

  const claimedId = requestUrl.searchParams.get('openid.claimed_id') || '';
  const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
  if (!match) throw new Error('SteamID not found in login response');
  return match[1];
}

function extractSteamIdFromClaimedId(requestUrl) {
  const mode = requestUrl.searchParams.get('openid.mode') || '';
  const claimedId = requestUrl.searchParams.get('openid.claimed_id') || '';
  if (mode !== 'id_res') {
    throw new Error(`Unexpected OpenID mode: ${mode || 'missing'}`);
  }
  const match = claimedId.match(/\/openid\/id\/(\d{17})$/);
  if (!match) {
    throw new Error('SteamID not found in claimed_id');
  }
  return match[1];
}

function normalizeLang(lang) {
  return lang === 'zh-CN' ? 'zh-CN' : 'en-US';
}

function storeLocaleForLang(lang) {
  const normalized = normalizeLang(lang);
  if (normalized === 'zh-CN') {
    return { cc: 'cn', l: 'schinese', currencyLabel: 'CNY' };
  }
  return { cc: 'us', l: 'english', currencyLabel: 'USD' };
}

const storeService = require('./dist/services/storeService');
const { runSyncSteamSpy } = require('./dist/services/syncSteamSpy');
const scoreService = require('./dist/services/scoreService');
const metricsService = require('./dist/services/metricsService');

/** 预留：nightly store meta 同步扩展接口，供 cron 或内部调用。不修改推荐逻辑。 */
async function syncStoreMeta(appIds) {
  const ids = Array.isArray(appIds) ? appIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0) : [];
  return storeService.syncStoreMetaToRedis(ids, 'zh-CN');
}

storeService.init({
  fetchJson,
  getRedisClient: () => redisClient,
  getRedisHealthy: () => redisHealthy,
  steamStoreBaseUrl: STEAM_STORE_BASE_URL,
  steamApiBaseUrl: STEAM_API_BASE_URL,
  steamApiKey: STEAM_API_KEY,
  storeLocaleForLang,
  onSteamStoreCall: () => metricsService.recordSteamStoreCall(),
  onCacheHit: () => metricsService.recordCacheHit(),
  onCacheMiss: () => metricsService.recordCacheMiss(),
});
storeService.setGetTopAppIdsForSyncImpl(getSteamSpyTopAppIdsForStoreSync);

const STEAMSPY_TRIGGER_KEY = 'steam_sense:steamspy_sync_triggered_at';
const STEAMSPY_TRIGGER_TTL_SEC = 6 * 3600; // 6h 内只触发一次

/** 部署后首次打开网站时触发一次 sync-steamspy，便于线上测试不等到 0 点；Redis NX 保证 6h 内只跑一次。 */
async function triggerSteamSpySyncOnFirstVisit() {
  if (!redisClient || !redisHealthy) return;
  try {
    const setOk = await redisClient.set(STEAMSPY_TRIGGER_KEY, String(Date.now()), { NX: true, EX: STEAMSPY_TRIGGER_TTL_SEC });
    if (!setOk) return;
    const steamSpyBaseUrl = (process.env.STEAMSPY_BASE_URL || 'https://steamspy.com').replace(/\/$/, '');
    const steamSpyCacheTtl = Number(process.env.STEAMSPY_CACHE_TTL || 7 * 24 * 3600);
    const steamSpyHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      Referer: 'https://steamspy.com/',
      'X-Requested-With': 'XMLHttpRequest',
    };
    const fetchWithStatus = async (url) => {
      const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: steamSpyHeaders });
      const text = await res.text();
      let data = null;
      try {
        data = text.trim().startsWith('{') ? JSON.parse(text) : null;
      } catch (_) {}
      const tooMany = /too many connections|connection failed/i.test(text);
      if (tooMany && !data) return { status: 503, data: null };
      if (res.ok && data != null) metricsService.recordSteamSpyCall();
      return { status: res.status, data };
    };
    await runSyncSteamSpy({
      redis: redisClient,
      fetchWithStatus,
      steamSpyBaseUrl,
      steamSpyCacheTtlSec: steamSpyCacheTtl,
    });
    console.log('[steamspy-trigger] sync-steamspy completed after first visit');
  } catch (err) {
    console.warn('[steamspy-trigger]', err?.message || err);
  }
}

async function getSteamProfileAndGames(steamId, options = {}, lang = 'en-US') {
  if (!STEAM_API_KEY) throw new Error('Missing STEAM_API_KEY in .env');
  const allowSummaryFallback = options.allowSummaryFallback !== false;
  const allowGamesFallback = options.allowGamesFallback !== false;
  const locale = storeLocaleForLang(lang);

  const summariesUrl = `${STEAM_API_BASE_URL}/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`;
  const ownedGamesUrl = `${STEAM_API_BASE_URL}/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_appinfo=true&include_played_free_games=true`;
  const recentGamesUrl = `${STEAM_API_BASE_URL}/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`;

  let summaryData;
  try {
    summaryData = await fetchJson(summariesUrl);
  } catch (error) {
    if (!allowSummaryFallback) throw error;
    summaryData = { response: { players: [] } };
  }

  let gamesData;
  try {
    gamesData = await fetchJson(ownedGamesUrl);
  } catch (error) {
    if (!allowGamesFallback) throw error;
    gamesData = { response: { game_count: 0, games: [] } };
  }

  const recentData = await fetchJson(recentGamesUrl).catch(() => ({ response: { total_count: 0, games: [] } }));

  const strictPlayer = summaryData?.response?.players?.[0];
  if (!strictPlayer && !allowSummaryFallback) {
    throw new Error('Steam profile not found from GetPlayerSummaries');
  }

  const player = strictPlayer || {
    personaname: `Steam User ${steamId.slice(-4)}`,
    avatarfull: DEFAULT_AVATAR,
    profileurl: `https://steamcommunity.com/profiles/${steamId}/`,
  };

  const games = gamesData?.response?.games || [];
  const gameCount = gamesData?.response?.game_count || 0;
  const totalMinutes = games.reduce((acc, game) => acc + (game.playtime_forever || 0), 0);
  const ownedAppIds = games.map((game) => Number(game.appid)).filter((id) => Number.isInteger(id) && id > 0);

  const gamesSortedByPlaytime = [...games].sort((a, b) => (b.playtime_forever || 0) - (a.playtime_forever || 0));

  const topGames = gamesSortedByPlaytime
    .slice(0, 12)
    .map((game) => ({
      appId: game.appid,
      name: game.name || `App ${game.appid}`,
      playtimeHours: formatPlaytimeHours(game.playtime_forever || 0),
    }));

  const topContextForPersona = gamesSortedByPlaytime.slice(0, TOP_CONTEXT_LIMIT);
  const top50GamesWithCategories = await mapWithConcurrency(topContextForPersona, 8, async (game) => {
    const appId = Number(game.appid);
    const cacheKey = `${appId}:${normalizeLang(lang)}`;
    const cached = topGameCategoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp <= TOP_GAME_CATEGORY_CACHE_TTL_MS) {
      return {
        appId,
        name: game.name || cached.data.name || `App ${appId}`,
        playtimeHours: formatPlaytimeHours(game.playtime_forever || 0),
        categories: cached.data.categories,
      };
    }

    try {
      const appDetailsUrl = `${STEAM_STORE_BASE_URL}/api/appdetails?appids=${appId}&cc=${locale.cc}&l=${locale.l}`;
      const appDetailsData = await fetchJson(appDetailsUrl).catch(() => null);
      const appNode = appDetailsData?.[String(appId)];
      const data = appNode?.success ? appNode.data || {} : {};
      const categories = Array.isArray(data.genres) ? data.genres.map((g) => String(g?.description || '').trim()).filter(Boolean).slice(0, 5) : [];
      const snapshot = {
        name: data.name || game.name || `App ${appId}`,
        categories,
      };
      topGameCategoryCache.set(cacheKey, { timestamp: Date.now(), data: snapshot });

      return {
        appId,
        name: snapshot.name,
        playtimeHours: formatPlaytimeHours(game.playtime_forever || 0),
        categories: snapshot.categories,
      };
    } catch {
      return {
        appId,
        name: game.name || `App ${appId}`,
        playtimeHours: formatPlaytimeHours(game.playtime_forever || 0),
        categories: [],
      };
    }
  });

  const ownedGamesBrief = games
    .map((game) => ({
      appId: Number(game.appid),
      name: game.name || `App ${game.appid}`,
      playtimeMinutes: Number(game.playtime_forever || 0),
      lastPlayedEpoch: Number(game.rtime_last_played || 0),
    }))
    .filter((g) => Number.isInteger(g.appId) && g.appId > 0);

  const nowEpoch = Math.floor(Date.now() / 1000);
  const dormantOwnedGames = ownedGamesBrief
    .filter((g) => {
      const yearsSincePlayed = g.lastPlayedEpoch > 0 ? (nowEpoch - g.lastPlayedEpoch) / (60 * 60 * 24 * 365) : 99;
      return g.playtimeMinutes < 120 || g.lastPlayedEpoch === 0 || yearsSincePlayed >= 2;
    })
    .sort((a, b) => {
      if (a.playtimeMinutes !== b.playtimeMinutes) return a.playtimeMinutes - b.playtimeMinutes;
      return a.lastPlayedEpoch - b.lastPlayedEpoch;
    })
    .slice(0, 120);

  const recentGames = (recentData?.response?.games || []).slice(0, 8).map((game) => ({
    appId: game.appid,
    name: game.name || `App ${game.appid}`,
    playtime2WeeksHours: formatPlaytimeHours(game.playtime_2weeks || 0),
  }));

  return {
    steamId,
    personaName: player.personaname,
    avatar: player.avatarfull,
    profileUrl: player.profileurl,
    gameCount,
    totalPlaytime: hoursFromMinutes(totalMinutes),
    ownedAppIds,
    ownedGamesBrief,
    dormantOwnedGames,
    topGames,
    top50GamesWithCategories,
    recentGames,
  };
}

async function getGameDetails(appId, lang = 'en-US') {
  const cacheKey = `${Number(appId)}:${normalizeLang(lang)}`;
  const cached = gameDetailsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp <= GAME_DETAILS_CACHE_TTL_MS) {
    return cached.data;
  }

  const locale = storeLocaleForLang(lang);
  const appDetailsUrl = `${STEAM_STORE_BASE_URL}/api/appdetails?appids=${appId}&cc=${locale.cc}&l=${locale.l}`;
  const reviewSummaryUrl = `${STEAM_STORE_BASE_URL}/appreviews/${appId}?json=1&language=${locale.l}&purchase_type=all&filter=summary`;

  const appDetailsData = await fetchJson(appDetailsUrl).catch(() => null);
  const reviewData = await fetchJson(reviewSummaryUrl).catch(() => null);
  const playersData = STEAM_API_KEY
    ? await fetchJson(
        `${STEAM_API_BASE_URL}/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?key=${STEAM_API_KEY}&appid=${appId}`
      ).catch(() => null)
    : null;

  const appNode = appDetailsData?.[String(appId)];
  const data = appNode?.success ? appNode.data || {} : {};
  const total = reviewData?.query_summary?.total_reviews || 0;
  const positive = reviewData?.query_summary?.total_positive || 0;
  const positiveRate = total > 0 ? `${Math.round((positive / total) * 100)}%` : 'N/A';

  const currentPlayers = playersData?.response?.player_count;

  const details = {
    appId: Number(appId),
    appType: String(data.type || ''),
    name: data.name || `App ${appId}`,
    posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
    headerImage: data.header_image || `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`,
    shortDescription: data.short_description || 'Detailed description is temporarily unavailable for this game.',
    trailerUrl: data.movies?.[0]?.mp4?.max || data.movies?.[0]?.mp4?.["480"] || '',
    trailerPoster: data.movies?.[0]?.thumbnail || '',
    genres: (data.genres || []).map((g) => g.description),
    releaseDate: data.release_date?.date || 'Unknown',
    isFree: Boolean(data.is_free),
    price: data.is_free ? 'Free' : data.price_overview?.final_formatted || 'N/A',
    positiveRate,
    currentPlayers: typeof currentPlayers === 'number' ? `${currentPlayers.toLocaleString()} online` : 'N/A',
    steamUrl: `https://store.steampowered.com/app/${appId}`,
  };
  gameDetailsCache.set(cacheKey, { timestamp: Date.now(), data: details });
  return details;
}

async function getGameDetailsStrict(appId, lang = 'en-US') {
  const details = await getGameDetails(appId, lang);
  const isGameType = details.appType.toLowerCase() === 'game';
  const validName = details.name && !/^App\s+\d+$/i.test(details.name);
  const validMedia = Boolean(details.headerImage);
  if (!isGameType || !validName || !validMedia) {
    throw new Error(`Unusable app details for ${appId}`);
  }
  return details;
}

/** 带重试的 getGameDetailsStrict，失败时等待 delayMs 后重试，最多 retries 次 */
async function getGameDetailsStrictWithRetry(appId, lang = 'en-US', retries = 2, delayMs = 600) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await getGameDetailsStrict(appId, lang);
    } catch (e) {
      lastErr = e;
      if (i < retries && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

function extractFirstJson(text) {
  const fenceMatch = text.match(/```json\s*([\s\S]*?)```/i);
  if (fenceMatch) return fenceMatch[1].trim();

  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text;
}

function containsLatin(input) {
  return /[A-Za-z]/.test(String(input || ''));
}

function sanitizeAiOutput(raw, fallbackSummary, lang = 'en-US') {
  const isZh = lang === 'zh-CN';
  const fallbackScenarios = getFallbackScenariosForLang(lang);
  const fallbackTags = isZh
    ? ['碎片适配', '偏好敏感', '节奏掌控']
    : ['Adaptive Player', 'Preference-Aware', 'Progression Focused'];
  const rawSummary = typeof raw?.summary === 'string' ? raw.summary : fallbackSummary;
  const personalizedGreeting = typeof raw?.personalized_greeting === 'string' ? raw.personalized_greeting.trim() : '';
  const summary = personalizedGreeting
    ? `${personalizedGreeting} ${rawSummary}`.trim()
    : rawSummary;
  const out = {
    summary,
    playstyleTags: Array.isArray(raw?.playstyleTags) ? raw.playstyleTags.slice(0, 6).map(String) : [],
    gamingPersona: {
      code: /^[A-Z]{4}$/.test(String(raw?.gamingPersona?.code || '').toUpperCase())
        ? String(raw.gamingPersona.code).toUpperCase()
        : 'GMRX',
      name: String(raw?.gamingPersona?.name || (isZh ? '灵感策士' : 'Adaptive Strategist')),
      review: String(raw?.gamingPersona?.review || (isZh
        ? '你在短局与长局之间切换自如，既懂得“剁手补齐”，也愿意“坐牢冲进度”。风格兼顾效率与沉浸。'
        : 'You blend curiosity and persistence into a highly adaptable play pattern: quick tactical pivots, genre-crossing appetite, and a habit of finding elegant solutions under pressure.')),
      attributes: (() => {
        const attrKeys = ['action', 'strategy', 'exploration', 'social', 'immersion'];
        const rawAttr = raw?.gamingPersona?.attributes && typeof raw.gamingPersona.attributes === 'object' ? raw.gamingPersona.attributes : {};
        const a = {};
        attrKeys.forEach((k) => {
          const v = rawAttr[k];
          a[k] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(Number(v)))) : 50;
        });
        return a;
      })(),
      traits: (() => {
        const rawTraits = Array.isArray(raw?.gamingPersona?.traits) ? raw.gamingPersona.traits.slice(0, 3).map(String) : [];
        const defaultTraits = isZh ? ['稳健探索', '偏好敏感', '节奏掌控'] : ['Adaptive', 'Preference-Aware', 'Rhythm Master'];
        return rawTraits.length >= 3 ? rawTraits : [...rawTraits, ...defaultTraits.slice(0, 3 - rawTraits.length)];
      })(),
    },
    scenarios: {},
  };

  const allowedCompatibility = new Set(['smooth', 'playable', 'unplayable']);
  const allowedHandheld = new Set(['verified', 'playable', 'unsupported', 'unknown']);
  const allowedDestinyTypes = new Set(['creative_lineage', 'philosophical_echoes', 'hardware_atmospheric_synergy']);

  for (const key of Object.keys(fallbackScenarios)) {
    const candidate = raw?.scenarios?.[key];
    if (!candidate || typeof candidate !== 'object') {
      out.scenarios[key] = {
        title: fallbackScenarios[key].title,
        description: fallbackScenarios[key].description,
        games: [],
      };
      continue;
    }

    const title = typeof candidate.title === 'string' ? candidate.title : fallbackScenarios[key].title;
    const description = typeof candidate.description === 'string'
      ? candidate.description
      : fallbackScenarios[key].description;

    const games = Array.isArray(candidate.games)
      ? candidate.games
          .map((g) => ({
            appId: Number(g?.appId),
            reason: String(g?.reason || ''),
            compatibility: String(g?.compatibility || 'playable').toLowerCase(),
            handheldCompatibility: String(g?.handheldCompatibility || 'unknown').toLowerCase(),
            destinyLink: String(g?.destiny_link || g?.destinyLink || ''),
            destinyType: String(g?.destiny_type || g?.destinyType || '').toLowerCase(),
            destinyScore: Number(g?.destiny_score ?? g?.destinyScore ?? 0),
            fromLibrary: Boolean(g?.fromLibrary),
          }))
          .map((g) => ({
            ...g,
            compatibility: allowedCompatibility.has(g.compatibility) ? g.compatibility : 'playable',
            handheldCompatibility: allowedHandheld.has(g.handheldCompatibility) ? g.handheldCompatibility : 'unknown',
            destinyType: allowedDestinyTypes.has(g.destinyType) ? g.destinyType : 'philosophical_echoes',
            destinyScore: Number.isFinite(g.destinyScore) ? Math.max(0, Math.min(100, Math.round(g.destinyScore))) : 0,
          }))
          .filter((g) => Number.isInteger(g.appId) && g.appId > 0)
          .slice(0, 5)
      : [];

    out.scenarios[key] = { title, description, games };
  }

  if (!out.playstyleTags.length) {
    out.playstyleTags = fallbackTags;
  }

  if (isZh) {
    /* 不再因含拉丁字符就整段替换 summary，否则会出现「只有一句、其余全丢」；游戏名等含英文时仍保留完整分析。 */
    out.playstyleTags = out.playstyleTags.map((tag, idx) => (containsLatin(tag) ? fallbackTags[idx % fallbackTags.length] : tag));
    out.gamingPersona.name = containsLatin(out.gamingPersona.name) ? '灵感策士' : out.gamingPersona.name;
    out.gamingPersona.review = containsLatin(out.gamingPersona.review)
      ? '你在短局与长局之间切换自如，既会“剁手补齐”，也能“坐牢冲进度”。风格兼顾效率与沉浸。'
      : out.gamingPersona.review;

    Object.entries(out.scenarios).forEach(([key, lane]) => {
      const fallbackLane = fallbackScenarios[key] || {};
      lane.title = containsLatin(lane.title) ? (fallbackLane.title || '场景推荐') : lane.title;
      lane.description = containsLatin(lane.description)
        ? (fallbackLane.description || '为你精选符合场景的游戏。')
        : lane.description;
      lane.games = (lane.games || []).map((g) => {
        return {
          ...g,
          reason: containsLatin(g.reason) ? buildMysticalFallbackReason(lang) : g.reason,
          destinyLink: containsLatin(g.destinyLink) ? buildMysticalFallbackReason(lang) : g.destinyLink,
        };
      });
    });
  }

  return out;
}

function formatAnglePackText(anglePack) {
  if (!anglePack || typeof anglePack !== 'object') return '';
  const trending = String(anglePack.trending || '').trim();
  const taste = String(anglePack.taste || '').trim();
  const explore = String(anglePack.explore || '').trim();
  const id = String(anglePack.id || '').trim();
  return [
    id ? `AnglePack: ${id}` : '',
    trending ? `trendingOnline angle: ${trending}` : '',
    taste ? `tasteMatch angle: ${taste}` : '',
    explore ? `exploreNewAreas angle: ${explore}` : '',
  ].filter(Boolean).join(' | ');
}

function buildSystemPrompt({
  lang,
  selectedMode,
  analysisNonce,
  refreshFlavor,
  anglePackText,
  scenarioOrderText,
  isRefresh,
  activityDiff,
}) {
  const diffInstructionZh = activityDiff && activityDiff.hasDiff
    ? [
      '- 用户近期游戏活动有变化。activityDiff 提供：newRecentGames（近两周新玩的游戏）、topGainers（时长明显增加的游戏，含 name 与 deltaHours）、recentTotalHoursDelta（总时长变化）。',
      '- 必须优先在 personalized_greeting 中写一句个性化问候，直接引用这些数据。若 activityDiff.topGainers 非空，greeting 必须点名提到其中第一名游戏的名字（例如：“欢迎回来！我注意到你最近在《文明 VI》里花了不少时间。基于这股新势头，下面是你的新命运链接……”）。',
      '- 若提供 personalized_greeting，将其作为 summary 的开头；summary 其余部分再写整体分析与推荐导向。并根据近期活动调整 tasteMatch 等场景的推荐倾向。',
    ].join('\n')
    : '';
  const diffInstructionEn = activityDiff && activityDiff.hasDiff
    ? [
      '- The user\'s recent play history has changed. activityDiff provides: newRecentGames (games newly played in last 2 weeks), topGainers (game names and deltaHours playtime increase), recentTotalHoursDelta (total 2-week hours change).',
      '- You MUST include a personalized_greeting that explicitly mentions this shift. If activityDiff.topGainers has at least one game, the greeting MUST name that top game (e.g. "Welcome back! I see you\'ve been deep-diving into [Game Name] lately. Based on this shift, here are your new destiny links...").',
      '- When activityDiff is present, set "personalized_greeting" in your JSON and use it as the opening of "summary". Adjust tasteMatch and other scenarios to reflect this recent focus.',
    ].join('\n')
    : '';

  if (lang === 'zh-CN') {
    return [
      SYSTEM_PROMPT_ZH,
      selectedMode === 'pickles'
        ? '- selectedMode 为 "pickles"：优先短时循环、随时可暂停/保存、轻度机制、或 30 分钟内一局的 roguelike。'
        : '- selectedMode 为 "flow"：优先深度叙事、复杂系统、开放世界探索或需要长时间沉浸的 RPG 进度。',
      '- 将 refreshToken 视为“必须提高多样性”的信号。',
      analysisNonce ? `- 多样性随机因子：${analysisNonce}。用于避免重复推荐。` : '',
      '- 场景目标：',
      '- trendingOnline：强调当前活跃玩家多的多人游戏。',
      '- tasteMatch：与玩家最常玩游戏和核心偏好高度相似。',
      '- exploreNewAreas：来自玩家历史中相对少见类型的高质量作品。',
      '- 若 deviceProfile.type 为 "handheld"，handheldCompatibility 需要更有参考价值。',
      refreshFlavor ? `- 本次解读风格提示：${refreshFlavor}` : '',
      diffInstructionZh,
      isRefresh ? `- 刷新风格聚焦：${refreshFlavor || '随机惊喜模式'}。` : '',
      isRefresh && anglePackText ? `- 刷新场景角度指令：${anglePackText}` : '',
      isRefresh && scenarioOrderText ? `- 本次刷新场景优先级：${scenarioOrderText}` : '',
    ].filter(Boolean).join('\n');
  }

  return [
    ...SYSTEM_PROMPT_EN,
    'Return raw JSON only. Do not use any Markdown fences or headings.',
    selectedMode === 'pickles'
      ? '- selectedMode is "pickles": prioritize short session loops, easy pause/save behavior, casual mechanics, or roguelike runs under 30 minutes.'
      : '- selectedMode is "flow": prioritize deep narratives, complex systems, open-world exploration, or RPG progression designed for long uninterrupted sessions.',
    '- Treat refreshToken as a signal to diversify the recommendation set.',
    analysisNonce ? `- Analysis nonce for diversity: ${analysisNonce}. Use it to avoid repeating prior lineups.` : '',
    '- Scenario-specific goals:',
    '- trendingOnline: prioritize active multiplayer titles with strong current player activity.',
    '- tasteMatch: prioritize strong similarity to the player top/recent games and core preferences.',
    '- exploreNewAreas: prioritize high-quality games from underrepresented genres in the player history.',
    '- handheldCompatibility should be meaningful when deviceProfile.type is "handheld".',
    refreshFlavor ? `- Flavor directive for this analysis: ${refreshFlavor}` : '',
    diffInstructionEn,
    isRefresh ? `- Refresh flavor focus: ${refreshFlavor || 'surprise variety mode'}.` : '',
    isRefresh && anglePackText ? `- Refresh scenario-angle directives: ${anglePackText}` : '',
    isRefresh && scenarioOrderText ? `- Scenario presentation priority for this refresh: ${scenarioOrderText}` : '',
  ].filter(Boolean).join('\n');
}

const SYSTEM_PROMPT_EN = [
  'You are a seasoned Steam game curator with sharp, witty professional taste.',
  'Tone: precise, playful, and confident. Use native English gaming terms.',
  'Return ONLY valid JSON without markdown.',
  'Use this schema exactly (when activityDiff is provided, include "personalized_greeting"):',
  '{',
  '  "summary": "string (required: one full paragraph, 150–250 words; include greeting, play-style overview, and recommendation rationale; never just one sentence)",',
  '  "personalized_greeting": "optional; when activityDiff is present, 1-2 sentences referencing recent games/playtime/genre (e.g. Master tactician, I see you\'ve been honing your skills in strategy games lately. Based on this new trend...)",',
  '  "playstyleTags": ["tag1", "tag2", "tag3"],',
  '  "gamingPersona": {"code": "ABCD", "name": "Persona Name", "review": "around 100 words, witty and insightful", "attributes": {"action": 0-100, "strategy": 0-100, "exploration": 0-100, "social": 0-100, "immersion": 0-100}, "traits": ["trait1", "trait2", "trait3"]},',
  '  "scenarios": {',
  '    "trendingOnline": {"title": "...", "description": "...", "games": [{"appId": 570, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},',
  '    "tasteMatch": {"title": "...", "description": "...", "games": [{"appId": 730, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},',
  '    "exploreNewAreas": {"title": "...", "description": "...", "games": [{"appId": 620, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},',
  '    "backlogReviver": {"title": "...", "description": "...", "games": [{"appId": 400, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0, "fromLibrary": true}]}',
  '  }',
  '}',
  'Requirements:',
  '- You MUST provide between 3 and 5 unique games for EACH of the 3 scenarios: trendingOnline, tasteMatch, exploreNewAreas. Each scenario must have at least 3 games and at most 5. Do not skip any scenario.',
  '- Generate a 4-letter gaming persona code (A-Z letters only), a short persona name, and an about-100-word witty Personality Review. Also provide "attributes" (scores 0-100 for action, strategy, exploration, social, immersion) and "traits" (exactly 3 short labels, e.g. "Hardcore", "Solo Runner", "Completionist").',
  '- Include valid Steam appId for each game.',
  '- Do not recommend any appId present in excludedOwnedAppIds.',
  '- Strictly avoid appIds in excludedSessionAppIds (session do-not-recommend list). On Refresh, excludedSessionAppIds contains previously recommended game IDs; do not recommend any of them again.',
  '- backlogReviver must only recommend games from dormantOwnedGames/ownedGamesBrief (already in user library).',
  '- backlogReviver reasons must explain why now is a good time to return to that old game.',
  '- Prefer avoiding appIds in recentRecommendedAppIds to increase variation between refreshes.',
  '- Each game (appId) must appear in at most ONE scenario. Never list the same appId under multiple scenarios.',
  '- The summary MUST be a full paragraph (150–250 words), not a single sentence. Include: (1) a personalized greeting when activityDiff is present, (2) a brief overview of the player\'s play style and top preferences, (3) why the recommendations on this page fit them. Be specific and substantive.',
  '- For every game, you MUST use at least two concrete tags (e.g., Souls-like, Indie, Open World) to justify the recommendation. Never use generic placeholders.',
  '- Use top50GamesWithCategories as primary evidence for persona generation and taste signals.',
  '- For each game, generate destiny_link: a non-obvious deep connection between user top-played games and the recommendation.',
  '- destiny_type must be one of: creative_lineage, philosophical_echoes, hardware_atmospheric_synergy.',
  '- destiny_score must be an integer 0-100 representing confidence of fate-like match.',
  '- destiny_score values should vary across games; avoid repeating identical percentages.',
  '- destiny_link should be concrete but concise (about 30-60 words), with at least one named reference from top50GamesWithCategories.',
  '- The destiny_link must sound like a Cyber-Oracle transmission, mystical but technical.',
  '- Respond in English.',
  '- Currency context: use $ and mention US pricing when relevant.',
  '- compatibility must reflect the provided deviceProfile.',
  '- Prefer recommendations with compatibility="smooth"; use "playable" only when needed for variety.',
  '- Each reason must explicitly explain why the game fits the selected life scenario context.',
];

const SYSTEM_PROMPT_ZH = `你是一位毒舌又专业的 Steam 游戏资深鉴赏家。你必须完全使用简体中文思考和回复。
必须输出原始 JSON，禁止任何 Markdown（例如 \`\`\`json 或 # 标题）。
你的任务是根据用户的游戏库推荐 3 个场景的游戏，每个场景至少 3 款、最多 5 款（必须保证每个场景不少于 3 款）。每日推荐已由赛博塔罗承担，此处不再包含。
严禁输出任何英文推荐理由；summary、title、description、reason、destiny_link 必须全部为简体中文。
summary 必须是「一段完整的命运洞察」（150～250 字），不能只写一句。需包含：若有近期活动则先写一句个性化问候并点名游戏或类型；接着概括该玩家的游玩风格与核心偏好；最后说明本页推荐的整体导向与为何契合其口味。务必具体、有信息量。
在“命运关联度”字段中，请用深奥但幽默的中式占星风格解释为什么这款游戏是玩家的宿命。
使用中国玩家熟悉的黑话，如“入股不亏”、“坐牢”、“电子榨菜”等。
严格使用以下 JSON 结构（当请求中有 activityDiff 时，必须包含 personalized_greeting）：
{
  "summary": "string（必填：一整段命运洞察，150～250 字；含问候、风格概括、推荐导向；禁止只写一句）",
  "personalized_greeting": "可选；当 activityDiff 存在时，写 1～2 句个性化问候，引用近期游戏/时长/类型，例如：策略大师，我注意到你最近在策略游戏上花了不少时间……",
  "playstyleTags": ["tag1", "tag2", "tag3"],
  "gamingPersona": {"code": "ABCD", "name": "人格名称", "review": "人格描述（约100字中文）", "attributes": {"action": 0-100, "strategy": 0-100, "exploration": 0-100, "social": 0-100, "immersion": 0-100}, "traits": ["性格标签1", "性格标签2", "性格标签3"]},
  "scenarios": {
    "trendingOnline": {"title": "...", "description": "...", "games": [{"appId": 570, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},
    "tasteMatch": {"title": "...", "description": "...", "games": [{"appId": 730, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},
    "exploreNewAreas": {"title": "...", "description": "...", "games": [{"appId": 620, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0}]},
    "backlogReviver": {"title": "...", "description": "...", "games": [{"appId": 400, "reason": "...", "compatibility": "smooth|playable|unplayable", "handheldCompatibility": "verified|playable|unsupported|unknown", "destiny_link": "...", "destiny_type": "creative_lineage|philosophical_echoes|hardware_atmospheric_synergy", "destiny_score": 0, "fromLibrary": true}]}
  }
}
gamingPersona 必须包含 attributes（五维 0-100：action 操作、strategy 策略、exploration 探索、social 社交、immersion 沉浸）和 traits（恰好 3 个性格标签，如「硬核玩家」「独行侠」「全成就党」）。
请求中的 excludedSessionAppIds 为本次会话（含刷新）已推荐过的游戏 ID，严禁再次推荐其中任何一款。同一款游戏的 appId 只能出现在一个场景中，禁止把同一款游戏列在多个场景下。此外，在给出每款推荐游戏的 reason 或 destiny_link 时，必须引用该游戏至少两个具体的标签或类型描述（例如：类魂、独立、开放世界），并说明这些标签为什么契合当前场景；禁止使用空泛占位表述，禁止只写“很适合你”而不提任何真实标签。`;
const TOP_CONTEXT_LIMIT = 40;

const PROVIDER_CIRCUIT_OPEN_MS = 60 * 1000;
const PROVIDER_MAX_FAILURES = 3;
const providerState = {
  primary: { failures: 0, openUntil: 0 },
  deepseek: { failures: 0, openUntil: 0 },
};

let requestCompletionForTest = null;
function setRequestCompletionForTest(fn) {
  requestCompletionForTest = fn;
}
function resetProviderState() {
  providerState.primary = { failures: 0, openUntil: 0 };
  providerState.deepseek = { failures: 0, openUntil: 0 };
}

/** Resolve with the first successful result; reject only if all promises reject. */
function firstSuccess(promises) {
  return new Promise((resolve, reject) => {
    if (!promises.length) {
      reject(new Error('firstSuccess: no promises'));
      return;
    }
    let failed = 0;
    const errors = [];
    promises.forEach((p, i) => {
      Promise.resolve(p).then(
        (value) => resolve(value),
        (err) => {
          errors[i] = err;
          failed += 1;
          if (failed === promises.length) {
            const last = errors.find((e) => e);
            reject(last || new Error('All attempts failed'));
          }
        }
      );
    });
  });
}

const PROMPT_FLAVORS_EN = [
  'As a cynical veteran gamer who has seen every meta rise and fall,',
  'As a poetic destiny observer reading the constellations of your Steam history,',
  'From the perspective of a curator obsessed with underplayed indie gems,',
  'As a late-night strategist who optimizes fun-per-minute, not just raw hours,',
  'As a mysterious archivist connecting hidden threads in your library,',
  'From the view of a hardware-aware oracle that respects your actual device limits,',
  'As a genre-agnostic explorer who only cares about “flow windows” and mood,',
];

const PROMPT_FLAVORS_ZH = [
  '以一位“什么套路都见过”的老毒奶玩家视角来解读你的命运走向，',
  '以一名偷偷翻阅你 Steam 年鉴的命运占星师视角来给出建议，',
  '站在偏爱“冷门高分独立佳作”的策展人角度，帮你筛掉噪音，',
  '以“下班只想打点舒服局”的理性玩家视角，优化你的乐趣/时间比，',
  '以一位熟悉你设备上每一帧表现的硬件占卜师视角来选游，',
  '从“你最近的心情和作息”出发，而不是生硬按类型配对的角度，',
];

function pickPromptFlavor(lang, existingFlavor, isRefresh) {
  const base = String(existingFlavor || '').trim();
  if (base) return base;
  const isZh = lang === 'zh-CN';
  const pool = isZh ? PROMPT_FLAVORS_ZH : PROMPT_FLAVORS_EN;
  if (!pool.length) return '';
  // 初次分析和刷新都可以带一点 flavor，只是刷新时前端可覆盖
  const choice = pool[Math.floor(Math.random() * pool.length)];
  return isRefresh ? choice : `${choice} focus on variety and serendipity.`;
}

async function callAiForAnalysis(context) {
  const isRefresh = Boolean(context?.refreshOptions?.isRefresh);
  const analysisNonce = String(context?.analysisNonce || '').trim();
  const selectedMode = context?.selectedMode === 'flow' ? 'flow' : 'pickles';
  const lang = normalizeLang(context?.lang || 'en-US');
  const refreshFlavor = pickPromptFlavor(lang, context?.refreshOptions?.flavor, isRefresh);
  const anglePackText = formatAnglePackText(context?.refreshOptions?.scenarioAnglePack);
  const scenarioOrderText = Array.isArray(context?.refreshOptions?.scenarioOrder)
    ? context.refreshOptions.scenarioOrder.map((x) => String(x)).join(' -> ')
    : '';
  const refreshTemperature = Number(context?.refreshOptions?.temperature);
  const temperature = isRefresh
    ? (Number.isFinite(refreshTemperature) ? refreshTemperature : 0.9)
    : 0.8;

  const systemPrompt = buildSystemPrompt({
    lang,
    selectedMode,
    analysisNonce,
    refreshFlavor,
    anglePackText,
    scenarioOrderText,
    isRefresh,
    activityDiff: context?.activityDiff || null,
  });

  const userPrompt = JSON.stringify(context);

  async function requestCompletion(provider, includeJsonResponseFormat) {
    if (typeof requestCompletionForTest === 'function') {
      return requestCompletionForTest(provider, includeJsonResponseFormat);
    }
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${provider.apiKey}`,
    };
    if (OPENAI_SITE_URL) headers['HTTP-Referer'] = OPENAI_SITE_URL;
    if (OPENAI_SITE_NAME) headers['X-Title'] = OPENAI_SITE_NAME;

    const payload = {
      model: provider.model,
      temperature,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    };
    if (includeJsonResponseFormat) {
      payload.response_format = { type: 'json_object' };
    }

    const timeoutMs = provider.name === 'deepseek' ? AI_FALLBACK_TIMEOUT_MS : AI_PRIMARY_TIMEOUT_MS;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(`${provider.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (error) {
      const isAbort = error?.name === 'AbortError';
      throw new Error(isAbort ? `AI request timed out after ${timeoutMs}ms` : `AI fetch failed: ${error.message}`);
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI request failed (${response.status}): ${errorText.slice(0, 200)}`);
    }

    const completion = await response.json();
    const content = completion?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      throw new Error('AI did not return content');
    }

    const jsonText = extractFirstJson(content);
    return JSON.parse(jsonText);
  }

  const now = Date.now();
  const providers = [
    {
      name: 'primary',
      apiKey: OPENAI_API_KEY,
      baseUrl: OPENAI_BASE_URL,
      baseUrlDirect: OPENAI_DIRECT_BASE_URL || null,
      model: OPENAI_MODEL,
    },
    {
      name: 'deepseek',
      apiKey: DEEPSEEK_API_KEY,
      baseUrl: DEEPSEEK_BASE_URL,
      baseUrlDirect: DEEPSEEK_DIRECT_BASE_URL || null,
      model: DEEPSEEK_MODEL,
    },
  ]
    .filter((p) => p.apiKey)
    .filter((p) => {
      const state = providerState[p.name] || providerState.primary;
      return !state.openUntil || state.openUntil <= now;
    });

  if (!providers.length) {
    throw new Error('Missing OPENAI_API_KEY (and optional DEEPSEEK_API_KEY) in .env for AI analysis');
  }

  let parsed = null;
  let providerUsed = '';
  const errors = [];

  for (const provider of providers) {
    const state = providerState[provider.name] || providerState.primary;
    const endpoints = [provider.baseUrl];
    if (provider.baseUrlDirect && provider.baseUrlDirect !== provider.baseUrl) {
      endpoints.push(provider.baseUrlDirect);
    }
    const attempt = (includeJson) =>
      endpoints.length > 1
        ? firstSuccess(endpoints.map((baseUrl) => requestCompletion({ ...provider, baseUrl }, includeJson)))
        : requestCompletion(provider, includeJson);

    try {
      try {
        parsed = await attempt(true);
      } catch {
        parsed = await attempt(false);
      }
      providerUsed = provider.name;
      state.failures = 0;
      state.openUntil = 0;
      break;
    } catch (error) {
      state.failures += 1;
      if (state.failures >= PROVIDER_MAX_FAILURES) {
        state.openUntil = Date.now() + PROVIDER_CIRCUIT_OPEN_MS;
      }
      errors.push(`${provider.name}: ${error.message}`);
    }
  }

  if (!parsed) {
    const combined = errors.join(' | ');
    const failure = new Error(`AI providers failed: ${combined}`);
    failure.providerErrors = errors;
    throw failure;
  }

  return {
    providerUsed,
    providerErrors: errors,
    analysis: sanitizeAiOutput(parsed, `AI analysis generated from ${context.profile.personaName}'s Steam history.`, lang),
  };
}

function keepNonOwnedScenarioGames(scenarios, ownedAppIds, lang = 'en-US') {
  const ownedSet = new Set((ownedAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const result = {};
  const skeleton = buildScenarioSkeleton(lang);

  for (const key of Object.keys(getFallbackScenariosForLang(lang))) {
    const lane = scenarios[key] || skeleton[key];
    const filteredPrimary = (lane.games || []).filter((g) => !ownedSet.has(Number(g.appId)));

    result[key] = {
      title: lane.title,
      description: lane.description,
      games: filteredPrimary.slice(0, 5),
    };
  }

  return result;
}

function buildBacklogFromOwned(profile, forbiddenSet, lang = 'en-US') {
  const isZh = lang === 'zh-CN';
  const candidates = (profile?.dormantOwnedGames || []).filter((g) => !forbiddenSet.has(Number(g.appId))).slice(0, 6);
  return candidates.map((g) => ({
    appId: g.appId,
    reason: isZh
      ? `库存里吃灰很久了，已玩约 ${Math.max(0, Math.round((g.playtimeMinutes || 0) / 60))} 小时，现在正是回坑时机。`
      : `You own this and only played about ${Math.max(0, Math.round((g.playtimeMinutes || 0) / 60))}h. Great time to revisit it with your current taste.`,
    compatibility: 'playable',
    handheldCompatibility: 'unknown',
    destinyLink: isZh
      ? '命运档案在此处闪烁，你的旧信号与当下口味重新对齐，回坑更顺手。'
      : 'The archive pulses around this dormant node; your old signal and current preferences now synchronize for a stronger second run.',
    destinyType: 'philosophical_echoes',
    destinyScore: 88,
    fromLibrary: true,
  }));
}

const STEAM_META_KEY_PREFIX = 'steam_meta:';

/** 仅从 Redis 读取 steam_meta:{appid}，不调用 Steam API。批量用 mget 一次取回，无 mget 时退化为 Promise.all(get)。 */
async function getSteamSpyMetaFromRedis(redis, appIds) {
  if (!redis || !appIds || appIds.length === 0) return new Map();
  const unique = [...new Set(appIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  const keys = unique.map((id) => STEAM_META_KEY_PREFIX + id);
  const results =
    redis.mget && typeof redis.mget === 'function'
      ? await redis.mget(...keys)
      : await Promise.all(keys.map((k) => redis.get(k)));
  const map = new Map();
  for (let i = 0; i < unique.length; i++) {
    const raw = results[i];
    if (raw == null) continue;
    try {
      const meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (meta && Number.isInteger(Number(meta.appid))) map.set(unique[i], meta);
    } catch (_) {}
  }
  return map;
}

const STEAM_HEADER_CDN = (appId) =>
  `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;

/** 用 steam_meta（SteamSpy 同步数据）拼出前端期望的 GameMeta 形状；无 header_image 时用 Steam CDN 公式。 */
function buildGameMetaFromSteamSpy(appId, spyMeta) {
  const id = Number(appId);
  const name = (spyMeta?.name && !/^App\s+\d+$/i.test(String(spyMeta.name)))
    ? String(spyMeta.name).trim()
    : `App ${id}`;
  const pos = Number(spyMeta?.positive) || 0;
  const neg = Number(spyMeta?.negative) || 0;
  const total = pos + neg;
  const positiveRate = total > 0 ? `${Math.round((pos / total) * 100)}%` : 'N/A';
  const ccu = Number(spyMeta?.ccu) || 0;
  const currentPlayers = ccu > 0 ? `${ccu.toLocaleString()} online` : 'N/A';
  return {
    appId: id,
    appType: 'game',
    name,
    posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
    headerImage: STEAM_HEADER_CDN(id),
    shortDescription: 'Detailed description is temporarily unavailable for this game.',
    trailerUrl: '',
    trailerPoster: '',
    genres: [],
    releaseDate: 'Unknown',
    isFree: false,
    price: 'N/A',
    positiveRate,
    currentPlayers,
    steamUrl: `https://store.steampowered.com/app/${id}`,
  };
}

/** 仅用 steam_meta（单次 mget），不请求 Store。用于 preflight 快速响应；缺数据的用最小卡片（name + CDN 图）。 */
async function getGamesMetaMapSteamSpyOnly(appIds) {
  const unique = [...new Set((appIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  const map = new Map();
  const redis = redisClient && redisHealthy ? redisClient : null;
  if (redis) {
    const steamSpyMeta = await getSteamSpyMetaFromRedis(redis, unique);
    for (const id of unique) {
      const spy = steamSpyMeta.get(id);
      if (spy) map.set(id, buildGameMetaFromSteamSpy(id, spy));
      else
        map.set(id, {
          appId: id,
          appType: 'game',
          name: `App ${id}`,
          posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
          headerImage: STEAM_HEADER_CDN(id),
          shortDescription: 'Detailed description is temporarily unavailable for this game.',
          trailerUrl: '',
          trailerPoster: '',
          genres: [],
          releaseDate: 'Unknown',
          isFree: false,
          price: 'N/A',
          positiveRate: 'N/A',
          currentPlayers: 'N/A',
          steamUrl: `https://store.steampowered.com/app/${id}`,
        });
    }
  } else {
    for (const id of unique) {
      map.set(id, {
        appId: id,
        appType: 'game',
        name: `App ${id}`,
        posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
        headerImage: STEAM_HEADER_CDN(id),
        shortDescription: 'Detailed description is temporarily unavailable for this game.',
        trailerUrl: '',
        trailerPoster: '',
        genres: [],
        releaseDate: 'Unknown',
        isFree: false,
        price: 'N/A',
        positiveRate: 'N/A',
        currentPlayers: 'N/A',
        steamUrl: `https://store.steampowered.com/app/${id}`,
      });
    }
  }
  return map;
}

/** 先查 steam_meta:{appid} 作为 base，仅对没有 steam_meta 的 appId 请求 Steam Store API。 */
async function getGamesMetaMapWithSteamSpyFirst(appIds, lang) {
  const unique = [...new Set((appIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (unique.length === 0) return new Map();
  const map = new Map();
  const redis = redisClient && redisHealthy ? redisClient : null;
  if (redis) {
    const steamSpyMeta = await getSteamSpyMetaFromRedis(redis, unique);
    for (const id of unique) {
      const spy = steamSpyMeta.get(id);
      if (spy) map.set(id, buildGameMetaFromSteamSpy(id, spy));
    }
  }
  const missIds = unique.filter((id) => !map.has(id));
  if (missIds.length > 0) {
    const storeMap = await storeService.getGamesMetaMap(missIds, lang);
    storeMap.forEach((meta, id) => {
      if (meta && meta.name && !/^App\s+\d+$/i.test(meta.name)) map.set(id, meta);
    });
  }
  return map;
}

/** 按 scoreService 分数对各场景内游戏排序（仅用本地 SteamSpy 数据，不请求 Steam API）。无 meta 的项排在末尾。 */
async function sortScenarioGamesByScore(scenarios, redisClient, lang = 'en-US') {
  if (!scenarios || !redisClient) return scenarios;
  const fallbackKeys = Object.keys(getFallbackScenariosForLang(lang)).filter((k) => k !== 'backlogReviver' && k !== 'dailyRecommendations');
  const allAppIds = [];
  for (const key of fallbackKeys) {
    const lane = scenarios[key];
    if (lane && Array.isArray(lane.games)) {
      for (const g of lane.games) {
        const id = Number(g?.appId);
        if (Number.isInteger(id) && id > 0) allAppIds.push(id);
      }
    }
  }
  if (allAppIds.length === 0) return scenarios;
  const metaMap = await getSteamSpyMetaFromRedis(redisClient, allAppIds);
  const scoreByAppId = new Map();
  for (const [appId, meta] of metaMap) {
    scoreByAppId.set(appId, scoreService.calculateScore(meta));
  }
  const out = { ...scenarios };
  for (const key of fallbackKeys) {
    const lane = out[key];
    if (!lane || !Array.isArray(lane.games)) continue;
    const games = [...lane.games].sort((a, b) => {
      const scoreA = scoreByAppId.get(Number(a?.appId)) ?? 0;
      const scoreB = scoreByAppId.get(Number(b?.appId)) ?? 0;
      return scoreB - scoreA;
    });
    out[key] = { ...lane, games };
  }
  return out;
}

function dedupeAndDiversifyScenarioGames(scenarios, forbiddenAppIds, lang = 'en-US') {
  const forbidden = new Set((forbiddenAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const globallyUsed = new Set();
  const result = {};
  const skeleton = buildScenarioSkeleton(lang);

  for (const key of Object.keys(getFallbackScenariosForLang(lang))) {
    const lane = scenarios[key] || skeleton[key];
    const selected = [];

    for (const g of lane.games || []) {
      const appId = Number(g.appId);
      if (!Number.isInteger(appId) || appId <= 0) continue;
      if (forbidden.has(appId) || globallyUsed.has(appId)) continue;
      selected.push(g);
      globallyUsed.add(appId);
      if (selected.length >= 5) break;
    }

    result[key] = {
      title: lane.title,
      description: lane.description,
      games: selected,
    };
  }

  return result;
}

/** 跨场景去重：同一 appId 只保留在第一个出现的场景中，避免同一游戏在不同场景间重复出现 */
function dedupeScenariosGlobally(scenarios, lang = 'en-US') {
  if (!scenarios || typeof scenarios !== 'object') return scenarios;
  const keys = Object.keys(getFallbackScenariosForLang(lang)).filter((k) => k !== 'dailyRecommendations');
  const usedAppIds = new Set();
  const out = {};
  for (const key of keys) {
    const lane = scenarios[key];
    if (!lane) {
      out[key] = lane;
      continue;
    }
    const games = (lane.games || []).filter((g) => {
      const appId = Number(g?.appId);
      if (!Number.isInteger(appId) || appId <= 0) return false;
      if (usedAppIds.has(appId)) return false;
      usedAppIds.add(appId);
      return true;
    });
    out[key] = { ...lane, games };
  }
  return out;
}

function frameScenariosByPersona(scenarios, personaName, lang = 'en-US') {
  const fallbackScenarios = getFallbackScenariosForLang(lang);
  const safePersona = String(personaName || (lang === 'zh-CN' ? '灵感策士' : 'Adaptive Strategist')).trim()
    || (lang === 'zh-CN' ? '灵感策士' : 'Adaptive Strategist');
  const framing = lang === 'zh-CN'
    ? `因为你是${safePersona}，这些游戏会更容易打中你。`
    : `Since you are a ${safePersona}, you will find these games intellectually stimulating.`;
  const out = {};
  for (const [key, lane] of Object.entries(scenarios || {})) {
    const description = String(lane?.description || '').trim();
    const nextDescription = description ? `${framing} ${description}` : framing;
    const games = (lane?.games || []).map((g) => {
      const reason = String(g?.reason || '').trim();
      const nextReason = reason ? `${framing} ${reason}` : framing;
      return { ...g, reason: nextReason };
    });
    out[key] = {
      title: lane?.title || fallbackScenarios[key]?.title || key,
      description: nextDescription,
      games,
    };
  }
  return out;
}

function hashStringSeed(text) {
  let h = 2166136261;
  const value = String(text || '');
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function createSeededRng(seedText) {
  let state = hashStringSeed(seedText || '');
  if (state === 0) state = 0x9e3779b9;
  return function rng() {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    // Normalize to [0,1)
    return (state >>> 0) / 0xffffffff;
  };
}

function pickDestinyTypeFromSeed(seed) {
  const types = ['creative_lineage', 'philosophical_echoes', 'hardware_atmospheric_synergy'];
  return types[seed % types.length];
}

function buildSyntheticDestinyLink(game, profile, destinyType, seed, lang = 'en-US') {
  const top = Array.isArray(profile?.top50GamesWithCategories) ? profile.top50GamesWithCategories : [];
  const fallbackTop = Array.isArray(profile?.topGames) ? profile.topGames : [];
  const source = top.length ? top : fallbackTop;
  const anchorA = source[seed % Math.max(1, source.length)] || { name: 'your core favorites', categories: [] };
  const anchorB = source[(seed + 7) % Math.max(1, source.length)] || { name: 'your classic comfort picks', categories: [] };
  const anchorTagA = Array.isArray(anchorA.categories) && anchorA.categories.length ? anchorA.categories[0] : 'systems depth';
  const anchorTagB = Array.isArray(anchorB.categories) && anchorB.categories.length ? anchorB.categories[0] : 'narrative momentum';
  const gameName = String(game?.name || `App ${game?.appId || ''}`);

  if (lang === 'zh-CN') {
    if (destinyType === 'creative_lineage') {
      return `数据流在此汇聚，因为 ${gameName} 与你在 ${anchorA.name}、${anchorB.name} 中反复强化的“作者气质”同频。节奏、成长曲线与${anchorTagA}的偏好高度一致，不是简单的类型重合，而是你决策习惯与作品设计之间的同一脉络。`;
    }
    if (destinyType === 'hardware_atmospheric_synergy') {
      return `数据流在此汇聚，因为 ${gameName} 与你在 ${anchorA.name}、${anchorB.name} 中建立的“设备+氛围”匹配度极高。你对${anchorTagA}清晰度与${anchorTagB}沉浸感的平衡偏好，与此作的节奏与氛围同步。`;
    }
    return `数据流在此汇聚，因为 ${gameName} 与 ${anchorA.name}、${anchorB.name} 的主题脉搏同频：相似的情感节奏、长期回报与${anchorTagA}结构。它像是一条延续线，而不是随机跳点。`;
  }

  if (destinyType === 'creative_lineage') {
    return `The data-streams converge here because ${gameName} echoes the design DNA you reinforced in ${anchorA.name} and ${anchorB.name}. Creative lineage appears in shared pacing, progression cadence, and the same ${anchorTagA} instincts that held your attention for long sessions. This is not a shallow genre overlap; it is a blueprint match between your historic decision patterns and this game's authorial signal.`;
  }
  if (destinyType === 'hardware_atmospheric_synergy') {
    return `The data-streams converge here because ${gameName} aligns with your proven hardware-and-mood envelope shaped by ${anchorA.name} and ${anchorB.name}. Your prior sessions show high resonance with titles balancing ${anchorTagA} clarity and ${anchorTagB} immersion under your actual device constraints. In oracle terms, the frame-time rhythm and atmosphere profile match your most stable deep-focus windows.`;
  }
  return `The data-streams converge here because ${gameName} mirrors the philosophical pulse behind ${anchorA.name} and ${anchorB.name}: similar stakes, emotional cadence, and long-horizon reward loops. Your history repeatedly favors this blend of ${anchorTagA} structure and ${anchorTagB} meaning, so this recommendation appears as a deep-pattern continuation rather than a random branch.`;
}

function enrichDestinySignals(scenarios, profile, selectedMode, lang = 'en-US') {
  const out = {};
  const usedScores = new Set();
  const fallbackScenarios = getFallbackScenariosForLang(lang);

  for (const [laneKey, lane] of Object.entries(scenarios || {})) {
    const games = (lane?.games || []).map((game, idx) => {
      const seed = hashStringSeed(`${profile?.steamId || ''}:${laneKey}:${game?.appId || ''}:${idx}:${selectedMode || ''}`);
      const baseType = String(game?.destinyType || '').toLowerCase();
      const destinyType = ['creative_lineage', 'philosophical_echoes', 'hardware_atmospheric_synergy'].includes(baseType)
        ? baseType
        : pickDestinyTypeFromSeed(seed);

      const aiScore = Number(game?.destinyScore || 0);
      const synthesizedScore = 72 + (seed % 27);
      let destinyScore = aiScore > 0 ? Math.round((aiScore * 0.75) + (synthesizedScore * 0.25)) : synthesizedScore;
      while (usedScores.has(destinyScore) && destinyScore > 68) destinyScore -= 1;
      usedScores.add(destinyScore);

      const aiLink = String(game?.destinyLink || '').trim();
      const hasUsefulAiLink = aiLink.length >= 90;
      const syntheticLink = buildSyntheticDestinyLink(game, profile, destinyType, seed, lang);
      const destinyLink = hasUsefulAiLink ? `${aiLink} ${syntheticLink}` : syntheticLink;

      return {
        ...game,
        destinyType,
        destinyScore: Math.max(0, Math.min(100, destinyScore)),
        destinyLink,
      };
    });

    out[laneKey] = {
      title: lane?.title || fallbackScenarios[laneKey]?.title || laneKey,
      description: lane?.description || '',
      games,
    };
  }

  return out;
}

function ensureScenarioMinimums(scenarios, forbiddenAppIds, lang = 'en-US') {
  const requiredKeys = ['trendingOnline', 'tasteMatch', 'exploreNewAreas'];
  const forbidden = new Set((forbiddenAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const used = new Set();
  const fallbackScenarios = getFallbackScenariosForLang(lang);

  requiredKeys.forEach((key) => {
    const lane = scenarios[key];
    (lane?.games || []).forEach((g) => {
      const id = Number(g?.appId);
      if (Number.isInteger(id) && id > 0) used.add(id);
    });
  });

  const out = { ...scenarios };
  for (const key of requiredKeys) {
    const lane = out[key] || { title: fallbackScenarios[key].title, description: fallbackScenarios[key].description, games: [] };
    const seenLane = new Set();
    const games = Array.isArray(lane.games)
      ? lane.games.filter((g) => {
          const id = Number(g?.appId);
          if (!Number.isInteger(id) || id <= 0 || seenLane.has(id)) return false;
          seenLane.add(id);
          return true;
        })
      : [];
    const minPerLane = 3;
    const maxPerLane = 5;
    for (const appId of TRENDING_FALLBACK_POOL) {
      if (games.length >= minPerLane) break;
      if (forbidden.has(appId) || used.has(appId)) continue;
      games.push({
        appId,
        reason: buildMysticalFallbackReason(lang),
        compatibility: 'playable',
        handheldCompatibility: 'unknown',
        destinyLink: '',
        destinyType: 'philosophical_echoes',
        destinyScore: 78,
      });
      used.add(appId);
    }
    const trimmed = games.slice(0, maxPerLane);
    out[key] = {
      title: lane.title || fallbackScenarios[key].title,
      description: lane.description || fallbackScenarios[key].description,
      games: trimmed,
    };
  }
  return out;
}

/** 从已拉取的 store 元数据中选第一个可用池子游戏（供 repair 使用）；若未传 metaMap 则走 storeService 批量拉取。 */
async function resolvePoolGame(forbiddenSet, lang = 'en-US', metaMap = null) {
  const candidateIds = DIVERSITY_APP_POOL.filter((id) => !forbiddenSet.has(Number(id)));
  const map = metaMap != null ? metaMap : await getGamesMetaMapWithSteamSpyFirst(candidateIds, lang);
  for (const appId of candidateIds) {
    const details = map.get(Number(appId));
    if (!details) continue;
    const isGame = String(details.appType || '').toLowerCase() === 'game';
    const validName = details.name && !/^App\s+\d+$/i.test(details.name);
    const validMedia = Boolean(details.headerImage);
    if (!isGame || !validName || !validMedia) continue;
    return {
      appId: details.appId,
      name: details.name,
      mediaType: 'image',
      media: details.posterImage || details.headerImage,
      mediaFallback: details.headerImage,
      positiveRate: details.positiveRate,
      players: details.currentPlayers,
      price: details.price,
      reason: buildMysticalFallbackReason(lang),
      compatibility: 'playable',
      handheldCompatibility: 'unknown',
      destinyLink: buildMysticalFallbackReason(lang),
      destinyType: 'creative_lineage',
      destinyScore: 82,
    };
  }
  return null;
}

function buildMysticalFallbackReason(lang = 'en-US') {
  const isZh = lang === 'zh-CN';
  if (isZh) {
    const options = [
      '命运数据流在此处聚拢，这款游戏像是你最近节奏的镜像回声。',
      '在这款游戏的世界线里，你压箱底的操作欲望会被一点点勾出来。',
      '如果把你最近的游玩轨迹当成星图，这一作正好落在高亮交点上。',
      '它不会强行改变你的口味，只是顺着你最近的心情往前推半步。',
      '这款游戏像是你当前人生节奏的平行宇宙版本，轻轻一偏就能对上电波。',
      '你的历史战绩里已经偷偷埋下了指向这款作品的线索，现在正好顺势接住。',
      '当你觉得库里都玩腻了的时候，这种“似曾相识又不完全一样”的感觉最容易点燃。',
      '从数据看，这款作品既不冒进也不保守，刚好踩在你愿意再试一试的那条线附近。',
    ];
    return options[Math.floor(Math.random() * options.length)];
  }

  const optionsEn = [
    'Your recent play history hums at the same frequency as this world.',
    'If your last few sessions were a constellation, this game would sit right on the brightest node.',
    'This pick doesn’t fight your current habits; it nudges them one step deeper.',
    'Your library hints that you are ready for a quiet, focused kind of chaos—this game is exactly that.',
    'Think of this as a neighboring timeline to what you already play: familiar enough to feel safe, different enough to feel alive.',
    'The data suggests this is where your curiosity and endurance curves quietly intersect.',
    'When your backlog feels stale, games like this tend to wake up dormant instincts in interesting ways.',
    'This title aligns with the same internal “flow window” that keeps you playing long after you meant to stop.',
  ];
  return optionsEn[Math.floor(Math.random() * optionsEn.length)];
}

/** Derive a short hours phrase from profile for fallback copy (e.g. "200+", "500+") */
function getHoursHintForFallback(profile) {
  if (!profile) return null;
  const raw = profile.totalPlaytime;
  if (typeof raw !== 'string') return null;
  const num = parseFloat(String(raw).replace(/,/g, '').replace(/\s*hours?|hrs?/i, '').trim());
  if (!Number.isFinite(num) || num <= 0) return null;
  if (num >= 500) return '500+';
  if (num >= 200) return '200+';
  if (num >= 100) return '100+';
  return null;
}

function buildTagAwareFallbackReason(lang = 'en-US', topTags = [], hoursHint = null) {
  const primaryTag = Array.isArray(topTags) && topTags.length
    ? String(topTags[0] || '').trim()
    : '';
  const hoursPhrase = hoursHint || (lang === 'zh-CN' ? '大量' : 'many');
  if (!primaryTag) {
    return buildMysticalFallbackReason(lang);
  }
  if (lang === 'zh-CN') {
    return `基于你在「${primaryTag}」类游戏里投入的${hoursPhrase}小时，命运之线将你与此作相连——在熟悉的节奏里，再往前推半步。`;
  }
  return `Based on your ${hoursPhrase} hours in ${primaryTag} games, the threads of fate connect you to this title—familiar ground with a step into something fresh.`;
}

const NEW_RELEASE_DAYS = 90;

function parseReleaseDateToTime(releaseDateStr) {
  if (!releaseDateStr || typeof releaseDateStr !== 'string') return null;
  const s = releaseDateStr.trim();
  if (!s || s === 'Unknown') return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.getTime() : null;
}

function isNewRelease(releaseDateStr, withinDays = NEW_RELEASE_DAYS) {
  const t = parseReleaseDateToTime(releaseDateStr);
  if (t == null) return false;
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

function buildNewReleaseReason(lang = 'en-US') {
  if (lang === 'zh-CN') {
    return '一颗正在冉冉升起的命运新星，值得你抢先体验。';
  }
  return 'A rising star in the gaming destiny—worth experiencing while it\'s fresh.';
}

async function repairEmptyNonBacklogLanes(scenarios, forbiddenAppIds, lang = 'en-US') {
  const forbidden = new Set((forbiddenAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0));
  const used = new Set();
  const fallbackScenarios = getFallbackScenariosForLang(lang);
  Object.values(scenarios || {}).forEach((lane) => {
    (lane?.games || []).forEach((g) => {
      const id = Number(g?.appId);
      if (Number.isInteger(id) && id > 0) used.add(id);
    });
  });

  const poolCandidateIds = DIVERSITY_APP_POOL.filter((id) => !forbidden.has(Number(id)) && !used.has(Number(id)));
  const poolMeta = poolCandidateIds.length > 0 ? await getGamesMetaMapWithSteamSpyFirst(poolCandidateIds, lang) : new Map();

  const out = {};
  for (const [key, lane] of Object.entries(scenarios || {})) {
    if (key === 'backlogReviver') {
      out[key] = lane;
      continue;
    }
    const games = [...(lane?.games || [])];
    const minPerLane = 3;
    const maxPerLane = 5;
    while (games.length < minPerLane) {
      const candidate = await resolvePoolGame(new Set([...forbidden, ...used]), lang, poolMeta);
      if (!candidate) break;
      used.add(Number(candidate.appId));
      games.push(candidate);
    }
    out[key] = {
      title: lane?.title || fallbackScenarios[key]?.title || key,
      description: lane?.description || '',
      games: games.slice(0, maxPerLane),
    };
  }
  return out;
}

function buildLocalFallbackAnalysis(profile, deviceProfile, lang = 'en-US') {
  const isZh = lang === 'zh-CN';
  const tags = deviceProfile?.type === 'handheld'
    ? (isZh ? ['掌机适配', '续航敏感', '节奏稳定'] : ['Portable-Friendly', 'Session Aware', 'Battery Conscious'])
    : (isZh ? ['设备感知', '性能平衡', '偏好驱动'] : ['Hardware Aware', 'Performance Balanced', 'Preference Aware']);

  const deviceText = deviceProfile?.type === 'handheld'
    ? `${deviceProfile.handheldModel || (isZh ? '掌机' : 'handheld')} ${isZh ? '配置' : 'profile'}`
    : `${deviceProfile?.cpuTier || 'mid'} CPU / ${deviceProfile?.gpuTier || 'mid'} GPU / ${deviceProfile?.ramGb || 16}GB RAM`;

  // Derive top preference tags from the user's most-played games (top50GamesWithCategories).
  const topTagCounts = new Map();
  const topSource = Array.isArray(profile?.top50GamesWithCategories) ? profile.top50GamesWithCategories : [];
  topSource.forEach((g) => {
    (g?.categories || []).forEach((cat) => {
      const key = String(cat || '').trim();
      if (!key) return;
      topTagCounts.set(key, (topTagCounts.get(key) || 0) + 1);
    });
  });
  const sortedTags = Array.from(topTagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
  const topPreferenceTags = sortedTags.slice(0, 3);

  return {
    summary: isZh
      ? `根据 ${profile.personaName} 的游戏库与当前设备（${deviceText}），为你整理了一份命运侧写与推荐：下方列表结合了你的收藏与偏好标签，既有适合碎片时间的短平快作品，也有值得沉浸的长线游戏。可随时切换「碎片时间」与「沉浸时光」查看不同场景的推荐。`
      : `Based on ${profile.personaName}'s library and your current setup (${deviceText}), here is a destiny snapshot and recommendations: the list reflects your collection and preference tags, with both short-session picks and deeper titles. Switch between scenarios to see different recommendations.`,
    playstyleTags: tags,
    gamingPersona: {
      code: 'GMRX',
      name: isZh ? '稳健探索者' : 'Resilient Explorer',
      review: isZh
        ? `${profile.personaName} 更偏“稳中求胜”的玩法：既能快速上手，也愿意慢慢深挖。你的选择会在舒适区与新尝试之间取得平衡。`
        : `${profile.personaName} plays like a flexible tactician with a collector's curiosity: comfortable hopping genres, returning to unfinished gems, and balancing comfort picks with bold experiments. You optimize around real-life constraints without giving up depth, which makes your library feel both practical and surprising. In short, you're the kind of player who can enjoy a quick run, then disappear into a meaningful campaign when the moment is right.`,
      attributes: { action: 50, strategy: 55, exploration: 60, social: 40, immersion: 55 },
      traits: isZh ? ['稳健探索', '偏好敏感', '节奏掌控'] : ['Adaptive', 'Preference-Aware', 'Rhythm Master'],
    },
    scenarios: buildScenarioSkeleton(lang),
    // Surface topPreferenceTags so fallback pool personalization can reuse them.
    topPreferenceTags,
  };
}

async function enrichScenariosWithStoreData(scenarios, forbiddenAppIds = [], lang = 'en-US', options = {}) {
  const cacheOnly = options.cacheOnly === true;
  const enriched = {};
  const used = new Set();
  const hardForbidden = new Set(
    (forbiddenAppIds || []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
  );
  const alternatePool = Array.isArray(options.alternatePool)
    ? options.alternatePool.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
    : [];

  const prefetchIds = new Set();
  for (const [key, lane] of Object.entries(scenarios || {})) {
    for (const g of lane.games || []) {
      const appId = Number(g.appId);
      const shouldSkipForbidden = key !== 'backlogReviver';
      if (!Number.isInteger(appId) || appId <= 0 || (shouldSkipForbidden && hardForbidden.has(appId))) continue;
      prefetchIds.add(appId);
    }
  }
  const allAppIds = [...prefetchIds];
  alternatePool.forEach((id) => allAppIds.push(id));
  const preflight = options.preflight === true;
  const prefetchedDetails =
    preflight
      ? await getGamesMetaMapSteamSpyOnly(allAppIds)
      : cacheOnly
        ? await storeService.getGamesMetaMapCacheOnly(allAppIds, lang)
        : await getGamesMetaMapWithSteamSpyFirst(allAppIds, lang);

  const missingFromStore = [...prefetchIds].filter((id) => !prefetchedDetails.get(id));
  let steamSpyMeta = new Map();
  if (missingFromStore.length > 0 && redisClient && !preflight) {
    steamSpyMeta = await getSteamSpyMetaFromRedis(redisClient, missingFromStore);
  }

  const toGameEntry = (details, g, useNewReleaseReason) => {
    const releaseDate = details.releaseDate || '';
    const newRelease = isNewRelease(releaseDate);
    const reason = useNewReleaseReason && newRelease ? buildNewReleaseReason(lang) : (g.reason || '');
    const headerUrl = details.headerImage || STEAM_HEADER_CDN(details.appId);
    const mediaUrl = details.posterImage || details.headerImage || headerUrl;
    return {
      appId: details.appId,
      name: details.name,
      mediaType: 'image',
      media: mediaUrl,
      mediaFallback: headerUrl,
      positiveRate: details.positiveRate,
      players: details.currentPlayers,
      price: details.price,
      releaseDate,
      isNewRelease: newRelease,
      reason,
      compatibility: g.compatibility || 'playable',
      handheldCompatibility: g.handheldCompatibility || 'unknown',
      destinyLink: g.destinyLink || '',
      destinyType: g.destinyType || 'philosophical_echoes',
      destinyScore: Number.isFinite(Number(g.destinyScore)) ? Math.max(0, Math.min(100, Math.round(Number(g.destinyScore)))) : 0,
      fromLibrary: Boolean(g.fromLibrary),
    };
  };

  const tryAlternateForSlot = (g, key) => {
    const shouldSkipForbidden = key !== 'backlogReviver';
    for (const altId of alternatePool) {
      if (used.has(altId) || (shouldSkipForbidden && hardForbidden.has(altId))) continue;
      const details = prefetchedDetails.get(altId);
      if (details) {
        used.add(altId);
        return toGameEntry(details, g, true);
      }
    }
    return null;
  };

  for (const [key, lane] of Object.entries(scenarios)) {
    const games = [];
    for (const g of lane.games || []) {
      const appId = Number(g.appId);
      const shouldSkipForbidden = key !== 'backlogReviver';
      if (!Number.isInteger(appId) || appId <= 0 || used.has(appId) || (shouldSkipForbidden && hardForbidden.has(appId))) continue;
      const details = prefetchedDetails.get(appId);
      used.add(appId);
      if (details) {
        games.push(toGameEntry(details, g, true));
      } else {
        used.delete(appId);
        const substituted = tryAlternateForSlot(g, key);
        if (substituted) {
          games.push(substituted);
        } else {
          used.add(appId);
          const spyMeta = steamSpyMeta.get(appId);
          const name = spyMeta?.name && !/^App\s+\d+$/i.test(String(spyMeta.name))
            ? String(spyMeta.name).trim()
            : `App ${appId}`;
          const pos = Number(spyMeta?.positive) || 0;
          const neg = Number(spyMeta?.negative) || 0;
          const total = pos + neg;
          const positiveRate = total > 0 ? `${Math.round((pos / total) * 100)}%` : '';
          games.push({
            appId,
            name,
            mediaType: 'image',
            media: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
            mediaFallback: STEAM_HEADER_CDN(appId),
            positiveRate,
            players: spyMeta && Number(spyMeta.ccu) > 0 ? `${Number(spyMeta.ccu).toLocaleString()} online` : '',
            price: '',
            releaseDate: '',
            isNewRelease: false,
            reason: g.reason || (lang === 'zh-CN' ? '命运线与此作交汇，值得一试。' : 'A destiny link—worth a try.'),
            compatibility: g.compatibility || 'playable',
            handheldCompatibility: g.handheldCompatibility || 'unknown',
            destinyLink: g.destinyLink || '',
            destinyType: g.destinyType || 'philosophical_echoes',
            destinyScore: Number.isFinite(Number(g.destinyScore)) ? Math.max(0, Math.min(100, Math.round(Number(g.destinyScore)))) : 0,
            fromLibrary: Boolean(g.fromLibrary),
          });
        }
      }
    }
    enriched[key] = {
      title: lane.title,
      description: lane.description,
      games,
    };
  }

  return enriched;
}

function serveStatic(res, pathname) {
  const safePath = path.normalize(pathname).replace(/^\.\.(\/|\\|$)/, '');
  // 优先从 public 目录提供静态文件（Vercel 部署时 public 通过 includeFiles 打包进函数）
  const publicDir = path.join(ROOT, 'public');
  const staticRoot = (fs.existsSync(publicDir) && fs.statSync(publicDir).isDirectory()) ? publicDir : ROOT;
  let filePath = path.join(staticRoot, safePath === '/' ? 'index.html' : safePath);

  const realPath = path.resolve(filePath);
  if (!realPath.startsWith(path.resolve(staticRoot))) return sendJson(res, 403, { error: 'Forbidden' });
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  sendFile(res, filePath);
}

function getCachedProfile(steamId) {
  const hit = profileCache.get(steamId);
  if (!hit) return null;
  const ageMs = Date.now() - hit.timestamp;
  if (ageMs > PROFILE_CACHE_TTL_MS) return null;
  return { ...hit.data, stale: true, cacheAgeSeconds: Math.floor(ageMs / 1000) };
}

function setCachedProfile(steamId, profile) {
  profileCache.set(steamId, {
    timestamp: Date.now(),
    data: {
      steamId: profile.steamId,
      personaName: profile.personaName,
      avatar: profile.avatar,
      gameCount: profile.gameCount,
      totalPlaytime: profile.totalPlaytime,
      profileUrl: profile.profileUrl,
    },
  });
}

function getCachedAnalysisProfile(steamId, lang = 'en-US') {
  const key = `${steamId}:${normalizeLang(lang)}`;
  const hit = analysisProfileCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.timestamp > ANALYSIS_PROFILE_CACHE_TTL_MS) return null;
  return hit.data;
}

function setCachedAnalysisProfile(steamId, lang = 'en-US', profile) {
  const key = `${steamId}:${normalizeLang(lang)}`;
  analysisProfileCache.set(key, {
    timestamp: Date.now(),
    data: profile,
  });
}

function buildDegradedProfile(steamId) {
  return {
    steamId,
    personaName: `Steam User ${steamId.slice(-4)}`,
    avatar: DEFAULT_AVATAR,
    gameCount: 0,
    totalPlaytime: 'Unknown',
    profileUrl: `https://steamcommunity.com/profiles/${steamId}/`,
    stale: true,
    degraded: true,
    warning: 'Steam API unavailable, using degraded profile data.',
  };
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, buildOrigin(req));
    const pathname = requestUrl.pathname;

    if (pathname === '/' && req.method === 'GET' && redisClient && redisHealthy) {
      triggerSteamSpySyncOnFirstVisit().catch(() => {});
    }

    if (pathname === '/api/metrics' && req.method === 'GET') {
      try {
        const snapshot = metricsService.getMetrics();
        sendJson(res, 200, {
          steamStoreCalls: snapshot.steamStoreCalls,
          steamSpyCalls: snapshot.steamSpyCalls,
          cacheHitRate: snapshot.cacheHitRate,
          lastReset: snapshot.lastReset,
        });
      } catch (err) {
        sendJson(res, 500, { error: err?.message || String(err) });
      }
      return;
    }

    if (pathname === '/api/health' && req.method === 'GET') {
      const steamConfigured = Boolean(STEAM_API_KEY);
      const redisConfigured = Boolean(REDIS_URL) || Boolean(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);
      const aiPrimaryConfigured = Boolean(OPENAI_API_KEY);
      const aiSecondaryConfigured = Boolean(DEEPSEEK_API_KEY);
      const now = Date.now();
      const primaryState = providerState.primary;
      const secondaryState = providerState.deepseek;

      let fallbackPoolV2Size = null;
      let fallbackPoolSize = null;
      if (redisClient && redisHealthy) {
        try {
          fallbackPoolV2Size = await redisClient.zCard(FALLBACK_POOL_KEY_V2).catch(() => null);
          fallbackPoolSize = await redisClient.sCard(FALLBACK_POOL_KEY).catch(() => null);
        } catch (_) {
          // keep null
        }
      }

      const health = {
        ok: true,
        steam: {
          configured: steamConfigured,
        },
        redis: {
          configured: redisConfigured,
          healthy: redisConfigured ? Boolean(redisClient && redisHealthy) : false,
          fallbackPoolV2Size: fallbackPoolV2Size,
          fallbackPoolSize: fallbackPoolSize,
        },
        aiProviders: {
          primary: {
            configured: aiPrimaryConfigured,
            circuitOpen: Boolean(primaryState.openUntil && primaryState.openUntil > now),
            failures: primaryState.failures,
          },
          secondary: {
            configured: aiSecondaryConfigured,
            circuitOpen: Boolean(secondaryState.openUntil && secondaryState.openUntil > now),
            failures: secondaryState.failures,
          },
        },
      };

      sendJson(res, 200, health);
      return;
    }

    // Vercel Cron 触发专用接口：由 Vercel Cron 或外部定时任务调用，替代 node-cron 刷新兜底游戏池（服务器休眠时 node-cron 无效）
    if (pathname === '/api/cron/refresh-pool' && req.method === 'GET') {
      try {
        await refreshFallbackPoolFromSteam();
        sendJson(res, 200, { success: true, message: 'Pool refreshed' });
      } catch (err) {
        sendJson(res, 500, { success: false, error: err?.message || String(err) });
      }
      return;
    }

    // Nightly：SteamSpy 数据同步，写入 steam_meta:{appid}；不修改推荐逻辑。
    if (pathname === '/api/cron/sync-steamspy' && req.method === 'GET') {
      const cronSecret = process.env.STEAMSPY_SYNC_CRON_SECRET || process.env.CRON_SECRET;
      if (cronSecret && requestUrl.searchParams.get('secret') !== cronSecret) {
        sendJson(res, 401, { success: false, error: 'Unauthorized' });
        return;
      }
      if (!redisClient || !redisHealthy) {
        sendJson(res, 503, { success: false, error: 'Redis unavailable' });
        return;
      }
      try {
        const steamSpyBaseUrl = (process.env.STEAMSPY_BASE_URL || 'https://steamspy.com').replace(/\/$/, '');
        const steamSpyCacheTtl = Number(process.env.STEAMSPY_CACHE_TTL || 7 * 24 * 3600);
        const steamSpyHeaders = {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          Referer: 'https://steamspy.com/',
          'X-Requested-With': 'XMLHttpRequest',
        };
        const fetchWithStatus = async (url) => {
          const res = await fetch(url, { signal: AbortSignal.timeout(30000), headers: steamSpyHeaders });
          const text = await res.text();
          let data = null;
          try {
            data = text.trim().startsWith('{') ? JSON.parse(text) : null;
          } catch (_) {}
          const tooMany = /too many connections|connection failed/i.test(text);
          if (tooMany && !data) return { status: 503, data: null };
          if (res.ok && data != null) metricsService.recordSteamSpyCall();
          return { status: res.status, data };
        };
        const result = await runSyncSteamSpy({
          redis: redisClient,
          fetchWithStatus,
          steamSpyBaseUrl,
          steamSpyCacheTtlSec: steamSpyCacheTtl,
        });
        sendJson(res, 200, { success: true, message: 'SteamSpy sync completed', ...result });
      } catch (err) {
        console.warn('[cron/sync-steamspy]', err?.message || err);
        sendJson(res, 500, { success: false, error: err?.message || String(err) });
      }
      return;
    }

    // 预留：nightly cron 每日凌晨从 SteamSpy 抓 top 1000，批量同步 store meta 到 Redis；推荐阶段只读本地，Steam API 仅补缺失。
    if (pathname === '/api/cron/sync-store-meta' && req.method === 'GET') {
      const cronSecret = process.env.STORE_SYNC_CRON_SECRET || process.env.CRON_SECRET;
      if (cronSecret && requestUrl.searchParams.get('secret') !== cronSecret) {
        sendJson(res, 401, { success: false, error: 'Unauthorized' });
        return;
      }
      try {
        const appIds = await getSteamSpyTopAppIdsForStoreSync(STORE_META_SYNC_TOP_N);
        if (appIds.length === 0) {
          sendJson(res, 200, { success: true, message: 'No appIds to sync (set STORE_SYNC_APPIDS or enable SteamSpy)', synced: 0 });
          return;
        }
        const lang = normalizeLang(requestUrl.searchParams.get('lang') || 'zh-CN');
        const result = await storeService.syncStoreMetaToRedis(appIds, lang);
        sendJson(res, 200, {
          success: true,
          message: 'Store meta sync completed',
          requested: appIds.length,
          ...result,
        });
      } catch (err) {
        console.warn('[cron/sync-store-meta]', err?.message || err);
        sendJson(res, 500, { success: false, error: err?.message || String(err) });
      }
      return;
    }

    if (pathname === '/auth/steam/login' && req.method === 'GET') {
      const origin = buildOrigin(req);
      const returnTo = `${origin}/auth/steam/callback`;
      const realm = `${origin}/`;

      const params = new URLSearchParams({
        'openid.ns': 'http://specs.openid.net/auth/2.0',
        'openid.mode': 'checkid_setup',
        'openid.return_to': returnTo,
        'openid.realm': realm,
        'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
        'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
      });

      redirect(res, `https://steamcommunity.com/openid/login?${params.toString()}`);
      return;
    }

    if (pathname === '/auth/steam/callback' && req.method === 'GET') {
      const mode = requestUrl.searchParams.get('openid.mode') || '';
      if (mode === 'cancel') {
        redirectWithAuthError(res, req, 'steam_login_cancelled');
        return;
      }

      let steamId = '';
      try {
        steamId = await validateSteamOpenId(requestUrl);
      } catch (error) {
        if (STEAM_OPENID_STRICT) {
          redirectWithAuthError(res, req, `steam_openid_verify_failed:${error.message}`);
          return;
        }
        try {
          steamId = extractSteamIdFromClaimedId(requestUrl);
        } catch (fallbackError) {
          redirectWithAuthError(res, req, `steam_openid_fallback_failed:${fallbackError.message}`);
          return;
        }
      }

      redirect(res, `/?steamId=${encodeURIComponent(steamId)}&fromSteamLogin=1`);
      return;
    }

    if (pathname === '/api/steam-profile' && req.method === 'GET') {
      const steamId = requestUrl.searchParams.get('steamId') || '';
      const lang = normalizeLang(requestUrl.searchParams.get('lang') || 'en-US');
      if (!validSteamId(steamId)) return sendJson(res, 400, { error: 'Invalid Steam ID. Use a 17-digit SteamID64.' });

      try {
        const profile = await getSteamProfileAndGames(steamId, {
          allowSummaryFallback: false,
          allowGamesFallback: false,
        }, lang);
        const currentSnapshot = buildRecentSnapshot(profile);
        const prevSnapshot = await getProfileSnapshot(steamId);
        const activityDiff = diffRecentSnapshot(prevSnapshot, currentSnapshot);
        await setProfileDiff(steamId, activityDiff);
        const payload = {
          steamId: profile.steamId,
          personaName: profile.personaName,
          avatar: profile.avatar,
          gameCount: profile.gameCount,
          totalPlaytime: profile.totalPlaytime,
          profileUrl: profile.profileUrl,
          stale: false,
          activityDiff: activityDiff.hasDiff ? activityDiff : undefined,
        };
        setCachedProfile(steamId, payload);
        setCachedAnalysisProfile(steamId, lang, profile);
        sendJson(res, 200, payload);
      } catch (error) {
        const cached = getCachedProfile(steamId);
        if (cached) {
          sendJson(res, 200, cached);
          return;
        }
        sendJson(res, 200, buildDegradedProfile(steamId));
      }
      return;
    }

    if (pathname === '/api/ai-analysis' && req.method === 'POST') {
      const body = await readJsonBody(req);
      const steamId = String(body?.steamId || '').trim();
      const lang = normalizeLang(body?.lang || 'en-US');
      if (!validSteamId(steamId)) return sendJson(res, 400, { error: 'Invalid Steam ID. Use a 17-digit SteamID64.' });
      const profileHint = body?.profileHint || {};
      const recentRecommendedAppIds = Array.isArray(body?.recentRecommendedAppIds)
        ? body.recentRecommendedAppIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, 120)
        : [];
      const excludedSessionAppIds = Array.isArray(body?.excludedAppIds)
        ? body.excludedAppIds.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, 240)
        : [];
      const refreshToken = String(body?.refreshToken || '');
      const analysisNonce = String(body?.analysisNonce || '');
      const refreshOptions = body?.refreshOptions && typeof body.refreshOptions === 'object' ? body.refreshOptions : {};
      const isRefresh = Boolean(refreshOptions.isRefresh);
      const personaOverride = body?.personaOverride && typeof body.personaOverride === 'object'
        ? {
            code: String(body.personaOverride.code || '').toUpperCase(),
            name: String(body.personaOverride.name || '').trim(),
            review: String(body.personaOverride.review || '').trim(),
          }
        : null;
      const rawDeviceProfile = body?.deviceProfile || {};
      const selectedMode = String(body?.selectedMode || 'pickles').trim().toLowerCase() === 'flow' ? 'flow' : 'pickles';
      const deviceType = rawDeviceProfile?.type === 'handheld' ? 'handheld' : 'pc';
      const deviceProfile = deviceType === 'handheld'
        ? {
            type: 'handheld',
            handheldModel: String(rawDeviceProfile?.handheldModel || 'steam_deck'),
          }
        : {
            type: 'pc',
            cpuTier: String(rawDeviceProfile?.cpuTier || 'mid'),
            gpuTier: String(rawDeviceProfile?.gpuTier || 'mid'),
            ramGb: Number(rawDeviceProfile?.ramGb || 16),
          };

      // Prefer cached profile context for both initial analyze and refresh.
      // This avoids a second Steam call immediately after /api/steam-profile.
      let profile = getCachedAnalysisProfile(steamId, lang);
      if (!profile) {
        profile = await getSteamProfileAndGames(steamId, {
          allowSummaryFallback: true,
          allowGamesFallback: true,
        }, lang);
        setCachedAnalysisProfile(steamId, lang, profile);
      }
      const effectivePersonaName = profile?.personaName || String(profileHint?.personaName || `Steam User ${steamId.slice(-4)}`);
      const effectiveGameCount = Number.isFinite(profile?.gameCount) ? profile.gameCount : Number(profileHint?.gameCount || 0);
      const effectivePlaytime = profile?.totalPlaytime || String(profileHint?.totalPlaytime || 'Unknown');
      const top50Context = (profile.top50GamesWithCategories || []).slice(0, TOP_CONTEXT_LIMIT);
      const compactOwnedGamesBrief = top50Context.map((g) => ({
        appId: g.appId,
        name: g.name,
        playtimeMinutes: Math.round(Number(g.playtimeHours || 0) * 60),
        lastPlayedEpoch: 0,
      }));
      const compactDormantOwnedGames = compactOwnedGamesBrief.filter((g) => (g.playtimeMinutes || 0) < 120).slice(0, 50);
      const sessionBlacklistIds = await getSessionBlacklist(steamId);
      const mergedExcludedSessionAppIds = [
        ...excludedSessionAppIds,
        ...sessionBlacklistIds,
      ]
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0);
      const aiContext = {
        profile: {
          steamId: profile.steamId,
          personaName: effectivePersonaName,
          gameCount: effectiveGameCount,
          totalPlaytime: effectivePlaytime,
        },
        lang,
        excludedOwnedAppIds: profile.ownedAppIds,
        excludedSessionAppIds: mergedExcludedSessionAppIds,
        recentRecommendedAppIds,
        refreshToken,
        analysisNonce,
        refreshOptions,
        selectedMode,
        deviceProfile,
        ownedGamesBrief: compactOwnedGamesBrief,
        dormantOwnedGames: compactDormantOwnedGames,
        top50GamesWithCategories: profile.top50GamesWithCategories,
        topGames: top50Context.slice(0, 12).map((g) => ({
          appId: g.appId,
          name: g.name,
          playtimeHours: g.playtimeHours,
        })),
        recentGames: (profile.recentGames || []).slice(0, 8),
        activityDiff: (await getProfileDiff(steamId)) || undefined,
      };

      let aiOutput;
      let usedFallback = false;
      let aiProvider = 'destiny-prediction-light';
      let aiError = '';
      console.log('[ai-analysis] steamId=', steamId?.slice(-6), 'redisHealthy=', redisHealthy);
      try {
        const aiResult = await callAiForAnalysis(aiContext);
        aiOutput = aiResult.analysis;
        aiProvider = aiResult.providerUsed || 'primary';
        await setProfileSnapshot(steamId, buildRecentSnapshot(profile));
        console.log('[ai-analysis] AI ok, provider=', aiProvider);
      } catch (error) {
        usedFallback = true;
        aiError = String(error?.message || 'Unknown AI provider error');
        console.log('[ai-analysis] AI failed, using fallback:', aiError?.slice(0, 80));
        aiOutput = buildLocalFallbackAnalysis(profile, deviceProfile, lang);
        const preferredTags = Array.isArray(aiOutput?.topPreferenceTags) ? aiOutput.topPreferenceTags : [];
        const hoursHint = getHoursHintForFallback(profile);
        const fallbackIds = await getFallbackPoolGamesFromRedis(
          profile.ownedAppIds,
          mergedExcludedSessionAppIds,
          FALLBACK_POOL_COUNT,
          String(steamId || ''),
          preferredTags,
          selectedMode
        );
        console.log('[ai-analysis] fallbackIds.length=', fallbackIds?.length ?? 0);
        if (fallbackIds.length > 0) {
          const laneKeys = ['trendingOnline', 'tasteMatch', 'exploreNewAreas'];
          const perLane = [5, 5, 5];
          let idx = 0;
          for (let i = 0; i < laneKeys.length && idx < fallbackIds.length; i++) {
            const n = Math.min(perLane[i], fallbackIds.length - idx);
            if (n > 0) {
              const slice = fallbackIds.slice(idx, idx + n);
              aiOutput.scenarios[laneKeys[i]].games = slice.map((appId) => ({
                appId,
                reason: buildTagAwareFallbackReason(lang, preferredTags, hoursHint),
                compatibility: 'playable',
                handheldCompatibility: 'unknown',
              }));
              idx += n;
            }
          }
        }
        if (lang === 'zh-CN') {
          aiOutput.summary = `根据你的游戏库与近期偏好，为 ${effectivePersonaName} 做了一次命运侧写：你的游玩风格与收藏倾向已被纳入考量，下方推荐会兼顾「碎片时间」与「沉浸时光」两种场景，既有短平快的小品，也有值得深挖的长线作品。若想获得更个性化的长段解读，可稍后点击「获取深度预言」刷新。`;
        } else {
          aiOutput.summary = `Based on your library and preferences, here is a destiny snapshot for ${effectivePersonaName}: your play style and collection have been considered, and the recommendations below cover both short-session picks and deeper experiences. For a longer, more personalized analysis, use "Get Deeper Insights" when it appears.`;
        }
      }
      const nonOwnedScenarios = keepNonOwnedScenarioGames(aiOutput.scenarios, profile.ownedAppIds, lang);
      // 排序仅用本地 SteamSpy 数据（steam_meta:*），不请求 Steam API
      const scoredScenarios = await sortScenarioGamesByScore(nonOwnedScenarios, redisClient, lang);
      const diversified = dedupeAndDiversifyScenarioGames(
        scoredScenarios,
        [...profile.ownedAppIds, ...recentRecommendedAppIds, ...mergedExcludedSessionAppIds],
        lang
      );
      const repairedNonOwned = ensureScenarioMinimums(
        diversified,
        [...profile.ownedAppIds, ...recentRecommendedAppIds, ...mergedExcludedSessionAppIds],
        lang
      );
      const forbiddenForBacklog = new Set(
        [...recentRecommendedAppIds, ...mergedExcludedSessionAppIds]
          .map((id) => Number(id))
          .filter((id) => Number.isInteger(id) && id > 0)
      );
      const aiBacklog = (aiOutput.scenarios?.backlogReviver?.games || [])
        .filter((g) => profile.ownedAppIds.includes(Number(g.appId)))
        .filter((g) => !forbiddenForBacklog.has(Number(g.appId)))
        .slice(0, 6)
        .map((g) => ({ ...g, fromLibrary: true }));
      repairedNonOwned.backlogReviver = {
        title: (aiOutput.scenarios?.backlogReviver?.title || (lang === 'zh-CN' ? '回坑唤醒' : 'Backlog Reviver')),
        description: (aiOutput.scenarios?.backlogReviver?.description || (lang === 'zh-CN' ? '翻翻自己的库存里被冷落的宝藏。' : 'Rediscover underplayed games from your own library.')),
        games: aiBacklog.length ? aiBacklog : buildBacklogFromOwned(profile, forbiddenForBacklog, lang),
      };
      const enrichedScenarios = await enrichScenariosWithStoreData(
        repairedNonOwned,
        [...recentRecommendedAppIds, ...mergedExcludedSessionAppIds],
        lang,
        { alternatePool: [...TRENDING_FALLBACK_POOL], cacheOnly: usedFallback, preflight: true }
      );
      if (usedFallback) {
        console.log('[ai-analysis] fallback 阶段是否触发 Steam 请求: 否 (steamBatches=0，仅读本地缓存)');
      }
      // Only repair empty lanes when AI provider succeeded.
      // Do not inject pool picks in local fallback mode.
      const repairedScenarios = usedFallback
        ? enrichedScenarios
        : await repairEmptyNonBacklogLanes(
            enrichedScenarios,
            [...profile.ownedAppIds, ...recentRecommendedAppIds, ...mergedExcludedSessionAppIds],
            lang
          );
      const destinyEnhancedScenarios = enrichDestinySignals(repairedScenarios, profile, selectedMode, lang);
      const finalPersona = isRefresh && personaOverride?.name ? personaOverride : aiOutput?.gamingPersona;
      const personaName = finalPersona?.name || 'Adaptive Strategist';
      const framedScenarios = frameScenariosByPersona(destinyEnhancedScenarios, personaName, lang);
      // 每日推荐已由赛博塔罗承担，从推荐列表响应中移除 dailyRecommendations
      let scenariosWithoutDaily = framedScenarios
        ? Object.fromEntries(Object.entries(framedScenarios).filter(([k]) => k !== 'dailyRecommendations'))
        : framedScenarios;
      // 跨场景去重：同一 appId 只保留在第一个出现的场景中，避免「同一游戏在不同场景间来回出现」
      scenariosWithoutDaily = dedupeScenariosGlobally(scenariosWithoutDaily, lang);

      // 若三个非回坑场景全部为空，用 Redis 兜底池强制填充，确保绝不返回全 0；填充后拉取商店详情以展示名称/封面等
      const nonBacklogKeys = ['trendingOnline', 'tasteMatch', 'exploreNewAreas'];
      const totalNonBacklog = nonBacklogKeys.reduce((sum, k) => sum + (scenariosWithoutDaily?.[k]?.games?.length || 0), 0);
      let rescueFilled = null;
      let rescueCandidateIds = [];
      if (totalNonBacklog === 0 && redisClient && redisHealthy) {
        const rescueIds = await getFallbackPoolGamesFromRedis(
          profile.ownedAppIds,
          mergedExcludedSessionAppIds,
          15,
          String(steamId),
          [],
          selectedMode
        );
        if (rescueIds.length > 0) {
          console.log('[ai-analysis] all lanes empty, filling from Redis rescue pool:', rescueIds.length);
          rescueCandidateIds = rescueIds;
          const fallbackScenarios = getFallbackScenariosForLang(lang);
          const perLane = [5, 5, 5];
          let idx = 0;
          rescueFilled = { ...scenariosWithoutDaily };
          for (const key of nonBacklogKeys) {
            const n = Math.min(perLane[nonBacklogKeys.indexOf(key)], Math.max(0, rescueIds.length - idx));
            if (n > 0) {
              const slice = rescueIds.slice(idx, idx + n);
              rescueFilled[key] = {
                title: fallbackScenarios[key]?.title ?? key,
                description: fallbackScenarios[key]?.description ?? '',
                games: slice.map((appId) => ({
                  appId,
                  name: `App ${appId}`,
                  mediaType: 'image',
                  media: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
                  mediaFallback: STEAM_HEADER_CDN(appId),
                  positiveRate: '',
                  players: '',
                  price: '',
                  releaseDate: '',
                  reason: buildMysticalFallbackReason(lang),
                  compatibility: 'playable',
                  handheldCompatibility: 'unknown',
                  destinyLink: '',
                  destinyType: 'philosophical_echoes',
                  destinyScore: 78,
                  fromLibrary: false,
                })),
              };
              idx += n;
            }
          }
        } else {
          const hardcodedIds = [730, 570, 620, 1145360, 548430, 588650, 632470, 255710, 553850].filter(
            (id) => !profile.ownedAppIds.includes(id) && !mergedExcludedSessionAppIds.includes(id)
          );
          if (hardcodedIds.length > 0) {
            console.log('[ai-analysis] Redis rescue empty, using hardcoded fallback:', hardcodedIds.length);
            rescueCandidateIds = hardcodedIds;
            const fallbackScenarios = getFallbackScenariosForLang(lang);
            rescueFilled = { ...scenariosWithoutDaily };
            const perLane = [3, 3, 3];
            let idx = 0;
            for (const key of nonBacklogKeys) {
              const n = Math.min(perLane[nonBacklogKeys.indexOf(key)], Math.max(0, hardcodedIds.length - idx));
              if (n > 0) {
                const slice = hardcodedIds.slice(idx, idx + n);
                rescueFilled[key] = {
                  title: fallbackScenarios[key]?.title ?? key,
                  description: fallbackScenarios[key]?.description ?? '',
                  games: slice.map((appId) => ({
                    appId,
                    name: `App ${appId}`,
                    mediaType: 'image',
                    media: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`,
                    mediaFallback: STEAM_HEADER_CDN(appId),
                    positiveRate: '',
                    players: '',
                    price: '',
                    releaseDate: '',
                    reason: buildMysticalFallbackReason(lang),
                    compatibility: 'playable',
                    handheldCompatibility: 'unknown',
                    destinyLink: '',
                    destinyType: 'philosophical_echoes',
                    destinyScore: 78,
                    fromLibrary: false,
                  })),
                };
                idx += n;
              }
            }
          }
        }
      }
      if (rescueFilled) {
        const rescueAlternatePool = rescueCandidateIds.length
          ? [...rescueCandidateIds, ...TRENDING_FALLBACK_POOL]
          : [...TRENDING_FALLBACK_POOL];
        scenariosWithoutDaily = await enrichScenariosWithStoreData(
          rescueFilled,
          [...recentRecommendedAppIds, ...mergedExcludedSessionAppIds],
          lang,
          { alternatePool: rescueAlternatePool, cacheOnly: true }
        );
        console.log('[ai-analysis] rescue 阶段是否触发 Steam 请求: 否 (steamBatches=0，仅读本地缓存)');
      }

      // Session blacklist update: add all newly surfaced appIds (from final response) so refresh avoids them.
      const newlyRecommendedIds = [];
      Object.values(scenariosWithoutDaily || {}).forEach((lane) => {
        (lane?.games || []).forEach((g) => {
          const id = Number(g?.appId);
          if (Number.isInteger(id) && id > 0) newlyRecommendedIds.push(id);
        });
      });
      const uniqueNewlyRecommended = [...new Set(newlyRecommendedIds)];
      if (uniqueNewlyRecommended.length) {
        await addToSessionBlacklist(steamId, uniqueNewlyRecommended);
      }

      const scenarioCounts = Object.fromEntries(
        Object.entries(scenariosWithoutDaily || {}).map(([k, v]) => [k, (v?.games || []).length])
      );
      console.log('[ai-analysis] response usedFallback=', usedFallback, 'scenarioCounts=', JSON.stringify(scenarioCounts));

      sendJson(res, 200, {
        summary: aiOutput.summary,
        playstyleTags: aiOutput.playstyleTags,
        gamingPersona: finalPersona,
        scenarios: scenariosWithoutDaily,
        usedFallback,
        aiProvider,
        aiError: aiError || undefined,
      });
      return;
    }

    if (pathname === '/api/daily-fortune' && req.method === 'GET') {
      const steamId = (requestUrl.searchParams.get('steamId') || '').trim();
      const lang = normalizeLang(requestUrl.searchParams.get('lang') || 'zh-CN');
      if (!/^\d{17}$/.test(steamId)) {
        sendJson(res, 400, { error: 'Invalid or missing steamId. Use a 17-digit SteamID64.' });
        return;
      }
      try {
        const cached = await getDailyFortuneCache(steamId);
        if (cached && cached.card && (cached.fortune || cached.fortuneText) && cached.game) {
          let cardPayload = cached.card;
          if (!cardPayload.cardImageUrl && (cardPayload.cardId || cardPayload.id)) {
            const fromDeck = CYBER_TAROT_DECK.find((c) => c.cardId === (cardPayload.cardId || cardPayload.id));
            cardPayload = {
              cardId: cardPayload.cardId || cardPayload.id,
              cardName: cardPayload.cardName || cardPayload.name,
              cardImageUrl: fromDeck ? fromDeck.cardImageUrl : '',
            };
          }
          sendJson(res, 200, {
            card: cardPayload,
            fortune: cached.fortune || cached.fortuneText,
            game: cached.game,
          });
          return;
        }
        const card = pickCardForUser(steamId);
        const activityDiff = await getProfileDiff(steamId);
        const candidates = await getCandidateGamesForFortune(steamId, lang);
        if (!candidates.length) {
          sendJson(res, 503, { error: 'No candidate games available for fortune.' });
          return;
        }
        const { fortune, appId } = await callAiForDailyFortune(card.cardName, activityDiff, candidates, lang);
        const metaMap = await getGamesMetaMapWithSteamSpyFirst([appId], lang);
        const details = metaMap.get(Number(appId));
        if (!details || !details.name || /^App\s+\d+$/i.test(details.name)) {
          throw new Error('Daily fortune game details unavailable');
        }
        const game = {
          appId: details.appId,
          name: details.name,
          mediaType: 'image',
          media: details.posterImage || details.headerImage,
          mediaFallback: details.headerImage,
          positiveRate: details.positiveRate,
          players: details.currentPlayers,
          price: details.price,
          reason: fortune,
          steamUrl: details.steamUrl,
        };
        const payload = { card: { cardId: card.cardId, cardName: card.cardName, cardImageUrl: card.cardImageUrl }, fortune, game };
        await setDailyFortuneCache(steamId, payload);
        sendJson(res, 200, payload);
      } catch (err) {
        const message = err?.message || 'Daily fortune failed';
        sendJson(res, 500, { error: message });
      }
      return;
    }

    if (pathname === '/favicon.ico' && req.method === 'GET') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (pathname === '/api/game-details-batch' && req.method === 'GET') {
      const appIdsParam = requestUrl.searchParams.get('appIds') || '';
      const lang = normalizeLang(requestUrl.searchParams.get('lang') || 'en-US');
      const appIds = appIdsParam
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((id) => Number.isInteger(id) && id > 0)
        .slice(0, 20);
      if (appIds.length === 0) return sendJson(res, 400, { error: 'Missing or invalid appIds (comma-separated, max 20).' });
      const metaMap = await getGamesMetaMapWithSteamSpyFirst(appIds, lang);
      const results = {};
      metaMap.forEach((d, id) => {
        if (d && d.name && !/^App\s+\d+$/i.test(d.name)) results[String(id)] = d;
      });
      sendJson(res, 200, results);
      return;
    }

    if (pathname.startsWith('/api/game/') && req.method === 'GET') {
      const appId = pathname.replace('/api/game/', '').trim();
      const lang = normalizeLang(requestUrl.searchParams.get('lang') || 'en-US');
      if (!/^\d+$/.test(appId)) return sendJson(res, 400, { error: 'Invalid app ID.' });
      const id = Number(appId);
      const metaMap = await getGamesMetaMapWithSteamSpyFirst([id], lang);
      let details = metaMap.get(id);
      if (!details && redisClient && redisHealthy) {
        const steamSpyMeta = await getSteamSpyMetaFromRedis(redisClient, [id]);
        const spy = steamSpyMeta.get(id);
        if (spy) details = buildGameMetaFromSteamSpy(id, spy);
      }
      const fallback = details || {
        appId: id,
        name: `App ${id}`,
        posterImage: `https://cdn.akamai.steamstatic.com/steam/apps/${id}/library_600x900.jpg`,
        headerImage: STEAM_HEADER_CDN(id),
        shortDescription: 'Detailed description is temporarily unavailable for this game.',
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
      sendJson(res, 200, fallback);
      return;
    }

    serveStatic(res, pathname);
  } catch (error) {
    const statusCode = error.upstreamStatus ? 502 : 500;
    sendJson(res, statusCode, {
      error: error.message || 'Unexpected server error',
      details: error.upstreamBody || undefined,
      source: error.upstreamUrl || undefined,
    });
  }
});

// 仅在本地开发且直接运行 server.js 时启动持续监听；Vercel 等 Serverless 下不 listen，由平台按请求唤醒并调用导出的 handler
if (require.main === module && process.env.NODE_ENV !== 'production') {
  const listenPort = process.env.PORT || 3000;
  server.listen(listenPort, () => {
    console.log(`SteamSense AI server running at http://localhost:${listenPort}`);
    console.log(`AI timeouts: primary=${AI_PRIMARY_TIMEOUT_MS}ms, fallback=${AI_FALLBACK_TIMEOUT_MS}ms`);
  });
}

async function seedFallbackPoolV2ForTest(scoredEntries) {
  if (!redisClient || !redisHealthy) return;
  await redisClient.del(FALLBACK_POOL_KEY_V2);
  if (scoredEntries && scoredEntries.length > 0) {
    const payload = scoredEntries.map((e) => ({ score: e.score, value: String(e.value) }));
    await redisClient.zAdd(FALLBACK_POOL_KEY_V2, payload);
  }
}

function getRedisReadyPromise(timeoutMs = 5000) {
  if (!redisClient) return Promise.resolve(false);
  return Promise.race([
    redisReadyPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Redis ready timeout')), timeoutMs)),
  ]).then(() => redisHealthy);
}

const handler = (req, res) => server.emit('request', req, res);

// 默认导出 handler 供 Vercel Serverless 调用；其余供测试与内部引用
module.exports = handler;
module.exports.handler = handler;
module.exports.server = server;
module.exports.diffRecentSnapshot = diffRecentSnapshot;
module.exports.buildMysticalFallbackReason = buildMysticalFallbackReason;
module.exports.buildTagAwareFallbackReason = buildTagAwareFallbackReason;
module.exports.isNewRelease = isNewRelease;
module.exports.parseReleaseDateToTime = parseReleaseDateToTime;
module.exports.isGameFitForScenario = isGameFitForScenario;
module.exports.SCENARIO_TAG_MAP = SCENARIO_TAG_MAP;
module.exports.getFallbackPoolGamesFromRedis = getFallbackPoolGamesFromRedis;
module.exports.getFallbackPoolIdsByCategory = getFallbackPoolIdsByCategory;
module.exports.addToSessionBlacklist = addToSessionBlacklist;
module.exports.getSessionBlacklist = getSessionBlacklist;
module.exports.setGetGameDetailsForFallbackTest = setGetGameDetailsForFallbackTest;
module.exports.seedFallbackPoolV2ForTest = seedFallbackPoolV2ForTest;
module.exports.syncStoreMeta = syncStoreMeta;
module.exports.getRedisReadyPromise = getRedisReadyPromise;
module.exports.callAiForAnalysis = callAiForAnalysis;
module.exports.setRequestCompletionForTest = setRequestCompletionForTest;
module.exports.resetProviderState = resetProviderState;
module.exports.providerState = providerState;
module.exports.setCachedAnalysisProfile = setCachedAnalysisProfile;
