const analyzeBtn = document.getElementById("analyze-btn");
const steamIdInput = document.getElementById("steam-id");
const summary = document.getElementById("analysis-summary");
const tagsContainer = document.getElementById("playstyle-tags");
const statusPill = document.getElementById("status-pill");
const recommendationGrid = document.getElementById("recommendation-grid");
const refreshBtn = document.getElementById("refresh-btn");
const steamLoginBtn = document.querySelector(".steam-login-btn");
const authSection = document.getElementById("auth-section");
const logoutBtn = document.getElementById("logout-btn");
const deviceTypeSelect = document.getElementById("device-type");
const pcSpecs = document.getElementById("pc-specs");
const handheldSpecs = document.getElementById("handheld-specs");
const pcCpuSelect = document.getElementById("pc-cpu");
const pcGpuSelect = document.getElementById("pc-gpu");
const pcRamSelect = document.getElementById("pc-ram");
const handheldModelSelect = document.getElementById("handheld-model");
const modePicklesBtn = document.getElementById("mode-pickles");
const modeFlowBtn = document.getElementById("mode-flow");
const step1Status = document.getElementById("step1-status");
const step1Panel = document.getElementById("step-1");
const step2Panel = document.getElementById("step-2");
const step3Panel = document.getElementById("step-3");
const step2AnalyzeBtn = document.getElementById("step2-analyze-btn");
const backToStep1Btn = document.getElementById("back-to-step1-btn");
const backToStep2Btn = document.getElementById("back-to-step2-btn");
const startOverBtn = document.getElementById("start-over-btn");
const soulLoading = document.getElementById("soul-loading");
const step3Content = document.getElementById("step3-content");
const progressStep1 = document.getElementById("progress-step-1");
const progressStep2 = document.getElementById("progress-step-2");
const progressStep3 = document.getElementById("progress-step-3");
const contextCopy = document.getElementById("context-copy");

const profileAvatar = document.getElementById("profile-avatar");
const profileName = document.getElementById("profile-name");
const profileId = document.getElementById("profile-id");
const profileLink = document.getElementById("profile-link");
const statGames = document.getElementById("stat-games");
const statPlaytime = document.getElementById("stat-playtime");
const personaCode = document.getElementById("persona-code");
const personaName = document.getElementById("persona-name");
const personaReview = document.getElementById("persona-review");
const personaStatsEl = document.getElementById("persona-stats");
const personaTraitsEl = document.getElementById("persona-traits");
const personaMetaEl = document.getElementById("persona-meta");

const gameModal = document.getElementById("game-modal");
const modalTitle = document.getElementById("modal-title");
const modalBody = document.getElementById("modal-body");
const closeModalBtn = document.getElementById("close-modal");
const howItWorksBtn = document.getElementById("how-it-works");
const howItWorksModal = document.getElementById("how-it-works-modal");
const howItWorksClose = document.getElementById("how-it-works-close");
const refiningIndicator = document.getElementById("refining-indicator");
const refiningIndicatorText = document.getElementById("refining-indicator-text");
const deeperInsightsBtn = document.getElementById("deeper-insights-btn");

const tarotCard = document.getElementById("tarot-card");
const tarotCardName = document.getElementById("tarot-card-name");
const tarotCardImage = document.getElementById("tarot-card-image");
const tarotFortuneWrap = document.getElementById("tarot-fortune-wrap");
const tarotFortuneText = document.getElementById("tarot-fortune-text");
const tarotDestinyGameWrap = document.getElementById("tarot-destiny-game-wrap");
const tarotDestinyCard = document.getElementById("tarot-destiny-card");
const tarotLoading = document.getElementById("tarot-loading");
const tarotError = document.getElementById("tarot-error");

const WAIT_FOR_AI_MS = 3000;
let pendingDeeperInsights = null;
let dailyFortuneData = null;
const TAROT_FLIP_DURATION_MS = 700;
const TAROT_TYPEWRITER_SPEED = 20;
const TAROT_TREMBLE_DURATION_MS = 1800;
const TAROT_DRAWN_KEY_PREFIX = "steamsense.tarot_drawn:";

function getTodayDateString() {
  return new Date().toLocaleDateString("en-CA");
}

function getTarotDrawnKey(steamId) {
  if (!steamId) return "";
  return `${TAROT_DRAWN_KEY_PREFIX}${steamId}:${getTodayDateString()}`;
}

