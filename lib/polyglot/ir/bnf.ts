/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * IR语法规范（BNF范式）
 * 
 * 定义Hajimi-IR的语法结构和序列化格式
 * @module lib/polyglot/ir/bnf
 */

import {
  Module,
  ASTNode,
  NodeKind,
  TypeKind,
  SourceLocation,
  createLocation,
} from './ast';

/**
 * IR语法规范版本
 */
export const IR_VERSION = '1.0.0';

/**
 * 支持的序列化格式
 */
export enum SerializationFormat {
  JSON = 'json',
  TEXT = 'text',
  BINARY = 'binary',
  PROTOBUF = 'protobuf',
}

/**
 * IR语法规范（BNF范式定义）
 * 
 * 以下是Hajimi-IR的完整语法规范：
 * 
 * ```bnf
 * <module>        ::= <header> <imports>* <statements>* <exports>*
 * <header>        ::= "@hajimi-ir" <version> <source-lang>?
 * <version>       ::= SEMVER
 * <source-lang>   ::= "nodejs" | "python" | "go" | "typescript"
 * 
 * <imports>       ::= "import" <import-spec> ("," <import-spec>)* "from" <string>
 * <import-spec>   ::= <identifier> | <identifier> "as" <identifier>
 * 
 * <exports>       ::= "export" <export-spec> | "export default" <identifier>
 * <export-spec>   ::= <identifier> | <identifier> "as" <identifier>
 * 
 * <statements>    ::= <var-decl> | <func-decl> | <class-decl> | <if-stmt>
 *                   | <while-stmt> | <for-stmt> | <try-stmt> | <return-stmt>
 *                   | <expr-stmt> | <block-stmt>
 * 
 * <var-decl>      ::= ("const" | "let") <identifier> (":" <type>)? "=" <expr>
 * <func-decl>     ::= "function" <identifier> <type-params>? <params> 
 *                     (":" <type>)? <block>
 * <type-params>   ::= "<" <identifier> ("," <identifier>)* ">"
 * <params>        ::= "(" <param> ("," <param>)* ")"
 * <param>         ::= <identifier> (":" <type>)? ("?")? ("=" <expr>)?
 *                   | "..." <identifier> (":" <type>)?
 * 
 * <class-decl>    ::= "class" <identifier> ("extends" <type>)? 
 *                     ("implements" <type> ("," <type>)*)? <class-body>
 * <class-body>    ::= "{" <class-member>* "}"
 * <class-member>  ::= <method-def> | <prop-def>
 * <method-def>    ::= ("static")? ("async")? ("get" | "set")? 
 *                     <identifier> <params> <block>
 * <prop-def>      ::= ("static")? ("readonly")? <identifier> (":" <type>)?
 *                     ("=" <expr>)?
 * 
 * <type>          ::= <primitive-type> | <array-type> | <func-type>
 *                   | <union-type> | <object-type> | <type-ref>
 * <primitive-type>::= "void" | "null" | "undefined" | "boolean" | "number"
 *                   | "string" | "bigint" | "symbol" | "any" | "unknown" | "never"
 * <array-type>    ::= <type> "[]"
 * <func-type>     ::= <type-params>? "(" <param-type>* ")" "=>" <type>
 * <param-type>    ::= <identifier> ":" <type>
 * <union-type>    ::= <type> ("|" <type>)+
 * <object-type>   ::= "{" <prop-type> ("," <prop-type>)* "}"
 * <prop-type>     ::= <identifier> ("?")? ":" <type>
 * <type-ref>      ::= <identifier> ("<" <type> ("," <type>)* ">")?
 * 
 * <if-stmt>       ::= "if" "(" <expr> ")" <stmt> ("else" <stmt>)?
 * <while-stmt>    ::= "while" "(" <expr> ")" <stmt>
 * <for-stmt>      ::= "for" "(" <var-decl>? ";" <expr>? ";" <expr>? ")" <stmt>
 * <try-stmt>      ::= "try" <block> <catch>? <finally>?
 * <catch>         ::= "catch" "(" <identifier>? ")" <block>
 * <finally>       ::= "finally" <block>
 * <return-stmt>   ::= "return" <expr>?
 * <expr-stmt>     ::= <expr>
 * <block-stmt>    ::= "{" <statements>* "}"
 * 
 * <expr>          ::= <assignment-expr>
 * <assignment-expr> ::= <conditional-expr> | <unary-expr> <assign-op> <assignment-expr>
 * <assign-op>     ::= "=" | "+=" | "-=" | "*=" | "/=" | "%=" | "**=" | "||=" | "&&="
 * <conditional-expr> ::= <or-expr> ("?" <expr> ":" <conditional-expr>)?
 * <or-expr>       ::= <and-expr> ("||" <and-expr>)*
 * <and-expr>      ::= <equality-expr> ("&&" <equality-expr>)*
 * <equality-expr> ::= <relational-expr> (("==" | "!=") <relational-expr>)*
 * <relational-expr> ::= <additive-expr> (("<" | ">" | "<=" | ">=") <additive-expr>)*
 * <additive-expr> ::= <multiplicative-expr> (("+" | "-") <multiplicative-expr>)*
 * <multiplicative-expr> ::= <unary-expr> (("*" | "/" | "%") <unary-expr>)*
 * <unary-expr>    ::= <postfix-expr> | <unary-op> <unary-expr>
 * <unary-op>      ::= "+" | "-" | "!" | "~" | "typeof" | "void" | "await"
 * <postfix-expr>  ::= <primary-expr> ("[" <expr> "]" | "." <identifier> | <args>)*
 * <args>          ::= "(" (<expr> ("," <expr>)*)? ")"
 * <primary-expr>  ::= <literal> | <identifier> | <array-expr> | <object-expr>
 *                   | <arrow-func> | <paren-expr> | <template-lit>
 * <paren-expr>    ::= "(" <expr> ")"
 * 
 * <literal>       ::= <number> | <string> | <boolean> | "null" | "undefined"
 * <number>        ::= DIGIT+ ("." DIGIT+)?
 * <string>        ::= "\"" CHAR* "\"" | "'" CHAR* "'" | "`" TEMPLATE_CHAR* "`"
 * <boolean>       ::= "true" | "false"
 * <identifier>    ::= LETTER (LETTER | DIGIT | "_" | "$")*
 * 
 * <array-expr>    ::= "[" (<expr>? ("," <expr>?)* )? "]"
 * <object-expr>   ::= "{" (<prop> ("," <prop>)* )? "}"
 * <prop>          ::= <identifier> | <string> | "[" <expr> "]"
 * <prop-value>    ::= <identifier> | <identifier> ":" <expr> | "..." <expr>
 * <arrow-func>    ::= <params> "=>" (<expr> | <block>)
 * <template-lit>  ::= "`" (<string> | "${" <expr> "}")* "`"
 * ```
 */

