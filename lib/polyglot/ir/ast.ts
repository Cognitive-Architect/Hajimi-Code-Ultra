/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * Hajimi-IR AST节点定义
 * 
 * 提供语言无关的中间表示，支持Node.js/Python/Go互相转换
 * @module lib/polyglot/ir/ast
 */

/**
 * 源代码位置追踪
 */
export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
}

/**
 * 创建源代码位置
 */
export function createLocation(
  file: string,
  line: number,
  column: number,
  offset: number = 0
): SourceLocation {
  return { file, line, column, offset };
}

/**
 * 通用类型系统
 */
export enum TypeKind {
  // 基础类型
  VOID = 'void',
  NULL = 'null',
  UNDEFINED = 'undefined',
  BOOLEAN = 'boolean',
  NUMBER = 'number',
  STRING = 'string',
  BIGINT = 'bigint',
  SYMBOL = 'symbol',
  
  // 复合类型
  ARRAY = 'array',
  TUPLE = 'tuple',
  OBJECT = 'object',
  FUNCTION = 'function',
  CLASS = 'class',
  INTERFACE = 'interface',
  UNION = 'union',
  INTERSECTION = 'intersection',
  
  // 泛型与高级类型
  GENERIC = 'generic',
  OPTIONAL = 'optional',
  MAPPED = 'mapped',
  CONDITIONAL = 'conditional',
  
  // 特殊类型
  ANY = 'any',
  UNKNOWN = 'unknown',
  NEVER = 'never',
  LITERAL = 'literal',
  TYPE_REF = 'type_ref',
  
  // Go特定
  CHANNEL = 'channel',
  SLICE = 'slice',
  MAP = 'map',
  POINTER = 'pointer',
  STRUCT = 'struct',
  
  // Python特定
  DICT = 'dict',
  LIST = 'list',
  SET = 'set',
  COROUTINE = 'coroutine',
}

/**
 * 类型节点基类
 */
export abstract class TypeNode {
  abstract readonly kind: TypeKind;
  readonly loc?: SourceLocation;
  
  constructor(loc?: SourceLocation) {
    this.loc = loc;
  }
  
  abstract toString(): string;
}

/**
 * 基础类型
 */
export class PrimitiveType extends TypeNode {
  readonly kind: TypeKind;
  
  constructor(kind: TypeKind, loc?: SourceLocation) {
    super(loc);
    this.kind = kind;
  }
  
  toString(): string {
    return this.kind;
  }
}

/**
 * 字面量类型 (如: "hello", 42, true)
 */
export class LiteralType extends TypeNode {
  readonly kind = TypeKind.LITERAL;
  readonly value: string | number | boolean | null;
  
  constructor(value: string | number | boolean | null, loc?: SourceLocation) {
    super(loc);
    this.value = value;
  }
  
  toString(): string {
    return JSON.stringify(this.value);
  }
}

/**
 * 数组/列表类型
 */
export class ArrayType extends TypeNode {
  readonly kind = TypeKind.ARRAY;
  readonly elementType: TypeNode;
  readonly isSlice: boolean; // Go slice vs array
  
  constructor(elementType: TypeNode, isSlice: boolean = true, loc?: SourceLocation) {
    super(loc);
    this.elementType = elementType;
    this.isSlice = isSlice;
  }
  
  toString(): string {
    return `${this.elementType.toString()}[]`;
  }
}

/**
 * 对象/字典类型
 */
export class ObjectType extends TypeNode {
  readonly kind = TypeKind.OBJECT;
  readonly properties: Map<string, TypeNode>;
  readonly indexType?: { key: TypeNode; value: TypeNode }; // 索引签名
  
  constructor(
    properties: Map<string, TypeNode> | Record<string, TypeNode>,
    indexType?: { key: TypeNode; value: TypeNode },
    loc?: SourceLocation
  ) {
    super(loc);
    this.properties = properties instanceof Map 
      ? properties 
      : new Map(Object.entries(properties));
    this.indexType = indexType;
  }
  
