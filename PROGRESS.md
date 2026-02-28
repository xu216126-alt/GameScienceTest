# SteamSense AI - Progress Handoff (2026-02-28)

## 1. Current Status
The project is in a **working but network-sensitive** state with a multi-step UI flow. The UI is **Chinese-only** (no language toggle). AI prompts and API continue to support `lang`; frontend always sends `zh-CN`. **Vercel 部署**：静态资源已改为通过 `public/` 目录由 Vercel 静态构建提供，首页与静态文件不再经 serverless 函数，避免出现 `{"error":"Not found"}`；推送 Git 后自动部署。

## 2. Implemented Features

### 2.1 UI Flow (3-Step)
- Step 1: Login & Identity (Steam OpenID or manual SteamID64).
- Step 2: Hardware configuration (PC/Handheld + specs).
- Step 3: AI analysis + recommendations.
- Progress bar and smooth reveal animations.
- AI preload can start as soon as a valid 17-digit SteamID is entered (Step 1) or on Next; results shown on Step 3 (see §2.19).
- Start Over / Back navigation between steps.

### 2.2 Authentication & Profile
- Steam OpenID endpoints:
  - `GET /auth/steam/login`
  - `GET /auth/steam/callback`
- Steam profile endpoint:
  - `GET /api/steam-profile?steamId=<17-digit-id>&lang=<lang>`
- UI behavior:
  - After login/analysis, top login/input card hides.
  - Profile card shows avatar/name/library/playtime.
  - Logout button resets UI and reveals login card again.

### 2.3 AI Analysis
- AI analysis endpoint:
  - `POST /api/ai-analysis`
- Device-aware context included in AI prompt:
  - PC: CPU/GPU/RAM
  - Handheld: handheld model
- Scenario-specific prompting for:
  - Trending online（热门联机）
  - Taste match（口味匹配）
  - Explore new areas（探索新领域）
  - Backlog Reviver（回坑唤醒，from library）
- **每日推荐** 已移除：该场景由赛博塔罗（今日运势）承担，推荐列表仅保留上述 3 个场景 + 回坑唤醒。
- Excludes games already owned by user.
- Short-term session blacklist (excluded app IDs) to reduce duplicates.
- Includes compatibility labels:
  - `smooth`, `playable`, `unplayable`
- Includes handheld compatibility labels:
  - `verified`, `playable`, `unsupported`, `unknown`

### 2.4 Provider Failover
- Primary provider: OpenAI-compatible endpoint (`OPENAI_*`).
- Secondary provider: DeepSeek (`DEEPSEEK_*`, model default `deepseek-chat`).
- If both providers fail, local fallback analysis is used.
- Response includes:
  - `usedFallback` boolean
  - `aiProvider` (e.g. `openai-compatible`, `deepseek-chat`, or local fallback path)

### 2.5 Recommendations & Game Cards
- Scenario lanes with **horizontal scroll** (one row per scenario; overflow-x scroll).
- **Per-scenario count**: 5–8 games per lane (min 5, max 8); backend `ensureScenarioMinimums` / `dedupeAndDiversifyScenarioGames` / `keepNonOwnedScenarioGames` / `sanitizeAiOutput` all respect this; backlog lane up to 6.
- Card design:
  - Fixed-size poster tiles (260px width, scroll-snap).
  - Slide-up info panel on hover.
  - **No destiny-link button on cards**; recommendation reason and destiny link text are shown only in the “查看详情” modal.
- Card shows: name, header media, badges (compat, handheld, library, new release, trend), price, positive rate, players, and actions only.
- Card actions:
  - **查看详情** opens modal with: recommendation reason (推荐理由), **命运链接** (destiny link copy when present), description, metrics, Steam link.
  - **打开 Steam 页面** direct store link.
- Refresh button:
  - Uses higher AI temperature and random prompt flavors.
  - Cycles scenario angles to increase variety.
- **刷新缓存机制**：首次分析或每次刷新成功后，后台静默预取一组「下一轮刷新」结果写入 `refreshCache`；用户点刷新时若有缓存则**先展示缓存**再背后请求并更新缓存，无缓存则走原逻辑（等待接口后同样触发后台预取）。登出或切换 Steam 账号时清空缓存。见 §2.26。

