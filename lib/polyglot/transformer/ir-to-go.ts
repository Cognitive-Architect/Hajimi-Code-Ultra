/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * Hajimi-IR → Go代码生成器
 * 
 * 将Hajimi-IR中间表示转换为Go代码
 * @module lib/polyglot/transformer/ir-to-go
 * 
 * 债务声明：
 * - Go泛型支持（P2）：Go<1.18降级处理
 */

import {
  Module,
  Statement,
  Expression,
  Identifier,
  Literal,
  BinaryExpression,
  UnaryExpression,
  CallExpression,
  MemberExpression,
  ArrayExpression,
  ObjectExpression,
  Property,
  ArrowFunction,
  FunctionDeclaration,
  VariableDeclaration,
  VariableDeclarator,
  BlockStatement,
  IfStatement,
  ReturnStatement,
  ExpressionStatement,
  ImportDeclaration,
  ImportSpecifier,
  ExportDeclaration,
  AwaitExpression,
  SpreadElement,
  ConditionalExpression,
  WhileStatement,
  ForStatement,
  TryStatement,
  CatchClause,
  ClassDeclaration,
  ClassBody,
  MethodDefinition,
  PropertyDefinition,
  SwitchStatement,
  SwitchCase,
  BreakStatement,
  ContinueStatement,
  ThrowStatement,
  NodeKind,
  TypeKind,
  TypeNode,
  PrimitiveType,
  LiteralType,
  ArrayType,
  ObjectType,
  FunctionType,
  UnionType,
  TypeReference,
  ParameterType,
} from '../ir/ast';

/**
 * Go代码生成选项
 */
export interface GoGenOptions {
  goVersion?: '1.18' | '1.19' | '1.20' | '1.21' | '1.22';
  useGenerics?: boolean;
  packageName?: string;
  generateTests?: boolean;
  errorHandling?: 'explicit' | 'panic' | 'wrapped';
  useInterfaces?: boolean;
  indentSize?: number;
}

/**
 * 默认生成选项
 */
const defaultOptions: GoGenOptions = {
  goVersion: '1.21',
  useGenerics: true,
  packageName: 'main',
  generateTests: false,
  errorHandling: 'explicit',
  useInterfaces: true,
  indentSize: 4,
};

/**
 * Node.js标准库到Go的映射
 */
const NODE_TO_GO_LIBS: Record<string, string> = {
  'fs': 'os, io/ioutil',
  'fs/promises': 'os',
  'path': 'path/filepath',
  'http': 'net/http',
  'https': 'net/http, crypto/tls',
  'crypto': 'crypto/*',
  'events': 'sync',
  'stream': 'io',
  'buffer': 'bytes',
  'url': 'net/url',
  'querystring': 'net/url',
  'os': 'os, runtime',
  'process': 'os, syscall',
  'util': 'fmt, strings',
  'assert': 'testing',
  'console': 'fmt',
  'timers': 'time',
  'zlib': 'compress/*',
};

/**
 * JavaScript内置对象到Go的映射
 */
const JS_TO_GO_GLOBALS: Record<string, string> = {
  'console.log': 'fmt.Println',
  'console.error': 'fmt.Fprintln(os.Stderr,',
  'console.warn': 'fmt.Fprintln(os.Stderr,',
  'JSON.stringify': 'json.Marshal',
  'JSON.parse': 'json.Unmarshal',
  'Object.keys': 'getMapKeys',
  'Object.values': 'getMapValues',
  'Object.entries': 'getMapEntries',
  'Array.isArray': 'isSlice',
  'parseInt': 'strconv.Atoi',
  'parseFloat': 'strconv.ParseFloat',
  'isNaN': 'math.IsNaN',
  'isFinite': 'math.IsInf',
  'setTimeout': 'time.AfterFunc',
  'setInterval': 'time.NewTicker',
  'clearTimeout': 'timer.Stop',
  'Promise': 'chan interface{}',
  'Map': 'map[string]interface{}',
  'Set': 'map[interface{}]struct{}',
  'Date': 'time.Time',
  'Error': 'error',
  'TypeError': 'fmt.Errorf',
};

/**
 * 运算符映射
 */
const OPERATOR_MAP: Record<string, string> = {
  '===': '==',
  '!==': '!=',
  '==': '==',
  '!=': '!=',
  '&&': '&&',
  '||': '||',
  '!': '!',
  '??': '', // Go需要显式处理nil
};

