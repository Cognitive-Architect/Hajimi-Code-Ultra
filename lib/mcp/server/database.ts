/**
 * MCP数据库查询服务器
 * 
 * 功能：
 * - query: 执行SQL查询
 * - list_tables: 列出所有表
 * - describe_table: 获取表结构
 * 
 * 安全特性：
 * - 只读模式（默认）
 * - 结果集限制
 * - SQL注入防护
 * - 危险操作拦截
 */

import { EventEmitter } from 'events';

// 工具定义
interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

// 工具调用结果
interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

// 数据库连接接口（抽象层，兼容多种数据库）
interface DatabaseConnection {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  getTables(): Promise<string[]>;
  describeTable(tableName: string): Promise<Array<{ column: string; type: string; nullable: boolean }>>;
  close(): Promise<void>;
}

// 数据库配置
interface DatabaseConfig {
  // 只读模式
  readOnly: boolean;
  // 最大结果行数
  maxRows: number;
  // 查询超时（毫秒）
  queryTimeout: number;
  // 允许的查询类型
  allowedQueryTypes: Array<'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'DROP'>;
  // 禁止的表（敏感数据）
  blockedTables: string[];
  // 是否允许DDL
  allowDDL: boolean;
}

// 默认配置
const DEFAULT_CONFIG: DatabaseConfig = {
  readOnly: true,
  maxRows: 1000,
  queryTimeout: 30000,
  allowedQueryTypes: ['SELECT'],
  blockedTables: ['users', 'passwords', 'secrets', 'credentials', 'api_keys'],
  allowDDL: false
};

// 危险SQL模式
const DANGEROUS_PATTERNS = [
  // 删除操作
  /\bDROP\s+DATABASE\b/i,
  /\bDROP\s+TABLE\b/i,
  // 修改结构
  /\bALTER\s+TABLE\s+.*\s+DROP\b/i,
  // 系统表
  /\b(pg_|sqlite_|information_schema|mysql\.|sys\.)\b/i,
  // 多语句
  /;\s*(SELECT|INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/i,
  // 注释攻击
  /\/\*/,
  /--/,
  // 时间延迟攻击
  /\b(SLEEP|BENCHMARK|PG_SLEEP|WAITFOR\s+DELAY)\b/i,
  // 联合查询注入
  /\bUNION\s+SELECT\b/i
];

/**
 * SQL安全错误
 */
class SQLSecurityError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = 'SQLSecurityError';
  }
}

/**
 * MCP数据库服务器
 */
export class MCPDatabaseServer extends EventEmitter {
  private config: DatabaseConfig;
  private connection: DatabaseConnection | null = null;
  private queryLog: Array<{
    timestamp: Date;
    sql: string;
    allowed: boolean;
    rowCount: number;
    durationMs: number;
    error?: string;
  }> = [];

  constructor(config: Partial<DatabaseConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    console.log(`[MCPDatabaseServer] Read-only mode: ${this.config.readOnly}`);
    console.log(`[MCPDatabaseServer] Max rows: ${this.config.maxRows}`);
  }

  /**
   * 连接到数据库
   */
  async connect(connection: DatabaseConnection): Promise<void> {
    this.connection = connection;
    console.log('[MCPDatabaseServer] Database connected');
    this.emit('connected');
  }

