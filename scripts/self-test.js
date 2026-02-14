#!/usr/bin/env node

/**
 * B-09 测试体系 - 全量自测脚本
 * 
 * 执行所有测试并生成JSON报告
 * 
 * 测试覆盖:
 * - STM-001~008: 状态机
 * - GOV-001~006: 治理引擎
 * - A2A-001~004: A2A消息
 * - API-001~005: API权限
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 测试套件配置
const testSuites = [
  {
    id: 'STM',
    name: '状态机测试',
    pattern: 'tests/unit/state-machine.test.ts',
    tests: [
      { id: 'STM-001', name: '获取当前状态' },
      { id: 'STM-002', name: '合法流转IDLE→DESIGN' },
      { id: 'STM-003', name: '合法流转DESIGN→CODE' },
      { id: 'STM-004', name: '非法流转被拒绝' },
      { id: 'STM-005', name: '状态历史记录完整' },
      { id: 'STM-006', name: '订阅通知机制' },
      { id: 'STM-007', name: '权限验证' },
      { id: 'STM-008', name: '完整流转链路' },
    ],
  },
  {
    id: 'GOV',
    name: '治理引擎测试',
    pattern: 'tests/unit/governance.test.ts',
    tests: [
      { id: 'GOV-001', name: 'PM创建提案' },
      { id: 'GOV-002', name: '非PM创建被拒' },
      { id: 'GOV-003', name: '列表倒序排列' },
      { id: 'GOV-004', name: '30分钟过期' },
      { id: 'GOV-005', name: '投票提交统计' },
      { id: 'GOV-006', name: '60%阈值自动执行' },
    ],
  },
  {
    id: 'A2A',
    name: 'A2A消息测试',
    pattern: 'tests/unit/a2a.test.ts',
    tests: [
      { id: 'A2A-001', name: '发送消息' },
      { id: 'A2A-002', name: '消息历史查询' },
      { id: 'A2A-003', name: 'SecondMe适配' },
      { id: 'A2A-004', name: '流式消息发送' },
    ],
  },
  {
    id: 'API',
    name: 'API权限测试',
    pattern: 'tests/unit/auth.test.ts',
    tests: [
      { id: 'API-001', name: '统一错误格式' },
      { id: 'API-002', name: 'Token认证' },
      { id: 'API-003', name: '角色权限拦截' },
      { id: 'API-004', name: 'Zod请求验证' },
      { id: 'API-005', name: '错误代码分类' },
    ],
  },
  {
    id: 'INT',
    name: '集成测试',
    pattern: 'tests/integration/api-flow.test.ts',
    tests: [
      { id: 'INT-001', name: '端到端工作流' },
      { id: 'INT-002', name: '状态机与治理集成' },
      { id: 'INT-003', name: 'A2A与治理集成' },
      { id: 'INT-004', name: '认证与授权集成' },
      { id: 'INT-005', name: '错误处理集成' },
    ],
  },
];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function colorize(text, color) {
  return `${colors[color]}${text}${colors.reset}`;
}

// 运行 Jest 测试并返回结果
function runJest(pattern) {
  return new Promise((resolve) => {
    const isWindows = os.platform() === 'win32';
    const cmd = isWindows ? 'npx.cmd' : 'npx';
    const args = ['jest', pattern, '--silent'];
    
    const child = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: 'pipe',
      shell: isWindows,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
      });
    });

    child.on('error', (error) => {
      resolve({
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: error.message,
      });
    });
  });
}

// 运行单个测试套件
async function runTestSuite(suite) {
  console.log(colorize(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'cyan'));
  console.log(colorize(`运行: ${suite.name}`, 'bright'));
  console.log(colorize(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'cyan'));

  const startTime = Date.now();
  let result = {
    id: suite.id,
    name: suite.name,
    status: 'unknown',
    tests: [],
    duration: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    output: '',
  };

  const jestResult = await runJest(suite.pattern);
  result.duration = Date.now() - startTime;
  result.output = jestResult.stdout + jestResult.stderr;

  // 解析 Jest 输出
  const passMatch = result.output.match(/PASS/);
  const failMatch = result.output.match(/FAIL/);
  const testsMatch = result.output.match(/Tests:\s+(\d+)\s+passed(?:,\s+(\d+)\s+failed)?/);
  
  if (testsMatch) {
    result.passed = parseInt(testsMatch[1]) || 0;
    result.failed = parseInt(testsMatch[2]) || 0;
  } else {
    // 尝试从测试文件数量估算
    const testCount = suite.tests.length;
    if (jestResult.success) {
      result.passed = testCount;
      result.failed = 0;
    } else {
      result.passed = 0;
      result.failed = testCount;
    }
  }

  result.status = jestResult.success ? 'passed' : 'failed';

  // 填充测试列表
  suite.tests.forEach((test) => {
    // 从输出中查找测试状态
    const testPassed = result.output.includes(`✓ ${test.id}`) || 
                       result.output.includes(`✓ ${test.name}`) ||
                       (result.status === 'passed');
    const testFailed = result.output.includes(`✕ ${test.id}`) || 
                       result.output.includes(`✕ ${test.name}`);
    
    const status = testFailed ? 'failed' : (testPassed ? 'passed' : 'unknown');
    
    result.tests.push({
      id: test.id,
      name: test.name,
      status: status,
      duration: 0,
      failureMessages: testFailed ? ['测试失败'] : [],
    });
  });

  // 输出结果
  const statusColor = result.status === 'passed' ? 'green' : 
                      result.status === 'failed' ? 'red' : 'yellow';
  console.log(colorize(`状态: ${result.status.toUpperCase()}`, statusColor));
  console.log(colorize(`通过: ${result.passed}, 失败: ${result.failed}, 跳过: ${result.skipped}`, 'bright'));
  console.log(colorize(`耗时: ${result.duration}ms`, 'blue'));

  return result;
}

// 生成最终报告
function generateReport(results) {
  const totalTests = results.reduce((sum, r) => sum + r.tests.length, 0);
  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  const report = {
    summary: {
      total: totalTests,
      passed: totalPassed,
      failed: totalFailed,
      skipped: totalSkipped,
      passRate: totalTests > 0 ? ((totalPassed / totalTests) * 100).toFixed(2) + '%' : '0%',
      duration: totalDuration,
      timestamp: new Date().toISOString(),
    },
    suites: results.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      passed: r.passed,
      failed: r.failed,
      skipped: r.skipped,
      duration: r.duration,
      tests: r.tests,
    })),
  };

  return report;
}

// 打印最终报告
function printFinalReport(report) {
  console.log(colorize('\n' + '═'.repeat(70), 'cyan'));
  console.log(colorize('                    B-09 测试体系 - 全量自测报告', 'bright'));
  console.log(colorize('═'.repeat(70), 'cyan'));

  console.log(colorize('\n📊 汇总:', 'bright'));
  console.log(`  总计: ${report.summary.total}`);
  console.log(colorize(`  通过: ${report.summary.passed} ✓`, 'green'));
  console.log(colorize(`  失败: ${report.summary.failed} ✗`, report.summary.failed > 0 ? 'red' : 'green'));
  console.log(colorize(`  跳过: ${report.summary.skipped} ○`, 'yellow'));
  console.log(`  通过率: ${report.summary.passRate}`);
  console.log(`  总耗时: ${report.summary.duration}ms`);
  console.log(`  时间戳: ${report.summary.timestamp}`);

  console.log(colorize('\n📋 详细结果:', 'bright'));
  report.suites.forEach((suite) => {
    const suiteColor = suite.status === 'passed' ? 'green' : 
                       suite.status === 'failed' ? 'red' : 'yellow';
    console.log(colorize(`\n  [${suite.id}] ${suite.name} - ${suite.status.toUpperCase()}`, suiteColor));
    
    suite.tests.forEach((test) => {
      const testColor = test.status === 'passed' ? 'green' : 
                        test.status === 'failed' ? 'red' : 'yellow';
      const icon = test.status === 'passed' ? '✓' : 
                   test.status === 'failed' ? '✗' : '○';
      console.log(colorize(`    ${icon} ${test.id}: ${test.name}`, testColor));
      
      if (test.failureMessages && test.failureMessages.length > 0) {
        test.failureMessages.forEach((msg) => {
          console.log(colorize(`       → ${msg.substring(0, 100)}${msg.length > 100 ? '...' : ''}`, 'red'));
        });
      }
    });
  });

  const overallStatus = report.summary.failed === 0 ? 'PASSED' : 'FAILED';
  const overallColor = report.summary.failed === 0 ? 'green' : 'red';
  
  console.log(colorize('\n' + '═'.repeat(70), overallColor));
  console.log(colorize(`                    整体结果: ${overallStatus}`, overallColor));
  console.log(colorize('═'.repeat(70) + '\n', overallColor));

  // 输出 JSON 报告路径
  const reportPath = path.join(process.cwd(), 'test-report.json');
  console.log(colorize(`📄 JSON报告已保存至: ${reportPath}`, 'blue'));
}

// 主函数
async function main() {
  console.log(colorize('\n🚀 启动 B-09 测试体系自测...', 'bright'));
  console.log(colorize(`项目路径: ${process.cwd()}`, 'blue'));
  console.log(colorize(`操作系统: ${os.platform()}`, 'blue'));

  const results = [];

  // 依次运行每个测试套件
  for (const suite of testSuites) {
    const result = await runTestSuite(suite);
    results.push(result);
  }

  // 生成报告
  const report = generateReport(results);

  // 保存 JSON 报告
  fs.writeFileSync('test-report.json', JSON.stringify(report, null, 2));

  // 打印报告
  printFinalReport(report);

  // 根据结果设置退出码
  process.exit(report.summary.failed > 0 ? 1 : 0);
}

// 运行主函数
main().catch((error) => {
  console.error(colorize(`\n❌ 自测脚本执行失败: ${error.message}`, 'red'));
  process.exit(1);
});
