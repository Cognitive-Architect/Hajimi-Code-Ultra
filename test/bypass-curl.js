// B-06/07: 子进程 Curl 逃逸 - 让 Windows 原生 curl 去调
// 攻击方案: child_process.spawn('curl.exe')，绕过 Node TLS

const { spawn } = require('child_process');

const KEY = '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';
const WORKER_ID = 'B-06';
const WORKER_NAME = 'Curl逃逸';

async function main() {
  console.log(`[${WORKER_ID}] 尝试连接: ${new Date().toISOString()}`);
  console.log(`[${WORKER_ID}] 使用方案: 子进程 Curl 逃逸（绕过 Node TLS）`);
  
  return new Promise((resolve) => {
    // 构建 curl 命令参数
    const args = [
      '-k',                    // 忽略证书验证
      '-v',                    // 详细输出
      '-X', 'POST',            // POST 方法
      '-H', 'Content-Type: application/json',
      '-H', `Authorization: Bearer ${KEY}`,
      '-H', 'HTTP-Referer: https://localhost',
      '-H', 'X-Title: B-06-Test',
      '-d', JSON.stringify({
        model: 'zhipuai/glm-5',
        messages: [{ role: 'user', content: `ping from ${WORKER_ID}` }],
        max_tokens: 5
      }),
      '--max-time', '15',      // 超时
      '--connect-timeout', '10',
      'https://api.openrouter.ai/api/v1/chat/completions'
    ];
    
    console.log(`[${WORKER_ID}] 执行: curl.exe ${args.join(' ')}`);
    
    // 优先尝试 curl.exe，如果不存在则尝试 curl
    const curlCmd = 'curl';
    const proc = spawn(curlCmd, args, {
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      console.log(`[${WORKER_ID}] curl 退出码: ${code}`);
      
      if (stdout) {
        console.log(`[${WORKER_ID}] 标准输出:`);
        console.log(stdout.substring(0, 500));
      }
      
      if (stderr) {
        console.log(`[${WORKER_ID}] 标准错误:`);
        console.log(stderr.substring(0, 500));
      }
      
      // 尝试解析响应
      try {
        const response = JSON.parse(stdout);
        console.log(`[${WORKER_ID}] JSON 解析成功:`, response.id || '无ID');
      } catch (e) {
        // 不是 JSON，可能是错误页面或调试信息
      }
      
      console.log(`[${WORKER_ID}] OpenRouter 记录检查: 请手动查看 Logs 页面`);
      resolve();
    });
    
    proc.on('error', (err) => {
      console.log(`[${WORKER_ID}] curl 启动失败: ${err.message}`);
      console.log(`[${WORKER_ID}] OpenRouter 记录检查: 请手动查看 Logs 页面`);
      resolve();
    });
  });
}

main().catch(e => {
  console.log(`[${WORKER_ID}] 未捕获错误: ${e.message}`);
});
