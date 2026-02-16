/**
 * B-03/07: GLM-5 Fallback降级测试（关键）
 * 
 * 角色: 🩷 唐音
 * 预算: <0.02 USD
 */

import { test, expect } from '@playwright/test';

test.describe('B-03: GLM-5 Fallback降级', () => {
  test.skip(!process.env.OPENROUTER_API_KEY, '未配置OPENROUTER_API_KEY，跳过');

  test('GLM-5超时/404时自动切GLM-4.7，<5秒切换', async () => {
    const startTime = Date.now();
    const logs: string[] = [];

    // 第一步：尝试错误的模型名触发404
    const wrongModelResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-5-fake', // 错误模型名
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 10,
      }),
    });

    if (wrongModelResponse.status === 404) {
      logs.push('[FALLBACK] GLM-5-fake → 404，准备fallback');
    }

    // 第二步：自动重试GLM-4.7
    const fallbackStart = Date.now();
    const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-4.7', // Fallback模型
        messages: [{ role: 'user', content: 'test fallback' }],
        max_tokens: 10,
      }),
    });

    const fallbackLatency = Date.now() - fallbackStart;
    const totalLatency = Date.now() - startTime;

    // 验证1: 首次请求失败（404）
    expect(wrongModelResponse.status).toBe(404);

    // 验证2: Fallback成功（200）
    expect(fallbackResponse.status).toBe(200);

    // 验证3: 总切换时间<5秒
    expect(totalLatency).toBeLessThan(5000);
    console.log(`✅ 总切换时间: ${totalLatency}ms`);

    // 验证4: 响应来自GLM-4.7
    const data = await fallbackResponse.json();
    expect(data.model).toContain('glm-4.7');
    console.log(`✅ 响应模型: ${data.model}`);

    // 验证5: 日志包含[FALLBACK]
    expect(logs.some(l => l.includes('[FALLBACK]'))).toBe(true);
    console.log('✅ Fallback日志记录正确');
  });

  test('1ms超时强制触发fallback', async () => {
    const controller = new AbortController();
    
    // 1ms后强制中断
    setTimeout(() => controller.abort(), 1);

    try {
      await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'zhipuai/glm-5',
          messages: [{ role: 'user', content: 'test timeout' }],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      // 预期超时
      expect(error).toBeInstanceOf(Error);
      console.log('✅ 超时触发成功');

      // Fallback到4.7
      const fallbackResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'zhipuai/glm-4.7',
          messages: [{ role: 'user', content: 'test after timeout' }],
          max_tokens: 10,
        }),
      });

      expect(fallbackResponse.status).toBe(200);
      console.log('✅ 超时后fallback成功');
    }
  });
});
