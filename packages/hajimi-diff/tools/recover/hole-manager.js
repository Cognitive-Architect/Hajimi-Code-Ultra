// DEBT-B06-002: hole 合并策略很简单（仅按区间并集），不理解 chunk / index 语义
'use strict';

/**
 * Merge and normalize hole ranges.
 * @param {Array<{start:number,end:number,reason?:string}>} holes
 * @returns {Array<{start:number,end:number,reason?:string}>}
 */
function mergeHoles(holes) {
  const clean = (holes || [])
    .filter(h => h && Number.isFinite(h.start) && Number.isFinite(h.end) && h.end > h.start)
    .map(h => ({ start: Math.max(0, Math.floor(h.start)), end: Math.max(0, Math.floor(h.end)), reason: h.reason }));

  clean.sort((a, b) => (a.start - b.start) || (a.end - b.end));

  const out = [];
  for (const h of clean) {
    if (out.length === 0) {
      out.push(h);
      continue;
    }
    const last = out[out.length - 1];
    if (h.start <= last.end) {
      // merge overlap/adjacent
      last.end = Math.max(last.end, h.end);
      // keep the first reason; if different, drop to avoid lying.
      if (last.reason !== h.reason) delete last.reason;
    } else {
      out.push(h);
    }
  }
  return out;
}

module.exports = { mergeHoles };
