/**
 * CodeDoctor Pattern
 * 
 * 奶龙娘专属装备 - 代码诊断与修复
 * 
 * @pattern CodeDoctor
 * @role DOCTOR
 * @version 1.3.0
 */

import { Pattern } from '../types';

export const CodeDoctorPattern: Pattern = {
  name: 'CodeDoctor',
  version: '1.3.0',
  trigger: 'code_review',
  description: '奶龙娘代码诊断 - 自动检测代码问题并提供修复建议',
  role: 'DOCTOR',
  
  async action(context: unknown) {
    const { code, language } = context as { code: string; language: string };
    
    // 模拟代码诊断
    const issues: Array<{
      line: number;
      severity: 'error' | 'warning' | 'info';
      message: string;
      suggestion: string;
    }> = [];

    // 简单规则检查
    const lines = code.split('\n');
    lines.forEach((line, index) => {
      if (line.includes('console.log') && !line.includes('//')) {
        issues.push({
          line: index + 1,
          severity: 'warning',
          message: '发现未注释的console.log',
          suggestion: '移除调试日志或添加注释',
        });
      }
      if (line.length > 120) {
        issues.push({
          line: index + 1,
          severity: 'info',
          message: '行长度超过120字符',
          suggestion: '考虑换行或提取变量',
        });
      }
    });

    return {
      pattern: 'CodeDoctor',
      issues,
      summary: {
        total: issues.length,
        errors: issues.filter((i) => i.severity === 'error').length,
        warnings: issues.filter((i) => i.severity === 'warning').length,
      },
      easterEgg: '🐉 奶龙龙帮你检查完啦！',
    };
  },

  debts: [
    {
      id: 'FAB-CD-001',
      priority: 'P1',
      description: '集成真实ESLint/TSLint进行深度分析',
    },
  ],

  mutex: ['SecurityGuard'], // 与SecurityGuard互斥
  config: {
    maxLineLength: 120,
    enableAutoFix: false,
  },
};

export default CodeDoctorPattern;