  toString(): string {
    const props = Array.from(this.properties.entries())
      .map(([k, v]) => `${k}: ${v.toString()}`)
      .join(', ');
    return `{ ${props} }`;
  }
}

/**
 * 函数类型
 */
export class FunctionType extends TypeNode {
  readonly kind = TypeKind.FUNCTION;
  readonly parameters: ParameterType[];
  readonly returnType: TypeNode;
  readonly isAsync: boolean;
  readonly isGenerator: boolean;
  readonly typeParameters?: string[]; // 泛型参数
  
  constructor(
    parameters: ParameterType[],
    returnType: TypeNode,
    options: {
      isAsync?: boolean;
      isGenerator?: boolean;
      typeParameters?: string[];
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.parameters = parameters;
    this.returnType = returnType;
    this.isAsync = options.isAsync ?? false;
    this.isGenerator = options.isGenerator ?? false;
    this.typeParameters = options.typeParameters;
  }
  
  toString(): string {
    const params = this.parameters.map(p => p.toString()).join(', ');
    const generics = this.typeParameters ? `<${this.typeParameters.join(', ')}>` : '';
    const async = this.isAsync ? 'async ' : '';
    return `${async}${generics}(${params}) => ${this.returnType.toString()}`;
  }
}

/**
 * 函数参数类型
 */
export class ParameterType {
  readonly name: string;
  readonly type: TypeNode;
  readonly isOptional: boolean;
  readonly isRest: boolean;
  readonly defaultValue?: Expression;
  
  constructor(
    name: string,
    type: TypeNode,
    options: {
      isOptional?: boolean;
      isRest?: boolean;
      defaultValue?: Expression;
    } = {}
  ) {
    this.name = name;
    this.type = type;
    this.isOptional = options.isOptional ?? false;
    this.isRest = options.isRest ?? false;
    this.defaultValue = options.defaultValue;
  }
  
  toString(): string {
    const rest = this.isRest ? '...' : '';
    const optional = this.isOptional && !this.isRest ? '?' : '';
    return `${rest}${this.name}${optional}: ${this.type.toString()}`;
  }
}

/**
 * 联合类型 (A | B)
 */
export class UnionType extends TypeNode {
  readonly kind = TypeKind.UNION;
  readonly types: TypeNode[];
  
  constructor(types: TypeNode[], loc?: SourceLocation) {
    super(loc);
    this.types = types;
  }
  
  toString(): string {
    return this.types.map(t => t.toString()).join(' | ');
  }
}

/**
 * 类型引用
 */
export class TypeReference extends TypeNode {
  readonly kind = TypeKind.TYPE_REF;
  readonly name: string;
  readonly typeArguments?: TypeNode[];
  
  constructor(name: string, typeArguments?: TypeNode[], loc?: SourceLocation) {
    super(loc);
    this.name = name;
    this.typeArguments = typeArguments;
  }
  
  toString(): string {
    const args = this.typeArguments ? `<${this.typeArguments.map(t => t.toString()).join(', ')}>` : '';
    return `${this.name}${args}`;
  }
}

/**
 * AST节点类型枚举
 */
export enum NodeKind {
  // 表达式
  LITERAL = 'literal',
  IDENTIFIER = 'identifier',
  BINARY_EXPR = 'binary_expr',
  UNARY_EXPR = 'unary_expr',
  CALL_EXPR = 'call_expr',
  MEMBER_EXPR = 'member_expr',
  ARRAY_EXPR = 'array_expr',
  OBJECT_EXPR = 'object_expr',
  ARROW_FUNCTION = 'arrow_function',
  FUNCTION_EXPR = 'function_expr',
  AWAIT_EXPR = 'await_expr',
  SPREAD_ELEMENT = 'spread_element',
  CONDITIONAL_EXPR = 'conditional_expr',
  TEMPLATE_LITERAL = 'template_literal',
  
