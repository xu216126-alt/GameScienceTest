"use strict";
/**
 * 统一评分模型：基于本地 SteamSpy 数据（steam_meta:*）计算 0–100 标准化分数，不依赖 Steam API。
 * 用于推荐候选池排序，禁止为排序调用 Steam API。
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseOwnersToNumber = parseOwnersToNumber;
exports.calculateScore = calculateScore;
/** 将 SteamSpy owners 区间字符串解析为数字（取区间均值）。如 "20,000 .. 50,000" -> 35000 */
function parseOwnersToNumber(owners) {
    const s = String(owners || '').trim();
    if (!s)
        return 0;
    const cleaned = s.replace(/,/g, '');
    const rangeMatch = cleaned.match(/^(\d+)\s*\.\.\s*(\d+)$/);
    if (rangeMatch) {
        const a = Number(rangeMatch[1]) || 0;
        const b = Number(rangeMatch[2]) || 0;
        return Math.round((a + b) / 2);
    }
    const single = Number(cleaned);
    return Number.isFinite(single) && single >= 0 ? single : 0;
}
/** 计算单款游戏的 0–100 标准化分数：好评率 + log(owners) + log(ccu) 加权后归一化 */
function calculateScore(meta) {
    const positive = Number(meta?.positive) || 0;
    const negative = Number(meta?.negative) || 0;
    const total = positive + negative;
    const reviewRate = total > 0 ? positive / total : 0;
    const ownersNum = parseOwnersToNumber(meta?.owners ?? '');
    const ccu = Number(meta?.ccu) || 0;
    const logOwners = Math.log1p(ownersNum);
    const logCcu = Math.log1p(ccu);
    const REVIEW_WEIGHT = 0.5;
    const OWNERS_WEIGHT = 0.3;
    const CCU_WEIGHT = 0.2;
    let raw = reviewRate * 100 * REVIEW_WEIGHT;
    raw += Math.min(logOwners * 8, 100) * OWNERS_WEIGHT;
    raw += Math.min(logCcu * 12, 100) * CCU_WEIGHT;
    const normalized = Math.max(0, Math.min(100, Math.round(raw * 100) / 100));
    return normalized;
}
