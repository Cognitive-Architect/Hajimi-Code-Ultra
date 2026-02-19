````markdown
# HAJIMI-DIFF-AUDIT-REPORT-003
审计员：gpt  
审计对象：豆包 v1.zip  
日期：2026-02-18  

## Executive Summary
总体评级：**D**  
结论：**需返工**（存在多项 P0 阻断项，当前不满足“准予冻结”Gate）

### P0 阻断项清单（返工必须清零）
1. **目录结构/相对路径失配导致脚本不可运行，且可能误写到项目外目录**
2. **B-02 关键交付物缺失**：Format Spec 文档 + `verify-integrity.js`
3. **校验链未对齐 IC-002**：实际冻结产物使用 `blake2s256_fallback`，未提供可复现实装的 BLAKE3-256
4. **黄金样本大小不符合 GV-001**：`minimal.hdiff` 为 166B（要求 161B）
5. **B-03 Schema 文件不是合法 JSON / 也不是 JSON Schema**（验证链无法按 DICT-002/003 闭环）
6. **B-04 证据链不足**：追溯矩阵未覆盖 R-001~R-004；`verify-traceability.js` 仅做存在性检查，不做哈希匹配

---

## 逐工单审计

### B-01 黄金向量

| 文件 | 评级 | 状态 | 备注 |
|------|------|------|------|
| `scripts/generate-golden-vector.js`（当前 zip 为根目录 `generate-golden-vector.js`） | D | ❌ Fail | 相对路径依赖 `../src/hash/*`，但 zip 无目录结构，`node` 直接运行报 `MODULE_NOT_FOUND` |
| `scripts/verify-golden-vector.js`（当前 zip 为根目录 `verify-golden-vector.js`） | D | ❌ Fail | 同上；且通过输出不满足 GV-002 文案要求 |
| `scripts/verify-gv003-determinism.js`（当前 zip 为根目录 `verify-gv003-determinism.js`） | D | ❌ Fail | 依赖 `generate-golden-vector.js`，在当前结构下连带失败 |
| `delivery/v0.9.1/golden-vector.json`（当前 zip 为根目录 `golden-vector.json`） | C | ⚠️ Risk | 与 `minimal.hdiff` 自洽，但 file_size=166 与 GV-001 的 161B 不一致，且 hash_algo=blake2s256_fallback |
| `delivery/v0.9.1/minimal.hdiff`（当前 zip 为 `delivery_v0.9.1_minimal.hdiff.zip` 内文件） | C | ⚠️ Risk | 格式字段基本对齐（HAJI/64B/26B/48B），但样本长度为 166B（要求 161B） |

#### 发现的问题
- **P0-001（结构阻断）**：`generate-golden-vector.js` 第 **6** 行引用 `require('../src/hash/xxh64')`，意味着脚本应位于 `scripts/` 目录；但 zip 交付为根目录文件，导致 `node generate-golden-vector.js` 直接报 `MODULE_NOT_FOUND`  
  - 位置：`generate-golden-vector.js:6`  
  - 错误类型：`MODULE_NOT_FOUND`（相对路径解析失败）  
  - 关联条款：ID-115 工程结构假设（脚本位于 `scripts/`，哈希实现位于 `src/hash/`）

- **P0-002（样本不对齐 GV-001）**：黄金样本要求 161B，但当前 `minimal.hdiff` 为 **166B**，同时 `golden-vector.json` 明确记录 `"file_size": 166`  
  - 位置：`golden-vector.json:3`（`"file_size": 166`）  
  - 错误类型：验收口径不一致（冻结产物与 GV-001 不匹配）  
  - 关联条款：ID-115（Header 64B + IndexEntry 26B + Footer 48B = 138B；若总长 161B，则 data_length 必须为 23B）

- **P0-003（校验链口径偏离 IC-002）**：`golden-vector.json` 记录 `"hash_algo": "blake2s256_fallback"`，与 IC-002 的 “XXH64 + BLAKE3-256” 不一致  
  - 位置：`golden-vector.json:4`  
  - 错误类型：算法口径偏离（冻结产物不可在默认环境复现 BLAKE3-256）  
  - 关联条款：IC-002 / ID-115（L3 字段口径）