### 2.6 Localization (Chinese-only)
- **Language toggle removed.** All UI and visible content are **Chinese only** (`zh-CN`). Frontend uses `currentLang = "zh-CN"` and `t()` reads only from `translations["zh-CN"]`.
- `index.html` default content and `<html lang="zh-CN">` are Chinese; no EN copy in the shipped UI.
- `lang` is still passed to `/api/ai-analysis`, `/api/steam-profile`, `/api/game/:id` (always `zh-CN` from this app).
- Steam Store requests use: `cc=cn`, `l=schinese`.
- System prompt used is the native Chinese one: slang-heavy, mystical “destiny_link” tone, no English reasons.
- Typography: `Noto Sans SC` for body, `ZCOOL KuaiLe` for headings; `body.lang-zh` is always applied.

### 2.7 Reliability Improvements
- Upstream request retries/timeouts:
  - `UPSTREAM_TIMEOUT_MS`
  - `UPSTREAM_RETRIES`
- Steam profile cache:
  - TTL via `PROFILE_CACHE_TTL_MS`
  - Cached profile can be returned when upstream fails.
- Degraded profile fallback:
  - If Steam profile fetch fails and no cache exists, API returns a degraded profile with `stale: true`, `degraded: true`, and warning message (HTTP 200).

### 2.8 Differential Analysis & Personalized Greetings
- **Storage (Redis)**: Profile snapshots and diffs are stored in Redis keyed by `steamId`. Snapshot contains `recentTotalHours` and `recentGames` (with `playtime2WeeksHours`). Implemented via `getProfileSnapshot` / `setProfileSnapshot` and `getProfileDiff` / `setProfileDiff` using `redis` client.
- **Snapshot keys**: `steam_sense:snapshot:${steamId}` (TTL `PROFILE_SNAPSHOT_TTL_SEC`, default 30 days), `steam_sense:diff:${steamId}` (TTL `PROFILE_DIFF_TTL_SEC`, default 15 min).
- **Diffing in `/api/steam-profile`**: After fetching profile, build current snapshot with `buildRecentSnapshot(profile)`, load previous snapshot from Redis, compute diff via `diffRecentSnapshot(prev, next)` (new games in last 2 weeks, playtime spikes per game with `deltaHours`, total 2-week hours delta). Store diff in Redis; include `activityDiff` in response when `hasDiff` is true.
- **AI prompt injection**: `/api/ai-analysis` reads `activityDiff` from Redis and passes it in `aiContext.activityDiff`. The system prompt (EN/zh-CN) instructs the AI to generate a `personalized_greeting` that explicitly references recent activity (games, hours, inferred genre) and to prepend it to `summary`, then adjust scenarios (especially tasteMatch) according to these recent trends.
- **Snapshot update**: After a successful AI analysis (non-fallback), the current profile snapshot is written back with `setProfileSnapshot(steamId, buildRecentSnapshot(profile))` so the next visit uses this as the baseline for diffing.
- **Dependency**: `redis` (`REDIS_URL`-driven client) in `package.json`.

### 2.9 Redis-backed Fallback Pool & Trend Surfacing
- **Initial seed**: On server startup, `seedFallbackPool()` reads `fallback_games.json` (≈200 curated appIds) and seeds both the Redis Set `steam_sense:fallback_pool` and the ZSET `steam_sense:fallback_pool_v2` (see §2.16–2.17). The pool is then refreshed from Steam on a schedule and on first ready.
- **AI total failure behavior**: If all AI providers fail, `/api/ai-analysis` falls back to `buildLocalFallbackAnalysis` and uses `getFallbackPoolGamesFromRedis` to pull 15 appIds (from ZSET top-100 when v2 is populated, else from Set), filtered against `ownedAppIds` and session blacklist. These are distributed into the three non-backlog scenarios (trendingOnline, tasteMatch, exploreNewAreas) and enriched with full store metadata like normal.
- **Session persistence & auto-skip**: The frontend stores `steamId`, `deviceProfile`, and `lang` in `localStorage` when Step 2 completes. On page load, if a saved session exists, the app auto-hydrates hardware, jumps directly to Step 3 (language is always zh-CN), triggers `/api/steam-profile` and then `/api/ai-analysis`, showing a tech-style loader “正在同步命运数据...” instead of a blank screen.
- **Welcome-back & trend tags**: When `activityDiff.hasDiff` is present in the restored profile, the UI shows a “Welcome back” / “欢迎回来” toast highlighting the most changed game (top gainer / new recent). All recommendation cards in that session render a small “New Trend” / “基于近期动态” badge on the poster to signal that results are influenced by recent activity.
- **Redis fallback pool variety**: `getFallbackPoolGamesFromRedis` pulls from ZSET v2 (or Set), filters by `ownedAppIds` and session blacklist, **shuffles** in Node (Fisher-Yates, scenario-aware when `currentScenario` is provided), then takes the requested count (e.g. 32 for distribution across lanes). Per-lane target 5–8 games; fallback pool count and per-lane caps updated so each scenario shows 5–8 games.

