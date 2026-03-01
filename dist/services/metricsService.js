"use strict";
/**
 * Steam API 调用监控层：统计 Store 调用、SteamSpy 调用、缓存命中/未命中，每日自动重置。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.recordSteamStoreCall = recordSteamStoreCall;
exports.recordSteamSpyCall = recordSteamSpyCall;
exports.recordCacheHit = recordCacheHit;
exports.recordCacheMiss = recordCacheMiss;
exports.getMetrics = getMetrics;
let steamStoreCalls = 0;
let steamSpyCalls = 0;
let cacheHits = 0;
let cacheMisses = 0;
let lastResetTs = Date.now();
function isNewDay() {
    const now = Date.now();
    const lastDay = new Date(lastResetTs).toDateString();
    const today = new Date(now).toDateString();
    return lastDay !== today;
}
function maybeResetDaily() {
    if (!isNewDay())
        return;
    steamStoreCalls = 0;
    steamSpyCalls = 0;
    cacheHits = 0;
    cacheMisses = 0;
    lastResetTs = Date.now();
}
function recordSteamStoreCall() {
    maybeResetDaily();
    steamStoreCalls += 1;
}
function recordSteamSpyCall() {
    maybeResetDaily();
    steamSpyCalls += 1;
}
function recordCacheHit() {
    maybeResetDaily();
    cacheHits += 1;
}
function recordCacheMiss() {
    maybeResetDaily();
    cacheMisses += 1;
}
function getMetrics() {
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
