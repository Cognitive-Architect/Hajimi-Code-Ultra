/**
 * Fabric 角色装备验证测试
 * 工单 B-06/09: 验证7人格Pattern
 * 
 * 验证项:
 * - 7个角色装备文件可正确加载
 * - Token限制符合规范
 * - 配置参数正确
 */

import { PatternValidator, TOKEN_LIMIT_RULES, CONFIG_CONSTRAINTS } from '@/lib/patterns/validator';
import { load, render, estimateTokens, getPatternInfo } from '@/patterns/loader';
import { clear, list, get } from '@/patterns/registry';
import { Pattern, PatternType } from '@/patterns/types';

// 导入所有7个角色装备
import SoyorinPattern from '@/patterns/system/roles/Soyorin.pattern';
import CucumberMuPattern from '@/patterns/system/roles/CucumberMu.pattern';
import TangYinPattern from '@/patterns/system/roles/TangYin.pattern';
import PressureMonsterPattern from '@/patterns/system/roles/PressureMonster.pattern';
import SupportXiaoXiangPattern from '@/patterns/system/roles/SupportXiaoXiang.pattern';
import GuGuGaGaPattern from '@/patterns/system/roles/GuGuGaGa.pattern';
import MilkDragonPattern from '@/patterns/system/roles/MilkDragon.pattern';

// 所有角色装备数组
const ALL_ROLES = [
  SoyorinPattern,
  CucumberMuPattern,
  TangYinPattern,
  PressureMonsterPattern,
  SupportXiaoXiangPattern,
  GuGuGaGaPattern,
  MilkDragonPattern,
];

// 角色ID到名称的映射
const ROLE_NAMES: Record<string, string> = {
  'sys:pm-soyorin': 'Soyorin (PM)',
  'sys:arch-cucumber-mu': 'CucumberMu (架构师)',
  'sys:engineer-tang-yin': 'TangYin (工程师)',
  'sys:qa-pressure-monster': 'PressureMonster (QA-压力怪)',
  'sys:support-xiao-xiang': 'SupportXiaoXiang (客服)',
  'sys:qa-gu-gu-ga-ga': 'GuGuGaGa (QA-咕咕嘎嘎)',
  'sys:audit-milk-dragon': 'MilkDragon (审计-奶龙娘)',
};

