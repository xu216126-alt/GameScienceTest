/**
 * Redis integration tests. Require Redis (e.g. REDIS_URL=redis://localhost:6379/15).
 * When Redis is unavailable or connection times out, tests no-op and pass.
 * Run with Redis: REDIS_URL=redis://localhost:6379/15 npm test
 */
const {
  getFallbackPoolGamesFromRedis,
  addToSessionBlacklist,
  getSessionBlacklist,
  setGetGameDetailsForFallbackTest,
  seedFallbackPoolV2ForTest,
  getRedisReadyPromise,
} = require('../server.js');

const TEST_STEAM_ID = 'test-steam-redis-integration';
let redisAvailable = false;

const mockGetGameDetails = () => Promise.resolve({ genres: ['Action'] });

beforeAll(async () => {
  try {
    redisAvailable = await getRedisReadyPromise(6000);
  } catch {
    redisAvailable = false;
  }
  if (redisAvailable) {
    setGetGameDetailsForFallbackTest(mockGetGameDetails);
  }
});

describe('Redis integration (fallback pool & blacklist)', () => {
  beforeAll(async () => {
    if (!redisAvailable) return;
    const baseScore = 1e10;
    const scored = [];
    for (let i = 1; i <= 80; i++) {
      scored.push({ value: 1000 + i, score: baseScore + (80 - i) });
    }
    await seedFallbackPoolV2ForTest(scored);
  });

  it('Diversity: 10 calls produce non-identical sets (Fisher–Yates / shuffle)', async () => {
    if (!redisAvailable) return;
    const results = [];
    for (let i = 0; i < 10; i++) {
      const list = await getFallbackPoolGamesFromRedis(
        [],
        [],
        15,
        `diversity-user-${i}`,
        []
      );
      expect(Array.isArray(list)).toBe(true);
      expect(list.length).toBe(15);
      results.push(list.join(','));
    }
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  }, 15000);

  it('Session blacklist: recommended appIds are excluded on next call', async () => {
    if (!redisAvailable) return;
    const steamId = `${TEST_STEAM_ID}-${Date.now()}`;
    const first = await getFallbackPoolGamesFromRedis([], [], 15, 'bl-first', []);
    expect(first.length).toBe(15);

    await addToSessionBlacklist(steamId, first);
    const blacklist = await getSessionBlacklist(steamId);
    expect(blacklist.length).toBe(first.length);
    const blackSet = new Set(blacklist);
    first.forEach((id) => expect(blackSet.has(id)).toBe(true));

    const second = await getFallbackPoolGamesFromRedis([], blacklist, 15, 'bl-second', []);
    expect(second.length).toBe(15);
    const secondSet = new Set(second);
    first.forEach((id) => {
      expect(secondSet.has(id)).toBe(false);
    });
  }, 15000);
});

describe('ZSET freshness (New Games Scout)', () => {
  beforeAll(async () => {
    if (!redisAvailable) return;
    const scored = [];
    const oldScore = 1e8;
    const newBase = 1e10;
    for (let i = 1; i <= 100; i++) {
      scored.push({ value: i, score: oldScore + i });
    }
    for (let i = 0; i < 100; i++) {
      scored.push({ value: 1000 + i, score: newBase + (99 - i) });
    }
    await seedFallbackPoolV2ForTest(scored);
  });

  it('prioritizes higher (newer) scores: returned ids are from top-100 by score', async () => {
    if (!redisAvailable) return;
    const list = await getFallbackPoolGamesFromRedis([], [], 15, 'zset-fresh', []);
    expect(list.length).toBe(15);
    const newIds = new Set(list.map(Number));
    list.forEach((id) => {
      const num = Number(id);
      expect(num).toBeGreaterThanOrEqual(1000);
      expect(num).toBeLessThanOrEqual(1099);
    });
  }, 15000);
});
