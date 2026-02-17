// B-05/07: Axios IPv4 强制 - 禁用 IPv6，避免 IPv6 路由问题
// 攻击方案: httpsAgent 配置 family: 4，禁用 Keep-Alive

const axios = require('axios');
const https = require('https');

const KEY = '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';
const WORKER_ID = 'B-05';
const WORKER_NAME = 'IPv4强制';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: Axios IPv4 强制（family: 4，禁用 Keep-Alive）`);
  
  // 创建强制 IPv4 的 agent
  const agent = new https.Agent({
    family: 4,           // 强制 IPv4！
    keepAlive: false,    // 禁用 Keep-Alive
    rejectUnauthorized: true,
  });

  try {
    const response = await axios.post(
      'https://api.openrouter.ai/api/v1/chat/completions',
      {
        model: 'zhipuai/glm-5',
        messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
        max_tokens: 5
      },
      {
        headers: {
          'Authorization': `Bearer ${KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://localhost',
          'X-Title': 'B-05-Test'
        },
        httpsAgent: agent,
        timeout: 15000,
        validateStatus: () => true,
        // 禁用重定向跟随，看原始响应
        maxRedirects: 0,
      }
    );
    
    console.log(`[${WORKER_ID}] 响应状态: ${response.status}`);
    console.log(`[${WORKER_ID}] 响应数据: ${JSON.stringify(response.data).substring(0, 200)}`);
    
  } catch (error) {
    console.log(`[${WORKER_ID}] 请求错误: ${error.message}`);
    if (error.response) {
      console.log(`[${WORKER_ID}] 错误响应状态: ${error.response.status}`);
      console.log(`[${WORKER_ID}] 错误响应数据: ${JSON.stringify(error.response.data).substring(0, 200)}`);
    }
    if (error.code) {
      console.log(`[${WORKER_ID}] 错误代码: ${error.code}`);
    }
  }
  
  console.log(`[${WORKER_ID}] OpenRouter 记录检查: 请手动查看 Logs 页面`);
}

main().catch(e => {
  console.log(`[${WORKER_ID}] 未捕获错误: ${e.message}`);
});