function getTarotDrawnToday(steamId) {
  const key = getTarotDrawnKey(steamId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setTarotDrawnToday(steamId, data) {
  const key = getTarotDrawnKey(steamId);
  if (!key || !data) return;
  try {
    localStorage.setItem(key, JSON.stringify({ card: data.card, fortune: data.fortune, game: data.game }));
  } catch (e) {
    console.warn("Tarot drawn save failed", e);
  }
}

let currentLang = "zh-CN";
const translations = {
  "en-US": {
    langToggle: "中文",
    howItWorks: "How it works",
    progressIdentity: "Identity",
    progressHardware: "Hardware",
    progressAnalysis: "Analysis",
    step1Title: "Step 1 · Login & Identity",
    step1Headline: "Connect your Steam identity to begin your destiny scan.",
    step1Copy: "You can use Steam OpenID or enter a SteamID64 manually.",
    loginSteam: "Login with Steam",
    orEnterId: "Or enter Steam ID manually",
    idPlaceholder: "e.g. 76561198000000000",
    nextStep: "Next Step",
    step1Waiting: "Waiting for Steam identity...",
    step2Title: "Step 2 · Hardware Configuration",
    step2Headline: "Set your device profile for accurate playability filtering.",
    deviceType: "Device Type",
    pcOption: "PC",
    handheldOption: "Handheld Console",
    cpuTier: "CPU Tier",
    cpuEntry: "Entry (4-core / older i5)",
    cpuMid: "Mid (modern i5 / Ryzen 5)",
    cpuHigh: "High (i7 / Ryzen 7+)",
    gpuTier: "GPU Tier",
    gpuIntegrated: "Integrated / low-end",
    gpuMid: "Mid (GTX 1660 / RTX 3060)",
    gpuHigh: "High (RTX 4070+)",
    memory: "Memory",
    handheldModel: "Handheld Model",
    back: "Back",
    analyzeDestiny: "Analyze My Destiny",
    step3Loading: "Reading your gaming soul...",
    analysisTitle: "AI Playstyle Analysis",
    waitingProfile: "Waiting for profile",
    preparing: "Preparing your personalized analysis...",
    contextTitle: "Gaming Context",
    contextCopy: "Auto-selected by China work schedule. You can override here.",
    contextAutoWeekday: "Weekday working hours in China: quick sessions favored.",
    contextAutoWeekend: "Weekend or evening in China: long-form sessions favored.",
    pickles: "Electronic Pickles",
    flow: "Flow Time",
    snackable: "Snackable",
    deepDive: "Deep Dive",
    personaLabel: "Gaming Persona",
    personaPending: "Persona Pending",
    personaPendingCopy: "Analyze your profile to generate your 4-letter gaming persona and witty personality review.",
    logout: "Log out",
    steamIdNotConnected: "Steam ID: Not connected",
    gamesInLibrary: "Games in Library",
    totalPlaytime: "Total Playtime",
    openProfile: "Open Steam Profile",
    recommendationScenarios: "Recommendation Scenarios",
    destinyHint: "Tap the ∞ Destiny Link on each card to reveal Cyber-Oracle fate signals.",
    refresh: "Refresh Recommendations",
    editHardware: "Edit Hardware",
    startOver: "Start Over",
    footer: "SteamSense AI Demo Experience",
    gameDetails: "Game Details",
    close: "Close",
    viewDetails: "View Details",
    openSteamPage: "Open Steam Page",
    noRecommendations: "No recommendations generated for this scenario yet. Try Refresh when AI/Steam is stable.",
    enterValidId: "Please enter a valid 17-digit SteamID64.",
    retrievingIdentity: "Retrieving Steam identity and preloading your AI profile...",
    enterSteamIdPrompt: "Enter a Steam ID to generate playstyle tags and recommendation lanes.",
    identityConfirmed: "Identity confirmed. Proceed to hardware configuration.",
    needIdentity: "Please complete Steam identity first.",
    analysisRunning: "Running AI analysis...",
    analysisComplete: "Analysis complete",
    errorLabel: "Error",
    noProfile: "No profile",
    openAnalysisFirst: "Open the analysis page first, then refresh recommendations.",
    refreshing: "Generating a new recommendation set with better variation...",
    modalLoading: "Loading game details...",
    gameDetailsError: "Could not load game details.",
    naLabel: "N/A",
    steamDegraded: "Steam degraded",
    steamCached: "Using cached profile",
    steamDegradedWarning: "Steam API temporarily unavailable; using degraded profile data.",
    scanningStars: "Scanning the stars...",
    positiveLabel: "Positive",
    playersLabel: "Players",
    priceLabel: "Price",
    sourceLabel: "Source",
    libraryValue: "Library",
    releaseLabel: "Release",
    genresLabel: "Genres",
    goStore: "Go to Steam Store",
    compatSmooth: "Smooth",
    compatPlayable: "Playable",
    compatUnplayable: "Mostly Unplayable",
    handheldVerified: "Handheld Verified",
    handheldPlayable: "Handheld Playable",
    handheldUnsupported: "Handheld Unsupported",
    flowFit: "Flow Fit",
    snackableFit: "Snackable Fit",
    destinyLink: "Destiny Link",
    destined: "Destined (命中注定)",
    destinyTypeCreative: "Creative Lineage",
    destinyTypePhilosophical: "Philosophical Echoes",
    destinyTypeHardware: "Hardware/Atmospheric Synergy",
    dailyTitle: "Daily Recommendations",
    dailyDesc: "Short sessions and high fun-per-minute titles.",
    dailyReason1: "Good for frequent high-intensity sessions.",
    dailyReason2: "Excellent for tactical daily runs.",
    trendingTitle: "Trending Online Games",
    trendingDesc: "Popular multiplayer experiences with active communities.",
    trendingReason1: "Strong momentum and co-op engagement.",
    trendingReason2: "Fast competitive matches with active player base.",
    tasteTitle: "Games That Fit Your Taste",
    tasteDesc: "Similarity-based picks from your inventory and game history.",
    tasteReason1: "Aligns with co-op progression preferences.",
    tasteReason2: "Fast-paced action loop aligned to your style.",
    exploreTitle: "Explore New Areas",
    exploreDesc: "Genre expansion options to broaden your Steam library.",
    exploreReason1: "Narrative-heavy genre expansion.",
    exploreReason2: "Strategy-building experience outside your usual lane.",
    priceSample: "$24.99",
    priceSample2: "$39.99",
    priceSample3: "$29.99",
    freeLabel: "Free",
    syncingDestinyData: "Syncing destiny data...",
    newTrendBadge: "New Trend",
    newReleaseBadge: "NEW",
    refiningIndicator: "Refining...",
    deeperInsightsBtn: "Refresh for Deeper Insights",
    destinyPredictionLight: "Destiny Prediction (Light Mode)",
    switchingScenario: "Switching scenario...",
  },
  "zh-CN": {
    langToggle: "EN",
    howItWorks: "了解原理",
    progressIdentity: "身份",
    progressHardware: "硬件",
    progressAnalysis: "分析",
    step1Title: "第1步 · 登录与身份",
    step1Headline: "连接你的 Steam 身份，开始命运扫描。",
    step1Copy: "你可以使用 Steam OpenID 登录或手动输入 SteamID64。",
    loginSteam: "使用 Steam 登录",
    orEnterId: "或手动输入 Steam ID",
    idPlaceholder: "例如：76561198000000000",
    nextStep: "下一步",
    step1Waiting: "等待 Steam 身份验证...",
    step2Title: "第2步 · 硬件配置",
    step2Headline: "设置设备规格，以准确评估可玩性。",
    deviceType: "设备类型",
    pcOption: "PC",
    handheldOption: "掌机",
    cpuTier: "CPU 等级",
    cpuEntry: "入门（4 核 / 老款 i5）",
    cpuMid: "中端（新款 i5 / Ryzen 5）",
    cpuHigh: "高端（i7 / Ryzen 7+）",
    gpuTier: "GPU 等级",
    gpuIntegrated: "核显 / 低端",
    gpuMid: "中端（GTX 1660 / RTX 3060）",
    gpuHigh: "高端（RTX 4070+）",
    memory: "内存",
    handheldModel: "掌机型号",
    back: "返回",
    analyzeDestiny: "开始命运解析",
    step3Loading: "正在读取你的游戏灵魂...",
    analysisTitle: "AI 玩家画像分析",
    waitingProfile: "等待资料",
    preparing: "正在准备你的专属分析...",
    contextTitle: "游戏场景",
    contextCopy: "根据中国作息自动选择，你可以手动切换。",
    contextAutoWeekday: "中国工作日时间：优先碎片化推荐。",
    contextAutoWeekend: "中国周末或晚间：优先深度推荐。",
    pickles: "碎片时间",
    flow: "沉浸时光",
    snackable: "轻量",
    deepDive: "深度",
    personaLabel: "游戏人格",
    personaPending: "人格待生成",
    personaPendingCopy: "分析你的资料后生成 4 字母人格与幽默评语。",
    logout: "退出登录",
    steamIdNotConnected: "Steam ID：未连接",
    gamesInLibrary: "库内游戏数",
    totalPlaytime: "总游戏时长",
    openProfile: "打开 Steam 主页",
    recommendationScenarios: "推荐场景",
    destinyHint: "点击「查看详情」可查看推荐理由与命运链接。",
    refresh: "刷新推荐",
    editHardware: "编辑硬件",
    startOver: "重新开始",
    footer: "SteamSense AI 演示体验",
    gameDetails: "游戏详情",
    close: "关闭",
    viewDetails: "查看详情",
    openSteamPage: "打开 Steam 商店",
    noRecommendations: "当前场景暂无推荐，请在 AI/Steam 稳定时刷新。",
    enterValidId: "请输入 17 位 SteamID64。",
    retrievingIdentity: "正在验证 Steam 身份并预加载分析...",
    enterSteamIdPrompt: "输入 Steam ID 以生成玩家标签和推荐场景。",
    identityConfirmed: "身份确认成功，请继续配置硬件。",
    needIdentity: "请先完成 Steam 身份验证。",
    analysisRunning: "正在进行 AI 分析...",
    analysisComplete: "分析完成",
    errorLabel: "错误",
    noProfile: "未加载资料",
    openAnalysisFirst: "请先进入分析页再刷新推荐。",
    refreshing: "正在生成新的推荐列表...",
    modalLoading: "正在加载游戏详情...",
    gameDetailsError: "无法加载游戏详情。",
    naLabel: "暂无",
    steamDegraded: "Steam 降级",
    steamCached: "使用缓存资料",
    steamDegradedWarning: "Steam 接口暂不可用，使用降级资料。",
    scanningStars: "正在扫描星图...",
    newReleaseBadge: "热门新品",
    refiningIndicator: "进一步占卜中",
    deeperInsightsBtn: "获取深度预言",
    destinyPredictionLight: "命运预言（轻量模式）",
    switchingScenario: "切换场景中...",
    positiveLabel: "好评率",
    playersLabel: "玩家数",
    priceLabel: "价格",
    sourceLabel: "来源",
    libraryValue: "库内",
    releaseLabel: "发行日期",
    genresLabel: "类型",
    goStore: "前往商店",
    compatSmooth: "流畅",
    compatPlayable: "可玩",
    compatUnplayable: "基本不可玩",
    handheldVerified: "掌机认证",
    handheldPlayable: "掌机可玩",
    handheldUnsupported: "掌机不支持",
    flowFit: "沉浸契合",
    snackableFit: "碎片契合",
    destinyLink: "命运关联度",
    destined: "命中注定",
    destinyTypeCreative: "创作谱系",
    destinyTypePhilosophical: "哲学回响",
    destinyTypeHardware: "硬件/氛围协同",
    dailyTitle: "每日推荐",
    dailyDesc: "短时段、高性价比的高乐趣游戏。",
    dailyReason1: "适合高频短局与快速反馈。",
    dailyReason2: "适合战术化的日常短局。",
    trendingTitle: "热门联机游戏",
    trendingDesc: "社区活跃的多人游戏。",
    trendingReason1: "热度高，合作节奏强。",
    trendingReason2: "竞技节奏快，匹配活跃。",
    tasteTitle: "符合你口味的游戏",
    tasteDesc: "与你的库存与历史偏好相近。",
    tasteReason1: "与协作与成长型偏好匹配。",
    tasteReason2: "动作节奏与习惯相符。",
    exploreTitle: "探索新领域",
    exploreDesc: "跳出舒适圈的高质量选择。",
    exploreReason1: "叙事取向的新体验。",
    exploreReason2: "策略建造型的新尝试。",
    priceSample: "￥98",
    priceSample2: "￥168",
    priceSample3: "￥128",
    freeLabel: "免费",
    syncingDestinyData: "正在同步命运数据...",
    newTrendBadge: "基于近期动态",
  },
};

function buildFallbackScenarioData(lang) {
  const t = translations[lang] || translations["en-US"];
  return {
    dailyRecommendations: {
      title: t.dailyTitle || "Daily Recommendations",
      description: t.dailyDesc || "Short sessions and high fun-per-minute titles.",
      games: [
        {
          appId: 1145360,
          name: "Hades",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/1145360/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/1145360/header.jpg",
          positiveRate: "98%",
          players: "36k online",
          price: t.priceSample || "$24.99",
          reason: t.dailyReason1 || "Good for frequent high-intensity sessions.",
        },
        {
          appId: 646570,
          name: "Slay the Spire",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/646570/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/646570/header.jpg",
          positiveRate: "97%",
          players: "11k online",
          price: t.priceSample || "$24.99",
          reason: t.dailyReason2 || "Excellent for tactical daily runs.",
        },
      ],
    },
    trendingOnline: {
      title: t.trendingTitle || "Trending Online Games",
      description: t.trendingDesc || "Popular multiplayer experiences with active communities.",
      games: [
        {
          appId: 553850,
          name: "Helldivers 2",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/553850/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/553850/header.jpg",
          positiveRate: "82%",
          players: "211k online",
          price: t.priceSample2 || "$39.99",
          reason: t.trendingReason1 || "Strong momentum and co-op engagement.",
        },
        {
          appId: 2073850,
          name: "THE FINALS",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/2073850/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/2073850/header.jpg",
          positiveRate: "77%",
          players: "58k online",
          price: t.freeLabel || "Free",
          reason: t.trendingReason2 || "Fast competitive matches with active player base.",
        },
      ],
    },
    tasteMatch: {
      title: t.tasteTitle || "Games That Fit Your Taste",
      description: t.tasteDesc || "Similarity-based picks from your inventory and game history.",
      games: [
        {
          appId: 548430,
          name: "Deep Rock Galactic",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/548430/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/548430/header.jpg",
          positiveRate: "97%",
          players: "24k online",
          price: t.priceSample3 || "$29.99",
          reason: t.tasteReason1 || "Aligns with co-op progression preferences.",
        },
        {
          appId: 588650,
          name: "Dead Cells",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/588650/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/588650/header.jpg",
          positiveRate: "97%",
          players: "8k online",
          price: t.priceSample || "$24.99",
          reason: t.tasteReason2 || "Fast-paced action loop aligned to your style.",
        },
      ],
    },
    exploreNewAreas: {
      title: t.exploreTitle || "Explore New Areas",
      description: t.exploreDesc || "Genre expansion options to broaden your Steam library.",
      games: [
        {
          appId: 632470,
          name: "Disco Elysium",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/632470/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/632470/header.jpg",
          positiveRate: "93%",
          players: "3k online",
          price: t.priceSample2 || "$39.99",
          reason: t.exploreReason1 || "Narrative-heavy genre expansion.",
        },
        {
          appId: 255710,
          name: "Cities: Skylines",
          mediaType: "image",
          media:
            "https://cdn.akamai.steamstatic.com/steam/apps/255710/library_600x900.jpg",
          mediaFallback:
            "https://cdn.akamai.steamstatic.com/steam/apps/255710/header.jpg",
          positiveRate: "92%",
          players: "20k online",
          price: t.priceSample3 || "$29.99",
          reason: t.exploreReason2 || "Strategy-building experience outside your usual lane.",
        },
      ],
    },
  };
}

let fallbackScenarioData = buildFallbackScenarioData(currentLang);

let currentScenarioData = { ...fallbackScenarioData };
let currentSteamId = "";
let currentProfileData = null;
const recommendationHistory = new Set();
let refreshCount = 0;
let currentScenarioOrder = null;
let selectedGamingMode = "pickles";
let currentResultMode = "pickles";
let currentPersona = null;
let autoContextMode = "pickles";
let autoContextDescription = "";
let isAnalyzing = false;
let currentStep = 1;
let sessionHasActivityDiff = false;
let prefetchAnalysisPromise = null;
let prefetchAnalysisKey = "";
let earlyPrefetchSteamId = null;
let earlyPrefetchPromise = null;
let earlyPrefetchKey = "";
let earlyProfile = null;
const EARLY_PREFETCH_DEBOUNCE_MS = 500;
let earlyPrefetchInputTimer = null;
let step2PrefetchDebounceTimer = null;
let scenarioSwitchInProgress = false;
const STEP2_PREFETCH_DEBOUNCE_MS = 600;
const HISTORY_STORAGE_KEY = "steamsense.recommendationHistory.v1";
const SESSION_STORAGE_KEY = "steamsense.session.v1";

const refreshFlavors = [
  "focus on indie gems",
  "focus on hidden masterpieces",
  "focus on creative mechanics over graphics",
  "focus on high-replayability games",
  "focus on under-the-radar co-op picks",
  "focus on fresh tags related to the user's top games",
];

const scenarioAnglePacks = [
  {
    id: "comfort_plus",
    daily: "comfort picks with low friction",
    trending: "currently hot but onboarding-friendly",
    taste: "closest to user favorites",
    explore: "small step outside comfort zone",
  },
  {
    id: "indie_discovery",
    daily: "short indie sessions",
    trending: "fast-growing indie multiplayer",
    taste: "stylish indie games matching profile tags",
    explore: "experimental indie genres",
  },
  {
    id: "challenge_arc",
    daily: "skill-focused quick runs",
    trending: "competitive/high-skill online games",
    taste: "deep mastery games aligned with history",
    explore: "hard but rewarding new genres",
  },
  {
    id: "narrative_mood",
    daily: "story-rich short sessions",
    trending: "popular narrative social titles",
    taste: "emotion-driven games matching past narrative choices",
    explore: "unique narrative structures in new genres",
  },
];

function setAuthenticatedUi(isAuthenticated) {
  logoutBtn.classList.toggle("is-hidden", !isAuthenticated);
}

function renderTags(tags) {
  tagsContainer.innerHTML = "";
  tags.forEach((tagText) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = tagText;
    tagsContainer.appendChild(tag);
  });
}

function loadHistoryStore() {
  try {
    const raw = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveHistoryStore(store) {
  try {
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Ignore localStorage write issues.
  }
}

function saveSessionState(steamId, deviceProfile) {
  if (!steamId || !deviceProfile) return;
  try {
    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        steamId,
        deviceProfile,
        lang: currentLang,
        savedAt: Date.now(),
      })
    );
  } catch {
    // Ignore localStorage write issues.
  }
}

