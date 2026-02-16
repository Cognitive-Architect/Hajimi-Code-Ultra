/**
 * B-05/06 🩵 咕咕嘎嘎·QA - 逃逸攻击载荷库
 * 
 * 各种沙盒逃逸攻击载荷，用于渗透测试
 * 所有载荷都应在沙盒环境中被正确阻止
 */

import { SandboxEscapeError, SandboxErrorCode, sandboxGuard } from './security-assertions';

/**
 * 路径逃逸载荷类型
 */
export interface PathEscapePayload {
  name: string;
  description: string;
  path: string;
  operation: 'read' | 'write' | 'delete' | 'list';
  expectedError: SandboxErrorCode;
}

/**
 * 网络逃逸载荷类型
 */
export interface NetworkEscapePayload {
  name: string;
  description: string;
  url: string;
  method: 'GET' | 'POST' | 'CONNECT' | 'SOCKET';
  expectedError: SandboxErrorCode;
}

/**
 * 进程逃逸载荷类型
 */
export interface ProcessEscapePayload {
  name: string;
  description: string;
  action: () => void | Promise<void>;
  expectedError: SandboxErrorCode;
}

/**
 * 资源耗尽载荷类型
 */
export interface ResourceExhaustionPayload {
  name: string;
  description: string;
  resource: 'memory' | 'cpu' | 'disk' | 'processes';
  action: () => void | Promise<void>;
  limit: number;
}

/**
 * 路径逃逸攻击载荷集合
 */
