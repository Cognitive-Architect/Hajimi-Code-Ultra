/**
 * HAJIMI VIRTUALIZED - BNF协议解析器测试
 * 
 * 自测项:
 * - PROTO-001: SPAWN解析
 * - PROTO-002: TERMINATE解析
 * - PROTO-003: VACUUM语法
 * - PROTO-004: 错误处理
 */

import { BNFParser } from '@/lib/virtualized/protocol/bnf-parser';
import { ProtocolError } from '@/lib/virtualized/types';

describe('BNF Protocol Parser', () => {
  let parser: BNFParser;

  beforeEach(() => {
    parser = new BNFParser();
  });

  describe('[PROTO-001] SPAWN解析', () => {
    it('应解析基本SPAWN', () => {
      const cmd = parser.parseLine('[SPAWN:agent-001]');
      
      expect(cmd.type).toBe('SPAWN');
      expect(cmd.params[0]).toBe('agent-001');
    });

    it('应解析带RETRY的SPAWN', () => {
      const cmd = parser.parseLine('[SPAWN:agent-001:RETRY:5]');
      
      expect(cmd.params).toEqual(['agent-001', 'RETRY', '5']);
    });

    it('应拒绝无效SPAWN格式', () => {
      expect(() => parser.parseLine('[SPAWN]')).toThrow(ProtocolError);
    });
  });

  describe('[PROTO-002] TERMINATE解析', () => {
    it('应解析TERMINATE', () => {
      const cmd = parser.parseLine('[TERMINATE:agent-001:DONE]');
      
      expect(cmd.type).toBe('TERMINATE');
      expect(cmd.params[0]).toBe('agent-001');
    });

    it('应拒绝无ID的TERMINATE', () => {
      expect(() => parser.parseLine('[TERMINATE]')).toThrow(ProtocolError);
    });
  });

  describe('[PROTO-003] VACUUM语法', () => {
    it('应解析VACUUM ALL', () => {
      const cmd = parser.parseLine('[VACUUM:ALL]');
      
      expect(cmd.type).toBe('VACUUM');
      expect(cmd.params[0]).toBe('ALL');
    });

    it('应解析VACUUM TERMINATED', () => {
      const cmd = parser.parseLine('[VACUUM:TERMINATED]');
      
      expect(cmd.params[0]).toBe('TERMINATED');
    });

    it('应拒绝无效scope', () => {
      expect(() => parser.parseLine('[VACUUM:INVALID]')).toThrow(ProtocolError);
    });
  });

  describe('[PROTO-004] 错误处理', () => {
    it('应提供行号定位', () => {
      try {
        parser.parse('Line 1\n[INVALID]\nLine 3');
      } catch (error) {
        expect(error).toBeInstanceOf(ProtocolError);
        expect((error as ProtocolError).line).toBe(2);
      }
    });

    it('应在10ms内完成解析', () => {
      const input = '[SPAWN:agent-001]\n'.repeat(100);
      
      const start = performance.now();
      parser.parse(input);
      const elapsed = performance.now() - start;
      
      expect(elapsed).toBeLessThan(10);
    });

    it('应验证命令有效性', () => {
      expect(parser.validate('[SPAWN:test]')).toBe(true);
      expect(parser.validate('invalid')).toBe(false);
      expect(parser.validate('[UNKNOWN:test]')).toBe(false);
    });
  });

  describe('LIFECYCLE命令', () => {
    it('应解析LIFECYCLE', () => {
      const cmd = parser.parseLine('[LIFECYCLE:RUNNING]');
      
      expect(cmd.type).toBe('LIFECYCLE');
    });

    it('应验证生命周期状态', () => {
      expect(() => parser.parseLine('[LIFECYCLE:INVALID]')).toThrow(ProtocolError);
    });
  });
});