/**
 * Go代码生成器
 */
export class IRToGoGenerator {
  private options: GoGenOptions;
  private indent: number = 0;
  private output: string[] = [];
  private imports: Map<string, Set<string>> = new Map();
  private typeParams: Set<string> = new Set();
  private packageTypes: Map<string, string> = new Map();
  private needsHelpers: Set<string> = new Set();
  private inAsyncContext: boolean = false;
  private currentFunctionReturns: TypeNode | undefined;
  
  constructor(options: GoGenOptions = {}) {
    this.options = { ...defaultOptions, ...options };
    // Go < 1.18不支持泛型
    if (this.options.goVersion && parseFloat(this.options.goVersion) < 1.18) {
      this.options.useGenerics = false;
    }
  }
  
  /**
   * 生成Go代码
   * @param module Hajimi-IR模块
   * @returns Go代码字符串
   */
  generate(module: Module): string {
    this.output = [];
    this.indent = 0;
    this.imports = new Map();
    this.typeParams = new Set();
    this.needsHelpers = new Set();
    
    // 包声明
    this.output.push(`package ${this.options.packageName}`);
    this.output.push('');
    
    // 收集所有导入
    for (const imp of module.imports) {
      this.collectImports(imp);
    }
    
    // 添加必要的标准库导入
    this.addStandardImports();
    
    // 生成类型定义（接口、结构体）
    const typeDefs: Statement[] = [];
    const funcDefs: Statement[] = [];
    const varDefs: Statement[] = [];
    
    for (const stmt of module.statements) {
      if (stmt.kind === NodeKind.CLASS_DECL) {
        typeDefs.push(stmt);
      } else if (stmt.kind === NodeKind.FUNCTION_DECL) {
        funcDefs.push(stmt);
      } else if (stmt.kind === NodeKind.VARIABLE_DECL) {
        varDefs.push(stmt);
      } else {
        funcDefs.push(stmt);
      }
    }
    
    // 生成导入块
    this.generateImports();
    
    // 生成类型定义
    if (typeDefs.length > 0) {
      for (const stmt of typeDefs) {
        this.generateStatement(stmt);
      }
      this.output.push('');
    }
    
    // 生成变量定义
    if (varDefs.length > 0) {
      for (const stmt of varDefs) {
        this.generateVarDeclaration(stmt as VariableDeclaration);
      }
      this.output.push('');
    }
    
    // 生成函数定义
    for (const stmt of funcDefs) {
      this.generateStatement(stmt);
      this.output.push('');
    }
    
    // 生成辅助函数
    this.generateHelpers();
    
    return this.output.join('\n');
  }
  
  /**
   * 收集导入
   */
  private collectImports(node: ImportDeclaration): void {
    const goPkg = NODE_TO_GO_LIBS[node.source] || node.source;
    
    for (const pkg of goPkg.split(', ')) {
      const pkgName = pkg.split('/').pop() || pkg;
      if (!this.imports.has(pkg)) {
        this.imports.set(pkg, new Set());
      }
    }
  }
  
  /**
   * 添加标准库导入
   */
  private addStandardImports(): void {
    // 基础包
    this.imports.set('fmt', new Set());
    
    // 错误处理
    if (this.options.errorHandling !== 'panic') {
      this.imports.set('errors', new Set());
    }
    
    // JSON处理
    this.imports.set('encoding/json', new Set());
  }
  
  /**
   * 生成导入块
   */
  private generateImports(): void {
    if (this.imports.size === 0) return;
    
    const sortedImports = Array.from(this.imports.keys()).sort();
    
    if (sortedImports.length === 1) {
      this.output.push(`import "${sortedImports[0]}"`);
    } else {
      this.output.push('import (');
      for (const imp of sortedImports) {
        this.output.push(`    "${imp}"`);
      }
      this.output.push(')');
    }
    this.output.push('');
  }
  
