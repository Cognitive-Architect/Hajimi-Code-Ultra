/**
 * Base System Pattern - 基础系统装备
 * 所有角色装备的基类，提供通用功能
 * 
 * @version 1.0.0
 * @module patterns/system/base-system
 */

import { SystemPattern, PatternType, PatternVersion, TokenOptimization } from '../types';

/** 基础系统版本 */
const BASE_VERSION: PatternVersion = {
  major: 1,
  minor: 0,
  patch: 0,
};

/** 默认Token优化配置 - 节省75% */
const DEFAULT_TOKEN_OPT: TokenOptimization = {
  enabled: true,
  compressionRatio: 0.25,  // 压缩到25% = 节省75%
  useAbbreviations: true,
  stripComments: true,
  minifyWhitespace: true,
};

/** 基础系统Prompt模板 */
const BASE_SYSTEM_TEMPLATE = `
# SYS:{{roleId}}
## ROLE
{{roleName}}|{{roleDescription}}

## CORE
{{coreBehavior}}

## LANG
{{languageStyle}}

## RULES
{{rules}}

## SIG
{{signature}}
`;

/** 基础系统装备 */
export const BaseSystemPattern: SystemPattern = {
  meta: {
    id: 'sys:base',
    name: 'Base System Pattern',
    description: '基础系统装备模板，所有角色装备的基类',
    version: BASE_VERSION,
    author: 'Fabric Team',
    tags: ['base', 'system', 'template'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  },
  type: PatternType.SYSTEM,
  content: BASE_SYSTEM_TEMPLATE,
  variables: [
    {
      name: 'roleId',
      type: 'string',
      required: true,
      description: '角色唯一标识',
    },
    {
      name: 'roleName',
      type: 'string',
      required: true,
      description: '角色名称',
    },
    {
      name: 'roleDescription',
      type: 'string',
      required: true,
      description: '角色描述',
    },
    {
      name: 'coreBehavior',
      type: 'string',
      required: true,
      description: '核心行为定义',
    },
    {
      name: 'languageStyle',
      type: 'string',
      required: true,
      description: '语言风格定义',
    },
    {
      name: 'rules',
      type: 'string',
      required: true,
      description: '行为规则',
    },
    {
      name: 'signature',
      type: 'string',
      required: false,
      defaultValue: '',
      description: '签名/口头禅',
    },
  ],
  tokenOpt: DEFAULT_TOKEN_OPT,
  dependencies: [],
  personality: {
    traits: [],
    language: {
      formality: 'neutral',
      tone: [],
      vocabulary: [],
      forbiddenWords: [],
      signaturePhrases: [],
    },
    behavior: {
      responseStyle: 'adaptive',
      decisionMaking: 'analytical',
      conflictHandling: 'diplomatic',
      errorHandling: 'graceful',
    },
  },
  systemPrompt: BASE_SYSTEM_TEMPLATE,
};

/** 角色装备生成器 */
export function createRolePattern(
  id: string,
  name: string,
  description: string,
  config: {
    traits: { name: string; intensity: number; description: string }[];
    language: {
      formality: 'casual' | 'neutral' | 'formal';
      tone: string[];
      vocabulary: string[];
      forbiddenWords: string[];
      signaturePhrases: string[];
    };
    behavior: {
      responseStyle: string;
      decisionMaking: string;
      conflictHandling: string;
      errorHandling: string;
    };
    rules: string[];
  }
): SystemPattern {
  const coreBehavior = config.traits
    .map(t => `${t.name}[${t.intensity}]:${t.description}`)
    .join('|');

  const languageStyle = `${config.language.formality}|${config.language.tone.join(',')}|${config.language.vocabulary.join(',')}`;

  const rules = config.rules.join('|');

  const signature = config.language.signaturePhrases.join('|');

  return {
    meta: {
      id: `sys:role:${id}`,
      name,
      description,
      version: { ...BASE_VERSION },
      author: 'Fabric Team',
      tags: ['role', id, 'personality'],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    type: PatternType.SYSTEM,
    content: BASE_SYSTEM_TEMPLATE
      .replace('{{roleId}}', id)
      .replace('{{roleName}}', name)
      .replace('{{roleDescription}}', description)
      .replace('{{coreBehavior}}', coreBehavior)
      .replace('{{languageStyle}}', languageStyle)
      .replace('{{rules}}', rules)
      .replace('{{signature}}', signature),
    variables: BaseSystemPattern.variables,
    tokenOpt: DEFAULT_TOKEN_OPT,
    dependencies: ['sys:base'],
    personality: {
      traits: config.traits.map(t => ({ ...t })),
      language: { ...config.language },
      behavior: { ...config.behavior },
    },
    systemPrompt: BASE_SYSTEM_TEMPLATE,
  };
}

export default BaseSystemPattern;
