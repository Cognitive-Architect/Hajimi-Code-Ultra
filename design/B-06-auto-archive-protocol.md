# B-06: 自动归档协议设计

**债务项**: DEBT-DOC-001【已清偿 v1.1】  
**设计目标**: 审计报告自动落盘，01-99 编号自增  
**版本**: v1.1.0  
**日期**: 2026-02-19  

---

## 1. 架构概述

### 1.1 归档流程

```
┌─────────────────────────────────────────────────────────────┐
│                    Audit Archive Pipeline                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Trigger (npm run audit:archive)                             │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐                                           │
│  │ Scan Report  │───→ 读取最新审计输出 (JSON/YAML)           │
│  │ (扫描报告)    │                                           │
│  └──────────────┘                                           │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐                                           │
│  │ Gen Number   │───→ 从 01-99 分配下一个可用编号            │
│  │ (生成编号)    │                                           │
│  └──────────────┘                                           │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐    ┌──────────────┐                      │
│  │ Render MD    │───→│ Write File   │                      │
│  │ (渲染模板)    │    │ (写入文件)    │                      │
│  └──────────────┘    └──────────────┘                      │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐                                           │
│  │ Update Index │───→ 更新 README.md 索引                   │
│  │ (更新索引)    │                                           │
│  └──────────────┘                                           │
│       │                                                      │
│       ▼                                                      │
│  ┌──────────────┐                                           │
│  │ Git Commit   │───→ 可选：自动提交到仓库                   │
│  │ (提交归档)    │                                           │
│  └──────────────┘                                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. 编号分配算法

### 2.1 01-99 编号规则

```typescript
interface ArchiveNumber {
  serial: number;      // 01-99
  padded: string;      // "01", "02", ..., "99"
  full: string;        // "05-v1.1-DEBT-CLEARANCE"
}

class ArchiveNumberGenerator {
  private baseDir: string;
  
  constructor(baseDir: string = 'docs/audit report') {
    this.baseDir = baseDir;
  }
  
  /**
   * 获取下一个可用编号
   */
  getNextNumber(): ArchiveNumber {
    const existing = this.listExistingNumbers();
    
    if (existing.length >= 99) {
      throw new Error('Archive number exhausted (99 reached)');
    }
    
    // 找到最大编号并 +1
    const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
    const nextNum = maxNum + 1;
    
    return {
      serial: nextNum,
      padded: String(nextNum).padStart(2, '0'),
      full: `${String(nextNum).padStart(2, '0')}-v1.1-REPORT`
    };
  }
  
  /**
   * 列出已有编号
   */
  listExistingNumbers(): number[] {
    if (!fs.existsSync(this.baseDir)) {
      return [];
    }
    
    const files = fs.readdirSync(this.baseDir);
    const numbers: number[] = [];
    
    for (const file of files) {
      const match = file.match(/^(\d{2})-/);
      if (match) {
        numbers.push(parseInt(match[1], 10));
      }
    }
    
    return numbers.sort((a, b) => a - b);
  }
  
  /**
   * 检查编号是否可用
   */
  isNumberAvailable(num: number): boolean {
    return !this.listExistingNumbers().includes(num);
  }
}
```

---

## 3. 文件命名规范

### 3.1 命名格式

```
{NN}-{VERSION}-{TITLE}-AUDIT.md

Examples:
- 01-v0.9.1-RC-ARCH-AUDIT.md
- 02-v1.0.0-alpha-DEBT-VALIDATION.md
- 05-v1.1-DEBT-CLEARANCE-AUDIT.md
```

### 3.2 文件结构

```markdown
# {NN}: {TITLE} 审计报告

**版本**: {VERSION}  
**日期**: {ISO_DATE}  
**审计者**: {AUDITOR}  

---

## 执行摘要

... (正文)

---

## 审计发现

... (正文)

---

## 债务清单

... (正文)

---

*归档编号: {NN}*  
*自动生成: {TIMESTAMP}*
```

---

## 4. 索引更新机制

### 4.1 README.md 索引格式

```markdown
# Audit Report Index

## 归档列表 (01-99)

| 编号 | 版本 | 标题 | 日期 | 状态 |
|------|------|------|------|------|
| 01 | v0.9.1-RC | 架构审计 | 2026-02-10 | ✅ 已归档 |
| 02 | v1.0.0-alpha | 债务验证 | 2026-02-15 | ✅ 已归档 |
| 05 | v1.1 | 债务清偿 | 2026-02-19 | ✅ 已归档 |

## 快速链接