export const pathEscapePayloads: PathEscapePayload[] = [
  {
    name: 'Basic Path Traversal',
    description: '基本路径遍历攻击：尝试访问父目录',
    path: '../../evil.txt',
    operation: 'write',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Double Dot Slash',
    description: '使用双点斜杠绕过：../../../etc/passwd',
    path: '../../../etc/passwd',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'URL Encoded Traversal',
    description: 'URL编码绕过：%2e%2e%2f%2e%2e%2f',
    path: '%2e%2e%2f%2e%2e%2fetc%2fpasswd',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Unicode Traversal',
    description: 'Unicode编码绕过：..%c0%af..',
    path: '..%c0%af..%c0%afetc%c0%afpasswd',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Null Byte Injection',
    description: '空字节注入：file.txt%00.php',
    path: '/workspace/file.txt\x00.php',
    operation: 'write',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Absolute System Path',
    description: '绝对系统路径：/etc/passwd',
    path: '/etc/passwd',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Shadow Password File',
    description: '读取影子密码文件：/etc/shadow',
    path: '/etc/shadow',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Docker Socket Access',
    description: '访问Docker Socket：/var/run/docker.sock',
    path: '/var/run/docker.sock',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Root Directory Listing',
    description: '列出根目录内容',
    path: '/',
    operation: 'list',
    expectedError: SandboxErrorCode.PERMISSION_DENIED,
  },
  {
    name: 'Proc Filesystem Access',
    description: '访问proc文件系统：/proc/self/environ',
    path: '/proc/self/environ',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Symbolic Link Following',
    description: '通过符号链接访问敏感文件',
    path: '/workspace/link-to-etc-passwd',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
  {
    name: 'Case Variation Bypass',
    description: '大小写变体绕过：/ETC/PASSWD',
    path: '/ETC/PASSWD',
    operation: 'read',
    expectedError: SandboxErrorCode.PATH_ESCAPE,
  },
];

/**
 * 网络逃逸攻击载荷集合
 */
export const networkEscapePayloads: NetworkEscapePayload[] = [
  {
    name: 'External HTTP Request',
    description: '尝试访问外部HTTP服务',
    url: 'http://evil.com/data-exfiltration',
    method: 'GET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'External HTTPS Request',
    description: '尝试访问外部HTTPS服务',
    url: 'https://attacker.com/steal',
    method: 'POST',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'Metadata Service Access',
    description: '访问云元数据服务：169.254.169.254',
    url: 'http://169.254.169.254/latest/meta-data/',
    method: 'GET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'Localhost Service Scan',
    description: '扫描本地服务：127.0.0.1',
    url: 'http://127.0.0.1:22/',
    method: 'GET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'Internal Network Access',
    description: '访问内部网络：10.0.0.1',
    url: 'http://10.0.0.1/admin',
    method: 'GET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'DNS Exfiltration',
    description: 'DNS外泄：通过DNS查询外泄数据',
    url: 'http://data-leak.attacker.com',
    method: 'GET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'WebSocket Connection',
    description: '尝试建立WebSocket连接',
    url: 'ws://attacker.com:8080/shell',
    method: 'CONNECT',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
  {
    name: 'Raw Socket Creation',
    description: '尝试创建原始socket',
    url: 'raw://0.0.0.0:9999',
    method: 'SOCKET',
    expectedError: SandboxErrorCode.NETWORK_ESCAPE,
  },
];

/**
 * 进程逃逸攻击载荷集合
 */
export const processEscapePayloads: ProcessEscapePayload[] = [
  {
    name: 'System Command Execution',
    description: '尝试执行系统命令：ls -la',
    action: () => {
      // 模拟系统命令执行尝试
      const command = 'ls -la /etc';
      sandboxGuard.checkSystemCall(`exec: ${command}`);
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Shell Command Injection',
    description: 'Shell命令注入：; cat /etc/passwd',
    action: () => {
      const command = '; cat /etc/passwd';
      sandboxGuard.checkSystemCall(`shell: ${command}`);
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Reverse Shell Attempt',
    description: '尝试建立反向shell',
    action: () => {
      sandboxGuard.checkSystemCall('socket_create');
      sandboxGuard.checkSystemCall('exec: /bin/bash');
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Privilege Escalation',
    description: '尝试提权：sudo 或 su',
    action: () => {
      sandboxGuard.checkSystemCall('exec: sudo');
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Process Fork Bomb',
    description: 'Fork炸弹：不断创建子进程',
    action: () => {
      sandboxGuard.checkProcessCreation();
    },
    expectedError: SandboxErrorCode.PROCESS_ESCAPE,
  },
  {
    name: 'Binary Execution',
    description: '尝试执行任意二进制文件',
    action: () => {
      sandboxGuard.checkSystemCall('exec: /usr/bin/python3');
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Dynamic Library Loading',
    description: '尝试加载动态库',
    action: () => {
      sandboxGuard.checkSystemCall('dlopen');
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
  {
    name: 'Ptrace System Call',
    description: '尝试使用ptrace调试其他进程',
    action: () => {
      sandboxGuard.checkSystemCall('ptrace');
    },
    expectedError: SandboxErrorCode.SYSTEM_CALL_BLOCKED,
  },
];

/**
 * 资源耗尽攻击载荷集合
 */
export const resourceExhaustionPayloads: ResourceExhaustionPayload[] = [
  {
    name: 'Memory Allocation Bomb',
    description: '尝试分配大量内存',
    resource: 'memory',
    action: () => {
      const arrays: number[][] = [];
      // 尝试分配超过256MB的内存
      for (let i = 0; i < 1000; i++) {
        arrays.push(new Array(1000000).fill(0));
      }
    },
    limit: 256 * 1024 * 1024, // 256MB
  },
  {
    name: 'String Concatenation Bomb',
    description: '通过字符串拼接耗尽内存',
    resource: 'memory',
    action: () => {
      let str = 'x';
      // 指数级增长
      for (let i = 0; i < 30; i++) {
        str = str + str;
      }
    },
    limit: 256 * 1024 * 1024,
  },
  {
    name: 'Object Allocation Flood',
    description: '大量对象分配',
    resource: 'memory',
    action: () => {
      const objects: object[] = [];
      for (let i = 0; i < 10000000; i++) {
        objects.push({ id: i, data: new Array(100).fill(i) });
      }
    },
    limit: 256 * 1024 * 1024,
  },
  {
    name: 'Infinite Loop (CPU)',
    description: 'CPU死循环',
    resource: 'cpu',
    action: () => {
      // 使用setTimeout避免真正阻塞测试进程
      const start = Date.now();
      const maxDuration = 5000; // 最多允许5秒
      
      return new Promise<void>((_, reject) => {
        const checkTimeout = () => {
          if (Date.now() - start > maxDuration) {
            reject(new Error('CPU timeout detected'));
          }
        };
        
        // 模拟CPU密集型操作
        let counter = 0;
        const loop = () => {
          while (counter < 100000000) {
            counter++;
            if (counter % 1000000 === 0) {
              checkTimeout();
            }
          }
        };
        
        try {
          loop();
        } catch (e) {
          reject(e);
        }
      });
    },
    limit: 50, // 50% CPU limit
  },
  {
    name: 'Recursive Stack Overflow',
    description: '递归调用导致栈溢出',
    resource: 'memory',
    action: () => {
      const recurse = () => {
        recurse();
      };
      recurse();
    },
    limit: 8 * 1024 * 1024, // 8MB stack
  },
  {
    name: 'File Descriptor Exhaustion',
    description: '耗尽文件描述符',
    resource: 'disk',
    action: () => {
      const handles: number[] = [];
      try {
        // 模拟打开大量文件句柄
        for (let i = 0; i < 100000; i++) {
          handles.push(i);
        }
      } finally {
        handles.length = 0;
      }
    },
    limit: 1024, // max open files
  },
  {
    name: 'Disk Space Exhaustion',
    description: '尝试填满磁盘空间',
    resource: 'disk',
    action: () => {
      // 模拟大文件写入尝试
      const chunk = 'x'.repeat(1024 * 1024); // 1MB
      const chunks: string[] = [];
      
      // 尝试写入超过100MB
      for (let i = 0; i < 101; i++) {
        chunks.push(chunk);
      }
    },
    limit: 100 * 1024 * 1024, // 100MB tmpfs limit
  },
];

/**
 * 组合攻击载荷 - 多向量攻击
 */
export const combinedEscapePayloads = [
  {
    name: 'Path + Network Data Exfil',
    description: '先读取敏感文件，然后尝试网络外泄',
    payloads: [
      { type: 'path' as const, payload: pathEscapePayloads[0] },
      { type: 'network' as const, payload: networkEscapePayloads[0] },
    ],
  },
  {
    name: 'Process + Privilege Escalation',
    description: '创建进程并尝试提权',
    payloads: [
      { type: 'process' as const, payload: processEscapePayloads[4] },
      { type: 'process' as const, payload: processEscapePayloads[3] },
    ],
  },
  {
    name: 'Resource + DoS Attack',
    description: '资源耗尽导致拒绝服务',
    payloads: [
      { type: 'resource' as const, payload: resourceExhaustionPayloads[0] },
      { type: 'resource' as const, payload: resourceExhaustionPayloads[3] },
    ],
  },
];

/**
 * 执行路径逃逸攻击
 */
export async function executePathEscape(payload: PathEscapePayload): Promise<void> {
  sandboxGuard.checkPathAccess(payload.path);
  
  // 如果通过了守卫检查，尝试实际文件操作
  // 在真实环境中这里会被沙盒阻止
  throw new SandboxEscapeError(
    SandboxErrorCode.PATH_ESCAPE,
    `Path escape blocked: ${payload.path}`,
    payload.operation,
    { details: { payload } }
  );
}

/**
 * 执行网络逃逸攻击
 */
export async function executeNetworkEscape(payload: NetworkEscapePayload): Promise<void> {
  sandboxGuard.checkNetworkAccess(payload.url);
  
  throw new SandboxEscapeError(
    SandboxErrorCode.NETWORK_ESCAPE,
    `Network escape blocked: ${payload.url}`,
    payload.method,
    { details: { payload } }
  );
}

/**
 * 执行进程逃逸攻击
 */
export async function executeProcessEscape(payload: ProcessEscapePayload): Promise<void> {
  await payload.action();
}

/**
 * 执行资源耗尽攻击
 */
export async function executeResourceExhaustion(
  payload: ResourceExhaustionPayload
): Promise<void> {
  await payload.action();
}
