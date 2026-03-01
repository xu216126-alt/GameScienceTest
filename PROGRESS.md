# SteamSense AI - Progress Handoff (2026-03-01)

## 1. Current Status
The project is in a **working but network-sensitive** state with a multi-step UI flow. The UI is **Chinese-only** (no language toggle). AI prompts and API continue to support `lang`; frontend always sends `zh-CN`. **Vercel 部署**：静态资源已改为通过 `public/` 目录由 Vercel 静态构建提供，首页与静态文件不再经 serverless 函数，避免出现 `{"error":"Not found"}`；推送 Git 后自动部署。**数据源说明**：游戏详情（名称、价格、海报、好评率等）来自 Steam 商店 API（非公开、易限流）；在线人数来自 Steam Web API。兜底池可来自 Steam 商店新品搜索 + SteamSpy；若 SteamSpy 不可用，实际降级主要依赖本地缓存、`fallback_games.json` 与代码内硬编码池（如 `TRENDING_FALLBACK_POOL`）。**Store 数据层**：已引入独立模块 `storeService.js`，负责批量请求 Steam appdetails、Redis 缓存与并发限制，单次推荐流程最多 1–2 次 Steam Store 批量请求，已缓存游戏不再请求 Steam，限流风险显著下降（见 §2.27）。**Nightly 同步**：已增加 `GET /api/cron/sync-steamspy` 与 `services/syncSteamSpy.ts`（SteamSpy 数据写入 `steam_meta:{appid}`）；当前为**串行执行**、每请求间隔 2s、429/503/500/「Too many connections」指数退避（2s→4s→8s）、**每日**同步 top100in2weeks + top100forever + top100owned + **2 页 all**（约 10 天建全库）、Upstash 下 **pipeline 批量写入**、24h 幂等；遇 Cloudflare 403 可配置 `STEAMSPY_PROXY_URL`（见 §2.28、§2.31）。**统一评分**：`services/scoreService.ts` 基于本地 SteamSpy 数据计算 0–100 分，推荐候选池与场景内游戏按分数排序，不依赖 Steam 排序（见 §2.29）。**API 监控**：`services/metricsService.ts` 统计 Steam Store / SteamSpy 调用与缓存命中率，`GET /api/metrics` 返回当日统计，每日自动重置（见 §2.30）。**Redis 批量与并发**：Upstash 适配器支持 `mget`，`getSteamSpyMetaFromRedis` 与 storeService 缓存读取均优先单次 mget，Steam 缺失批次用 Promise.all 并发请求（见 §2.27、§2.32）。**Step 3 推荐填充**：首包采用 preflight（仅 steam_meta 单次 mget，不等待 Store），头图统一硬编码 CDN（`shared.fastly.steamstatic.com/.../header.jpg`），有 steam_meta 即展示、无则最小卡，绝不空卡（见 §2.32）。

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
- **Per-scenario count**: 3–5 games per lane (min 3, max 5); backend `ensureScenarioMinimums` / `dedupeAndDiversifyScenarioGames` / `keepNonOwnedScenarioGames` / `sanitizeAiOutput` all respect this; backlog lane up to 6.
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
- **刷新缓存机制**：首次分析或每次刷新成功后，后台静默预取一组「下一轮刷新」结果写入 `refreshCache`；用户点刷新时**仅当缓存通过校验**（每场景至少 3 款、与当前展示重叠 ≤40%）才先展示缓存并背后再请求，否则走正常请求；预取结果也仅在通过同样校验时才写入缓存，避免「同一批游戏换场景」的观感。登出或切换 Steam 账号时清空缓存。见 §2.26。
- **会话黑名单与跨场景去重**：后端将本次返回的全部推荐 appId 写入会话黑名单（Redis/内存），刷新与预取请求均携带前端 `excludedAppIds` 并与服务端黑名单合并，严禁再次推荐；响应前对场景做 `dedupeScenariosGlobally`，保证同一款游戏只出现在一个场景中，避免「同一游戏在不同场景间来回出现」。
- **兜底占位卡片与商店拉取失败**：推荐流程统一经 **storeService.getGamesMeta** 批量拉取商店元数据（先 Redis 缓存、缺失再请求 Steam，见 §2.27）；若某款游戏在批量结果中缺失，`enrichScenariosWithStoreData` 从 `alternatePool`（主流程传 `TRENDING_FALLBACK_POOL`，救急填充传 rescue 候选 + TRENDING_FALLBACK_POOL）中尝试替换为其他 appId（同批 meta 已含 alternatePool，无需再请求）。前端对仍为占位的卡片（`game-card--placeholder`）在 0ms、3s、8s 调用 `GET /api/game-details-batch?appIds=...` 拉取详情并原地更新标题、封面、价格、指标；「查看详情」按钮从当前卡片 DOM 读标题，保证补全后名称正确。

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
- **网络/暂停类错误（如 ERR_NETWORK_IO_SUSPENDED）**：前端用 `isNetworkOrSuspendError(error)` 识别（Failed to fetch、TypeError、suspended、aborted 等），展示友好文案「网络请求被中断或暂停…请保持本页在前台后点击刷新推荐重试」；分析失败时若是该类错误则**不退回 Step 1**，留在 Step 3 便于用户直接点刷新。**回到前台自动重试**：监听 `visibilitychange`，当用户从其他标签页切回本页且当前为 Step 3、上次失败为网络/暂停类、未在请求中时，自动调用 `handleRefreshRecommendations()`（延迟 400ms），并显示「已回到前台，正在重新请求…」。

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
- **Cap**: 黑名单最多保留最近 **50** 条（`SESSION_BLACKLIST_MAX_SIZE`）；`addToSessionBlacklist` 合并新 ID 后去重并截断为 50，保证长期刷新不会无限增长。
- **Usage in `/api/ai-analysis`**: Before building `aiContext`, server merges request body `excludedAppIds` with `getSessionBlacklist(steamId)` into `mergedExcludedSessionAppIds`. This is passed as `excludedSessionAppIds` to the AI and used in all dedupe/forbidden lists (dedupeAndDiversifyScenarioGames, ensureScenarioMinimums, enrichScenariosWithStoreData, repairEmptyNonBacklogLanes, backlogReviver).
- **Fallback pool**: `getFallbackPoolGamesFromRedis(ownedAppIds, sessionBlacklistAppIds, count)` excludes both owned and session-blacklisted IDs so Redis fallback never re-recommends recently shown games.
- **Update after success**: After building the final deduped scenarios, all recommended `appId`s from every lane are collected and `addToSessionBlacklist(steamId, newlyRecommendedIds)` is called so the next refresh (within 10 min) avoids those games.

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
- **Schedule**: `node-cron` runs every **3 days** (`0 0 */3 * *`) and once ~15s after Redis is ready, calling `refreshFallbackPoolFromSteam()`；Vercel 上由 Cron 触发 `GET /api/cron/refresh-pool` 替代。
- **Sources**: `fetchSteamNewReleases()` POSTs to Steam store search with `sort_by=Released_Desc` and parses app IDs (up to ~400); if fewer than 100 are returned, `fetchSteamSpyTopGames()` supplements with SteamSpy `request=all` (by positive ratio). **SteamSpy 非 JSON 响应**：当 SteamSpy 返回 HTML/错误页（如 Vercel 环境下偶发）时，`fetchSteamSpyTopGames` 先 `res.text()` 再判断是否以 `{` 开头并安全 `JSON.parse`，解析失败则记录片段并跳过该页，避免「意外的标记…不是有效的 JSON」抛错。**无 ID 时硬编码补充**：若 Steam 与 SteamSpy 均未收集到任何 appId，`refreshFallbackPoolFromSteam` 使用 `TRENDING_FALLBACK_POOL` 写入 Redis，避免「未收集到任何应用 ID，跳过 Redis 更新」导致池子长期为空。
- **Redis sync**: `refreshFallbackPoolFromSteam()` clears the pool and repopulates: writes to **ZSET** `steam_sense:fallback_pool_v2` with freshness scores and to **Set** `steam_sense:fallback_pool` for backward compatibility. Optional env: `STEAMSPY_API_BASE`.

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
- **Daily lock & 每日更新**: 缓存键为 **`steam_sense:daily_fortune:${steamId}:${dateStr}`**（`dateStr` = 当日 UTC 日期 `YYYY-MM-DD`，由 `getDailyFortuneDateString()` 提供）。同用户同日同牌、同运势、同本命游戏；**跨日后键变化，自动重新抽牌与选游戏**，实现每日更新。
- **Cyber Tarot cards**: 15 张赛博塔罗牌。按 `steamId + dateStr` 做确定性哈希选牌，**不同用户不同牌，同一用户不同日不同牌**。
- **本命游戏差异化**: 候选游戏列表由 `getCandidateGamesForFortune` 生成，种子为 **`${steamId}:${dateStr}`** 传入 `getFallbackPoolGamesFromRedis`，故不同用户、同一用户不同日候选顺序/集合不同，AI 选出的本命游戏随之不同。
- **Fortune logic**: 用牌名 + 用户 `activityDiff`（来自 Redis diff）调用 AI，扮演赛博神谕，产出约 50 字运势，并从候选列表中选**恰好一款**推荐游戏。
- **Response**: `{ card: { cardId, cardName, cardImageUrl }, fortune: string, game: { appId, name, media, price, positiveRate, players, reason, steamUrl } }`。若无缓存则先拉 profile diff、候选游戏，再调 AI，写入 Redis 后返回。
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

