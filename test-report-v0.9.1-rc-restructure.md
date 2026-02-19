# 回归验证报告 (Regression Validation Report)

**工单:** TEST-REG-001  
**分支:** `v0.9.1-RC-restructure`  
**Commit:** `64a65abe47c50745b334e29a57afdc200405b158`  
**时间:** 2026-02-19  

---

## 执行摘要

| 测试套件 | 通过 | 失败 | 状态 |
|---------|:----:|:----:|:----:|
| BLAKE3 Test Vectors | 3 | 0 | ✅ PASS |
| Corruption Suite | 100 | 0 | ✅ PASS |
| Node.js Native Tests | 2 | 0 | ✅ PASS |
| Integrity Verification | 1 | 0 | ✅ PASS |
| Traceability Verification | 1 | 0 | ✅ PASS |
| Golden Vector Verification | 1 | 0 | ✅ PASS |
| Dict Manifest Verification | 1 | 0 | ✅ PASS |
| NEG007 Scan | 1 | 0 | ✅ PASS |
| GV003 Determinism | 1 | 0 | ✅ PASS |
| Benchmark | 1 | 0 | ✅ PASS |
| **总计** | **112** | **0** | **✅ ALL GREEN** |

---

## 详细测试结果

### 1. BLAKE3 Test Vectors (`verify-blake3-test-vectors.js`)

```
PASS BLAKE-001 empty input
PASS BLAKE-002 "abc"
PASS BLAKE-003 long string (RFC-style): abcdbcdecdef...nopq
SUMMARY blake3-256 3/3 passed
```

**Exit Code:** 0 ✅

---

### 2. Corruption Suite (`run-corruption-suite.js`)

```
100 passed
```

**测试模式:** bitflip, trunc, swap, versionflip, indexflip, indextrunc, footerflip, zeropage  
**Exit Code:** 0 ✅

---

### 3. Node.js Native Tests (`tests/corruption/resilience.spec.js`)

```
✔ RECV-NEG-001: magicflip must be unrecoverable (recoverable_pct=0)
✔ RECV-004: 100 random corruptions (excluding magicflip) rebuild success rate > 95%
```

**Exit Code:** 0 ✅

---

### 4. 其他验证脚本

| 脚本 | 输出 | 状态 |
|------|------|:----:|
| `verify-integrity.js` | `INTEGRITY_SPEC_OK` | ✅ |
| `verify-traceability.js` | `TRACE_OK` | ✅ |
| `verify-golden-vector.js` | `VERIFY_OK` | ✅ |
| `verify-dict-manifest.js` | `DICT_MANIFEST_OK` | ✅ |
| `verify-neg007-scan.js` | `SCAN_OK` | ✅ |
| `verify-gv003-determinism.js` | `DETERMINISTIC_OK` | ✅ |
| `run-benchmark.js` | `wrote bench/results/baseline.json; pairs=4` | ✅ |

---

## Monorepo 结构验证

```
packages/hajimi-diff/
├── src/hash/
│   ├── blake3_256.js ✅
│   ├── xxh64.js ✅
│   └── index.js ✅ (created)
├── tests/corruption/
│   └── resilience.spec.js ✅ (2/2 passed)
├── delivery/v0.9.1/ ✅
├── bench/ ✅
├── scripts/ ✅ (13 scripts)
└── tools/ ✅ (corrupt + recover)

apps/
├── hajimi-cli/ ✅ (placeholder)
└── hajimi-bench/ ✅ (placeholder)
```

---

## 债务声明

| 债务 ID | 描述 | 状态 |
|---------|------|:----:|
| DEBT-B06-001 | 字节级损坏注入，不评估语义等价 | 已声明 ✅ |
| DEBT-B06-002 | hole 策略简单，复杂损坏可能修复成自洽但不等价 | 已声明 ✅ |
| DEBT-B06-003 | 大文件未做流式处理，可能 OOM | 已声明 ✅ |
| DEBT-B07-003 | BLAKE3 测试向量仅 3 组 | 已声明 ✅ |

---

## 验收结论

**测试标准:** `TEST-REG-001`  
**要求:** 输出包含所有测试通过且 exit code 0  
**结果:** ✅ **PASSED** (112/112 tests passed)

所有既有功能验证通过，Monorepo 重构未破坏既有代码。可以继续执行 **工单 2/4：基线固化**。

---

## SHA256 of Commit

```
64a65abe47c50745b334e29a57afdc200405b158
```

---

*Report generated: 2026-02-19*  
*Validator: Automated Regression Suite*