  /**
   * 生成语句
   */
  private generateStatement(node: Statement): void {
    switch (node.kind) {
      case NodeKind.FUNCTION_DECL:
        this.generateFunctionDeclaration(node as FunctionDeclaration);
        break;
      case NodeKind.CLASS_DECL:
        this.generateClassDeclaration(node as ClassDeclaration);
        break;
      case NodeKind.IF_STMT:
        this.generateIfStatement(node as IfStatement);
        break;
      case NodeKind.WHILE_STMT:
        this.generateWhileStatement(node as WhileStatement);
        break;
      case NodeKind.FOR_STMT:
        this.generateForStatement(node as ForStatement);
        break;
      case NodeKind.TRY_STMT:
        this.generateTryStatement(node as TryStatement);
        break;
      case NodeKind.SWITCH_STMT:
        this.generateSwitchStatement(node as SwitchStatement);
        break;
      case NodeKind.RETURN_STMT:
        this.generateReturnStatement(node as ReturnStatement);
        break;
      case NodeKind.BREAK_STMT:
        this.output.push(`${this.getIndent()}break`);
        break;
      case NodeKind.CONTINUE_STMT:
        this.output.push(`${this.getIndent()}continue`);
        break;
      case NodeKind.BLOCK_STMT:
        this.generateBlockStatement(node as BlockStatement);
        break;
      case NodeKind.EXPRESSION_STMT:
        this.generateExpressionStatement(node as ExpressionStatement);
        break;
      default:
        this.output.push(`${this.getIndent()}// Unsupported: ${node.kind}`);
    }
  }
  
  /**
   * 生成函数声明
   */
  private generateFunctionDeclaration(node: FunctionDeclaration): void {
    const wasAsync = this.inAsyncContext;
    this.inAsyncContext = node.isAsync;
    this.currentFunctionReturns = node.returnType;
    
    const funcName = this.toPascalCase(node.id.name);
    
    // 类型参数（泛型）
    let typeParams = '';
    if (this.options.useGenerics && node.typeParameters && node.typeParameters.length > 0) {
      typeParams = `[${node.typeParameters.join(', ')} any]`;
    }
    
    // 参数
    const params = node.params.map(p => {
      const paramName = this.toCamelCase(p.name);
      const paramType = p.typeAnnotation
        ? this.generateType(p.typeAnnotation)
        : 'interface{}';
      return `${paramName} ${paramType}`;
    });
    
    // 返回类型
    let returnType = '';
    if (node.returnType) {
      returnType = ` ${this.generateType(node.returnType)}`;
    } else if (node.isAsync) {
      // 异步函数返回channel或future
      returnType = ' <-chan interface{}';
    }
    
    // 错误处理：添加error返回值
    if (this.options.errorHandling === 'explicit' && !node.returnType) {
      returnType = ' error';
    }
    
    this.output.push(`${this.getIndent()}func ${funcName}${typeParams}(${params.join(', ')})${returnType} {`);
    this.indent++;
    
    if (node.body.statements.length === 0) {
      this.output.push(`${this.getIndent()}// TODO: implement`);
    } else {
      this.generateBlockStatement(node.body);
    }
    
    this.indent--;
    this.output.push(`${this.getIndent()}}`);
    
    this.inAsyncContext = wasAsync;
    this.currentFunctionReturns = undefined;
  }
  
  /**
   * 生成类声明（转换为结构体+方法）
   */
  private generateClassDeclaration(node: ClassDeclaration): void {
    const className = this.toPascalCase(node.id.name);
    
    // 收集类型参数
    if (node.typeParameters) {
      for (const tp of node.typeParameters) {
        this.typeParams.add(tp);
      }
    }
    
    // 生成结构体
    let typeParams = '';
    if (this.options.useGenerics && node.typeParameters && node.typeParameters.length > 0) {
      typeParams = `[${node.typeParameters.join(', ')} any]`;
    }
    
    this.output.push(`${this.getIndent()}type ${className}${typeParams} struct {`);
    this.indent++;
    
    // 嵌入父类
    if (node.superClass) {
      const superName = this.generateExpression(node.superClass, false);
      this.output.push(`${this.getIndent()}${superName}`);
    }
    
    // 生成字段
    for (const member of node.body.members) {
      if (member instanceof PropertyDefinition) {
        const fieldName = this.toPascalCase(member.key.name);
        const fieldType = member.typeAnnotation
          ? this.generateType(member.typeAnnotation)
          : 'interface{}';
        const tags = member.isReadonly ? '' : '';
        this.output.push(`${this.getIndent()}${fieldName} ${fieldType}${tags}`);
      }
    }
    
    this.indent--;
    this.output.push(`${this.getIndent()}}`);
    this.output.push('');
    
    // 生成接口（如果有抽象方法或接口实现）
    if (node.implements.length > 0 || this.hasAbstractMethods(node)) {
      this.generateInterface(node, className);
    }
    
    // 生成方法
    for (const member of node.body.members) {
      if (member instanceof MethodDefinition) {
        this.generateMethodDefinition(member, className);
      }
    }
  }
  
