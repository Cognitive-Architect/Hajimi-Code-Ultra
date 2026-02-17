/**
 * MCP协议桥接层 - 统一导出
 * 
 * 模块：
 * - Host: Alice MCP Host实现
 * - Servers: 文件系统、浏览器、数据库、Shell服务器
 * - Sandbox: 七权权限、熔断机制
 */

// Host
export { AliceMCPHost, aliceMCPHost } from './host/alice-host';
export type {
  MCPRequest,
  MCPResponse,
  MCPTool,
  ToolCallResult,
  MCPTransport
} from './host/alice-host';

// Servers
export { MCPFilesystemServer, filesystemServer } from './server/filesystem';
export type {
  SecurityPolicy,
  ToolResult as FilesystemToolResult,
  PathSecurityError
} from './server/filesystem';

export { MCPBrowserServer, browserServer } from './server/browser';
export type {
  BrowserConfig,
  BrowserPage,
  BrowserContext,
  ToolResult as BrowserToolResult
} from './server/browser';

export { MCPDatabaseServer, databaseServer } from './server/database';
export type {
  DatabaseConfig,
  DatabaseConnection,
  ToolResult as DatabaseToolResult
} from './server/database';

export { MCPShellServer, shellServer } from './server/shell';
export type {
  ShellConfig,
  ToolResult as ShellToolResult,
  CommandSecurityError
} from './server/shell';

// Sandbox
export {
  SevenRightsManager,
  sevenRightsManager,
  RIGHTS_LEVELS,
  RightsLevel,
  RightsViolationError
} from './sandbox/seven-rights';
export type {
  RightsLevelInfo,
  CapabilityToken,
  EscalationRequest,
  AuditLogEntry,
  SevenRightsConfig
} from './sandbox/seven-rights';

export {
  FuseManager,
  fuseManager,
  Fuse,
  FuseState,
  DEFAULT_FUSE_CONFIG
} from './sandbox/fuse';
export type {
  FuseConfig,
  FuseStats,
  FuseEvent,
  ConfirmationRequest
} from './sandbox/fuse';

// UI
export { AliceContextMenu, aliceContextMenu } from '../alice/ui/context-menu';
export type {
  MCPTool as ContextMCPTool,
  MenuItem,
  ToolCallParams,
  ToolCallResult as ContextToolCallResult,
  AliceOrbConfig
} from '../alice/ui/context-menu';

/**
 * MCP协议版本
 */
export const MCP_PROTOCOL_VERSION = '2024-11-25';

/**
 * 初始化所有MCP组件
 */
export async function initializeMCP(): Promise<{
  host: typeof aliceMCPHost;
  servers: {
    filesystem: typeof filesystemServer;
    browser: typeof browserServer;
    database: typeof databaseServer;
    shell: typeof shellServer;
  };
  sandbox: {
    rights: typeof sevenRightsManager;
    fuse: typeof fuseManager;
  };
}> {
  // 初始化Host
  await aliceMCPHost.initialize();

  return {
    host: aliceMCPHost,
    servers: {
      filesystem: filesystemServer,
      browser: browserServer,
      database: databaseServer,
      shell: shellServer
    },
    sandbox: {
      rights: sevenRightsManager,
      fuse: fuseManager
    }
  };
}
