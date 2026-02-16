/**
 * B-02/07: GLM-5 流式SSE响应测试
 * 
 * 角色: 🩵 咕咕嘎嘎
 * 预算: <0.01 USD
 */

import { test, expect } from '@playwright/test';

test.describe('B-02: GLM-5 流式SSE响应', () => {
  test.skip(!process.env.OPENROUTER_API_KEY, '未配置OPENROUTER_API_KEY，跳过');

  test('SSE分片正常接收，finish_reason=stop', async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-5',
        messages: [{ role: 'user', content: 'Count from 1 to 5, one number per line' }],
        max_tokens: 200,
        stream: true, // 启用SSE
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const chunks: string[] = [];
    let done = false;

    while (!done) {
      const result = await reader!.read();
      done = result.done;
      
      if (result.value) {
        const text = new TextDecoder().decode(result.value);
        chunks.push(text);
      }
    }

    // 验证1: 至少收到3个SSE分片
    const fullText = chunks.join('');
    const sseEvents = fullText.split('\n\n').filter(e => e.startsWith('data:'));
    expect(sseEvents.length).toBeGreaterThanOrEqual(3);
    console.log(`✅ 收到${sseEvents.length}个SSE分片`);

    // 验证2: 每个分片包含choices[0].delta.content
    let hasDeltaContent = false;
    for (const event of sseEvents) {
      if (event.includes('"delta"') && event.includes('"content"')) {
        hasDeltaContent = true;
        break;
      }
    }
    expect(hasDeltaContent).toBe(true);
    console.log('✅ SSE分片包含delta.content字段');

    // 验证3: 最后发送[DONE]
    expect(fullText).toContain('[DONE]');
    console.log('✅ SSE流正常结束（[DONE]标记）');

    // 验证4: 包含finish_reason=stop
    expect(fullText).toContain('"finish_reason":"stop"');
    console.log('✅ finish_reason=stop');
  });
});
