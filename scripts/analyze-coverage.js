#!/usr/bin/env node
/**
 * 覆盖率缺口分析脚本
 * 分析 coverage/coverage-summary.json 和 coverage/coverage-final.json
 * 生成 COVERAGE-GAP-REPORT.md 和 coverage-gap.json
 */

const fs = require('fs');
const path = require('path');

// 读取覆盖率数据
const summaryPath = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const finalPath = path.join(__dirname, '..', 'coverage', 'coverage-final.json');

const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
const final = JSON.parse(fs.readFileSync(finalPath, 'utf-8'));

// 排除测试文件和配置文件
const EXCLUDE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /config\//,
  /__tests__\//,
  /jest\./,
  /next\.config/,
  /tsconfig/
];

function shouldExclude(filePath) {
  return EXCLUDE_PATTERNS.some(pattern => pattern.test(filePath));
}

// 分析每个文件的覆盖情况
const gaps = [];
const totalStats = summary.total;

// 分类定义
const CORE_FILES = [
  'lib/tsa/index.ts',
  'lib/tsa/orchestrator-v2.ts',
  'lib/core/state/machine.ts',
  'lib/core/state/rules.ts',
  'lib/api/auth.ts',
  'lib/api/error-handler.ts'
];

const LIFECYCLE_FILES = [
  'lib/tsa/lifecycle/HookManager.ts',
  'lib/tsa/lifecycle/LRUManager.ts',
  'lib/tsa/lifecycle/LifecycleManager.ts',
  'lib/tsa/lifecycle/TTLManager.ts'
];

const RESILIENCE_FILES = [
  'lib/tsa/resilience/fallback.ts',
  'lib/tsa/resilience/repair.ts',
  'lib/tsa/resilience/index.ts'
];

const PERSISTENCE_FILES = [
  'lib/tsa/persistence/RedisStore.ts',
  'lib/tsa/persistence/TieredFallback.ts',
  'lib/tsa/persistence/IndexedDBStore.ts',
  'lib/tsa/persistence/redis-store-v2.ts',
  'lib/tsa/persistence/indexeddb-store-v2.ts'
];

function getCategory(filePath) {
  const normalized = filePath.replace(/^.*Hajimi Code Ultra\\/, '').replace(/\\/g, '/');
  if (CORE_FILES.some(f => normalized.includes(f))) return '核心文件 (Core)';
  if (LIFECYCLE_FILES.some(f => normalized.includes(f))) return '生命周期 (Lifecycle)';
  if (RESILIENCE_FILES.some(f => normalized.includes(f))) return '弹性恢复 (Resilience)';
  if (PERSISTENCE_FILES.some(f => normalized.includes(f))) return '持久化 (Persistence)';
  if (normalized.includes('app/hooks')) return 'React Hooks';
  if (normalized.includes('patterns')) return '模式 (Patterns)';
  return '其他 (Other)';
}

function getPriority(filePath, coverage) {
  const category = getCategory(filePath);
  if (category === '核心文件 (Core)') return 'P0-最高';
  if (category === '生命周期 (Lifecycle)' || category === '弹性恢复 (Resilience)') return 'P1-高';
  if (category === '持久化 (Persistence)') return 'P2-中';
  return 'P3-低';
}