  /**
   * 检查是否有抽象方法
   */
  private hasAbstractMethods(node: ClassDeclaration): boolean {
    return node.body.members.some(m => 
      m instanceof MethodDefinition && m.isAbstract
    );
  }
  
  /**
   * 生成接口
   */
  private generateInterface(node: ClassDeclaration, className: string): void {
    this.output.push(`${this.getIndent()}type ${className}Interface interface {`);
    this.indent++;
    
    for (const member of node.body.members) {
      if (member instanceof MethodDefinition && member.isAbstract) {
        const methodName = this.toPascalCase(member.key.name);
        const params = member.value.params.map((p, i) => {
          const paramType = p.typeAnnotation
            ? this.generateType(p.typeAnnotation)
            : 'interface{}';
          return `arg${i} ${paramType}`;
        });
        const returnType = member.value.returnType
          ? this.generateType(member.value.returnType)
          : '';
        this.output.push(`${this.getIndent()}${methodName}(${params.join(', ')})${returnType ? ' ' + returnType : ''}`);
      }
    }
    
    this.indent--;
    this.output.push(`${this.getIndent()}}`);
    this.output.push('');
  }
  
  /**
   * 生成方法定义
   */
  private generateMethodDefinition(node: MethodDefinition, className: string): void {
    if (node.isAbstract) return; // 抽象方法在接口中定义
    
    const wasAsync = this.inAsyncContext;
    this.inAsyncContext = node.isAsync;
    
    const receiverName = this.toCamelCase(className[0].toLowerCase());
    const receiver = `(${receiverName} *${className})`;
    const methodName = this.toPascalCase(node.key.name);
    
    // 参数（跳过第一个receiver参数）
    const params = node.value.params.slice(0).map((p, i) => {
      const paramName = this.toCamelCase(p.name);
      const paramType = p.typeAnnotation
        ? this.generateType(p.typeAnnotation)
        : 'interface{}';
      return `${paramName} ${paramType}`;
    });
    
    // 返回类型
    let returnType = '';
    if (node.value.returnType) {
      returnType = ` ${this.generateType(node.value.returnType)}`;
    }
    
    this.output.push(`${this.getIndent()}func ${receiver} ${methodName}(${params.join(', ')})${returnType} {`);
    this.indent++;
    
    if (node.value.body.statements.length === 0) {
      this.output.push(`${this.getIndent()}// TODO: implement`);
    } else {
      this.generateBlockStatement(node.value.body);
    }
    
    this.indent--;
    this.output.push(`${this.getIndent()}}`);
    this.output.push('');
    
    this.inAsyncContext = wasAsync;
  }
  
  /**
   * 生成变量声明（在包级别）
   */
  private generateVarDeclaration(node: VariableDeclaration): void {
    const keyword = node.isConst ? 'const' : 'var';
    
    for (const decl of node.declarations) {
      const varName = this.toPascalCase(decl.id.name);
      const varType = decl.id.typeAnnotation
        ? this.generateType(decl.id.typeAnnotation)
        : '';
      
      if (decl.init) {
        const value = this.generateExpression(decl.init, false);
        if (varType) {
          this.output.push(`${this.getIndent()}${keyword} ${varName} ${varType} = ${value}`);
        } else {
          this.output.push(`${this.getIndent()}${keyword} ${varName} = ${value}`);
        }
      } else {
        this.output.push(`${this.getIndent()}var ${varName} ${varType}`);
      }
    }
  }
  
  /**
   * 生成If语句
   */
  private generateIfStatement(node: IfStatement): void {
    const condition = this.generateExpression(node.condition, false);
    this.output.push(`${this.getIndent()}if ${condition} {`);
    this.indent++;
    this.generateStatement(node.consequent);
    this.indent--;
    
    if (node.alternate) {
      if (node.alternate.kind === NodeKind.IF_STMT) {
        this.output.push(`${this.getIndent()}} else if ${this.generateExpression((node.alternate as IfStatement).condition, false)} {`);
        this.indent++;
        this.generateStatement((node.alternate as IfStatement).consequent);
        this.indent--;
        
        if ((node.alternate as IfStatement).alternate) {
          this.output.push(`${this.getIndent()}} else {`);
          this.indent++;
          this.generateStatement((node.alternate as IfStatement).alternate!);
          this.indent--;
        }
      } else {
        this.output.push(`${this.getIndent()}} else {`);
        this.indent++;
        this.generateStatement(node.alternate);
        this.indent--;
      }
    }
    
    this.output.push(`${this.getIndent()}}`);
  }
  
