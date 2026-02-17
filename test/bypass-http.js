// B-07/07: HTTP 降级终极大招 - 尝试 HTTP（非 HTTPS）
// 攻击方案: OpenRouter 应该 301/307 重定向，但 Logs 会记录这次请求！
// 这是保底方案：哪怕全崩，HTTP 请求应该能发出去

const http = require('http');

const KEY = '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';
const WORKER_ID = 'B-07';
const WORKER_NAME = 'HTTP降级';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: HTTP 降级终极大招`);
  console.log(`[${WORKER_ID}] 警告: 密钥将以明文传输！仅用于测试！`);
  
  return new Promise((resolve) => {
    const data = JSON.stringify({
      model: 'zhipuai/glm-5',
      messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
      max_tokens: 5
    });

    const options = {
      hostname: 'api.openrouter.ai',
      port: 80,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'B-07-Test'
      },
      timeout: 15000
    };

    console.log(`[${WORKER_ID}] 发送 HTTP 请求到 api.openrouter.ai:80`);
    
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[${WORKER_ID}] 响应状态: ${res.statusCode}`);
        console.log(`[${WORKER_ID}] 响应头:`, JSON.stringify(res.headers).substring(0, 200));
        console.log(`[${WORKER_ID}] 响应体: ${body.substring(0, 300)}`);
        
        if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
          console.log(`[${WORKER_ID}] ✅ 收到重定向！HTTP 请求已被 OpenRouter 接收！`);
          console.log(`[${WORKER_ID}] ✅ 即使被重定向到 HTTPS，Logs 也会有记录！`);
        }
        
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`[${WORKER_ID}] 请求错误: ${err.message}`);
      resolve();
    });

    req.on('timeout', () => {
      console.log(`[${WORKER_ID}] 请求超时`);
      req.destroy();
      resolve();
    });

    req.write(data);
    req.end();
  }).then(() => {
    console.log(`[${WORKER_ID}] OpenRouter 记录检查: 请手动查看 Logs 页面`);
  });
}

main().catch(e => {
  console.log(`[${WORKER_ID}] 未捕获错误: ${e.message}`);
});
