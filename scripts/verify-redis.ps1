# B-02/06 Redis连接验证脚本 (Windows PowerShell)
# 使用说明: .\scripts\verify-redis.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Redis连接验证 - B-02/06 FIX" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 设置Redis URL
$env:REDIS_URL = "redis://127.0.0.1:6379"
Write-Host "[Config] REDIS_URL = $env:REDIS_URL" -ForegroundColor Yellow
Write-Host ""

# 测试1: 直接使用ioredis测试连接
Write-Host "[Test 1] 直接ioredis连接测试..." -ForegroundColor Green
$testScript = @"
const Redis = require('ioredis');
console.log('[Test] Creating Redis client...');
const r = new Redis(process.env.REDIS_URL, {
  connectTimeout: 5000,
  enableOfflineQueue: false,
  lazyConnect: false,
  retryStrategy: (times) => {
    if (times > 3) return null;
    return Math.min(times * 1000, 5000);
  }
});

r.on('connect', () => {
  console.log('[Test] ✅ Connected event received');
});

r.on('ready', () => {
  console.log('[Test] ✅ Ready event received');
});

r.on('error', (err) => {
  console.log('[Test] ❌ Error:', err.message);
});

// 等待一下让连接建立
setTimeout(() => {
  r.ping()
    .then(result => {
      console.log('[Test] ✅ PING result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.log('[Test] ❌ PING failed:', err.message);
      process.exit(1);
    });
}, 1000);
"@

$testScript | npx tsx -

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  验证完成" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
