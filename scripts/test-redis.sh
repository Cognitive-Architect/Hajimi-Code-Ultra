#!/bin/bash
# Redis Test Runner Script for Linux/Mac
# 客服小祥·Docker编排师 - B-02/09
# Usage: ./scripts/test-redis.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}[1/5] 正在启动 Redis 测试容器...${NC}"

# 确保 tmp 目录存在
mkdir -p ./tmp/redis-test

# 启动容器
docker-compose -f docker-compose.test.yml up -d redis-test

# 等待 Redis 就绪
echo -e "${YELLOW}[2/5] 等待 Redis 就绪...${NC}"
RETRIES=0
MAX_RETRIES=30

while [ $RETRIES -lt $MAX_RETRIES ]; do
    if docker exec hajimi-redis-test redis-cli ping 2>/dev/null | grep -q "PONG"; then
        echo -e "${GREEN}✓ Redis 已就绪${NC}"
        break
    fi
    RETRIES=$((RETRIES + 1))
    echo -n "."
    sleep 0.5
done

if [ $RETRIES -eq $MAX_RETRIES ]; then
    echo -e "${RED}✗ Redis 启动超时${NC}"
    docker-compose -f docker-compose.test.yml logs redis-test
    docker-compose -f docker-compose.test.yml down
    exit 1
fi

# 运行测试
echo -e "${YELLOW}[3/5] 运行 Jest 测试...${NC}"
export REDIS_URL=redis://localhost:6379

if npm test; then
    echo -e "${GREEN}✓ 测试通过${NC}"
    TEST_RESULT=0
else
    echo -e "${RED}✗ 测试失败${NC}"
    TEST_RESULT=1
fi

# 清理环境
echo -e "${YELLOW}[4/5] 清理测试环境...${NC}"
docker-compose -f docker-compose.test.yml down

# 询问是否保留数据（可选）
echo -e "${YELLOW}[5/5] 是否清理 Redis 测试数据? (y/N)${NC}"
read -t 5 -n 1 -r RESPONSE || true
echo

if [[ $RESPONSE =~ ^[Yy]$ ]]; then
    rm -rf ./tmp/redis-test
    echo -e "${GREEN}✓ 已清理测试数据${NC}"
else
    echo -e "${GREEN}✓ 保留测试数据在 ./tmp/redis-test${NC}"
fi

if [ $TEST_RESULT -eq 0 ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  所有测试通过！${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}  测试未通过，请检查日志${NC}"
    echo -e "${RED}========================================${NC}"
    exit 1
fi