function loadSessionState() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.steamId || !parsed.deviceProfile) return null;
    return parsed;
  } catch {
    return null;
  }
}

function clearSessionState() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore localStorage write issues.
  }
}

function loadPersistedHistoryForSteamId(steamId) {
  if (!steamId) return [];
  const store = loadHistoryStore();
  const row = store[steamId];
  if (!row || !Array.isArray(row.ids)) return [];
  return row.ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(-240);
}

function savePersistedHistoryForSteamId(steamId) {
  if (!steamId) return;
  const store = loadHistoryStore();
  store[steamId] = {
    updatedAt: Date.now(),
    ids: Array.from(recommendationHistory).slice(-240),
  };
  saveHistoryStore(store);
}

const PERSONA_ATTR_LABELS = { action: "操作", strategy: "策略", exploration: "探索", social: "社交", immersion: "沉浸" };

function renderPersona(persona) {
  const rawCode = String(persona?.code || "GMRX").toUpperCase().slice(0, 4);
  if (rawCode === "----") {
    personaCode.textContent = "----";
  } else {
    personaCode.textContent = /^[A-Z]{4}$/.test(rawCode) ? rawCode : "GMRX";
  }
  personaName.textContent = String(persona?.name || "Adaptive Strategist");
  personaReview.textContent = String(
    persona?.review ||
      "You play with flexible priorities and solid instincts across both comfort picks and new experiments."
  );

  const attrs = persona?.attributes && typeof persona.attributes === "object" ? persona.attributes : {};
  const attrKeys = ["action", "strategy", "exploration", "social", "immersion"];
  if (personaStatsEl) {
    attrKeys.forEach((key) => {
      const row = personaStatsEl.querySelector(`.persona-stat-row[data-attr="${key}"]`);
      if (!row) return;
      const v = Number.isFinite(attrs[key]) ? Math.max(0, Math.min(100, Math.round(attrs[key]))) : 50;
          const fill = row.querySelector(".persona-stat-fill");
          const valueEl = row.querySelector(".persona-stat-value");
          if (fill) fill.style.width = `${v}%`;
          if (valueEl) valueEl.textContent = v;
        });
  }

  const traits = Array.isArray(persona?.traits) ? persona.traits.slice(0, 3) : [];
  if (personaTraitsEl) {
    personaTraitsEl.innerHTML = "";
    traits.forEach((t) => {
      const badge = document.createElement("span");
      badge.className = "persona-trait-badge";
      badge.textContent = String(t).trim() || "—";
      personaTraitsEl.appendChild(badge);
    });
  }

  if (personaMetaEl) {
    const code = String(persona?.code || "GMRX").toUpperCase().slice(0, 4);
    if (!code || code === "----" || !/^[A-Z]{4}$/.test(code)) {
      personaMetaEl.textContent = "ANALYSIS_LOG_V2.0 // SYNC_STATUS: STABLE";
    } else {
      const genId = code.charCodeAt(0) * 10 + (code.charCodeAt(2) || 0) % 10;
      const sync = 85 + (code.charCodeAt(0) + code.charCodeAt(1)) % 15;
      personaMetaEl.textContent = `ANALYSIS_LOG_V2.0 // ID: GEN-${genId} // SYNC: ${sync}%`;
    }
  }
}

function setStatus(text, color) {
  statusPill.textContent = text;
  statusPill.style.background = color;
}

function setCurrentStep(step) {
  currentStep = step;
  const panels = [step1Panel, step2Panel, step3Panel];
  panels.forEach((panel) => {
    if (!panel) return;
    const panelStep = Number(panel.dataset.step || 0);
    panel.classList.toggle("is-active", panelStep === step);
  });

  const steps = [
    { el: progressStep1, num: 1 },
    { el: progressStep2, num: 2 },
    { el: progressStep3, num: 3 },
  ];
  steps.forEach(({ el, num }) => {
    if (!el) return;
    el.classList.toggle("is-active", num === step);
    el.classList.toggle("is-complete", num < step);
  });
}

function setSoulLoading(isLoading) {
  soulLoading.classList.toggle("is-hidden", !isLoading);
  step3Content.classList.toggle("is-hidden", isLoading);
}

function setSoulLoadingText(text) {
  const el = document.getElementById("soul-loading-text");
  if (el) el.textContent = text || t("step3Loading");
}

function computeChinaContextMode() {
  const now = new Date();
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(now).toLowerCase();
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Shanghai",
      hour: "2-digit",
      hour12: false,
    }).format(now)
  );
  const isWeekend = weekday.startsWith("sat") || weekday.startsWith("sun");
  if (isWeekend || hour >= 19) {
    return { mode: "flow", note: t("contextAutoWeekend") };
  }
  return { mode: "pickles", note: t("contextAutoWeekday") };
}

function updateContextCopy() {
  if (!contextCopy) return;
  const note = autoContextDescription || "Auto-selected by China work schedule. You can override here.";
  contextCopy.textContent = note;
}

function t(key) {
  const pack = translations["zh-CN"];
  return (pack && pack[key]) || "";
}

function applyTranslations() {
  document.documentElement.lang = "zh-CN";
  document.body.classList.add("lang-zh");
  step3Content.classList.add("ai-output");
  const howItWorks = document.getElementById("how-it-works");
  if (howItWorks) howItWorks.textContent = t("howItWorks");
  const progress1 = document.getElementById("progress-label-1");
  const progress2 = document.getElementById("progress-label-2");
  const progress3 = document.getElementById("progress-label-3");
  if (progress1) progress1.textContent = t("progressIdentity");
  if (progress2) progress2.textContent = t("progressHardware");
  if (progress3) progress3.textContent = t("progressAnalysis");

  const step1Title = document.getElementById("step1-title");
  const step1Headline = document.getElementById("step1-headline");
  const step1Copy = document.getElementById("step1-copy");
  const loginSteam = document.getElementById("login-steam");
  const labelSteamId = document.getElementById("label-steam-id");
  if (step1Title) step1Title.textContent = t("step1Title");
  if (step1Headline) step1Headline.textContent = t("step1Headline");
  if (step1Copy) step1Copy.textContent = t("step1Copy");
  if (loginSteam) loginSteam.textContent = t("loginSteam");
  if (labelSteamId) labelSteamId.textContent = t("orEnterId");
  steamIdInput.placeholder = t("idPlaceholder");
  analyzeBtn.textContent = t("nextStep");
  if (currentStep === 1 && !currentProfileData) {
    step1Status.textContent = t("step1Waiting");
  }

  const step2Title = document.getElementById("step2-title");
  const step2Headline = document.getElementById("step2-headline");
  if (step2Title) step2Title.textContent = t("step2Title");
  if (step2Headline) step2Headline.textContent = t("step2Headline");
  const labelDeviceType = document.getElementById("label-device-type");
  if (labelDeviceType) labelDeviceType.textContent = t("deviceType");
  const optPc = document.getElementById("opt-pc");
  const optHandheld = document.getElementById("opt-handheld");
  if (optPc) optPc.textContent = t("pcOption");
  if (optHandheld) optHandheld.textContent = t("handheldOption");
  const labelCpu = document.getElementById("label-cpu-tier");
  const labelGpu = document.getElementById("label-gpu-tier");
  const labelMem = document.getElementById("label-memory");
  if (labelCpu) labelCpu.textContent = t("cpuTier");
  if (labelGpu) labelGpu.textContent = t("gpuTier");
  if (labelMem) labelMem.textContent = t("memory");
  const optCpuEntry = document.getElementById("opt-cpu-entry");
  const optCpuMid = document.getElementById("opt-cpu-mid");
  const optCpuHigh = document.getElementById("opt-cpu-high");
  if (optCpuEntry) optCpuEntry.textContent = t("cpuEntry");
  if (optCpuMid) optCpuMid.textContent = t("cpuMid");
  if (optCpuHigh) optCpuHigh.textContent = t("cpuHigh");
  const optGpuIntegrated = document.getElementById("opt-gpu-integrated");
  const optGpuMid = document.getElementById("opt-gpu-mid");
  const optGpuHigh = document.getElementById("opt-gpu-high");
  if (optGpuIntegrated) optGpuIntegrated.textContent = t("gpuIntegrated");
  if (optGpuMid) optGpuMid.textContent = t("gpuMid");
  if (optGpuHigh) optGpuHigh.textContent = t("gpuHigh");
  const labelHandheld = document.getElementById("label-handheld-model");
  if (labelHandheld) labelHandheld.textContent = t("handheldModel");
  backToStep1Btn.textContent = t("back");
  step2AnalyzeBtn.textContent = t("analyzeDestiny");

  const soulText = document.getElementById("soul-loading-text");
  if (soulText) soulText.textContent = t("step3Loading");
  const analysisTitle = document.getElementById("analysis-title");
  if (analysisTitle) analysisTitle.textContent = t("analysisTitle");
  if (currentStep !== 3) {
    statusPill.textContent = t("waitingProfile");
    summary.textContent = t("preparing");
  }
  const contextTitle = document.getElementById("context-title");
  if (contextTitle) contextTitle.textContent = t("contextTitle");
  contextCopy.textContent = t("contextCopy");
  document.getElementById("mode-pickles-label").textContent = t("pickles");
  document.getElementById("mode-pickles-sub").textContent = t("snackable");
  document.getElementById("mode-flow-label").textContent = t("flow");
  document.getElementById("mode-flow-sub").textContent = t("deepDive");
  const personaLabel = document.getElementById("persona-label");
  if (personaLabel) personaLabel.textContent = t("personaLabel");
  if (!currentPersona) {
    personaName.textContent = t("personaPending");
    personaReview.textContent = t("personaPendingCopy");
  }
  logoutBtn.textContent = t("logout");
  if (!currentProfileData) {
    profileId.textContent = t("steamIdNotConnected");
  }
  document.getElementById("stat-label-games").textContent = t("gamesInLibrary");
  document.getElementById("stat-label-playtime").textContent = t("totalPlaytime");
  profileLink.textContent = t("openProfile");
  document.getElementById("recommendation-title").textContent = t("recommendationScenarios");
  document.getElementById("destiny-hint").innerHTML = t("destinyHint");
  refreshBtn.textContent = t("refresh");
  backToStep2Btn.textContent = t("editHardware");
  startOverBtn.textContent = t("startOver");
  const footer = document.getElementById("footer-copy");
  if (footer) footer.textContent = t("footer");
  const modalTitleEl = document.getElementById("modal-title");
  if (modalTitleEl) modalTitleEl.textContent = t("gameDetails");
  document.getElementById("close-modal").textContent = t("close");
}

