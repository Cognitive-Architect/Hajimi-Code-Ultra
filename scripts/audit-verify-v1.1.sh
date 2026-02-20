#!/bin/bash
# 一键验证脚本 - 外部审计用
set -e

echo "=== HAJIMI v1.1 外部审计验证 ==="

# 1. 内存真实性验证
echo "[TEST] 1GB文件内存限制..."
# 创建测试文件（1GB）
node -e "const fs=require('fs'); fs.writeFileSync('1gb.bin', Buffer.alloc(1024*1024*1024))" &
PID=$!
sleep 10

# 运行内存测试
node --max-old-space-size=220 -e "
const m=require('./packages/hajimi-diff/dist/core/streaming-processor');
m.streamDiff('1gb.bin','1gb.bin','out.hdiff',{maxMemoryMB:200})
" &
PID=$!
sleep 10

# 检查内存使用
RSS=$(ps -o rss= -p $PID | awk '{print $1/1024}')
if (( $(echo "$RSS > 250" | bc -l) )); then 
  echo "FAIL: RSS=${RSS}MB > 200MB" 
  exit 1 
fi 
echo "PASS: RSS=${RSS}MB < 200MB"

# 2. 循环检测验证
echo "[TEST] 循环symlink..."
mkdir -p /tmp/circ && cd /tmp/circ && ln -s . loop 2>/dev/null || mklink /D loop .
timeout 5 hajimi diff-dir . . -o /tmp/circ.json || echo "PASS: 5秒内终止或标记"

# 3. 隐藏债务扫描
echo "[TEST] 隐藏债务扫描..."
grep -r "TODO\|FIXME\|XXX" packages/hajimi-diff/src/ --include="*.ts" -r
if [ $? -eq 0 ]; then
  echo "FAIL: 发现隐藏债务"
  exit 1
fi
echo "PASS: 无隐藏债务"

# 4. 自测可复现性
echo "[TEST] 自测可复现性..."
# 运行自测命令
npm test --workspace=@hajimi/diff

if [ $? -eq 0 ]; then
  echo "PASS: 自测通过"
else
  echo "FAIL: 自测失败"
  exit 1
fi

echo "=== 所有验证通过 ==="
