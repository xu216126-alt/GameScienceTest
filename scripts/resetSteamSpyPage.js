/**
 * 将 SteamSpy all 分页进度重置为第 1 页（page=0）。
 * 下次执行 sync-steamspy 时将从 request=all&page=0 开始爬取。
 * 使用方式：node scripts/resetSteamSpyPage.js
 */
require('dotenv').config();

const ALL_NEXT_PAGE_KEY = 'steamspy:all:next_page';
const TTL_SEC = 30 * 24 * 3600; // 与 syncSteamSpy 一致

async function main() {
  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = process.env.REDIS_URL;

  if (upstashUrl && upstashToken) {
    const { Redis } = require('@upstash/redis');
    const redis = new Redis({ url: upstashUrl, token: upstashToken });
    await redis.set(ALL_NEXT_PAGE_KEY, '0', { ex: TTL_SEC });
    console.log('[resetSteamSpyPage] Upstash: 已把 steamspy:all:next_page 设为 0，下次同步从第 1 页开始。');
    return;
  }

  if (redisUrl) {
    const { createClient } = require('redis');
    const client = createClient({ url: redisUrl });
    client.on('error', (err) => console.warn('[resetSteamSpyPage] Redis error:', err?.message));
    await client.connect();
    await client.set(ALL_NEXT_PAGE_KEY, '0', { EX: TTL_SEC });
    await client.quit();
    console.log('[resetSteamSpyPage] Redis: 已把 steamspy:all:next_page 设为 0，下次同步从第 1 页开始。');
    return;
  }

  console.error('[resetSteamSpyPage] 请在 .env 中配置 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN 或 REDIS_URL');
  process.exit(1);
}

main().catch((err) => {
  console.error('[resetSteamSpyPage]', err?.message || err);
  process.exit(1);
});
