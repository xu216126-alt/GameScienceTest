/**
 * Circuit breaker and AI failover tests.
 * Mocks the AI requestCompletion so no real API keys or network are required.
 * Jest setup sets OPENAI_API_KEY and DEEPSEEK_API_KEY so providers are non-empty.
 */
const {
  callAiForAnalysis,
  setRequestCompletionForTest,
  resetProviderState,
  setCachedAnalysisProfile,
  server,
} = require('../server.js');

const MINIMAL_CONTEXT = {
  profile: { personaName: 'FailoverTest', gameCount: 10, totalPlaytime: '100 hrs' },
  lang: 'en-US',
  excludedOwnedAppIds: [],
  excludedSessionAppIds: [],
  recentRecommendedAppIds: [],
  refreshToken: '',
  analysisNonce: '',
  refreshOptions: {},
  selectedMode: 'pickles',
  deviceProfile: { type: 'pc', cpuTier: 'mid', gpuTier: 'mid', ramGb: 16 },
  ownedGamesBrief: [],
  dormantOwnedGames: [],
  top50GamesWithCategories: [],
  topGames: [],
  recentGames: [],
  activityDiff: null,
};

const VALID_ANALYSIS = {
  summary: 'Test summary.',
  playstyleTags: ['Action'],
  gamingPersona: { code: 'TEST', name: 'Test Persona', review: 'Test review.' },
  scenarios: {
    dailyRecommendations: { title: 'Daily', description: '...', games: [] },
    trendingOnline: { title: 'Trending', description: '...', games: [] },
    tasteMatch: { title: 'Taste', description: '...', games: [] },
    exploreNewAreas: { title: 'Explore', description: '...', games: [] },
    backlogReviver: { title: 'Backlog', description: '...', games: [] },
  },
};

function createTimeoutError(ms) {
  const err = new Error(`AI request timed out after ${ms}ms`);
  err.name = 'AbortError';
  return err;
}

beforeEach(() => {
  resetProviderState();
  setRequestCompletionForTest(null);
});

afterAll(() => {
  setRequestCompletionForTest(null);
});

describe('Primary timeout → Secondary', () => {
  it('when primary times out, request retries with Secondary', async () => {
    setRequestCompletionForTest((provider) => {
      if (provider.name === 'primary') throw createTimeoutError(8000);
      return Promise.resolve(VALID_ANALYSIS);
    });
    const result = await callAiForAnalysis(MINIMAL_CONTEXT);
    expect(result.providerUsed).toBe('deepseek');
    expect(result.analysis).toBeDefined();
    expect(result.analysis.summary).toBeDefined();
  });
});

describe('Circuit opening after 3 failures', () => {
  it('after 3 primary failures, next request skips Primary (circuit open)', async () => {
    const callCount = { primary: 0, deepseek: 0 };
    setRequestCompletionForTest((provider) => {
      if (provider.name === 'primary') {
        callCount.primary += 1;
        throw new Error('Primary failed');
      }
      callCount.deepseek += 1;
      return Promise.resolve(VALID_ANALYSIS);
    });

    for (let i = 0; i < 4; i++) {
      await callAiForAnalysis(MINIMAL_CONTEXT);
    }

    expect(callCount.primary).toBe(6);
    expect(callCount.deepseek).toBe(4);
  });
});

describe('Total fallback (both providers fail)', () => {
  const TEST_STEAM_ID = '76561198123456789';
  const TEST_LANG = 'en-US';

  it('API returns usedFallback: true and data when both AI providers fail', async () => {
    const minimalProfile = {
      steamId: TEST_STEAM_ID,
      personaName: 'FallbackUser',
      gameCount: 5,
      totalPlaytime: '50 hrs',
      ownedAppIds: [],
      top50GamesWithCategories: [],
      recentGames: [],
    };
    setCachedAnalysisProfile(TEST_STEAM_ID, TEST_LANG, minimalProfile);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, opts) => {
      const u = typeof url === 'string' ? url : (url && url.url) || '';
      if (u.includes('/v1/chat/completions')) {
        return Promise.reject(new Error('AI request timed out after 8000ms'));
      }
      return originalFetch(url, opts);
    };

    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/ai-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steamId: TEST_STEAM_ID,
          lang: TEST_LANG,
          deviceProfile: { type: 'pc', cpuTier: 'mid', gpuTier: 'mid', ramGb: 16 },
        }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.usedFallback).toBe(true);
      expect(data.summary).toBeDefined();
      expect(data.scenarios).toBeDefined();
    } finally {
      await new Promise((resolve) => server.close(resolve));
      globalThis.fetch = originalFetch;
    }
  }, 15000);
});