function setLanguage() {
  currentLang = "zh-CN";
  localStorage.setItem("steamsense.lang", currentLang);
  applyTranslations();
  const auto = computeChinaContextMode();
  autoContextMode = auto.mode;
  autoContextDescription = auto.note;
  updateContextCopy();
  fallbackScenarioData = buildFallbackScenarioData(currentLang);
  const noData = !currentScenarioData || Object.values(currentScenarioData).every((lane) => (lane.games || []).length === 0);
  if (!currentPersona || noData) {
    currentScenarioData = { ...fallbackScenarioData };
  }
  renderRecommendations(currentScenarioData, currentScenarioOrder);
}

function getCurrentProfileHint() {
  if (currentProfileData) {
    return {
      personaName: currentProfileData.personaName,
      gameCount: currentProfileData.gameCount,
      totalPlaytime: currentProfileData.totalPlaytime,
    };
  }
  return {
    personaName: profileName.textContent || "",
    gameCount: Number(statGames.textContent) || 0,
    totalPlaytime: statPlaytime.textContent || "",
  };
}

function profileToHint(profile) {
  if (!profile) return getCurrentProfileHint();
  return {
    personaName: profile.personaName ?? "",
    gameCount: profile.gameCount ?? 0,
    totalPlaytime: profile.totalPlaytime ?? "",
  };
}

function runEarlyPrefetch(steamId) {
  if (!/^\d{17}$/.test(steamId)) return;
  if (earlyPrefetchSteamId === steamId && earlyPrefetchPromise) return;
  earlyPrefetchSteamId = steamId;
  earlyProfile = null;
  earlyPrefetchKey = "";
  earlyPrefetchPromise = null;
  fetchSteamProfile(steamId)
    .then((profile) => {
      if (earlyPrefetchSteamId !== steamId) return;
      earlyProfile = profile;
      const auto = computeChinaContextMode();
      const deviceProfile = collectDeviceProfile();
      const key = buildAnalysisKey(steamId, deviceProfile, auto.mode);
      earlyPrefetchKey = key;
      earlyPrefetchPromise = fetchAiAnalysis(
        steamId,
        profileToHint(profile),
        "",
        { isRefresh: false, temperature: 0.65 },
        deviceProfile
      );
    })
    .catch(() => {
      if (earlyPrefetchSteamId === steamId) {
        earlyPrefetchSteamId = null;
        earlyProfile = null;
        earlyPrefetchPromise = null;
        earlyPrefetchKey = "";
      }
    });
}

function buildAnalysisKey(steamId, deviceProfile, mode) {
  return JSON.stringify({
    steamId,
    mode,
    type: deviceProfile?.type || "pc",
    cpuTier: deviceProfile?.cpuTier || "",
    gpuTier: deviceProfile?.gpuTier || "",
    ramGb: deviceProfile?.ramGb || 0,
    handheldModel: deviceProfile?.handheldModel || "",
  });
}

function applyAiResult(ai, order = null, options = {}) {
  updateHardwareSummary(collectDeviceProfile());
  currentResultMode = selectedGamingMode;
  if (ai?.gamingPersona && options.updatePersona !== false) {
    currentPersona = ai.gamingPersona;
    renderPersona(ai.gamingPersona);
  }
  renderTags(ai.playstyleTags || []);
  currentScenarioData = ai.scenarios || fallbackScenarioData;
  currentScenarioOrder = order;
  renderRecommendations(currentScenarioData, currentScenarioOrder);
  collectScenarioAppIds(currentScenarioData).forEach((id) => recommendationHistory.add(id));
  if (currentSteamId) savePersistedHistoryForSteamId(currentSteamId);
}

function startPrefetchAnalysis() {
  if (!currentSteamId || !currentProfileData) return;
  const auto = computeChinaContextMode();
  autoContextMode = auto.mode;
  autoContextDescription = auto.note;
  setGamingMode(autoContextMode);
  updateContextCopy();
  const deviceProfile = collectDeviceProfile();
  const key = buildAnalysisKey(currentSteamId, deviceProfile, selectedGamingMode);
  prefetchAnalysisKey = key;
  prefetchAnalysisPromise = fetchAiAnalysis(
    currentSteamId,
    getCurrentProfileHint(),
    "",
    { isRefresh: false, temperature: 0.65 },
    deviceProfile
  );
}

function scheduleStep2Prefetch() {
  if (currentStep !== 2 || !currentSteamId || !currentProfileData) return;
  if (step2PrefetchDebounceTimer) clearTimeout(step2PrefetchDebounceTimer);
  step2PrefetchDebounceTimer = setTimeout(() => {
    step2PrefetchDebounceTimer = null;
    startPrefetchAnalysis();
  }, STEP2_PREFETCH_DEBOUNCE_MS);
}

function setGamingMode(mode) {
  selectedGamingMode = mode === "flow" ? "flow" : "pickles";
  const picklesActive = selectedGamingMode === "pickles";
  const flowActive = selectedGamingMode === "flow";
  modePicklesBtn.classList.toggle("is-active", picklesActive);
  modePicklesBtn.classList.toggle("active", picklesActive);
  modeFlowBtn.classList.toggle("is-active", flowActive);
  modeFlowBtn.classList.toggle("active", flowActive);
  triggerRecommendationsFade();
  scheduleStep2Prefetch();
  if (currentStep === 3 && currentSteamId && currentProfileData && !scenarioSwitchInProgress) {
    handleRefreshRecommendations();
  }
}

async function fetchAndApplyScenarioSwitch() {
  scenarioSwitchInProgress = true;
  setStatus(t("switchingScenario"), "#f5ae2b");
  try {
    const deviceProfile = collectDeviceProfile();
    const order = shuffledScenarioOrder();
    const ai = await fetchAiAnalysis(
      currentSteamId,
      getCurrentProfileHint(),
      "",
      { isRefresh: false, temperature: 0.65 },
      deviceProfile
    );
    applyAiResult(ai, order, { updatePersona: false });
    summary.textContent = ai.summary || t("analysisComplete");
    setStatus(t("analysisComplete"), "#39d6c6");
  } catch (err) {
    setStatus(t("errorLabel"), "#ff6c7a");
    summary.textContent = err.message || t("errorLabel");
  } finally {
    scenarioSwitchInProgress = false;
  }
}

function steamLinkForApp(appId) {
  return `https://store.steampowered.com/app/${appId}`;
}

function compatibilityMeta(level) {
  if (level === "smooth") return { label: t("compatSmooth"), className: "compat-green" };
  if (level === "unplayable") return { label: t("compatUnplayable"), className: "compat-red" };
  return { label: t("compatPlayable"), className: "compat-yellow" };
}

function handheldLabel(value) {
  if (value === "verified") return t("handheldVerified");
  if (value === "playable") return t("handheldPlayable");
  if (value === "unsupported") return t("handheldUnsupported");
  return "";
}

function modeBadgeMeta(mode) {
  if (mode === "flow") {
    return { label: t("flowFit"), className: "mode-fit-flow" };
  }
  return { label: t("snackableFit"), className: "mode-fit-pickles" };
}

function destinyTypeLabel(type) {
  if (type === "creative_lineage") return t("destinyTypeCreative");
  if (type === "hardware_atmospheric_synergy") return t("destinyTypeHardware");
  return t("destinyTypePhilosophical");
}

function triggerRecommendationsFade() {
  if (!recommendationGrid) return;
  // restart animation if already applied
  recommendationGrid.classList.remove("recommendation-grid-fade");
  // force reflow
  // eslint-disable-next-line no-unused-expressions
  recommendationGrid.offsetWidth;
  recommendationGrid.classList.add("recommendation-grid-fade");
}

function runTypewriter(target, text, speed = 16) {
  if (!target) return;
  const fullText = String(text || "").trim();
  if (target._typewriterTimer) {
    clearInterval(target._typewriterTimer);
    target._typewriterTimer = null;
  }
  target.textContent = "";
  if (!fullText) return;
  let idx = 0;
  const timer = setInterval(() => {
    idx += 1;
    target.textContent = fullText.slice(0, idx);
    if (idx >= fullText.length) {
      clearInterval(timer);
      target._typewriterTimer = null;
    }
  }, speed);
  target._typewriterTimer = timer;
}

function createGameCard(game, revealIndex) {
  const card = document.createElement("article");
  card.className = "game-card";
  card.dataset.appId = String(game.appId);

  const mediaWrap = document.createElement("div");
  mediaWrap.className = "game-media-wrap";

  const image = document.createElement("img");
  image.className = "game-media";
  image.src = game.media || "";
  if (game.mediaFallback) {
    image.dataset.fallback = game.mediaFallback;
  }
  image.addEventListener("error", () => {
    const fallback = image.dataset.fallback;
    if (fallback && image.src !== fallback) {
      image.src = fallback;
    }
  });
  image.alt = `${game.name} poster`;
  mediaWrap.appendChild(image);
  if (game.isNewRelease) {
    const newBadge = document.createElement("span");
    newBadge.className = "new-release-badge";
    newBadge.textContent = t("newReleaseBadge");
    newBadge.setAttribute("aria-label", t("newReleaseBadge"));
    mediaWrap.appendChild(newBadge);
  }
  if (sessionHasActivityDiff) {
    const trendBadge = document.createElement("span");
    trendBadge.className = "trend-badge";
    trendBadge.textContent = t("newTrendBadge");
    trendBadge.setAttribute("aria-label", t("newTrendBadge"));
    mediaWrap.appendChild(trendBadge);
  }

  const info = document.createElement("div");
  info.className = "card-info";

  const title = document.createElement("h4");
  title.textContent = game.name;
  info.appendChild(title);

  const compat = compatibilityMeta(game.compatibility || "playable");
  const topLine = document.createElement("div");
  topLine.className = "card-topline";
  topLine.innerHTML = `<span class="compat-badge ${compat.className}">${compat.label}</span>`;
  const hhLabel = handheldLabel(game.handheldCompatibility);
  if (hhLabel) {
    const hh = document.createElement("span");
    hh.className = "handheld-badge";
    hh.textContent = hhLabel;
    topLine.appendChild(hh);
  }
  const modeMeta = modeBadgeMeta(currentResultMode);
  const modeBadge = document.createElement("span");
  modeBadge.className = `mode-fit-badge ${modeMeta.className}`;
  modeBadge.textContent = modeMeta.label;
  topLine.appendChild(modeBadge);
  if (game.fromLibrary) {
    const lib = document.createElement("span");
    lib.className = "library-badge";
    lib.textContent = t("libraryValue");
    topLine.appendChild(lib);
  }
  const destinyScore = Number(game.destinyScore || 0);
  if (destinyScore > 90) {
    const destined = document.createElement("span");
    destined.className = "destined-badge";
    destined.textContent = t("destined");
    topLine.appendChild(destined);
  }
  info.appendChild(topLine);

  const priceLine = document.createElement("div");
  priceLine.className = "card-price";
  priceLine.textContent = game.fromLibrary ? t("libraryValue") : `${t("priceLabel")}: ${game.price || t("naLabel")}`;
  info.appendChild(priceLine);

  const metrics = document.createElement("div");
  metrics.className = "game-metrics";
  const thirdMetric = game.fromLibrary
    ? `<article class="metric">
         <span class="metric-label">${t("sourceLabel")}</span>
         <span class="metric-value">${t("libraryValue")}</span>
       </article>`
    : `<article class="metric">
         <span class="metric-label">${t("priceLabel")}</span>
       <span class="metric-value">${game.price || t("naLabel")}</span>
       </article>`;
  metrics.innerHTML = `
    <article class="metric">
      <span class="metric-label">${t("positiveLabel")}</span>
      <span class="metric-value">${game.positiveRate || t("naLabel")}</span>
    </article>
    <article class="metric">
      <span class="metric-label">${t("playersLabel")}</span>
      <span class="metric-value">${game.players || t("naLabel")}</span>
    </article>
    ${thirdMetric}
  `;
  info.appendChild(metrics);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const detailsBtn = document.createElement("button");
  detailsBtn.type = "button";
  detailsBtn.className = "ghost-btn card-btn";
  detailsBtn.textContent = t("viewDetails");
  detailsBtn.addEventListener("click", () => openGameModal(game.appId, game.name, game.reason, game.destinyLink));

  const steamLink = document.createElement("a");
  steamLink.className = "steam-link";
  steamLink.href = steamLinkForApp(game.appId);
  steamLink.target = "_blank";
  steamLink.rel = "noreferrer";
  steamLink.textContent = t("openSteamPage");

  actions.appendChild(detailsBtn);
  actions.appendChild(steamLink);

  info.appendChild(actions);

  card.appendChild(mediaWrap);
  card.appendChild(info);

  if (typeof revealIndex === "number" && revealIndex >= 0) {
    card.classList.add("game-card--reveal");
    card.style.animationDelay = `${revealIndex * 0.05}s`;
  }
  return card;
}