### 2.27 Store Service Layer（商店元数据批量与缓存 / Static Construction）
- **模块**: `services/storeService.ts`（编译为 dist），负责 Steam 商店 appdetails 的批量请求、Redis 缓存与并发限制，目标为单次推荐流程最多 1–2 次 Steam Store 批量请求，降低 Vercel serverless 下限流风险。
- **Batch Redis Fetch**: 有 `redis.mget` 时单次 **mget** 取全部 `steam_store_meta:{appId}`，否则 `Promise.all(get)`；server 侧推荐列表的 `steam_meta:{appid}` 亦通过 **mget** 一次取回（`getSteamSpyMetaFromRedis`）。
- **Static Image Injection**: **不等待** Steam 返回 `header_image`；所有游戏头图统一由 **STEAM_HEADER_CDN(appId)** 构造：`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`。`buildGameMeta` 与 `normalizeGameData` 均使用该 CDN URL。
- **formatGameResponse(data, appId)**（翻译官）: 无论数据来自 Redis 还是 Steam API，都转换成同一 GameMeta 格式；保证输出始终包含 **name、header_image（即 headerImage）、description（即 shortDescription）、price**；header_image 一律用 CDN 构造。列表与模态框共用此格式，避免“列表空但弹窗有数据”的结构不一致。批量拉取（getGamesMeta、getGamesMetaMapCacheOnly、fetchAppDetailsBatch）及 server 侧 getGamesMetaMapSteamSpyOnly / getGamesMetaMapWithSteamSpyFirst 中，每个游戏对象在返回给前端前都经 formatGameResponse 处理。
- **normalizeGameData(appId, redisData, steamApiData)**: 统一数据合并辅助函数。**Name**：steamApiData.name（如中文）> redisData.name（英文）> 'Unknown Game'。**Image**：始终 CDN URL。**Price**：SteamSpy 存在时用 `price`/`initialprice`。**Tags**：Steam API 有 genres 用 genres，否则 `Object.keys(redisData.tags || {})`。导出 `SteamSpyMeta` 类型与 `STEAM_HEADER_CDN`。
- **Smart Fallback（429）**: 若 Steam Store 返回 **429 (Too Many Requests)**，**不抛错**：init 可传入 `fetchWithStatus`，返回 `{ status, data }`；当 `status === 429` 或 503 时 `fetchAppDetailsBatch` 返回空对象，由 server 用 Redis（steam_meta）+ 静态头图补全，保证卡片始终有内容。
- **Redis 缓存**: key `steam_store_meta:{appId}`，TTL 24h；先 mget 查缓存，缺失再请求 Steam；**Steam 请求**：`fetchMissingFromSteam` 用 Promise.all 并发各批次（p-limit 3）。
- **统一入口**: server 中 `getGamesMetaMapWithSteamSpyFirst` 先 mget steam_meta，有则 `normalizeGameData(id, spy, null)`；缺的请求 Store，得到后用 `normalizeGameData(id, steamSpyMeta.get(id), meta)` 合并；**对仍未命中的 missIds 一律** `normalizeGameData(id, steamSpyMeta.get(id), null)`，确保 429 或部分失败时也不出现空卡。
- **日志**: 每次 `getGamesMeta` 打印 `requested=`、`cacheHits=`、`steamBatches=`。