- [最新审计](./05-v1.1-DEBT-CLEARANCE-AUDIT.md)
- [归档规范](../design/B-06-auto-archive-protocol.md)
```

### 4.2 自动更新算法

```typescript
class ReadmeIndexUpdater {
  private readmePath: string;
  
  constructor(readmePath: string = 'docs/audit report/README.md') {
    this.readmePath = readmePath;
  }
  
  /**
   * 添加新条目到索引
   */
  addEntry(entry: {
    number: string;
    version: string;
    title: string;
    date: string;
    fileName: string;
  }): void {
    let content = fs.readFileSync(this.readmePath, 'utf8');
    
    // 在表格中添加新行
    const newRow = `| ${entry.number} | ${entry.version} | ${entry.title} | ${entry.date} | ✅ 已归档 |`;
    
    // 找到表格最后一行并插入
    const lines = content.split('\n');
    const tableEndIndex = lines.findIndex(line => line.startsWith('|') && !lines[lines.indexOf(line) + 1]?.startsWith('|'));
    
    if (tableEndIndex > 0) {
      lines.splice(tableEndIndex + 1, 0, newRow);
    }
    
    // 更新最新审计链接
    content = lines.join('\n');
    content = content.replace(
      /\[最新审计\]\.\/\d{2}-[^)]+\)/,
      `[最新审计](./${entry.fileName})`
    );
    
    fs.writeFileSync(this.readmePath, content);
  }
}
```

---

## 5. Mustache 模板

### 5.1 模板结构

```mustache
<!-- templates/audit-report.mustache -->
# {{number}}: {{title}} 审计报告

**版本**: {{version}}  
**日期**: {{date}}  
**审计者**: {{auditor}}  

---

## 执行摘要

{{summary}}

## 审计发现

{{#findings}}
### {{id}}: {{title}}

- **严重程度**: {{severity}}
- **状态**: {{status}}
- **证据**: {{evidence}}

{{description}}

{{/findings}}

## 债务清单

{{#debts}}
- **{{id}}**: {{description}} ({{priority}})
{{/debts}}

---

*归档编号: {{number}}*  
*自动生成: {{timestamp}}*
```

### 5.2 渲染数据

```typescript
interface AuditReportData {
  number: string;
  title: string;
  version: string;
  date: string;
  auditor: string;
  summary: string;
  findings: Array<{
    id: string;
    title: string;
    severity: 'P0' | 'P1' | 'P2';
    status: 'open' | 'closed';
    evidence: string;
    description: string;
  }>;
  debts: Array<{
    id: string;
    description: string;
    priority: 'P0' | 'P1' | 'P2';
  }>;
  timestamp: string;
}
```

---

## 6. 触发机制

### 6.1 npm script

```json
{
  "scripts": {
    "audit:archive": "ts-node tools/audit-archive/index.ts",
    "audit:archive:dry": "ts-node tools/audit-archive/index.ts --dry-run"
  }
}
```

### 6.2 CI/CD 集成

```yaml
# .github/workflows/audit-archive.yml
on:
  workflow_dispatch:
  schedule:
    - cron: '0 0 * * 0'  # 每周日自动归档

jobs:
  archive:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run audit:archive
      - run: git add docs/audit\ report/
      - run: git commit -m "chore: auto-archive audit report $(date +%Y%m%d)"
      - run: git push
```

---

## 7. 自测点

### DOC-001: 编号连续性

```bash
# 生成 3 个报告，检查编号连续
npm run audit:archive -- --input test-audit-1.json
npm run audit:archive -- --input test-audit-2.json
npm run audit:archive -- --input test-audit-3.json

# 验证
ls docs/audit\ report/*.md
# 预期: 01-xxx.md, 02-xxx.md, 03-xxx.md
```

**通过标准**: 编号 01, 02, 03 连续无跳跃

### DOC-002: 并发写入安全

```bash
# 并发执行归档
npm run audit:archive -- --input test-1.json &
npm run audit:archive -- --input test-2.json &
wait

# 验证
ls docs/audit\ report/*.md | wc -l
# 预期: 2 个文件，无损坏
```

**通过标准**: 无文件损坏，编号不重复

---

## 8. 债务清偿声明

**DEBT-DOC-001【已清偿 v1.1】**

- ✅ 自动归档协议设计完成
- ✅ 01-99 编号分配算法设计
- ✅ Mustache 模板设计
- ✅ 索引更新机制设计
- ✅ CI/CD 集成方案设计
- ⏭️ 待 B-07 实现代码

---

*Design by: Orchestrator客服小祥*  
*审核状态: 待 B-07 工程师实现验证*
