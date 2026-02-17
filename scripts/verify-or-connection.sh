#!/bin/bash
# OpenRouter IP直连 连接验证脚本
# HAJIMI-OR-IPDIRECT - B-04/09
# 
# 用法: ./verify-or-connection.sh [model_id]
# 示例: ./verify-or-connection.sh deepseek/deepseek-chat

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

MODEL_ID="${1:-deepseek/deepseek-chat}"
TRACE_ID="verify-$(date +%s)"

echo -e "${BLUE}╔══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  OpenRouter IP直连连接验证器                                ║${NC}"
echo -e "${BLUE}║  HAJIMI-OR-IPDIRECT - B-04/09                               ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "目标模型: ${YELLOW}${MODEL_ID}${NC}"
echo -e "追踪ID: ${YELLOW}${TRACE_ID}${NC}"
echo ""

# 检查环境变量
if [ -z "$OPENROUTER_API_KEY" ]; then
    echo -e "${RED}✗ 错误: OPENROUTER_API_KEY 未设置${NC}"
    echo "请设置环境变量: export OPENROUTER_API_KEY=sk-or-v1-..."
    exit 1
fi

echo -e "${BLUE}[1/4] 环境检查...${NC}"
echo -e "  API Key: ${GREEN}${OPENROUTER_API_KEY:0:20}...${NC}"
echo -e "  Node.js: $(node --version)"
echo ""

# 执行测试调用
echo -e "${BLUE}[2/4] 执行测试调用 (IP直连)...${NC}"

TEST_OUTPUT=$(node -e "
const https = require('https');

const apiKey = process.env.OPENROUTER_API_KEY;
const model = '${MODEL_ID}';
const traceId = '${TRACE_ID}';

const postData = JSON.stringify({
  model: model,
  messages: [{ role: 'user', content: 'ping from validator' }],
  max_tokens: 5,
  metadata: { trace_id: traceId }
});

const options = {
  hostname: '104.21.63.51',
  port: 443,
  path: '/api/v1/chat/completions',
  method: 'POST',
  headers: {
    'Host': 'api.openrouter.ai',
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(postData),
    'HTTP-Referer': 'https://hajimi.ai',
    'X-Title': 'OR-Validator'
  },
  agent: new https.Agent({
    rejectUnauthorized: false,
    servername: 'api.openrouter.ai'
  }),
  timeout: 30000
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      try {
        const parsed = JSON.parse(data);
        console.log('SUCCESS:' + parsed.id + ':' + parsed.model + ':' + (parsed.usage?.total_tokens || 0));
      } catch (e) {
        console.log('PARSE_ERROR:' + data.substring(0, 100));
      }
    } else {
      console.log('HTTP_ERROR:' + res.statusCode + ':' + data.substring(0, 100));
    }
  });
});

req.on('error', (err) => {
  console.log('REQUEST_ERROR:' + err.message);
});

req.on('timeout', () => {
  console.log('TIMEOUT');
  req.destroy();
});

req.write(postData);
req.end();
" 2>&1)

# 解析测试结果
if [[ $TEST_OUTPUT == SUCCESS:* ]]; then
    IFS=':' read -r STATUS GEN_ID RESP_MODEL TOKENS <<< "$TEST_OUTPUT"
    echo -e "  状态: ${GREEN}✓ 调用成功${NC}"
    echo -e "  生成ID: ${YELLOW}${GEN_ID}${NC}"
    echo -e "  响应模型: ${YELLOW}${RESP_MODEL}${NC}"
    echo -e "  Token数: ${YELLOW}${TOKENS}${NC}"
else
    echo -e "  状态: ${RED}✗ 调用失败${NC}"
    echo -e "  错误: ${RED}${TEST_OUTPUT}${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}[3/4] 等待 Logs 同步 (10秒)...${NC}"
sleep 10

# 轮询验证 Logs
echo -e "${BLUE}[4/4] 验证 OpenRouter Logs...${NC}"

VALIDATION_OUTPUT=$(node -e "
const https = require('https');

const apiKey = process.env.OPENROUTER_API_KEY;
const expectedModel = '${MODEL_ID}';

const options = {
  hostname: 'api.openrouter.ai',
  port: 443,
  path: '/api/v1/generation',
  method: 'GET',
  headers: {
    'Authorization': 'Bearer ' + apiKey,
    'Content-Type': 'application/json'
  },
  timeout: 10000
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const logs = JSON.parse(data).data || [];
        const now = Date.now();
        const fiveMinutesAgo = now - 5 * 60 * 1000;
        
        // 查找最近5分钟内的记录
        const recentLogs = logs.filter(log => log.created * 1000 > fiveMinutesAgo);
        
        if (recentLogs.length === 0) {
          console.log('NO_LOGS_FOUND');
          return;
        }
        
        // 查找匹配的模型
        const match = recentLogs.find(log => 
          log.model === expectedModel || 
          log.model.includes(expectedModel.split('/').pop())
        );
        
        if (match) {
          console.log('LOG_FOUND:' + match.id + ':' + match.model + ':' + match.cost + ':' + match.status);
        } else {
          console.log('MODEL_MISMATCH:' + recentLogs[0].model);
        }
      } catch (e) {
        console.log('PARSE_ERROR');
      }
    } else {
      console.log('API_ERROR:' + res.statusCode);
    }
  });
});

req.on('error', (err) => {
  console.log('REQUEST_ERROR:' + err.message);
});

req.end();
" 2>&1)

echo ""
echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"

if [[ $VALIDATION_OUTPUT == LOG_FOUND:* ]]; then
    IFS=':' read -r STATUS LOG_ID LOG_MODEL COST LOG_STATUS <<< "$VALIDATION_OUTPUT"
    echo -e "${GREEN}✓ 验证通过！Logs 记录已确认${NC}"
    echo ""
    echo -e "  记录ID: ${YELLOW}${LOG_ID}${NC}"
    echo -e "  模型: ${YELLOW}${LOG_MODEL}${NC}"
    echo -e "  费用: ${YELLOW}\$${COST}${NC}"
    echo -e "  状态: ${YELLOW}${LOG_STATUS}${NC}"
    echo ""
    echo -e "${GREEN}OpenRouter IP直连连接正常！${NC}"
    exit 0
elif [[ $VALIDATION_OUTPUT == NO_LOGS_FOUND ]]; then
    echo -e "${YELLOW}⚠ 警告: 未找到最近5分钟的 Logs 记录${NC}"
    echo -e "  可能原因:"
    echo -e "    - Logs 同步延迟（正常）"
    echo -e "    - 调用未实际到达 OpenRouter"
    echo ""
    echo -e "${YELLOW}请手动检查 Dashboard: https://openrouter.ai/settings/keys${NC}"
    exit 2
elif [[ $VALIDATION_OUTPUT == MODEL_MISMATCH:* ]]; then
    ACTUAL_MODEL="${VALIDATION_OUTPUT#MODEL_MISMATCH:}"
    echo -e "${YELLOW}⚠ 模型不匹配${NC}"
    echo -e "  期望: ${YELLOW}${MODEL_ID}${NC}"
    echo -e "  实际: ${YELLOW}${ACTUAL_MODEL}${NC}"
    exit 2
else
    echo -e "${RED}✗ 验证失败: ${VALIDATION_OUTPUT}${NC}"
    exit 1
fi
