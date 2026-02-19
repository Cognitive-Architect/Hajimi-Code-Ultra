# Traceability Matrix (v0.9.1)

| Ref | 对应修复 | 产物/代码路径 | 验证脚本 | 通过标准 |
|---|---|---|---|---|
| R-001 | 黄金向量 | delivery/v0.9.1/minimal.hdiff + delivery/v0.9.1/golden-vector.json | scripts/verify-golden-vector.js | VERIFICATION PASSED |
| R-002 | 校验链统一 | delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md | scripts/verify-integrity.js | INTEGRITY_SPEC_OK |
| R-003 | 字典清单 | delivery/v0.9.1/dictionary-manifest.json + .schema.json | scripts/verify-dict-manifest.js | DICT_MANIFEST_OK |
| R-004 | 证据链闭环 | delivery/v0.9.1/traceability-matrix.md | scripts/verify-traceability.js | TRACE_OK |

## 债务声明
- DEBT-B01-001: 黄金向量生成器的随机性来源（当前payload固定，需声明）
- DEBT-B07-001/002/003: BLAKE3-256 已切换为纯 JS 真·实现；仍存在性能/侧信道/向量覆盖的已知局限（见对应债务条目）
- DEBT-B03-001: DictID 4096上限溢出风险（多租户场景）
- DEBT-B04-001: 追溯矩阵手动维护可能遗漏（非自动生成）