// B-04/07: Node-fetch 极简裸调 - 零 TLS 配置干扰
// 攻击方案: 最简 node-fetch，纯默认行为

const KEY = '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';
const WORKER_ID = 'B-04';
const WORKER_NAME = 'Node-fetch裸调';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: Node-fetch 极简裸调（零配置）`);
  
  try {
    let fetch;
    
    // 尝试多种方式加载 fetch
    try {
      // 方式1: 原生 fetch (Node 18+)
      fetch = globalThis.fetch;
      console.log(`[${WORKER_ID}] 使用原生 fetch`);
    } catch (e) {
      // 方式2: node-fetch 包
      const nodeFetch = await import('node-fetch');
      fetch = nodeFetch.default;
      console.log(`[${WORKER_ID}] 使用 node-fetch 包`);
    }
    
    const response = await fetch('https://api.openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://localhost',
        'X-Title': 'B-04-Test'
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-5',
        messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
        max_tokens: 5
      }),
      // 不设置任何 TLS 相关选项，完全默认
    });
    
    const body = await response.text();
    console.log(`[${WORKER_ID}] 响应状态: ${response.status}`);
    console.log(`[${WORKER_ID}] 响应体: ${body.substring(0, 200)}`);
    
  } catch (error) {
    console.log(`[${WORKER_ID}] 请求错误: ${error.message}`);
    if (error.cause) {
      console.log(`[${WORKER_ID}] 错误原因: ${error.cause.message || error.cause}`);
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
