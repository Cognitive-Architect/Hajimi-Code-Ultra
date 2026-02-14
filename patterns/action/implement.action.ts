/**
 * Implement Action Pattern - 实现动作装备
 * 执行代码实现的标准流程
 * 
 * @version 1.0.0
 * @module patterns/action/implement
 */

import { ActionPattern, PatternType, ActionType, PatternVersion, TokenOptimization } from '../types';

const VERSION: PatternVersion = { major: 1, minor: 0, patch: 0 };

const TOKEN_OPT: TokenOptimization = {
  enabled: true,
  compressionRatio: 0.25,
  useAbbreviations: true,
  stripComments: true,
  minifyWhitespace: true,
};

export const ImplementActionPattern: ActionPattern = {
  meta: {
    id: 'act:implement',
    name: 'Implement Action',
    description: '实现动作装备，执行代码实现和开发任务',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['action', 'implement', 'coding'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.ACTION,
  actionType: ActionType.IMPLEMENT,
  content: `# ACT:IMPLEMENT
## REQ
{{requirements}}

## SPEC
{{specification}}

## CTX
{{context}}`,
  variables: [
    { name: 'requirements', type: 'string', required: true, description: '需求描述' },
    { name: 'specification', type: 'string', required: false, description: '技术规范' },
    { name: 'context', type: 'string', required: false, description: '上下文信息' },
    { name: 'language', type: 'string', required: false, defaultValue: 'typescript', description: '编程语言' },
    { name: 'constraints', type: 'array', required: false, defaultValue: [], description: '约束条件' },
  ],
  steps: [
    {
      id: 'impl-1',
      name: '需求理解',
      description: '深入理解需求和约束',
      prompt: '分析需求：1)功能需求 2)非功能需求 3)约束条件 4)验收标准',
      validation: '必须明确所有需求点',
    },
    {
      id: 'impl-2',
      name: '方案设计',
      description: '设计实现方案',
      prompt: '设计方案：1)整体架构 2)模块划分 3)接口定义 4)数据流',
      validation: '方案必须满足所有需求',
    },
    {
      id: 'impl-3',
      name: '代码实现',
      description: '编写代码实现',
      prompt: '编写代码：1)遵循编码规范 2)添加必要注释 3)处理边界情况 4)保证可读性',
      validation: '代码必须通过语法检查',
    },
    {
      id: 'impl-4',
      name: '自测验证',
      description: '进行自测验证',
      prompt: '自测：1)功能验证 2)边界测试 3)异常处理 4)代码审查',
      validation: '所有测试用例必须通过',
    },
  ],
  preconditions: [
    '需求已明确',
    '技术规范已确定',
  ],
  postconditions: [
    '代码已实现',
    '自测已通过',
  ],
  timeout: 300000,
  tokenOpt: TOKEN_OPT,
  dependencies: ['act:analyze', 'ctx:task'],
};

export default ImplementActionPattern;
