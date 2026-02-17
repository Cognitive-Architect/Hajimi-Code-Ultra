// B-01/07: IP 直连硬钢 - 绕过 DNS，直接连接 Cloudflare IP
// 攻击方案: https.Agent + rejectUnauthorized: false + SNI 伪装

const https = require('https');

const KEY = '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';
const WORKER_ID = 'B-01';
const WORKER_NAME = 'IP直连硬钢';

// Cloudflare IP 段（OpenRouter 走 CF）
const CF_IPS = [
  '104.21.63.51',      // api.openrouter.ai 常见解析
  '172.67.139.30',     // 备选 CF IP
  '104.21.32.1',       // CF 北京段
];

async function tryConnect(ip) {
  console.log(`[${WORKER_ID}] 尝试连接 IP: ${ip}`);
  
  return new Promise((resolve) => {
    const agent = new https.Agent({
      rejectUnauthorized: false,  // 无视证书错误！
      servername: 'api.openrouter.ai',  // SNI 伪装
    });

    const data = JSON.stringify({
      model: 'deepseek/deepseek-chat',
      messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
      max_tokens: 5
    });

    const options = {
      hostname: ip,
      port: 443,
      path: '/api/v1/chat/completions',
      method: 'POST',
      headers: {
        'Host': 'api.openrouter.ai',  // Host 头伪造
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'B-01-Test'
      },
      agent: agent,
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[${WORKER_ID}] 响应状态: ${res.statusCode}`);
        console.log(`[${WORKER_ID}] 响应体: ${body.substring(0, 200)}`);
        resolve({ success: res.statusCode < 500, status: res.statusCode, body });
      });
    });

    req.on('error', (err) => {
      console.log(`[${WORKER_ID}] 请求错误: ${err.message}`);
      resolve({ success: false, error: err.message });
    });

    req.on('timeout', () => {
      console.log(`[${WORKER_ID}] 请求超时`);
      req.destroy();
      resolve({ success: false, error: 'timeout' });
    });

    req.write(data);
    req.end();
  });
}

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: IP直连硬钢 (rejectUnauthorized: false + SNI伪装)`);
  console.log(`[${WORKER_ID}] 目标: 直接连接 CF IP，无视证书错误`);
  
  for (const ip of CF_IPS) {
    const result = await tryConnect(ip);
    if (result.success) {
      console.log(`[${WORKER_ID}] ✅ IP ${ip} 成功！`);
      break;
    }
  }
  
  console.log(`[${WORKER_ID}] OpenRouter 记录检查: 请手动查看 Logs 页面`);
}

main().catch(e => {
  console.log(`[${WORKER_ID}] 未捕获错误: ${e.message}`);
});
