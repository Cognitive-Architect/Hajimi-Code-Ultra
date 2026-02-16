/**
 * B-08 Patterns Context测试 - Task Context Pattern
 * 
 * 覆盖率目标: Patterns Context≥70%
 * @cov COV-003
 */

import { TaskContextPattern } from '@/patterns/context/task-context';
import { PatternType, ContextType } from '@/patterns/types';

describe('TaskContextPattern (COV-003)', () => {
  /**
   * 测试: Pattern基本结构完整
   */
  it('should have complete pattern structure', () => {
    expect(TaskContextPattern).toBeDefined();
    expect(TaskContextPattern.meta).toBeDefined();
    expect(TaskContextPattern.type).toBe(PatternType.CONTEXT);
    expect(TaskContextPattern.contextType).toBe(ContextType.TASK);
  });

  /**
   * 测试: 元数据正确
   */
  it('should have correct metadata', () => {
    const { meta } = TaskContextPattern;
    
    expect(meta.id).toBe('ctx:task');
    expect(meta.name).toBe('Task Context');
    expect(meta.description).toContain('任务');
    expect(meta.author).toBe('Fabric Team');
    expect(meta.tags).toContain('context');
    expect(meta.tags).toContain('task');
    expect(meta.tags).toContain('state');
    expect(meta.version).toEqual({ major: 1, minor: 0, patch: 0 });
  });

  /**
   * 测试: 模板内容正确
   */
  it('should have correct template content', () => {
    const { content } = TaskContextPattern;
    
    expect(content).toContain('# CTX:TASK');
    expect(content).toContain('{{taskId}}');
    expect(content).toContain('{{taskType}}');
    expect(content).toContain('{{priority}}');
    expect(content).toContain('{{status}}');
    expect(content).toContain('{{description}}');
    expect(content).toContain('{{progress}}');
    expect(content).toContain('{{completedSteps}}');
    expect(content).toContain('{{totalSteps}}');
    expect(content).toContain('{{dependencies}}');
    expect(content).toContain('{{createdAt}}');
    expect(content).toContain('{{deadline}}');
    expect(content).toContain('{{assignee}}');
  });

  /**
   * 测试: 变量定义完整
   */
  it('should have complete variable definitions', () => {
    const { variables } = TaskContextPattern;
    
    expect(variables).toHaveLength(12);
    
    // 必需变量
    const taskIdVar = variables.find(v => v.name === 'taskId');
    expect(taskIdVar).toBeDefined();
    expect(taskIdVar?.required).toBe(true);
    expect(taskIdVar?.type).toBe('string');
    
    const taskTypeVar = variables.find(v => v.name === 'taskType');
    expect(taskTypeVar).toBeDefined();
    expect(taskTypeVar?.required).toBe(true);
    expect(taskTypeVar?.type).toBe('string');
    
    const descriptionVar = variables.find(v => v.name === 'description');
    expect(descriptionVar).toBeDefined();
    expect(descriptionVar?.required).toBe(true);
    expect(descriptionVar?.type).toBe('string');
    
    // 可选变量
    const priorityVar = variables.find(v => v.name === 'priority');
    expect(priorityVar).toBeDefined();
    expect(priorityVar?.required).toBe(false);
    expect(priorityVar?.defaultValue).toBe('medium');
    
    const statusVar = variables.find(v => v.name === 'status');
    expect(statusVar).toBeDefined();
    expect(statusVar?.required).toBe(false);
    expect(statusVar?.defaultValue).toBe('pending');
    
    // 进度变量
    const progressVar = variables.find(v => v.name === 'progress');
    expect(progressVar).toBeDefined();
    expect(progressVar?.type).toBe('number');
    expect(progressVar?.defaultValue).toBe(0);
    
    const completedStepsVar = variables.find(v => v.name === 'completedSteps');
    expect(completedStepsVar).toBeDefined();
    expect(completedStepsVar?.type).toBe('number');
    expect(completedStepsVar?.defaultValue).toBe(0);
    
    const totalStepsVar = variables.find(v => v.name === 'totalSteps');
    expect(totalStepsVar).toBeDefined();
    expect(totalStepsVar?.type).toBe('number');
    expect(totalStepsVar?.defaultValue).toBe(1);
    
    // 依赖变量
    const dependenciesVar = variables.find(v => v.name === 'dependencies');
    expect(dependenciesVar).toBeDefined();
    expect(dependenciesVar?.type).toBe('array');
    expect(dependenciesVar?.defaultValue).toEqual([]);
    
    // 元数据变量
    const createdAtVar = variables.find(v => v.name === 'createdAt');
    expect(createdAtVar).toBeDefined();
    expect(createdAtVar?.type).toBe('string');
    
    const deadlineVar = variables.find(v => v.name === 'deadline');
    expect(deadlineVar).toBeDefined();
    expect(deadlineVar?.type).toBe('string');
    
    const assigneeVar = variables.find(v => v.name === 'assignee');
    expect(assigneeVar).toBeDefined();
    expect(assigneeVar?.type).toBe('string');
  });

  /**
   * 测试: 片段定义完整
   */
  it('should have fragments defined', () => {
    const { fragments } = TaskContextPattern;
    
    expect(fragments).toHaveLength(1);
    expect(fragments![0].type).toBe(ContextType.TASK);
    expect(fragments![0].content).toBe('当前任务上下文');
    expect(fragments![0].priority).toBe(10);
    expect(fragments![0].ttl).toBe(3600);
  });

  /**
   * 测试: Token限制
   */
  it('should have max tokens configured', () => {
    expect(TaskContextPattern.maxTokens).toBe(500);
  });

  /**
   * 测试: 驱逐策略
   */
  it('should have priority eviction policy', () => {
    expect(TaskContextPattern.evictionPolicy).toBe('priority');
  });

  /**
   * 测试: Token优化配置
   */
  it('should have token optimization configured', () => {
    const { tokenOpt } = TaskContextPattern;
    
    expect(tokenOpt).toBeDefined();
    expect(tokenOpt?.enabled).toBe(true);
    expect(tokenOpt?.compressionRatio).toBe(0.25);
  });

  /**
   * 测试: 依赖定义
   */
  it('should have no dependencies', () => {
    const { dependencies } = TaskContextPattern;
    
    expect(dependencies).toEqual([]);
  });

  /**
   * 测试: 模板使用任务专用分隔符
   */
  it('should use task-specific section separators', () => {
    const { content } = TaskContextPattern;
    
    expect(content).toContain('## INFO');
    expect(content).toContain('## DESC');
    expect(content).toContain('## PROG');
    expect(content).toContain('## DEPS');
    expect(content).toContain('## META');
  });

  /**
   * 测试: INFO部分包含任务标识信息
   */
  it('should include task identification in INFO section', () => {
    const { content } = TaskContextPattern;
    
    expect(content).toContain('ID:');
    expect(content).toContain('TYPE:');
    expect(content).toContain('PRIO:');
    expect(content).toContain('STATUS:');
  });

  /**
   * 测试: PROG部分包含进度信息
   */
  it('should include progress in PROG section', () => {
    const { content } = TaskContextPattern;
    
    expect(content).toContain('{{progress}}%');
    expect(content).toContain('{{completedSteps}}/{{totalSteps}}');
  });

  /**
   * 测试: 优先级默认值
   */
  it('should default priority to medium', () => {
    const priorityVar = TaskContextPattern.variables.find(v => v.name === 'priority');
    expect(priorityVar?.defaultValue).toBe('medium');
  });

  /**
   * 测试: 状态默认值
   */
  it('should default status to pending', () => {
    const statusVar = TaskContextPattern.variables.find(v => v.name === 'status');
    expect(statusVar?.defaultValue).toBe('pending');
  });

  /**
   * 测试: 进度默认值
   */
  it('should default progress to 0', () => {
    const progressVar = TaskContextPattern.variables.find(v => v.name === 'progress');
    expect(progressVar?.defaultValue).toBe(0);
  });

  /**
   * 测试: 步骤默认值
   */
  it('should default steps correctly', () => {
    const completedVar = TaskContextPattern.variables.find(v => v.name === 'completedSteps');
    const totalVar = TaskContextPattern.variables.find(v => v.name === 'totalSteps');
    
    expect(completedVar?.defaultValue).toBe(0);
    expect(totalVar?.defaultValue).toBe(1);
  });

  /**
   * 测试: TTL设置（任务上下文需要持久）
   */
  it('should have long TTL for task context', () => {
    const { fragments } = TaskContextPattern;
    
    // 任务上下文TTL应该较长（1小时）
    expect(fragments![0].ttl).toBe(3600);
  });

  /**
   * 测试: 优先级设置（任务上下文优先级最高）
   */
  it('should have highest priority for task context', () => {
    const { fragments } = TaskContextPattern;
    
    // 任务上下文优先级应该最高
    expect(fragments![0].priority).toBe(10);
  });

  /**
   * 测试: 必需变量检查
   */
  it('should have correct required variables', () => {
    const { variables } = TaskContextPattern;
    
    const requiredVars = variables.filter(v => v.required);
    expect(requiredVars).toHaveLength(3);
    
    const requiredNames = requiredVars.map(v => v.name);
    expect(requiredNames).toContain('taskId');
    expect(requiredNames).toContain('taskType');
    expect(requiredNames).toContain('description');
  });

  /**
   * 测试: 任务依赖数组类型
   */
  it('should have array type for dependencies', () => {
    const depsVar = TaskContextPattern.variables.find(v => v.name === 'dependencies');
    expect(depsVar?.type).toBe('array');
    expect(depsVar?.defaultValue).toEqual([]);
  });

  /**
   * 测试: META部分包含时间信息
   */
  it('should include timing info in META section', () => {
    const { content } = TaskContextPattern;
    
    expect(content).toContain('CREATED:');
    expect(content).toContain('DEADLINE:');
    expect(content).toContain('ASSIGNED:');
  });

  /**
   * 测试: 上下文类型正确
   */
  it('should be TASK context type', () => {
    expect(TaskContextPattern.contextType).toBe(ContextType.TASK);
    expect(TaskContextPattern.type).toBe(PatternType.CONTEXT);
  });

  /**
   * 测试: 与其他Context Pattern对比
   */
  it('should have highest priority among context patterns', () => {
    // 任务上下文应该有最高的优先级
    expect(TaskContextPattern.maxTokens).toBe(500);
    expect(TaskContextPattern.fragments![0].priority).toBe(10);
    expect(TaskContextPattern.fragments![0].ttl).toBe(3600);
  });
});
