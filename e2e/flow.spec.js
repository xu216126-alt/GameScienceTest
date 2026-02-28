/**
 * E2E tests: auto-hydrate, loader buffer, scenario switch.
 * Requires server running (npm start) or Playwright webServer will start it.
 */
const { test, expect } = require('@playwright/test');

const SESSION_STORAGE_KEY = 'steamsense.session.v1';
const MOCK_STEAM_ID = '76561198000000001';
const MOCK_DEVICE = { type: 'pc', cpuTier: 'mid', gpuTier: 'mid', ramGb: 16 };

const mockProfile = {
  steamId: MOCK_STEAM_ID,
  personaName: 'E2E User',
  avatar: 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg',
  gameCount: 42,
  totalPlaytime: '500 hrs',
  profileUrl: 'https://steamcommunity.com/profiles/' + MOCK_STEAM_ID,
  ownedAppIds: [730, 570],
  top50GamesWithCategories: [],
  recentGames: [],
  activityDiff: null,
};

const mockAnalysis = {
  summary: 'E2E test analysis.',
  playstyleTags: ['Action'],
  gamingPersona: { code: 'E2E1', name: 'Test Persona', review: 'Test.' },
  scenarios: {
    dailyRecommendations: { title: 'Daily', description: '...', games: [{ appId: 730, name: 'CS2', reason: 'Test', compatibility: 'playable', handheldCompatibility: 'unknown' }] },
    trendingOnline: { title: 'Trending', description: '...', games: [] },
    tasteMatch: { title: 'Taste', description: '...', games: [] },
    exploreNewAreas: { title: 'Explore', description: '...', games: [] },
    backlogReviver: { title: 'Backlog', description: '...', games: [] },
  },
};

test.describe('Auto-hydrate (skip to Step 3)', () => {
  test('with session in localStorage, page skips Step 1 and 2 and shows Step 3 loader', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(
      ({ key, steamId, device, lang }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            steamId,
            deviceProfile: device,
            lang,
            savedAt: Date.now(),
          })
        );
      },
      { key: SESSION_STORAGE_KEY, steamId: MOCK_STEAM_ID, device: MOCK_DEVICE, lang: 'en-US' }
    );

    await page.route('**/api/steam-profile*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfile) })
    );
    await page.route('**/api/ai-analysis', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...mockAnalysis, usedFallback: false, aiProvider: 'primary' }) })
    );

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.locator('#step-3.step-panel.is-active')).toBeVisible();
    await expect(page.locator('#step-1.step-panel.is-active')).not.toBeVisible();
    await expect(page.locator('#step-2.step-panel.is-active')).not.toBeVisible();

    const loader = page.locator('#soul-loading.soul-loading--syncing');
    await expect(loader).toBeVisible({ timeout: 3000 });
  });
});

test.describe('Loader buffer (min 3s)', () => {
  test('Syncing destiny data loader stays visible at least 3 seconds', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(
      ({ key, steamId, device, lang }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            steamId,
            deviceProfile: device,
            lang,
            savedAt: Date.now(),
          })
        );
      },
      { key: SESSION_STORAGE_KEY, steamId: MOCK_STEAM_ID, device: MOCK_DEVICE, lang: 'en-US' }
    );

    await page.route('**/api/steam-profile*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfile) })
    );
    await page.route('**/api/ai-analysis', async (route) => {
      await new Promise((r) => setTimeout(r, 3500));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...mockAnalysis, usedFallback: false, aiProvider: 'primary' }),
      });
    });

    await page.reload({ waitUntil: 'domcontentloaded' });

    const loader = page.locator('#soul-loading.soul-loading--syncing');
    await expect(loader).toBeVisible({ timeout: 2000 });
    const firstVisible = Date.now();

    await expect(loader).toBeHidden({ timeout: 10000 });
    const hiddenAt = Date.now();
    const visibleDuration = hiddenAt - firstVisible;
    expect(visibleDuration).toBeGreaterThanOrEqual(2900);
  });
});

test.describe('Scenario switch (Flow Time chip)', () => {
  test('clicking Flow Time triggers fade on recommendation grid and updates content', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(
      ({ key, steamId, device, lang }) => {
        localStorage.setItem(
          key,
          JSON.stringify({
            steamId,
            deviceProfile: device,
            lang,
            savedAt: Date.now(),
          })
        );
      },
      { key: SESSION_STORAGE_KEY, steamId: MOCK_STEAM_ID, device: MOCK_DEVICE, lang: 'en-US' }
    );

    await page.route('**/api/steam-profile*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockProfile) })
    );
    await page.route('**/api/ai-analysis', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...mockAnalysis, usedFallback: false, aiProvider: 'primary' }) })
    );

    await page.reload({ waitUntil: 'networkidle' });

    await expect(page.locator('#step-3.step-panel.is-active')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#soul-loading.soul-loading--syncing')).toBeHidden({ timeout: 15000 });

    const grid = page.locator('#recommendation-grid');
    const flowBtn = page.locator('#mode-flow');

    await flowBtn.click();

    await expect(grid).toHaveClass(/recommendation-grid-fade/, { timeout: 500 });
    await expect(flowBtn).toHaveClass(/active/);
  });
});