### 2.28 Nightly 数据同步与预留接口
- **SteamSpy 同步**：`services/syncSteamSpy.ts` 导出 `runSyncSteamSpy(config)`，供 **GET /api/cron/sync-steamspy** 与命令行脚本 `scripts/syncSteamSpy.ts` 共用。**串行执行**（禁止 Promise.all/多页并发）；每请求间隔 **2 秒**（`PAGE_INTERVAL_MS`）；**指数退避**：429/503/500/连接失败或响应含「Too many connections」时 2s→4s→8s 重试，最多 3 次；**每日范围**：依次请求 top100in2weeks、top100forever、top100owned，再请求 2 页 `request=all&page=N`（`steamspy:all:next_page` 记录进度，约 10 天跑满 20 页）；**幂等**：24h 内已同步则直接返回（Redis 键 `steamspy:last_sync_timestamp`）；Upstash 下使用 **pipeline 批量写入**，避免逐条 set 导致「Too many connections」；写入 `steam_meta:{appid}`，TTL 可配置（默认 7 天）；不修改推荐逻辑。详见 §2.31。
- **Cron 接口**：`GET /api/cron/sync-steamspy` 需 query `secret` 等于 `STEAMSPY_SYNC_CRON_SECRET` 或 `CRON_SECRET`，否则 401；无 Redis 时 503；成功返回 `{ success, total_pages, total_games, successful_batches, failed_batches, duration_ms, ... }`。Vercel Cron 已配置每日 `0 0 * * *`。
- **预留扩展**：`syncStoreMeta(appIds)` 已在 server 中实现并导出（`module.exports.syncStoreMeta`），内部调用 `storeService.syncStoreMetaToRedis(ids, 'zh-CN')`，供后续 nightly store meta 同步或内部调用；推荐逻辑未改动。