  /**
   * 生成While语句
   */
  private generateWhileStatement(node: WhileStatement): void {
    if (node.isDoWhile) {
      // Go没有do-while
      this.output.push(`${this.getIndent()}for {`);
      this.indent++;
      this.generateStatement(node.body);
      const condition = this.generateExpression(node.condition, false);
      this.output.push(`${this.getIndent()}if !(${condition}) {`);
      this.indent++;
      this.output.push(`${this.getIndent()}break`);
      this.indent--;
      this.output.push(`${this.getIndent()}}`);
      this.indent--;
      this.output.push(`${this.getIndent()}}`);
    } else {
      const condition = this.generateExpression(node.condition, false);
      this.output.push(`${this.getIndent()}for ${condition} {`);
      this.indent++;
      this.generateStatement(node.body);
      this.indent--;
      this.output.push(`${this.getIndent()}}`);
    }
  }
  
  /**
   * 生成For语句
   */
  private generateForStatement(node: ForStatement): void {
    // Go的for循环
    if (node.init && node.condition && node.update) {
      // 转换为Go的for init; cond; post {}
      let init = '';
      if (node.init.kind === NodeKind.VARIABLE_DECL) {
        const decl = (node.init as VariableDeclaration).declarations[0];
        const initValue = decl.init ? this.generateExpression(decl.init, false) : '0';
        init = `${this.toCamelCase(decl.id.name)} := ${initValue}`;
      }
      
      const cond = this.generateExpression(node.condition, false);
      const update = this.generateExpression(node.update, false);
      
      this.output.push(`${this.getIndent()}for ${init}; ${cond}; ${update} {`);
    } else {
      this.output.push(`${this.getIndent()}for {`);
    }
    
    this.indent++;
    this.generateStatement(node.body);
    this.indent--;
    this.output.push(`${this.getIndent()}}`);
  }
  
  /**
   * 生成Try语句
   */
  private generateTryStatement(node: TryStatement): void {
    // Go使用显式错误处理，不是try-catch
    // 将try块转换为函数调用并处理错误
    this.output.push(`${this.getIndent()}// Translated from try-catch`);
    this.output.push(`${this.getIndent()}func() {`);
    this.indent++;
    this.generateBlockStatement(node.block);
    this.indent--;
    this.output.push(`${this.getIndent()}}()`);
    
    if (node.handler) {
      this.output.push(`${this.getIndent()}// Error handling: ${node.handler.param?.name || 'err'}`);
    }
  }
  
  /**
   * 生成Switch语句
   */
  private generateSwitchStatement(node: SwitchStatement): void {
    const discriminant = this.generateExpression(node.discriminant, false);
    
    // Go的switch可以switch on value
    this.output.push(`${this.getIndent()}switch ${discriminant} {`);
    
    for (const case_ of node.cases) {
      if (case_.test) {
        const test = this.generateExpression(case_.test, false);
        this.output.push(`${this.getIndent()}case ${test}:`);
      } else {
        this.output.push(`${this.getIndent()}default:`);
      }
      
      this.indent++;
      for (const stmt of case_.consequent) {
        this.generateStatement(stmt);
      }
      this.indent--;
    }
    
    this.output.push(`${this.getIndent()}}`);
  }
  
  /**
   * 生成Return语句
   */
  private generateReturnStatement(node: ReturnStatement): void {
    if (node.argument) {
      const value = this.generateExpression(node.argument, false);
      this.output.push(`${this.getIndent()}return ${value}`);
    } else {
      this.output.push(`${this.getIndent()}return`);
    }
  }
  
  /**
   * 生成表达式语句
   */
  private generateExpressionStatement(node: ExpressionStatement): void {
    const expr = this.generateExpression(node.expression, false);
    this.output.push(`${this.getIndent()}${expr}`);
  }
  
  /**
   * 生成块语句
   */
  private generateBlockStatement(node: BlockStatement): void {
    for (const stmt of node.statements) {
      this.generateStatement(stmt);
    }
  }
  
