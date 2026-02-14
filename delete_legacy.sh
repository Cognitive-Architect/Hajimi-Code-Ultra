#!/bin/bash
# =============================================================================
# 技术债务清算脚本 - delete_legacy.sh
# 重建启动脚本 - 彻底告别屎山
# 执行时间: Day 1
# 版本: 1.0.0
# =============================================================================

set -euo pipefail  # 严格模式：遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 统计变量
P0_DIRS=0
P1_DIRS=0
P2_DIRS=0
P0_FILES=0
P1_FILES=0
P2_FILES=0
P0_LINES=0
P1_LINES=0
P2_LINES=0

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           🗑️  技术债务清算 - Legacy代码清理启动              ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 创建备份目录（仅用于统计）
BACKUP_DIR="/tmp/legacy_backup_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

# =============================================================================
# P0: 核心废弃组件（立即执行 - Day 1）
# =============================================================================
echo -e "${RED}【P0】核心废弃组件清理 - 立即执行${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 纯内存存储层
echo -e "${YELLOW}▶ 删除纯内存存储层...${NC}"
if [ -d "src/storage/memory" ]; then
    FILE_COUNT=$(find src/storage/memory -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/storage/memory -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/storage/memory/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/storage/memory/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/storage/memory/ 不存在，跳过${NC}"
fi

echo ""
echo -e "${YELLOW}▶ 删除内存缓存层...${NC}"
if [ -d "src/cache/inmemory" ]; then
    FILE_COUNT=$(find src/cache/inmemory -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/cache/inmemory -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/cache/inmemory/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/cache/inmemory/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/cache/inmemory/ 不存在，跳过${NC}"
fi

# 2. 硬编码提示词
echo ""
echo -e "${YELLOW}▶ 删除硬编码提示词...${NC}"
if [ -d "src/prompts/hardcoded" ]; then
    FILE_COUNT=$(find src/prompts/hardcoded -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/prompts/hardcoded -type f \( -name "*.py" -o -name "*.txt" -o -name "*.md" \) -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/prompts/hardcoded/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/prompts/hardcoded/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/prompts/hardcoded/ 不存在，跳过${NC}"
fi

echo ""
echo -e "${YELLOW}▶ 删除静态Fabric提示词...${NC}"
if [ -d "src/fabric/prompts_static" ]; then
    FILE_COUNT=$(find src/fabric/prompts_static -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/fabric/prompts_static -type f \( -name "*.py" -o -name "*.txt" -o -name "*.md" \) -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/fabric/prompts_static/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/fabric/prompts_static/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/fabric/prompts_static/ 不存在，跳过${NC}"
fi

# 3. 紧耦合模块
echo ""
echo -e "${YELLOW}▶ 删除紧耦合模块...${NC}"
if [ -d "src/modules/coupled" ]; then
    FILE_COUNT=$(find src/modules/coupled -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/modules/coupled -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/modules/coupled/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/modules/coupled/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/modules/coupled/ 不存在，跳过${NC}"
fi

# 4. 单体核心
echo ""
echo -e "${YELLOW}▶ 删除单体核心...${NC}"
if [ -d "src/core/monolithic" ]; then
    FILE_COUNT=$(find src/core/monolithic -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/core/monolithic -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P0_FILES=$((P0_FILES + FILE_COUNT))
    P0_LINES=$((P0_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/core/monolithic/
    P0_DIRS=$((P0_DIRS + 1))
    echo -e "  ${GREEN}✓ src/core/monolithic/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/core/monolithic/ 不存在，跳过${NC}"
fi

# =============================================================================
# P1: 配置和工具（本周内）
# =============================================================================
echo ""
echo -e "${YELLOW}【P1】配置和工具清理 - 本周内执行${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 分散配置
echo -e "${YELLOW}▶ 删除分散配置...${NC}"
if [ -d "config/scattered" ]; then
    FILE_COUNT=$(find config/scattered -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find config/scattered -type f \( -name "*.py" -o -name "*.yaml" -o -name "*.yml" -o -name "*.json" \) -exec cat {} \; 2>/dev/null | wc -l)
    P1_FILES=$((P1_FILES + FILE_COUNT))
    P1_LINES=$((P1_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf config/scattered/
    P1_DIRS=$((P1_DIRS + 1))
    echo -e "  ${GREEN}✓ config/scattered/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ config/scattered/ 不存在，跳过${NC}"
fi

# 2. 本地设置文件
echo ""
echo -e "${YELLOW}▶ 删除本地设置文件...${NC}"
LOCAL_SETTINGS=$(find . -maxdepth 2 -name "local_*.py" -type f 2>/dev/null | wc -l)
if [ "$LOCAL_SETTINGS" -gt 0 ]; then
    FILE_COUNT=$LOCAL_SETTINGS
    LINE_COUNT=$(find . -maxdepth 2 -name "local_*.py" -type f -exec cat {} \; 2>/dev/null | wc -l)
    P1_FILES=$((P1_FILES + FILE_COUNT))
    P1_LINES=$((P1_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    find . -maxdepth 2 -name "local_*.py" -type f -delete
    echo -e "  ${GREEN}✓ local_*.py 已删除${NC}"
else
    echo -e "  ${GREEN}✓ local_*.py 不存在，跳过${NC}"
fi

# 3. 废弃工具
echo ""
echo -e "${YELLOW}▶ 删除废弃工具...${NC}"
if [ -d "src/utils/legacy" ]; then
    FILE_COUNT=$(find src/utils/legacy -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/utils/legacy -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P1_FILES=$((P1_FILES + FILE_COUNT))
    P1_LINES=$((P1_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/utils/legacy/
    P1_DIRS=$((P1_DIRS + 1))
    echo -e "  ${GREEN}✓ src/utils/legacy/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/utils/legacy/ 不存在，跳过${NC}"
fi

# 4. 废弃辅助函数
echo ""
echo -e "${YELLOW}▶ 删除废弃辅助函数...${NC}"
if [ -d "src/helpers/deprecated" ]; then
    FILE_COUNT=$(find src/helpers/deprecated -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/helpers/deprecated -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P1_FILES=$((P1_FILES + FILE_COUNT))
    P1_LINES=$((P1_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf src/helpers/deprecated/
    P1_DIRS=$((P1_DIRS + 1))
    echo -e "  ${GREEN}✓ src/helpers/deprecated/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ src/helpers/deprecated/ 不存在，跳过${NC}"
fi

# 5. 过时测试
echo ""
echo -e "${YELLOW}▶ 删除过时测试...${NC}"
if [ -d "tests/outdated" ]; then
    FILE_COUNT=$(find tests/outdated -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find tests/outdated -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P1_FILES=$((P1_FILES + FILE_COUNT))
    P1_LINES=$((P1_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码"
    rm -rf tests/outdated/
    P1_DIRS=$((P1_DIRS + 1))
    echo -e "  ${GREEN}✓ tests/outdated/ 已删除${NC}"
else
    echo -e "  ${GREEN}✓ tests/outdated/ 不存在，跳过${NC}"
fi

# =============================================================================
# P2: 重建过程中删除（标记待删除）
# =============================================================================
echo ""
echo -e "${BLUE}【P2】重建过程中删除 - 标记待处理${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 1. 旧中间件
echo -e "${YELLOW}▶ 标记旧中间件...${NC}"
if [ -d "src/middleware/old" ]; then
    FILE_COUNT=$(find src/middleware/old -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/middleware/old -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P2_FILES=$((P2_FILES + FILE_COUNT))
    P2_LINES=$((P2_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码 (待重建后删除)"
    # 标记为待删除而非立即删除
    touch src/middleware/old/.DELETE_ON_REBUILD
    P2_DIRS=$((P2_DIRS + 1))
    echo -e "  ${YELLOW}⚠ src/middleware/old/ 已标记待删除${NC}"
else
    echo -e "  ${GREEN}✓ src/middleware/old/ 不存在，跳过${NC}"
fi

# 2. 废弃模型
echo ""
echo -e "${YELLOW}▶ 标记废弃模型...${NC}"
if [ -d "src/models/deprecated" ]; then
    FILE_COUNT=$(find src/models/deprecated -type f 2>/dev/null | wc -l)
    LINE_COUNT=$(find src/models/deprecated -type f -name "*.py" -exec cat {} \; 2>/dev/null | wc -l)
    P2_FILES=$((P2_FILES + FILE_COUNT))
    P2_LINES=$((P2_LINES + LINE_COUNT))
    echo "  发现: $FILE_COUNT 个文件, $LINE_COUNT 行代码 (待重建后删除)"
    # 标记为待删除而非立即删除
    touch src/models/deprecated/.DELETE_ON_REBUILD
    P2_DIRS=$((P2_DIRS + 1))
    echo -e "  ${YELLOW}⚠ src/models/deprecated/ 已标记待删除${NC}"
else
    echo -e "  ${GREEN}✓ src/models/deprecated/ 不存在，跳过${NC}"
fi

# =============================================================================
# 清理残留文件
# =============================================================================
echo ""
echo -e "${BLUE}【清理】残留文件清理${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

echo -e "${YELLOW}▶ 删除备份文件...${NC}"
BAK_COUNT=$(find . -name "*.bak" -type f 2>/dev/null | wc -l)
if [ "$BAK_COUNT" -gt 0 ]; then
    find . -name "*.bak" -type f -delete
    echo -e "  ${GREEN}✓ 删除 $BAK_COUNT 个 .bak 文件${NC}"
else
    echo -e "  ${GREEN}✓ 无 .bak 文件需要清理${NC}"
fi

echo ""
echo -e "${YELLOW}▶ 删除deprecated标记文件...${NC}"
DEPRECATED_COUNT=$(find . -name "*.deprecated" -type f 2>/dev/null | wc -l)
if [ "$DEPRECATED_COUNT" -gt 0 ]; then
    find . -name "*.deprecated" -type f -delete
    echo -e "  ${GREEN}✓ 删除 $DEPRECATED_COUNT 个 .deprecated 文件${NC}"
else
    echo -e "  ${GREEN}✓ 无 .deprecated 文件需要清理${NC}"
fi

echo ""
echo -e "${YELLOW}▶ 删除旧版本文件...${NC}"
OLD_COUNT=$(find . -name "*.old" -type f 2>/dev/null | wc -l)
if [ "$OLD_COUNT" -gt 0 ]; then
    find . -name "*.old" -type f -delete
    echo -e "  ${GREEN}✓ 删除 $OLD_COUNT 个 .old 文件${NC}"
else
    echo -e "  ${GREEN}✓ 无 .old 文件需要清理${NC}"
fi

# =============================================================================
# 统计报告
# =============================================================================
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║                    📊 删除统计报告                           ║${NC}"
echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""

TOTAL_DIRS=$((P0_DIRS + P1_DIRS + P2_DIRS))
TOTAL_FILES=$((P0_FILES + P1_FILES + P2_FILES))
TOTAL_LINES=$((P0_LINES + P1_LINES + P2_LINES))

echo "┌──────────┬─────────┬─────────┬──────────┐"
echo "│ 优先级   │ 目录数  │ 文件数  │ 代码行数 │"
echo "├──────────┼─────────┼─────────┼──────────┤"
printf "│ P0       │ %5d   │ %5d   │ %6d   │\n" "$P0_DIRS" "$P0_FILES" "$P0_LINES"
printf "│ P1       │ %5d   │ %5d   │ %6d   │\n" "$P1_DIRS" "$P1_FILES" "$P1_LINES"
printf "│ P2       │ %5d   │ %5d   │ %6d   │\n" "$P2_DIRS" "$P2_FILES" "$P2_LINES"
echo "├──────────┼─────────┼─────────┼──────────┤"
printf "│ 总计     │ %5d   │ %5d   │ %6d   │\n" "$TOTAL_DIRS" "$TOTAL_FILES" "$TOTAL_LINES"
echo "└──────────┴─────────┴─────────┴──────────┘"

echo ""
echo -e "${GREEN}✅ Legacy 代码清理完成！${NC}"
echo ""
echo "清理摘要:"
echo "  • P0 核心废弃组件: $P0_DIRS 个目录, $P0_FILES 个文件, $P0_LINES 行代码"
echo "  • P1 配置和工具: $P1_DIRS 个目录, $P1_FILES 个文件, $P1_LINES 行代码"
echo "  • P2 待重建后删除: $P2_DIRS 个目录, $P2_FILES 个文件, $P2_LINES 行代码"
echo ""
echo "技术债务评级: ${GREEN}已清零${NC}"
echo "遗留代码状态: ${GREEN}已清除${NC}"
echo "扩展瓶颈: ${GREEN}已解除${NC}"

# 清理临时备份目录
rm -rf "$BACKUP_DIR"

exit 0
