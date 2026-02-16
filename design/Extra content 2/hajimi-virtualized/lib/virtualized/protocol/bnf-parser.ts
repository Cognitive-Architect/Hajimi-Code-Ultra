/**
 * HAJIMI VIRTUALIZED - BNF协议运行时解析器
 * 
 * 工单 4/6: BNF协议运行时解析器
 * 
 * 参考规范:
 * - ID-85（BNF语法附录）
 * - Wave1协议规范
 * 
 * BNF语法定义:
 * [SPAWN:ID:RETRY:N]      - 创建Agent实例
 * [TERMINATE:ID:REASON]   - 终止Agent实例
 * [VACUUM:SCOPE]          - 清理上下文
 * [LIFECYCLE:STATE]       - 生命周期状态
 * 
 * 性能要求: 解析耗时<10ms（不影响Checkpoint预算）
 * 
 * @module protocol/bnf-parser
 * @version 1.0.0
 */

import {
  BNFCommand,
  BNFCommandType,
  AgentState,
  ProtocolError,
  IBNFParser,
} from '../types';

/**
 * BNF语法定义
 */
export interface BNFGrammar {
  /** 命令类型 */
  command: BNFCommandType;
  /** 参数定义 */
  params: Array<{
    name: string;
    required: boolean;
    validator?: (value: string) => boolean;
  }>;
  /** 描述 */
  description: string;
}

/**
 * 解析上下文
 */
export interface ParseContext {
  /** 当前行号 */
  lineNumber: number;
  /** 当前列号 */
  columnNumber: number;
  /** 原始输入 */
  input: string;
  /** 已解析命令数 */
  parsedCount: number;
}

/**
 * 解析结果
 */
export interface ParseResult {
  /** 解析的命令 */
  commands: BNFCommand[];
  /** 解析耗时（ms） */
  parseTime: number;
  /** 命令数量 */
  commandCount: number;
  /** 是否有错误 */
  hasErrors: boolean;
  /** 错误列表 */
  errors: ProtocolError[];
}

/**
 * BNF协议完整语法定义
 */
export const BNF_GRAMMAR: Record<BNFCommandType, BNFGrammar> = {
  SPAWN: {
    command: 'SPAWN',
    params: [
      { name: 'id', required: true, validator: (v) => v.length > 0 && /^[a-zA-Z0-9_-]+$/.test(v) },
      { name: 'retryKeyword', required: false, validator: (v) => v === 'RETRY' },
      { name: 'retryCount', required: false, validator: (v) => /^\d+$/.test(v) && parseInt(v) >= 0 },
    ],
    description: '创建Agent实例: [SPAWN:ID:RETRY:N]',
  },
  TERMINATE: {
    command: 'TERMINATE',
    params: [
      { name: 'id', required: true, validator: (v) => v.length > 0 },
      { name: 'reason', required: false },
    ],
    description: '终止Agent实例: [TERMINATE:ID:REASON]',
  },
  VACUUM: {
    command: 'VACUUM',
    params: [
      { name: 'scope', required: true, validator: (v) => ['ALL', 'TERMINATED'].includes(v) },
    ],
    description: '清理上下文: [VACUUM:SCOPE]',
  },
  LIFECYCLE: {
    command: 'LIFECYCLE',
    params: [
      { name: 'state', required: true, validator: (v) => ['SPAWNED', 'RUNNING', 'PAUSED', 'TERMINATED'].includes(v) },
    ],
    description: '生命周期状态: [LIFECYCLE:STATE]',
  },
};

/**
 * BNF协议解析器
 * 
 * 完整解析[SPAWN]/[TERMINATE]/[VACUUM]/[LIFECYCLE]指令
 * 类型安全：TypeScript严格模式，零any
 * 错误处理：无效BNF指令抛ProtocolError（含行号定位）
 * 性能：解析耗时<10ms（不影响Checkpoint预算）
 */
