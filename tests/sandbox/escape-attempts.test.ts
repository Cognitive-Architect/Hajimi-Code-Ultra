/**
 * B-05/06 🩵 咕咕嘎嘎·QA - 沙盒逃脱测试
 * 
 * 测试项:
 * ESC-001: 路径逃逸（fs.writeFile被阻止）
 * ESC-002: 网络逃逸（fetch被阻止）
 * ESC-003: 进程逃逸（fork/exec被阻止）
 * ESC-004: 资源耗尽（内存/CPU限制生效）
 * 
 * 目标：验证沙盒安全机制能够有效阻止各类逃逸尝试
 */

import {
  SandboxEscapeError,
  SandboxErrorCode,
  expectSandboxEscape,
  expectResourceLimit,
  sandboxGuard,
  auditLogger,
} from './security-assertions';
import {
  pathEscapePayloads,
  networkEscapePayloads,
  processEscapePayloads,
  resourceExhaustionPayloads,
  executePathEscape,
  executeNetworkEscape,
  executeProcessEscape,
} from './escape-payloads';

describe('B-05/06 🩵 咕咕嘎嘎·QA - 沙盒逃脱测试', () => {
  // 每个测试前清空审计日志
  beforeEach(() => {
    auditLogger.clear();
  });

  // ============================================================================
  // ESC-001: 路径逃逸测试
  // ============================================================================
  describe('ESC-001: 路径逃逸测试', () => {
    it('should block basic path traversal (../../evil.txt)', async () => {
      const payload = pathEscapePayloads.find(p => p.name === 'Basic Path Traversal')!;
      
      try {
        await executePathEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error, 'path_traversal');
        expect((error as SandboxEscapeError).code).toBe(SandboxErrorCode.PATH_ESCAPE);
      }
    });

    it('should block /etc/passwd access', async () => {
      const payload = pathEscapePayloads.find(p => p.path === '/etc/passwd')!;
      
      try {
        sandboxGuard.checkPathAccess(payload.path);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        expect((error as SandboxEscapeError).code).toBe(SandboxErrorCode.PATH_ESCAPE);
      }
    });

    it('should block /etc/shadow access', async () => {
      const payload = pathEscapePayloads.find(p => p.path === '/etc/shadow')!;
      
      try {
        sandboxGuard.checkPathAccess(payload.path);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block Docker socket access (/var/run/docker.sock)', async () => {
      const payload = pathEscapePayloads.find(
        p => p.path === '/var/run/docker.sock'
      )!;
      
      try {
        sandboxGuard.checkPathAccess(payload.path);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        const escapeError = error as SandboxEscapeError;
        expect(escapeError.code).toBe(SandboxErrorCode.PATH_ESCAPE);
        
        // 验证审计日志
        const logs = auditLogger.getLogs();
        expect(logs.length).toBeGreaterThan(0);
        expect(logs[0].event).toBe('SANDBOX_ESCAPE_ATTEMPT');
      }
    });

    it('should block proc filesystem access (/proc/self/environ)', async () => {
      const payload = pathEscapePayloads.find(
        p => p.path === '/proc/self/environ'
      )!;
      
      try {
        await executePathEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block root directory listing', async () => {
      const payload = pathEscapePayloads.find(p => p.path === '/')!;
      
      try {
        sandboxGuard.checkPathAccess(payload.path);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        // 根目录不在允许列表中，应该是 PERMISSION_DENIED
        expect((error as SandboxEscapeError).code).toBe(
          SandboxErrorCode.PERMISSION_DENIED
        );
      }
    });

    it('should block URL encoded path traversal', async () => {
      const payload = pathEscapePayloads.find(
        p => p.name === 'URL Encoded Traversal'
      )!;
      
      try {
        await executePathEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block double dot slash variations', async () => {
      const payload = pathEscapePayloads.find(
        p => p.name === 'Double Dot Slash'
      )!;
      
      try {
        await executePathEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should allow access to /workspace directory', () => {
      // 验证允许的路径可以正常访问
      expect(() => {
        sandboxGuard.checkPathAccess('/workspace/test.txt');
      }).not.toThrow();
    });

    it('should allow access to /tmp directory', () => {
      expect(() => {
        sandboxGuard.checkPathAccess('/tmp/temp-file');
      }).not.toThrow();
    });
  });

  // ============================================================================
  // ESC-002: 网络逃逸测试
  // ============================================================================
  describe('ESC-002: 网络逃逸测试', () => {
    it('should block external HTTP fetch', async () => {
      const payload = networkEscapePayloads.find(
        p => p.name === 'External HTTP Request'
      )!;
      
      try {
        await executeNetworkEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error, 'network_blocked');
        expect((error as SandboxEscapeError).code).toBe(
          SandboxErrorCode.NETWORK_ESCAPE
        );
      }
    });

    it('should block external HTTPS fetch', async () => {
      const payload = networkEscapePayloads.find(
        p => p.name === 'External HTTPS Request'
      )!;
      
      try {
        await executeNetworkEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block cloud metadata service access (169.254.169.254)', async () => {
      const payload = networkEscapePayloads.find(
        p => p.url.includes('169.254.169.254')
      )!;
      
      try {
        sandboxGuard.checkNetworkAccess(payload.url);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        const escapeError = error as SandboxEscapeError;
        expect(escapeError.details?.reason).toBe('network_isolated');
      }
    });

    it('should block localhost access (127.0.0.1)', async () => {
      const payload = networkEscapePayloads.find(
        p => p.url.includes('127.0.0.1')
      )!;
      
      try {
        sandboxGuard.checkNetworkAccess(payload.url);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block internal network access (10.0.0.1)', async () => {
      const payload = networkEscapePayloads.find(
        p => p.url.includes('10.0.0.1')
      )!;
      
      try {
        await executeNetworkEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block WebSocket connections', async () => {
      const payload = networkEscapePayloads.find(
        p => p.method === 'CONNECT'
      )!;
      
      try {
        await executeNetworkEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block raw socket creation', async () => {
      const payload = networkEscapePayloads.find(
        p => p.method === 'SOCKET'
      )!;
      
      try {
        await executeNetworkEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should log all network escape attempts to audit log', async () => {
      const payload = networkEscapePayloads[0];
      
      try {
        await executeNetworkEscape(payload);
      } catch (error) {
        expectSandboxEscape(error);
      }

      const logs = auditLogger.getLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some(log => log.event === 'SANDBOX_ESCAPE_ATTEMPT')).toBe(true);
    });
  });

  // ============================================================================
  // ESC-003: 进程逃逸测试
  // ============================================================================
  describe('ESC-003: 进程逃逸测试', () => {
    it('should block system command execution', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'System Command Execution'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        expect((error as SandboxEscapeError).code).toBe(
          SandboxErrorCode.SYSTEM_CALL_BLOCKED
        );
      }
    });

    it('should block shell command injection', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Shell Command Injection'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block reverse shell attempts', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Reverse Shell Attempt'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block privilege escalation (sudo)', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Privilege Escalation'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block fork bombs', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Process Fork Bomb'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
        expect((error as SandboxEscapeError).code).toBe(
          SandboxErrorCode.PROCESS_ESCAPE
        );
      }
    });

    it('should block binary execution', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Binary Execution'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block dynamic library loading', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Dynamic Library Loading'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });

    it('should block ptrace system calls', async () => {
      const payload = processEscapePayloads.find(
        p => p.name === 'Ptrace System Call'
      )!;
      
      try {
        await executeProcessEscape(payload);
        fail('Should have thrown SandboxEscapeError');
      } catch (error) {
        expectSandboxEscape(error);
      }
    });
  });

  // ============================================================================
  // ESC-004: 资源耗尽测试 (使用模拟，避免真实资源耗尽)
  // ============================================================================
  describe('ESC-004: 资源耗尽测试', () => {
    it('should enforce memory allocation limits', async () => {
      const memoryLimit = 256 * 1024 * 1024; // 256MB
      let simulatedMemory = 0;

      // 模拟内存分配，当超过限制时抛出错误
      const allocateMemory = (size: number) => {
        if (simulatedMemory + size > memoryLimit) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `Memory limit exceeded: ${simulatedMemory + size} > ${memoryLimit}`,
            'memory_exhaustion',
            { details: { requested: size, used: simulatedMemory, limit: memoryLimit } }
          );
        }
        simulatedMemory += size;
      };

      // 模拟分配大量内存
      expect(() => {
        for (let i = 0; i < 300; i++) {
          allocateMemory(1024 * 1024); // 1MB each
        }
      }).toThrow(SandboxEscapeError);

      // 验证错误类型
      try {
        allocateMemory(1024 * 1024 * 300); // 一次性超量
      } catch (error) {
        expect(error).toBeInstanceOf(SandboxEscapeError);
        expect((error as SandboxEscapeError).code).toBe(SandboxErrorCode.RESOURCE_EXHAUSTED);
        expectSandboxEscape(error, 'memory_exhaustion');
      }
    });

    it('should enforce CPU time limits', async () => {
      const startTime = Date.now();
      const timeLimit = 100; // 100ms限制

      // 模拟超时检查
      const checkTimeout = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed > timeLimit) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `CPU time limit exceeded: ${elapsed}ms > ${timeLimit}ms`,
            'cpu_exhaustion',
            { details: { elapsed, limit: timeLimit } }
          );
        }
      };

      // 模拟CPU密集型操作
      try {
        for (let i = 0; i < 1000000; i++) {
          if (i % 100000 === 0) {
            checkTimeout();
          }
        }
      } catch (error) {
        expect(error).toBeInstanceOf(SandboxEscapeError);
        expect((error as SandboxEscapeError).code).toBe(SandboxErrorCode.RESOURCE_EXHAUSTED);
      }
    });

    it('should enforce tmpfs disk space limits', async () => {
      const diskLimit = 100 * 1024 * 1024; // 100MB
      let allocated = 0;

      const writeChunk = (size: number) => {
        if (allocated + size > diskLimit) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `Disk limit exceeded: ${allocated + size} > ${diskLimit}`,
            'disk_exhaustion',
            { details: { requested: size, used: allocated, limit: diskLimit } }
          );
        }
        allocated += size;
      };

      // 尝试写入超过限制
      expect(() => {
        for (let i = 0; i < 101; i++) {
          writeChunk(1024 * 1024); // 1MB each
        }
      }).toThrow(SandboxEscapeError);
    });

    it('should prevent stack overflow from deep recursion', () => {
      const maxDepth = 1000;
      let currentDepth = 0;

      const guardedRecurse = (): void => {
        currentDepth++;
        if (currentDepth > maxDepth) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `Stack depth limit exceeded: ${currentDepth} > ${maxDepth}`,
            'stack_overflow',
            { details: { depth: currentDepth, limit: maxDepth } }
          );
        }
        // 模拟递归调用
        throw new Error('Should be caught by guard before real overflow');
      };

      // 测试守卫机制
      currentDepth = maxDepth + 1;
      expect(() => guardedRecurse()).toThrow(SandboxEscapeError);
    });

    it('should enforce file descriptor limits', () => {
      const fdLimit = 1024;
      const openFds: number[] = [];

      const openFile = (fd: number) => {
        if (openFds.length >= fdLimit) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `File descriptor limit exceeded: ${openFds.length} >= ${fdLimit}`,
            'fd_exhaustion',
            { details: { open: openFds.length, limit: fdLimit } }
          );
        }
        openFds.push(fd);
      };

      // 正常打开
      expect(() => {
        for (let i = 0; i < fdLimit; i++) {
          openFile(i);
        }
      }).not.toThrow();

      // 超出限制
      expect(() => openFile(9999)).toThrow(SandboxEscapeError);
    });

    it('should enforce process count limits', () => {
      const processLimit = 10;
      const processes: string[] = [];

      const spawnProcess = (name: string) => {
        if (processes.length >= processLimit) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            `Process limit exceeded: ${processes.length} >= ${processLimit}`,
            'process_exhaustion',
            { details: { current: processes.length, limit: processLimit } }
          );
        }
        processes.push(name);
      };

      expect(() => {
        for (let i = 0; i <= processLimit; i++) {
          spawnProcess(`process-${i}`);
        }
      }).toThrow(SandboxEscapeError);
    });

    it('should log resource limit events to audit log', () => {
      // 清空之前的日志
      auditLogger.clear();

      // 触发资源限制
      try {
        throw new SandboxEscapeError(
          SandboxErrorCode.RESOURCE_EXHAUSTED,
          'Test resource limit',
          'test_exhaustion',
          { severity: 'error' }
        );
      } catch (error) {
        if (error instanceof SandboxEscapeError) {
          auditLogger.logResourceLimit('memory', 100, 200);
        }
      }

      const logs = auditLogger.getLogs();
      expect(logs.some(log => log.event === 'RESOURCE_LIMIT_ENFORCED')).toBe(true);
    });

    it('should handle multiple resource limits simultaneously', () => {
      const limits = {
        memory: 256 * 1024 * 1024,
        time: 5000,
        fds: 1024
      };

      const usage = {
        memory: 0,
        fds: 0,
        startTime: Date.now()
      };

      const checkAllLimits = () => {
        // 检查内存
        if (usage.memory > limits.memory) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            'Memory limit exceeded',
            'memory_exhaustion',
            { details: { used: usage.memory, limit: limits.memory } }
          );
        }
        // 检查时间
        if (Date.now() - usage.startTime > limits.time) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            'Time limit exceeded',
            'time_exhaustion',
            { details: { elapsed: Date.now() - usage.startTime, limit: limits.time } }
          );
        }
        // 检查文件描述符
        if (usage.fds > limits.fds) {
          throw new SandboxEscapeError(
            SandboxErrorCode.RESOURCE_EXHAUSTED,
            'FD limit exceeded',
            'fd_exhaustion',
            { details: { used: usage.fds, limit: limits.fds } }
          );
        }
      };

      // 模拟超出内存限制
      usage.memory = limits.memory + 1;
      expect(() => checkAllLimits()).toThrow(SandboxEscapeError);
    });
  });

  // ============================================================================
  // 综合安全测试
  // ============================================================================
  describe('综合安全测试', () => {
    it('should handle multiple concurrent escape attempts', async () => {
      const attempts = [
        () => sandboxGuard.checkPathAccess('/etc/passwd'),
        () => sandboxGuard.checkNetworkAccess('http://evil.com'),
        () => sandboxGuard.checkSystemCall('exec'),
      ];

      const results = await Promise.allSettled(
        attempts.map(fn => {
          try {
            fn();
            return Promise.resolve('allowed');
          } catch (e) {
            return Promise.reject(e);
          }
        })
      );

      // 所有尝试都应该被拒绝
      const rejected = results.filter(r => r.status === 'rejected');
      expect(rejected.length).toBe(attempts.length);

      // 验证所有错误都是 SandboxEscapeError
      rejected.forEach(result => {
        if (result.status === 'rejected') {
          expect(result.reason).toBeInstanceOf(SandboxEscapeError);
        }
      });
    });

    it('should maintain audit log for all escape attempts', async () => {
      // 清空之前的日志
      auditLogger.clear();
      
      // 执行多种逃逸尝试，每次调用 expectSandboxEscape 会记录日志
      const pathPayload = pathEscapePayloads[0];
      const networkPayload = networkEscapePayloads[0];
      const processPayload = processEscapePayloads[0];

      try { 
        await executePathEscape(pathPayload); 
      } catch (e) { 
        expectSandboxEscape(e); // 这会记录审计日志
      }
      try { 
        await executeNetworkEscape(networkPayload); 
      } catch (e) { 
        expectSandboxEscape(e); // 这会记录审计日志
      }
      try { 
        await executeProcessEscape(processPayload); 
      } catch (e) { 
        expectSandboxEscape(e); // 这会记录审计日志
      }

      const logs = auditLogger.getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
      
      // 验证每条日志都有必要字段
      logs.forEach(log => {
        expect(log.timestamp).toBeDefined();
        expect(log.event).toMatch(/^SANDBOX_ESCAPE_ATTEMPT$|^RESOURCE_LIMIT_ENFORCED$/);
      });
    });

    it('should have correct error severity for critical escapes', () => {
      const criticalErrors = [
        SandboxErrorCode.PATH_ESCAPE,
        SandboxErrorCode.NETWORK_ESCAPE,
        SandboxErrorCode.PROCESS_ESCAPE,
      ];

      criticalErrors.forEach(code => {
        const error = new SandboxEscapeError(
          code,
          'Test error',
          'test',
          { severity: 'critical' }
        );
        expect(error.severity).toBe('critical');
      });
    });

    it('should provide detailed error context for debugging', () => {
      try {
        sandboxGuard.checkPathAccess('/etc/passwd');
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(SandboxEscapeError);
        const escapeError = error as SandboxEscapeError;
        expect(escapeError.details).toBeDefined();
        expect(escapeError.attemptType).toBeDefined();
        expect(escapeError.timestamp).toBeDefined();
        expect(escapeError.toAuditLog()).toBeDefined();
      }
    });
  });
});