### 2.31 SteamSpy 同步：403/代理与「Too many connections」排查
- **fetchWithStatus**：cron 与脚本均通过 `fetchWithStatus(url)` 返回 `{ status, data }`，便于 429/503/500 时触发指数退避；非 200 或 body 非 JSON 时按需重试。
- **Cloudflare 403**：SteamSpy 前置 Cloudflare 时直连可能返回 403（「Just a moment...」）。请求头已加浏览器式 User-Agent、Accept、Referer、Origin；**本地脚本**支持 `STEAMSPY_PROXY_URL`（如 `http://127.0.0.1:7890`），通过 undici `ProxyAgent` 走代理，可绕过 403；cron 环境依赖部署出口 IP，未单独配置代理。
- **「Too many connections」**：SteamSpy 服务端限流时返回 200 且 body 为 `Connection failed: Too many connections`（非 JSON）。脚本与 server 检测到 body 含 `too many connections|connection failed` 且未解析出 JSON 时，**视为 503** 返回，触发 2s→4s→8s 重试；并将请求间隔固定为 2s，减轻压力。
- **500 与空 body**：500 已加入可重试状态；若 500 且 body 为空，日志提示可能为代理连接上游失败，建议浏览器开代理访问同一 API 测试。
- **依赖**：脚本使用代理时需 `undici`（已加入 dependencies）；TypeScript 中 undici Response 与 DOM Response 通过 `as unknown as Promise<Response>` 兼容。

### 2.29 统一评分模型（scoreService）
- **模块**：`services/scoreService.ts`，基于本地 SteamSpy 数据（`steam_meta:*`）计算 0–100 标准化分数，**禁止为排序调用 Steam API**。
- **公式**：`parseOwnersToNumber(owners)` 解析区间字符串为均值；好评率 `positive/(positive+negative)`；`log(1+owners)` 与 `log(1+ccu)` 缩放；加权后归一化到 0–100。
- **推荐流程**：候选池生成后调用 `calculateScore`，按 score 排序后再做场景过滤；`sortScenarioGamesByScore` 对各场景内游戏按分数排序，`getFallbackPoolGamesFromRedis` 返回列表按分数降序；排序数据仅来自 Redis `steam_meta:*`。

### 2.30 Steam API 调用监控（metricsService）
- **模块**：`services/metricsService.ts`，提供 `recordSteamStoreCall()`、`recordSteamSpyCall()`、`recordCacheHit()`、`recordCacheMiss()`；所有 storeService 与 cron 内 SteamSpy 调用经此统计。
- **接口**：`GET /api/metrics` 返回 `{ steamStoreCalls, steamSpyCalls, cacheHitRate, lastReset }`（cacheHitRate 为 0–1，lastReset 为上次重置时间戳）。
- **每日自动重置**：在任意 record 或 getMetrics 时若日期与 lastReset 不同则清零计数并更新 lastReset。