- **P1-001（大文件精度隐患）**：`verify-golden-vector.js` 将 `readBigUInt64LE` 强转为 `Number(...)`，在十亿级 chunk 场景会溢出 53-bit 精度  
  - 位置：`verify-golden-vector.js:27-28`  
  - 错误类型：整数精度风险（BigInt → Number）  
  - 关联条款：ID-115（IndexOffset/Length 为 uint64_le）

#### 可执行修复
**修复 A（必须，先把交付物“能跑起来”）：恢复目录结构并打包正确**
```text
repo/
  scripts/
    generate-golden-vector.js
    verify-golden-vector.js
    verify-gv003-determinism.js
  src/hash/
    xxh64.js
    blake3_256.js
  delivery/v0.9.1/
    minimal.hdiff
    golden-vector.json
````

**修复 B（必须，对齐 GV-001 161B）：调整最小 payload 长度为 14B**

```javascript
// file: scripts/generate-golden-vector.js
// 原：19 bytes -> data_length=28 -> total=166
const raw = Buffer.from('Hello, Hajimi-Diff!', 'utf8'); // 19 bytes

// 改：14 bytes -> data_length=23 -> total=161
const raw = Buffer.from('Hello, Hajimi!', 'utf8'); // 14 bytes
```

**修复 C（必须，对齐 GV-002 文案 + 补 Magic 检查 + 规避 BigInt 精度坑）**

```javascript
// file: scripts/verify-golden-vector.js
const MAGIC = Buffer.from('HAJI', 'ascii');
if (!fileBuf.slice(0, 4).equals(MAGIC)) {
  throw new Error('Error: Magic mismatch');
}

// 读取 uint64_le 不要转 Number
const indexOffset = fileBuf.readBigUInt64LE(0x0B);
const indexLength = fileBuf.readBigUInt64LE(0x13);
const indexTable = fileBuf.slice(Number(indexOffset), Number(indexOffset + indexLength));

// 输出文案对齐 Gate
console.log('VERIFICATION PASSED');
```

**修复 D（P0，校验链口径二选一，必须冻结一致）**

* 推荐（对齐 IC-002）：引入可复现的 BLAKE3-256 实现（可 vendoring 纯 JS/wasm，但需要在仓内显式落盘，并在 TRC 矩阵记录版本与哈希）
* 替代（省钱但要改口径）：把 spec/脚本/追溯矩阵统一声明为 `blake2s256`，并把 `hash_algo` 改为固定值（禁止环境变量开关参与冻结）

#### 即时可验证方法

> 以下命令以“目录结构已修复”为前提（脚本在 `scripts/`，哈希在 `src/hash/`）

```bash
node -v
node scripts/generate-golden-vector.js
node scripts/verify-gv003-determinism.js
node scripts/verify-golden-vector.js && echo "PASS"
```

通过标准：

* 退出码 0
* `verify-golden-vector.js` 输出包含 `VERIFICATION PASSED`
* `verify-gv003-determinism.js` 输出包含 `DETERMINISTIC_OK`

失败反馈（典型）：

* `Error: Cannot find module '../src/hash/xxh64'`（结构未修复）
* `Error: Magic mismatch`（产物头部不一致）
* `Error: SHA256 mismatch`（产物与黄金向量不一致）

---

### B-02 校验链统一

| 文件                                                    | 评级 | 状态      | 备注                                                    |
| ----------------------------------------------------- | -- | ------- | ----------------------------------------------------- |
| `delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md`   | D  | ❌ Fail  | **缺失**（zip 15 文件清单中不存在）                               |
| `scripts/verify-integrity.js`                         | D  | ❌ Fail  | **缺失**（zip 15 文件清单中不存在）                               |
| `src/hash/xxh64.js`（当前 zip 为根目录 `xxh64.js`）           | B  | ⚠️ Risk | 纯 JS BigInt 实现，功能可用；但随 zip 结构失配导致上层脚本不可引用             |
| `src/hash/blake3_256.js`（当前 zip 为根目录 `blake3_256.js`） | C  | ⚠️ Risk | 依赖 Node `crypto`，且默认环境无 blake3；冻结产物走 fallback（见 B-01） |

#### 发现的问题

* **P0-004（关键文件缺失）**：Format Spec 文档未交付，无法审查 “CRC32-C 是否彻底清除 / BNF 是否含 CRC 字段”

  * 位置：zip 清单缺失（无对应文件路径）
  * 错误类型：交付物缺失（IC-001 阻断）

* **P0-005（关键文件缺失）**：`scripts/verify-integrity.js` 未交付，无法做 IC-002 的自动验收

  * 位置：zip 清单缺失（无对应文件路径）
  * 错误类型：交付物缺失（IC-002 阻断）

* **P1-002（隐藏依赖未显式列债）**：多处脚本 `require('crypto')`（内置模块），但未按要求声明为 `DEBT-B01-001/DEBT-B02-001` 等标准债务项

  * 位置示例：`blake3_256.js:3` / `generate-golden-vector.js:5` / `verify-golden-vector.js:5`
  * 错误类型：债务声明缺失（Gate 要求“4项债务显式声明”无法满足）

#### 可执行修复

**补全 Format Spec（最小可冻结骨架，必须明确：Magic=HAJI / 64B Header / 26B IndexEntry / 48B Footer / L2=XXH64 / L3=BLAKE3-256）**

```markdown
<!-- file: delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md -->
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
```

**补全 `scripts/verify-integrity.js`（不引入第三方库，做 fail-fast 检查）**

```javascript
// file: scripts/verify-integrity.js
'use strict';
const fs = require('fs');
const path = require('path');