function showRefiningIndicator() {
  if (refiningIndicator) {
    refiningIndicator.classList.remove("is-hidden");
    if (refiningIndicatorText) refiningIndicatorText.textContent = t("refiningIndicator");
  }
  if (deeperInsightsBtn) deeperInsightsBtn.classList.add("is-hidden");
}

function hideRefiningIndicator() {
  if (refiningIndicator) refiningIndicator.classList.add("is-hidden");
}

function showDeeperInsightsButton() {
  if (refiningIndicator) refiningIndicator.classList.add("is-hidden");
  if (deeperInsightsBtn) {
    deeperInsightsBtn.textContent = t("deeperInsightsBtn");
    deeperInsightsBtn.classList.remove("is-hidden");
  }
}

function hideDeeperInsightsButton() {
  if (deeperInsightsBtn) deeperInsightsBtn.classList.add("is-hidden");
  pendingDeeperInsights = null;
}

function renderRecommendations(scenarios = currentScenarioData, forcedOrder = currentScenarioOrder, options = {}) {
  recommendationGrid.innerHTML = "";
  recommendationGrid.classList.remove("recommendation-grid--stagger");
  if (isAnalyzing) {
    const loading = document.createElement("div");
    loading.className = "lane loading-lane";
    loading.innerHTML = `
      <h3>${t("scanningStars")}</h3>
      <div class="skeleton-grid">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    `;
    recommendationGrid.appendChild(loading);
    return;
  }
  const staggerReveal = options.staggerReveal === true;
  if (staggerReveal) recommendationGrid.classList.add("recommendation-grid--stagger");

  let cardIndex = 0;
  const keys = forcedOrder && forcedOrder.length ? forcedOrder : Object.keys(scenarios || {});
  keys.forEach((key) => {
    const data = scenarios?.[key];
    if (!data) return;
    const games = data.games || [];
    if (!games.length) return;
    const lane = document.createElement("article");
    lane.className = "lane";

    const title = document.createElement("h3");
    title.textContent = data.title;

    const description = document.createElement("p");
    description.textContent = data.description;

    const laneGrid = document.createElement("div");
    laneGrid.className = "lane-grid";

    games.forEach((game) => {
      const idx = staggerReveal ? cardIndex++ : undefined;
      laneGrid.appendChild(createGameCard(game, idx));
    });

    lane.appendChild(title);
    lane.appendChild(description);
    lane.appendChild(laneGrid);
    recommendationGrid.appendChild(lane);
  });
}

function collectScenarioAppIds(scenarios) {
  const ids = [];
  Object.values(scenarios || {}).forEach((lane) => {
    (lane?.games || []).forEach((game) => {
      const appId = Number(game?.appId);
      if (Number.isInteger(appId) && appId > 0) ids.push(appId);
    });
  });
  return ids;
}

function openModal() {
  if (typeof gameModal.showModal === "function") {
    gameModal.showModal();
  } else {
    gameModal.setAttribute("open", "true");
  }
}

function closeModal() {
  gameModal.close();
}

