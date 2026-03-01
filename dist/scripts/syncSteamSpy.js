"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * SteamSpy 数据同步脚本（独立运行，不影响推荐流程）
 * 串行执行、每页间隔 1s、429/503 指数退避、每日 top100×3 + 2 页 all。
 * 支持 REDIS_URL（node-redis）或 UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN（Upstash REST）。
 */
require("dotenv/config");
const fs_1 = require("fs");
const path_1 = require("path");
const syncSteamSpy_1 = require("../services/syncSteamSpy");
const STEAMSPY_BASE_URL = (process.env.STEAMSPY_BASE_URL || 'https://steamspy.com').replace(/\/$/, '');
const STEAMSPY_CACHE_TTL = Number(process.env.STEAMSPY_CACHE_TTL || 7 * 24 * 3600);
/** 伪装成真实浏览器，避免 SteamSpy/Cloudflare 识别为机器人；Referer 尤其重要 */
const STEAMSPY_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://steamspy.com/',
    'X-Requested-With': 'XMLHttpRequest',
};
async function createSteamSpyFetch() {
    const proxyUrl = (process.env.STEAMSPY_PROXY_URL || '').trim();
    if (proxyUrl) {
        const { fetch: undiciFetch, ProxyAgent } = await Promise.resolve().then(() => __importStar(require('undici')));
        const agent = new ProxyAgent(proxyUrl);
        console.log('[syncSteamSpy] 使用代理:', proxyUrl.replace(/:[^:@]+@/, ':****@'));
        return (url, init) => undiciFetch(url, { ...init, dispatcher: agent });
    }
    return (url, init) => fetch(url, init);
}
async function fetchWithStatus(url, steamSpyFetch) {
    try {
        const res = await steamSpyFetch(url, { signal: AbortSignal.timeout(30000), headers: STEAMSPY_HEADERS });
        const text = await res.text();
        if (res.status === 403) {
            if (text.includes('Just a moment') || text.includes('Cloudflare')) {
                console.warn('[syncSteamSpy] 403 来自 Cloudflare 挑战，建议设置 STEAMSPY_PROXY_URL 通过代理访问');
            }
            console.warn('[syncSteamSpy] 403 响应片段:', text.slice(0, 300));
        }
        if (res.status === 500) {
            const snippet = text.slice(0, 400);
            if (!snippet.trim()) {
                console.warn('[syncSteamSpy] 500 且 body 为空，可能是代理连接上游失败，请用浏览器开代理访问 https://steamspy.com/api.php?request=top100in2weeks 测试');
            }
            else {
                console.warn('[syncSteamSpy] 500 响应片段:', snippet);
            }
        }
        let data = null;
        try {
            data = text.trim().startsWith('{') ? JSON.parse(text) : null;
        }
        catch (_) { }
        const tooManyConnections = /too many connections|connection failed/i.test(text);
        if (tooManyConnections && !data) {
            console.warn('[syncSteamSpy] 响应含 "Too many connections"，按 503 重试');
            return { status: 503, data: null };
        }
        return { status: res.status, data };
    }
    catch (err) {
        console.warn('[syncSteamSpy] 请求异常:', err?.message ?? err);
        return { status: 0, data: null };
    }
}
function loadEnvFromFile() {
    const root = (0, path_1.join)(__dirname, '..');
    const envPath = (0, path_1.join)(root, '.env');
    if (!(0, fs_1.existsSync)(envPath))
        return;
    const content = (0, fs_1.readFileSync)(envPath, 'utf8');
    for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#'))
            continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1)
            continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, '');
        if (!process.env[key])
            process.env[key] = value;
    }
}
async function run() {
    loadEnvFromFile();
    const steamSpyFetch = await createSteamSpyFetch();
    const fetchWithStatusForSync = (url) => fetchWithStatus(url, steamSpyFetch);
    const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
    const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;
    const redisUrl = process.env.REDIS_URL;
    let redis;
    if (upstashUrl && upstashToken) {
        const { Redis } = await Promise.resolve().then(() => __importStar(require('@upstash/redis')));
        const upstash = new Redis({ url: upstashUrl, token: upstashToken });
        redis = {
            get: (key) => upstash.get(key).then((v) => (v == null ? null : String(v))),
            set: (key, value, opts) => upstash.set(key, value, opts?.EX != null ? { ex: opts.EX } : undefined),
            pipeline: () => {
                const p = upstash.pipeline();
                return {
                    set: (key, value, opts) => p.set(key, value, opts?.EX != null ? { ex: opts.EX } : undefined),
                    exec: () => p.exec(),
                };
            },
        };
        console.log('[syncSteamSpy] Using Upstash REST (pipeline batch writes)');
    }
    else if (redisUrl) {
        const { createClient } = await Promise.resolve().then(() => __importStar(require('redis')));
        const client = createClient({ url: redisUrl });
        client.on('error', (err) => console.warn('[syncSteamSpy] Redis error:', err?.message));
        await client.connect();
        redis = {
            get: (key) => client.get(key),
            set: (key, value, opts) => client.set(key, value, opts),
        };
        try {
            await (0, syncSteamSpy_1.runSyncSteamSpy)({
                redis,
                fetchWithStatus: fetchWithStatusForSync,
                steamSpyBaseUrl: STEAMSPY_BASE_URL,
                steamSpyCacheTtlSec: STEAMSPY_CACHE_TTL,
            });
        }
        finally {
            await client.quit();
        }
        return;
    }
    else {
        console.error('[syncSteamSpy] Set REDIS_URL or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env');
        process.exit(1);
    }
    await (0, syncSteamSpy_1.runSyncSteamSpy)({
        redis,
        fetchWithStatus: fetchWithStatusForSync,
        steamSpyBaseUrl: STEAMSPY_BASE_URL,
        steamSpyCacheTtlSec: STEAMSPY_CACHE_TTL,
    });
}
run().catch((err) => {
    console.error('[syncSteamSpy]', err?.message || err);
    process.exit(1);
});