  /**
   * 获取工具定义
   */
  getTools(): Tool[] {
    const tools: Tool[] = [
      {
        name: 'db_query',
        description: this.config.readOnly 
          ? 'Execute a SELECT query against the database. Returns query results as JSON. (READ-ONLY MODE)'
          : 'Execute a SQL query against the database. Returns query results as JSON.',
        inputSchema: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'SQL query to execute'
            },
            params: {
              type: 'array',
              description: 'Query parameters for prepared statements',
              default: []
            }
          },
          required: ['sql']
        }
      },
      {
        name: 'db_list_tables',
        description: 'List all tables in the database.',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'db_describe_table',
        description: 'Get the schema of a specific table.',
        inputSchema: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              description: 'Table name'
            }
          },
          required: ['table']
        }
      }
    ];

    return tools;
  }

  /**
   * 验证SQL安全性
   */
  private validateSQL(sql: string): void {
    const upperSQL = sql.trim().toUpperCase();
    
    // 1. 检查危险模式
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(sql)) {
        throw new SQLSecurityError(
          `Potentially dangerous SQL pattern detected: ${pattern.source}`,
          'DANGEROUS_PATTERN'
        );
      }
    }

    // 2. 检查查询类型
    const firstWord = upperSQL.split(/\s+/)[0];
    if (!this.config.allowedQueryTypes.includes(firstWord as any)) {
      throw new SQLSecurityError(
        `Query type not allowed: ${firstWord}. Allowed types: ${this.config.allowedQueryTypes.join(', ')}`,
        'QUERY_TYPE_NOT_ALLOWED'
      );
    }

    // 3. 只读模式检查
    if (this.config.readOnly) {
      const writeOperations = ['INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'TRUNCATE'];
      if (writeOperations.includes(firstWord)) {
        throw new SQLSecurityError(
          'Write operations are not allowed in read-only mode',
          'READ_ONLY_VIOLATION'
        );
      }
    }

    // 4. DDL检查
    if (!this.config.allowDDL) {
      const ddlOperations = ['CREATE', 'DROP', 'ALTER'];
      if (ddlOperations.includes(firstWord)) {
        throw new SQLSecurityError(
          'DDL operations are not allowed',
          'DDL_NOT_ALLOWED'
        );
      }
    }

    // 5. 检查敏感表访问
    const sqlLower = sql.toLowerCase();
    for (const blockedTable of this.config.blockedTables) {
      if (sqlLower.includes(blockedTable.toLowerCase())) {
        throw new SQLSecurityError(
          `Access to table '${blockedTable}' is restricted`,
          'BLOCKED_TABLE'
        );
      }
    }
  }

  /**
   * 限制结果集大小
   */
  private limitQuery(sql: string): string {
    // 如果已经是LIMIT查询，检查限制
    const limitMatch = sql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const currentLimit = parseInt(limitMatch[1], 10);
      if (currentLimit > this.config.maxRows) {
        // 替换为更小的限制
        return sql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${this.config.maxRows}`);
      }
      return sql;
    }

    // 添加LIMIT
    return `${sql.trim()} LIMIT ${this.config.maxRows}`;
  }

  /**
   * 记录查询日志
   */
  private logQuery(sql: string, allowed: boolean, rowCount: number, durationMs: number, error?: string): void {
    const entry = {
      timestamp: new Date(),
      sql: sql.substring(0, 1000), // 限制长度
      allowed,
      rowCount,
      durationMs,
      error
    };
    
    this.queryLog.push(entry);
    if (this.queryLog.length > 1000) {
      this.queryLog.shift();
    }

    this.emit('query', entry);
  }

  /**
   * 执行查询
   */
  async executeQuery(sql: string, params: unknown[] = []): Promise<ToolResult> {
    if (!this.connection) {
      return {
        content: [{
          type: 'text',
          text: 'Database not connected'
        }],
        isError: true
      };
    }

    const startTime = Date.now();
    let allowed = false;

    try {
      // 1. 安全验证
      this.validateSQL(sql);
      allowed = true;

      // 2. 限制结果集
      const limitedSQL = this.limitQuery(sql);

      // 3. 执行查询
      const result = await this.connection.query(limitedSQL, params);
      
      const durationMs = Date.now() - startTime;
      
      // 截断结果
      const truncatedRows = result.rows.slice(0, this.config.maxRows);
      const isTruncated = result.rows.length > this.config.maxRows;

      this.logQuery(sql, true, truncatedRows.length, durationMs);

      this.emit('query:success', { sql, rowCount: truncatedRows.length, durationMs });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            rowCount: truncatedRows.length,
            totalRows: result.rowCount,
            truncated: isTruncated,
            durationMs,
            rows: truncatedRows
          }, null, 2)
        }]
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      this.logQuery(sql, allowed, 0, durationMs, errorMsg);

      if (error instanceof SQLSecurityError) {
        this.emit('query:security', { sql, error: errorMsg });
        return {
          content: [{
            type: 'text',
            text: `SQL Security Error: ${error.message}`
          }],
          isError: true
        };
      }

      this.emit('query:error', { sql, error: errorMsg });
      return {
        content: [{
          type: 'text',
          text: `Query failed: ${errorMsg}`
        }],
        isError: true
      };
    }
  }

  /**
   * 列出所有表
   */
  async listTables(): Promise<ToolResult> {
    if (!this.connection) {
      return {
        content: [{
          type: 'text',
          text: 'Database not connected'
        }],
        isError: true
      };
    }

    try {
      const tables = await this.connection.getTables();
      
      // 过滤敏感表
      const filteredTables = tables.filter(
        table => !this.config.blockedTables.includes(table.toLowerCase())
      );

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ tables: filteredTables }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to list tables: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 获取表结构
   */
  async describeTable(tableName: string): Promise<ToolResult> {
    // 检查表名是否被阻止
    if (this.config.blockedTables.includes(tableName.toLowerCase())) {
      return {
        content: [{
          type: 'text',
          text: `Access to table '${tableName}' is restricted`
        }],
        isError: true
      };
    }

    if (!this.connection) {
      return {
        content: [{
          type: 'text',
          text: 'Database not connected'
        }],
        isError: true
      };
    }

    try {
      const schema = await this.connection.describeTable(tableName);

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ table: tableName, columns: schema }, null, 2)
        }]
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Failed to describe table: ${error instanceof Error ? error.message : String(error)}`
        }],
        isError: true
      };
    }
  }

  /**
   * 处理工具调用
   */
  async handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'db_query':
        return this.executeQuery(
          args.sql as string,
          (args.params as unknown[]) || []
        );
      
      case 'db_list_tables':
        return this.listTables();
      
      case 'db_describe_table':
        return this.describeTable(args.table as string);
      
      default:
        return {
          content: [{
            type: 'text',
            text: `Unknown tool: ${toolName}`
          }],
          isError: true
        };
    }
  }

  /**
   * 获取查询日志
   */
  getQueryLog(): Array<{
    timestamp: Date;
    sql: string;
    allowed: boolean;
    rowCount: number;
    durationMs: number;
    error?: string;
  }> {
    return [...this.queryLog];
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalQueries: number;
    allowedQueries: number;
    blockedQueries: number;
    avgDurationMs: number;
  } {
    const totalQueries = this.queryLog.length;
    const allowedQueries = this.queryLog.filter(q => q.allowed).length;
    const blockedQueries = totalQueries - allowedQueries;
    const avgDurationMs = totalQueries > 0
      ? this.queryLog.reduce((sum, q) => sum + q.durationMs, 0) / totalQueries
      : 0;

    return {
      totalQueries,
      allowedQueries,
      blockedQueries,
      avgDurationMs: Math.round(avgDurationMs)
    };
  }

  /**
   * 断开连接
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }
    this.emit('disconnected');
  }
}

// 导出默认实例
export const databaseServer = new MCPDatabaseServer();

// 导出类型
export type { DatabaseConfig, DatabaseConnection, ToolResult };
