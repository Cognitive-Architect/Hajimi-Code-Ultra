// B-02/07: HTTP/1.1 强制降级 - 避开 HTTP/2 握手问题
// 攻击方案: axios 配置 httpVersion: 'http/1.1'

const axios = require('axios');
const https = require('https');

const KEY = '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';
const WORKER_ID = 'B-02';
const WORKER_NAME = 'HTTP/1.1降级';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: HTTP/1.1 强制降级（避开 HTTP/2）`);
  
  // 创建强制 HTTP/1.1 的 agent
  const agent = new https.Agent({
    rejectUnauthorized: true,
    // Node 默认就是 HTTP/1.1，除非显式启用 HTTP/2
    // 这里我们用 ALPNProtocols 明确指定
    ALPNProtocols: ['http/1.1'],
    // 禁用 keep-alive，强制新连接
    keepAlive: false,
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
          'X-Title': 'B-02-Test'
        },
        httpsAgent: agent,
        timeout: 15000,
        // Axios 特定配置
        httpAgent: undefined,  // 禁用 http agent
        maxRedirects: 5,
        validateStatus: () => true,  // 接受任何状态码
      }
    );
    
    console.log(`[${WORKER_ID}] 响应状态: ${response.status}`);
    console.log(`[${WORKER_ID}] 响应数据: ${JSON.stringify(response.data).substring(0, 200)}`);
    
  } catch (error) {
    console.log(`[${WORKER_ID}] 请求错误: ${error.message}`);
    if (error.response) {
      console.log(`[${WORKER_ID}] 错误响应状态: ${error.response.status}`);
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
