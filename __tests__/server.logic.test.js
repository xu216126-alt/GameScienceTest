const {
  diffRecentSnapshot,
  buildMysticalFallbackReason,
  buildTagAwareFallbackReason,
  isNewRelease,
  parseReleaseDateToTime,
} = require('../server.js');

const JARGON_BLACKLIST = /用于补齐/;

describe('diffRecentSnapshot', () => {
  it('returns hasDiff: false when prev is null', () => {
    const next = {
      recentGames: [{ appId: 1, name: 'A', playtime2WeeksHours: 5 }],
      recentTotalHours: 10,
    };
    const result = diffRecentSnapshot(null, next);
    expect(result).toEqual({
      hasDiff: false,
      recentTotalHoursDelta: 0,
      newRecentGames: [],
      topGainers: [],
    });
  });

  it('identifies new games in last 2 weeks', () => {
    const prev = {
      recentGames: [
        { appId: 1, name: 'Game A', playtime2WeeksHours: 2 },
      ],
      recentTotalHours: 2,
    };
    const next = {
      recentGames: [
        { appId: 1, name: 'Game A', playtime2WeeksHours: 2 },
        { appId: 2, name: 'Game B', playtime2WeeksHours: 3 },
      ],
      recentTotalHours: 5,
    };
    const result = diffRecentSnapshot(prev, next);
    expect(result.hasDiff).toBe(true);
    expect(result.newRecentGames).toHaveLength(1);
    expect(result.newRecentGames[0].appId).toBe(2);
    expect(result.newRecentGames[0].name).toBe('Game B');
  });

  it('identifies top gainers (playtime increase > 0.3h)', () => {
    const prev = {
      recentGames: [
        { appId: 1, name: 'Game A', playtime2WeeksHours: 1 },
        { appId: 2, name: 'Game B', playtime2WeeksHours: 2 },
      ],
      recentTotalHours: 3,
    };
    const next = {
      recentGames: [
        { appId: 1, name: 'Game A', playtime2WeeksHours: 5 },
        { appId: 2, name: 'Game B', playtime2WeeksHours: 2.5 },
      ],
      recentTotalHours: 7.5,
    };
    const result = diffRecentSnapshot(prev, next);
    expect(result.hasDiff).toBe(true);
    expect(result.topGainers).toHaveLength(2);
    expect(result.topGainers[0].appId).toBe(1);
    expect(result.topGainers[0].deltaHours).toBe(4);
    expect(result.topGainers[1].appId).toBe(2);
    expect(result.topGainers[1].deltaHours).toBe(0.5);
  });

  it('computes recentTotalHoursDelta correctly', () => {
    const prev = {
      recentGames: [],
      recentTotalHours: 10,
    };
    const next = {
      recentGames: [],
      recentTotalHours: 15.5,
    };
    const result = diffRecentSnapshot(prev, next);
    expect(result.recentTotalHoursDelta).toBe(5.5);
  });

  it('caps newRecentGames and topGainers at 5', () => {
    const prev = {
      recentGames: [],
      recentTotalHours: 0,
    };
    const next = {
      recentGames: Array.from({ length: 8 }, (_, i) => ({
        appId: i + 1,
        name: `Game ${i + 1}`,
        playtime2WeeksHours: 1,
      })),
      recentTotalHours: 8,
    };
    const result = diffRecentSnapshot(prev, next);
    expect(result.newRecentGames).toHaveLength(5);
  });
});

describe('buildMysticalFallbackReason', () => {
  it('returns a non-empty string for en-US', () => {
    const result = buildMysticalFallbackReason('en-US');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns a non-empty string for zh-CN', () => {
    const result = buildMysticalFallbackReason('zh-CN');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('does not contain technical jargon (e.g. 用于补齐)', () => {
    for (let i = 0; i < 20; i++) {
      const en = buildMysticalFallbackReason('en-US');
      const zh = buildMysticalFallbackReason('zh-CN');
      expect(en).not.toMatch(JARGON_BLACKLIST);
      expect(zh).not.toMatch(JARGON_BLACKLIST);
    }
  });
});

describe('buildTagAwareFallbackReason', () => {
  it('returns a non-empty string with no tags (delegates to mystical)', () => {
    const result = buildTagAwareFallbackReason('en-US', []);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns tag-based string when topTags and hoursHint provided', () => {
    const result = buildTagAwareFallbackReason('en-US', ['RPG'], '200+');
    expect(result).toContain('RPG');
    expect(result).toContain('200+');
    expect(result).not.toMatch(JARGON_BLACKLIST);
  });

  it('returns tag-based string for zh-CN with topTags', () => {
    const result = buildTagAwareFallbackReason('zh-CN', ['动作'], '大量');
    expect(result).toContain('动作');
    expect(result).toContain('大量');
    expect(result).not.toMatch(JARGON_BLACKLIST);
  });

  it('never contains technical jargon 用于补齐', () => {
    expect(buildTagAwareFallbackReason('en-US', ['RPG'])).not.toMatch(JARGON_BLACKLIST);
    expect(buildTagAwareFallbackReason('zh-CN', ['冒险'])).not.toMatch(JARGON_BLACKLIST);
  });
});

describe('isNewRelease', () => {
  it('returns false for null or invalid date string', () => {
    expect(isNewRelease(null)).toBe(false);
    expect(isNewRelease('')).toBe(false);
    expect(isNewRelease('Unknown')).toBe(false);
    expect(isNewRelease('not-a-date')).toBe(false);
  });

  it('returns true for a date within the last 90 days', () => {
    const recent = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
    const dateStr = recent.toISOString().slice(0, 10);
    expect(isNewRelease(dateStr)).toBe(true);
  });

  it('returns false for a date older than 90 days', () => {
    const old = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
    const dateStr = old.toISOString().slice(0, 10);
    expect(isNewRelease(dateStr)).toBe(false);
  });

  it('respects custom withinDays parameter', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const dateStr = sixtyDaysAgo.toISOString().slice(0, 10);
    expect(isNewRelease(dateStr, 90)).toBe(true);
    expect(isNewRelease(dateStr, 30)).toBe(false);
  });
});

describe('parseReleaseDateToTime', () => {
  it('returns null for invalid or empty input', () => {
    expect(parseReleaseDateToTime(null)).toBeNull();
    expect(parseReleaseDateToTime('')).toBeNull();
    expect(parseReleaseDateToTime('Unknown')).toBeNull();
  });

  it('returns timestamp for valid ISO date string', () => {
    const t = parseReleaseDateToTime('2024-06-15');
    expect(typeof t).toBe('number');
    expect(Number.isFinite(t)).toBe(true);
  });
});
