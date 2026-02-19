# Hajimi-Diff Format Spec v0.9.1 (Freeze Draft)

## 1. Magic & Version
- Magic: `HAJI` (4 bytes)
- Version: 0.9

## 2. Fixed Sizes
- Header: 64 bytes
- Index Entry: 26 bytes (fixed)
- Footer: 48 bytes

## 3. Integrity Chain
- L1: SHA-256(file)
- L2: XXH64(index_table)
- L3: BLAKE3-256(file_without_footer)

## 4. BNF (摘要)
Header := Magic(4) VersionMajor(1) VersionMinor(1) Flags(1) IndexCount(u32le) ...
IndexEntry := DataOffset(u64le) DataLen(u32le) UncompressedLen(u32le) Flags(u16le) ChunkXXH64(8)
Footer := FileBLAKE3(32) IndexXXH64(8) Reserved(8)

## 5. 债务声明
- DEBT-B07-001/002/003: BLAKE3-256 为纯 JS 真·实现；仍存在性能/侧信道/向量覆盖的已知局限（见对应债务条目）