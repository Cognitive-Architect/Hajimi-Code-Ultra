/**
 * B-05/07: GLM-5 长文本压力测试
 * 
 * 角色: 🩷 唐音
 * 预算: <0.02 USD
 */

import { test, expect } from '@playwright/test';

// 生成2K tokens的测试文本
const generateLongText = (targetTokens: number): string => {
  // 每个token约4个字符
  const targetChars = targetTokens * 4;
  const paragraph = `Hajimi Code Ultra是一个基于七权人格化架构的Agent协作系统。
    系统包含Alice鼠标追踪器、Quintant服务标准化接口、TSA状态机引擎、
    治理引擎、API权限层和Fabric装备库等模块。每个模块都有明确的功能边界和债务声明。
    系统采用Blue Sechi风格设计，支持七人主题切换和错误码彩蛋。`;
  
  const repeatCount = Math.ceil(targetChars / paragraph.length);
  return paragraph.repeat(repeatCount).slice(0, targetChars);
};

test.describe('B-05: GLM-5 长文本压力', () => {
  test.skip(!process.env.OPENROUTER_API_KEY, '未配置OPENROUTER_API_KEY，跳过');

  test('2K tokens输入，输出完整不断尾，无504错误', async () => {
    const longText = generateLongText(2000);
    console.log(`📄 输入长度: ${longText.length}字符 (约${Math.floor(longText.length/4)}tokens)`);

    const startTime = Date.now();

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-5',
        messages: [
          { 
            role: 'system', 
            content: 'You are a helpful assistant. Summarize the following text concisely.' 
          },
          { 
            role: 'user', 
            content: `请总结以下文本:\n\n${longText}` 
          },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    const latency = Date.now() - startTime;

    // 验证1: 无504错误
    expect(response.status).not.toBe(504);
    expect(response.status).toBe(200);
    console.log(`✅ 无504错误，HTTP ${response.status}`);

    // 验证2: 总耗时<10秒
    expect(latency).toBeLessThan(10000);
    console.log(`✅ 总耗时: ${latency}ms (<10s)`);

    // 验证3: 响应完整（无...截断）
    const data = await response.json();
    const content = data.choices[0].message?.content || '';
    
    expect(content.length).toBeGreaterThan(10);
    expect(content).not.toContain('...');
    expect(content).not.toContain('…');
    console.log(`✅ 响应完整，长度: ${content.length}字符`);

    // 验证4: finish_reason=stop（非length）
    expect(data.choices[0].finish_reason).toBe('stop');
    console.log('✅ finish_reason=stop（非截断）');
  });

  test('GLM-4.7作为fallback支持长文本', async () => {
    const longText = generateLongText(1500);

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'zhipuai/glm-4.7',
        messages: [
          { role: 'user', content: `Summarize:\n\n${longText}` },
        ],
        max_tokens: 300,
      }),
    });

    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data.choices[0].finish_reason).toBe('stop');
    console.log('✅ GLM-4.7长文本支持正常');
  });
});
