/**
 * Task Context Pattern - 任务上下文装备
 * 管理当前任务的状态和进度
 * 
 * @version 1.0.0
 * @module patterns/context/task-context
 */

import { ContextPattern, PatternType, ContextType, PatternVersion, TokenOptimization } from '../types';

const VERSION: PatternVersion = { major: 1, minor: 0, patch: 0 };

const TOKEN_OPT: TokenOptimization = {
  enabled: true,
  compressionRatio: 0.25,
  useAbbreviations: true,
  stripComments: true,
  minifyWhitespace: true,
};

export const TaskContextPattern: ContextPattern = {
  meta: {
    id: 'ctx:task',
    name: 'Task Context',
    description: '任务上下文装备，管理当前任务的状态、进度和元数据',
    version: VERSION,
    author: 'Fabric Team',
    tags: ['context', 'task', 'state'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.CONTEXT,
  contextType: ContextType.TASK,
  content: `# CTX:TASK
## INFO
ID:{{taskId}}|TYPE:{{taskType}}|PRIO:{{priority}}|STATUS:{{status}}

## DESC
{{description}}

## PROG
{{progress}}%|{{completedSteps}}/{{totalSteps}}

## DEPS
{{dependencies}}

## META
CREATED:{{createdAt}}|DEADLINE:{{deadline}}|ASSIGNED:{{assignee}}`,
  variables: [
    { name: 'taskId', type: 'string', required: true, description: '任务唯一标识' },
    { name: 'taskType', type: 'string', required: true, description: '任务类型' },
    { name: 'priority', type: 'string', required: false, defaultValue: 'medium', description: '优先级' },
    { name: 'status', type: 'string', required: false, defaultValue: 'pending', description: '任务状态' },
    { name: 'description', type: 'string', required: true, description: '任务描述' },
    { name: 'progress', type: 'number', required: false, defaultValue: 0, description: '进度百分比' },
    { name: 'completedSteps', type: 'number', required: false, defaultValue: 0, description: '已完成步骤' },
    { name: 'totalSteps', type: 'number', required: false, defaultValue: 1, description: '总步骤数' },
    { name: 'dependencies', type: 'array', required: false, defaultValue: [], description: '依赖任务' },
    { name: 'createdAt', type: 'string', required: false, description: '创建时间' },
    { name: 'deadline', type: 'string', required: false, description: '截止时间' },
    { name: 'assignee', type: 'string', required: false, description: '负责人' },
  ],
  fragments: [
    {
      type: ContextType.TASK,
      content: '当前任务上下文',
      priority: 10,
      ttl: 3600,
    },
  ],
  maxTokens: 500,
  evictionPolicy: 'priority',
  tokenOpt: TOKEN_OPT,
  dependencies: [],
};

export default TaskContextPattern;