async function openGameModal(appId, fallbackName, recommendationReason, destinyLink) {
  modalTitle.textContent = fallbackName || t("gameDetails");
  modalBody.innerHTML = `<p class="modal-loading">${t("modalLoading")}</p>`;
  openModal();

  try {
    const response = await fetch(`/api/game/${appId}?lang=${encodeURIComponent(currentLang)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("gameDetailsError"));

    modalTitle.textContent = data.name;
    const mediaHtml = data.trailerUrl
      ? `<video class="modal-image" controls preload="none" poster="${data.trailerPoster || data.headerImage || ""}">
           <source src="${data.trailerUrl}" type="video/mp4" />
         </video>`
      : `<img class="modal-image" src="${data.headerImage}" alt="${data.name} header" />`;
    const reasonBlock =
      recommendationReason && recommendationReason.trim()
        ? `<section class="modal-reason"><h4 class="modal-reason-title">推荐理由</h4><p class="modal-reason-text">${escapeHtml(recommendationReason)}</p></section>`
        : "";
    const destinyBlock =
      destinyLink && String(destinyLink).trim()
        ? `<section class="modal-reason"><h4 class="modal-reason-title">命运链接</h4><p class="modal-reason-text">${escapeHtml(String(destinyLink).trim())}</p></section>`
        : "";
    modalBody.innerHTML = `
      ${mediaHtml}
      ${reasonBlock}
      ${destinyBlock}
      <p class="modal-description">${escapeHtml(data.shortDescription || "")}</p>
      <div class="modal-metrics">
        <article class="metric"><span class="metric-label">${t("positiveLabel")}</span><span class="metric-value">${data.positiveRate}</span></article>
        <article class="metric"><span class="metric-label">${t("playersLabel")}</span><span class="metric-value">${data.currentPlayers}</span></article>
        <article class="metric"><span class="metric-label">${t("priceLabel")}</span><span class="metric-value">${data.price}</span></article>
      </div>
      <p><strong>${t("releaseLabel")}:</strong> ${escapeHtml(data.releaseDate || "")}</p>
      <p><strong>${t("genresLabel")}:</strong> ${data.genres && data.genres.length ? data.genres.join(", ") : t("naLabel")}</p>
      <a class="steam-link" href="${data.steamUrl || "#"}" target="_blank" rel="noreferrer">${t("goStore")}</a>
    `;
  } catch (error) {
    modalBody.innerHTML = `<p class="modal-error">${error.message || t("gameDetailsError")}</p>`;
  }
}

function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function fetchSteamProfile(steamId) {
  const response = await fetch(`/api/steam-profile?steamId=${encodeURIComponent(steamId)}&lang=${encodeURIComponent(currentLang)}`);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Failed to fetch Steam profile.");
  return data;
}

function shuffledScenarioOrder() {
  const keys = Object.keys(currentScenarioData || fallbackScenarioData);
  for (let i = keys.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  return keys;
}

function pickRefreshFlavor() {
  return refreshFlavors[Math.floor(Math.random() * refreshFlavors.length)];
}

function pickScenarioAnglePack() {
  const idx = refreshCount % scenarioAnglePacks.length;
  return scenarioAnglePacks[idx];
}

async function fetchAiAnalysis(steamId, profileHint, refreshToken = "", refreshOptions = {}, explicitDeviceProfile = null) {
  const deviceProfile = explicitDeviceProfile || collectDeviceProfile();
  const analysisNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const response = await fetch("/api/ai-analysis", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      steamId,
      analysisNonce,
      lang: currentLang,
      deviceProfile,
      profileHint,
      refreshToken,
      refreshOptions,
      selectedMode: selectedGamingMode,
      personaOverride: refreshOptions?.isRefresh && currentPersona ? currentPersona : undefined,
      excludedAppIds: Array.from(recommendationHistory).slice(-72),
      recentRecommendedAppIds: Array.from(recommendationHistory).slice(-36),
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "AI analysis failed.");
  return data;
}

function collectDeviceProfile() {
  const type = deviceTypeSelect.value;
  if (type === "handheld") {
    return {
      type: "handheld",
      handheldModel: handheldModelSelect.value,
    };
  }

  return {
    type: "pc",
    cpuTier: pcCpuSelect.value,
    gpuTier: pcGpuSelect.value,
    ramGb: Number(pcRamSelect.value),
  };
}

function syncDeviceUi() {
  const isPc = deviceTypeSelect.value === "pc";
  pcSpecs.classList.toggle("is-hidden", !isPc);
  handheldSpecs.classList.toggle("is-hidden", isPc);
}

function updateHardwareSummary(deviceProfile) {
  const el = document.getElementById("hardware-info");
  if (!el) return;
  if (!deviceProfile) {
    el.textContent = "";
    return;
  }
  if (deviceProfile.type === "handheld") {
    const labels = {
      steam_deck: "Steam Deck",
      steam_deck_oled: "Steam Deck OLED",
      rog_ally: "ROG Ally",
      rog_ally_x: "ROG Ally X",
      legion_go: "Lenovo Legion Go",
      msi_claw: "MSI Claw",
      ayaneo_2: "Ayaneo 2",
      ayaneo_kun: "Ayaneo Kun",
      ayaneo_next: "Ayaneo Next",
      gpd_win4: "GPD Win 4",
      gpd_win_max: "GPD Win Max",
      onexplayer: "OneXPlayer",
      other: "其他掌机",
    };
    el.textContent = labels[deviceProfile.handheldModel] || "掌机";
    return;
  }
  const cpu = { low: "低配", mid: "中配", high: "高配" }[deviceProfile.cpuTier] || deviceProfile.cpuTier;
  const gpu = { low: "低配", mid: "中配", high: "高配" }[deviceProfile.gpuTier] || deviceProfile.gpuTier;
  const ram = deviceProfile.ramGb ? `${deviceProfile.ramGb}GB` : "";
  el.textContent = ["PC", cpu, gpu, ram].filter(Boolean).join(" · ");
}

function hydrateDeviceUi(deviceProfile) {
  if (!deviceProfile) return;
  updateHardwareSummary(deviceProfile);
  if (deviceProfile.type === "handheld") {
    deviceTypeSelect.value = "handheld";
    handheldModelSelect.value = deviceProfile.handheldModel || "steam_deck";
  } else {
    deviceTypeSelect.value = "pc";
    pcCpuSelect.value = deviceProfile.cpuTier || "mid";
    pcGpuSelect.value = deviceProfile.gpuTier || "mid";
    pcRamSelect.value = Number(deviceProfile.ramGb || 16);
  }
  syncDeviceUi();
}

function hydrateProfile(profile) {
  profileAvatar.src = profile.avatar;
  profileName.textContent = profile.personaName;
  profileId.textContent = `Steam ID: ${profile.steamId}`;
  statGames.textContent = String(profile.gameCount);
  statPlaytime.textContent = profile.totalPlaytime;
  profileLink.href = profile.profileUrl;
  setAuthenticatedUi(true);
  if (profile.degraded) {
    setStatus(t("steamDegraded"), "#f2c94c");
    summary.textContent = profile.warning || t("steamDegradedWarning");
  } else if (profile.stale) {
    setStatus(t("steamCached"), "#f2c94c");
  }
}

function resetToLoggedOutState() {
  clearSessionState();
  steamIdInput.value = "";
  currentSteamId = "";
  currentProfileData = null;
  refreshCount = 0;
  currentScenarioOrder = null;
  sessionHasActivityDiff = false;
  prefetchAnalysisPromise = null;
  prefetchAnalysisKey = "";
  earlyPrefetchSteamId = null;
  earlyProfile = null;
  earlyPrefetchPromise = null;
  earlyPrefetchKey = "";
  recommendationHistory.clear();
  currentPersona = null;
  const auto = computeChinaContextMode();
  autoContextMode = auto.mode;
  autoContextDescription = auto.note;
  setGamingMode(autoContextMode);
  updateContextCopy();
  step1Status.textContent = t("step1Waiting");
  profileAvatar.src =
    "https://avatars.akamai.steamstatic.com/7f8ecf95a35f9f6f8e6af4af34f748109f5e2b5a_full.jpg";
  profileName.textContent = "Guest User";
  profileId.textContent = "Steam ID: Not connected";
  statGames.textContent = "-";
  statPlaytime.textContent = "-";
  profileLink.href = "#";
  summary.textContent = t("enterSteamIdPrompt");
  renderPersona({
    code: "----",
    name: "Persona Pending",
    review: "Analyze your profile to generate your 4-letter gaming persona and witty personality review.",
  });
  renderTags([]);
  currentScenarioData = { ...fallbackScenarioData };
  renderRecommendations(currentScenarioData);
  setStatus("Waiting for profile", "#8ea0cf");
  setAuthenticatedUi(false);
  setSoulLoading(false);
  setCurrentStep(1);
}

async function handleAnalyze() {
  const steamId = steamIdInput.value.trim();
  if (!/^\d{17}$/.test(steamId)) {
    step1Status.textContent = t("enterValidId");
    return;
  }

  if (steamId === earlyPrefetchSteamId && earlyProfile) {
    if (steamId !== currentSteamId) {
      recommendationHistory.clear();
      loadPersistedHistoryForSteamId(steamId).forEach((id) => recommendationHistory.add(id));
      refreshCount = 0;
      currentScenarioOrder = null;
    }
    currentSteamId = steamId;
    currentProfileData = earlyProfile;
    hydrateProfile(earlyProfile);
    prefetchAnalysisKey = earlyPrefetchKey;
    prefetchAnalysisPromise = earlyPrefetchPromise;
    earlyPrefetchSteamId = null;
    earlyProfile = null;
    earlyPrefetchPromise = null;
    earlyPrefetchKey = "";
    step1Status.textContent = t("identityConfirmed");
    setCurrentStep(2);
    return;
  }

  step1Status.textContent = t("retrievingIdentity");

  try {
    if (steamId !== currentSteamId) {
      recommendationHistory.clear();
      loadPersistedHistoryForSteamId(steamId).forEach((id) => recommendationHistory.add(id));
      refreshCount = 0;
      currentScenarioOrder = null;
    }
    const profile = await fetchSteamProfile(steamId);
    currentSteamId = steamId;
    currentProfileData = profile;
    hydrateProfile(profile);
    startPrefetchAnalysis();
    step1Status.textContent = t("identityConfirmed");
    setCurrentStep(2);
  } catch (error) {
    step1Status.textContent = error.message;
  }
}

async function handleStep2Analyze() {
  if (!currentSteamId || !currentProfileData) {
    setCurrentStep(1);
    step1Status.textContent = t("needIdentity");
    return;
  }
  setCurrentStep(3);
  setSoulLoading(true);
  setSoulLoadingText(t("syncingDestinyData"));
  if (soulLoading) soulLoading.classList.add("soul-loading--syncing");
  isAnalyzing = true;
  renderRecommendations();
  setStatus(t("analysisRunning"), "#f5ae2b");
  summary.textContent = t("step3Loading");
  hideRefiningIndicator();
  hideDeeperInsightsButton();

  const auto = computeChinaContextMode();
  autoContextMode = auto.mode;
  autoContextDescription = auto.note;
  setGamingMode(autoContextMode);
  updateContextCopy();

  const deviceProfile = collectDeviceProfile();
  saveSessionState(currentSteamId, deviceProfile);
  const expectedKey = buildAnalysisKey(currentSteamId, deviceProfile, selectedGamingMode);
  const startedAt = Date.now();
  let analysisSuccess = false;

  try {
    let ai;
    if (prefetchAnalysisPromise && prefetchAnalysisKey === expectedKey) {
      try {
        ai = await prefetchAnalysisPromise;
      } catch {
        ai = await fetchAiAnalysis(
          currentSteamId,
          getCurrentProfileHint(),
          "",
          { isRefresh: false, temperature: 0.65 },
          deviceProfile
        );
      }
    } else {
      ai = await fetchAiAnalysis(
        currentSteamId,
        getCurrentProfileHint(),
        "",
        { isRefresh: false, temperature: 0.65 },
        deviceProfile
      );
    }
    applyAiResult(ai, null, { updatePersona: true });
    analysisSuccess = true;
    isAnalyzing = false;
    summary.textContent = ai.summary || `${t("analysisComplete")} · ${currentProfileData.personaName}`;
    if (ai.usedFallback) {
      showRefiningIndicator();
      (async () => {
        try {
          const retry = await fetchAiAnalysis(
            currentSteamId,
            getCurrentProfileHint(),
            "",
            { isRefresh: false, temperature: 0.65 },
            deviceProfile
          );
          if (!retry.usedFallback) {
            pendingDeeperInsights = retry;
            showDeeperInsightsButton();
          } else {
            setTimeout(hideRefiningIndicator, 4000);
          }
        } catch {
          setTimeout(hideRefiningIndicator, 4000);
        }
      })();
    }
    setStatus(t("analysisComplete"), "#39d6c6");
  } catch (error) {
    isAnalyzing = false;
    setStatus(t("errorLabel"), "#ff6c7a");
    summary.textContent = error.message;
  }

  const elapsed = Date.now() - startedAt;
  const waitMs = Math.max(0, WAIT_FOR_AI_MS - elapsed);
  await new Promise((r) => setTimeout(r, waitMs));

  setSoulLoading(false);
  if (soulLoading) soulLoading.classList.remove("soul-loading--syncing");
  renderRecommendations(currentScenarioData, currentScenarioOrder, { staggerReveal: analysisSuccess });
}

async function handleRefreshRecommendations() {
  if (!currentSteamId || currentStep !== 3) {
    setStatus(t("noProfile"), "#ff6c7a");
    summary.textContent = t("openAnalysisFirst");
    return;
  }

  setStatus(t("refreshing"), "#f5ae2b");
  summary.textContent = t("refreshing");
  isAnalyzing = true;
  renderRecommendations();

  try {
    const flavor = pickRefreshFlavor();
    const anglePack = pickScenarioAnglePack();
    const order = shuffledScenarioOrder();
    refreshCount += 1;

    const ai = await fetchAiAnalysis(
      currentSteamId,
      getCurrentProfileHint(),
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      {
        isRefresh: true,
        flavor,
        scenarioAnglePack: anglePack,
        scenarioOrder: order,
        temperature: 0.88,
      }
    );
    applyAiResult(ai, order, { updatePersona: false });

    summary.textContent = ai.summary || t("refresh");
    setStatus(t("analysisComplete"), "#39d6c6");
  } catch (error) {
    setStatus(t("errorLabel"), "#ff6c7a");
    summary.textContent = error.message;
  } finally {
    isAnalyzing = false;
    renderRecommendations(currentScenarioData, currentScenarioOrder);
  }
}

steamLoginBtn.addEventListener("click", () => {
  window.location.href = "/auth/steam/login";
});
modePicklesBtn.addEventListener("click", () => setGamingMode("pickles"));
modeFlowBtn.addEventListener("click", () => setGamingMode("flow"));
const tacticalTarotEntry = document.getElementById("tactical-tarot-entry");
if (tacticalTarotEntry) {
  tacticalTarotEntry.addEventListener("click", () => {
    if (particleSystemInstance && typeof particleSystemInstance.setCeremonyEntry === "function") {
      particleSystemInstance.setCeremonyEntry(true);
    }
  });
}
deviceTypeSelect.addEventListener("change", () => {
  syncDeviceUi();
  scheduleStep2Prefetch();
});
[pcCpuSelect, pcGpuSelect, pcRamSelect, handheldModelSelect].forEach((el) => {
  if (el) el.addEventListener("change", scheduleStep2Prefetch);
});
refreshBtn.addEventListener("click", handleRefreshRecommendations);
if (howItWorksBtn && howItWorksModal) {
  howItWorksBtn.addEventListener("click", () => howItWorksModal.showModal());
}
if (howItWorksClose && howItWorksModal) {
  howItWorksClose.addEventListener("click", () => howItWorksModal.close());
}
if (howItWorksModal) {
  howItWorksModal.addEventListener("click", (e) => {
    if (e.target === howItWorksModal) howItWorksModal.close();
  });
  howItWorksModal.addEventListener("cancel", () => howItWorksModal.close());
}
if (deeperInsightsBtn) {
  deeperInsightsBtn.addEventListener("click", () => {
    if (!pendingDeeperInsights) return;
    applyAiResult(pendingDeeperInsights, null, { updatePersona: true });
    summary.textContent = pendingDeeperInsights.summary || `${t("analysisComplete")} · ${currentProfileData?.personaName || ""}`;
    setStatus(t("analysisComplete"), "#39d6c6");
    hideDeeperInsightsButton();
    renderRecommendations(currentScenarioData, currentScenarioOrder);
  });
}
step2AnalyzeBtn.addEventListener("click", handleStep2Analyze);
backToStep1Btn.addEventListener("click", () => setCurrentStep(1));
backToStep2Btn.addEventListener("click", () => setCurrentStep(2));
startOverBtn.addEventListener("click", resetToLoggedOutState);

analyzeBtn.addEventListener("click", handleAnalyze);
steamIdInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleAnalyze();
});
steamIdInput.addEventListener("input", () => {
  if (earlyPrefetchInputTimer) clearTimeout(earlyPrefetchInputTimer);
  const raw = steamIdInput.value.trim();
  if (raw.length !== 17 || !/^\d{17}$/.test(raw)) {
    if (earlyPrefetchSteamId) {
      earlyPrefetchSteamId = null;
      earlyProfile = null;
      earlyPrefetchPromise = null;
      earlyPrefetchKey = "";
    }
    return;
  }
  earlyPrefetchInputTimer = setTimeout(() => {
    earlyPrefetchInputTimer = null;
    runEarlyPrefetch(raw);
  }, EARLY_PREFETCH_DEBOUNCE_MS);
});

closeModalBtn.addEventListener("click", closeModal);
logoutBtn.addEventListener("click", () => {
  resetToLoggedOutState();
});
gameModal.addEventListener("click", (event) => {
  const rect = gameModal.getBoundingClientRect();
  const outside =
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom;
  if (outside) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && gameModal.open) closeModal();
});

function attachHapticClick(target) {
  if (!target) return;
  target.addEventListener("mousedown", () => {
    target.classList.add("mode-toggle--pressed");
  });
  ["mouseup", "mouseleave", "blur"].forEach((evt) => {
    target.addEventListener(evt, () => {
      target.classList.remove("mode-toggle--pressed");
    });
  });
}

attachHapticClick(modePicklesBtn);
attachHapticClick(modeFlowBtn);

function getSteamIdForTarot() {
  if (currentSteamId && /^\d{17}$/.test(currentSteamId)) return currentSteamId;
  const session = loadSessionState();
  return session && session.steamId && /^\d{17}$/.test(session.steamId) ? session.steamId : null;
}

function showTarotError(message) {
  if (tarotError) {
    tarotError.textContent = message || "";
    tarotError.classList.toggle("is-hidden", !message);
  }
  if (tarotLoading) tarotLoading.classList.add("is-hidden");
}

function renderTarotDestinyCard(game) {
  if (!tarotDestinyCard || !game) return;
  const steamUrl = game.steamUrl || `https://store.steampowered.com/app/${game.appId}`;
  tarotDestinyCard.innerHTML = `
    <div class="destiny-game-name">${escapeHtml(game.name || "")}</div>
    <div class="destiny-game-meta">${escapeHtml(game.positiveRate || "")} · ${escapeHtml(game.price || "")}</div>
    <a class="steam-link" href="${steamUrl}" target="_blank" rel="noreferrer">打开 Steam 商店</a>
  `;
}

function handleTarotCardClick() {
  if (!tarotCard || tarotCard.classList.contains("flipped")) return;
  const steamId = getSteamIdForTarot();
  if (!steamId) {
    showTarotError("请先完成身份验证并进入分析页");
    return;
  }
  showTarotError("");
  // 进入仪式：粒子向牌心聚合，牌面开始颤动
  if (particleSystemInstance && typeof particleSystemInstance.setCeremonyEntry === "function") {
    particleSystemInstance.setCeremonyEntry(true);
  }
  tarotCard.classList.add("trembling");
  const clickTime = Date.now();

  function doFlip(data) {
    tarotCard.classList.remove("trembling");
    applyTarotResult(data, { skipAnimation: false });
  }

  function scheduleFlipAfterTremble(data) {
    const elapsed = Date.now() - clickTime;
    const remaining = TAROT_TREMBLE_DURATION_MS - elapsed;
    if (remaining <= 0) {
      doFlip(data);
    } else {
      setTimeout(() => doFlip(data), remaining);
    }
  }

  const drawnToday = getTarotDrawnToday(steamId);
  if (drawnToday) {
    dailyFortuneData = drawnToday;
    setTimeout(() => doFlip(drawnToday), TAROT_TREMBLE_DURATION_MS);
    return;
  }
  if (dailyFortuneData) {
    setTimeout(() => doFlip(dailyFortuneData), TAROT_TREMBLE_DURATION_MS);
    return;
  }
  if (tarotLoading) tarotLoading.classList.remove("is-hidden");
  fetch(`/api/daily-fortune?steamId=${encodeURIComponent(steamId)}&lang=zh-CN`)
    .then((res) => res.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      dailyFortuneData = data;
      setTarotDrawnToday(steamId, data);
      scheduleFlipAfterTremble(data);
    })
    .catch((err) => {
      tarotCard.classList.remove("trembling");
      if (particleSystemInstance && typeof particleSystemInstance.setCeremonyEntry === "function") {
        particleSystemInstance.setCeremonyEntry(false);
      }
      showTarotError(err && err.message ? err.message : "运势获取失败，请稍后重试");
    })
    .finally(() => {
      if (tarotLoading) tarotLoading.classList.add("is-hidden");
    });
}

let flipSoundContext = null;

function playFlipSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    if (!flipSoundContext) flipSoundContext = new Ctx();
    const ctx = flipSoundContext;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.4);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  } catch (_) {}
}

