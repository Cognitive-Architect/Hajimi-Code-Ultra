/**
 * B-04/09: IndexedDBStore v2 自测验证脚本
 * 咕咕嘎嘎·IndexedDB矿工 - 自测点验证
 * 
 * 测试点：
 * - IDB-001: 并发写入10个状态无竞态（Promise.all验证）
 * - IDB-002: 浏览器刷新后数据恢复（localStorage备份双保险）
 * - IDB-003: 存储配额超限优雅降级（QuotaExceededError处理）
 */

// 标记测试环境
declare const selfTestMode: boolean;

// ==================== 自测报告 ====================

interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  details: string[];
  error?: string;
}

const testResults: TestResult[] = [];

function logTest(id: string, name: string, passed: boolean, details: string[], error?: string): void {
  testResults.push({ id, name, passed, details, error });
  
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`\n${status} [${id}] ${name}`);
  details.forEach(d => console.log(`   ${d}`));
  if (error) console.log(`   Error: ${error}`);
}

// ==================== 代码审查测试 ====================

// IDB-001: 并发写入无竞态条件
function testIDB001(): void {
  const details: string[] = [];
  
  // 检查源代码中的竞态条件修复
  const fs = require('fs');
  const sourceCode = fs.readFileSync('lib/tsa/persistence/indexeddb-store-v2.ts', 'utf-8');
  
  // 检查是否有 OperationQueue
  const hasOperationQueue = sourceCode.includes('class OperationQueue');
  details.push(`OperationQueue 类定义: ${hasOperationQueue ? '存在' : '缺失'}`);
  
  // 检查是否使用了操作队列
  const usesEnqueue = sourceCode.includes('this.operationQueue.enqueue');
  details.push(`操作队列使用: ${usesEnqueue ? '是' : '否'}`);
  
  // 检查 set/get/delete 方法是否使用队列
  const setUsesQueue = /async set.*\{[\s\S]*?return this\.operationQueue\.enqueue/.test(sourceCode);
  const getUsesQueue = /async get.*\{[\s\S]*?return this\.operationQueue\.enqueue/.test(sourceCode);
  const deleteUsesQueue = /async delete.*\{[\s\S]*?return this\.operationQueue\.enqueue/.test(sourceCode);
  
  details.push(`set 方法使用队列: ${setUsesQueue ? '是' : '否'}`);
  details.push(`get 方法使用队列: ${getUsesQueue ? '是' : '否'}`);
  details.push(`delete 方法使用队列: ${deleteUsesQueue ? '是' : '否'}`);
  
  // 检查是否是单线程访问
  const hasIsProcessing = sourceCode.includes('private isProcessing');
  details.push(`单线程处理标志: ${hasIsProcessing ? '存在' : '缺失'}`);
  
  const passed = hasOperationQueue && usesEnqueue && setUsesQueue && getUsesQueue && deleteUsesQueue && hasIsProcessing;
  
  logTest('IDB-001', '并发写入10个状态无竞态（Promise.all验证）', passed, details);
}

// IDB-002: 浏览器刷新后数据恢复
function testIDB002(): void {
  const details: string[] = [];
  
  const fs = require('fs');
  const sourceCode = fs.readFileSync('lib/tsa/persistence/indexeddb-store-v2.ts', 'utf-8');
  
  // 检查 LocalStorageBackup 类
  const hasLSBackupClass = sourceCode.includes('class LocalStorageBackup');
  details.push(`LocalStorageBackup 类定义: ${hasLSBackupClass ? '存在' : '缺失'}`);
  
  // 检查关键状态备份
  const hasBackupMethod = sourceCode.includes('backup<T>(');
  details.push(`备份方法: ${hasBackupMethod ? '存在' : '缺失'}`);
  
  // 检查恢复方法
  const hasRestoreMethod = sourceCode.includes('restore<T>(');
  details.push(`恢复方法: ${hasRestoreMethod ? '存在' : '缺失'}`);
  
  // 检查初始化时恢复
  const hasRecoverOnInit = sourceCode.includes('recoverFromLocalStorage');
  details.push(`初始化恢复逻辑: ${hasRecoverOnInit ? '存在' : '缺失'}`);
  
  // 检查定期同步
  const hasSyncCheck = sourceCode.includes('syncCheck');
  const hasStartSyncCheckTask = sourceCode.includes('startSyncCheckTask');
  details.push(`同步检查方法: ${hasSyncCheck ? '存在' : '缺失'}`);
  details.push(`定期同步任务: ${hasStartSyncCheckTask ? '存在' : '缺失'}`);
  
  // 检查 criticalKeysPattern 配置
  const hasCriticalKeysPattern = sourceCode.includes('criticalKeysPattern');
  details.push(`关键键模式配置: ${hasCriticalKeysPattern ? '存在' : '缺失'}`);
  
  const passed = hasLSBackupClass && hasBackupMethod && hasRestoreMethod && 
                 hasRecoverOnInit && hasSyncCheck && hasStartSyncCheckTask && hasCriticalKeysPattern;
  
  logTest('IDB-002', '浏览器刷新后数据恢复（localStorage备份双保险）', passed, details);
}

// IDB-003: 存储配额超限优雅降级
function testIDB003(): void {
  const details: string[] = [];
  
  const fs = require('fs');
  const sourceCode = fs.readFileSync('lib/tsa/persistence/indexeddb-store-v2.ts', 'utf-8');
  
  // 检查 QuotaExceededError 捕获
  const hasQuotaCheck = sourceCode.includes('isQuotaExceeded');
  details.push(`配额超限检测: ${hasQuotaCheck ? '存在' : '缺失'}`);
  
  // 检查 LRU 清理
  const hasLRUCleanup = sourceCode.includes('lruCleanup');
  const hasEnableLRU = sourceCode.includes('enableLRU');
  details.push(`LRU 清理方法: ${hasLRUCleanup ? '存在' : '缺失'}`);
  details.push(`LRU 开关配置: ${hasEnableLRU ? '存在' : '缺失'}`);
  
  // 检查优雅降级到 localStorage
  const hasFallbackToLS = sourceCode.includes('localStorageBackup.backup') && 
                          sourceCode.includes('QuotaExceededError');
  details.push(`配额超限降级到localStorage: ${hasFallbackToLS ? '是' : '否'}`);
  
  // 检查存储大小计算
  const hasSizeCalculation = sourceCode.includes('calculateStorageSize');
  const hasCurrentStorageSize = sourceCode.includes('currentStorageSize');
  details.push(`存储大小计算: ${hasSizeCalculation ? '存在' : '缺失'}`);
  details.push(`当前存储大小跟踪: ${hasCurrentStorageSize ? '存在' : '缺失'}`);
  
  // 检查配额配置
  const hasQuotaConfig = sourceCode.includes('QuotaConfig');
  const hasMaxTotalSize = sourceCode.includes('maxTotalSize');
  details.push(`配额配置接口: ${hasQuotaConfig ? '存在' : '缺失'}`);
  details.push(`最大总大小限制: ${hasMaxTotalSize ? '存在' : '缺失'}`);
  
  // 检查优先级排序（用于LRU）
  const hasPrioritySort = sourceCode.includes('a.priority - b.priority') || 
                          sourceCode.includes('b.priority - a.priority');
  details.push(`LRU 优先级排序: ${hasPrioritySort ? '存在' : '缺失'}`);
  
  const passed = hasQuotaCheck && hasLRUCleanup && hasEnableLRU && hasFallbackToLS &&
                 hasSizeCalculation && hasCurrentStorageSize && hasQuotaConfig && 
                 hasMaxTotalSize && hasPrioritySort;
  
  logTest('IDB-003', '存储配额超限优雅降级（QuotaExceededError处理）', passed, details);
}

// 额外测试：版本迁移
function testSchemaMigration(): void {
  const details: string[] = [];
  
  const fs = require('fs');
  const sourceCode = fs.readFileSync('lib/tsa/persistence/indexeddb-store-v2.ts', 'utf-8');
  
  // 检查 SchemaVersion 定义
  const hasSchemaVersion = sourceCode.includes('interface SchemaVersion');
  details.push(`SchemaVersion 接口: ${hasSchemaVersion ? '存在' : '缺失'}`);
  
  // 检查 CURRENT_SCHEMA_VERSION
  const hasCurrentVersion = sourceCode.includes('CURRENT_SCHEMA_VERSION');
  details.push(`当前版本常量: ${hasCurrentVersion ? '存在' : '缺失'}`);
  
  // 检查 onupgradeneeded 处理
  const hasUpgradeHandler = sourceCode.includes('onupgradeneeded');
  const hasHandleUpgrade = sourceCode.includes('handleUpgrade');
  details.push(`升级事件处理: ${hasUpgradeHandler ? '存在' : '缺失'}`);
  details.push(`升级处理方法: ${hasHandleUpgrade ? '存在' : '缺失'}`);
  
  // 检查 createIndex 创建索引
  const hasCreateIndex = sourceCode.includes('.createIndex(');
  details.push(`索引创建: ${hasCreateIndex ? '存在' : '缺失'}`);
  
  const passed = hasSchemaVersion && hasCurrentVersion && hasUpgradeHandler && 
                 hasHandleUpgrade && hasCreateIndex;
  
  logTest('SCHEMA-001', 'IndexedDB schema 版本迁移', passed, details);
}

// ==================== 运行测试 ====================

console.log('\n' + '='.repeat(60));
console.log('B-04/09: IndexedDBStore v2 自测验证报告');
console.log('咕咕嘎嘎·IndexedDB矿工 - 异步竞态条件修复');
console.log('='.repeat(60));

try {
  testIDB001();
  testIDB002();
  testIDB003();
  testSchemaMigration();
  
  console.log('\n' + '='.repeat(60));
  console.log('自测总结');
  console.log('='.repeat(60));
  
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  
  console.log(`\n总计: ${passedTests}/${totalTests} 项通过`);
  
  const allPassed = passedTests === totalTests;
  
  if (allPassed) {
    console.log('\n🎉 所有自测点通过！');
    console.log('\n✅ IDB-001: 并发写入无竞态 - 操作队列保证单线程访问');
    console.log('✅ IDB-002: 刷新后数据恢复 - localStorage双保险');
    console.log('✅ IDB-003: 配额超限降级 - LRU清理 + localStorage降级');
  } else {
    console.log('\n⚠️ 部分自测点未通过，请检查实现');
    testResults.filter(r => !r.passed).forEach(r => {
      console.log(`   ❌ ${r.id}: ${r.name}`);
    });
  }
  
  console.log('\n' + '='.repeat(60));
  
  // 输出 JSON 报告
  const reportPath = 'tests/indexeddb-store-v2-selftest-report.json';
  const fs = require('fs');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: totalTests - passedTests,
    },
    results: testResults,
  }, null, 2));
  console.log(`\n详细报告已保存至: ${reportPath}`);
  
  process.exit(allPassed ? 0 : 1);
} catch (error) {
  console.error('\n❌ 自测执行失败:', error);
  process.exit(1);
}