function mustExist(p){ if(!fs.existsSync(p)) throw new Error('Missing: '+p); }
function mustNotContain(p, needle){
  const t = fs.readFileSync(p,'utf8');
  if (t.includes(needle)) throw new Error('Found forbidden token: '+needle);
}

function main(){
  const repoRoot = path.resolve(__dirname,'..');
  const spec = path.join(repoRoot,'delivery','v0.9.1','Hajimi-Diff-Format-Spec-v0.9.1.md');
  mustExist(spec);
  // IC-001: 不允许出现 CRC32-C 相关字段（按冻结口径）
  mustNotContain(spec, 'CRC32');
  mustNotContain(spec, 'CRC32C');
  console.log('INTEGRITY_SPEC_OK');
}
if(require.main===module) main();
```

#### 即时可验证方法

```bash
node scripts/verify-integrity.js && echo "PASS"
```

通过标准：

* exit 0
* 输出包含 `INTEGRITY_SPEC_OK`

失败反馈（典型）：

* `Error: Missing: ...Hajimi-Diff-Format-Spec-v0.9.1.md`
* `Error: Found forbidden token: CRC32`

---

### B-03 字典清单

| 文件                                                                                               | 评级 | 状态      | 备注                                                                    |
| ------------------------------------------------------------------------------------------------ | -- | ------- | --------------------------------------------------------------------- |
| `scripts/generate-dict-manifest.js`（当前 zip 为根目录 `generate-dict-manifest.js`）                     | C  | ⚠️ Risk | 放在根目录会把 `repoRoot` 解析到父目录，可能在项目外生成 `delivery/`                        |
| `scripts/verify-dict-manifest.js`（当前 zip 为根目录 `verify-dict-manifest.js`）                         | D  | ❌ Fail  | 依赖 `repoRoot=..`，在当前结构下找不到 `delivery/v0.9.1/dictionary-manifest.json` |
| `delivery/v0.9.1/dictionary-manifest.json`（当前 zip 为根目录 `dictionary-manifest.json`）               | C  | ⚠️ Risk | 存在但路径不符合交付结构；内容为空字典列表，缺少生成证据                                          |
| `delivery/v0.9.1/dictionary-manifest.schema.json`（当前 zip 为根目录 `dictionary-manifest.schema.json`） | D  | ❌ Fail  | **不是合法 JSON**（含 `//` 注释），且不是 JSON Schema                              |

#### 发现的问题

* **P0-006（Schema 文件不可解析）**：`dictionary-manifest.schema.json` 第 **1** 行以 `//` 开头，导致 `JSON.parse` 无法解析；同时文件内容不是标准 JSON Schema

  * 位置：`dictionary-manifest.schema.json:1`
  * 错误类型：格式错误（DICT-003 阻断）

* **P1-003（DictID 上限未约束）**：`generate-dict-manifest.js` 允许 `id(\d{1,4})`，但未限制 `0..4095`，多租户场景可能溢出 12-bit DictID

  * 位置：`generate-dict-manifest.js:8-11`
  * 错误类型：范围校验缺失（DICT-001/DEBT-B03-001 相关）

#### 可执行修复