  // 语句
  EXPRESSION_STMT = 'expression_stmt',
  VARIABLE_DECL = 'variable_decl',
  FUNCTION_DECL = 'function_decl',
  CLASS_DECL = 'class_decl',
  INTERFACE_DECL = 'interface_decl',
  IF_STMT = 'if_stmt',
  WHILE_STMT = 'while_stmt',
  FOR_STMT = 'for_stmt',
  FOR_OF_STMT = 'for_of_stmt',
  SWITCH_STMT = 'switch_stmt',
  TRY_STMT = 'try_stmt',
  RETURN_STMT = 'return_stmt',
  THROW_STMT = 'throw_stmt',
  BREAK_STMT = 'break_stmt',
  CONTINUE_STMT = 'continue_stmt',
  BLOCK_STMT = 'block_stmt',
  IMPORT_DECL = 'import_decl',
  EXPORT_DECL = 'export_decl',
  
  // 模块
  MODULE = 'module',
  COMMENT = 'comment',
}

/**
 * AST节点基类
 */
export abstract class ASTNode {
  abstract readonly kind: NodeKind;
  readonly loc?: SourceLocation;
  readonly leadingComments?: Comment[];
  readonly trailingComments?: Comment[];
  
  constructor(loc?: SourceLocation) {
    this.loc = loc;
  }
}

/**
 * 注释节点
 */
export class Comment extends ASTNode {
  readonly kind = NodeKind.COMMENT;
  readonly text: string;
  readonly isBlock: boolean;
  readonly isJSDoc: boolean;
  
  constructor(text: string, isBlock: boolean = false, isJSDoc: boolean = false, loc?: SourceLocation) {
    super(loc);
    this.text = text;
    this.isBlock = isBlock;
    this.isJSDoc = isJSDoc;
  }
}

/**
 * 标识符
 */
export class Identifier extends ASTNode {
  readonly kind = NodeKind.IDENTIFIER;
  readonly name: string;
  readonly typeAnnotation?: TypeNode;
  
  constructor(name: string, typeAnnotation?: TypeNode, loc?: SourceLocation) {
    super(loc);
    this.name = name;
    this.typeAnnotation = typeAnnotation;
  }
}

/**
 * 字面量表达式
 */
export class Literal extends ASTNode {
  readonly kind = NodeKind.LITERAL;
  readonly value: string | number | boolean | null | undefined;
  readonly raw: string;
  
  constructor(value: string | number | boolean | null | undefined, raw?: string, loc?: SourceLocation) {
    super(loc);
    this.value = value;
    this.raw = raw ?? JSON.stringify(value);
  }
}

/**
 * 二元表达式
 */
export class BinaryExpression extends ASTNode {
  readonly kind = NodeKind.BINARY_EXPR;
  readonly operator: string;
  readonly left: Expression;
  readonly right: Expression;
  
  constructor(operator: string, left: Expression, right: Expression, loc?: SourceLocation) {
    super(loc);
    this.operator = operator;
    this.left = left;
    this.right = right;
  }
}

/**
 * 一元表达式
 */
export class UnaryExpression extends ASTNode {
  readonly kind = NodeKind.UNARY_EXPR;
  readonly operator: string;
  readonly operand: Expression;
  readonly isPrefix: boolean;
  
  constructor(operator: string, operand: Expression, isPrefix: boolean = true, loc?: SourceLocation) {
    super(loc);
    this.operator = operator;
    this.operand = operand;
    this.isPrefix = isPrefix;
  }
}

/**
 * 调用表达式
 */
export class CallExpression extends ASTNode {
  readonly kind = NodeKind.CALL_EXPR;
  readonly callee: Expression;
  readonly arguments: Expression[];
  readonly typeArguments?: TypeNode[];
  readonly isOptional: boolean; // 可选链 ?.
  
  constructor(
    callee: Expression,
    args: Expression[],
    options: {
      typeArguments?: TypeNode[];
      isOptional?: boolean;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.callee = callee;
    this.arguments = args;
    this.typeArguments = options.typeArguments;
    this.isOptional = options.isOptional ?? false;
  }
}

/**
 * 成员表达式
 */
export class MemberExpression extends ASTNode {
  readonly kind = NodeKind.MEMBER_EXPR;
  readonly object: Expression;
  readonly property: Expression | Identifier;
  readonly computed: boolean; // true: obj[prop], false: obj.prop
  readonly isOptional: boolean;
  