/**
 * Parser接口
 */
export interface IRParser {
  /**
   * 解析IR字符串为AST
   * @param source IR源代码
   * @param format 序列化格式
   * @returns 解析后的模块
   */
  parse(source: string, format?: SerializationFormat): Module;
  
  /**
   * 解析JSON格式的IR
   * @param json JSON字符串
   * @returns 解析后的模块
   */
  parseJSON(json: string): Module;
  
  /**
   * 解析文本格式的IR
   * @param text 文本格式的IR
   * @returns 解析后的模块
   */
  parseText(text: string): Module;
}

/**
 * Printer接口
 */
export interface IRPrinter {
  /**
   * 将AST打印为IR字符串
   * @param module 模块AST
   * @param format 输出格式
   * @returns IR字符串
   */
  print(module: Module, format?: SerializationFormat): string;
  
  /**
   * 将AST打印为JSON格式
   * @param module 模块AST
   * @param pretty 是否格式化输出
   * @returns JSON字符串
   */
  printJSON(module: Module, pretty?: boolean): string;
  
  /**
   * 将AST打印为文本格式
   * @param module 模块AST
   * @returns 文本格式的IR
   */
  printText(module: Module): string;
}

/**
 * IR元数据
 */
export interface IRMetadata {
  version: string;
  sourceLanguage: 'nodejs' | 'python' | 'go' | 'typescript' | 'unknown';
  targetLanguages: string[];
  createdAt: string;
  checksum: string;
}

/**
 * 序列化上下文
 */
export interface SerializationContext {
  format: SerializationFormat;
  includeLocation: boolean;
  includeComments: boolean;
  compact: boolean;
  metadata?: IRMetadata;
}

/**
 * 默认序列化上下文
 */
export const defaultContext: SerializationContext = {
  format: SerializationFormat.JSON,
  includeLocation: true,
  includeComments: true,
  compact: false,
};

/**
 * IR序列化器
 */
export class IRSerializer implements IRParser, IRPrinter {
  private nodeCounter: number = 0;
  
