// DEBT-B07-001: 纯JS无 SIMD 优化，性能可能慢 5-10x（P1）
// DEBT-B07-002: 侧信道防护未验证（P1）
'use strict';

// BLAKE3-256 (hash mode) — pure JS implementation
// Spec: https://c2sp.org/BLAKE3
// NOTE: This module intentionally does NOT use Node.js crypto APIs.

// --- Constants ---

// IV as 8 little-endian 32-bit words (same as SHA-256 IV / BLAKE2s IV)
const IV = Object.freeze([
  0x6A09E667, 0xBB67AE85, 0x3C6EF372, 0xA54FF53A,
  0x510E527F, 0x9B05688C, 0x1F83D9AB, 0x5BE0CD19,
]);

// Flags
const CHUNK_START = 1 << 0;
const CHUNK_END   = 1 << 1;
const PARENT      = 1 << 2;
const ROOT        = 1 << 3;

const BLOCK_LEN = 64;
const CHUNK_LEN = 1024;

// Message word permutation (applied after each round)
const MSG_PERM = Object.freeze([2, 6, 3, 10, 7, 0, 4, 13, 1, 11, 12, 5, 9, 14, 15, 8]);

// --- 32-bit helpers ---

function rotr32(x, n) {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

function g(v, a, b, c, d, x, y) {
  v[a] = (v[a] + v[b] + x) >>> 0;
  v[d] = rotr32(v[d] ^ v[a], 16);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rotr32(v[b] ^ v[c], 12);
  v[a] = (v[a] + v[b] + y) >>> 0;
  v[d] = rotr32(v[d] ^ v[a], 8);
  v[c] = (v[c] + v[d]) >>> 0;
  v[b] = rotr32(v[b] ^ v[c], 7);
}

function permute(m) {
  const tmp = new Array(16);
  for (let i = 0; i < 16; i++) tmp[i] = m[MSG_PERM[i]];
  for (let i = 0; i < 16; i++) m[i] = tmp[i];
}

function compress(h, m, t0, t1, blockLen, flags) {
  // Local working state v[0..15]
  const v = new Array(16);

  // v[0..7] := h
  for (let i = 0; i < 8; i++) v[i] = h[i] >>> 0;

  // v[8..11] := IV[0..3]
  v[8]  = IV[0];
  v[9]  = IV[1];
  v[10] = IV[2];
  v[11] = IV[3];

  // counter, block length, flags
  v[12] = t0 >>> 0;
  v[13] = t1 >>> 0;
  v[14] = blockLen >>> 0;
  v[15] = flags >>> 0;

  // We permute the message between rounds, so work on a copy.
  const block = m.slice(0, 16);

  for (let round = 0; round < 7; round++) {
    // Column rounds
    g(v, 0, 4,  8, 12, block[0], block[1]);
    g(v, 1, 5,  9, 13, block[2], block[3]);
    g(v, 2, 6, 10, 14, block[4], block[5]);
    g(v, 3, 7, 11, 15, block[6], block[7]);

    // Diagonal rounds
    g(v, 0, 5, 10, 15, block[8],  block[9]);
    g(v, 1, 6, 11, 12, block[10], block[11]);
    g(v, 2, 7,  8, 13, block[12], block[13]);
    g(v, 3, 4,  9, 14, block[14], block[15]);

    permute(block);
  }

  // Output state (untruncated)
  for (let i = 0; i < 8; i++) {
    v[i] = (v[i] ^ v[i + 8]) >>> 0;
    v[i + 8] = (v[i + 8] ^ h[i]) >>> 0;
  }

  return v;
}

function wordsFromBlock(blockBuf) {
  const m = new Array(16);
  for (let i = 0; i < 16; i++) m[i] = blockBuf.readUInt32LE(i * 4) >>> 0;
  return m;
}

function wordsToBytesLE(words) {
  const out = Buffer.alloc(words.length * 4);
  for (let i = 0; i < words.length; i++) out.writeUInt32LE(words[i] >>> 0, i * 4);
  return out;
}

function parentCv(leftCv, rightCv, isRoot) {
  // Parent message block is 64 bytes: leftCV (32) || rightCV (32)
  const m = new Array(16);
  for (let i = 0; i < 8; i++) m[i] = leftCv[i] >>> 0;
  for (let i = 0; i < 8; i++) m[8 + i] = rightCv[i] >>> 0;

  const flags = PARENT | (isRoot ? ROOT : 0);
  const out = compress(IV, m, 0, 0, BLOCK_LEN, flags);
  return out.slice(0, 8);
}

function chunkCv(input, chunkOffset, chunkLen, chunkIndex, isRootChunk) {
  // Start chaining value for a chunk is IV (hash mode)
  let cv = IV.slice(0, 8);

  const blockCount = (chunkLen === 0) ? 1 : Math.ceil(chunkLen / BLOCK_LEN);

  const t0 = Number(chunkIndex & 0xFFFFFFFFn) >>> 0;
  const t1 = Number((chunkIndex >> 32n) & 0xFFFFFFFFn) >>> 0;

  for (let blockIndex = 0; blockIndex < blockCount; blockIndex++) {
    const isLastBlock = (blockIndex === blockCount - 1);
    const blockStart = chunkOffset + blockIndex * BLOCK_LEN;

    const blockLen = isLastBlock ? (chunkLen - blockIndex * BLOCK_LEN) : BLOCK_LEN;

    const blockBuf = Buffer.alloc(BLOCK_LEN, 0);
    if (blockLen > 0) {
      input.copy(blockBuf, 0, blockStart, blockStart + blockLen);
    }

    const m = wordsFromBlock(blockBuf);

    let flags = 0;
    if (blockIndex === 0) flags |= CHUNK_START;
    if (isLastBlock) flags |= CHUNK_END;
    if (isRootChunk && isLastBlock) flags |= ROOT;

    const out = compress(cv, m, t0, t1, blockLen, flags);
    cv = out.slice(0, 8);
  }

  return cv;
}

function blake3_256(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const inputLen = buf.length;

  // BLAKE3 processes at least one chunk (even for empty input).
  const chunkCount = Math.max(1, Math.ceil(inputLen / CHUNK_LEN));

  // Single chunk: the chunk is also the root.
  if (chunkCount === 1) {
    const cv = chunkCv(buf, 0, inputLen, 0n, true);
    return wordsToBytesLE(cv); // 8 words -> 32 bytes
  }

  // Multi-chunk: build a Merkle tree using the chunk counter stack algorithm.
  const cvStack = [];

  for (let ci = 0; ci < chunkCount; ci++) {
    const chunkIndex = BigInt(ci);
    const chunkOffset = ci * CHUNK_LEN;
    const chunkLen = Math.min(CHUNK_LEN, inputLen - chunkOffset);

    let cv = chunkCv(buf, chunkOffset, chunkLen, chunkIndex, false);

    // Merge completed subtrees (binary counter carry).
    let totalChunks = BigInt(ci + 1);
    while ((totalChunks & 1n) === 0n) {
      const left = cvStack.pop();
      cv = parentCv(left, cv, false);
      totalChunks >>= 1n;
    }

    cvStack.push(cv);
  }

  // Reduce stack to a single root CV.
  while (cvStack.length > 1) {
    const right = cvStack.pop();
    const left = cvStack.pop();
    const isRoot = (cvStack.length === 0);
    const cv = parentCv(left, right, isRoot);
    cvStack.push(cv);
  }

  return wordsToBytesLE(cvStack[0]);
}

module.exports = { blake3_256 };
