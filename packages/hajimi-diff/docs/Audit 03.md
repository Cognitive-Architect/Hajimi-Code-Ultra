TL;DR：**豆包 v3 还没到 A- 冻结线**，最大坑是 **L3 口径“写 blake3-256，但文件实际是 blake2s256”**（属于冻结级别的正确性/可复现性问题）；其余（债务ID、负例扫描、目录结构、161B、追溯、字典、Spec）基本都收敛了 ✅

````markdown
# HAJIMI-DIFF-AUDIT-REPORT-005
审计员：gpt  
审计对象：豆包 v3.zip（第三轮返工产物）  
日期：2026-02-18  
参考：Audit 01.md（ID-003）+ Audit 02.md（ID-004）

## Executive Summary
总体评级：**B**  
结论：**需返工**（仍存在冻结阻断项：L3 哈希口径与交付产物不一致，导致“可复现/可验证”口径无法闭环）

本轮确实修掉了 Audit 02 的三卡点中的两项半：
- ✅ 债务ID命名合规（B02/B03 已按标准ID）
- ✅ 负例扫描不再误扫 `.md`（SCAN_OK）
- ⚠️ “BLAKE3口径对齐”只做到**文案层**：`golden-vector.json` 写了 `"blake3-256"`，但 `minimal.hdiff` 的 Footer(32B) 实测等于 **blake2s256(preFooter)**（证据见检查项 #3 + 附加取证）

---

## 审计链连续性确认
- Audit 01（首轮）：D级，8P0清单 ✅已参考  
- Audit 02（二轮）：B级，遗留卡点（BLAKE3默认环境不可跑 / 债务ID不合规 / 负例扫描误报） ✅已参考  
- Audit 05（本轮）：针对 v3.zip 最终验收（10项清单 + 冻结一致性取证）

---

## 逐项验证结果（10项）

| 序号 | 检查项 | 状态 | 验证命令 | 实际输出 |
|------|--------|------|----------|----------|
| 1 | 债务ID-B02 | ✅ | `grep "DEBT-B02-001" src/hash/blake3_256.js` | 命中（见：`src/hash/blake3_256.js:1,4`） |
| 2 | 债务ID-B03 | ✅ | `grep "DEBT-B03-001" scripts/generate-dict-manifest.js` | 命中（见：`scripts/generate-dict-manifest.js:1`） |
| 3 | hash_algo 文案 | ⚠️/❌ | `cat delivery/v0.9.1/golden-vector.json \| grep hash_algo` | `"hash_algo": "blake3-256"`（见：`delivery/.../golden-vector.json:4`） |
| 4 | 负例扫描 | ✅ | `node scripts/verify-neg007-scan.js` | `SCAN_OK` |
| 5 | 黄金向量生成（默认环境+fallback） | ✅(按清单) | `node scripts/generate-golden-vector.js 2>&1 \|\| echo "EXPECTED_FAIL_OR_FALLBACK"` | 默认环境抛错并提示 fallback；随后输出 `EXPECTED_FAIL_OR_FALLBACK`（堆栈指向 `src/hash/blake3_256.js:16`） |
| 6 | 黄金向量生成（带环境变量） | ✅ | `HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/generate-golden-vector.js` | `Wrote: delivery/v0.9.1/minimal.hdiff` + `hash_algo= blake2s256_fallback` |
| 7 | 黄金向量验证（确定性+完整性） | ✅ | `HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-golden-vector.js` | `VERIFY_OK` |
| 8 | 确定性回归 | ✅ | `HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-gv003-determinism.js` | `DETERMINISTIC_OK` |
| 9 | 完整性检查（Spec 文档） | ✅ | `node scripts/verify-integrity.js` | `INTEGRITY_SPEC_OK` |
| 10 | 字典/追溯/161B 回归 | ✅ | `node scripts/verify-dict-manifest.js` / `node scripts/verify-traceability.js` / `node -e ...statSync...` | `DICT_MANIFEST_OK` / `TRACE_OK` / `161` |

> 说明：表中 #3（hash_algo）在“grep 文案层”是 ✅，但在“冻结一致性层”是 **❌**（见下方 P0-003 与附加取证）。本审计以“冻结一致性”为放行标准，因此整体评级不能给 A-。

---

## P0清零确认（8项）
- P0-001（目录结构 & MODULE_NOT_FOUND 清零）：✅  
  - 证据：zip 解压后存在 `scripts/`、`src/hash/`、`delivery/v0.9.1/`，且脚本不再因相对路径报 `MODULE_NOT_FOUND`（对比 v1 的 `MODULE_NOT_FOUND` 问题已消失）
- P0-002（161B 大小）：✅  
  - 证据：`delivery/v0.9.1/golden-vector.json:3` `file_size=161`；命令输出 `161`
