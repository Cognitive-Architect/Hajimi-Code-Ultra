/**
 * FloatingOrb - 七权头像悬浮球
 * B-04/09 悬浮球工程师 → 七权头像悬浮球基础
 * 
 * 功能：
 * - 右下角48px悬浮球固定定位
 * - 呼吸动画（scale 0.95-1.0）
 * - 点击展开六角星形菜单（七权拨号盘）
 * - 三色状态：正常/旋转/警告
 */

'use client';

import React, { useState, useCallback } from 'react';
import { HexMenu } from './HexMenu';

type OrbState = 'idle' | 'rotating' | 'warning';
type AgentTheme = 'mutsumi' | 'soyorin' | 'mike' | 'qa' | 'engineer' | 'pm' | 'arch';

interface FloatingOrbProps {
  initialTheme?: AgentTheme;
  onThemeChange?: (theme: AgentTheme) => void;
}

// 主题色配置
const THEME_COLORS: Record<AgentTheme, { primary: string; secondary: string; shadow: string }> = {
  mutsumi: {
    primary: '#884499',
    secondary: '#AA66BB',
    shadow: 'rgba(136, 68, 153, 0.6)',
  },
  soyorin: {
    primary: '#884499',
    secondary: '#AA66BB',
    shadow: 'rgba(136, 68, 153, 0.6)',
  },
  mike: {
    primary: '#7777AA',
    secondary: '#9999CC',
    shadow: 'rgba(119, 119, 170, 0.6)',
  },
  qa: {
    primary: '#66BB66',
    secondary: '#88DD88',
    shadow: 'rgba(102, 187, 102, 0.6)',
  },
  engineer: {
    primary: '#FFDD88',
    secondary: '#FFEEAA',
    shadow: 'rgba(255, 221, 136, 0.6)',
  },
  pm: {
    primary: '#884499',
    secondary: '#AA66BB',
    shadow: 'rgba(136, 68, 153, 0.6)',
  },
  arch: {
    primary: '#EE6677',
    secondary: '#FF88AA',
    shadow: 'rgba(238, 102, 119, 0.6)',
  },
};

// Q版头像SVG - 客服小祥（Mutsumi/Soyorin风格）
const SoyorinAvatar: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 48 48"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* 头部轮廓 */}
    <circle cx="24" cy="24" r="20" fill="url(#faceGradient)" />
    
    {/* 头发 - 左侧 */}
    <path
      d="M8 20C8 12 14 6 24 6C34 6 40 12 40 20C40 24 38 28 36 30L34 26C36 24 36 22 36 20C36 14 32 10 24 10C16 10 12 14 12 20C12 22 12 24 14 26L12 30C10 28 8 24 8 20Z"
      fill="#884499"
    />
    
    {/* 头发 - 右侧刘海 */}
    <path
      d="M24 10C28 10 32 12 34 16L32 18C30 15 27 14 24 14C21 14 18 15 16 18L14 16C16 12 20 10 24 10Z"
      fill="#662277"
    />
    
    {/* 眼睛 - 左眼 */}
    <ellipse cx="17" cy="26" rx="3" ry="4" fill="#1E293B" />
    <circle cx="18" cy="25" r="1" fill="white" />
    
    {/* 眼睛 - 右眼 */}
    <ellipse cx="31" cy="26" rx="3" ry="4" fill="#1E293B" />
    <circle cx="32" cy="25" r="1" fill="white" />
    
    {/* 腮红 */}
    <circle cx="14" cy="32" r="2" fill="#FF88AA" opacity="0.6" />
    <circle cx="34" cy="32" r="2" fill="#FF88AA" opacity="0.6" />
    
    {/* 嘴巴 */}
    <path
      d="M21 34C21 34 22 36 24 36C26 36 27 34 27 34"
      stroke="#1E293B"
      strokeWidth="1.5"
      strokeLinecap="round"
      fill="none"
    />
    
    {/* 定义渐变 */}
    <defs>
      <linearGradient id="faceGradient" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
        <stop stopColor="#FFEEE6" />
        <stop offset="1" stopColor="#FFD6C2" />
      </linearGradient>
    </defs>
  </svg>
);

export const FloatingOrb: React.FC<FloatingOrbProps> = ({
  initialTheme = 'mutsumi',
  onThemeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<AgentTheme>(initialTheme);
  const [orbState, setOrbState] = useState<OrbState>('idle');

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleThemeSelect = useCallback((agent: AgentTheme) => {
    setTheme(agent);
    onThemeChange?.(agent);
    // 选择后短暂延迟关闭菜单
    setTimeout(() => setIsOpen(false), 300);
  }, [onThemeChange]);

  const colors = THEME_COLORS[theme];

  // 根据状态计算动画类名
  const getAnimationClass = () => {
    switch (orbState) {
      case 'rotating':
        return 'animate-orb-rotate';
      case 'warning':
        return 'animate-orb-breathe animate-orb-warning';
      case 'idle':
      default:
        return 'animate-orb-breathe';
    }
  };

  // 计算阴影样式
  const getShadowStyle = () => {
    if (isOpen) {
      return `0 0 30px ${colors.shadow}`;
    }
    if (orbState === 'warning') {
      return '0 0 20px rgba(239, 68, 68, 0.5)';
    }
    return `0 0 15px ${colors.shadow.replace('0.6', '0.3')}`;
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {/* 七权拨号盘（六角星形菜单） */}
      {isOpen && (
        <HexMenu
          activeAgent={theme}
          onSelect={handleThemeSelect}
          onClose={() => setIsOpen(false)}
        />
      )}

      {/* 悬浮球 */}
      <button
        onClick={handleToggle}
        className={`
          w-12 h-12 rounded-full 
          transition-all duration-300
          flex items-center justify-center
          ${getAnimationClass()}
        `}
        style={{
          background: `linear-gradient(135deg, ${colors.primary}, ${colors.secondary})`,
          opacity: isOpen ? 1 : 0.85,
          boxShadow: getShadowStyle(),
          border: isOpen ? '2px solid rgba(255,255,255,0.3)' : '2px solid transparent',
        }}
        aria-label="打开七权菜单"
        aria-expanded={isOpen}
      >
        {/* Q版头像SVG */}
        <SoyorinAvatar className="w-8 h-8" />
      </button>

      {/* 状态指示器（小圆点） */}
      <div
        className={`
          absolute -top-1 -right-1 w-3 h-3 rounded-full
          transition-all duration-300
          ${orbState === 'warning' ? 'bg-red-500 animate-pulse' : ''}
          ${orbState === 'rotating' ? 'bg-blue-500' : ''}
          ${orbState === 'idle' ? 'bg-green-500' : ''}
        `}
        style={{
          boxShadow: orbState === 'warning' 
            ? '0 0 8px rgba(239, 68, 68, 0.8)' 
            : '0 0 4px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
};

export default FloatingOrb;