  constructor(
    object: Expression,
    property: Expression | Identifier,
    computed: boolean = false,
    isOptional: boolean = false,
    loc?: SourceLocation
  ) {
    super(loc);
    this.object = object;
    this.property = property;
    this.computed = computed;
    this.isOptional = isOptional;
  }
}

/**
 * 数组表达式
 */
export class ArrayExpression extends ASTNode {
  readonly kind = NodeKind.ARRAY_EXPR;
  readonly elements: (Expression | null)[]; // null for sparse array holes
  
  constructor(elements: (Expression | null)[], loc?: SourceLocation) {
    super(loc);
    this.elements = elements;
  }
}

/**
 * 对象表达式
 */
export class ObjectExpression extends ASTNode {
  readonly kind = NodeKind.OBJECT_EXPR;
  readonly properties: Property[];
  
  constructor(properties: Property[], loc?: SourceLocation) {
    super(loc);
    this.properties = properties;
  }
}

/**
 * 对象属性
 */
export class Property extends ASTNode {
  readonly kind = NodeKind.OBJECT_EXPR; // Reuse for simplicity
  readonly key: Expression | Identifier;
  readonly value: Expression;
  readonly computed: boolean;
  readonly shorthand: boolean;
  readonly method: boolean;
  
  constructor(
    key: Expression | Identifier,
    value: Expression,
    options: {
      computed?: boolean;
      shorthand?: boolean;
      method?: boolean;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.key = key;
    this.value = value;
    this.computed = options.computed ?? false;
    this.shorthand = options.shorthand ?? false;
    this.method = options.method ?? false;
  }
}

/**
 * 箭头函数表达式
 */
export class ArrowFunction extends ASTNode {
  readonly kind = NodeKind.ARROW_FUNCTION;
  readonly params: Identifier[];
  readonly body: Expression | BlockStatement;
  readonly returnType?: TypeNode;
  readonly isAsync: boolean;
  readonly typeParameters?: string[];
  
  constructor(
    params: Identifier[],
    body: Expression | BlockStatement,
    options: {
      returnType?: TypeNode;
      isAsync?: boolean;
      typeParameters?: string[];
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.params = params;
    this.body = body;
    this.returnType = options.returnType;
    this.isAsync = options.isAsync ?? false;
    this.typeParameters = options.typeParameters;
  }
}

/**
 * 函数声明
 */
export class FunctionDeclaration extends ASTNode {
  readonly kind = NodeKind.FUNCTION_DECL;
  readonly id: Identifier;
  readonly params: Identifier[];
  readonly body: BlockStatement;
  readonly returnType?: TypeNode;
  readonly isAsync: boolean;
  readonly isGenerator: boolean;
  readonly isExport: boolean;
  readonly typeParameters?: string[];
  
  constructor(
    id: Identifier,
    params: Identifier[],
    body: BlockStatement,
    options: {
      returnType?: TypeNode;
      isAsync?: boolean;
      isGenerator?: boolean;
      isExport?: boolean;
      typeParameters?: string[];
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.id = id;
    this.params = params;
    this.body = body;
    this.returnType = options.returnType;
    this.isAsync = options.isAsync ?? false;
    this.isGenerator = options.isGenerator ?? false;
    this.isExport = options.isExport ?? false;
    this.typeParameters = options.typeParameters;
  }
}

/**
 * 变量声明
 */
export class VariableDeclaration extends ASTNode {
  readonly kind = NodeKind.VARIABLE_DECL;
  readonly declarations: VariableDeclarator[];
  readonly isConst: boolean; // const vs let/var
  readonly isExport: boolean;
  
  constructor(
    declarations: VariableDeclarator[],
    isConst: boolean = true,
    isExport: boolean = false,
    loc?: SourceLocation
  ) {
    super(loc);
    this.declarations = declarations;
    this.isConst = isConst;
    this.isExport = isExport;
  }
}

/**
 * 变量声明符
 */
export class VariableDeclarator extends ASTNode {
  readonly kind = NodeKind.VARIABLE_DECL;
  readonly id: Identifier;
  readonly init?: Expression;
  
