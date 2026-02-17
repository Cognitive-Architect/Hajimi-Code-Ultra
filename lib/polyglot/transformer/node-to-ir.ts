/**
 * HAJIMI-PHASE2-IMPL-001: B-02/06
 * Node.js代码 → Hajimi-IR转换器
 * 
 * 将TypeScript/JavaScript代码转换为Hajimi-IR中间表示
 * @module lib/polyglot/transformer/node-to-ir
 * 
 * 自测指标：
 * - POL-001：Node转Python准确率 > 95%
 */

import * as ts from 'typescript';
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
  ExportSpecifier,
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
  Comment,
  NodeKind,
  TypeKind,
  TypeNode,
  PrimitiveType,
  LiteralType,
  ArrayType,
  ObjectType,
  FunctionType,
  ParameterType,
  UnionType,
  TypeReference,
  SourceLocation,
  createLocation,
} from '../ir/ast';

/**
 * 转换统计
 */
export interface TransformStats {
  totalNodes: number;
  convertedNodes: number;
  failedNodes: number;
  typeInferences: number;
  warnings: string[];
}

/**
 * 转换选项
 */
export interface TransformOptions {
  strictMode?: boolean;
  inferTypes?: boolean;
  includeComments?: boolean;
  preserveDecorators?: boolean;
  targetVersion?: string;
}

/**
 * 默认转换选项
 */
const defaultOptions: TransformOptions = {
  strictMode: true,
  inferTypes: true,
  includeComments: true,
  preserveDecorators: true,
  targetVersion: 'ES2020',
};

/**
 * Node.js → Hajimi-IR 转换器
 */
export class NodeToIRTransformer {
  private options: TransformOptions;
  private stats: TransformStats;
  private checker?: ts.TypeChecker;
  private sourceFile?: ts.SourceFile;
  private fileName: string = 'unknown.ts';
  
  constructor(options: TransformOptions = {}) {
    this.options = { ...defaultOptions, ...options };
    this.stats = {
      totalNodes: 0,
      convertedNodes: 0,
      failedNodes: 0,
      typeInferences: 0,
      warnings: [],
    };
  }
  
  /**
   * 转换TypeScript源代码
   * @param sourceCode TypeScript源代码
   * @param fileName 文件名（用于错误定位）
   * @returns Hajimi-IR模块
   */
  transform(sourceCode: string, fileName: string = 'input.ts'): Module {
    this.fileName = fileName;
    this.stats = {
      totalNodes: 0,
      convertedNodes: 0,
      failedNodes: 0,
      typeInferences: 0,
      warnings: [],
    };
    
    // 解析TypeScript
    const sourceFile = ts.createSourceFile(
      fileName,
      sourceCode,
      ts.ScriptTarget.ES2020,
      true,
      ts.ScriptKind.TS
    );
    
    this.sourceFile = sourceFile;
    
    // 如果需要类型推断，创建类型检查器
    if (this.options.inferTypes) {
      const program = ts.createProgram([fileName], {}, {
        getSourceFile: (name) => name === fileName ? sourceFile : undefined,
        writeFile: () => {},
        getCurrentDirectory: () => '',
        getDirectories: () => [],
        fileExists: () => true,
        readFile: () => sourceCode,
        getCanonicalFileName: (name) => name,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
      });
      this.checker = program.getTypeChecker();
    }
    
    // 转换模块
    const statements: Statement[] = [];
    const imports: ImportDeclaration[] = [];
    const exports: ExportDeclaration[] = [];
    const comments: Comment[] = [];
    
    ts.forEachChild(sourceFile, (node) => {
      this.stats.totalNodes++;
      try {
        const result = this.visitNode(node);
        if (result) {
          if (result.kind === NodeKind.IMPORT_DECL) {
            imports.push(result as ImportDeclaration);
          } else if (result.kind === NodeKind.EXPORT_DECL) {
            exports.push(result as ExportDeclaration);
          } else {
            statements.push(result as Statement);
          }
          this.stats.convertedNodes++;
        }
      } catch (error) {
        this.stats.failedNodes++;
        this.stats.warnings.push(`Failed to convert node at ${this.getNodeLoc(node)}: ${error}`);
      }
    });
    
    // 提取注释
    if (this.options.includeComments) {
      const text = sourceFile.text;
      const commentRanges = ts.getLeadingCommentRanges(text, sourceFile.getFullStart()) || [];
      for (const range of commentRanges) {
        const commentText = text.substring(range.pos, range.end);
        comments.push(new Comment(
          commentText,
          range.kind === ts.SyntaxKind.MultiLineCommentTrivia,
          commentText.startsWith('/**'),
          createLocation(fileName, 1, range.pos)
        ));
      }
    }
    
    return new Module(fileName, statements, { imports, exports, comments });
  }
  