- **P0-003（BLAKE3-256 口径对齐）：❌（仍阻断冻结）**  
  - 证据1（文档/声明口径）：  
    - `delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md:15` L3 写 `BLAKE3-256`  
    - `delivery/v0.9.1/golden-vector.json:4` `"hash_algo": "blake3-256"`  
  - 证据2（实现口径）：  
    - `src/hash/blake3_256.js:13-15` fallback 实际调用 `crypto.createHash('blake2s256')`  
    - 默认环境 `node scripts/generate-golden-vector.js` 抛错（`src/hash/blake3_256.js:16`）  
  - **证据3（产物实测口径，关键）：**  
    - 附加取证命令输出 `matches_blake2 true`（表示 `minimal.hdiff` Footer(32B) == blake2s256(preFooter)，并非 blake3）
- P0-004（Spec 文档补全）：✅  
  - 证据：`delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md:1` 起有内容；`verify-integrity.js` 可跑
- P0-005（verify-integrity 补全可运行）：✅  
  - 证据：`node scripts/verify-integrity.js` 输出 `INTEGRITY_SPEC_OK`
- P0-006（Schema 合法 JSON）：✅  
  - 证据：`delivery/v0.9.1/dictionary-manifest.schema.json` 可被 `JSON.parse` 解析（无 `//` 注释）
- P0-007（追溯矩阵补全 & 覆盖 R-001~R-004）：✅  
  - 证据：`delivery/v0.9.1/traceability-matrix.md:5-8` 覆盖四条
- P0-008（verify-traceability.js 哈希匹配）：✅  
  - 证据：`scripts/verify-traceability.js:18-20` 做 SHA256 比对；命令输出 `TRACE_OK`

---

## 债务声明核查（4项）
- DEBT-B01-001: ✅（位置：`scripts/generate-golden-vector.js:1`）
- DEBT-B02-001: ✅（位置：`src/hash/blake3_256.js:1` 与 `:4`）
- DEBT-B03-001: ✅（位置：`scripts/generate-dict-manifest.js:1`）
- DEBT-B04-001: ✅（位置：`delivery/v0.9.1/traceability-matrix.md:14`）

---

## 发现的问题（阻断冻结 / 需要返工）

### P0-003：L3 哈希“声明/文档/JSON”与“产物/实现”不一致（阻断冻结）
**现象**
- 文档/JSON 声称 L3 是 `blake3-256`：  
  - `delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md:15`  
  - `delivery/v0.9.1/golden-vector.json:4`
- 但实现 fallback 实际是 `blake2s256`：  
  - `src/hash/blake3_256.js:13-15`
- 交付产物 `minimal.hdiff` 的 Footer(32B) 实测等于 `blake2s256(preFooter)`：  
  - 取证命令输出：`matches_blake2 true`

**后果（不修会导致…）**
- 冻结态的“格式规格”与“实际文件字节”不一致：实现/验证方按 Spec 做复现会出现不可解释差异，后续 IMPL 阶段所有对齐动作会反复返工（尤其是跨平台/跨Node版本时）。

---

## 落地可执行路径（FIX-006）
> 目标：让 v0.9.1 冻结态真正满足“L3=BLAKE3-256”，并确保交付物与脚本一致可复现。

### 方案A（推荐，满足派单目标：hash_algo=blake3-256）
**做法**
1) **仓内 vendoring 一个可用的 blake3_256 实现**（纯 JS 或 wasm 均可，要求代码随仓落盘，避免“看环境脸色”）  
2) 修改 `src/hash/blake3_256.js`：优先使用 vendored 实现；只有在明确 env 允许时才走 blake2 fallback，并且**不得覆盖冻结产物**  
3) 修改 `scripts/generate-golden-vector.js`：  
   - `golden.hash_algo` 统一输出 `"blake3-256"`（注意目前实现会输出 `'blake3'`，见 `scripts/generate-golden-vector.js:74-75`，与验收口径不一致）  
4) 重新生成：`node scripts/generate-golden-vector.js`（默认环境应 exit 0），并提交 `delivery/v0.9.1/*` 更新

