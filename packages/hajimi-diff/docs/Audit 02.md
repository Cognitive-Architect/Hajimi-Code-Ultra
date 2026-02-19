````markdown
# HAJIMI-DIFF-AUDIT-REPORT-004
审计员：gpt  
审计对象：豆包 v2.zip（返工产物）  
日期：2026-02-18  

## Executive Summary
总体评级：**B**  
结论：**需二次返工**（8项P0里仍有关键项未清零 + 4项债务未全部按指定位置显式声明 + 部分验证脚本默认环境不可直跑）

本轮“返工亮点”（确实比 v1 正常很多）：
- 目录结构已恢复：`scripts/`、`src/hash/`、`delivery/v0.9.1/` 俱全（见 P0-001 证据）
- 161B 黄金样本已落地：`minimal.hdiff` 严格 161 字节（见 P0-002 证据）
- Spec/完整性脚本/Schema/追溯矩阵均已补齐（P0-004~008 多数通过）

仍阻断 A- 的核心原因（两颗钉子，拔不掉就别冻结）：
1) **BLAKE3-256 口径没对齐**：产物与 JSON 仍落在 `blake2s256_fallback`（P0-003 未清零）  
2) **默认环境不可直跑黄金向量生成/验证**：未启用 fallback 时会在 `src/hash/blake3_256.js:13` 直接 throw（连带 P0-001/脚本 gate）

---

## P0清零验证（8项）

| P0编号 | 检查项 | 状态 | 证据（行号/文件路径） |
|--------|--------|------|-----------------------|
| P0-001 | 目录结构 + 生成脚本可直跑 | ❌ | 结构本身✅：目录存在（`find . -maxdepth 3 -type d` 输出含 `./scripts`/`./src/hash`/`./delivery/v0.9.1`）；脚本位置正确：`scripts/generate-golden-vector.js` 在 `scripts/`。但默认运行失败：`src/hash/blake3_256.js:13` throw 导致 `node scripts/generate-golden-vector.js` 非 0（堆栈指向 `scripts/generate-golden-vector.js:64` 调用 `blake3_256`） |
| P0-002 | 161B 黄金样本大小 | ✅ | `node -e "fs.statSync('delivery/v0.9.1/minimal.hdiff').size"` 输出 `161`；`delivery/v0.9.1/golden-vector.json:3` `"file_size": 161` |
| P0-003 | 校验链口径对齐（BLAKE3-256） | ❌ | `delivery/v0.9.1/golden-vector.json:4` `"hash_algo": "blake2s256_fallback"`（要求 `"blake3-256"`）；`src/hash/blake3_256.js:10-12` 仅在 `HAJIMI_ALLOW_BLAKE2_FALLBACK=1` 时走 `blake2s256`；且债务注释未按要求写为 `DEBT-B02-001`（见“债务声明核查”） |
| P0-004 | Spec 文档补全 | ✅ | 文件存在且非空：`delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md:1` 为标题行；`scripts/verify-integrity.js:13-14` 会检查该文件存在 |
| P0-005 | verify-integrity 可运行 | ✅ | `scripts/verify-integrity.js:18` 打印 `INTEGRITY_SPEC_OK`；实测 `node scripts/verify-integrity.js` 输出 `INTEGRITY_SPEC_OK`（exit 0） |
| P0-006 | Schema 合法 JSON | ✅ | `delivery/v0.9.1/dictionary-manifest.schema.json:1` 为 `{` 且无 `//` 注释；实测 `node -e "JSON.parse(fs.readFileSync('delivery/v0.9.1/dictionary-manifest.schema.json','utf8')); console.log('SCHEMA_JSON_OK')"` 输出 `SCHEMA_JSON_OK` |
| P0-007 | 追溯矩阵补全 + 覆盖 R-001~R-004 + 4债务声明 | ✅ | 覆盖：`delivery/v0.9.1/traceability-matrix.md:5-8` 含 R-001~R-004；债务声明：`delivery/v0.9.1/traceability-matrix.md:10-14` 含 DEBT-B01-001~DEBT-B04-001；文件名正确：`delivery/v0.9.1/traceability-matrix.md` |
| P0-008 | verify-traceability.js 含 SHA256 匹配 | ✅ | `scripts/verify-traceability.js:6` `sha256Hex(...)`；`scripts/verify-traceability.js:18-20` 比对 `actual` vs `golden.file_sha256`；实测 `node scripts/verify-traceability.js` 输出 `TRACE_OK`（exit 0） |

---

## 债务声明核查（4项）

> 本项是 A- Gate 的硬条件：不仅要“有写债务”，还要写在**指定文件顶部/指定章节**，并且 ID 必须精确匹配。

| 债务ID | 声明位置（要求） | 状态 | 证据（行号/文件路径） |
|--------|------------------|------|------------------------|
| DEBT-B01-001 | `scripts/generate-golden-vector.js` 顶部 | ✅ | `scripts/generate-golden-vector.js:1` 以 `// DEBT-B01-001:` 开头 |
| DEBT-B02-001 | `src/hash/blake3_256.js` 顶部 | ❌ | 当前为 `src/hash/blake3_256.js:1` `// DEBT-BLAKE3:`（ID 不匹配，Gate 不认） |
| DEBT-B03-001 | `scripts/generate-dict-manifest.js` 顶部 | ❌ | 当前为 `scripts/generate-dict-manifest.js:1` `// DEBT-DICT:`（未出现 `DEBT-B03-001`；且脚本也未限制 DictID 0..4095，见 `scripts/generate-dict-manifest.js:6-11`） |
| DEBT-B04-001 | `delivery/v0.9.1/traceability-matrix.md` 的“## 债务声明”章节 | ✅ | `delivery/v0.9.1/traceability-matrix.md:10-14` 含 `DEBT-B04-001` |