export class BNFParser implements IBNFParser {
  /**
   * BNF命令正则表达式
   * 匹配格式: [COMMAND:PARAM1:PARAM2:...]
   */
  private static readonly BNF_REGEX = /^\[([A-Z]+)(?::([^\]]*))?\]$/;

  /**
   * 解析多行BNF指令
   * 
   * @param input - 输入字符串（可包含多行）
   * @returns 解析后的命令数组
   * @throws ProtocolError - 无效指令时抛出（含行号定位）
   */
  parse(input: string): BNFCommand[] {
    const startTime = performance.now();
    const commands: BNFCommand[] = [];
    const lines = input.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith('#')) continue; // 跳过空行和注释

      try {
        const command = this.parseLine(line, i + 1);
        commands.push(command);
      } catch (error) {
        if (error instanceof ProtocolError) {
          throw error; // 重新抛出
        }
        throw new ProtocolError(
          `Failed to parse command: ${error instanceof Error ? error.message : 'Unknown error'}`,
          i + 1,
          0,
          line
        );
      }
    }

    const elapsed = performance.now() - startTime;
    if (elapsed > 10) {
      console.warn(`[BNFParser] Parse time ${elapsed.toFixed(2)}ms exceeds 10ms budget`);
    }

    return commands;
  }

  /**
   * 解析单行BNF指令
   * 
   * @param line - 单行指令
   * @param lineNumber - 行号（用于错误定位）
   * @returns 解析后的命令
   * @throws ProtocolError - 无效指令时抛出
   */
  parseLine(line: string, lineNumber: number = 1): BNFCommand {
    const trimmedLine = line.trim();
    const match = BNFParser.BNF_REGEX.exec(trimmedLine);

    if (!match) {
      throw new ProtocolError(
        'Invalid BNF command format. Expected: [COMMAND:PARAM1:PARAM2:...]',
        lineNumber,
        0,
        line
      );
    }

    const type = match[1] as BNFCommandType;
    const paramsStr = match[2] || '';
    const params = paramsStr.split(':').filter(p => p.length > 0);

    // 验证命令类型
    if (!this.isValidCommandType(type)) {
      throw new ProtocolError(
        `Unknown command type: "${type}". Valid types: SPAWN, TERMINATE, VACUUM, LIFECYCLE`,
        lineNumber,
        1,
        line
      );
    }

    // 验证参数
    this.validateParams(type, params, lineNumber, line);

    return {
      type,
      params,
      raw: line,
      position: lineNumber,
    };
  }

  /**
   * 验证BNF指令有效性
   * 
   * @param command - 待验证指令
   * @returns 是否有效
   */
  validate(command: string): boolean {
    try {
      this.parseLine(command);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 解析并返回详细结果
   * 
   * @param input - 输入字符串
   * @returns 解析结果
   */
  parseDetailed(input: string): ParseResult {
    const startTime = performance.now();
    const errors: ProtocolError[] = [];
    let commands: BNFCommand[] = [];
    let hasErrors = false;

    try {
      commands = this.parse(input);
    } catch (error) {
      hasErrors = true;
      if (error instanceof ProtocolError) {
        errors.push(error);
      } else {
        errors.push(new ProtocolError(
          error instanceof Error ? error.message : 'Unknown error',
          0,
          0
        ));
      }
    }

    return {
      commands,
      parseTime: performance.now() - startTime,
      commandCount: commands.length,
      hasErrors,
      errors,
    };
  }

  /**
   * 批量验证BNF指令
   * 
   * @param commands - 指令数组
   * @returns 验证结果
   */
  validateBatch(commands: string[]): Array<{ command: string; valid: boolean; error?: string }> {
    return commands.map(cmd => {
      try {
        this.parseLine(cmd);
        return { command: cmd, valid: true };
      } catch (error) {
        return {
          command: cmd,
          valid: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    });
  }

  /**
   * 生成BNF指令
   * 
   * @param type - 命令类型
   * @param params - 参数
   * @returns BNF指令字符串
   */
  generate(type: BNFCommandType, ...params: string[]): string {
    const paramStr = params.join(':');
    return paramStr ? `[${type}:${paramStr}]` : `[${type}]`;
  }

  /**
   * 获取命令帮助信息
   * 
   * @param type - 命令类型（可选）
   * @returns 帮助信息
   */
  getHelp(type?: BNFCommandType): string {
    if (type) {
      const grammar = BNF_GRAMMAR[type];
      return `${grammar.description}\nParameters:\n${grammar.params
        .map(p => `  - ${p.name}${p.required ? ' (required)' : ' (optional)'}`)
        .join('\n')}`;
    }

    return Object.values(BNF_GRAMMAR)
      .map(g => g.description)
      .join('\n');
  }

  /**
   * 检查是否为有效命令类型
   */
  private isValidCommandType(type: string): type is BNFCommandType {
    return ['SPAWN', 'TERMINATE', 'VACUUM', 'LIFECYCLE'].includes(type);
  }

  /**
   * 验证命令参数
   */
  private validateParams(
    type: BNFCommandType,
    params: string[],
    lineNumber: number,
    raw: string
  ): void {
    const grammar = BNF_GRAMMAR[type];

    // 检查必需参数
    for (let i = 0; i < grammar.params.length; i++) {
      const paramDef = grammar.params[i];
      if (paramDef.required && i >= params.length) {
        throw new ProtocolError(
          `${type} command requires parameter "${paramDef.name}"`,
          lineNumber,
          0,
          raw
        );
      }

      // 验证参数值
      if (i < params.length && paramDef.validator) {
        const value = params[i];
        if (!paramDef.validator(value)) {
          throw new ProtocolError(
            `Invalid value for parameter "${paramDef.name}": "${value}"`,
            lineNumber,
            0,
            raw
          );
        }
      }
    }

    // SPAWN特殊验证
    if (type === 'SPAWN') {
      if (params.length >= 3 && params[1] !== 'RETRY') {
        throw new ProtocolError(
          'SPAWN command format: [SPAWN:ID:RETRY:N]',
          lineNumber,
          0,
          raw
        );
      }
    }
  }
}

/**
 * BNF协议序列化器
 */
export class BNFSerializer {
  /**
   * 序列化命令为BNF格式
   */
  serialize(command: BNFCommand): string {
    const params = command.params.join(':');
    return params ? `[${command.type}:${params}]` : `[${command.type}]`;
  }

  /**
   * 序列化命令数组
   */
  serializeBatch(commands: BNFCommand[]): string {
    return commands.map(cmd => this.serialize(cmd)).join('\n');
  }
}

/**
 * BNF协议验证器
 */
export class BNFValidator {
  private parser: BNFParser;

  constructor() {
    this.parser = new BNFParser();
  }

  /**
   * 验证协议合规性
   */
  validateProtocol(input: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      const commands = this.parser.parse(input);
      
      // 验证命令序列逻辑
      const spawnedAgents = new Set<string>();
      
      for (const cmd of commands) {
        switch (cmd.type) {
          case 'SPAWN': {
            const id = cmd.params[0];
            if (spawnedAgents.has(id)) {
              errors.push(`Agent "${id}" already spawned`);
            } else {
              spawnedAgents.add(id);
            }
            break;
          }
          case 'TERMINATE': {
            const id = cmd.params[0];
            if (!spawnedAgents.has(id)) {
              errors.push(`Cannot terminate non-existent agent "${id}"`);
            } else {
              spawnedAgents.delete(id);
            }
            break;
          }
        }
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// 导出默认实例
export const bnfParser = new BNFParser();
export const bnfSerializer = new BNFSerializer();
export const bnfValidator = new BNFValidator();
