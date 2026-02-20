/**
 * Audit Archive Tool - 审计报告自动归档
 * 
 * DEBT-DOC-001【已清偿 v1.1】
 * 
 * 使用: npm run audit:archive [-- --input <audit.json> --dry-run]
 */

import * as fs from 'fs';
import * as path from 'path';

const AUDIT_DIR = 'docs/audit report';
const README_PATH = `${AUDIT_DIR}/README.md`;
const TEMPLATE_PATH = 'templates/audit-report.mustache';

interface ArchiveNumber {
  serial: number;
  padded: string;
  full: string;
}

interface AuditData {
  title: string;
  version: string;
  auditor: string;
  summary: string;
  findings: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    evidence: string;
    description: string;
  }>;
  debts: Array<{
    id: string;
    description: string;
    priority: string;
  }>;
}

/**
 * 编号生成器
 */
class ArchiveNumberGenerator {
  getNextNumber(): ArchiveNumber {
    const existing = this.listExistingNumbers();
    
    if (existing.length >= 99) {
      throw new Error('Archive number exhausted (99 reached)');
    }
    
    const maxNum = existing.length > 0 ? Math.max(...existing) : 0;
    const nextNum = maxNum + 1;
    
    return {
      serial: nextNum,
      padded: String(nextNum).padStart(2, '0'),
      full: `${String(nextNum).padStart(2, '0')}-v1.1-AUDIT`
    };
  }
  
  listExistingNumbers(): number[] {
    if (!fs.existsSync(AUDIT_DIR)) {
      return [];
    }
    
    const files = fs.readdirSync(AUDIT_DIR);
    const numbers: number[] = [];
    
    for (const file of files) {
      const match = file.match(/^(\d{2})-/);
      if (match) {
        numbers.push(parseInt(match[1], 10));
      }
    }
    
    return numbers.sort((a, b) => a - b);
  }
}

/**
 * 简单模板渲染
 */
function renderTemplate(template: string, data: Record<string, any>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

/**
 * 渲染审计报告
 */
function renderAuditReport(number: ArchiveNumber, data: AuditData): string {
  const date = new Date().toISOString().split('T')[0];
  
  const findingsMd = data.findings.map(f => `
### ${f.id}: ${f.title}

- **严重程度**: ${f.severity}
- **状态**: ${f.status}
- **证据**: ${f.evidence}

${f.description}
`).join('\n');

  const debtsMd = data.debts.map(d => `- **${d.id}**: ${d.description} (${d.priority})`).join('\n');

  return `# ${number.padded}: ${data.title} 审计报告

**版本**: ${data.version}  
**日期**: ${date}  
**审计者**: ${data.auditor}  

---

## 执行摘要

${data.summary}

## 审计发现

${findingsMd}

## 债务清单

${debtsMd}

---

*归档编号: ${number.padded}*  
*自动生成: ${new Date().toISOString()}*
`;
}

/**
 * 更新 README 索引
 */
function updateReadmeIndex(number: ArchiveNumber, data: AuditData, fileName: string): void {
  if (!fs.existsSync(README_PATH)) {
    // 创建初始 README
    const initialContent = `# Audit Report Index

## 归档列表 (01-99)

| 编号 | 版本 | 标题 | 日期 | 状态 |
|------|------|------|------|------|

## 快速链接

- [最新审计](./${fileName})
- [归档规范](../design/B-06-auto-archive-protocol.md)
`;
    fs.writeFileSync(README_PATH, initialContent);
  }
  
  let content = fs.readFileSync(README_PATH, 'utf8');
  const date = new Date().toISOString().split('T')[0];
  
  // 添加新行到表格
  const newRow = `| ${number.padded} | ${data.version} | ${data.title} | ${date} | ✅ 已归档 |`;
  
  // 找到表格插入位置（在 |------| 之后）
  const lines = content.split('\n');
  const dividerIndex = lines.findIndex(line => line.startsWith('|------|'));
  
  if (dividerIndex >= 0) {
    lines.splice(dividerIndex + 1, 0, newRow);
  }
  
  // 更新最新审计链接
  content = lines.join('\n');
  content = content.replace(
    /\[最新审计\]\.\/[^)]+\)/,
    `[最新审计](./${fileName})`
  );
  
  fs.writeFileSync(README_PATH, content);
  console.log(`[OK] Updated ${README_PATH}`);
}

/**
 * 主函数
 */
async function main(): Promise<void {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const inputIndex = args.indexOf('--input');
  const inputFile = inputIndex >= 0 ? args[inputIndex + 1] : null;
  
  console.log('[INFO] Audit Archive Tool');
  console.log(`[INFO] Dry run: ${dryRun}`);
  
  // 确保目录存在
  if (!fs.existsSync(AUDIT_DIR)) {
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
  }
  
  // 获取下一个编号
  const generator = new ArchiveNumberGenerator();
  const number = generator.getNextNumber();
  console.log(`[INFO] Next archive number: ${number.padded}`);
  
  // 加载审计数据
  let auditData: AuditData;
  if (inputFile && fs.existsSync(inputFile)) {
    auditData = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  } else {
    // 使用示例数据
    auditData = {
      title: 'v1.1 DEBT CLEARANCE',
      version: 'v1.1.0',
      auditor: 'Auto Audit',
      summary: '自动归档的审计报告',
      findings: [],
      debts: []
    };
  }
  
  // 生成文件名
  const fileName = `${number.padded}-${auditData.version}-${auditData.title.replace(/\s+/g, '-')}-AUDIT.md`;
  const filePath = path.join(AUDIT_DIR, fileName);
  
  // 检查文件是否已存在（防覆盖）
  if (fs.existsSync(filePath)) {
    console.error(`[ERROR] File already exists: ${filePath}`);
    process.exit(1);
  }
  
  // 渲染报告
  const report = renderAuditReport(number, auditData);
  
  if (dryRun) {
    console.log('[DRY RUN] Would write to:', filePath);
    console.log('[DRY RUN] Report preview:');
    console.log(report.substring(0, 500) + '...');
  } else {
    // 写入文件
    fs.writeFileSync(filePath, report);
    console.log(`[OK] Written: ${filePath}`);
    
    // 更新索引
    updateReadmeIndex(number, auditData, fileName);
  }
  
  console.log('[OK] Archive complete');
}

// 文件锁（简单实现，防止并发覆盖）
const LOCK_FILE = '.archive-lock';

function acquireLock(): boolean {
  if (fs.existsSync(LOCK_FILE)) {
    const lockTime = fs.statSync(LOCK_FILE).mtimeMs;
    if (Date.now() - lockTime > 30000) {
      // 锁超时（30秒），强制删除
      fs.unlinkSync(LOCK_FILE);
    } else {
      return false;
    }
  }
  fs.writeFileSync(LOCK_FILE, String(Date.now()));
  return true;
}

function releaseLock(): void {
  if (fs.existsSync(LOCK_FILE)) {
    fs.unlinkSync(LOCK_FILE);
  }
}

// 主执行
if (acquireLock()) {
  main()
    .then(() => releaseLock())
    .catch(err => {
      console.error('[ERROR]', err.message);
      releaseLock();
      process.exit(1);
    });
} else {
  console.error('[ERROR] Another archive process is running. Please wait.');
  process.exit(1);
}