### 2.10 Session Blacklist (Short-term Memory)
- **Redis key**: `steam_sense:session_blacklist:{steamId}` (Redis Set), TTL `SESSION_BLACKLIST_TTL_SEC` (default 10 minutes). In-memory fallback `FALLBACK_SESSION_BLACKLIST` when Redis is down.
- **Read**: `getSessionBlacklist(steamId)` returns appIds to exclude. **Write**: `addToSessionBlacklist(steamId, appIds)` adds IDs and refreshes TTL.
- **Usage in `/api/ai-analysis`**: Before building `aiContext`, server merges request body `excludedAppIds` with `getSessionBlacklist(steamId)` into `mergedExcludedSessionAppIds`. This is passed as `excludedSessionAppIds` to the AI and used in all dedupe/forbidden lists (dedupeAndDiversifyScenarioGames, ensureScenarioMinimums, enrichScenariosWithStoreData, repairEmptyNonBacklogLanes, backlogReviver).
- **Fallback pool**: `getFallbackPoolGamesFromRedis(ownedAppIds, sessionBlacklistAppIds, count)` excludes both owned and session-blacklisted IDs so Redis fallback never re-recommends recently shown games.
- **Update after success**: After building the final `framedScenarios`, all recommended `appId`s from every lane are collected and `addToSessionBlacklist(steamId, newlyRecommendedIds)` is called so the next refresh (within 10 min) avoids those games.

### 2.11 Circuit Breaker & Health
- **Redis graceful fallback**: If Redis is unavailable or errors, snapshot/diff use in-memory caches (`FALLBACK_SNAPSHOT_CACHE`, `FALLBACK_DIFF_CACHE`) with TTL; `redisHealthy` is set false so fallback pool returns `[]` until Redis is ready again. App does not crash.
- **AI provider timeout**: Primary uses `AI_PRIMARY_TIMEOUT_MS` (default 60s in code; env can override); secondary uses `AI_FALLBACK_TIMEOUT_MS` (default 90s). Optional direct URLs (`OPENAI_DIRECT_BASE_URL`, `DEEPSEEK_DIRECT_BASE_URL`) allow racing proxy + direct for first-success. On timeout or error, next provider is tried, then local + Redis fallback pool.
- **AI circuit breaker**: Per-provider state (`providerState.primary`, `providerState.deepseek`) with `failures` and `openUntil`. After `PROVIDER_MAX_FAILURES` (3) consecutive failures, that provider is skipped for `PROVIDER_CIRCUIT_OPEN_MS` (60s). Success resets that provider’s state.
- **`GET /api/health`**: Returns JSON with `steam.configured`, `redis.configured` & `redis.healthy`, `aiProviders.primary` / `aiProviders.secondary` (each: `configured`, `circuitOpen`, `failures`).

