/**
 * B-01/07: GLM-5 基础连通性测试（冒烟测试）
 * 
 * 角色: 🩵 咕咕嘎嘎
 * 预算: <0.01 USD
 * 
 * @debt DEBT-QUIN-GLM5-NOTFOUND-001 (若GLM-5未上线)
 */

import { test, expect } from '@playwright/test';

// 测试约束
const TEST_CONFIG = {
  model: 'zhipuai/glm-5',
  max_tokens: 100,
  temperature: 0,
  timeout: 3000, // 3秒超时
};

test.describe('B-01: GLM-5 基础连通性', () => {
  test.skip(!process.env.OPENROUTER_API_KEY, '未配置OPENROUTER_API_KEY，跳过');

  test('GLM-5返回200，响应时间<3s，内容非空', async () => {
    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hajimi-code-ultra.local',
        'X-Title': 'Hajimi-GLM5-Test-B01',
      },
      body: JSON.stringify({
        model: TEST_CONFIG.model,
        messages: [
          { role: 'system', content: 'You are a test assistant. Respond with exactly one word.' },
          { role: 'user', content: 'Respond with "pong" only' },
        ],
        max_tokens: TEST_CONFIG.max_tokens,
        temperature: TEST_CONFIG.temperature,
      }),
    });

    const latency = Date.now() - startTime;

    // 验证1: HTTP 200
    expect(response.status).toBe(200);

    // 验证2: 响应时间<3s
    expect(latency).toBeLessThan(3000);

    // 验证3: X-RateLimit-Remaining头存在
    const rateLimitRemaining = response.headers.get('x-ratelimit-remaining');
    expect(rateLimitRemaining).not.toBeNull();
    console.log(`✅ RateLimit剩余: ${rateLimitRemaining}`);

    // 验证4: 内容非空
    const data = await response.json();
    expect(data.choices).toBeDefined();
    expect(data.choices.length).toBeGreaterThan(0);
    
    const content = data.choices[0].message?.content || '';
    expect(content.length).toBeGreaterThan(0);
    console.log(`✅ 响应内容: "${content}" (耗时${latency}ms)`);

    // 验证5: 响应包含"pong"（不区分大小写）
    expect(content.toLowerCase()).toContain('pong');
  });

  test('GLM-5未上线时标记债务并测试GLM-4.7', async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-5', // 尝试GLM-5
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 10,
      }),
    });

    if (response.status === 404) {
      console.warn('⚠️ DEBT-QUIN-GLM5-NOTFOUND-001: GLM-5未上线，测试GLM-4.7');
      
      // Fallback到GLM-4.7
      const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'zhipuai/glm-4.7',
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 10,
        }),
      });

      expect(fallbackResponse.status).toBe(200);
      console.log('✅ GLM-4.7 fallback测试通过');
    } else {
      expect(response.status).toBe(200);
      console.log('✅ GLM-5已上线，无需债务标记');
    }
  });
});
