#!/bin/bash
# 二次审计严苛测试 - 返工真实性验证
set -e

echo "=== HAJIMI v1.1 FIX-WAVE-003 二次审计 ==="

# 1. 1GB 真实性测试（非稀疏文件）
echo "[TEST] 1GB 物理文件 diff..."
node -e "
const fs = require('fs');
const buf = Buffer.alloc(1073741824, 0);
fs.writeFileSync('f:\\Hajimi Code Ultra\\real-1gb.bin', buf);
fs.writeFileSync('f:\\Hajimi Code Ultra\\real-1gb-copy.bin', buf);
"
node "f:\Hajimi Code Ultra\apps\hajimi-cli\dist\index.js" diff "f:\Hajimi Code Ultra\real-1gb.bin" "f:\Hajimi Code Ultra\real-1gb-copy.bin" -o "f:\Hajimi Code Ultra\test.hdiff"
echo "PASS: 1GB 文件 diff 成功"

# 2. 内存硬限制 enforce 测试（恶意条件）
echo "[TEST] 内存硬限制 enforce..."
node -e "
const { diffStream } = require('./apps/hajimi-cli/dist/commands/diff-stream');
// 故意设置 50MB 限制处理 100MB 文件，应报错而非突破
diffStream('f:\\Hajimi Code Ultra\\real-1gb.bin', 'f:\\Hajimi Code Ultra\\real-1gb-copy.bin', {
  output: 'f:\\Hajimi Code Ultra\\out.hdiff',
  maxMemory: 50,  // 恶意低限制
  chunkSize: 64
}).then(() => console.log('FAIL: 应报错却成功'))
.catch(e => console.log('PASS: 正确报错:', e.message));
"

# 3. 循环检测真实性（真检测 vs 超时 kill）
echo "[TEST] 循环 symlink 真检测..."
mkdir -p "f:\Hajimi Code Ultra\circ-test"
New-Item -ItemType Junction -Path "f:\Hajimi Code Ultra\circ-test\loop" -Target "f:\Hajimi Code Ultra\circ-test"
timeout 3 node "f:\Hajimi Code Ultra\apps\hajimi-cli\dist\index.js" diff-dir "f:\Hajimi Code Ultra\circ-test" "f:\Hajimi Code Ultra\circ-test" -o "f:\Hajimi Code Ultra\circ-out.json" 2>&1 | Select-String -Pattern "CIRCULAR|Error" && echo "PASS: 真检测" || echo "FAIL: 可能超时伪装"

# 4. 异常中断残留检查
echo "[TEST] 临时文件清理..."
Get-ChildItem "f:\Hajimi Code Ultra\*.tmp" -ErrorAction SilentlyContinue && echo "FAIL: 残留临时文件" || echo "PASS: 无残留"

# 5. 回归测试真实性（新命令覆盖）
echo "[TEST] 回归测试覆盖..."
cd apps/hajimi-cli && npm test 2>&1 | Select-String -Pattern "diff-dir|diff-stream" | wc -l | xargs -I {} test {} -gt 0 && echo "PASS: 新命令在测试中" || echo "FAIL: 回归测试未覆盖新命令"

echo "=== 二次审计完成 ==="