### 2.12 Variety, Copy & Prompt Tuning
- **AI temperature**: Default for non-refresh analysis is **0.8** (was 0.55); refresh keeps 0.9 or body `refreshOptions.temperature`.
- **Prompt flavors**: `PROMPT_FLAVORS_EN` / `PROMPT_FLAVORS_ZH` (e.g. “As a cynical veteran gamer”, “以一位老毒奶玩家视角…”). `pickPromptFlavor(lang, existingFlavor, isRefresh)` picks one at random per request (or uses frontend flavor). Injected into system prompt as “Flavor directive” / “本次解读风格提示”.
- **Mystical fallback copy**: Technical phrases like “用于补齐场景推荐数量” removed. `buildMysticalFallbackReason(lang)` returns a random string from 8 CN / 8 EN “mystical” templates for fallback/repair game reasons.
- **Tags in recommendations**: System prompt (EN + ZH) requires that for each recommended game, the AI **MUST** use at least two **concrete tags or genre descriptors** of that game (e.g. Souls-like, Open World; 类魂、开放世界) in `reason` / `destiny_link`, and must not use generic placeholders without real tags.

### 2.13 UI: Tactical Filter Bar & Scenario Chips
- **Placement**: Scenario selection (“碎片时间” / “沉浸时光”, Electronic Pickles / Flow Time) moved out of the analysis card into a **`.tactical-filter-bar`** above the `.recommendations` section, wrapped in `.scenario-container`, horizontal flex layout.
- **Action chips style**: Mode toggles use light glass style: `background: rgba(255,255,255,0.05)`, `border: 1px solid rgba(255,255,255,0.2)`, `border-radius: 20px`. Active: `border: 2px solid #22d3ee`, `box-shadow` glow, text-shadow. Hover: brighter border/background. **Icons**: clock ⏱ (pickles), mountain ⛰ (flow).
- **Interaction**: Click toggles `.is-active` and `.active`; `triggerRecommendationsFade()` runs on the recommendation grid (fade-out then fade-in animation). **Haptic-style**: `mode-toggle--pressed` (scale 0.95) on mousedown, removed on mouseup/mouseleave/blur.

### 2.14 Loading UX: Wait-for-AI & Progressive Reveal
- **Wait-for-AI buffer**: On entering Step 3, the “Syncing destiny data...” / “正在同步命运数据” loader is shown for a **minimum of 3 seconds** (`WAIT_FOR_AI_MS`) before hiding, so the AI has a fair window to respond before fallback.
- **Progressive reveal**: After the loader hides, the AI summary is visible first; game cards are rendered with **staggered slide-in** animation (`recommendation-grid--stagger`, `game-card--reveal` with per-card `animation-delay`).
- **Refining indicator**: When the response used fallback (`usedFallback`), a small “Refining...” / “进一步占卜中” spinner appears in the analysis card. A background retry of the AI request runs; if it later succeeds with real AI, a **“Refresh for Deeper Insights” / “获取深度预言”** button is shown so the user can replace the current result with the deeper analysis.