### 2.32 Step 3 推荐填充优化（preflight、零延迟图、绝不空卡）
- **批量 Redis**：推荐列表所需 `steam_meta:{appid}` 通过 **redis.mget** 一次取回（`getSteamSpyMetaFromRedis` 优先 mget；Upstash 适配器已提供 `mget`），不逐条 get。
- **零延迟图片**：后端**不请求任何图片 API**；卡片 `media` / `mediaFallback` 一律使用硬编码 CDN：`https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`（`STEAM_HEADER_CDN`）；`toGameEntry` 中缺失时也回退到该 URL。
- **Preflight 首包**：主路径 `enrichScenariosWithStoreData(..., { preflight: true })` 时仅调 **getGamesMetaMapSteamSpyOnly(allAppIds)**（单次 mget steam_meta + 无数据时最小卡），**不请求 Steam Store**，AI 摘要与推荐列表（名称 + ID + 头图 URL）尽快返回；前端可对价格等显示「Loading details…」再通过 `/api/game-details-batch` 补全。
- **智能兜底**：有 `steam_meta` 即用其 name + CDN 图展示；无 steam_meta 的 appId 仍写入最小卡（`App ${id}` + 同一 CDN 图）；Store 429 或缺失时也保证有 steam_meta 则展示、无则最小卡，**绝不出现空卡**。Rescue 占位卡同样使用 `STEAM_HEADER_CDN(appId)`。

## 3. Key Files
- Frontend (开发): `index.html`, `styles.css`, `script.js`（根目录）
- Frontend (Vercel 静态): `public/index.html`, `public/styles.css`, `public/script.js`, `public/images/`
- Backend: `server.js`, **services/storeService.ts**（商店元数据批量、mget 缓存、Promise.all 并发）, **services/syncSteamSpy.ts**（SteamSpy 同步）, **services/scoreService.ts**（统一评分）, **services/metricsService.ts**（API 调用监控）；server 内 `getGamesMetaMapSteamSpyOnly` / `getGamesMetaMapWithSteamSpyFirst`、preflight 与 CDN 头图见 §2.32
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
- **Cron**：`GET /api/cron/refresh-pool` 每 3 天（`0 0 */3 * *`）；`GET /api/cron/sync-store-meta`、`GET /api/cron/sync-steamspy` 每日 `0 0 * * *`；调用时需带相应 `secret`（见环境变量）。
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
- `STEAM_STORE_BASE_URL`（可指向 HK VPS 代理，storeService 使用）
### Optional Store Service (storeService.js)
- `STORE_META_TTL_SEC` (default `86400`，商店元数据 Redis 缓存 TTL 秒)
- `STORE_CONCURRENCY` (default `3`，向 Steam Store 的并发请求上限)
### Optional Nightly Store Meta Sync（未来计划，已预留）
- `STORE_META_SYNC_TOP_N` (default `1000`，cron 从 SteamSpy 拉取的 top N)
- `STORE_SYNC_CRON_SECRET`（保护 `/api/cron/sync-store-meta`，与 query `secret` 比对；也可用 `CRON_SECRET`）
- `STORE_SYNC_APPIDS`（逗号分隔 appIds，测试用，覆盖 SteamSpy 来源）

### Optional Differential Analysis (snapshot/diff TTL)
- `PROFILE_SNAPSHOT_TTL_SEC` (default 30 days)
- `PROFILE_DIFF_TTL_SEC` (default 900 = 15 min)
### Optional Redis
- `REDIS_URL` (e.g. `redis://localhost:6379`)
### Optional Session Blacklist
- `SESSION_BLACKLIST_TTL_SEC` (default 600 = 10 min)
- `SESSION_BLACKLIST_MAX_SIZE` (default 50，黑名单最多保留条数)
### Optional SteamSpy 同步（脚本与 GET /api/cron/sync-steamspy）
- `STEAMSPY_BASE_URL` (default `https://steamspy.com`)
- `STEAMSPY_CACHE_TTL` (default 7 天，秒)
- `STEAMSPY_SYNC_CRON_SECRET`（保护 `/api/cron/sync-steamspy`，可与 `CRON_SECRET` 共用）
- `STEAMSPY_PROXY_URL`（仅脚本：本地走代理访问 SteamSpy，如 `http://127.0.0.1:7890`，用于绕过 Cloudflare 403；cron 未使用）
### Optional Fallback Pool (Steam/SteamSpy)
- `STEAMSPY_API_BASE` (default `https://steamspy.com/api.php`)