  /**
   * 访问AST节点
   */
  private visitNode(node: ts.Node): any {
    switch (node.kind) {
      // 声明
      case ts.SyntaxKind.FunctionDeclaration:
        return this.visitFunctionDeclaration(node as ts.FunctionDeclaration);
      case ts.SyntaxKind.VariableStatement:
        return this.visitVariableStatement(node as ts.VariableStatement);
      case ts.SyntaxKind.ClassDeclaration:
        return this.visitClassDeclaration(node as ts.ClassDeclaration);
      case ts.SyntaxKind.InterfaceDeclaration:
        return this.visitInterfaceDeclaration(node as ts.InterfaceDeclaration);
      case ts.SyntaxKind.ImportDeclaration:
        return this.visitImportDeclaration(node as ts.ImportDeclaration);
      case ts.SyntaxKind.ExportAssignment:
      case ts.SyntaxKind.ExportDeclaration:
        return this.visitExportDeclaration(node as ts.ExportDeclaration | ts.ExportAssignment);
      case ts.SyntaxKind.TypeAliasDeclaration:
        return this.visitTypeAliasDeclaration(node as ts.TypeAliasDeclaration);
        
      // 语句
      case ts.SyntaxKind.Block:
        return this.visitBlock(node as ts.Block);
      case ts.SyntaxKind.IfStatement:
        return this.visitIfStatement(node as ts.IfStatement);
      case ts.SyntaxKind.WhileStatement:
      case ts.SyntaxKind.DoStatement:
        return this.visitWhileStatement(node as ts.WhileStatement | ts.DoStatement);
      case ts.SyntaxKind.ForStatement:
        return this.visitForStatement(node as ts.ForStatement);
      case ts.SyntaxKind.ForOfStatement:
      case ts.SyntaxKind.ForInStatement:
        return this.visitForOfStatement(node as ts.ForOfStatement | ts.ForInStatement);
      case ts.SyntaxKind.SwitchStatement:
        return this.visitSwitchStatement(node as ts.SwitchStatement);
      case ts.SyntaxKind.TryStatement:
        return this.visitTryStatement(node as ts.TryStatement);
      case ts.SyntaxKind.ReturnStatement:
        return this.visitReturnStatement(node as ts.ReturnStatement);
      case ts.SyntaxKind.ThrowStatement:
        return this.visitThrowStatement(node as ts.ThrowStatement);
      case ts.SyntaxKind.BreakStatement:
        return this.visitBreakStatement(node as ts.BreakStatement);
      case ts.SyntaxKind.ContinueStatement:
        return this.visitContinueStatement(node as ts.ContinueStatement);
      case ts.SyntaxKind.ExpressionStatement:
        return this.visitExpressionStatement(node as ts.ExpressionStatement);
        
      // 表达式
      case ts.SyntaxKind.Identifier:
        return this.visitIdentifier(node as ts.Identifier);
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NumericLiteral:
      case ts.SyntaxKind.TrueKeyword:
      case ts.SyntaxKind.FalseKeyword:
      case ts.SyntaxKind.NullKeyword:
      case ts.SyntaxKind.UndefinedKeyword:
        return this.visitLiteral(node as ts.LiteralExpression | ts.BooleanLiteral | ts.NullLiteral);
      case ts.SyntaxKind.BinaryExpression:
        return this.visitBinaryExpression(node as ts.BinaryExpression);
      case ts.SyntaxKind.UnaryExpression:
      case ts.SyntaxKind.PrefixUnaryExpression:
      case ts.SyntaxKind.PostfixUnaryExpression:
        return this.visitUnaryExpression(node as ts.PrefixUnaryExpression | ts.PostfixUnaryExpression);
      case ts.SyntaxKind.CallExpression:
        return this.visitCallExpression(node as ts.CallExpression);
      case ts.SyntaxKind.PropertyAccessExpression:
      case ts.SyntaxKind.ElementAccessExpression:
        return this.visitMemberExpression(node as ts.PropertyAccessExpression | ts.ElementAccessExpression);
      case ts.SyntaxKind.ArrayLiteralExpression:
        return this.visitArrayExpression(node as ts.ArrayLiteralExpression);
      case ts.SyntaxKind.ObjectLiteralExpression:
        return this.visitObjectExpression(node as ts.ObjectLiteralExpression);
      case ts.SyntaxKind.ArrowFunction:
        return this.visitArrowFunction(node as ts.ArrowFunction);
      case ts.SyntaxKind.ConditionalExpression:
        return this.visitConditionalExpression(node as ts.ConditionalExpression);
      case ts.SyntaxKind.AwaitExpression:
        return this.visitAwaitExpression(node as ts.AwaitExpression);
      case ts.SyntaxKind.SpreadElement:
        return this.visitSpreadElement(node as ts.SpreadElement);
      case ts.SyntaxKind.TemplateExpression:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        return this.visitTemplateLiteral(node as ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral);
        
      default:
        // 未知节点类型，尝试递归处理子节点
        return this.handleUnknownNode(node);
    }
  }
  