**最小代码改动示意（可复制替换骨架）**
```js
// file: src/hash/blake3_256.js
// DEBT-B02-001: vendored实现为wasm/纯JS（说明具体来源与版本）；若保留blake2 fallback，仅用于本地 bring-up

'use strict';
const crypto = require('crypto');

// 可选：引入 vendored 实现（示意名）
let vendored = null;
try {
  vendored = require('./blake3_vendor'); // 需要你把实现放进 src/hash/
} catch (_) {}

function blake3_256(buf) {
  // 1) 原生支持则直接用
  const hashes = (crypto.getHashes && crypto.getHashes()) || [];
  if (hashes.includes('blake3')) {
    return crypto.createHash('blake3').update(buf).digest();
  }

  // 2) vendored 支持则用它（目标：默认环境也能跑）
  if (vendored && typeof vendored.blake3_256 === 'function') {
    return vendored.blake3_256(buf);
  }

  // 3) 仅本地 bring-up：显式允许才走 blake2 fallback（不用于冻结）
  if (process.env.HAJIMI_ALLOW_BLAKE2_FALLBACK === '1') {
    return crypto.createHash('blake2s256').update(buf).digest();
  }

  throw new Error('BLAKE3 不可用：缺少 vendored 实现；请补齐 src/hash/blake3_vendor.*');
}

module.exports = { blake3_256 };
````

**工时预估（分钟级）**

* vendoring + 接线 + 回归：**45-120 分钟**（取决于你选的实现形态：纯JS更久，wasm较快）

---

### 方案B（替代，省时但不满足“hash_algo=blake3-256”目标）

> 仅当你愿意把 v0.9.1 冻结口径改为 blake2s256 时使用；否则会与派单验收冲突。

**做法**

* 把 Spec 与字段名整体改为 blake2：

  * `delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md:15` L3 改为 `BLAKE2s-256`
  * `delivery/v0.9.1/golden-vector.json:4` 改为 `"blake2s256_fallback"`
  * `file_blake3_256_hex` 字段改名为 `file_blake2s256_hex`（同时改脚本生成/验证）
* 该方案可在 **10-20 分钟**完成，但会改变你原本对标口径（不推荐作为“最终冻结”）

---

## 即时可验证方法（每条结论附命令）

### 1) 验证债务ID命名合规

```bash
grep "DEBT-B02-001" src/hash/blake3_256.js
grep "DEBT-B03-001" scripts/generate-dict-manifest.js
```

通过：两条都输出非空
失败：无输出（exit 1）

### 2) 验证负例扫描不误报

```bash
node scripts/verify-neg007-scan.js
```

通过：输出 `SCAN_OK` 且 exit 0
失败：抛错 `FOUND_SELF_COPY_PATTERN`

### 3) 验证 L3 口径是否真实为 blake3（冻结一致性关键）

```bash
# 若已补齐 vendored blake3：默认环境应能生成并验证
node scripts/generate-golden-vector.js
node scripts/verify-golden-vector.js

# 取证：对比 Footer(32B) 是否仍等于 blake2s256(preFooter)（理想情况应为 false）
node - <<'NODE'
const fs=require('fs'); const crypto=require('crypto');
const buf=fs.readFileSync('delivery/v0.9.1/minimal.hdiff');
const footer=buf.slice(buf.length-48);
const expected=footer.slice(0,32);
const pre=buf.slice(0,buf.length-48);
const blake2=crypto.createHash('blake2s256').update(pre).digest();
console.log('matches_blake2', blake2.equals(expected));
NODE
```

通过（目标为 blake3 冻结）：`matches_blake2 false`
失败（当前 v3 状态）：`matches_blake2 true`

---

## 验证脚本执行日志（原始输出）

```bash
CMD: grep "DEBT-B02-001" src/hash/blake3_256.js
// DEBT-B02-001: ...
// 债务：DEBT-B02-001...

CMD: grep "DEBT-B03-001" scripts/generate-dict-manifest.js
// DEBT-B03-001: ...

CMD: cat delivery/v0.9.1/golden-vector.json | grep hash_algo
  "hash_algo": "blake3-256",

CMD: node scripts/verify-neg007-scan.js
SCAN_OK

CMD: node scripts/generate-golden-vector.js 2>&1 || echo EXPECTED_FAIL_OR_FALLBACK
Error: BLAKE3 不可用 ...（堆栈：src/hash/blake3_256.js:16）
EXPECTED_FAIL_OR_FALLBACK

CMD: HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/generate-golden-vector.js
[OK] Wrote: delivery/v0.9.1/minimal.hdiff
[OK] Wrote: delivery/v0.9.1/golden-vector.json
[INFO] hash_algo= blake2s256_fallback

CMD: HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-golden-vector.js
VERIFY_OK

CMD: HAJIMI_ALLOW_BLAKE2_FALLBACK=1 node scripts/verify-gv003-determinism.js
DETERMINISTIC_OK

CMD: node scripts/verify-integrity.js
INTEGRITY_SPEC_OK

CMD: node scripts/verify-dict-manifest.js
DICT_MANIFEST_OK

CMD: node scripts/verify-traceability.js
TRACE_OK

CMD: node -e "console.log(require('fs').statSync('delivery/v0.9.1/minimal.hdiff').size)"
161

CMD: (取证) Footer(32B) 是否等于 blake2s256(preFooter)
matches_blake2 true
```

---

## 结论与建议

* 本轮 v3 **仍未达到 A- 冻结条件**：核心阻断项是 **L3 哈希口径不一致（写 blake3、实为 blake2）**
* 建议执行 **FIX-006（方案A）**：仓内 vendoring 可用 blake3_256，实现“默认环境可生成/可验证”，并重新生成交付物后再走一次 10 项验收清单
* 非阻断 P1（可后续修）：

  * `traceability-matrix.md:5` 的通过标准写 `VERIFICATION PASSED`，但脚本输出 `VERIFY_OK`（建议二选一对齐）
  * `scripts/verify-dict-manifest.js` 仅做子集校验，未真正跑 JSON Schema（可接受，但建议后续补强）

```
::contentReference[oaicite:0]{index=0}
```