function applyTarotResult(data, options) {
  if (!tarotCard || !data) return;
  const skipAnimation = options && options.skipAnimation === true;
  const card = data.card || {};
  const cardName = card.cardName || card.name || "——";
  const cardImageUrl = card.cardImageUrl || "";
  // 1. 先更新牌面图片和牌名（翻转前就准备好，翻转时直接显示）
  if (tarotCardName) tarotCardName.textContent = cardName;
  if (tarotCardImage) {
    tarotCardImage.src = cardImageUrl;
    tarotCardImage.style.display = cardImageUrl ? "block" : "none";
    tarotCardImage.alt = cardName;
  }
  // 2. 触发 3D 翻转（瞬时霓虹冲击波从牌面中心扩散 + 低沉嗡声）
  if (!skipAnimation) {
    if (typeof particleSystemInstance !== "undefined" && particleSystemInstance && typeof particleSystemInstance.createShockwave === "function") {
      const rect = tarotCard.getBoundingClientRect();
      particleSystemInstance.createShockwave(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5);
    }
    playFlipSound();
  }
  tarotCard.classList.add("flipped");
  if (skipAnimation) {
    // 恢复今日已抽：直接显示运势和本命游戏，无动画
    if (tarotFortuneWrap) tarotFortuneWrap.classList.remove("is-hidden");
    if (tarotFortuneText) tarotFortuneText.textContent = data.fortune || "";
    if (tarotDestinyGameWrap && data.game) {
      tarotDestinyGameWrap.classList.remove("is-hidden");
      tarotDestinyGameWrap.classList.add("is-visible");
      renderTarotDestinyCard(data.game);
    }
    return;
  }
  // 3. 翻转动画完成后再显示运势并开始打字机
  setTimeout(() => {
    if (tarotFortuneWrap) tarotFortuneWrap.classList.remove("is-hidden");
    if (tarotFortuneText) tarotFortuneText.textContent = "";
    const fortune = data.fortune || "";
    runTypewriter(tarotFortuneText, fortune, TAROT_TYPEWRITER_SPEED);
    const typewriterDuration = fortune.length * TAROT_TYPEWRITER_SPEED + 400;
    setTimeout(() => {
      if (tarotDestinyGameWrap && data.game) {
        tarotDestinyGameWrap.classList.remove("is-hidden");
        tarotDestinyGameWrap.classList.add("is-visible");
        renderTarotDestinyCard(data.game);
      }
    }, typewriterDuration);
  }, TAROT_FLIP_DURATION_MS);
}

function restoreTarotIfDrawnToday(steamId) {
  if (!steamId || !/^\d{17}$/.test(steamId)) return;
  const drawn = getTarotDrawnToday(steamId);
  if (!drawn) return;
  dailyFortuneData = drawn;
  applyTarotResult(drawn, { skipAnimation: true });
}

if (tarotCard) {
  tarotCard.addEventListener("click", handleTarotCardClick);
  tarotCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleTarotCardClick();
    }
  });
}


(function bootstrapFromQuery() {
  currentLang = "zh-CN";
  applyTranslations();
  fallbackScenarioData = buildFallbackScenarioData(currentLang);
  setAuthenticatedUi(false);
  const auto = computeChinaContextMode();
  autoContextMode = auto.mode;
  autoContextDescription = auto.note;
  setGamingMode(autoContextMode);
  updateContextCopy();
  currentResultMode = "pickles";
  setSoulLoading(false);
  setCurrentStep(1);
  syncDeviceUi();
  const params = new URLSearchParams(window.location.search);
  const steamId = params.get("steamId");
  const authError = params.get("authError");
  const savedSession = loadSessionState();

  if (authError) {
    step1Status.textContent = `${decodeURIComponent(authError)}`;
    params.delete("authError");
    const cleanErrorUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", cleanErrorUrl);
  }

  if (steamId && /^\d{17}$/.test(steamId)) {
    steamIdInput.value = steamId;
    handleAnalyze().catch(() => {});

    params.delete("steamId");
    params.delete("fromSteamLogin");
    const clean = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
    window.history.replaceState({}, "", clean);
  } else if (savedSession && /^\d{17}$/.test(savedSession.steamId)) {
    setCurrentStep(3);
    steamIdInput.value = savedSession.steamId;
    restoreTarotIfDrawnToday(savedSession.steamId);
    setSoulLoading(true);
    setSoulLoadingText(t("syncingDestinyData"));
    if (soulLoading) soulLoading.classList.add("soul-loading--syncing");
    hydrateDeviceUi(savedSession.deviceProfile);
    fetchSteamProfile(savedSession.steamId)
      .then((profile) => {
        currentSteamId = savedSession.steamId;
        currentProfileData = profile;
        hydrateProfile(profile);
        const diff = profile.activityDiff;
        if (diff && diff.hasDiff) {
          sessionHasActivityDiff = true;
          const primaryGame =
            (Array.isArray(diff.topGainers) && diff.topGainers[0]?.name) ||
            (Array.isArray(diff.newRecentGames) && diff.newRecentGames[0]?.name) ||
            "";
          let toast = "";
          if (currentLang === "zh-CN") {
            toast = primaryGame
              ? `欢迎回来！我注意到你最近在玩「${primaryGame}」，我们来更新一下分析。`
              : "欢迎回来！我看你最近玩得挺勤快，我们来更新一下分析。";
          } else {
            toast = primaryGame
              ? `Welcome back! I noticed you've been busy with ${primaryGame} recently — let's refresh your analysis.`
              : "Welcome back! I noticed recent changes in your play history — let's refresh your analysis.";
          }
          setStatus(toast, "#39d6c6");
        }
        return handleStep2Analyze();
      })
      .catch((error) => {
        setSoulLoading(false);
        if (soulLoading) soulLoading.classList.remove("soul-loading--syncing");
        setStatus(t("errorLabel"), "#ff6c7a");
        summary.textContent = error.message || t("errorLabel");
        setCurrentStep(1);
      });
  } else {
    step1Status.textContent = t("step1Waiting");
    renderPersona({
      code: "----",
      name: "Persona Pending",
      review: "Analyze your profile to generate your 4-letter gaming persona and witty personality review.",
    });
    renderRecommendations(currentScenarioData);
  }
})();

const PARTICLE_LETTERS = ["X", "Y", "A", "B"];
const PARTICLE_COUNT = 130;
const PARTICLE_SIZE_MIN = 12;
const PARTICLE_SIZE_MAX = 26;
const PARTICLE_OPACITY_MIN = 0.1;
const PARTICLE_OPACITY_MAX = 0.4;
const PARTICLE_SPEED_MAX = 0.18;
const PARTICLE_ACCENT_COLORS = ["#22d3ee", "#c084fc", "#94a3b8"];
const PARTICLE_PULSE_SPEED = 0.0012;
const PARTICLE_BLUR_RATIO = 0.35;
const PARTICLE_PARALLAX_SCROLL_FACTOR = 0.25;
const PARTICLE_DEPTH_BLUR_MAX = 8;
const PARTICLE_MOUSE_RADIUS = 150;
const PARTICLE_REPULSION_STRENGTH = 0.032;
const PARTICLE_VELOCITY_SMOOTH = 0.028;
const PARTICLE_GLOW_BOOST = 0.18;
const PARTICLE_ROTATION_SPEED_MAX = 0.0018;
const CONVERGENCE_RADIUS = 520;
const CONVERGENCE_ATTRACT = 0.018;
const CONVERGENCE_TANGENT = 0.022;
const CONVERGENCE_LERP = 0.06;
const CONVERGENCE_JITTER_DIST = 85;
const CONVERGENCE_JITTER_AMOUNT = 1.8;

const SHOCKWAVE_MAX_RADIUS = 1000;
const SHOCKWAVE_DURATION_MS = 1600;
const SHOCKWAVE_LINEWIDTH_MAX = 14;
const SHOCKWAVE_ALPHA_MAX = 0.85;
const SHOCKWAVE_SHADOW_BLUR = 20;
const SHOCKWAVE_PUSH_RING_WIDTH = 90;
const SHOCKWAVE_PUSH_STRENGTH = 0.28;
const SHOCKWAVE_COLORS = ["#22d3ee", "#c084fc"];
const SHOCKWAVE_EXIT_KICK_MS = 1000;
const SHOCKWAVE_EXIT_KICK_STRENGTH = 2.4;