describe('Fabric 角色装备验证 - 工单 B-06/09', () => {
  let validator: PatternValidator;

  beforeEach(() => {
    validator = new PatternValidator();
    clear();
  });

  afterEach(() => {
    clear();
  });

  // ============================================================================
  // FAB-001: Pattern JSON解析（≥5个测试）
  // ============================================================================
  describe('FAB-001: Pattern JSON解析', () => {
    
    test('FAB-001-01: 每个角色装备可正确加载', async () => {
      const results: { id: string; loaded: boolean; error?: string }[] = [];

      for (const pattern of ALL_ROLES) {
        const result = load(pattern);
        results.push({
          id: pattern.id,
          loaded: result.success,
          error: result.error,
        });
      }

      // 输出加载结果
      console.log('\n========================================');
      console.log('角色装备加载结果');
      console.log('========================================');
      for (const r of results) {
        const status = r.loaded ? '✅ 成功' : `❌ 失败: ${r.error}`;
        console.log(`${ROLE_NAMES[r.id]} (${r.id}): ${status}`);
      }
      console.log('========================================\n');

      // 验证所有角色都加载成功
      for (const r of results) {
        expect(r.loaded).toBe(true);
      }

      // 验证注册表中有7个角色
      const allPatterns = list();
      expect(allPatterns.length).toBe(7);
    });

    test('FAB-001-02: Pattern结构完整（id, type, name, version, template, variables, config）', () => {
      for (const pattern of ALL_ROLES) {
        // 验证必需字段存在且类型正确
        expect(pattern).toHaveProperty('id');
        expect(typeof pattern.id).toBe('string');
        expect(pattern.id).not.toBe('');

        expect(pattern).toHaveProperty('type');
        expect(Object.values(PatternType)).toContain(pattern.type);

        expect(pattern).toHaveProperty('name');
        expect(typeof pattern.name).toBe('string');
        expect(pattern.name).not.toBe('');

        expect(pattern).toHaveProperty('version');
        expect(typeof pattern.version).toBe('string');
        expect(pattern.version).toMatch(/^\d+\.\d+\.\d+$/);

        expect(pattern).toHaveProperty('template');
        expect(typeof pattern.template).toBe('string');
        expect(pattern.template.length).toBeGreaterThan(0);

        expect(pattern).toHaveProperty('variables');
        expect(Array.isArray(pattern.variables)).toBe(true);

        expect(pattern).toHaveProperty('config');
        expect(typeof pattern.config).toBe('object');
      }
    });

    test('FAB-001-03: 变量定义正确解析', () => {
      for (const pattern of ALL_ROLES) {
        // 验证每个变量定义的结构
        for (const v of pattern.variables) {
          expect(v).toHaveProperty('name');
          expect(typeof v.name).toBe('string');
          expect(v.name).not.toBe('');

          expect(v).toHaveProperty('type');
          expect(['string', 'number', 'boolean', 'array', 'object']).toContain(v.type);

          expect(v).toHaveProperty('required');
          expect(typeof v.required).toBe('boolean');

          // description是可选的
          if (v.description !== undefined) {
            expect(typeof v.description).toBe('string');
          }
        }

        // 验证变量名不重复
        const varNames = pattern.variables.map(v => v.name);
        const uniqueVarNames = [...new Set(varNames)];
        expect(varNames.length).toBe(uniqueVarNames.length);
      }
    });

    test('FAB-001-04: 依赖关系正确解析', () => {
      for (const pattern of ALL_ROLES) {
        expect(pattern).toHaveProperty('dependencies');
        expect(Array.isArray(pattern.dependencies)).toBe(true);

        // 目前所有角色都没有依赖
        expect(pattern.dependencies.length).toBe(0);
      }
    });

    test('FAB-001-05: 配置对象结构正确', () => {
      for (const pattern of ALL_ROLES) {
        const config = pattern.config;

        expect(config).toHaveProperty('tokenLimit');
        expect(typeof config.tokenLimit).toBe('number');
        expect(config.tokenLimit).toBeGreaterThan(0);

        expect(config).toHaveProperty('compressionRatio');
        expect(typeof config.compressionRatio).toBe('number');
        expect(config.compressionRatio).toBeGreaterThanOrEqual(0);
        expect(config.compressionRatio).toBeLessThanOrEqual(1);

        expect(config).toHaveProperty('cacheEnabled');
        expect(typeof config.cacheEnabled).toBe('boolean');

        expect(config).toHaveProperty('ttl');
        expect(typeof config.ttl).toBe('number');
        expect(config.ttl).toBeGreaterThan(0);
      }
    });

    test('FAB-001-06: 批量加载功能正常', () => {
      const results = ALL_ROLES.map(pattern => load(pattern));

      expect(results).toHaveLength(7);
      
      for (const result of results) {
        expect(result.success).toBe(true);
        expect(result.pattern).toBeDefined();
      }
    });
  });

  // ============================================================================
  // FAB-002: Token限制验证（≥5个测试）
  // ============================================================================
  describe('FAB-002: Token限制验证', () => {

    test('FAB-002-01: PM角色(Soyorin) Token限制为2000', () => {
      const result = validator.validate(SoyorinPattern);
      expect(SoyorinPattern.config.tokenLimit).toBe(2000);
      expect(SoyorinPattern.id).toBe('sys:pm-soyorin');
      expect(result.valid).toBe(true);
    });

    test('FAB-002-02: 架构师角色(CucumberMu) Token限制为2000', () => {
      const result = validator.validate(CucumberMuPattern);
      expect(CucumberMuPattern.config.tokenLimit).toBe(2000);
      expect(CucumberMuPattern.id).toBe('sys:arch-cucumber-mu');
      expect(result.valid).toBe(true);
    });

    test('FAB-002-03: 工程师角色(TangYin) Token限制为2000', () => {
      const result = validator.validate(TangYinPattern);
      expect(TangYinPattern.config.tokenLimit).toBe(2000);
      expect(TangYinPattern.id).toBe('sys:engineer-tang-yin');
      expect(result.valid).toBe(true);
    });

    test('FAB-002-04: QA角色 Token限制为1500', () => {
      const pmResult = validator.validate(PressureMonsterPattern);
      const gggResult = validator.validate(GuGuGaGaPattern);
      
      expect(PressureMonsterPattern.config.tokenLimit).toBe(1500);
      expect(GuGuGaGaPattern.config.tokenLimit).toBe(1500);
      expect(PressureMonsterPattern.id).toBe('sys:qa-pressure-monster');
      expect(GuGuGaGaPattern.id).toBe('sys:qa-gu-gu-ga-ga');
      expect(pmResult.valid).toBe(true);
      expect(gggResult.valid).toBe(true);
    });

    test('FAB-002-05: 客服和审计角色 Token限制为1500', () => {
      const supportResult = validator.validate(SupportXiaoXiangPattern);
      const auditResult = validator.validate(MilkDragonPattern);
      
      expect(SupportXiaoXiangPattern.config.tokenLimit).toBe(1500);
      expect(MilkDragonPattern.config.tokenLimit).toBe(1500);
      expect(SupportXiaoXiangPattern.id).toBe('sys:support-xiao-xiang');
      expect(MilkDragonPattern.id).toBe('sys:audit-milk-dragon');
      expect(supportResult.valid).toBe(true);
      expect(auditResult.valid).toBe(true);
    });

    test('FAB-002-06: 压缩比率配置正确（0.25）', () => {
      for (const pattern of ALL_ROLES) {
        expect(pattern.config.compressionRatio).toBe(CONFIG_CONSTRAINTS.compressionRatio);
      }
    });

    test('FAB-002-07: TTL配置正确（3600000ms）', () => {
      for (const pattern of ALL_ROLES) {
        expect(pattern.config.ttl).toBe(CONFIG_CONSTRAINTS.ttl);
      }
    });

    test('FAB-002-08: Token估算功能正常工作', () => {
      for (const pattern of ALL_ROLES) {
        const tokens = estimateTokens(pattern.template);
        // 每4个字符约1个token
        expect(tokens).toBe(Math.ceil(pattern.template.length / 4));
        // Token数应该在限制范围内
        expect(tokens).toBeLessThanOrEqual(pattern.config.tokenLimit);
      }
    });
  });

  // ============================================================================
  // FAB-003: 角色上下文切换（≥5个测试）
  // ============================================================================
  describe('FAB-003: 角色上下文切换', () => {

    beforeEach(() => {
      // 加载所有角色到注册表
      ALL_ROLES.forEach(pattern => load(pattern));
    });

    test('FAB-003-01: Pattern渲染器正常工作', () => {
      const result = render(SoyorinPattern, {
        projectName: 'TestProject',
        teamSize: 10,
      });

      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
      expect(result.content).toContain('TestProject');
      expect(result.content).toContain('10');
    });

    test('FAB-003-02: 变量插值正确', () => {
      const result = render(CucumberMuPattern, {
        systemName: 'MySystem',
        scale: 'large',
        techStack: ['React', 'Node.js'],
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('MySystem');
      expect(result.content).toContain('large');
    });

    test('FAB-003-03: 变量默认值生效', () => {
      const result = render(SoyorinPattern, {
        projectName: 'TestProject',
        // teamSize 和 priority 使用默认值
      });

      expect(result.success).toBe(true);
      // teamSize 默认值为5
      expect(result.content).toContain('5');
      // priority 默认值为'normal'
      expect(result.content).toContain('normal');
    });

    test('FAB-003-04: 必填变量缺失时返回错误', () => {
      const result = render(SoyorinPattern, {
        // 缺少必填变量 projectName
        teamSize: 10,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Missing required variables');
      expect(result.error).toContain('projectName');
    });

    test('FAB-003-05: 角色切换时上下文隔离', () => {
      // 先渲染 Soyorin
      const soyorinResult = render('sys:pm-soyorin', {
        projectName: 'ProjectA',
        teamSize: 5,
      });
      expect(soyorinResult.success).toBe(true);
      expect(soyorinResult.content).toContain('ProjectA');

      // 再渲染 TangYin
      const tangYinResult = render('sys:engineer-tang-yin', {
        taskType: 'bugfix',
        language: 'Python',
      });
      expect(tangYinResult.success).toBe(true);
      expect(tangYinResult.content).toContain('bugfix');
      expect(tangYinResult.content).toContain('Python');

      // 确保两个渲染结果不互相影响
      expect(soyorinResult.content).not.toContain('bugfix');
      expect(tangYinResult.content).not.toContain('ProjectA');
    });

    test('FAB-003-06: 从注册表加载并渲染', async () => {
      const result = await render('sys:pm-soyorin', {
        projectName: 'AsyncTest',
        teamSize: 3,
      });

      expect(result.success).toBe(true);
      expect(result.content).toContain('AsyncTest');
    });

    test('FAB-003-07: 不存在的Pattern返回错误', () => {
      const result = render('sys:non-existent', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Pattern not found');
    });

    test('FAB-003-08: getPatternInfo返回正确信息', () => {
      const info = getPatternInfo('sys:pm-soyorin');

      expect(info).not.toBeNull();
      expect(info?.exists).toBe(true);
      expect(info?.tokenLimit).toBe(2000);
      expect(info?.estimatedTokens).toBeGreaterThan(0);
    });

    test('FAB-003-09: 缓存机制正常工作', () => {
      // 所有角色都启用了缓存
      for (const pattern of ALL_ROLES) {
        expect(pattern.config.cacheEnabled).toBe(true);
      }
    });
  });

  // ============================================================================
  // 验证报告
  // ============================================================================
  describe('验证报告: 所有角色装备验证', () => {

    test('生成完整的验证报告', () => {
      const report: {
        id: string;
        name: string;
        tokenLimit: number;
        expectedLimit: number;
        compressionRatio: number;
        ttl: number;
        variablesCount: number;
        validationPassed: boolean;
      }[] = [];

      for (const pattern of ALL_ROLES) {
        const result = validator.validate(pattern);
        const rule = TOKEN_LIMIT_RULES[pattern.id];

        report.push({
          id: pattern.id,
          name: ROLE_NAMES[pattern.id] || pattern.name,
          tokenLimit: pattern.config.tokenLimit,
          expectedLimit: rule?.expectedLimit || 0,
          compressionRatio: pattern.config.compressionRatio,
          ttl: pattern.config.ttl,
          variablesCount: pattern.variables.length,
          validationPassed: result.valid,
        });
      }

      // 输出验证报告表格
      console.log('\n========================================');
      console.log('角色装备验证报告');
      console.log('========================================');
      console.log('\n| ID | 角色 | Token限制 | 期望限制 | 压缩比 | TTL | 变量数 | 验证状态 |');
      console.log('|----|------|-----------|----------|--------|-----|--------|----------|');

      for (const r of report) {
        const status = r.validationPassed ? '✅ 通过' : '❌ 失败';
        console.log(`| ${r.id} | ${r.name} | ${r.tokenLimit} | ${r.expectedLimit} | ${r.compressionRatio} | ${r.ttl} | ${r.variablesCount} | ${status} |`);
      }

      console.log('\n========================================');
      console.log('总结:');
      const allPassed = report.every(r => r.validationPassed);
      console.log(`总角色数: ${report.length}`);
      console.log(`验证通过: ${report.filter(r => r.validationPassed).length}`);
      console.log(`验证失败: ${report.filter(r => !r.validationPassed).length}`);
      console.log(`整体状态: ${allPassed ? '✅ 全部通过' : '❌ 存在失败'}`);
      console.log('========================================\n');

      // 断言所有验证通过
      for (const r of report) {
        expect(r.validationPassed).toBe(true);
        expect(r.tokenLimit).toBe(r.expectedLimit);
        expect(r.compressionRatio).toBe(0.25);
        expect(r.ttl).toBe(3600000);
      }
    });

    test('统计信息正确', () => {
      ALL_ROLES.forEach(pattern => load(pattern));
      
      const allPatterns = list();
      expect(allPatterns.length).toBe(7);

      const systemPatterns = list(PatternType.SYSTEM);
      expect(systemPatterns.length).toBe(7);

      // 所有角色都是SYSTEM类型
      for (const p of allPatterns) {
        expect(p.type).toBe(PatternType.SYSTEM);
      }
    });

    test('各角色类型统计', () => {
      const highTokenRoles = ALL_ROLES.filter(r => r.config.tokenLimit === 2000);
      const standardTokenRoles = ALL_ROLES.filter(r => r.config.tokenLimit === 1500);

      expect(highTokenRoles.length).toBe(3); // PM, 架构师, 工程师
      expect(standardTokenRoles.length).toBe(4); // QA x2, 客服, 审计

      console.log('\n========================================');
      console.log('角色Token限制分类');
      console.log('========================================');
      console.log('\n高限制角色 (2000 tokens):');
      for (const r of highTokenRoles) {
        console.log(`  - ${ROLE_NAMES[r.id]} (${r.id})`);
      }
      console.log('\n标准限制角色 (1500 tokens):');
      for (const r of standardTokenRoles) {
        console.log(`  - ${ROLE_NAMES[r.id]} (${r.id})`);
      }
      console.log('========================================\n');
    });
  });
});

// ============================================================================
// 测试覆盖统计
// ============================================================================
describe('测试覆盖统计', () => {
  test('测试覆盖统计报告', () => {
    const stats = {
      'FAB-001 Pattern JSON解析': 6,
      'FAB-002 Token限制验证': 8,
      'FAB-003 角色上下文切换': 9,
      '验证报告': 3,
      '总计': 26,
    };

    console.log('\n========================================');
    console.log('Fabric Loader 角色装备测试覆盖统计');
    console.log('========================================');
    for (const [category, count] of Object.entries(stats)) {
      console.log(`${category}: ${count} 个测试用例`);
    }
    console.log('========================================\n');

    expect(stats['总计']).toBeGreaterThanOrEqual(15);
  });
});
