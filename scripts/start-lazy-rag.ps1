#requires -Version 5.1
<#
.SYNOPSIS
    Lazy-RAG Server 启动脚本 (Windows)
.DESCRIPTION
    检查Node.js版本，自动安装依赖，启动Lazy-RAG Server
.NOTES
    B-02/09: Lazy-RAG Server实现
#>

[CmdletBinding()]
param(
    [int]$Port = 3456,
    [string]$Host = "0.0.0.0",
    [string]$StoragePath = "",
    [switch]$Dev
)

$ErrorActionPreference = "Stop"

# 颜色配置
$Colors = @{
    Success = "Green"
    Error   = "Red"
    Info    = "Cyan"
    Warn    = "Yellow"
}

function Write-Status($Message, $Type = "Info") {
    $color = $Colors[$Type]
    Write-Host "[$Type] $Message" -ForegroundColor $color
}

# ============ Node.js版本检查 ============
function Test-NodeVersion {
    Write-Status "Checking Node.js version..." "Info"
    
    try {
        $nodeVersion = node --version
        $versionMatch = $nodeVersion -match 'v(\d+)\.(\d+)\.(\d+)'
        if (-not $versionMatch) {
            throw "Could not parse Node.js version"
        }
        
        $major = [int]$matches[1]
        Write-Status "Found Node.js $nodeVersion" "Success"
        
        if ($major -lt 18) {
            Write-Status "Node.js 18+ required, found $major" "Error"
            exit 1
        }
        return $true
    } catch {
        Write-Status "Node.js not found. Please install Node.js 18+" "Error"
        exit 1
    }
}

# ============ 依赖检查与安装 ============
function Install-Dependencies {
    param([string]$ServerPath)
    
    Write-Status "Checking dependencies..." "Info"
    
    Push-Location $ServerPath
    try {
        # 检查node_modules是否存在
        if (-not (Test-Path "node_modules" -PathType Container)) {
            Write-Status "node_modules not found, installing dependencies..." "Warn"
            
            # 使用npm ci如果package-lock.json存在，否则用npm install
            if (Test-Path "package-lock.json") {
                npm ci
            } else {
                npm install
            }
            
            if ($LASTEXITCODE -ne 0) {
                throw "npm install failed"
            }
            Write-Status "Dependencies installed successfully" "Success"
        } else {
            Write-Status "Dependencies already installed" "Success"
        }
    } finally {
        Pop-Location
    }
}

# ============ 主逻辑 ============
function Main {
    Write-Host ""
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host "    Lazy-RAG Server Launcher" -ForegroundColor Cyan
    Write-Host "    Windows PowerShell Edition" -ForegroundColor Cyan
    Write-Host "=====================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 确定路径
    $scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
    $projectRoot = Resolve-Path (Join-Path $scriptPath "..")
    $serverPath = Join-Path $projectRoot "server\lazy-rag"
    
    Write-Status "Project root: $projectRoot" "Info"
    Write-Status "Server path: $serverPath" "Info"
    
    # 检查server目录
    if (-not (Test-Path $serverPath -PathType Container)) {
        Write-Status "Server directory not found: $serverPath" "Error"
        exit 1
    }
    
    # 检查Node.js
    Test-NodeVersion
    
    # 安装依赖
    Install-Dependencies -ServerPath $serverPath
    
    # 设置环境变量
    $env:LAZY_RAG_PORT = $Port
    $env:LAZY_RAG_HOST = $Host
    $env:NODE_ENV = if ($Dev) { "development" } else { "production" }
    
    if ($StoragePath) {
        $env:LAZY_RAG_STORAGE = $StoragePath
    } else {
        $env:LAZY_RAG_STORAGE = Join-Path $projectRoot "storage\lazy-rag"
    }
    
    Write-Status "Configuration:" "Info"
    Write-Status "  Port: $Port" "Info"
    Write-Status "  Host: $Host" "Info"
    Write-Status "  Storage: $($env:LAZY_RAG_STORAGE)" "Info"
    Write-Status "  Mode: $($env:NODE_ENV)" "Info"
    
    Write-Host ""
    Write-Status "Starting Lazy-RAG Server..." "Info"
    Write-Host ""
    
    # 启动服务
    Push-Location $serverPath
    try {
        if ($Dev) {
            npm run dev
        } else {
            npm start
        }
    } finally {
        Pop-Location
    }
}

# 执行
Main