## 6. Known Risks / Issues
1. **Steam 商店 API** 非公开、无 SLA，易限流或偶发不可用；项目已通过 **storeService 批量请求 + Redis 缓存**、重试、备用池替换、前端批量补全与占位卡片 0/3/8s 重试缓解，但无法根治。
2. **SteamSpy** 在某些网络环境下不可用或返回非 JSON（如 HTML 错误页、Cloudflare 403、「Too many connections」）；已做安全解析、403/500 日志与「Too many connections」按 503 重试，脚本可配置 `STEAMSPY_PROXY_URL` 绕 403；当 Steam + SteamSpy 均无 ID 时用 `TRENDING_FALLBACK_POOL` 补充兜底池，避免池子为空。
3. Steam/AI 网络不稳定（尤其大陆线路）仍可能影响数据质量；降级与重试已加强，但未消除。
4. Degraded profile mode can proceed with incomplete Steam data (`gameCount=0`, `totalPlaytime=Unknown`) during outages.
5. AI output quality depends on provider compatibility with JSON-structured responses.

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

## 9. 未来计划 / Future Plans（预留扩展）

- **Nightly SteamSpy 同步（已实现并重构）**：`GET /api/cron/sync-steamspy` 每日触发，调用 `runSyncSteamSpy` 将 SteamSpy 数据写入 `steam_meta:{appid}`；脚本 `npm run sync:steamspy` 与 cron 共用 `services/syncSteamSpy.ts`；逻辑为串行、2s 间隔、429/503/500/「Too many connections」退避、每日 top100×3 + 2 页 all（10 天建库）、pipeline 批量写、24h 幂等；可选 `STEAMSPY_PROXY_URL` 绕 Cloudflare 403（§2.31）。
- **Nightly store meta 同步（预留）**：计划每日凌晨从 SteamSpy 抓 **top 1000** appIds，**批量同步 store meta 到 Redis**；推荐阶段**只读本地（Redis）数据**，Steam API **仅用于补充缺失**。
- **已预留扩展接口**：
  - **syncStoreMeta(appIds)**（server 导出）：内部调用 `storeService.syncStoreMetaToRedis(ids, 'zh-CN')`，供未来 cron 或内部批量同步 store meta 使用。
  - **storeService.syncStoreMetaToRedis(appIds, lang)**：强制从 Steam 拉取并写入 Redis。
  - **storeService.getTopAppIdsForSync(topN)** / **setGetTopAppIdsForSyncImpl(fn)**：server 已注入 `getSteamSpyTopAppIdsForStoreSync`。
  - **GET /api/cron/sync-store-meta**：每日 `0 0 * * *`；query `?secret=STORE_SYNC_CRON_SECRET` 或 `CRON_SECRET`；使用 `getSteamSpyTopAppIdsForStoreSync` + `syncStoreMetaToRedis`。
- **环境变量**：见 .env.example 中 `STORE_META_SYNC_TOP_N`、`STORE_SYNC_CRON_SECRET`、`STORE_SYNC_APPIDS`、`STEAMSPY_SYNC_CRON_SECRET`。

## 10. Quick Validation Checklist
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
- [ ] 塔罗每日运势：缓存键含日期，同用户同日同牌同本命游戏，跨日自动更新；不同用户 / 不同日牌与本命游戏不同。
- [ ] 网络/暂停类错误时展示友好提示并留在 Step 3；切回标签页后自动重试刷新推荐。
- [ ] Vercel 部署：单 build（server.js + includeFiles public/**），所有请求走 server.js，静态由 serveStatic 从 public/ 提供；推送 Git 后自动部署。
- [ ] Store 数据层：推荐/塔罗/补全等经 getGamesMetaMapWithSteamSpyFirst（先 steam_meta mget，缺再 Store）；首包 preflight 仅用 getGamesMetaMapSteamSpyOnly，不请求 Store；头图统一 CDN 硬编码；日志有 `[store-service] getGamesMeta: requested=… cacheHits=… steamBatches=…`。
- [ ] `npm run test:e2e` passes (Playwright: auto-hydrate, loader buffer, scenario chip fade).
- [ ] （可选）`GET /api/cron/sync-store-meta?secret=...` 返回 `requested/synced/failed/steamBatches`；无 secret 时若配置了 STORE_SYNC_CRON_SECRET 则 401。
- [ ] （可选）`GET /api/cron/sync-steamspy?secret=...` 返回 `success, total_pages, total_games, successful_batches, failed_batches, duration_ms`；无 secret 时若配置了 STEAMSPY_SYNC_CRON_SECRET 则 401；无 Redis 时 503；24h 内重复调用会跳过（skipped）。
- [ ] `GET /api/metrics` 返回 `steamStoreCalls`、`steamSpyCalls`、`cacheHitRate`（0–1）、`lastReset`（时间戳）；统计每日自动重置。
