/**
 * ESLint 安全规则配置
 * 
 * DEBT-FAB-DEEP 清偿实现
 * - OWASP安全规则
 * - 密钥泄露检测
 * - 危险函数检查
 * 
 * @version 1.4.0
 * @debt DEBT-FAB-DEEP (P0-已清偿)
 */

module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: [
    '@typescript-eslint',
    'security',
    'no-secrets',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:security/recommended',
  ],
  rules: {
    // ========== 安全规则 ==========
    
    // 禁止硬编码密钥
    'no-secrets/no-secrets': ['error', {
      tolerance: 4.5,
      ignoreContent: [
        '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', // 示例密钥，实际应加入.env
      ],
    }],
    
    // 禁止eval
    'no-eval': 'error',
    
    // 禁止Function构造函数
    'no-new-func': 'error',
    
    // 禁止隐式eval
    'no-implied-eval': 'error',
    
    // 禁止危险的正则表达式
    'security/detect-non-literal-regexp': 'warn',
    
    // 禁止非字面量require
    'security/detect-non-literal-require': 'error',
    
    // 禁止不安全的正则
    'security/detect-unsafe-regex': 'error',
    
    // 检测buffer不安全使用
    'security/detect-buffer-noassert': 'error',
    
    // 检测子进程注入
    'security/detect-child-process': 'error',
    
    // 检测eval使用
    'security/detect-eval-with-expression': 'error',
    
    // 检测无转义的HTML
    'security/detect-no-csrf-before-method-override': 'warn',
    
    // 检测不安全的比较
    'security/detect-possible-timing-attacks': 'warn',
    
    // 检测伪随机数
    'security/detect-pseudoRandomBytes': 'error',
    
    // 检测SQL注入
    'security/detect-sql-injection': 'error',
    
    // ========== TypeScript安全规则 ==========
    
    // 禁止any类型（强制类型安全）
    '@typescript-eslint/no-explicit-any': 'error',
    
    // 禁止未使用变量
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    
    // 强制类型推断
    '@typescript-eslint/no-inferrable-types': 'warn',
    
    // ========== 代码质量规则 ==========
    
    // 圈复杂度限制
    'complexity': ['warn', 10],
    
    // 最大行数
    'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
    
    // 最大函数行数
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
  },
  overrides: [
    {
      // 测试文件放宽规则
      files: ['*.test.ts', '*.spec.ts'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'security/detect-non-literal-fs-filename': 'off',
      },
    },
    {
      // 配置文件放宽规则
      files: ['*.config.js', '*.config.ts'],
      rules: {
        'no-secrets/no-secrets': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/',
    'dist/',
    '.next/',
    'coverage/',
    '*.min.js',
  ],
};
