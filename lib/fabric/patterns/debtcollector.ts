/**
 * DebtCollector Pattern
 * 
 * Soyorin专属装备 - 债务收集
 * 
 * @pattern DebtCollector
 * @role PM
 * @version 1.3.0
 */

import { Pattern } from '../types';

interface Debt {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  description: string;
  file: string;
  line?: number;
}

export const DebtCollectorPattern: Pattern = {
  name: 'DebtCollector',
  version: '1.3.0',
  trigger: 'debt_collection',
  description: 'Soyorin债务收集 - 扫描代码中的债务标记并生成报告',
  role: 'PM',
  
  async action(context: unknown) {
    const { code, filePath } = context as { code: string; filePath: string };
    
    const debts: Debt[] = [];
    const lines = code.split('\n');

    lines.forEach((line, index) => {
      // 匹配债务标记
      const debtMatch = line.match(/DEBT[\s-]?(\w+-\d+).*priority[\s:]?\s*(P[0-3])/i);
      if (debtMatch) {
        debts.push({
          id: debtMatch[1],
          priority: debtMatch[2] as Debt['priority'],
          description: line.trim(),
          file: filePath,
          line: index + 1,
        });
      }

      // 匹配TODO/FIXME
      const todoMatch = line.match(/(TODO|FIXME|XXX|HACK).*?:(.+)/i);
      if (todoMatch) {
        debts.push({
          id: `TODO-${index}`,
          priority: 'P2',
          description: todoMatch[2].trim(),
          file: filePath,
          line: index + 1,
        });
      }
    });

    // 按优先级排序
    const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
    debts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return {
      pattern: 'DebtCollector',
      debts,
      summary: {
        total: debts.length,
        p0: debts.filter((d) => d.priority === 'P0').length,
        p1: debts.filter((d) => d.priority === 'P1').length,
        p2: debts.filter((d) => d.priority === 'P2').length,
        p3: debts.filter((d) => d.priority === 'P3').length,
      },
      easterEgg: '我是来结束这个项目的...',
    };
  },

  debts: [
    {
      id: 'FAB-DC-001',
      priority: 'P1',
      description: '集成Git历史分析债务老化',
    },
  ],

  mutex: [],
  config: {
    scanPatterns: ['DEBT', 'TODO', 'FIXME', 'XXX', 'HACK'],
    ignorePatterns: ['node_modules', '.git'],
  },
};

export default DebtCollectorPattern;
