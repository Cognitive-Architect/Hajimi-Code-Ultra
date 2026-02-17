#!/bin/bash
# OpenRouter 诊断医生 (Level 1)
# HAJIMI-OR-IPDIRECT - B-08/09
#
# 用法: ./or-debug-doctor.sh [--full]

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

FULL_MODE=false
if [ "$1" == "--full" ]; then
    FULL_MODE=true
fi

echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║  🔧 OpenRouter 诊断医生 (Level 1)                           ║${NC}"
echo -e "${CYAN}║  HAJIMI-OR-IPDIRECT - B-08/09                               ║${NC}"
echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo -e "模式: ${FULL_MODE:+完整}${FULL_MODE:-快速}"
echo ""

# 检查计数器
PASS=0
WARN=0
FAIL=0

check_pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASS++))
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARN++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAIL++))
}

section() {
    echo ""
    echo -e "${BLUE}▶ $1${NC}"
    echo "─────────────────────────────────────────────────────────────"
}

# ============================================
# 1. 环境检查
# ============================================
section "1. 环境检查"

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js: $NODE_VERSION"
else
    check_fail "Node.js: not found"
fi

# 项目根目录
if [ -f "package.json" ]; then
    check_pass "Project root: $(pwd)"
else
    check_warn "Not in project root ($(pwd))"
fi

# 必要目录
for dir in lib config; do
    if [ -d "$dir" ]; then
        check_pass "Directory: $dir/"
    else
        check_fail "Directory missing: $dir/"
    fi
done

# ============================================
# 2. 配置检查
# ============================================
section "2. 配置检查"

# 环境变量
if [ -n "$OPENROUTER_API_KEY" ]; then
    KEY_PREFIX="${OPENROUTER_API_KEY:0:20}"
    check_pass "OPENROUTER_API_KEY: ${KEY_PREFIX}..."
else
    check_fail "OPENROUTER_API_KEY: not set"
fi

# 配置文件
if [ -f "config/or-bypass.json" ]; then
    check_pass "Config: config/or-bypass.json"
else
    check_warn "Config: config/or-bypass.json not found"
fi

# Kill Switch
if [ -f ".emergency/or-kill-switch" ]; then
    check_warn "Kill Switch: ACTIVE (.emergency/or-kill-switch exists)"
    echo ""
    echo -e "${YELLOW}Kill Switch Content:${NC}"
    cat .emergency/or-kill-switch | sed 's/^/  /'
else
    check_pass "Kill Switch: inactive"
fi

# ============================================
# 3. 网络检查
# ============================================
section "3. 网络检查"

# IP 直连连通性
echo -n "  Testing 104.21.63.51:443 (TCP)... "
if timeout 3 bash -c "cat < /dev/null > /dev/tcp/104.21.63.51/443" 2>/dev/null; then
    check_pass "104.21.63.51:443 reachable"
else
    check_fail "104.21.63.51:443 unreachable"
fi

# DNS 解析
echo -n "  Testing DNS resolution... "
if nslookup api.openrouter.ai > /dev/null 2>&1; then
    IP=$(nslookup api.openrouter.ai 2>/dev/null | grep -A1 "Name:" | grep "Address:" | head -1 | awk '{print $2}')
    check_pass "DNS: api.openrouter.ai → $IP"
else
    check_warn "DNS: resolution failed"
fi

# 标准 HTTPS
echo -n "  Testing standard HTTPS... "
if curl -s --max-time 5 -o /dev/null -w "%{http_code}" https://api.openrouter.ai/api/v1/models | grep -q "200\|401"; then
    check_pass "Standard HTTPS: working"
else
    check_warn "Standard HTTPS: may have issues"
fi

# ============================================
# 4. 完整诊断 (可选)
# ============================================
if [ "$FULL_MODE" = true ]; then
    section "4. 完整诊断"
    
    if command -v node &> /dev/null && [ -f "lib/emergency/or-fallback.ts" ]; then
        echo "Running TypeScript diagnostic..."
        node -e "
        const fallback = require('./lib/emergency/or-fallback');
        const doctor = fallback.createEmergencyFallback();
        doctor.runDiagnostic().then(result => {
            console.log('Overall:', result.overall);
            console.log('Recommendation:', result.recommendation);
            result.checks.forEach(check => {
                const icon = check.status === 'pass' ? '✓' : check.status === 'warn' ? '⚠' : '✗';
                console.log(' ', icon, check.name + ':', check.message, '(' + check.durationMs + 'ms)');
            });
        });
        " 2>/dev/null || check_warn "Could not run TypeScript diagnostic"
    fi
fi

# ============================================
# 5. 日志检查
# ============================================
section "5. 最近日志"

if [ -f ".emergency/or-audit.log" ]; then
    echo -e "${CYAN}最近 5 条审计日志:${NC}"
    tail -5 .emergency/or-audit.log | while read line; do
        echo "  $line"
    done
else
    echo "  (无审计日志文件)"
fi

# ============================================
# 总结
# ============================================
echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}通过: $PASS${NC}  |  ${YELLOW}警告: $WARN${NC}  |  ${RED}失败: $FAIL${NC}"
echo ""

if [ $FAIL -eq 0 ] && [ $WARN -eq 0 ]; then
    echo -e "${GREEN}✓ 系统健康${NC}"
    echo "  建议: 继续正常操作"
elif [ $FAIL -eq 0 ]; then
    echo -e "${YELLOW}⚠ 系统降级${NC}"
    echo "  建议: 关注警告项，准备应急预案"
else
    echo -e "${RED}✗ 系统故障${NC}"
    echo "  建议: 执行应急回滚命令:"
    echo "  node -e \"require('./lib/emergency/or-fallback').globalEmergencyFallback.emergencySwitchToStandard()\""
fi

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════════════${NC}"
echo ""

exit $FAIL
