# Redis Test Runner Script for Windows PowerShell
# 客服小祥·Docker编排师 - B-02/09
# Usage: .\scripts\test-redis.ps1

param(
    [switch]$KeepData = $false
)

$ErrorActionPreference = "Stop"

# Colors for output
$Red = "Red"
$Green = "Green"
$Yellow = "Yellow"

function Write-ColorMessage {
    param($Message, $Color)
    Write-Host $Message -ForegroundColor $Color
}

Write-ColorMessage "[1/5] 正在启动 Redis 测试容器..." $Yellow

# 确保 tmp 目录存在
$tmpPath = Join-Path $PSScriptRoot "..\tmp\redis-test"
New-Item -ItemType Directory -Path $tmpPath -Force | Out-Null

# 切换到项目根目录
$projectRoot = Join-Path $PSScriptRoot ".."
Push-Location $projectRoot

try {
    # 启动容器
    docker-compose -f docker-compose.test.yml up -d redis-test

    # 等待 Redis 就绪
    Write-ColorMessage "[2/5] 等待 Redis 就绪..." $Yellow
    $retries = 0
    $maxRetries = 30
    $ready = $false

    while ($retries -lt $maxRetries -and -not $ready) {
        try {
            $result = docker exec hajimi-redis-test redis-cli ping 2>$null
            if ($result -eq "PONG") {
                $ready = $true
                Write-ColorMessage "✓ Redis 已就绪" $Green
            }
        } catch {
            # 忽略错误，继续重试
        }
        
        if (-not $ready) {
            $retries++
            Write-Host "." -NoNewline
            Start-Sleep -Milliseconds 500
        }
    }

    if (-not $ready) {
        Write-ColorMessage "✗ Redis 启动超时" $Red
        docker-compose -f docker-compose.test.yml logs redis-test
        docker-compose -f docker-compose.test.yml down
        exit 1
    }

    # 运行测试
    Write-ColorMessage "[3/5] 运行 Jest 测试..." $Yellow
    $env:REDIS_URL = "redis://localhost:6379"
    
    # 运行 npm test 并捕获结果
    npm test
    $testResult = $LASTEXITCODE

    if ($testResult -eq 0) {
        Write-ColorMessage "✓ 测试通过" $Green
    } else {
        Write-ColorMessage "✗ 测试失败" $Red
    }

    # 清理环境
    Write-ColorMessage "[4/5] 清理容器环境..." $Yellow
    docker-compose -f docker-compose.test.yml down

    # 清理数据（可选）
    if (-not $KeepData) {
        Write-ColorMessage "[5/5] 清理 Redis 测试数据..." $Yellow
        if (Test-Path $tmpPath) {
            Remove-Item -Path $tmpPath -Recurse -Force -ErrorAction SilentlyContinue
        }
        Write-ColorMessage "✓ 已清理测试数据" $Green
    } else {
        Write-ColorMessage "[5/5] 保留测试数据在 $tmpPath" $Green
    }

    if ($testResult -eq 0) {
        Write-ColorMessage "========================================" $Green
        Write-ColorMessage "  所有测试通过！" $Green
        Write-ColorMessage "========================================" $Green
        exit 0
    } else {
        Write-ColorMessage "========================================" $Red
        Write-ColorMessage "  测试未通过，请检查日志" $Red
        Write-ColorMessage "========================================" $Red
        exit 1
    }
} finally {
    Pop-Location
}
