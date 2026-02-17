// B-03/07: 系统代理穿透 - 强制走系统代理出口
// 攻击方案: 读取 HTTP_PROXY 环境变量，使用 hpagent

const axios = require('axios');

const KEY = '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';
const WORKER_ID = 'B-03';
const WORKER_NAME = '代理穿透';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: 系统代理穿透`);
  
  // 检测系统代理
  const proxyUrl = process.env.HTTP_PROXY || 
                   process.env.http_proxy || 
                   process.env.HTTPS_PROXY || 
                   process.env.https_proxy;
  
  console.log(`[${WORKER_ID}] 检测到系统代理: ${proxyUrl || '无'}`);
  
  try {
    const axiosConfig = {
      method: 'POST',
      url: 'https://api.openrouter.ai/api/v1/chat/completions',
      data: {
        model: 'zhipuai/glm-5',
        messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
        max_tokens: 5
      },
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'B-03-Test'
      },
      timeout: 15000,
      validateStatus: () => true,
    };
    
    // 如果有代理，配置 proxy
    if (proxyUrl) {
      console.log(`[${WORKER_ID}] 使用代理: ${proxyUrl}`);
      axiosConfig.proxy = false;  // 禁用默认代理，使用自定义
      
      // 解析代理 URL
      const proxyMatch = proxyUrl.match(/^(?:http:\/\/)?([^:]+):(\d+)$/);
      if (proxyMatch) {
        axiosConfig.proxy = {
          protocol: 'http',
          host: proxyMatch[1],
          port: parseInt(proxyMatch[2]),
        };
      }
    } else {
      console.log(`[${WORKER_ID}] 无系统代理，尝试直接连接`);
    }
    
    const response = await axios(axiosConfig);
    
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
