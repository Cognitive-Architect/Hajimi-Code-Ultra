# YGGDRASIL 模型下载脚本 (Windows)
# 预下载Sentence-BERT模型，避免运行时等待

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "YGGDRASIL 本地模型下载工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$MODEL_NAME = "Xenova/all-MiniLM-L6-v2"
$CACHE_DIR = "./models/sentence-bert"

Write-Host "模型: $MODEL_NAME"
Write-Host "缓存目录: $CACHE_DIR"
Write-Host "预估大小: ~80MB"
Write-Host "========================================"

# 创建缓存目录
New-Item -ItemType Directory -Force -Path $CACHE_DIR | Out-Null

# 创建下载脚本
$downloadScript = @"
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
      process.stdout.write(`\\r下载进度: ${percent}% (${loadedMB}MB / ${totalMB}MB)`);
    }
  }
}).then(() => {
  console.log('\\n模型下载完成！');
  process.exit(0);
}).catch((err) => {
  console.error('\\n下载失败:', err);
  process.exit(1);
});
"@

$tempFile = [System.IO.Path]::GetTempFileName() + ".js"
Set-Content -Path $tempFile -Value $downloadScript

# 执行下载
try {
    node $tempFile
    if ($LASTEXITCODE -eq 0) {
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "✅ 模型下载成功" -ForegroundColor Green
        Write-Host "存储位置: $CACHE_DIR" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
    } else {
        throw "下载失败"
    }
} catch {
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "❌ 模型下载失败" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
} finally {
    Remove-Item -Path $tempFile -ErrorAction SilentlyContinue
}