  constructor(id: Identifier, init?: Expression, loc?: SourceLocation) {
    super(loc);
    this.id = id;
    this.init = init;
  }
}

/**
 * 块语句
 */
export class BlockStatement extends ASTNode {
  readonly kind = NodeKind.BLOCK_STMT;
  readonly statements: Statement[];
  
  constructor(statements: Statement[], loc?: SourceLocation) {
    super(loc);
    this.statements = statements;
  }
}

/**
 * If语句
 */
export class IfStatement extends ASTNode {
  readonly kind = NodeKind.IF_STMT;
  readonly condition: Expression;
  readonly consequent: Statement;
  readonly alternate?: Statement;
  
  constructor(condition: Expression, consequent: Statement, alternate?: Statement, loc?: SourceLocation) {
    super(loc);
    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
  }
}

/**
 * Return语句
 */
export class ReturnStatement extends ASTNode {
  readonly kind = NodeKind.RETURN_STMT;
  readonly argument?: Expression;
  
  constructor(argument?: Expression, loc?: SourceLocation) {
    super(loc);
    this.argument = argument;
  }
}

/**
 * 表达式语句
 */
export class ExpressionStatement extends ASTNode {
  readonly kind = NodeKind.EXPRESSION_STMT;
  readonly expression: Expression;
  
  constructor(expression: Expression, loc?: SourceLocation) {
    super(loc);
    this.expression = expression;
  }
}

/**
 * 导入声明
 */
export class ImportDeclaration extends ASTNode {
  readonly kind = NodeKind.IMPORT_DECL;
  readonly source: string;
  readonly specifiers: ImportSpecifier[];
  readonly isTypeOnly: boolean;
  
  constructor(
    source: string,
    specifiers: ImportSpecifier[] = [],
    isTypeOnly: boolean = false,
    loc?: SourceLocation
  ) {
    super(loc);
    this.source = source;
    this.specifiers = specifiers;
    this.isTypeOnly = isTypeOnly;
  }
}

/**
 * 导入说明符
 */
export class ImportSpecifier {
  readonly local: string;
  readonly imported?: string; // 未指定时与local相同
  readonly isDefault: boolean;
  readonly isNamespace: boolean;
  
  constructor(
    local: string,
    options: {
      imported?: string;
      isDefault?: boolean;
      isNamespace?: boolean;
    } = {}
  ) {
    this.local = local;
    this.imported = options.imported;
    this.isDefault = options.isDefault ?? false;
    this.isNamespace = options.isNamespace ?? false;
  }
}

/**
 * 模块（根节点）
 */
export class Module extends ASTNode {
  readonly kind = NodeKind.MODULE;
  readonly fileName: string;
  readonly statements: Statement[];
  readonly imports: ImportDeclaration[];
  readonly exports: ExportDeclaration[];
  readonly comments: Comment[];
  
  constructor(
    fileName: string,
    statements: Statement[] = [],
    options: {
      imports?: ImportDeclaration[];
      exports?: ExportDeclaration[];
      comments?: Comment[];
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.fileName = fileName;
    this.statements = statements;
    this.imports = options.imports ?? [];
    this.exports = options.exports ?? [];
    this.comments = options.comments ?? [];
  }
}

/**
 * 导出声明
 */
export class ExportDeclaration extends ASTNode {
  readonly kind = NodeKind.EXPORT_DECL;
  readonly declaration?: Statement;
  readonly specifiers?: ExportSpecifier[];
  readonly source?: string; // re-export
  readonly isDefault: boolean;
  
  constructor(
    options: {
      declaration?: Statement;
      specifiers?: ExportSpecifier[];
      source?: string;
      isDefault?: boolean;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.declaration = options.declaration;
    this.specifiers = options.specifiers;
    this.source = options.source;
    this.isDefault = options.isDefault ?? false;
  }
}

/**
 * 导出说明符
 */
export class ExportSpecifier {
  readonly local: string;
  readonly exported: string;
  