**修复 A（必须）：把 schema 改为合法 JSON Schema（无外部 $ref）**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "Hajimi Dictionary Manifest v0.9.1",
  "type": "object",
  "required": ["version", "manifest_format", "dictionaries"],
  "additionalProperties": false,
  "properties": {
    "version": { "type": "string", "const": "0.9.1" },
    "manifest_format": { "type": "string", "const": "hajimi-dict-v1" },
    "dictionaries": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["dict_id", "name", "format", "sha256", "size_bytes", "compatible_versions", "distribution_path"],
        "additionalProperties": false,
        "properties": {
          "dict_id": { "type": "integer", "minimum": 0, "maximum": 4095 },
          "name": { "type": "string", "minLength": 1 },
          "format": { "type": "string", "enum": ["zstd"] },
          "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" },
          "size_bytes": { "type": "integer", "minimum": 0 },
          "compatible_versions": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
          "distribution_path": { "type": "string", "minLength": 1 },
          "source_corpus": { "type": "string" },
          "training_date": { "type": ["string", "null"], "pattern": "^\\d{4}-\\d{2}-\\d{2}$" }
        }
      }
    }
  }
}
```

**修复 B（必须）：`generate-dict-manifest.js` 限制 dict_id 范围**

```javascript
// file: scripts/generate-dict-manifest.js
const dictId = parseDictId(file);
if (dictId === null) continue;
if (dictId < 0 || dictId > 4095) {
  throw new Error('dict_id out of range (0..4095): ' + dictId + ' file=' + file);
}
```

**修复 C（建议）：`verify-dict-manifest.js` 增加 schema 校验（不引第三方库，做 subset 校验即可）**

```javascript
// file: scripts/verify-dict-manifest.js
const schema = JSON.parse(fs.readFileSync(path.join(dir,'dictionary-manifest.schema.json'),'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(dir,'dictionary-manifest.json'),'utf8'));
// 只做 required + type + min/max 的子集校验（覆盖 DICT-002 的核心验收点）
```

#### 即时可验证方法

```bash
node scripts/generate-dict-manifest.js
node scripts/verify-dict-manifest.js && echo "PASS"
```

通过标准：

* exit 0
* 输出包含 `DICT_MANIFEST_OK`

---

### B-04 证据链

| 文件                                                                                             | 评级 | 状态     | 备注                                    |
| ---------------------------------------------------------------------------------------------- | -- | ------ | ------------------------------------- |
| `delivery/v0.9.1/traceability-matrix.md`（当前 zip 为 `delivery_v0.9.1_traceability-matrix.md.md`） | D  | ❌ Fail | 文件名错误且表格被转义（`\|`），并未覆盖 R-001~R-004    |
| `scripts/verify-traceability.js`（当前 zip 为根目录 `verify-traceability.js`）                         | D  | ❌ Fail | 当前结构下 `repoRoot=..` 指向父目录，直接报 Missing |
| `scripts/verify-neg007-scan.js`（当前 zip 为根目录 `verify-neg007-scan.js`）                           | D  | ❌ Fail | 当前结构下扫描范围落到父目录，容易误报并阻断流水线             |

#### 发现的问题

* **P0-007（TRC-001 断链）**：追溯矩阵未覆盖 R-001~R-004，且表格被 `\|` 转义导致不可直接渲染/解析

  * 位置：`delivery_v0.9.1_traceability-matrix.md.md:5-16`
  * 错误类型：证据链缺失（TRC-001 阻断）

* **P0-008（TRC-002 不满足）**：`verify-traceability.js` 第 **1** 行自述“仅验证文件存在性”，未做哈希匹配

  * 位置：`verify-traceability.js:1`
  * 错误类型：验收覆盖不足（TRC-002 阻断）

* **P1-004（负例扫描误报风险）**：`verify-neg007-scan.js` 默认扫描 `.md`，且排除列表过窄，容易因为文档/历史残骸出现 `readFileSync(__filename)` 字样而误报

  * 位置：`verify-neg007-scan.js:30-37`
  * 错误类型：误报导致阻断（TRC-003 相关）

#### 可执行修复

**修复 A（必须）：修正矩阵文件名与表格格式，并覆盖 R-001~R-004**

```markdown
<!-- file: delivery/v0.9.1/traceability-matrix.md -->
# Traceability Matrix (v0.9.1)

| Ref | 对应修复 | 产物/代码路径 | 验证脚本 | 通过标准 |
|---|---|---|---|---|
| R-001 | 黄金向量 | delivery/v0.9.1/minimal.hdiff + delivery/v0.9.1/golden-vector.json | scripts/verify-golden-vector.js | VERIFICATION PASSED |
| R-002 | 校验链统一 | delivery/v0.9.1/Hajimi-Diff-Format-Spec-v0.9.1.md | scripts/verify-integrity.js | INTEGRITY_SPEC_OK |
| R-003 | 字典清单 | delivery/v0.9.1/dictionary-manifest.json + .schema.json | scripts/verify-dict-manifest.js | DICT_MANIFEST_OK |
| R-004 | 证据链闭环 | delivery/v0.9.1/traceability-matrix.md | scripts/verify-traceability.js | TRACE_OK |
```

**修复 B（必须）：`verify-traceability.js` 增加哈希匹配（至少覆盖 minimal.hdiff ↔ golden-vector.json）**

```javascript
// file: scripts/verify-traceability.js
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function sha256Hex(buf){ return crypto.createHash('sha256').update(buf).digest('hex'); }
function mustExist(p){ if(!fs.existsSync(p)) throw new Error('Missing: '+p); }

function main(){
  const repoRoot = path.resolve(__dirname,'..');
  const dir = path.join(repoRoot,'delivery','v0.9.1');
  const hdiff = path.join(dir,'minimal.hdiff');
  const gv = path.join(dir,'golden-vector.json');
  mustExist(hdiff); mustExist(gv);

  const fileBuf = fs.readFileSync(hdiff);
  const golden = JSON.parse(fs.readFileSync(gv,'utf8'));
  const actual = sha256Hex(fileBuf);
  if (actual !== golden.file_sha256) throw new Error('Hash mismatch: minimal.hdiff sha256');

  console.log('TRACE_OK');
}
if(require.main===module) main();
```

**修复 C（建议）：`verify-neg007-scan.js` 只扫代码文件，并排除 delivery/docs**

```javascript
// file: scripts/verify-neg007-scan.js
// 1) 只收集 .js/.ts 2) 跳过 delivery/ 与 docs/
```

#### 即时可验证方法

```bash
node scripts/verify-traceability.js && echo "PASS"
node scripts/verify-neg007-scan.js && echo "PASS"
```

通过标准：

* exit 0
* 输出分别包含 `TRACE_OK` / `SCAN_OK`

---

## 债务核查

| 债务ID         | 要求                     | 当前状态                         | 证据                              |
| ------------ | ---------------------- | ---------------------------- | ------------------------------- |
| DEBT-B01-001 | 黄金向量潜在随机性来源显式声明        | **未声明**                      | 全仓 15 文件中无 `DEBT-B01-001` 字符串命中 |
| DEBT-B02-001 | BLAKE3-256 实现/降级策略显式声明 | **未声明（仅有非标准命名 DEBT-BLAKE3）** | `blake3_256.js:1`               |
| DEBT-B03-001 | DictID 4096 溢出风险显式声明   | **未声明**                      | 全仓 15 文件中无 `DEBT-B03-001` 字符串命中 |
| DEBT-B04-001 | 追溯矩阵手动维护遗漏风险显式声明       | **未声明**                      | 全仓 15 文件中无 `DEBT-B04-001` 字符串命中 |

隐藏债务挖掘（已发现）：

* Node 内置模块依赖：`crypto`（见 `generate-golden-vector.js:5`、`verify-golden-vector.js:5`、`blake3_256.js:3` 等）
* 脚本落盘路径风险：在当前 zip 结构下，多脚本 `repoRoot = path.resolve(__dirname, '..')` 会指向父目录（见 `verify-traceability.js:9`、`generate-dict-manifest.js:17`、`verify-neg007-scan.js:18`）

---

## 结论（放行 Gate 判定）

* **准予冻结条件**（本单要求）：4 工单全部 ≥ A-，无 P0；且 DEBT-B01-001~DEBT-B04-001 均显式声明
* **本次结果**：存在 P0（结构阻断/关键文件缺失/口径不一致/证据链断裂），**打回返工**

### 返工优先级建议（最短闭环）

1. 先修目录结构 + 补齐缺失文件（Spec + verify-integrity）
2. 再对齐 GV-001（161B）并重新生成 golden vector
3. 再统一 L3 口径（BLAKE3-256 或明确改口径并全链路一致）
4. 最后补齐 TRC 矩阵与 verify-traceability 的哈希校验

```
::contentReference[oaicite:0]{index=0}
```