  /**
   * 生成表达式
   */
  private generateExpression(node: Expression, parenthesize: boolean = false): string {
    switch (node.kind) {
      case NodeKind.IDENTIFIER:
        return this.toCamelCase((node as Identifier).name);
      case NodeKind.LITERAL:
        return this.generateLiteral(node as Literal);
      case NodeKind.BINARY_EXPR:
        return this.generateBinaryExpression(node as BinaryExpression, parenthesize);
      case NodeKind.UNARY_EXPR:
        return this.generateUnaryExpression(node as UnaryExpression, parenthesize);
      case NodeKind.CALL_EXPR:
        return this.generateCallExpression(node as CallExpression);
      case NodeKind.MEMBER_EXPR:
        return this.generateMemberExpression(node as MemberExpression);
      case NodeKind.ARRAY_EXPR:
        return this.generateArrayExpression(node as ArrayExpression);
      case NodeKind.OBJECT_EXPR:
        return this.generateObjectExpression(node as ObjectExpression);
      case NodeKind.CONDITIONAL_EXPR:
        return this.generateConditionalExpression(node as ConditionalExpression, parenthesize);
      case NodeKind.AWAIT_EXPR:
        return this.generateAwaitExpression(node as AwaitExpression);
      default:
        return `/* Unsupported: ${node.kind} */`;
    }
  }
  
  /**
   * 生成字面量
   */
  private generateLiteral(node: Literal): string {
    if (node.value === null) return 'nil';
    if (node.value === undefined) return 'nil';
    if (typeof node.value === 'boolean') return node.value ? 'true' : 'false';
    if (typeof node.value === 'string') return this.stringLiteral(node.value);
    return String(node.value);
  }
  
  /**
   * 字符串字面量转义
   */
  private stringLiteral(str: string): string {
    // Go使用双引号字符串
    return JSON.stringify(str);
  }
  
  /**
   * 生成二元表达式
   */
  private generateBinaryExpression(node: BinaryExpression, parenthesize: boolean): string {
    const left = this.generateExpression(node.left, true);
    const right = this.generateExpression(node.right, true);
    const op = OPERATOR_MAP[node.operator] || node.operator;
    
    const result = `${left} ${op} ${right}`;
    return parenthesize ? `(${result})` : result;
  }
  
  /**
   * 生成一元表达式
   */
  private generateUnaryExpression(node: UnaryExpression, parenthesize: boolean): string {
    const operand = this.generateExpression(node.operand, true);
    const op = OPERATOR_MAP[node.operator] || node.operator;
    
    const result = node.isPrefix ? `${op}${operand}` : `${operand}${op}`;
    return parenthesize ? `(${result})` : result;
  }
  
  /**
   * 生成调用表达式
   */
  private generateCallExpression(node: CallExpression): string {
    const callee = this.generateExpression(node.callee, false);
    
    // 检查内置映射
    const mappedCallee = JS_TO_GO_GLOBALS[callee] || callee;
    
    const args = node.arguments.map(arg => {
      if (arg.kind === NodeKind.SPREAD_ELEMENT) {
        // Go不支持spread操作符，需要展开
        return this.generateExpression((arg as SpreadElement).argument, false);
      }
      return this.generateExpression(arg, false);
    });
    
    return `${mappedCallee}(${args.join(', ')})`;
  }
  
  /**
   * 生成成员表达式
   */
  private generateMemberExpression(node: MemberExpression): string {
    const obj = this.generateExpression(node.object, false);
    
    if (node.computed) {
      const prop = this.generateExpression(node.property as Expression, false);
      // Go的map/slice索引
      return `${obj}[${prop}]`;
    } else {
      const prop = this.toPascalCase((node.property as Identifier).name);
      
      // 特殊属性映射
      if (prop === 'Length') {
        this.imports.set('len', new Set());
        return `len(${obj})`;
      }
      
      return `${obj}.${prop}`;
    }
  }
  
  /**
   * 生成数组表达式
   */
  private generateArrayExpression(node: ArrayExpression): string {
    const elements = node.elements
      .filter(e => e !== null)
      .map(e => this.generateExpression(e!, false));
    
    if (elements.length === 0) {
      return '[]interface{}{}';
    }
    
    // 尝试推断类型
    return `[]interface{}{${elements.join(', ')}}`;
  }
  
