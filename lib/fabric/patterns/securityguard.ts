/**
 * SecurityGuard Pattern
 * 
 * 压力怪专属装备 - 安全审计
 * 
 * @pattern SecurityGuard
 * @role AUDIT
 * @version 1.3.0
 */

import { Pattern } from '../types';

export const SecurityGuardPattern: Pattern = {
  name: 'SecurityGuard',
  version: '1.3.0',
  trigger: 'security_audit',
  description: '压力怪安全审计 - 检测安全漏洞和风险',
  role: 'AUDIT',
  
  async action(context: unknown) {
    const { code, dependencies } = context as { code: string; dependencies: string[] };
    
    const risks: Array<{
      type: 'vulnerability' | 'secret' | 'permission';
      severity: 'critical' | 'high' | 'medium' | 'low';
      message: string;
      location?: string;
    }> = [];

    // 检测硬编码密钥
    if (code.match(/api[_-]?key\s*[=:]\s*['"][^'"]{10,}['"]/i)) {
      risks.push({
        type: 'secret',
        severity: 'critical',
        message: '发现疑似硬编码API密钥',
      });
    }

    // 检测SQL注入风险
    if (code.match(/query\s*\(.*\+.*\)/)) {
      risks.push({
        type: 'vulnerability',
        severity: 'high',
        message: '发现潜在的SQL注入风险',
      });
    }

    // 检测危险依赖
    const dangerousDeps = ['eval', 'child_process', 'fs'];
    for (const dep of dependencies || []) {
      if (dangerousDeps.some((d) => dep.includes(d))) {
        risks.push({
          type: 'permission',
          severity: 'medium',
          message: `使用潜在危险依赖: ${dep}`,
        });
      }
    }

    return {
      pattern: 'SecurityGuard',
      risks,
      score: Math.max(0, 100 - risks.length * 10),
      passed: risks.filter((r) => r.severity === 'critical').length === 0,
      easterEgg: '哈？这种代码也想通过审核？',
    };
  },

  debts: [
    {
      id: 'FAB-SG-001',
      priority: 'P2',
      description: '集成OWASP依赖检查',
    },
  ],

  mutex: ['CodeDoctor'],
  config: {
    enableSecretScan: true,
    enableVulnCheck: true,
  },
};

export default SecurityGuardPattern;
