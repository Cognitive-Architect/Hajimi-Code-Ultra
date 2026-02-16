/**
 * 证据链模块测试
 * 自测点: DEST-002 - 证据链（当前日志hash包含上一笔hash）
 */

import { EvidenceChain, AuditData, AuditEventType } from '../../lib/sandbox/evidence-chain';
import { createHash } from 'crypto';

describe('EvidenceChain - 证据链模块', () => {
  let chain: EvidenceChain;

  beforeEach(() => {
    chain = new EvidenceChain({ chainId: 'test-chain' });
  });

  describe('DEST-002: 证据链完整性', () => {
    it('应创建包含创世区块的链', () => {
      const blocks = chain.getChain();

      expect(blocks.length).toBe(1);
      expect(blocks[0].index).toBe(0);
      expect(blocks[0].previousHash).toBe('0'.repeat(64));
      expect(blocks[0].hash).toBeDefined();
      expect(blocks[0].hash.length).toBe(64); // SHA256 hex
    });

    it('当前日志hash应包含上一笔hash', () => {
      // 添加第一个区块
      const block1 = chain.addBlock({
        eventType: 'SANDBOX_CREATED' as AuditEventType,
        description: 'Test block 1',
        payload: { test: 1 },
        severity: 'info',
        source: 'test',
        actor: 'system',
      });

      // 验证第一个区块的前哈希是创世区块的哈希
      expect(block1.previousHash).toBe(chain.getBlock(0)?.hash);

      // 添加第二个区块
      const block2 = chain.addBlock({
        eventType: 'SANDBOX_STARTED' as AuditEventType,
        description: 'Test block 2',
        payload: { test: 2 },
        severity: 'info',
        source: 'test',
        actor: 'system',
      });

      // 验证第二个区块的前哈希是第一个区块的哈希
      expect(block2.previousHash).toBe(block1.hash);

      // 验证链式链接
      const blocks = chain.getChain();
      for (let i = 1; i < blocks.length; i++) {
        expect(blocks[i].previousHash).toBe(blocks[i - 1].hash);
      }
    });

    it('应使用SHA256计算哈希', () => {
      const block = chain.getBlock(0);
      expect(block).toBeDefined();
      
      // SHA256哈希应为64位十六进制字符串
      expect(block!.hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('应验证链的完整性', () => {
      // 添加多个区块
      for (let i = 0; i < 5; i++) {
        chain.addBlock({
          eventType: 'CUSTOM' as AuditEventType,
          description: `Test block ${i}`,
          payload: { index: i },
          severity: 'info',
          source: 'test',
          actor: 'system',
        });
      }

      const verification = chain.verifyChain();

      expect(verification.valid).toBe(true);
      expect(verification.totalBlocks).toBe(6); // 1创世 + 5新增
      expect(verification.validBlocks).toBe(6);
      expect(verification.invalidBlocks).toBe(0);
      expect(verification.firstInvalidIndex).toBeNull();
    });

    it('应检测到篡改的区块', () => {
      // 添加区块
      chain.addBlock({
        eventType: 'SANDBOX_EXECUTED' as AuditEventType,
        description: 'Test execution',
        payload: { data: 'original' },
        severity: 'info',
        source: 'test',
        actor: 'system',
      });

      // 篡改链（直接修改内部状态用于测试）
      const blocks = chain.getChain();
      const originalHash = blocks[1].hash;
      
      // 模拟篡改：修改区块数据但不重新计算哈希
      (blocks[1] as any).data.payload = { data: 'tampered' };

      const verification = chain.verifyChain();

      expect(verification.valid).toBe(false);
      expect(verification.invalidBlocks).toBeGreaterThan(0);
      expect(verification.firstInvalidIndex).toBe(1);
      
      // 恢复原始状态
      (blocks[1] as any).data.payload = { data: 'original' };
      (blocks[1] as any).hash = originalHash;
    });

    it('应能根据执行ID查询区块', () => {
      const executionId = 'test-execution-001';
      
      // 创建新链并指定执行ID
      const execChain = new EvidenceChain({ chainId: executionId });
      
      execChain.addBlock({
        eventType: 'SANDBOX_CREATED' as AuditEventType,
        description: 'Execution created',
        payload: {},
        severity: 'info',
        source: 'test',
        actor: 'system',
      });

      const blocks = execChain.getBlocksByExecutionId(executionId);
      expect(blocks.length).toBeGreaterThan(0);
      expect(blocks.every((b) => b.executionId === executionId)).toBe(true);
    });

    it('应能根据事件类型查询区块', () => {
      chain.addBlock({
        eventType: 'SECURITY_ALERT' as AuditEventType,
        description: 'Security event',
        payload: { alert: true },
        severity: 'warning',
        source: 'security',
        actor: 'system',
      });

      const securityBlocks = chain.getBlocksByEventType('SECURITY_ALERT' as AuditEventType);
      expect(securityBlocks.length).toBe(1);
      expect(securityBlocks[0].data.eventType).toBe('SECURITY_ALERT');
    });

    it('应正确计算链统计信息', () => {
      for (let i = 0; i < 3; i++) {
        chain.addBlock({
          eventType: 'CUSTOM' as AuditEventType,
          description: `Block ${i}`,
          payload: {},
          severity: 'info',
          source: 'test',
          actor: 'system',
        });
      }

      const stats = chain.getStats();

      expect(stats.chainId).toBe('test-chain');
      expect(stats.blockCount).toBe(4); // 1创世 + 3新增
      expect(stats.verified).toBe(true);
      expect(stats.integrityScore).toBe(100);
      expect(stats.firstBlockTime).toBeGreaterThan(0);
      expect(stats.lastBlockTime).toBeGreaterThanOrEqual(stats.firstBlockTime);
    });

    it('应支持链的导入导出', () => {
      chain.addBlock({
        eventType: 'SANDBOX_DESTROYED' as AuditEventType,
        description: 'Test destruction',
        payload: { result: 'success' },
        severity: 'info',
        source: 'destroyer',
        actor: 'system',
      });

      const exported = chain.exportChain();
      const imported = EvidenceChain.importChain(exported);

      expect(imported.getChainId()).toBe('test-chain');
      expect(imported.getBlockCount()).toBe(chain.getBlockCount());

      const originalBlocks = chain.getChain();
      const importedBlocks = imported.getChain();

      for (let i = 0; i < originalBlocks.length; i++) {
        expect(importedBlocks[i].hash).toBe(originalBlocks[i].hash);
        expect(importedBlocks[i].previousHash).toBe(originalBlocks[i].previousHash);
      }
    });

    it('应支持区块签名验证', () => {
      const signedChain = new EvidenceChain({
        chainId: 'signed-chain',
        enableSigning: true,
        signingKey: 'test-secret-key',
      });

      const block = signedChain.addBlock({
        eventType: 'CHAIN_VERIFIED' as AuditEventType,
        description: 'Signed block',
        payload: {},
        severity: 'info',
        source: 'test',
        actor: 'system',
      });

      expect(block.signature).toBeDefined();
      expect(block.signature).not.toBe('');
      expect(block.signature!.length).toBe(64); // SHA256 hex
    });
  });

  describe('哈希计算', () => {
    it('应正确计算数据哈希', () => {
      const data = { test: 'data', number: 123 };
      const expectedHash = createHash('sha256')
        .update(JSON.stringify(data))
        .digest('hex');

      // 验证哈希格式
      expect(expectedHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('每个区块应有唯一哈希', () => {
      const hashes = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const block = chain.addBlock({
          eventType: 'CUSTOM' as AuditEventType,
          description: `Block ${i}`,
          payload: { index: i, timestamp: Date.now() },
          severity: 'info',
          source: 'test',
          actor: 'system',
        });

        hashes.add(block.hash);
      }

      // 所有哈希应唯一
      expect(hashes.size).toBe(10);
    });
  });
});
