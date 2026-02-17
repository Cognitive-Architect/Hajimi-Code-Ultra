#!/bin/bash
#
# Lazy-RAG Server 启动脚本 (Linux/macOS)
#
# 检查Node.js版本，自动安装依赖，启动Lazy-RAG Server
# B-02/09: Lazy-RAG Server实现
#

set -e

# 颜色配置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${CYAN}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 默认配置
PORT=3456
HOST="0.0.0.0"
STORAGE_PATH=""
DEV_MODE=false

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--port)
            PORT="$2"
            shift 2
            ;;
        -h|--host)
            HOST="$2"
            shift 2
            ;;
        -s|--storage)
            STORAGE_PATH="$2"
            shift 2
            ;;
        --dev)
            DEV_MODE=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  -p, --port <port>       Server port (default: 3456)"
            echo "  -h, --host <host>       Server host (default: 0.0.0.0)"
            echo "  -s, --storage <path>    Storage directory path"
            echo "  --dev                   Run in development mode with auto-reload"
            echo "  --help                  Show this help message"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# ============ Node.js版本检查 ============
check_node_version() {
    log_info "Checking Node.js version..."
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js 18+"
        exit 1
    fi
    
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d'.' -f1 | tr -d 'v')
    
    log_success "Found Node.js $NODE_VERSION"
    
    if [ "$NODE_MAJOR" -lt 18 ]; then
        log_error "Node.js 18+ required, found $NODE_MAJOR"
        exit 1
    fi
}

# ============ 依赖检查与安装 ============
install_dependencies() {
    local server_path="$1"
    
    log_info "Checking dependencies..."
    
    cd "$server_path"
    
    if [ ! -d "node_modules" ]; then
        log_warn "node_modules not found, installing dependencies..."
        
        if [ -f "package-lock.json" ]; then
            npm ci
        else
            npm install
        fi
        
        if [ $? -ne 0 ]; then
            log_error "npm install failed"
            exit 1
        fi
        log_success "Dependencies installed successfully"
    else
        log_success "Dependencies already installed"
    fi
}

# ============ 主逻辑 ============
main() {
    echo ""
    echo -e "${CYAN}=====================================${NC}"
    echo -e "${CYAN}    Lazy-RAG Server Launcher${NC}"
    echo -e "${CYAN}    Linux/macOS Bash Edition${NC}"
    echo -e "${CYAN}=====================================${NC}"
    echo ""
    
    # 确定路径
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
    SERVER_PATH="$PROJECT_ROOT/server/lazy-rag"
    
    log_info "Project root: $PROJECT_ROOT"
    log_info "Server path: $SERVER_PATH"
    
    # 检查server目录
    if [ ! -d "$SERVER_PATH" ]; then
        log_error "Server directory not found: $SERVER_PATH"
        exit 1
    fi
    
    # 检查Node.js
    check_node_version
    
    # 安装依赖
    install_dependencies "$SERVER_PATH"
    
    # 设置环境变量
    export LAZY_RAG_PORT="$PORT"
    export LAZY_RAG_HOST="$HOST"
    export LAZY_RAG_STORAGE="${STORAGE_PATH:-$PROJECT_ROOT/storage/lazy-rag}"
    export NODE_ENV="$($DEV_MODE && echo "development" || echo "production")"
    
    log_info "Configuration:"
    log_info "  Port: $PORT"
    log_info "  Host: $HOST"
    log_info "  Storage: $LAZY_RAG_STORAGE"
    log_info "  Mode: $NODE_ENV"
    
    echo ""
    log_info "Starting Lazy-RAG Server..."
    echo ""
    
    # 启动服务
    cd "$SERVER_PATH"
    if [ "$DEV_MODE" = true ]; then
        npm run dev
    else
        npm start
    fi
}

# 执行主逻辑
main "$@"