// 分析每个文件的详细覆盖情况
for (const [filePath, stats] of Object.entries(summary)) {
  if (filePath === 'total') continue;
  if (shouldExclude(filePath)) continue;
  
  const linePct = stats.lines.pct;
  const branchPct = stats.branches.pct;
  const funcPct = stats.functions.pct;
  
  // 只处理未完全覆盖的文件
  if (linePct < 100 || branchPct < 100 || funcPct < 100) {
    const normalizedPath = filePath.replace(/^.*Hajimi Code Ultra\\/, '').replace(/\\/g, '/');
    const finalData = final[filePath];
    
    // 提取未覆盖的行
    const uncoveredLines = [];
    const uncoveredBranches = [];
    const uncoveredFunctions = [];
    
    if (finalData) {
      // 分析语句覆盖
      if (finalData.statementMap && finalData.s) {
        for (const [stmtId, count] of Object.entries(finalData.s)) {
          if (count === 0) {
            const stmt = finalData.statementMap[stmtId];
            if (stmt) {
              for (let i = stmt.start.line; i <= stmt.end.line; i++) {
                if (!uncoveredLines.includes(i)) {
                  uncoveredLines.push(i);
                }
              }
            }
          }
        }
      }
      
      // 分析分支覆盖
      if (finalData.branchMap && finalData.b) {
        for (const [branchId, counts] of Object.entries(finalData.b)) {
          const branch = finalData.branchMap[branchId];
          if (branch && Array.isArray(counts)) {
            counts.forEach((count, idx) => {
              if (count === 0) {
                const loc = branch.locations?.[idx] || branch.loc;
                if (loc) {
                  const branchDesc = `${branch.type || 'branch'} at line ${loc.start?.line || '?'}`;
                  uncoveredBranches.push(branchDesc);
                }
              }
            });
          }
        }
      }
      
      // 分析函数覆盖
      if (finalData.fnMap && finalData.f) {
        for (const [fnId, count] of Object.entries(finalData.f)) {
          if (count === 0) {
            const fn = finalData.fnMap[fnId];
            if (fn && fn.name) {
              uncoveredFunctions.push(`${fn.name}() at line ${fn.decl?.start?.line || '?'}`);
            }
          }
        }
      }
    }
    
    uncoveredLines.sort((a, b) => a - b);
    
    gaps.push({
      file: normalizedPath,
      lineCoverage: linePct,
      branchCoverage: branchPct,
      functionCoverage: funcPct,
      category: getCategory(filePath),
      priority: getPriority(filePath, linePct),
      totalLines: stats.lines.total,
      coveredLines: stats.lines.covered,
      uncoveredLines: uncoveredLines,
      uncoveredBranches: [...new Set(uncoveredBranches)].slice(0, 10), // 限制数量
      uncoveredFunctions: [...new Set(uncoveredFunctions)].slice(0, 10)
    });
  }
}

// 按优先级排序
gaps.sort((a, b) => {
  const priorityOrder = { 'P0-最高': 0, 'P1-高': 1, 'P2-中': 2, 'P3-低': 3 };
  return priorityOrder[a.priority] - priorityOrder[b.priority];
});

// 生成机器可读JSON
coverageGapJson = {
  generatedAt: new Date().toISOString(),
  summary: {
    totalFiles: gaps.length,
    totalLines: totalStats.lines.total,
    totalCovered: totalStats.lines.covered,
    overallCoverage: totalStats.lines.pct
  },
  gaps: gaps.map(g => ({
    file: g.file,
    lineCoverage: g.lineCoverage,
    branchCoverage: g.branchCoverage,
    functionCoverage: g.functionCoverage,
    priority: g.priority,
    category: g.category,
    uncoveredLines: g.uncoveredLines,
    uncoveredBranches: g.uncoveredBranches,
    uncoveredFunctions: g.uncoveredFunctions
  }))
};

fs.writeFileSync(
  path.join(__dirname, 'coverage-gap.json'),
  JSON.stringify(coverageGapJson, null, 2)
);

console.log(`✅ 生成 scripts/coverage-gap.json，共 ${gaps.length} 个文件`);

// 生成Markdown报告
let markdown = `# 覆盖率缺口分析报告

> 生成时间: ${new Date().toLocaleString('zh-CN')}

## 📊 总体概览

| 指标 | 数值 |
|------|------|
| 总体行覆盖率 | ${totalStats.lines.pct}% |
| 总体分支覆盖率 | ${totalStats.branches.pct}% |
| 总体函数覆盖率 | ${totalStats.functions.pct}% |
| 未完全覆盖文件数 | ${gaps.length} |

## 🎯 优先级分类

`;

// 按分类分组
const byCategory = {};
gaps.forEach(g => {
  if (!byCategory[g.priority]) byCategory[g.priority] = [];
  byCategory[g.priority].push(g);
});