### 2.15 Personalized Fallback (Tag-based)
- **Top tags**: `buildLocalFallbackAnalysis` derives the top 3 most-played tags from `profile.top50GamesWithCategories` and exposes them as `topPreferenceTags` on the fallback output.
- **Weighted selection**: `getFallbackPoolGamesFromRedis(..., preferredTags)` receives these tags; when building the candidate list it pre-fetches primary genre per game and **prioritizes** games whose primary genre matches `preferredTags`, while still enforcing at least 5 distinct genres for diversity.
- **Copy**: Fallback game reasons use `buildTagAwareFallbackReason(lang, preferredTags)` (e.g. “Because you've spent so much time in [Top Tag]-flavored games…” / “因为你在「…」相关的游戏上已经投入了不少时间…”).

### 2.16 Automated Fallback Pool (“New Games Scout”)
- **Schedule**: `node-cron` runs every **3 days** (`0 0 */3 * *`) and once ~15s after Redis is ready, calling `refreshFallbackPoolFromSteam()`.
- **Sources**: `fetchSteamNewReleases()` POSTs to Steam store search with `sort_by=Released_Desc` and parses app IDs from the response (up to ~400); if fewer than 100 are returned, `fetchSteamSpyTopGames()` supplements with SteamSpy `request=all` (by positive ratio).
- **Redis sync**: `refreshFallbackPoolFromSteam()` clears the pool and repopulates: writes to **ZSET** `steam_sense:fallback_pool_v2` with freshness scores and to **Set** `steam_sense:fallback_pool` for backward compatibility. Optional env: `STEAMSPY_API_BASE`. Dependency: `node-cron`.

### 2.17 ZSET Fallback Pool (Freshness-weighted)
- **Key**: `steam_sense:fallback_pool_v2` (Redis Sorted Set). **Scoring**: When populating, newer games get higher scores (e.g. `1e10 + (length - 1 - index)` for Steam new-releases order; file-seeded games get `1e8`).
- **Weighted random**: `getFallbackPoolGamesFromRedis` prefers v2: if `ZCARD(v2) > 0`, it uses **ZRANGE v2 0 99 REV** to take the **top 100 newest** games, then filters by owned/session blacklist, shuffles (seeded), and runs the same diversity/preferred-tag logic to pick 15. So “new trends” are much more likely to appear.

### 2.18 New Release Badge & Copy
- **Recency**: Server treats games as “new release” when `release_date` is within the last **90 days** (`isNewRelease(releaseDate)` in `enrichScenariosWithStoreData`).
- **Copy**: For these games, `reason` is set to `buildNewReleaseReason(lang)` (e.g. “一颗正在冉冉升起的命运新星，值得你抢先体验。” / “A rising star in the gaming destiny—worth experiencing while it's fresh.”).
- **UI**: Cards with `game.isNewRelease` get a **neon-styled “NEW” / “热门新品”** badge on the **top-left** of the poster (`.new-release-badge`: cyan border, glow, top-left position; trend badge remains top-right when applicable).

### 2.19 Ultra Pre-fetch (消除首屏兜底)
- **Trigger early**: As soon as the user enters a valid **17-digit SteamID** in Step 1 (debounced 500 ms), the frontend runs profile fetch and `/api/ai-analysis` in the background (`runEarlyPrefetch(steamId)`). Result is cached in `earlyPrefetchPromise` / `earlyProfile` / `earlyPrefetchKey`.
- **On "Next"**: When the user clicks Next to Step 2, if the typed SteamID matches `earlyPrefetchSteamId` and `earlyProfile` is ready, the app reuses that profile and assigns the cached AI promise to `prefetchAnalysisPromise` / `prefetchAnalysisKey`, then clears early-prefetch state. No second profile or AI request.
- **Step 3**: When the user clicks "Start Analysis", the existing logic uses `prefetchAnalysisPromise` when the key matches; the AI result is often already resolved, so **fallback is rarely shown on first load**.
- **Step 2 device/mode**: When the user changes device type, CPU/GPU/RAM, handheld model, or scenario mode in Step 2, `scheduleStep2Prefetch()` runs (debounced 600 ms) and calls `startPrefetchAnalysis()` so a new key gets a head start.
- **Reset**: `earlyPrefetch*` and prefetch state are cleared on logout and when the SteamID input no longer matches 17 digits.

### 2.20 E2E Tests (Playwright)
- **Tool**: `@playwright/test`; tests live in `e2e/flow.spec.js`; run with `npm run test:e2e` (or `npx playwright test`). Playwright can start the server via `webServer` in `playwright.config.js` when not in CI.
- **Auto-hydrate**: With `steamsense.session.v1` in localStorage (mock `steamId`, `deviceProfile`, `lang`), reload the page and assert Step 3 is active, Step 1/2 are not, and the “Syncing destiny data” loader (`#soul-loading.soul-loading--syncing`) is visible. API calls are mocked so no real Steam/AI is used.
- **Loader buffer**: Same session setup; mock `/api/ai-analysis` to delay 3.5s then return. Assert the loader stays visible for at least ~3s before game cards appear.
- **Scenario switch**: After loading Step 3 with mocked profile + analysis, click the Flow Time chip (`#mode-flow`, label “沉浸时光” in zh). Assert the recommendation grid gets the `.recommendation-grid-fade` class and the Flow chip gets `.active`.

### 2.21 Daily Fortune (每日运势 / 赛博塔罗)
- **Endpoint**: `GET /api/daily-fortune?steamId=<17-digit>&lang=zh-CN`
- **Daily lock**: Redis key `steam_sense:daily_fortune:${steamId}` (TTL 24h). Same user gets the same card and fortune for 24 hours; after TTL expires, next request draws a new card.
- **Cyber Tarot cards**: 15 张赛博塔罗牌（防火墙、缓存、延迟尖峰、重生、模组师、速通、刷子、联机、随机数、补丁、成就、待办库、DLC、季票、抢先体验）。按 `steamId + 当日 UTC 日期` 做确定性哈希，得到当日牌面。
- **Fortune logic**: 用牌名 + 用户 `activityDiff`（来自 Redis diff）调用 AI，扮演赛博神谕，产出约 50 字运势，并从候选游戏列表中选**恰好一款**推荐游戏（候选来自 fallback pool 或 TRENDING_FALLBACK_POOL）。
- **Response**: `{ card: { id, name }, fortune: string, game: { appId, name, media, price, positiveRate, players, reason, steamUrl } }`。若无缓存则先拉 profile diff、候选游戏，再调 AI，写入 Redis 后返回。
- **Frontend flow**: 点击牌面 → 进入仪式（粒子向牌汇聚）→ 牌面颤动固定时长 → 翻牌 + 霓虹冲击波 + 翻牌音效 → 约 1 秒后自动「炸开」退出仪式，粒子恢复。每人每天仅可抽一次；再次访问直接展示缓存结果。

### 2.22 Step 3 Header (Cyber-HUD) & 命运洞察
- **Layout**: 分析页头部采用 CSS Grid：首行两列并排「个人信息」与「游戏人格」（等高 `align-items: stretch`），次行通栏「命运洞察」。主容器 `.hud-header-grid`：`max-width: 1300px`、`width: 100%`、`padding: 0 20px`、`overflow-x: hidden`；各 panel 设 `min-width: 0` 防止内容撑破。
- **命运洞察**: AI 摘要要求为一整段（150～250 字），prompt 明确禁止只写一句。摘要**不再**因含拉丁字符被整段替换为占位句；用户**不看到**来源/模型（不再在文案后追加「分析完成 · primary」或「命运预言轻量版」）。`.oracle-terminal-box` 内为洞察正文，带内边距、右侧霓虹边框与 L 形角括号装饰（10px 内缩），正文 `line-height: 1.8`、`letter-spacing: 0.02em`。
- **状态指示**: 「分析完成」状态 pill 已移至**推荐列表区域**，位于「刷新推荐」按钮**左侧**（`.recommendations-head-actions`），与推荐操作同一视线区。

### 2.23 游戏人格 (Persona) 数据与视觉
- **五维属性**: AI 返回 `gamingPersona.attributes`（action/strategy/exploration/social/immersion，0–100），前端在游戏人格面板内以**霓虹进度条**展示（细条 + 青色发光 `box-shadow`）。
- **性格标签**: `gamingPersona.traits` 共 3 个，渲染为小徽章（深底、青色字、细边框）。
- **元数据装饰**: 面板底部等宽小字展示 `ANALYSIS_LOG_V2.0 // ID: GEN-xxx // SYNC: xx%`（有分析结果时）；未分析时为 `SYNC_STATUS: STABLE`。
- **布局**: `.persona-main` / `.persona-body` 使用 `flex-wrap`，窄屏时属性条可落到文案下方，避免溢出。

### 2.24 场景切换与刷新一致
- **行为统一**: 点击「碎片时间」或「沉浸时光」时，若已在 Step 3 且已登录，会执行与「刷新推荐」**相同**逻辑（`handleRefreshRecommendations()`）：带 refreshToken、flavor、更高 temperature 重新请求 AI，更新推荐列表与命运洞察文案，无需再点刷新按钮。

### 2.25 了解原理弹窗
- **入口**: 页面右上角「了解原理」按钮。
- **弹窗**: 使用 `<dialog id="how-it-works-modal">`，包含整页架构与功能说明：整体流程（三步）、命运洞察（个人信息/游戏人格/状态与刷新）、游戏场景与推荐、赛博塔罗今日运势、技术要点（Steam/Redis 差分、AI 兜底、会话去重等）。支持关闭按钮、点击遮罩关闭、Esc 关闭。

### 2.26 推荐列表刷新缓存（前端）
- **目的**: 缩短用户点击「刷新推荐」后的等待体感。
- **缓存池**: 前端变量 `refreshCache` 存一份预取结果 `{ data, order }`（与 `/api/ai-analysis` 返回结构一致）。
- **首次分析后**: 成功展示结果后调用 `startBackgroundRefreshPrefetch()`，后台以 `isRefresh: true` 请求一次，成功则写入 `refreshCache`。
- **用户点刷新**: 若 `refreshCache` 存在则立即用缓存更新页面并清空缓存，再调用 `startBackgroundRefreshPrefetch()` 补请求并填满缓存；若不存在则原有逻辑（等待接口），成功后同样触发后台预取。
- **预取参数**: 使用 `refreshCount + 1` 对应的 scenarioAnglePack 与 `shuffledScenarioOrder()`，保证下一轮展示与「真实再点一次刷新」一致。
- **清空时机**: `resetToLoggedOutState()`、切换 Steam 账号时（`steamId !== currentSteamId`）置 `refreshCache = null`。

## 3. Key Files
- Frontend (开发): `index.html`, `styles.css`, `script.js`（根目录）
- Frontend (Vercel 静态): `public/index.html`, `public/styles.css`, `public/script.js`, `public/images/`
- Backend: `server.js`
- Config: `vercel.json`, `.env.example`, `playwright.config.js`
- Data: `fallback_games.json` (optional seed for pool)
- E2E: `e2e/flow.spec.js`

## 4. Runtime & Ports
- Start command: `npm start`
- Backend server: `server.js`
- Port source: `PORT` in `.env` (default `3000`)

## 4.1 Vercel 部署
- **vercel.json**：当前采用**单 build**：`server.js`（@vercel/node），`config.includeFiles: "public/**"` 将静态资源打入函数包；**routes** 全部指向 `server.js`（`/api`、`/auth`、`/(.*)`）。`server.js` 内 `serveStatic` 优先从 `ROOT/public` 提供首页与静态文件。
- **静态资源**：前端文件放在 **`public/`**（`index.html`、`styles.css`、`script.js`、`images/` 等）；与根目录开发源文件需保持一致，修改后同步到 `public/` 再提交。
- **Cron**：`GET /api/cron/refresh-pool` 由 Vercel Cron 每 3 天触发（`0 0 */3 * *`）；无需 node-cron。
- **环境变量**：在 Vercel 控制台配置 `STEAM_API_KEY`、AI 密钥、`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`（或 `REDIS_URL`）等。
- **导出**：`module.exports = handler` 供 Vercel 调用；仅当 `require.main === module && NODE_ENV !== 'production'` 时执行 `server.listen`。
- **自动部署**：推送至 Git 仓库（如 `main`）后，Vercel 会自动检测并部署。

## 5. Environment Variables

### Required
- `STEAM_API_KEY`

### AI Primary (OpenAI-compatible)
- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`
- `OPENAI_MODEL` (default `gpt-4o-mini`)

### AI Fallback (DeepSeek)
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`)
- `DEEPSEEK_MODEL` (default `deepseek-chat`)

### Optional Reliability Tuning
- `UPSTREAM_TIMEOUT_MS` (default `12000`)
- `UPSTREAM_RETRIES` (default `2`)
- `PROFILE_CACHE_TTL_MS` (default `1800000`)
- `AI_PRIMARY_TIMEOUT_MS` (default `8000`)
- `AI_FALLBACK_TIMEOUT_MS` (default `12000`)

### Optional Provider Headers
- `OPENAI_SITE_URL`
- `OPENAI_SITE_NAME`

### Optional Steam Reverse Proxy
- `STEAM_API_BASE_URL`
- `STEAM_STORE_BASE_URL`

### Optional Differential Analysis (snapshot/diff TTL)
- `PROFILE_SNAPSHOT_TTL_SEC` (default 30 days)
- `PROFILE_DIFF_TTL_SEC` (default 900 = 15 min)
### Optional Redis
- `REDIS_URL` (e.g. `redis://localhost:6379`)
### Optional Session Blacklist
- `SESSION_BLACKLIST_TTL_SEC` (default 600 = 10 min)
### Optional Fallback Pool (Steam/SteamSpy)
- `STEAMSPY_API_BASE` (default `https://steamspy.com/api.php`)

## 6. Known Risks / Issues
1. Steam/AI network path instability (especially from mainland routes) can still reduce data quality; now mitigated but not eliminated.
2. Degraded profile mode can proceed with incomplete Steam data (`gameCount=0`, `totalPlaytime=Unknown`) during outages.
3. AI output quality depends on provider compatibility with JSON-structured responses.

## 7. Deployment Guidance (HK Reverse Proxy)
1. Deploy backend service on HK server with full `.env`.
2. Expose backend on selected port (`PORT`, default 3000).
3. Put reverse proxy (Nginx/Caddy) in front:
   - Route `/api/*` and `/auth/*` to Node backend.
   - Serve static frontend via backend or CDN.
4. Ensure callback URL host for Steam OpenID matches public domain in browser flow.

## 8. Suggested Next Tasks
1. Add request tracing/log IDs (e.g. X-Request-Id) to correlate frontend errors with backend logs.
2. E2E (Playwright) already cover: auto-hydrate skip to Step 3, loader min 3s, scenario chip click → grid fade. Extend as needed (e.g. Steam login redirect, refresh → session blacklist).
3. Add more automated tests for:
   - `/api/steam-profile` degraded/cache paths
   - AI provider failover and circuit breaker (skip open provider, then fallback)
   - Session blacklist: IDs added after response, merged into next request and fallback pool
   - Fallback pool: ZSET v2 top-100 + diversity; Steam new-releases fetch + SteamSpy; cron refresh
   - Recommendation copy: no technical phrases; tags requirement; new-release reason override

## 9. Quick Validation Checklist
- [ ] `npm start` runs successfully.
- [ ] `/api/steam-profile` returns 200 for valid SteamID.
- [ ] Steam login redirects back with `steamId` query.
- [ ] `/api/ai-analysis` returns scenarios and tags.
- [ ] When primary AI is unavailable, `aiProvider` reports DeepSeek (or local fallback).
- [ ] Refresh button changes recommendation set; repeated refresh avoids previously shown games (session blacklist).
- [ ] On second visit with changed recent play data, `activityDiff` is present and AI summary mentions recent activity.
- [ ] `GET /api/health` returns `redis.healthy` and `aiProviders.*.circuitOpen` / `failures`.
- [ ] Scenario chips (碎片时间 / 沉浸时光) live in tactical filter bar above recommendations; click applies scale animation and grid fade; switching scenario immediately refetches analysis and updates recommendations (no extra Refresh click).
- [ ] Step 3 loader shows at least 3s; then summary and cards appear with staggered card animation.
- [ ] If fallback was used, “进一步占卜中” appears; “获取深度预言” may appear after background retry.
- [ ] Games released in last 90 days show “热门新品” badge (top-left) and the rising-star reason copy.
- [ ] Recommendation cards do **not** show destiny link on the card; “查看详情” modal shows both 推荐理由 and 命运链接 (when present).
- [ ] No language toggle; entire UI is Chinese.
- [ ] Step 3 header: 个人信息 / 游戏人格 并排等高；命运洞察为通栏；无横向溢出；洞察摘要为整段且不显示来源/模型。
- [ ] 「分析完成」状态在推荐列表上方、刷新按钮左侧；点击「碎片时间」或「沉浸时光」会像点击「刷新推荐」一样重新拉取推荐。
- [ ] 游戏人格面板展示五维属性条、3 个性格标签、底部 ANALYSIS_LOG_V2.0 / SYNC 装饰文案。
- [ ] 右上角「了解原理」点击后弹出介绍弹窗，含架构与功能说明；可关闭/ Esc / 点击遮罩关闭。
- [ ] 推荐列表为 3 个场景（热门联机、口味匹配、探索新领域）+ 回坑唤醒，无「每日推荐」场景（由赛博塔罗承担）。
- [ ] 刷新推荐：有缓存时立即展示再背后请求；无缓存时等待接口后同样触发后台预取；登出/换号清空缓存。
- [ ] Vercel 部署：单 build（server.js + includeFiles public/**），所有请求走 server.js，静态由 serveStatic 从 public/ 提供；推送 Git 后自动部署。
- [ ] `npm run test:e2e` passes (Playwright: auto-hydrate, loader buffer, scenario chip fade).