  constructor(local: string, exported?: string) {
    this.local = local;
    this.exported = exported ?? local;
  }
}

// 类型别名：表达式
export type Expression = 
  | Identifier
  | Literal
  | BinaryExpression
  | UnaryExpression
  | CallExpression
  | MemberExpression
  | ArrayExpression
  | ObjectExpression
  | ArrowFunction
  | AwaitExpression
  | SpreadElement
  | ConditionalExpression;

// 类型别名：语句
export type Statement =
  | ExpressionStatement
  | VariableDeclaration
  | FunctionDeclaration
  | IfStatement
  | BlockStatement
  | ReturnStatement
  | WhileStatement
  | ForStatement
  | TryStatement
  | ImportDeclaration
  | ExportDeclaration
  | ClassDeclaration
  | SwitchStatement
  | BreakStatement
  | ContinueStatement
  | ThrowStatement;

// 其他缺失的类型声明
export class AwaitExpression extends ASTNode {
  readonly kind = NodeKind.AWAIT_EXPR;
  readonly argument: Expression;
  
  constructor(argument: Expression, loc?: SourceLocation) {
    super(loc);
    this.argument = argument;
  }
}

export class SpreadElement extends ASTNode {
  readonly kind = NodeKind.SPREAD_ELEMENT;
  readonly argument: Expression;
  
  constructor(argument: Expression, loc?: SourceLocation) {
    super(loc);
    this.argument = argument;
  }
}

export class ConditionalExpression extends ASTNode {
  readonly kind = NodeKind.CONDITIONAL_EXPR;
  readonly condition: Expression;
  readonly consequent: Expression;
  readonly alternate: Expression;
  
  constructor(condition: Expression, consequent: Expression, alternate: Expression, loc?: SourceLocation) {
    super(loc);
    this.condition = condition;
    this.consequent = consequent;
    this.alternate = alternate;
  }
}

export class WhileStatement extends ASTNode {
  readonly kind = NodeKind.WHILE_STMT;
  readonly condition: Expression;
  readonly body: Statement;
  readonly isDoWhile: boolean;
  
  constructor(condition: Expression, body: Statement, isDoWhile: boolean = false, loc?: SourceLocation) {
    super(loc);
    this.condition = condition;
    this.body = body;
    this.isDoWhile = isDoWhile;
  }
}

export class ForStatement extends ASTNode {
  readonly kind = NodeKind.FOR_STMT;
  readonly init?: VariableDeclaration | Expression;
  readonly condition?: Expression;
  readonly update?: Expression;
  readonly body: Statement;
  
  constructor(
    body: Statement,
    options: {
      init?: VariableDeclaration | Expression;
      condition?: Expression;
      update?: Expression;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.body = body;
    this.init = options.init;
    this.condition = options.condition;
    this.update = options.update;
  }
}

export class TryStatement extends ASTNode {
  readonly kind = NodeKind.TRY_STMT;
  readonly block: BlockStatement;
  readonly handler?: CatchClause;
  readonly finalizer?: BlockStatement;
  
  constructor(
    block: BlockStatement,
    options: {
      handler?: CatchClause;
      finalizer?: BlockStatement;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.block = block;
    this.handler = options.handler;
    this.finalizer = options.finalizer;
  }
}

export class CatchClause extends ASTNode {
  readonly kind = NodeKind.TRY_STMT;
  readonly param?: Identifier;
  readonly body: BlockStatement;
  
  constructor(body: BlockStatement, param?: Identifier, loc?: SourceLocation) {
    super(loc);
    this.body = body;
    this.param = param;
  }
}

export class ClassDeclaration extends ASTNode {
  readonly kind = NodeKind.CLASS_DECL;
  readonly id: Identifier;
  readonly superClass?: Expression;
  readonly body: ClassBody;
  readonly isExport: boolean;
  readonly typeParameters?: string[];
  readonly implements: TypeNode[];
  