  /**
   * 解析IR字符串
   */
  parse(source: string, format: SerializationFormat = SerializationFormat.JSON): Module {
    switch (format) {
      case SerializationFormat.JSON:
        return this.parseJSON(source);
      case SerializationFormat.TEXT:
        return this.parseText(source);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * 解析JSON格式的IR
   */
  parseJSON(json: string): Module {
    const data = JSON.parse(json);
    return this.deserializeModule(data);
  }
  
  /**
   * 解析文本格式的IR（简化实现）
   */
  parseText(text: string): Module {
    // 文本格式解析器实现较为复杂，这里提供基础框架
    // 实际实现需要完整的词法分析和语法分析
    throw new Error('Text format parser not fully implemented');
  }
  
  /**
   * 反序列化模块
   */
  private deserializeModule(data: any): Module {
    // 实现反序列化逻辑
    // 这里提供简化版本
    return new Module(data.fileName || 'unknown.ts', [], {
      imports: [],
      exports: [],
      comments: [],
    });
  }
  
  /**
   * 打印IR
   */
  print(module: Module, format: SerializationFormat = SerializationFormat.JSON): string {
    switch (format) {
      case SerializationFormat.JSON:
        return this.printJSON(module);
      case SerializationFormat.TEXT:
        return this.printText(module);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }
  
  /**
   * 打印JSON格式
   */
  printJSON(module: Module, pretty: boolean = true): string {
    const data = this.serializeModule(module);
    return JSON.stringify(data, null, pretty ? 2 : undefined);
  }
  
  /**
   * 打印文本格式
   */
  printText(module: Module): string {
    const lines: string[] = [];
    
    // Header
    lines.push(`@hajimi-ir ${IR_VERSION}`);
    lines.push(`@source ${module.fileName}`);
    lines.push('');
    
    // TODO: 实现完整的文本格式打印
    lines.push('// Text format printer: work in progress');
    
    return lines.join('\n');
  }
  
  /**
   * 序列化模块
   */
  private serializeModule(module: Module): any {
    return {
      version: IR_VERSION,
      kind: module.kind,
      fileName: module.fileName,
      imports: module.imports.map(imp => this.serializeImport(imp)),
      statements: module.statements.map(stmt => this.serializeNode(stmt)),
      exports: module.exports.map(exp => this.serializeExport(exp)),
      comments: module.comments.map(cmt => this.serializeComment(cmt)),
    };
  }
  
  /**
   * 序列化AST节点（简化）
   */
  private serializeNode(node: ASTNode): any {
    const base: any = {
      kind: node.kind,
      id: ++this.nodeCounter,
    };
    
    if (node.loc) {
      base.loc = {
        file: node.loc.file,
        line: node.loc.line,
        column: node.loc.column,
      };
    }
    
    return base;
  }
  
  /**
   * 序列化导入（占位）
   */
  private serializeImport(imp: any): any {
    return { kind: 'import', source: imp.source };
  }
  
  /**
   * 序列化导出（占位）
   */
  private serializeExport(exp: any): any {
    return { kind: 'export' };
  }
  
  /**
   * 序列化注释
   */
  private serializeComment(cmt: any): any {
    return {
      text: cmt.text,
      isBlock: cmt.isBlock,
      isJSDoc: cmt.isJSDoc,
    };
  }
}

/**
 * 创建IR元数据
 */
export function createIRMetadata(
  sourceLanguage: 'nodejs' | 'python' | 'go' | 'typescript',
  targetLanguages: string[]
): IRMetadata {
  return {
    version: IR_VERSION,
    sourceLanguage,
    targetLanguages,
    createdAt: new Date().toISOString(),
    checksum: '', // 实际使用时计算
  };
}

/**
 * 验证IR版本兼容性
 */
export function validateVersion(version: string): boolean {
  const [major] = version.split('.');
  const [currentMajor] = IR_VERSION.split('.');
  return major === currentMajor;
}

/**
 * 导出的IR工具函数
 */
export const IRUtils = {
  /**
   * 获取节点类型的BNF定义
   */
  getBNFDefinition(kind: NodeKind): string {
    // 返回对应节点的BNF定义
    const definitions: Record<string, string> = {
      [NodeKind.MODULE]: '<module> ::= <header> <imports>* <statements>* <exports>*',
      [NodeKind.FUNCTION_DECL]: '<func-decl> ::= "function" <identifier> <params> <block>',
      [NodeKind.VARIABLE_DECL]: '<var-decl> ::= ("const" | "let") <identifier> "=" <expr>',
      // ... 更多定义
    };
    return definitions[kind] || `No BNF definition for ${kind}`;
  },
  
  /**
   * 检查类型兼容性
   */
  isTypeCompatible(source: TypeKind, target: TypeKind): boolean {
    if (source === target) return true;
    
    // 特殊类型处理
    if (target === TypeKind.ANY) return true;
    if (source === TypeKind.NEVER) return true;
    if (target === TypeKind.UNKNOWN) return true;
    
    // 数字类型兼容
    if (source === TypeKind.NUMBER && target === TypeKind.BIGINT) return false;
    if (source === TypeKind.BIGINT && target === TypeKind.NUMBER) return false;
    
    return false;
  },
};

// 默认导出
export default {
  IR_VERSION,
  SerializationFormat,
  IRSerializer,
  createIRMetadata,
  validateVersion,
  IRUtils,
};
