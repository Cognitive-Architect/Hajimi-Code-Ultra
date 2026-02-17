// 🚀 饱和攻击总控 - 七路并发执行
// HAJIMI-OR-BYPASS-ALL-001

const { spawn } = require('child_process');
const path = require('path');

const tests = [
  { id: 'B-01', file: 'bypass-ip-direct.js', name: 'IP直连硬钢' },
  { id: 'B-02', file: 'bypass-http1.js', name: 'HTTP/1.1降级' },
  { id: 'B-03', file: 'bypass-proxy.js', name: '代理穿透' },
  { id: 'B-04', file: 'bypass-fetch.js', name: 'Node-fetch裸调' },
  { id: 'B-05', file: 'bypass-ipv4.js', name: 'IPv4强制' },
  { id: 'B-06', file: 'bypass-curl.js', name: 'Curl逃逸' },
  { id: 'B-07', file: 'bypass-http.js', name: 'HTTP降级' },
];

console.log('╔══════════════════════════════════════════════════════════════╗');
console.log('║  🚀 HAJIMI-OR-BYPASS-ALL-001 饱和攻击总控                    ║');
console.log('║  目标：不择手段打通 OpenRouter，必须在 Logs 留下记录        ║');
console.log('╚══════════════════════════════════════════════════════════════╝');
console.log(`启动时间: ${new Date().toISOString()}`);
console.log('');

// 并发执行所有测试
const promises = tests.map(test => {
  return new Promise((resolve) => {
    const testPath = path.join(__dirname, test.file);
    
    console.log(`[总控] 启动 ${test.id}: ${test.name}`);
    
    const proc = spawn('node', [testPath], {
      stdio: 'inherit',
      shell: true
    });
    
    proc.on('close', (code) => {
      console.log(`[总控] ${test.id} 完成，退出码: ${code}`);
      resolve({ id: test.id, code });
    });
    
    proc.on('error', (err) => {
      console.log(`[总控] ${test.id} 错误: ${err.message}`);
      resolve({ id: test.id, error: err.message });
    });
  });
});

Promise.all(promises).then((results) => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🏁 所有攻击波次执行完毕                                     ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('收卷标准：OpenRouter Dashboard > Logs 出现任意一条记录');
  console.log('密钥ID: 3f317a...9ce6e (末尾6位)');
  console.log('');
  console.log('结果汇总:');
  results.forEach(r => {
    const status = r.code === 0 ? '✅' : '❓';
    console.log(`  ${status} ${r.id}: 退出码 ${r.code}`);
  });
});
