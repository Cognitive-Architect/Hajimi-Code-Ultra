/**
 * B-09 测试体系 - Pattern Loader (Fabric Loader) 单元测试
 * 
 * DEBT-013 清偿标记: 测试覆盖不足 → fabric-loader.test.ts 已创建
 * 
 * 测试项:
 * - FAB-001~005: Pattern 加载与渲染核心功能
 */

import {
  load,
  loadMany,
  render,
  loadAndRender,
  estimateTokens,
  getPatternInfo,
  LoadResult,
  RenderResult,
} from '@/patterns/loader';
import { Pattern, VariableDef, PatternType } from '@/patterns/types';
import { register, get, clear } from '@/patterns/registry';

// 默认配置
const defaultConfig = {
  tokenLimit: 1000,
  compressionRatio: 1,
  cacheEnabled: false,
  ttl: 3600,
};

describe('Fabric Loader (Pattern Loader)', () => {
  // 清理 registry 在每个测试之前
  beforeEach(() => {
    clear();
  });

  // ============================================================================
  // FAB-001: Pattern 验证与加载
  // ============================================================================
  describe('FAB-001: Pattern 验证与加载', () => {
    const validPattern: Pattern = {
      id: 'test-pattern',
      name: 'Test Pattern',
      type: PatternType.SYSTEM,
      description: 'A test pattern',
      template: 'Hello {{name}}!',
      variables: [
        { name: 'name', type: 'string', required: true },
      ],
      dependencies: [],
      config: defaultConfig,
      version: '1.0.0',
    };

    it('TEST-FAB-001-01: 应成功加载有效的 Pattern', () => {
      const result: LoadResult = load(validPattern);

      expect(result.success).toBe(true);
      expect(result.pattern).toBeDefined();
      expect(result.pattern!.id).toBe('test-pattern');
    });

    it('TEST-FAB-001-02: 应验证 Pattern ID 不能为空', () => {
      const invalidPattern = { ...validPattern, id: '' };
      const result: LoadResult = load(invalidPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('TEST-FAB-001-03: 应验证 Pattern 名称不能为空', () => {
      const invalidPattern = { ...validPattern, name: '' };
      const result: LoadResult = load(invalidPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('TEST-FAB-001-04: 应验证 Pattern 类型不能为空', () => {
      const invalidPattern = { ...validPattern, type: '' as any };
      const result: LoadResult = load(invalidPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('TEST-FAB-001-05: 应验证模板不能为空', () => {
      const invalidPattern = { ...validPattern, template: '' };
      const result: LoadResult = load(invalidPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });
  });

  // ============================================================================
  // FAB-002: 依赖检查
  // ============================================================================
  describe('FAB-002: 依赖检查', () => {
    const basePattern: Pattern = {
      id: 'base-pattern',
      name: 'Base Pattern',
      type: PatternType.SYSTEM,
      description: 'Base pattern for dependency testing',
      template: 'Base content',
      variables: [],
      dependencies: [],
      config: { ...defaultConfig, tokenLimit: 500 },
      version: '1.0.0',
    };

    const dependentPattern: Pattern = {
      id: 'dependent-pattern',
      name: 'Dependent Pattern',
      type: PatternType.SYSTEM,
      description: 'Pattern with dependencies',
      template: '{{base-pattern}} Extended',
      variables: [],
      dependencies: ['base-pattern'],
      config: { ...defaultConfig, tokenLimit: 1000 },
      version: '1.0.0',
    };

    it('TEST-FAB-002-01: 应先加载依赖 Pattern', () => {
      // 先加载基础 Pattern
      const baseResult = load(basePattern);
      expect(baseResult.success).toBe(true);

      // 再加载依赖 Pattern
      const dependentResult = load(dependentPattern);
      expect(dependentResult.success).toBe(true);
    });

    it('TEST-FAB-002-02: 缺少依赖时应失败', () => {
      // 直接加载依赖 Pattern，未加载基础 Pattern
      const result = load(dependentPattern);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Dependency check failed');
      expect(result.error).toContain('base-pattern');
    });

    it('TEST-FAB-002-03: loadMany 应批量加载多个 Pattern', () => {
      const patterns: Pattern[] = [
        { ...basePattern, id: 'pattern-1', name: 'Pattern 1' },
        { ...basePattern, id: 'pattern-2', name: 'Pattern 2' },
        { ...basePattern, id: 'pattern-3', name: 'Pattern 3' },
      ];

      const results = loadMany(patterns);

      expect(results.length).toBe(3);
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  // ============================================================================
  // FAB-003: 模板渲染
  // ============================================================================
  describe('FAB-003: 模板渲染', () => {
    const greetingPattern: Pattern = {
      id: 'greeting',
      name: 'Greeting Pattern',
      type: PatternType.SYSTEM,
      description: 'Simple greeting template',
      template: 'Hello {{name}}! Welcome to {{place}}.',
      variables: [
        { name: 'name', type: 'string', required: true },
        { name: 'place', type: 'string', required: true },
      ],
      dependencies: [],
      config: defaultConfig,
      version: '1.0.0',
    };

    beforeEach(() => {
      load(greetingPattern);
    });

    it('TEST-FAB-003-01: 应正确渲染模板变量', () => {
      const result: RenderResult = render('greeting', {
        name: 'Alice',
        place: 'Wonderland',
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Hello Alice! Welcome to Wonderland.');
    });

    it('TEST-FAB-003-02: 缺少必填变量时应失败', () => {
      const result: RenderResult = render('greeting', { name: 'Alice' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required variables');
    });

    it('TEST-FAB-003-03: 应支持直接传递 Pattern 对象渲染', () => {
      const inlinePattern: Pattern = {
        id: 'inline',
        name: 'Inline Pattern',
        type: PatternType.SYSTEM,
        description: 'Inline test',
        template: 'Value: {{value}}',
        variables: [{ name: 'value', type: 'number', required: true }],
        dependencies: [],
        config: { ...defaultConfig, tokenLimit: 100 },
        version: '1.0.0',
      };

      const result: RenderResult = render(inlinePattern, { value: 42 });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Value: 42');
    });

    it('TEST-FAB-003-04: 渲染不存在的 Pattern 应失败', () => {
      const result: RenderResult = render('non-existent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pattern not found');
    });

    it('TEST-FAB-003-05: 应支持异步加载并渲染', async () => {
      const asyncPattern: Pattern = {
        id: 'async-pattern',
        name: 'Async Pattern',
        type: PatternType.SYSTEM,
        description: 'Async test',
        template: 'Async: {{data}}',
        variables: [{ name: 'data', type: 'string', required: true }],
        dependencies: [],
        config: { ...defaultConfig, tokenLimit: 100 },
        version: '1.0.0',
      };
      load(asyncPattern);

      const result = await loadAndRender('async-pattern', { data: 'test' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Async: test');
    });
  });

  // ============================================================================
  // FAB-004: 变量默认值
  // ============================================================================
  describe('FAB-004: 变量默认值', () => {
    const defaultVarPattern: Pattern = {
      id: 'default-vars',
      name: 'Default Variables Pattern',
      type: PatternType.SYSTEM,
      description: 'Pattern with default values',
      template: 'Name: {{name}}, Role: {{role}}, Level: {{level}}',
      variables: [
        { name: 'name', type: 'string', required: true },
        { name: 'role', type: 'string', required: false, default: 'user' },
        { name: 'level', type: 'number', required: false, default: 1 },
      ],
      dependencies: [],
      config: defaultConfig,
      version: '1.0.0',
    };

    beforeEach(() => {
      load(defaultVarPattern);
    });

    it('TEST-FAB-004-01: 应使用提供的变量值', () => {
      const result = render('default-vars', {
        name: 'Bob',
        role: 'admin',
        level: 5,
      });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Name: Bob, Role: admin, Level: 5');
    });

    it('TEST-FAB-004-02: 未提供值时应使用默认值', () => {
      const result = render('default-vars', { name: 'Charlie' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Name: Charlie, Role: user, Level: 1');
    });

    it('TEST-FAB-004-03: 应返回使用的变量值', () => {
      const result = render('default-vars', {
        name: 'Dave',
        role: 'moderator',
      });

      expect(result.success).toBe(true);
      expect(result.variables).toEqual({
        name: 'Dave',
        role: 'moderator',
        level: 1,
      });
    });
  });

  // ============================================================================
  // FAB-005: Token 估算与 Pattern 信息
  // ============================================================================
  describe('FAB-005: Token 估算与 Pattern 信息', () => {
    const longPattern: Pattern = {
      id: 'long-pattern',
      name: 'Long Pattern',
      type: PatternType.SYSTEM,
      description: 'Pattern with long template',
      template: 'This is a very long template '.repeat(20),
      variables: [],
      dependencies: [],
      config: { ...defaultConfig, tokenLimit: 2000 },
      version: '1.0.0',
    };

    beforeEach(() => {
      load(longPattern);
    });

    it('TEST-FAB-005-01: 应正确估算 Token 数量', () => {
      const content = 'Hello world';
      const tokens = estimateTokens(content);

      // 简化估算：每4个字符约1个token
      expect(tokens).toBe(Math.ceil(content.length / 4));
    });

    it('TEST-FAB-005-02: 应返回已存在的 Pattern 信息', () => {
      const info = getPatternInfo('long-pattern');

      expect(info).not.toBeNull();
      expect(info!.exists).toBe(true);
      expect(info!.id).toBe('long-pattern');
      expect(info!.tokenLimit).toBe(2000);
      expect(info!.estimatedTokens).toBeDefined();
    });

    it('TEST-FAB-005-03: 应返回不存在的 Pattern 信息', () => {
      const info = getPatternInfo('non-existent-pattern');

      expect(info).not.toBeNull();
      expect(info!.exists).toBe(false);
      expect(info!.id).toBe('non-existent-pattern');
    });

    it('TEST-FAB-005-04: Token 估算应随内容长度变化', () => {
      const shortContent = 'Hi';
      const longContent = 'This is a much longer piece of text for testing';

      const shortTokens = estimateTokens(shortContent);
      const longTokens = estimateTokens(longContent);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });
  });

  // ============================================================================
  // 边界条件测试
  // ============================================================================
  describe('边界条件测试', () => {
    it('应处理空模板', () => {
      const emptyTemplatePattern: Pattern = {
        id: 'empty',
        name: 'Empty Template',
        type: PatternType.SYSTEM,
        description: 'Empty template test',
        template: '',
        variables: [],
        dependencies: [],
        config: defaultConfig,
        version: '1.0.0',
      };

      const result = load(emptyTemplatePattern);
      expect(result.success).toBe(false);
    });

    it('应处理特殊字符模板', () => {
      const specialPattern: Pattern = {
        id: 'special',
        name: 'Special Chars',
        type: PatternType.SYSTEM,
        description: 'Special characters test',
        template: 'Special: {{emoji}} 🎉',
        variables: [{ name: 'emoji', type: 'string', required: true }],
        dependencies: [],
        config: defaultConfig,
        version: '1.0.0',
      };

      load(specialPattern);
      const result = render('special', { emoji: '🚀' });

      expect(result.success).toBe(true);
      expect(result.content).toBe('Special: 🚀 🎉');
    });

    it('应处理嵌套变量', () => {
      const nestedPattern: Pattern = {
        id: 'nested',
        name: 'Nested Pattern',
        type: PatternType.SYSTEM,
        description: 'Nested variables test',
        template: 'User: {{user.name}}, Age: {{user.age}}',
        variables: [{ name: 'user', type: 'object', required: true }],
        dependencies: [],
        config: defaultConfig,
        version: '1.0.0',
      };

      load(nestedPattern);
      const result = render('nested', {
        user: { name: 'Test', age: 25 },
      });

      expect(result.success).toBe(true);
      // 对象会被转换为字符串
      expect(result.content).toContain('User:');
    });
  });
});
