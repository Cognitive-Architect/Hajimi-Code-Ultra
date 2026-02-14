#!/bin/bash
# =============================================================================
# verify_debt_clearance.sh - 债务清算验证脚本
# 技术债务清算验证 - 确保所有遗留代码已清除
# =============================================================================

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🔍 技术债务清算验证"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

FAILED=0

# DEBT-001: 遗留代码清零
echo "[DEBT-001] 遗留代码清零验证..."
LEGACY_COUNT=$(find . -type d \( \
    -name "*legacy*" -o -name "*deprecated*" -o -name "*old*" \
    -o -name "*outdated*" \) 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l)
if [ "$LEGACY_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 无遗留代码目录"
else
    echo -e "  ${RED}❌ 失败${NC} - 发现 $LEGACY_COUNT 个遗留目录"
    FAILED=$((FAILED + 1))
fi

# DEBT-002: 债务评级归零
echo "[DEBT-002] 债务评级验证..."
BAK_COUNT=$(find . -name "*.bak" -type f 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l)
DEPRECATED_COUNT=$(find . -name "*.deprecated" -type f 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l)
OLD_COUNT=$(find . -name "*.old" -type f 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l)
if [ "$BAK_COUNT" -eq 0 ] && [ "$DEPRECATED_COUNT" -eq 0 ] && [ "$OLD_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 债务评级: 0"
else
    echo -e "  ${RED}❌ 失败${NC} - 发现残留文件: .bak=$BAK_COUNT, .deprecated=$DEPRECATED_COUNT, .old=$OLD_COUNT"
    FAILED=$((FAILED + 1))
fi

# DEBT-003: Git归档验证
echo "[DEBT-003] Git归档验证..."
if git show-ref --verify --quiet refs/tags/v2.1.0-final 2>/dev/null; then
    echo -e "  ${GREEN}✅ 通过${NC} - v2.1.0-final标签存在"
else
    echo -e "  ${YELLOW}⚠️ 警告${NC} - 标签不存在 (请先运行archive_legacy.sh)"
fi

# DEBT-004: P0目录删除验证
echo "[DEBT-004] P0目录删除验证..."
P0_MISSING=0
for dir in src/storage/memory src/cache/inmemory src/prompts/hardcoded \
           src/fabric/prompts_static src/modules/coupled src/core/monolithic; do
    if [ -d "$dir" ]; then
        echo -e "  ${RED}❌ 失败${NC} - $dir 仍存在"
        P0_MISSING=$((P0_MISSING + 1))
    fi
done
if [ "$P0_MISSING" -eq 0 ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 所有P0目录已删除"
else
    FAILED=$((FAILED + 1))
fi

# RSCH-103: 扩展瓶颈验证
echo "[RSCH-103] 扩展瓶颈验证..."
COUPLED_COUNT=$(find . -type d -name "*coupled*" 2>/dev/null | grep -v node_modules | grep -v ".git" | wc -l)
if [ "$COUPLED_COUNT" -eq 0 ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 扩展瓶颈已解除"
else
    echo -e "  ${RED}❌ 失败${NC} - 仍存在紧耦合模块"
    FAILED=$((FAILED + 1))
fi

# RSCH-104: 存储层验证
echo "[RSCH-104] 存储层解耦验证..."
if [ ! -d "src/storage/memory" ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 存储层已解耦"
else
    echo -e "  ${RED}❌ 失败${NC} - 纯内存存储仍存在"
    FAILED=$((FAILED + 1))
fi

# RSCH-105: 缓存层验证
echo "[RSCH-105] 缓存层解耦验证..."
if [ ! -d "src/cache/inmemory" ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 缓存层已解耦"
else
    echo -e "  ${RED}❌ 失败${NC} - 纯内存缓存仍存在"
    FAILED=$((FAILED + 1))
fi

# RSCH-106: 提示词配置验证
echo "[RSCH-106] 提示词配置化验证..."
if [ ! -d "src/prompts/hardcoded" ]; then
    echo -e "  ${GREEN}✅ 通过${NC} - 提示词已配置化"
else
    echo -e "  ${RED}❌ 失败${NC} - 硬编码提示词仍存在"
    FAILED=$((FAILED + 1))
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ 所有验证项通过！技术债务已清算完成。${NC}"
    exit 0
else
    echo -e "${RED}❌ 验证失败: $FAILED 项未通过${NC}"
    exit 1
fi
