/**
 * ThemeProvider.tsx - 七权人格化CSS主题系统
 * 
 * 支持7角色切换：Alice（通用）+ 六人组（黄瓜睦/唐音/咕咕嘎嘎/压力怪/Soyorin/奶龙娘）
 * 
 * @since v1.3.0
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// 导入主题样式
import './globals.css';
import './theme-mortis.css';
import './theme-anon.css';
import './theme-tomori.css';
import './theme-taki.css';
import './theme-soyo.css';
import './theme-kotone.css';

// ========== 类型定义 ==========

/** 七权人格化角色类型 */
export type PersonaTheme = 
  | 'alice'      // 通用/默认
  | 'mortis'     // 黄瓜睦 - Architect
  | 'anon'       // 唐音 - Engineer  
  | 'tomori'     // 咕咕嘎嘎 - QA
  | 'taki'       // 压力怪 - Audit
  | 'soyo'       // Soyorin - PM
  | 'kotone';    // 奶龙娘 - Doctor (NEW!)

/** 角色元数据 */
export interface PersonaMeta {
  id: PersonaTheme;
  name: string;
  role: string;
  color: string;
  description: string;
}

/** 主题上下文状态 */
interface ThemeContextState {
  /** 当前主题 */
  theme: PersonaTheme;
  /** 设置主题 */
  setTheme: (theme: PersonaTheme) => void;
  /** 切换至下一个主题 */
  cycleTheme: () => void;
  /** 所有可用主题 */
  availableThemes: PersonaMeta[];
  /** 当前主题元数据 */
  currentMeta: PersonaMeta;
  /** 是否正在过渡 */
  isTransitioning: boolean;
}

// ========== 角色元数据定义 ==========

export const PERSONA_METADATA: Record<PersonaTheme, PersonaMeta> = {
  alice: {
    id: 'alice',
    name: '天童爱丽丝',
    role: '通用',
    color: '#77BBFF',
    description: '默认主题，Blue Sechi风格悬浮球'
  },
  mortis: {
    id: 'mortis',
    name: '黄瓜睦',
    role: 'Architect',
    color: '#669966',
    description: '睦绿主题，呼吸动画'
  },
  anon: {
    id: 'anon',
    name: '唐音',
    role: 'Engineer',
    color: '#FF9999',
    description: '音粉主题，弹性动画'
  },
  tomori: {
    id: 'tomori',
    name: '咕咕嘎嘎',
    role: 'QA',
    color: '#77BBDD',
    description: '鸭蓝主题，漂浮动画'
  },
  taki: {
    id: 'taki',
    name: '压力怪',
    role: 'Audit',
    color: '#7777AA',
    description: '压力蓝主题，抖动动画'
  },
  soyo: {
    id: 'soyo',
    name: 'Soyorin',
    role: 'PM',
    color: '#FFDD88',
    description: '素金主题，柔和动画'
  },
  kotone: {
    id: 'kotone',
    name: '奶龙娘',
    role: 'Doctor',
    color: '#FFDD00',
    description: '奶黄主题，奶龙弹跳动画'
  }
};

/** 主题切换顺序 */
const THEME_CYCLE_ORDER: PersonaTheme[] = [
  'alice', 'mortis', 'anon', 'tomori', 'taki', 'soyo', 'kotone'
];

// ========== 上下文创建 ==========

const ThemeContext = createContext<ThemeContextState | null>(null);

// ========== Props 类型 ==========

interface ThemeProviderProps {
  children: React.ReactNode;
  /** 默认主题 */
  defaultTheme?: PersonaTheme;
  /** 是否持久化到 localStorage */
  persist?: boolean;
  /** localStorage key */
  storageKey?: string;
  /** 主题切换过渡时间(ms) */
  transitionDuration?: number;
}

// ========== Provider 组件 ==========

export function ThemeProvider({
  children,
  defaultTheme = 'alice',
  persist = true,
  storageKey = 'hajimi-theme',
  transitionDuration = 300
}: ThemeProviderProps): React.ReactElement {
  const [theme, setThemeState] = useState<PersonaTheme>(defaultTheme);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // 客户端挂载后读取持久化主题
  useEffect(() => {
    setIsMounted(true);
    
    if (persist && typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(storageKey) as PersonaTheme | null;
        if (saved && THEME_CYCLE_ORDER.includes(saved)) {
          setThemeState(saved);
        }
      } catch {
        // 忽略 localStorage 访问错误（隐私模式等）
      }
    }
  }, [persist, storageKey]);

  // 应用主题到 document
  useEffect(() => {
    if (!isMounted) return;

    const root = document.documentElement;
    
    // 设置 data-theme 属性
    root.setAttribute('data-theme', theme);
    
    // 添加过渡类
    root.classList.add('theme-transitioning');
    
    const timer = setTimeout(() => {
      root.classList.remove('theme-transitioning');
    }, transitionDuration);

    return () => clearTimeout(timer);
  }, [theme, transitionDuration, isMounted]);

  // 持久化主题
  const setTheme = useCallback((newTheme: PersonaTheme) => {
    if (!THEME_CYCLE_ORDER.includes(newTheme)) {
      console.warn(`[ThemeProvider] Unknown theme: ${newTheme}`);
      return;
    }

    setIsTransitioning(true);
    setThemeState(newTheme);

    if (persist && typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch {
        // 忽略 localStorage 写入错误
      }
    }

    setTimeout(() => setIsTransitioning(false), transitionDuration);
  }, [persist, storageKey, transitionDuration]);

  // 循环切换主题
  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_CYCLE_ORDER.indexOf(theme);
    const nextIndex = (currentIndex + 1) % THEME_CYCLE_ORDER.length;
    setTheme(THEME_CYCLE_ORDER[nextIndex]);
  }, [theme, setTheme]);

  // 构建上下文值
  const contextValue: ThemeContextState = {
    theme,
    setTheme,
    cycleTheme,
    availableThemes: Object.values(PERSONA_METADATA),
    currentMeta: PERSONA_METADATA[theme],
    isTransitioning
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

// ========== Hook ==========

/**
 * 使用主题上下文
 * @throws 如果在 Provider 外使用会抛出错误
 */
export function useTheme(): ThemeContextState {
  const context = useContext(ThemeContext);
  
  if (context === null) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}

/**
 * 安全地使用主题（不抛出错误）
 * 返回 null 如果不在 Provider 内
 */
export function useThemeSafe(): ThemeContextState | null {
  return useContext(ThemeContext);
}

// ========== 辅助 Hook ==========

/**
 * 获取当前主题的元数据
 */
export function usePersonaMeta(): PersonaMeta {
  const { currentMeta } = useTheme();
  return currentMeta;
}

/**
 * 判断当前主题是否为特定角色
 */
export function useIsPersona(persona: PersonaTheme): boolean {
  const { theme } = useTheme();
  return theme === persona;
}

// ========== 默认导出 ==========

export default ThemeProvider;
