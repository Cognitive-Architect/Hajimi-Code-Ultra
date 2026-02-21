// DEBT-XXH64: 使用纯JS实现XXH64，性能低于原生实现，P1级别
'use strict';
/**
 * XXH64 (seed=0) - BigInt 实现，输出 uint64_le Buffer(8)
 * 说明：离线脚本用，优先保证确定性与跨平台一致。
 */
const MASK64 = (1n << 64n) - 1n;
const PRIME64_1 = 11400714785074694791n;
const PRIME64_2 = 14029467366897019727n;
const PRIME64_3 = 1609587929392839161n;
const PRIME64_4 = 9650029242287828579n;
const PRIME64_5 = 2870177450012600261n;
function rotl(x, r) {
  return ((x << BigInt(r)) | (x >> BigInt(64 - r))) & MASK64;
}
function readU32LE(buf, off) {
  return BigInt(buf.readUInt32LE(off)) & MASK64;
}
function readU64LE(buf, off) {
  // Node 的 readBigUInt64LE 可用，但这里手写以便更显式
  let x = 0n;
  for (let i = 0; i < 8; i++) {
    x |= BigInt(buf[off + i]) << (8n * BigInt(i));
  }
  return x & MASK64;
}
function round(acc, lane) {
  acc = (acc + (lane * PRIME64_2 & MASK64)) & MASK64;
  acc = rotl(acc, 31);
  acc = (acc * PRIME64_1) & MASK64;
  return acc;
}
function mergeRound(acc, val) {
  acc ^= round(0n, val);
  acc = (acc * PRIME64_1 + PRIME64_4) & MASK64;
  return acc;
}
function avalanche(h) {
  h ^= (h >> 33n);
  h = (h * PRIME64_2) & MASK64;
  h ^= (h >> 29n);
  h = (h * PRIME64_3) & MASK64;
  h ^= (h >> 32n);
  return h & MASK64;
}
function toU64LEBuffer(x) {
  const b = Buffer.alloc(8);
  let v = x & MASK64;
  for (let i = 0; i < 8; i++) {
    b[i] = Number((v >> (8n * BigInt(i))) & 0xFFn);
  }
  return b;
}
function xxh64(buf, seed = 0n) {
  let p = 0;
  const len = buf.length;
  let h64;
  if (len >= 32) {
    let v1 = (seed + PRIME64_1 + PRIME64_2) & MASK64;
    let v2 = (seed + PRIME64_2) & MASK64;
    let v3 = seed & MASK64;
    let v4 = (seed - PRIME64_1) & MASK64;
    const limit = len - 32;
    while (p <= limit) {
      v1 = round(v1, readU64LE(buf, p)); p += 8;
      v2 = round(v2, readU64LE(buf, p)); p += 8;
      v3 = round(v3, readU64LE(buf, p)); p += 8;
      v4 = round(v4, readU64LE(buf, p)); p += 8;
    }
    h64 = (rotl(v1, 1) + rotl(v2, 7) + rotl(v3, 12) + rotl(v4, 18)) & MASK64;
    h64 = mergeRound(h64, v1);
    h64 = mergeRound(h64, v2);
    h64 = mergeRound(h64, v3);
    h64 = mergeRound(h64, v4);
  } else {
    h64 = (seed + PRIME64_5) & MASK64;
  }
  h64 = (h64 + BigInt(len)) & MASK64;
  while (p + 8 <= len) {
    const k1 = round(0n, readU64LE(buf, p));
    h64 ^= k1;
    h64 = (rotl(h64, 27) * PRIME64_1 + PRIME64_4) & MASK64;
    p += 8;
  }
  if (p + 4 <= len) {
    h64 ^= (readU32LE(buf, p) * PRIME64_1) & MASK64;
    h64 = (rotl(h64, 23) * PRIME64_2 + PRIME64_3) & MASK64;
    p += 4;
  }
  while (p < len) {
    h64 ^= (BigInt(buf[p]) * PRIME64_5) & MASK64;
    h64 = (rotl(h64, 11) * PRIME64_1) & MASK64;
    p += 1;
  }
  return toU64LEBuffer(avalanche(h64));
}
module.exports = { xxh64 };