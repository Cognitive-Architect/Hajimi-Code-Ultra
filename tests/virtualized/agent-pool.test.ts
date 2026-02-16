/**
 * HAJIMI VIRTUALIZED - VirtualAgentPool测试
 * 
 * 自测项:
 * - VIRT-001: Agent实例化测试
 * - VIRT-002: BNF解析测试
 * - VIRT-003: 上下文隔离测试
 * - ISOL-003: 污染率<5%模拟测试
 */

import { VirtualAgentPool, BNFParser, VirtualAgent } from '@/lib/virtualized/agent-pool';
import { ProtocolError } from '@/lib/virtualized/types';

describe('VirtualAgentPool', () => {
  let pool: VirtualAgentPool;

  beforeEach(() => {
    pool = new VirtualAgentPool();
  });

  afterEach(() => {
    pool.clear();
  });

  describe('[VIRT-001] Agent实例化测试', () => {
    it('应成功创建Agent实例', () => {
      const agent = pool.spawnAgent('test-agent-001');
      
      expect(agent).toBeDefined();
      expect(agent.id).toBe('test-agent-001');
      expect(agent.state).toBe('RUNNING');
      expect(agent.contextBoundary).toBeDefined();
      expect(agent.contextBoundary.startsWith('sha256:')).toBe(true);
    });

    it('应支持自定义重试次数', () => {
      const agent = pool.spawnAgent('test-agent-002', 5);
      
      expect(agent.retryLimit).toBe(5);
      expect(agent.retryCount).toBe(0);
    });

    it('应抛出错误当Agent已存在', () => {
      pool.spawnAgent('duplicate-id');
      
      expect(() => pool.spawnAgent('duplicate-id')).toThrow('already exists');
    });

    it('应终止Agent实例', () => {
      pool.spawnAgent('terminate-test');
      
      pool.terminateAgent('terminate-test', 'TEST_TERMINATION');
      
      const agent = pool.getAgent('terminate-test');
      expect(agent?.state).toBe('TERMINATED');
    });
  });

  describe('[VIRT-002] BNF解析测试', () => {
    let parser: BNFParser;

    beforeEach(() => {
      parser = new BNFParser();
    });

    it('应解析SPAWN命令', () => {
      const commands = parser.parse('[SPAWN:agent-001]');
      
      expect(commands).toHaveLength(1);
      expect(commands[0].type).toBe('SPAWN');
      expect(commands[0].params).toEqual(['agent-001']);
    });

    it('应解析带RETRY的SPAWN命令', () => {
      const commands = parser.parse('[SPAWN:agent-001:RETRY:3]');
      
      expect(commands[0].params).toEqual(['agent-001', 'RETRY', '3']);
    });

    it('应解析TERMINATE命令', () => {
      const commands = parser.parse('[TERMINATE:agent-001:TEST_REASON]');
      
      expect(commands[0].type).toBe('TERMINATE');
    });

    it('应解析VACUUM命令', () => {
      const commands = parser.parse('[VACUUM:ALL]');
      
      expect(commands[0].type).toBe('VACUUM');
    });

    it('应解析多行命令', () => {
      const input = `[SPAWN:agent-001]
[SPAWN:agent-002]
[TERMINATE:agent-001:DONE]`;
      
      const commands = parser.parse(input);
      
      expect(commands).toHaveLength(3);
    });

    it('应跳过注释和空行', () => {
      const input = `# This is a comment
[SPAWN:agent-001]

[TERMINATE:agent-001:DONE]`;
      
      const commands = parser.parse(input);
      
      expect(commands).toHaveLength(2);
    });

    it('应抛出ProtocolError当命令格式无效', () => {
      expect(() => parser.parse('INVALID_COMMAND')).toThrow(ProtocolError);
    });

    it('应抛出ProtocolError当命令类型未知', () => {
      expect(() => parser.parse('[UNKNOWN:param]')).toThrow(ProtocolError);
    });

    it('应支持validate方法', () => {
      expect(parser.validate('[SPAWN:test]')).toBe(true);
      expect(parser.validate('invalid')).toBe(false);
    });
  });

  describe('[VIRT-003] 上下文隔离测试', () => {
    it('应为不同Agent生成不同边界', () => {
      const agent1 = pool.spawnAgent('agent-1');
      const agent2 = pool.spawnAgent('agent-2');
      
      expect(agent1.contextBoundary).not.toBe(agent2.contextBoundary);
    });

    it('应支持通过BNF执行命令', () => {
      pool.executeBNF('[SPAWN:bnf-agent-001:RETRY:3]');
      
      const agent = pool.getAgent('bnf-agent-001');
      expect(agent).toBeDefined();
      expect(agent?.retryLimit).toBe(3);
    });
  });

  describe('[ISOL-003] 污染率<5%模拟测试', () => {
    it('应生成隔离报告', () => {
      pool.spawnAgent('iso-test-1');
      pool.spawnAgent('iso-test-2');
      pool.spawnAgent('iso-test-3');
      
      const report = pool.getIsolationReport();
      
      expect(report.totalAgents).toBe(3);
      expect(report.activeAgents).toBe(3);
      expect(report.contaminationRate).toBeLessThan(0.05); // <5%
      expect(report.pValue).toBeLessThan(0.017);
    });

    it('应检测潜在污染', () => {
      // 创建多个Agent，由于随机边界，污染率应很低
      for (let i = 0; i < 10; i++) {
        pool.spawnAgent(`iso-agent-${i}`);
      }
      
      const report = pool.getIsolationReport();
      
      expect(report.contaminationRate).toBeLessThan(0.05);
      expect(report.isValid).toBe(true);
    });
  });

  describe('Agent生命周期', () => {
    it('应支持暂停和恢复', () => {
      const agent = pool.spawnAgent('lifecycle-test');
      
      expect(agent.state).toBe('RUNNING');
      
      agent.pause();
      expect(agent.state).toBe('PAUSED');
      
      agent.resume();
      expect(agent.state).toBe('RUNNING');
    });

    it('应支持重试', () => {
      const agent = pool.spawnAgent('retry-test', 3);
      
      expect(agent.retry()).toBe(true); // 第1次
      expect(agent.retry()).toBe(true); // 第2次
      expect(agent.retry()).toBe(true); // 第3次
      expect(agent.retry()).toBe(false); // 超过限制
      expect(agent.retryCount).toBe(3);
    });

    it('应生成快照', () => {
      const agent = pool.spawnAgent('snapshot-test');
      
      const snapshot = agent.snapshot();
      
      expect(snapshot.id).toBe('snapshot-test');
      expect(snapshot.state).toBe('RUNNING');
      expect(snapshot.contextBoundary).toBe(agent.contextBoundary);
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });
  });

  describe('VACUUM清理', () => {
    it('应清理已终止的Agent', () => {
      pool.spawnAgent('vacuum-1');
      pool.spawnAgent('vacuum-2');
      pool.terminateAgent('vacuum-1', 'TEST');
      
      const count = pool.vacuum('TERMINATED');
      
      expect(count).toBe(1);
      expect(pool.getAgent('vacuum-1')).toBeUndefined();
      expect(pool.getAgent('vacuum-2')).toBeDefined();
    });

    it('应支持清理所有Agent', () => {
      pool.spawnAgent('vacuum-all-1');
      pool.spawnAgent('vacuum-all-2');
      
      const count = pool.vacuum('ALL');
      
      expect(count).toBe(2);
      expect(pool.agents.size).toBe(0);
    });
  });
});
