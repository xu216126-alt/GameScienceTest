/**
 * Steam API 调用监控层：统计 Store 调用、SteamSpy 调用、缓存命中/未命中，每日自动重置。
 */

let steamStoreCalls = 0;
let steamSpyCalls = 0;
let cacheHits = 0;
let cacheMisses = 0;
let lastResetTs = Date.now();

function isNewDay(): boolean {
  const now = Date.now();
  const lastDay = new Date(lastResetTs).toDateString();
  const today = new Date(now).toDateString();
  return lastDay !== today;
}

function maybeResetDaily(): void {
  if (!isNewDay()) return;
  steamStoreCalls = 0;
  steamSpyCalls = 0;
  cacheHits = 0;
  cacheMisses = 0;
  lastResetTs = Date.now();
}

export function recordSteamStoreCall(): void {
  maybeResetDaily();
  steamStoreCalls += 1;
}

export function recordSteamSpyCall(): void {
  maybeResetDaily();
  steamSpyCalls += 1;
}

export function recordCacheHit(): void {
  maybeResetDaily();
  cacheHits += 1;
}

export function recordCacheMiss(): void {
  maybeResetDaily();
  cacheMisses += 1;
}

export interface MetricsSnapshot {
  steamStoreCalls: number;
  steamSpyCalls: number;
  cacheHitRate: number;
  lastReset: number;
}

export function getMetrics(): MetricsSnapshot {
  maybeResetDaily();
  const total = cacheHits + cacheMisses;
  const cacheHitRate = total > 0 ? cacheHits / total : 0;
  return {
    steamStoreCalls,
    steamSpyCalls,
    cacheHitRate: Math.round(cacheHitRate * 10000) / 10000,
    lastReset: lastResetTs,
  };
}
