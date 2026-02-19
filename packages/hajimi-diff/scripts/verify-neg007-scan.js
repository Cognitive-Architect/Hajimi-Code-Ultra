// DEBT-SCAN: 仅扫描自拷贝模式，未覆盖其他风险模式和安全问题，P2级别
'use strict';
const fs = require('fs');
const path = require('path');
function walk(dir, out) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const it of items) {
    const p = path.join(dir, it.name);
    if (it.isDirectory()) {
      if (it.name === 'node_modules' || it.name === '.git') continue;
      walk(p, out);
    } else if (it.isFile()) {
      if (/(\.(js|ts))$/.test(it.name)) out.push(p);
    }
  }
}
function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const files = [];
  walk(repoRoot, files);
  // 排除文档和扫描脚本自身
  const excludeFiles = [
    path.join(repoRoot, 'gpt审核报告.md'),
    __filename
  ];
  const filteredFiles = files.filter(f => !excludeFiles.includes(f));
  const bad = [];
  for (const f of filteredFiles) {
    const t = fs.readFileSync(f, 'utf8');
    if (t.includes('readFileSync(__filename') || t.includes('readFileSync (__filename')) {
      bad.push(f);
    }
  }
  if (bad.length) {
    throw new Error('FOUND_SELF_COPY_PATTERN:\n' + bad.join('\n'));
  }
  console.log('SCAN_OK');
}
if (require.main === module) main();