  /**
   * 生成对象表达式（Go map）
   */
  private generateObjectExpression(node: ObjectExpression): string {
    if (node.properties.length === 0) {
      return 'map[string]interface{}{}';
    }
    
    const items: string[] = [];
    for (const prop of node.properties) {
      if (prop.key.kind === NodeKind.IDENTIFIER) {
        const key = (prop.key as Identifier).name;
        const value = this.generateExpression(prop.value, false);
        items.push(`"${key}": ${value}`);
      }
    }
    
    return `map[string]interface{}{${items.join(', ')}}`;
  }
  
  /**
   * 生成条件表达式
   */
  private generateConditionalExpression(node: ConditionalExpression, parenthesize: boolean): string {
    const condition = this.generateExpression(node.condition, false);
    const consequent = this.generateExpression(node.consequent, false);
    const alternate = this.generateExpression(node.alternate, false);
    
    // Go没有三元运算符，使用函数或if语句
    return `func() interface{} { if ${condition} { return ${consequent} }; return ${alternate} }()`;
  }
  
  /**
   * 生成Await表达式
   */
  private generateAwaitExpression(node: AwaitExpression): string {
    // Go使用channel接收
    const argument = this.generateExpression(node.argument, false);
    return `<-${argument}`;
  }
  
  /**
   * 生成类型
   */
  private generateType(type: TypeNode): string {
    switch (type.kind) {
      case TypeKind.STRING:
        return 'string';
      case TypeKind.NUMBER:
        return 'float64'; // Go默认浮点数
      case TypeKind.BIGINT:
        return 'int64';
      case TypeKind.BOOLEAN:
        return 'bool';
      case TypeKind.VOID:
        return '';
      case TypeKind.ANY:
      case TypeKind.UNKNOWN:
        return 'interface{}';
      case TypeKind.NULL:
      case TypeKind.UNDEFINED:
        return 'nil';
      case TypeKind.ARRAY:
      case TypeKind.SLICE:
        const elemType = this.generateType((type as ArrayType).elementType);
        return `[]${elemType}`;
      case TypeKind.MAP:
      case TypeKind.OBJECT:
      case TypeKind.DICT:
        return 'map[string]interface{}';
      case TypeKind.FUNCTION:
        return 'func()';
      case TypeKind.TYPE_REF:
        return this.toPascalCase((type as TypeReference).name);
      case TypeKind.UNION:
        // Go不支持union类型，使用interface{}
        return 'interface{}';
      case TypeKind.LITERAL:
        const lit = (type as LiteralType).value;
        if (typeof lit === 'string') return 'string';
        if (typeof lit === 'number') return 'float64';
        if (typeof lit === 'boolean') return 'bool';
        return 'interface{}';
      default:
        return 'interface{}';
    }
  }
  
  /**
   * 生成辅助函数
   */
  private generateHelpers(): void {
    if (this.needsHelpers.size === 0) return;
    
    this.output.push('// Helper functions');
    this.output.push('');
    
    if (this.needsHelpers.has('mapKeys')) {
      this.output.push(`func getMapKeys(m map[string]interface{}) []string {`);
      this.indent++;
      this.output.push(`${this.getIndent()}keys := make([]string, 0, len(m))`);
      this.output.push(`${this.getIndent()}for k := range m {`);
      this.indent++;
      this.output.push(`${this.getIndent()}keys = append(keys, k)`);
      this.indent--;
      this.output.push(`${this.getIndent()}}`);
      this.output.push(`${this.getIndent()}return keys`);
      this.indent--;
      this.output.push('}');
      this.output.push('');
    }
  }
  
  /**
   * 获取缩进
   */
  private getIndent(): string {
    return '    '.repeat(this.indent);
  }
  
  /**
   * 转换为camelCase
   */
  private toCamelCase(name: string): string {
    // 首字母小写
    return name.charAt(0).toLowerCase() + name.slice(1);
  }
  
  /**
   * 转换为PascalCase
   */
  private toPascalCase(name: string): string {
    // 首字母大写（Go导出需要）
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
}

/**
 * 生成入口函数
 */
export function generateGo(module: Module, options?: GoGenOptions): string {
  const generator = new IRToGoGenerator(options);
  return generator.generate(module);
}

// 默认导出
export default {
  IRToGoGenerator,
  generateGo,
  NODE_TO_GO_LIBS,
  JS_TO_GO_GLOBALS,
};