for (const [priority, files] of Object.entries(byCategory)) {
  markdown += `### ${priority} (${files.length} 文件)\n\n`;
  
  const bySubCategory = {};
  files.forEach(f => {
    if (!bySubCategory[f.category]) bySubCategory[f.category] = [];
    bySubCategory[f.category].push(f);
  });
  
  for (const [cat, catFiles] of Object.entries(bySubCategory)) {
    markdown += `#### ${cat}\n\n`;
    markdown += `| 文件 | 行覆盖 | 分支覆盖 | 函数覆盖 | 未覆盖行数 |\n`;
    markdown += `|------|--------|----------|----------|------------|\n`;
    
    catFiles.forEach(f => {
      const uncoveredCount = f.uncoveredLines.length;
      markdown += `| ${f.file} | ${f.lineCoverage}% | ${f.branchCoverage}% | ${f.functionCoverage}% | ${uncoveredCount} |\n`;
    });
    
    markdown += `\n`;
  }
}

// 详细缺口列表
markdown += `## 🔍 详细缺口列表\n\n`;

gaps.slice(0, 20).forEach((g, idx) => { // 只显示前20个最重要的
  markdown += `### ${idx + 1}. ${g.file}\n\n`;
  markdown += `- **分类**: ${g.category}\n`;
  markdown += `- **优先级**: ${g.priority}\n`;
  markdown += `- **行覆盖率**: ${g.lineCoverage}% (${g.coveredLines}/${g.totalLines})\n`;
  markdown += `- **分支覆盖率**: ${g.branchCoverage}%\n`;
  markdown += `- **函数覆盖率**: ${g.functionCoverage}%\n\n`;
  
  if (g.uncoveredLines.length > 0) {
    markdown += `**未覆盖行号**: ${g.uncoveredLines.slice(0, 30).join(', ')}${g.uncoveredLines.length > 30 ? ' ...' : ''}\n\n`;
  }
  
  if (g.uncoveredBranches.length > 0) {
    markdown += `**未覆盖分支**:\n`;
    g.uncoveredBranches.forEach(b => {
      markdown += `- ${b}\n`;
    });
    markdown += `\n`;
  }
  
  if (g.uncoveredFunctions.length > 0) {
    markdown += `**未调用函数**:\n`;
    g.uncoveredFunctions.forEach(f => {
      markdown += `- ${f}\n`;
    });
    markdown += `\n`;
  }
});

// 测试建议
markdown += `## 📝 测试建议\n\n`;
markdown += `### GAP-001: if/else 分支覆盖\n\n`;
markdown += gaps
  .filter(g => g.branchCoverage < 100)
  .slice(0, 5)
  .map(g => `- ${g.file} (分支覆盖率: ${g.branchCoverage}%)`)
  .join('\n') + '\n\n';

markdown += `### GAP-002: catch 块覆盖\n\n`;
markdown += `以下文件需要添加错误处理测试:\n`;
markdown += gaps
  .filter(g => g.file.includes('resilience') || g.file.includes('fallback') || g.file.includes('error'))
  .map(g => `- ${g.file}`)
  .join('\n') + '\n\n';

markdown += `### GAP-003: 未调用工具函数\n\n`;
markdown += gaps
  .filter(g => g.functionCoverage < 100)
  .slice(0, 5)
  .map(g => `- ${g.file} (函数覆盖率: ${g.functionCoverage}%)`)
  .join('\n') + '\n\n';

markdown += `---\n*报告由 黄瓜睦·覆盖率分析师 生成*\n`;

fs.writeFileSync(
  path.join(__dirname, '..', 'docs', 'COVERAGE-GAP-REPORT.md'),
  markdown
);

console.log(`✅ 生成 docs/COVERAGE-GAP-REPORT.md`);
console.log(`\n📊 统计摘要:`);
console.log(`   - 总文件数: ${gaps.length}`);
console.log(`   - P0-最高: ${gaps.filter(g => g.priority === 'P0-最高').length}`);
console.log(`   - P1-高: ${gaps.filter(g => g.priority === 'P1-高').length}`);
console.log(`   - P2-中: ${gaps.filter(g => g.priority === 'P2-中').length}`);
console.log(`   - P3-低: ${gaps.filter(g => g.priority === 'P3-低').length}`);