---

## 验证脚本执行结果

### 1) 结构/产物类检查（本轮通过）
```bash
cd /mnt/data/doubao_v2_extracted

# Spec 禁用字段扫描
node scripts/verify-integrity.js
# 输出：INTEGRITY_SPEC_OK

# 字典清单检查
node scripts/verify-dict-manifest.js
# 输出：DICT_MANIFEST_OK

# 追溯矩阵 SHA256 校验
node scripts/verify-traceability.js
# 输出：TRACE_OK

# 161B 大小检查（对齐派单命令）
node -e "const fs=require('fs'); console.log(fs.statSync('delivery/v0.9.1/minimal.hdiff').size)"
# 输出：161

# Schema JSON 解析
node -e "const fs=require('fs'); JSON.parse(fs.readFileSync('delivery/v0.9.1/dictionary-manifest.schema.json','utf8')); console.log('SCHEMA_JSON_OK')"
# 输出：SCHEMA_JSON_OK
````

### 2) 黄金向量生成/验证（默认环境失败，触发 P0-001/P0-003）

```bash
node scripts/generate-golden-vector.js
# 失败：src/hash/blake3_256.js:13 throw
# 关键信息：BLAKE3 不可用（要求 vendoring 实现或在支持 blake3 的环境运行）

node scripts/verify-golden-vector.js
# 同样失败：src/hash/blake3_256.js:13 throw
```

### 3) 仅用于“本地打通管线”的 fallback（可运行，但会锁死到 blake2s256_fallback，无法满足 P0-003）

```bash
HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/generate-golden-vector.js
# 输出：
# [OK] Wrote: delivery/v0.9.1/minimal.hdiff
# [OK] Wrote: delivery/v0.9.1/golden-vector.json
# [INFO] hash_algo= blake2s256_fallback

HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-golden-vector.js
# 输出：VERIFY_OK

HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-gv003-determinism.js
# 输出：DETERMINISTIC_OK
```

### 4) 负例扫描脚本（当前会误报并 exit 非 0，影响流水线）

```bash
node scripts/verify-neg007-scan.js
# 失败：FOUND_SELF_COPY_PATTERN: /mnt/data/doubao_v2_extracted/Audit 01.md
# 证据：scripts/verify-neg007-scan.js:13 目前把 .md 也纳入扫描（/\.(js|ts|md)$/）
```

---

## 结论与建议

### 是否达到 A- 冻结条件？

**未达到。**
原因：

* **P0-001 / P0-003 未清零**（默认环境黄金向量生成/验证不可直跑；校验链口径仍为 `blake2s256_fallback`）
* **4项债务未全部按指定位置/指定 ID 声明**（DEBT-B02-001、DEBT-B03-001 未达标）
* **verify-neg007-scan.js 当前误报**，会导致 CI gate 不稳定（虽未列入 8 项 P0 表，但会卡“所有验证脚本 exit 0”）

### 二次返工最短路径（按收益/阻断程度排序）

1. **把 BLAKE3-256 从“看环境脸色”改为“仓内可复现”**

   * 目标：`src/hash/blake3_256.js` 必须在默认环境 exit 0 且计算结果稳定
   * 同步修正：`delivery/v0.9.1/golden-vector.json:4` 必须变为 `"hash_algo": "blake3-256"`（不是 fallback 名称）
   * 债务：若仍保留 fallback（仅本地 bring-up），必须把顶部注释改为 `// DEBT-B02-001: ...`（`src/hash/blake3_256.js:1`）

2. **补齐 DEBT-B03-001 的指定位置声明 + DictID 范围策略**

   * 在 `scripts/generate-dict-manifest.js:1` 增加 `// DEBT-B03-001: ...`
   * 同时建议在解析后增加 `0..4095` 范围校验（否则债务不仅“写了”，还会实锤踩坑）

3. **修复 verify-neg007-scan 的误报来源（建议只扫代码目录/后缀）**

   * 证据：`scripts/verify-neg007-scan.js:13` 当前扫描 `.md`
   * 建议：把 `md` 移出扫描范围，或仅扫描 `scripts/`、`src/`，并排除 `Audit*.md`

4. （可接受的 P1）CLI 输出文案对齐

   * `scripts/verify-golden-vector.js:32` 输出为 `VERIFY_OK`，如你仍要求 GV-002 文案含 `VERIFICATION PASSED`，建议统一（不影响功能，但会影响验收一致性）

---

### 需要豆包在 v2.1 明确交付的“验收快照”

* `node scripts/generate-golden-vector.js`（不带环境变量）exit 0
* `node scripts/verify-golden-vector.js`（不带环境变量）exit 0
* `node scripts/verify-neg007-scan.js` exit 0
* `delivery/v0.9.1/golden-vector.json` 的 `hash_algo` 为 `blake3-256`
* `src/hash/blake3_256.js` 顶部存在 `// DEBT-B02-001:`（若保留 fallback）
* `scripts/generate-dict-manifest.js` 顶部存在 `// DEBT-B03-001:`

```
::contentReference[oaicite:0]{index=0}
```
