/**
 * Fabric装备库单元测试
 * 
 * FAB-001~005
 */

import { FabricLoader } from '../../lib/fabric';
import {
  CodeDoctorPattern,
  SecurityGuardPattern,
  PerformanceTunerPattern,
  DocsWriterPattern,
  DebtCollectorPattern,
} from '../../lib/fabric';

describe('FAB-001: 5个标准Pattern', () => {
  test('CodeDoctorPattern存在', () => {
    expect(CodeDoctorPattern.name).toBe('CodeDoctor');
    expect(CodeDoctorPattern.role).toBe('DOCTOR');
    expect(typeof CodeDoctorPattern.action).toBe('function');
  });

  test('SecurityGuardPattern存在', () => {
    expect(SecurityGuardPattern.name).toBe('SecurityGuard');
    expect(SecurityGuardPattern.role).toBe('AUDIT');
    expect(typeof SecurityGuardPattern.action).toBe('function');
  });

  test('PerformanceTunerPattern存在', () => {
    expect(PerformanceTunerPattern.name).toBe('PerformanceTuner');
    expect(PerformanceTunerPattern.role).toBe('ARCHITECT');
    expect(typeof PerformanceTunerPattern.action).toBe('function');
  });

  test('DocsWriterPattern存在', () => {
    expect(DocsWriterPattern.name).toBe('DocsWriter');
    expect(DocsWriterPattern.role).toBe('QA');
    expect(typeof DocsWriterPattern.action).toBe('function');
  });

  test('DebtCollectorPattern存在', () => {
    expect(DebtCollectorPattern.name).toBe('DebtCollector');
    expect(DebtCollectorPattern.role).toBe('PM');
    expect(typeof DebtCollectorPattern.action).toBe('function');
  });
});

describe('FAB-002: Pattern Schema验证', () => {
  let loader: FabricLoader;

  beforeEach(() => {
    loader = new FabricLoader();
  });

  test('有效Pattern可加载', () => {
    const result = loader.load(CodeDoctorPattern);
    expect(result.success).toBe(true);
  });

  test('无效Pattern被拒绝', () => {
    const invalidPattern = { ...CodeDoctorPattern, name: '' };
    const result = loader.load(invalidPattern as any);
    expect(result.success).toBe(false);
  });

  test('每个Pattern包含debt声明', () => {
    expect(CodeDoctorPattern.debts).toBeDefined();
    expect(CodeDoctorPattern.debts.length).toBeGreaterThan(0);
    expect(CodeDoctorPattern.debts[0].id).toMatch(/FAB-/);
  });
});

describe('FAB-003: 热插拔机制', () => {
  let loader: FabricLoader;

  beforeEach(() => {
    loader = new FabricLoader({ hotReload: true });
    loader.load(CodeDoctorPattern);
  });

  afterEach(() => {
    loader.clear();
  });

  test('可加载Pattern', () => {
    expect(loader.get('CodeDoctor')).toBeDefined();
  });

  test('可卸载Pattern', () => {
    loader.unload('CodeDoctor');
    expect(loader.get('CodeDoctor')).toBeUndefined();
  });

  test('可热重载Pattern', () => {
    const newPattern = { ...CodeDoctorPattern, version: '2.0.0' };
    const result = loader.hotReload('CodeDoctor', newPattern);
    
    expect(result.success).toBe(true);
    expect(loader.get('CodeDoctor')?.pattern.version).toBe('2.0.0');
  });
});

describe('FAB-004: 装备与七权角色映射', () => {
  let loader: FabricLoader;

  beforeEach(() => {
    loader = new FabricLoader();
    // 单独加载每个Pattern以避免互斥
  });

  afterEach(() => {
    loader.clear();
  });

  test('CodeDoctor映射到DOCTOR', () => {
    loader.load(CodeDoctorPattern);
    const doctor = loader.getByRole('DOCTOR');
    expect(doctor.some((e) => e.pattern.name === 'CodeDoctor')).toBe(true);
  });

  test('SecurityGuard映射到AUDIT', () => {
    loader.load(SecurityGuardPattern);
    const audit = loader.getByRole('AUDIT');
    expect(audit.some((e) => e.pattern.name === 'SecurityGuard')).toBe(true);
  });

  test('PerformanceTuner映射到ARCHITECT', () => {
    loader.load(PerformanceTunerPattern);
    const architect = loader.getByRole('ARCHITECT');
    expect(architect.some((e) => e.pattern.name === 'PerformanceTuner')).toBe(true);
  });

  test('DocsWriter映射到QA', () => {
    loader.load(DocsWriterPattern);
    const qa = loader.getByRole('QA');
    expect(qa.some((e) => e.pattern.name === 'DocsWriter')).toBe(true);
  });

  test('DebtCollector映射到PM', () => {
    loader.load(DebtCollectorPattern);
    const pm = loader.getByRole('PM');
    expect(pm.some((e) => e.pattern.name === 'DebtCollector')).toBe(true);
  });
});

describe('FAB-005: 装备组合冲突检测', () => {
  let loader: FabricLoader;

  beforeEach(() => {
    loader = new FabricLoader();
  });

  afterEach(() => {
    loader.clear();
  });

  test('CodeDoctor和SecurityGuard互斥', () => {
    loader.load(CodeDoctorPattern);
    
    const result = loader.load(SecurityGuardPattern);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Mutually exclusive');
  });

  test('检测同名冲突', () => {
    loader.load(CodeDoctorPattern);
    
    const result = loader.load(CodeDoctorPattern);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Duplicate');
  });

  test('无冲突Pattern可共存', () => {
    expect(loader.load(PerformanceTunerPattern).success).toBe(true);
    expect(loader.load(DocsWriterPattern).success).toBe(true);
    expect(loader.load(DebtCollectorPattern).success).toBe(true);
  });
});

describe('FAB-DEBT: 债务声明', () => {
  test('所有Pattern包含DEBT声明', () => {
    const patterns = [
      CodeDoctorPattern,
      SecurityGuardPattern,
      PerformanceTunerPattern,
      DocsWriterPattern,
      DebtCollectorPattern,
    ];

    for (const pattern of patterns) {
      expect(pattern.debts).toBeDefined();
      expect(pattern.debts.length).toBeGreaterThan(0);
    }
  });
});