  constructor(
    id: Identifier,
    body: ClassBody,
    options: {
      superClass?: Expression;
      isExport?: boolean;
      typeParameters?: string[];
      implements?: TypeNode[];
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.id = id;
    this.body = body;
    this.superClass = options.superClass;
    this.isExport = options.isExport ?? false;
    this.typeParameters = options.typeParameters;
    this.implements = options.implements ?? [];
  }
}

export class ClassBody extends ASTNode {
  readonly kind = NodeKind.CLASS_DECL;
  readonly members: ClassMember[];
  
  constructor(members: ClassMember[], loc?: SourceLocation) {
    super(loc);
    this.members = members;
  }
}

export type ClassMember = MethodDefinition | PropertyDefinition;

export class MethodDefinition extends ASTNode {
  readonly kind = NodeKind.CLASS_DECL;
  readonly key: Identifier;
  readonly value: FunctionDeclaration;
  readonly isStatic: boolean;
  readonly isAsync: boolean;
  readonly isGenerator: boolean;
  readonly isGetter: boolean;
  readonly isSetter: boolean;
  readonly access: 'public' | 'private' | 'protected';
  readonly isAbstract: boolean;
  
  constructor(
    key: Identifier,
    value: FunctionDeclaration,
    options: {
      isStatic?: boolean;
      isAsync?: boolean;
      isGenerator?: boolean;
      isGetter?: boolean;
      isSetter?: boolean;
      access?: 'public' | 'private' | 'protected';
      isAbstract?: boolean;
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.key = key;
    this.value = value;
    this.isStatic = options.isStatic ?? false;
    this.isAsync = options.isAsync ?? false;
    this.isGenerator = options.isGenerator ?? false;
    this.isGetter = options.isGetter ?? false;
    this.isSetter = options.isSetter ?? false;
    this.access = options.access ?? 'public';
    this.isAbstract = options.isAbstract ?? false;
  }
}

export class PropertyDefinition extends ASTNode {
  readonly kind = NodeKind.CLASS_DECL;
  readonly key: Identifier;
  readonly value?: Expression;
  readonly typeAnnotation?: TypeNode;
  readonly isStatic: boolean;
  readonly isReadonly: boolean;
  readonly access: 'public' | 'private' | 'protected';
  
  constructor(
    key: Identifier,
    options: {
      value?: Expression;
      typeAnnotation?: TypeNode;
      isStatic?: boolean;
      isReadonly?: boolean;
      access?: 'public' | 'private' | 'protected';
      loc?: SourceLocation;
    } = {}
  ) {
    super(options.loc);
    this.key = key;
    this.value = options.value;
    this.typeAnnotation = options.typeAnnotation;
    this.isStatic = options.isStatic ?? false;
    this.isReadonly = options.isReadonly ?? false;
    this.access = options.access ?? 'public';
  }
}

export class SwitchStatement extends ASTNode {
  readonly kind = NodeKind.SWITCH_STMT;
  readonly discriminant: Expression;
  readonly cases: SwitchCase[];
  
  constructor(discriminant: Expression, cases: SwitchCase[], loc?: SourceLocation) {
    super(loc);
    this.discriminant = discriminant;
    this.cases = cases;
  }
}

export class SwitchCase extends ASTNode {
  readonly kind = NodeKind.SWITCH_STMT;
  readonly test?: Expression; // undefined for default
  readonly consequent: Statement[];
  
  constructor(consequent: Statement[], test?: Expression, loc?: SourceLocation) {
    super(loc);
    this.test = test;
    this.consequent = consequent;
  }
}

export class BreakStatement extends ASTNode {
  readonly kind = NodeKind.BREAK_STMT;
  readonly label?: Identifier;
  
  constructor(label?: Identifier, loc?: SourceLocation) {
    super(loc);
    this.label = label;
  }
}

export class ContinueStatement extends ASTNode {
  readonly kind = NodeKind.CONTINUE_STMT;
  readonly label?: Identifier;
  
  constructor(label?: Identifier, loc?: SourceLocation) {
    super(loc);
    this.label = label;
  }
}

export class ThrowStatement extends ASTNode {
  readonly kind = NodeKind.THROW_STMT;
  readonly argument: Expression;
  
  constructor(argument: Expression, loc?: SourceLocation) {
    super(loc);
    this.argument = argument;
  }
}
