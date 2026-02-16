#!/bin/bash
# YGGDRASIL 模型下载脚本
# 预下载Sentence-BERT模型，避免运行时等待

echo "========================================"
echo "YGGDRASIL 本地模型下载工具"
echo "========================================"

MODEL_NAME="Xenova/all-MiniLM-L6-v2"
CACHE_DIR="./models/sentence-bert"

echo "模型: $MODEL_NAME"
echo "缓存目录: $CACHE_DIR"
echo "预估大小: ~80MB"
echo "========================================"

# 创建缓存目录
mkdir -p "$CACHE_DIR"

# 使用Node.js下载模型
cat > /tmp/download-model.js << 'EOF'
const { pipeline, env } = require('@xenova/transformers');

env.cacheDir = './models/sentence-bert';
env.allowLocalModels = true;
env.allowRemoteModels = true;

console.log('开始下载模型...');

pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
  quantized: true,
  progress_callback: (progress) => {
    if (progress.status === 'progress') {
      const percent = Math.round((progress.loaded / progress.total) * 100);
      const loadedMB = (progress.loaded / 1024 / 1024).toFixed(1);
      const totalMB = (progress.total / 1024 / 1024).toFixed(1);
      process.stdout.write(`\r下载进度: ${percent}% (${loadedMB}MB / ${totalMB}MB)`);
    }
  }
}).then(() => {
  console.log('\n模型下载完成！');
  process.exit(0);
}).catch((err) => {
  console.error('\n下载失败:', err);
  process.exit(1);
});
EOF

node /tmp/download-model.js

if [ $? -eq 0 ]; then
    echo "========================================"
    echo "✅ 模型下载成功"
    echo "存储位置: $CACHE_DIR"
    echo "========================================"
else
    echo "========================================"
    echo "❌ 模型下载失败"
    echo "========================================"
    exit 1
fi