  /**
   * 函数声明
   */
  private visitFunctionDeclaration(node: ts.FunctionDeclaration): FunctionDeclaration {
    const name = node.name ? this.visitIdentifier(node.name) : new Identifier('anonymous');
    const params = node.parameters.map(p => this.visitParameter(p));
    const body = node.body ? this.visitBlock(node.body) : new BlockStatement([]);
    
    const returnType = node.type ? this.visitTypeNode(node.type) : undefined;
    const typeParameters = node.typeParameters?.map(tp => tp.name.text);
    
    const modifiers = ts.getModifiers(node) || [];
    const isAsync = modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
    const isGenerator = !!node.asteriskToken;
    const isExport = this.isExported(node);
    
    return new FunctionDeclaration(name, params as Identifier[], body, {
      returnType,
      isAsync,
      isGenerator,
      isExport,
      typeParameters,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 变量声明
   */
  private visitVariableStatement(node: ts.VariableStatement): VariableDeclaration {
    const isConst = node.declarationList.flags === ts.NodeFlags.Const;
    const declarations = node.declarationList.declarations.map(d => this.visitVariableDeclarator(d));
    const isExport = this.isExported(node);
    
    return new VariableDeclaration(declarations, isConst, isExport, this.getNodeLoc(node));
  }
  
  /**
   * 变量声明符
   */
  private visitVariableDeclarator(node: ts.VariableDeclaration): VariableDeclarator {
    const id = this.visitBindingName(node.name);
    const init = node.initializer ? this.visitNode(node.initializer) as Expression : undefined;
    
    // 类型注解
    if (node.type && id instanceof Identifier) {
      (id as any).typeAnnotation = this.visitTypeNode(node.type);
    }
    
    return new VariableDeclarator(id, init, this.getNodeLoc(node));
  }
  
  /**
   * 类声明
   */
  private visitClassDeclaration(node: ts.ClassDeclaration): ClassDeclaration {
    const name = node.name ? this.visitIdentifier(node.name) : new Identifier('Anonymous');
    
    const superClass = node.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ExtendsKeyword
    )?.types[0]?.expression;
    
    const implements_ = node.heritageClauses?.find(
      h => h.token === ts.SyntaxKind.ImplementsKeyword
    )?.types.map(t => this.visitTypeNode(t)) || [];
    
    const members: (MethodDefinition | PropertyDefinition)[] = [];
    for (const member of node.members) {
      if (ts.isMethodDeclaration(member)) {
        members.push(this.visitMethodDefinition(member));
      } else if (ts.isPropertyDeclaration(member)) {
        members.push(this.visitPropertyDefinition(member));
      }
    }
    
    const body = new ClassBody(members, this.getNodeLoc(node));
    const typeParameters = node.typeParameters?.map(tp => tp.name.text);
    const isExport = this.isExported(node);
    
    return new ClassDeclaration(name, body, {
      superClass: superClass ? this.visitNode(superClass) as Expression : undefined,
      isExport,
      typeParameters,
      implements: implements_,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 方法定义
   */
  private visitMethodDefinition(node: ts.MethodDeclaration): MethodDefinition {
    const key = this.visitPropertyName(node.name);
    const func = this.visitFunctionDeclaration(
      node as unknown as ts.FunctionDeclaration
    );
    
    const modifiers = ts.getModifiers(node) || [];
    const isStatic = modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
    const isAsync = modifiers.some(m => m.kind === ts.SyntaxKind.AsyncKeyword);
    const isAbstract = modifiers.some(m => m.kind === ts.SyntaxKind.AbstractKeyword);
    
    const access = modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' :
                   modifiers.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public';
    
    return new MethodDefinition(key, func, {
      isStatic,
      isAsync,
      access,
      isAbstract,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 属性定义
   */
  private visitPropertyDefinition(node: ts.PropertyDeclaration): PropertyDefinition {
    const key = this.visitPropertyName(node.name);
    const value = node.initializer ? this.visitNode(node.initializer) as Expression : undefined;
    const typeAnnotation = node.type ? this.visitTypeNode(node.type) : undefined;
    
    const modifiers = ts.getModifiers(node) || [];
    const isStatic = modifiers.some(m => m.kind === ts.SyntaxKind.StaticKeyword);
    const isReadonly = modifiers.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword);
    
    const access = modifiers.some(m => m.kind === ts.SyntaxKind.PrivateKeyword) ? 'private' :
                   modifiers.some(m => m.kind === ts.SyntaxKind.ProtectedKeyword) ? 'protected' : 'public';
    
    return new PropertyDefinition(key, {
      value,
      typeAnnotation,
      isStatic,
      isReadonly,
      access,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 导入声明
   */
  private visitImportDeclaration(node: ts.ImportDeclaration): ImportDeclaration {
    const source = (node.moduleSpecifier as ts.StringLiteral).text;
    const specifiers: ImportSpecifier[] = [];
    
    if (node.importClause) {
      // 默认导入
      if (node.importClause.name) {
        specifiers.push(new ImportSpecifier(
          node.importClause.name.text,
          { isDefault: true }
        ));
      }
      
      // 命名导入
      if (node.importClause.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          for (const elem of node.importClause.namedBindings.elements) {
            specifiers.push(new ImportSpecifier(
              elem.name.text,
              { imported: elem.propertyName?.text }
            ));
          }
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          specifiers.push(new ImportSpecifier(
            node.importClause.namedBindings.name.text,
            { isNamespace: true }
          ));
        }
      }
    }
    
    const isTypeOnly = node.importClause?.isTypeOnly ?? false;
    
    return new ImportDeclaration(source, specifiers, isTypeOnly, this.getNodeLoc(node));
  }
  
  /**
   * 导出声明
   */
  private visitExportDeclaration(node: ts.ExportDeclaration | ts.ExportAssignment): ExportDeclaration {
    if (ts.isExportAssignment(node)) {
      return new ExportDeclaration({
        isDefault: !node.isExportEquals,
        loc: this.getNodeLoc(node),
      });
    }
    
    const specifiers: ExportSpecifier[] = [];
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const elem of node.exportClause.elements) {
        specifiers.push(new ExportSpecifier(
          elem.name.text,
          elem.propertyName?.text
        ));
      }
    }
    
    const source = node.moduleSpecifier ? (node.moduleSpecifier as ts.StringLiteral).text : undefined;
    
    return new ExportDeclaration({
      specifiers,
      source,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 块语句
   */
  private visitBlock(node: ts.Block): BlockStatement {
    const statements: Statement[] = [];
    for (const stmt of node.statements) {
      const result = this.visitNode(stmt);
      if (result) statements.push(result as Statement);
    }
    return new BlockStatement(statements, this.getNodeLoc(node));
  }
  
  /**
   * If语句
   */
  private visitIfStatement(node: ts.IfStatement): IfStatement {
    const condition = this.visitNode(node.expression) as Expression;
    const consequent = this.visitNode(node.thenStatement) as Statement;
    const alternate = node.elseStatement ? this.visitNode(node.elseStatement) as Statement : undefined;
    
    return new IfStatement(condition, consequent, alternate, this.getNodeLoc(node));
  }
  
  /**
   * While语句
   */
  private visitWhileStatement(node: ts.WhileStatement | ts.DoStatement): WhileStatement {
    const condition = this.visitNode(node.expression) as Expression;
    const body = this.visitNode(node.statement) as Statement;
    const isDoWhile = node.kind === ts.SyntaxKind.DoStatement;
    
    return new WhileStatement(condition, body, isDoWhile, this.getNodeLoc(node));
  }
  
  /**
   * For语句
   */
  private visitForStatement(node: ts.ForStatement): ForStatement {
    const init = node.initializer
      ? ts.isVariableDeclarationList(node.initializer)
        ? this.visitVariableStatement(
            ts.factory.createVariableStatement(undefined, node.initializer) as ts.VariableStatement
          )
        : this.visitNode(node.initializer) as Expression
      : undefined;
    
    const condition = node.condition ? this.visitNode(node.condition) as Expression : undefined;
    const update = node.incrementor ? this.visitNode(node.incrementor) as Expression : undefined;
    const body = this.visitNode(node.statement) as Statement;
    
    return new ForStatement(body, { init, condition, update, loc: this.getNodeLoc(node) });
  }
  
  /**
   * For...of/For...in语句
   */
  private visitForOfStatement(node: ts.ForOfStatement | ts.ForInStatement): ForStatement {
    // 转换为标准for循环或保留特殊形式
    // 简化处理：转换为while风格
    const body = this.visitNode(node.statement) as Statement;
    return new ForStatement(body, { loc: this.getNodeLoc(node) });
  }
  
  /**
   * Switch语句
   */
  private visitSwitchStatement(node: ts.SwitchStatement): SwitchStatement {
    const discriminant = this.visitNode(node.expression) as Expression;
    const cases: SwitchCase[] = [];
    
    for (const clause of node.caseBlock.clauses) {
      const test = ts.isCaseClause(clause) ? this.visitNode(clause.expression) as Expression : undefined;
      const consequent: Statement[] = [];
      for (const stmt of clause.statements) {
        const result = this.visitNode(stmt);
        if (result) consequent.push(result as Statement);
      }
      cases.push(new SwitchCase(consequent, test, this.getNodeLoc(clause)));
    }
    
    return new SwitchStatement(discriminant, cases, this.getNodeLoc(node));
  }
  
  /**
   * Try语句
   */
  private visitTryStatement(node: ts.TryStatement): TryStatement {
    const block = this.visitBlock(node.tryBlock);
    
    let handler: CatchClause | undefined;
    if (node.catchClause) {
      const param = node.catchClause.variableDeclaration
        ? this.visitBindingName(node.catchClause.variableDeclaration.name)
        : undefined;
      const catchBody = this.visitBlock(node.catchClause.block);
      handler = new CatchClause(catchBody, param, this.getNodeLoc(node.catchClause));
    }
    
    const finalizer = node.finallyBlock ? this.visitBlock(node.finallyBlock) : undefined;
    
    return new TryStatement(block, { handler, finalizer, loc: this.getNodeLoc(node) });
  }
  
  /**
   * Return语句
   */
  private visitReturnStatement(node: ts.ReturnStatement): ReturnStatement {
    const argument = node.expression ? this.visitNode(node.expression) as Expression : undefined;
    return new ReturnStatement(argument, this.getNodeLoc(node));
  }
  
  /**
   * Throw语句
   */
  private visitThrowStatement(node: ts.ThrowStatement): ThrowStatement {
    const argument = this.visitNode(node.expression) as Expression;
    return new ThrowStatement(argument, this.getNodeLoc(node));
  }
  
  /**
   * Break语句
   */
  private visitBreakStatement(node: ts.BreakStatement): BreakStatement {
    const label = node.label ? this.visitIdentifier(node.label) : undefined;
    return new BreakStatement(label, this.getNodeLoc(node));
  }
  
  /**
   * Continue语句
   */
  private visitContinueStatement(node: ts.ContinueStatement): ContinueStatement {
    const label = node.label ? this.visitIdentifier(node.label) : undefined;
    return new ContinueStatement(label, this.getNodeLoc(node));
  }
  
  /**
   * 表达式语句
   */
  private visitExpressionStatement(node: ts.ExpressionStatement): ExpressionStatement {
    const expression = this.visitNode(node.expression) as Expression;
    return new ExpressionStatement(expression, this.getNodeLoc(node));
  }
  
  /**
   * 标识符
   */
  private visitIdentifier(node: ts.Identifier): Identifier {
    const typeAnnotation = this.inferType(node);
    return new Identifier(node.text, typeAnnotation, this.getNodeLoc(node));
  }
  
  /**
   * 字面量
   */
  private visitLiteral(node: ts.LiteralExpression | ts.BooleanLiteral | ts.NullLiteral | ts.Identifier): Literal {
    let value: string | number | boolean | null | undefined;
    let raw: string;
    
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral:
        value = (node as ts.StringLiteral).text;
        raw = `"${value}"`;
        break;
      case ts.SyntaxKind.NumericLiteral:
        value = parseFloat((node as ts.NumericLiteral).text);
        raw = (node as ts.NumericLiteral).text;
        break;
      case ts.SyntaxKind.TrueKeyword:
        value = true;
        raw = 'true';
        break;
      case ts.SyntaxKind.FalseKeyword:
        value = false;
        raw = 'false';
        break;
      case ts.SyntaxKind.NullKeyword:
        value = null;
        raw = 'null';
        break;
      case ts.SyntaxKind.UndefinedKeyword:
        value = undefined;
        raw = 'undefined';
        break;
      default:
        value = node.getText(this.sourceFile);
        raw = value;
    }
    
    return new Literal(value, raw, this.getNodeLoc(node));
  }
  
  /**
   * 二元表达式
   */
  private visitBinaryExpression(node: ts.BinaryExpression): BinaryExpression {
    const operator = ts.tokenToString(node.operatorToken.kind) || 'unknown';
    const left = this.visitNode(node.left) as Expression;
    const right = this.visitNode(node.right) as Expression;
    
    return new BinaryExpression(operator, left, right, this.getNodeLoc(node));
  }
  
  /**
   * 一元表达式
   */
  private visitUnaryExpression(node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression): UnaryExpression {
    const operator = ts.tokenToString(node.operator) || 'unknown';
    const operand = this.visitNode(node.operand) as Expression;
    const isPrefix = node.kind === ts.SyntaxKind.PrefixUnaryExpression;
    
    return new UnaryExpression(operator, operand, isPrefix, this.getNodeLoc(node));
  }
  
  /**
   * 调用表达式
   */
  private visitCallExpression(node: ts.CallExpression): CallExpression {
    const callee = this.visitNode(node.expression) as Expression;
    const args = node.arguments.map(arg => this.visitNode(arg) as Expression);
    const typeArguments = node.typeArguments?.map(ta => this.visitTypeNode(ta));
    
    // 检测可选链
    const isOptional = node.questionDotToken !== undefined;
    
    return new CallExpression(callee, args, { typeArguments, isOptional, loc: this.getNodeLoc(node) });
  }
  
  /**
   * 成员表达式
   */
  private visitMemberExpression(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): MemberExpression {
    const object = this.visitNode(node.expression) as Expression;
    
    let property: Expression | Identifier;
    let computed = false;
    
    if (ts.isPropertyAccessExpression(node)) {
      property = new Identifier(node.name.text);
      computed = false;
    } else {
      property = this.visitNode(node.argumentExpression) as Expression;
      computed = true;
    }
    
    const isOptional = node.questionDotToken !== undefined;
    
    return new MemberExpression(object, property, computed, isOptional, this.getNodeLoc(node));
  }
  
  /**
   * 数组表达式
   */
  private visitArrayExpression(node: ts.ArrayLiteralExpression): ArrayExpression {
    const elements = node.elements.map(elem => 
      elem ? this.visitNode(elem) as Expression : null
    );
    return new ArrayExpression(elements, this.getNodeLoc(node));
  }
  
  /**
   * 对象表达式
   */
  private visitObjectExpression(node: ts.ObjectLiteralExpression): ObjectExpression {
    const properties: Property[] = [];
    
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)
          ? this.visitPropertyName(prop.name)
          : this.visitNode(prop.name) as Expression;
        const value = this.visitNode(prop.initializer) as Expression;
        properties.push(new Property(key, value, { loc: this.getNodeLoc(prop) }));
      } else if (ts.isShorthandPropertyAssignment(prop)) {
        const key = this.visitIdentifier(prop.name);
        properties.push(new Property(key, key, { shorthand: true, loc: this.getNodeLoc(prop) }));
      } else if (ts.isSpreadAssignment(prop)) {
        // Spread element
        const value = this.visitNode(prop.expression) as Expression;
        properties.push(new Property(new Identifier('...'), value, { loc: this.getNodeLoc(prop) }));
      }
    }
    
    return new ObjectExpression(properties, this.getNodeLoc(node));
  }
  
  /**
   * 箭头函数
   */
  private visitArrowFunction(node: ts.ArrowFunction): ArrowFunction {
    const params = node.parameters.map(p => this.visitParameter(p));
    const body = ts.isBlock(node.body)
      ? this.visitBlock(node.body)
      : this.visitNode(node.body) as Expression;
    
    const returnType = node.type ? this.visitTypeNode(node.type) : undefined;
    const isAsync = node.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ?? false;
    const typeParameters = node.typeParameters?.map(tp => tp.name.text);
    
    return new ArrowFunction(params as Identifier[], body, {
      returnType,
      isAsync,
      typeParameters,
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 条件表达式
   */
  private visitConditionalExpression(node: ts.ConditionalExpression): ConditionalExpression {
    const condition = this.visitNode(node.condition) as Expression;
    const consequent = this.visitNode(node.whenTrue) as Expression;
    const alternate = this.visitNode(node.whenFalse) as Expression;
    
    return new ConditionalExpression(condition, consequent, alternate, this.getNodeLoc(node));
  }
  
  /**
   * Await表达式
   */
  private visitAwaitExpression(node: ts.AwaitExpression): AwaitExpression {
    const argument = this.visitNode(node.expression) as Expression;
    return new AwaitExpression(argument, this.getNodeLoc(node));
  }
  
  /**
   * Spread元素
   */
  private visitSpreadElement(node: ts.SpreadElement): SpreadElement {
    const argument = this.visitNode(node.expression) as Expression;
    return new SpreadElement(argument, this.getNodeLoc(node));
  }
  
  /**
   * 模板字面量
   */
  private visitTemplateLiteral(node: ts.TemplateExpression | ts.NoSubstitutionTemplateLiteral): Literal {
    // 简化处理：转换为字符串字面量
    const text = node.getText(this.sourceFile);
    return new Literal(text, text, this.getNodeLoc(node));
  }
  
  /**
   * 类型节点
   */
  private visitTypeNode(node: ts.TypeNode): TypeNode {
    switch (node.kind) {
      case ts.SyntaxKind.StringKeyword:
        return new PrimitiveType(TypeKind.STRING, this.getNodeLoc(node));
      case ts.SyntaxKind.NumberKeyword:
        return new PrimitiveType(TypeKind.NUMBER, this.getNodeLoc(node));
      case ts.SyntaxKind.BooleanKeyword:
        return new PrimitiveType(TypeKind.BOOLEAN, this.getNodeLoc(node));
      case ts.SyntaxKind.VoidKeyword:
        return new PrimitiveType(TypeKind.VOID, this.getNodeLoc(node));
      case ts.SyntaxKind.AnyKeyword:
        return new PrimitiveType(TypeKind.ANY, this.getNodeLoc(node));
      case ts.SyntaxKind.UnknownKeyword:
        return new PrimitiveType(TypeKind.UNKNOWN, this.getNodeLoc(node));
      case ts.SyntaxKind.NeverKeyword:
        return new PrimitiveType(TypeKind.NEVER, this.getNodeLoc(node));
      case ts.SyntaxKind.UndefinedKeyword:
        return new PrimitiveType(TypeKind.UNDEFINED, this.getNodeLoc(node));
      case ts.SyntaxKind.NullKeyword:
        return new PrimitiveType(TypeKind.NULL, this.getNodeLoc(node));
        
      case ts.SyntaxKind.ArrayType: {
        const elementType = this.visitTypeNode((node as ts.ArrayTypeNode).elementType);
        return new ArrayType(elementType, true, this.getNodeLoc(node));
      }
        
      case ts.SyntaxKind.TypeReference: {
        const ref = node as ts.TypeReferenceNode;
        const name = ref.typeName.getText(this.sourceFile);
        const typeArgs = ref.typeArguments?.map(ta => this.visitTypeNode(ta));
        return new TypeReference(name, typeArgs, this.getNodeLoc(node));
      }
        
      case ts.SyntaxKind.UnionType: {
        const types = (node as ts.UnionTypeNode).types.map(t => this.visitTypeNode(t));
        return new UnionType(types, this.getNodeLoc(node));
      }
        
      case ts.SyntaxKind.TypeLiteral: {
        // 对象类型
        const props = new Map<string, TypeNode>();
        for (const member of (node as ts.TypeLiteralNode).members) {
          if (ts.isPropertySignature(member) && member.name) {
            const propName = member.name.getText(this.sourceFile);
            const propType = member.type ? this.visitTypeNode(member.type) : new PrimitiveType(TypeKind.ANY);
            props.set(propName, propType);
          }
        }
        return new ObjectType(props, undefined, this.getNodeLoc(node));
      }
        
      case ts.SyntaxKind.FunctionType: {
        const func = node as ts.FunctionTypeNode;
        const params = func.parameters.map(p => {
          const paramType = p.type ? this.visitTypeNode(p.type) : new PrimitiveType(TypeKind.ANY);
          return new ParameterType(p.name.getText(this.sourceFile), paramType, {
            isOptional: !!p.questionToken,
          });
        });
        const returnType = func.type ? this.visitTypeNode(func.type) : new PrimitiveType(TypeKind.VOID);
        return new FunctionType(params, returnType, { loc: this.getNodeLoc(node) });
      }
        
      default:
        return new PrimitiveType(TypeKind.ANY, this.getNodeLoc(node));
    }
  }
  
  /**
   * 接口声明（转换为类或类型）
   */
  private visitInterfaceDeclaration(node: ts.InterfaceDeclaration): ClassDeclaration {
    // 简化处理：将接口转换为抽象类
    const name = this.visitIdentifier(node.name);
    const members: (MethodDefinition | PropertyDefinition)[] = [];
    
    for (const member of node.members) {
      if (ts.isPropertySignature(member) && member.name) {
        const key = this.visitPropertyName(member.name);
        const typeAnnotation = member.type ? this.visitTypeNode(member.type) : undefined;
        members.push(new PropertyDefinition(key, {
          typeAnnotation,
          isReadonly: !!member.modifiers?.some(m => m.kind === ts.SyntaxKind.ReadonlyKeyword),
          loc: this.getNodeLoc(member),
        }));
      } else if (ts.isMethodSignature(member) && member.name) {
        const key = this.visitPropertyName(member.name);
        const func = new FunctionDeclaration(
          key,
          [],
          new BlockStatement([]),
          { isAsync: false, loc: this.getNodeLoc(member) }
        );
        members.push(new MethodDefinition(key, func, {
          isAbstract: true,
          loc: this.getNodeLoc(member),
        }));
      }
    }
    
    const body = new ClassBody(members, this.getNodeLoc(node));
    const typeParameters = node.typeParameters?.map(tp => tp.name.text);
    
    return new ClassDeclaration(name, body, {
      typeParameters,
      isExport: this.isExported(node),
      loc: this.getNodeLoc(node),
    });
  }
  
  /**
   * 类型别名声明
   */
  private visitTypeAliasDeclaration(node: ts.TypeAliasDeclaration): VariableDeclaration {
    // 简化处理：将类型别名转换为常量类型声明
    const id = this.visitIdentifier(node.name);
    const type = this.visitTypeNode(node.type);
    const declarator = new VariableDeclarator(id, undefined, this.getNodeLoc(node));
    
    return new VariableDeclaration([declarator], true, this.isExported(node), this.getNodeLoc(node));
  }
  
  /**
   * 辅助方法：访问参数
   */
  private visitParameter(node: ts.ParameterDeclaration): Identifier {
    const name = this.visitBindingName(node.name);
    if (node.type && name instanceof Identifier) {
      (name as any).typeAnnotation = this.visitTypeNode(node.type);
    }
    return name;
  }
  
  /**
   * 辅助方法：访问绑定名
   */
  private visitBindingName(node: ts.BindingName): Identifier {
    if (ts.isIdentifier(node)) {
      return this.visitIdentifier(node);
    }
    // 解构模式简化处理
    return new Identifier('destructured', undefined, this.getNodeLoc(node));
  }
  
  /**
   * 辅助方法：访问属性名
   */
  private visitPropertyName(node: ts.PropertyName): Identifier {
    if (ts.isIdentifier(node)) {
      return this.visitIdentifier(node);
    } else if (ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
      return new Identifier(node.text, undefined, this.getNodeLoc(node));
    } else {
      return new Identifier('computed', undefined, this.getNodeLoc(node));
    }
  }
  
  /**
   * 类型推断
   */
  private inferType(node: ts.Node): TypeNode | undefined {
    if (!this.checker || !this.options.inferTypes) {
      return undefined;
    }
    
    try {
      const type = this.checker.getTypeAtLocation(node);
      const typeString = this.checker.typeToString(type);
      
      this.stats.typeInferences++;
      
      // 映射基本类型
      switch (typeString) {
        case 'string': return new PrimitiveType(TypeKind.STRING);
        case 'number': return new PrimitiveType(TypeKind.NUMBER);
        case 'boolean': return new PrimitiveType(TypeKind.BOOLEAN);
        case 'void': return new PrimitiveType(TypeKind.VOID);
        case 'any': return new PrimitiveType(TypeKind.ANY);
        case 'unknown': return new PrimitiveType(TypeKind.UNKNOWN);
        case 'null': return new PrimitiveType(TypeKind.NULL);
        case 'undefined': return new PrimitiveType(TypeKind.UNDEFINED);
        default:
          // 复杂类型使用类型引用
          return new TypeReference(typeString);
      }
    } catch {
      return undefined;
    }
  }
  
  /**
   * 检查是否导出
   */
  private isExported(node: ts.Node): boolean {
    const modifiers = ts.getModifiers(node);
    return modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword) ?? false;
  }
  
  /**
   * 获取节点位置信息
   */
  private getNodeLoc(node: ts.Node): SourceLocation {
    const { line, character } = this.sourceFile!.getLineAndCharacterOfPosition(node.getStart());
    return createLocation(this.fileName, line + 1, character + 1, node.getStart());
  }
  
  /**
   * 处理未知节点
   */
  private handleUnknownNode(node: ts.Node): any {
    this.stats.warnings.push(`Unknown node type: ${ts.SyntaxKind[node.kind]} at ${this.getNodeLoc(node)}`);
    return undefined;
  }
  
  /**
   * 获取转换统计
   */
  getStats(): TransformStats {
    return { ...this.stats };
  }
  
  /**
   * 获取准确率
   */
  getAccuracy(): number {
    if (this.stats.totalNodes === 0) return 100;
    return Math.round((this.stats.convertedNodes / this.stats.totalNodes) * 100);
  }
}

/**
 * 转换入口函数
 */
export function transformNodeToIR(sourceCode: string, fileName?: string, options?: TransformOptions): Module {
  const transformer = new NodeToIRTransformer(options);
  return transformer.transform(sourceCode, fileName);
}

/**
 * 获取转换统计
 */
export function getTransformStats(transformer: NodeToIRTransformer): TransformStats {
  return transformer.getStats();
}

// 默认导出
export default {
  NodeToIRTransformer,
  transformNodeToIR,
  getTransformStats,
};