class Shockwave {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.startTime = Date.now();
    this.color = SHOCKWAVE_COLORS[Math.floor(Math.random() * SHOCKWAVE_COLORS.length)];
    this.kickApplied = false;
  }

  getRadius(now = Date.now()) {
    const elapsed = now - this.startTime;
    const progress = Math.min(1, elapsed / SHOCKWAVE_DURATION_MS);
    return progress * SHOCKWAVE_MAX_RADIUS;
  }

  isDone(now = Date.now()) {
    return this.getRadius(now) >= SHOCKWAVE_MAX_RADIUS;
  }
}

class ParticleSystem {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.width = 0;
    this.height = 0;
    this.particles = [];
    this.shockwaves = [];
    this.rafId = null;
    this.fontFamily = "";
    this.startTime = 0;
    this.baseScrollY = 0;
    this.mouseX = null;
    this.mouseY = null;
    this.isDivinationMode = false;
    this.ceremonyEntry = false;
    this.convergenceTargetX = 0;
    this.convergenceTargetY = 0;
  }

  createShockwave(x, y) {
    this.shockwaves.push(new Shockwave(x, y));
  }

  setCeremonyEntry(value) {
    this.ceremonyEntry = !!value;
  }

  init() {
    if (!this.canvas || !this.ctx) return;
    this.fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";
    this.startTime = Date.now();
    this.baseScrollY = typeof window !== "undefined" ? window.scrollY : 0;
    this.resize();
    this.spawnParticles();
    window.addEventListener("resize", () => this.resize());
    window.addEventListener("mousemove", (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    window.addEventListener("mouseleave", () => {
      this.mouseX = null;
      this.mouseY = null;
    });
    this.draw();
  }

  resize() {
    if (!this.canvas) return;
    this.width = this.canvas.width = window.innerWidth;
    this.height = this.canvas.height = window.innerHeight;
    if (this.particles.length === 0) return;
    for (const p of this.particles) {
      p.x = Math.min(p.x, Math.max(0, this.width - 20));
      p.y = Math.min(p.y, Math.max(0, this.height - 20));
    }
  }

  spawnParticles() {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i += 1) {
      this.particles.push(this.createParticle(true));
    }
  }

  createParticle(randomPosition = false) {
    const depth = Math.random();
    const size =
      PARTICLE_SIZE_MIN +
      (PARTICLE_SIZE_MAX - PARTICLE_SIZE_MIN) * depth;
    const baseOpacity =
      PARTICLE_OPACITY_MIN +
      (PARTICLE_OPACITY_MAX - PARTICLE_OPACITY_MIN) * depth;
    const angle = Math.random() * Math.PI * 2;
    const baseSpeed = 0.04 + Math.random() * (PARTICLE_SPEED_MAX - 0.04);
    const x = randomPosition
      ? Math.random() * (this.width || window.innerWidth)
      : 0;
    const y = randomPosition
      ? Math.random() * (this.height || window.innerHeight)
      : 0;
    const color = PARTICLE_ACCENT_COLORS[Math.floor(Math.random() * PARTICLE_ACCENT_COLORS.length)];
    const useBlur = depth < 0.5 || Math.random() < PARTICLE_BLUR_RATIO;
    const blurAmount = useBlur ? (1 - depth) * PARTICLE_DEPTH_BLUR_MAX : 0;
    const vx = Math.cos(angle) * baseSpeed;
    const vy = Math.sin(angle) * baseSpeed;
    const rotationSpeed = (Math.random() - 0.5) * 2 * PARTICLE_ROTATION_SPEED_MAX;
    return {
      x,
      y,
      vx,
      vy,
      baseVx: vx,
      baseVy: vy,
      letter: PARTICLE_LETTERS[Math.floor(Math.random() * PARTICLE_LETTERS.length)],
      size,
      baseOpacity,
      phase: Math.random() * Math.PI * 2,
      color,
      useBlur,
      blurAmount,
      depth,
      angle: Math.random() * Math.PI * 2,
      rotationSpeed,
    };
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.ctx.fillStyle = "rgba(26, 26, 26, 0.06)";
    this.ctx.fillRect(0, 0, this.width, this.height);

    const step3 = document.getElementById("step-3");
    const tarotCardEl = document.getElementById("tarot-card");
    const cardVisible = step3 && step3.classList.contains("is-active") && tarotCardEl && !tarotCardEl.classList.contains("flipped");
    this.isDivinationMode = this.ceremonyEntry || !!cardVisible;
    if (this.isDivinationMode && tarotCardEl) {
      const r = tarotCardEl.getBoundingClientRect();
      this.convergenceTargetX = r.left + r.width * 0.5;
      this.convergenceTargetY = r.top + r.height * 0.5;
    }

    const t = (Date.now() - this.startTime) * PARTICLE_PULSE_SPEED;
    const scrollY = typeof window !== "undefined" ? window.scrollY : 0;
    const mx = this.mouseX;
    const my = this.mouseY;
    const tx = this.convergenceTargetX;
    const ty = this.convergenceTargetY;
    const divination = this.isDivinationMode;
    const now = Date.now();

    this.shockwaves = this.shockwaves.filter((sw) => !sw.isDone(now));

    for (const sw of this.shockwaves) {
      if (now - sw.startTime >= SHOCKWAVE_EXIT_KICK_MS && !sw.kickApplied) {
        for (const p of this.particles) {
          const dx = p.x - sw.x;
          const dy = p.y - sw.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
          const strength = SHOCKWAVE_EXIT_KICK_STRENGTH * p.depth;
          p.vx += (dx / d) * strength;
          p.vy += (dy / d) * strength;
        }
        sw.kickApplied = true;
        this.ceremonyEntry = false;
      }
    }

    for (const sw of this.shockwaves) {
      const radius = sw.getRadius(now);
      if (radius <= 0) continue;
      const progress = radius / SHOCKWAVE_MAX_RADIUS;
      const lineWidth = Math.max(0, SHOCKWAVE_LINEWIDTH_MAX * (1 - progress));
      const alpha = Math.max(0, SHOCKWAVE_ALPHA_MAX * (1 - progress));
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(sw.x, sw.y, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = sw.color;
      this.ctx.lineWidth = lineWidth;
      this.ctx.globalAlpha = alpha;
      this.ctx.shadowBlur = SHOCKWAVE_SHADOW_BLUR;
      this.ctx.shadowColor = sw.color;
      this.ctx.stroke();
      this.ctx.restore();
    }
    this.ctx.shadowBlur = 0;
    this.ctx.shadowColor = "transparent";
    this.ctx.globalAlpha = 1;

    for (const p of this.particles) {
      for (const sw of this.shockwaves) {
        const radius = sw.getRadius(now);
        const dx = p.x - sw.x;
        const dy = p.y - sw.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (d < radius && d > radius - SHOCKWAVE_PUSH_RING_WIDTH) {
          const falloff = (radius - d) / SHOCKWAVE_PUSH_RING_WIDTH;
          const force = SHOCKWAVE_PUSH_STRENGTH * falloff * p.depth;
          const nx = dx / d;
          const ny = dy / d;
          p.vx += nx * force;
          p.vy += ny * force;
        }
      }

      if (divination && tx != null && ty != null) {
        const dx = tx - p.x;
        const dy = ty - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
        if (dist < CONVERGENCE_RADIUS) {
          const radialX = dx / dist;
          const radialY = dy / dist;
          const tangentX = -radialY;
          const tangentY = radialX;
          const pull = Math.min(1, dist / CONVERGENCE_RADIUS);
          const attract = CONVERGENCE_ATTRACT * p.depth * (1 - pull * 0.6);
          const tangent = CONVERGENCE_TANGENT * (1 - dist / CONVERGENCE_RADIUS) * p.depth;
          const targetVx = radialX * attract + tangentX * tangent;
          const targetVy = radialY * attract + tangentY * tangent;
          p.vx += (targetVx - p.vx) * CONVERGENCE_LERP;
          p.vy += (targetVy - p.vy) * CONVERGENCE_LERP;
          if (dist < CONVERGENCE_JITTER_DIST) {
            p.x += (Math.random() - 0.5) * CONVERGENCE_JITTER_AMOUNT;
            p.y += (Math.random() - 0.5) * CONVERGENCE_JITTER_AMOUNT;
          }
        } else {
          p.vx += (p.baseVx - p.vx) * PARTICLE_VELOCITY_SMOOTH;
          p.vy += (p.baseVy - p.vy) * PARTICLE_VELOCITY_SMOOTH;
        }
      } else if (mx != null && my != null) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PARTICLE_MOUSE_RADIUS && dist > 0) {
          const falloff = (PARTICLE_MOUSE_RADIUS - dist) / PARTICLE_MOUSE_RADIUS;
          const force = falloff * PARTICLE_REPULSION_STRENGTH * p.depth;
          const nx = dx / dist;
          const ny = dy / dist;
          p.vx += nx * force;
          p.vy += ny * force;
        }
        p.vx += (p.baseVx - p.vx) * PARTICLE_VELOCITY_SMOOTH;
        p.vy += (p.baseVy - p.vy) * PARTICLE_VELOCITY_SMOOTH;
      }

      p.x += p.vx * p.depth;
      p.y += p.vy * p.depth;
      if (this.width > 0) {
        if (p.x < 0) p.x += this.width;
        else if (p.x > this.width) p.x -= this.width;
      }
      if (this.height > 0) {
        if (p.y < 0) p.y += this.height;
        else if (p.y > this.height) p.y -= this.height;
      }

      const parallaxY = (scrollY - this.baseScrollY) * PARTICLE_PARALLAX_SCROLL_FACTOR * p.depth;
      const drawY = p.y + parallaxY;

      p.angle += p.rotationSpeed;

      const pulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t + p.phase));
      let opacity = p.baseOpacity * pulse;
      if (mx != null && my != null) {
        const dx = p.x - mx;
        const dy = p.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < PARTICLE_MOUSE_RADIUS) {
          const glow = (1 - dist / PARTICLE_MOUSE_RADIUS) * PARTICLE_GLOW_BOOST;
          opacity = Math.min(1, opacity + glow);
        }
      }

      this.ctx.save();
      this.ctx.translate(p.x, drawY);
      this.ctx.rotate(p.angle);
      this.ctx.font = `${p.size}px ${this.fontFamily}`;
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = opacity;
      if (p.useBlur && p.blurAmount > 0) {
        this.ctx.shadowBlur = p.blurAmount;
        this.ctx.shadowColor = p.color;
      }
      this.ctx.fillText(p.letter, 0, 0);
      this.ctx.restore();
      this.ctx.shadowBlur = 0;
      this.ctx.shadowColor = "transparent";
    }
    this.ctx.globalAlpha = 1;
    this.rafId = requestAnimationFrame(() => this.draw());
  }

  destroy() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }
}

let particleSystemInstance = null;

function initParticleBackground() {
  const canvas = document.getElementById("text-rain");
  if (!canvas) return;
  const system = new ParticleSystem(canvas);
  particleSystemInstance = system;
  system.init();
}

function createShockwave(x, y) {
  if (particleSystemInstance && typeof particleSystemInstance.createShockwave === "function") {
    particleSystemInstance.createShockwave(x, y);
  }
}

initParticleBackground();
