/**
 * ErrorPersona - 错误码人格化展示组件
 * B-03/09 彩蛋工程师任务
 * 
 * 将HTTP错误码以MyGO!!!!!角色风格展示
 * 让错误页面变得有趣且充满梗
 */

'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Home, AlertTriangle, Music } from 'lucide-react';
import { 
  getErrorPersona, 
  getCharacterGradient,
  type ErrorPersona 
} from '@/app/lib/error-persona';

export interface ErrorPersonaProps {
  /** HTTP状态码 */
  statusCode: number;
  /** 错误详情（可选） */
  error?: Error;
  /** 重置函数 */
  reset?: () => void;
  /** 是否显示详细错误信息 */
  showDetails?: boolean;
  /** 自定义返回首页链接 */
  homeHref?: string;
  /** 是否启用动画 */
  animated?: boolean;
}

/**
 * 获取角色特殊效果
 */
function getCharacterEffects(character: string): {
  particleEmoji: string;
  particleCount: number;
  animationStyle: string;
} {
  const effects: Record<string, ReturnType<typeof getCharacterEffects>> = {
    soyorin: {
      particleEmoji: '🌸',
      particleCount: 8,
      animationStyle: 'gentle-float',
    },
    taki: {
      particleEmoji: '⚡',
      particleCount: 6,
      animationStyle: 'sharp-pulse',
    },
    saki: {
      particleEmoji: '❄️',
      particleCount: 10,
      animationStyle: 'slow-fall',
    },
    kaname: {
      particleEmoji: '🐱',
      particleCount: 5,
      animationStyle: 'bounce',
    },
    tomori: {
      particleEmoji: '📝',
      particleCount: 7,
      animationStyle: 'drift',
    },
    anon: {
      particleEmoji: '✨',
      particleCount: 12,
      animationStyle: 'sparkle',
    },
  };
  
  return effects[character] ?? {
    particleEmoji: '🎵',
    particleCount: 6,
    animationStyle: 'float',
  };
}

/**
 * 粒子效果组件
 */
const ParticleEffects: React.FC<{ 
  character: string; 
  enabled: boolean;
  color: string;
}> = ({ character, enabled, color }) => {
  if (!enabled) return null;
  
  const { particleEmoji, particleCount } = getCharacterEffects(character);
  
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: particleCount }).map((_, i) => (
        <div
          key={i}
          className="absolute animate-float"
          style={{
            left: `${Math.random() * 100}%`,
            top: `${Math.random() * 100}%`,
            animationDelay: `${Math.random() * 3}s`,
            animationDuration: `${3 + Math.random() * 2}s`,
            opacity: 0.3 + Math.random() * 0.4,
            fontSize: `${16 + Math.random() * 16}px`,
            color: color,
          }}
        >
          {particleEmoji}
        </div>
      ))}
    </div>
  );
};

/**
 * 角色台词气泡
 */
const QuoteBubble: React.FC<{ persona: ErrorPersona }> = ({ persona }) => {
  return (
    <div 
      className="relative mt-6 p-4 rounded-2xl border-2"
      style={{ 
        borderColor: `${persona.color}40`,
        background: `linear-gradient(135deg, ${persona.color}10, transparent)`,
      }}
    >
      {/* 气泡小三角 */}
      <div 
        className="absolute -top-2 left-8 w-4 h-4 rotate-45 border-l-2 border-t-2"
        style={{ borderColor: `${persona.color}40`, background: `${persona.color}10` }}
      />
      
      <div className="flex items-start gap-3">
        <span className="text-3xl">{persona.icon}</span>
        <div>
          <p 
            className="text-lg font-bold"
            style={{ color: persona.color }}
          >
            「{persona.title}」
          </p>
          {persona.subtitle && (
            <p className="text-xs text-white/40 mt-1">{persona.subtitle}</p>
          )}
          <p className="text-white/80 mt-2 text-sm leading-relaxed">
            {persona.message}
          </p>
        </div>
      </div>
    </div>
  );
};

/**
 * 角色展示卡片
 */
const CharacterCard: React.FC<{ 
  persona: ErrorPersona; 
  statusCode: number;
  animated: boolean;
}> = ({ persona, statusCode, animated }) => {
  const gradientClass = getCharacterGradient(persona.character);
  
  return (
    <div className={`
      relative overflow-hidden rounded-3xl border-2
      transition-all duration-500
      ${animated ? 'hover:scale-[1.02] hover:shadow-2xl' : ''}
    `}
    style={{ borderColor: `${persona.color}30` }}
    >
      {/* 背景渐变 */}
      <div className={`absolute inset-0 bg-gradient-to-br ${gradientClass}`} />
      
      {/* 粒子效果 */}
      <ParticleEffects 
        character={persona.character} 
        enabled={animated}
        color={persona.color}
      />
      
      {/* 内容 */}
      <div className="relative z-10 p-8">
        {/* 状态码大数字 */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <span 
              className="text-7xl font-black tracking-tighter"
              style={{ 
                color: persona.color,
                textShadow: `0 0 40px ${persona.color}40`,
              }}
            >
              {statusCode}
            </span>
            <p className="text-white/40 text-sm mt-1">HTTP ERROR</p>
          </div>
          
          {/* 角色图标 */}
          <div 
            className={`
              w-24 h-24 rounded-2xl flex items-center justify-center
              border-2 text-5xl
              ${animated ? 'animate-pulse-slow' : ''}
            `}
            style={{ 
              borderColor: `${persona.color}50`,
              background: `linear-gradient(135deg, ${persona.color}20, transparent)`,
              boxShadow: `0 0 30px ${persona.color}20`,
            }}
          >
            {persona.icon}
          </div>
        </div>
        
        {/* 角色名 */}
        <div className="mb-4">
          <h2 
            className="text-2xl font-bold"
            style={{ color: persona.color }}
          >
            {persona.name}
          </h2>
          <div className="flex items-center gap-2 mt-1">
            <div 
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: persona.color }}
            />
            <span className="text-white/50 text-sm capitalize">
              {persona.character}
            </span>
          </div>
        </div>
        
        {/* 台词气泡 */}
        <QuoteBubble persona={persona} />
      </div>
    </div>
  );
};

/**
 * 操作按钮组
 */
const ActionButtons: React.FC<{
  reset?: () => void;
  homeHref: string;
  personaColor: string;
}> = ({ reset, homeHref, personaColor }) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 mt-8">
      {reset && (
        <button
          onClick={reset}
          className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105"
          style={{ 
            backgroundColor: `${personaColor}20`,
            border: `2px solid ${personaColor}40`,
            color: personaColor,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${personaColor}30`;
            e.currentTarget.style.boxShadow = `0 0 20px ${personaColor}30`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = `${personaColor}20`;
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          <RefreshCw className="w-5 h-5 group-hover:animate-spin" />
          <span>再试一次</span>
        </button>
      )}
      
      <a
        href={homeHref}
        className="group flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-all duration-300 hover:scale-105 bg-white/10 text-white border-2 border-white/20 hover:bg-white/20"
      >
        <Home className="w-5 h-5 group-hover:animate-bounce" />
        <span>返回首页</span>
      </a>
    </div>
  );
};

/**
 * 错误详情展开器
 */
const ErrorDetails: React.FC<{ error?: Error }> = ({ error }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  if (!error) return null;
  
  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-white/50 hover:text-white/80 transition-colors"
      >
        <AlertTriangle className="w-4 h-4" />
        <span className="text-sm">{isOpen ? '隐藏' : '显示'}技术详情</span>
      </button>
      
      {isOpen && (
        <div className="mt-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-left">
          <p className="text-red-400 font-mono text-sm break-all">
            {error.message}
          </p>
          {error.stack && (
            <pre className="mt-2 text-xs text-red-300/60 overflow-x-auto">
              {error.stack}
            </pre>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * ErrorPersona 主组件
 * 
 * 将HTTP错误以MyGO!!!!!角色风格展示
 */
export const ErrorPersona: React.FC<ErrorPersonaProps> = ({
  statusCode,
  error,
  reset,
  showDetails = false,
  homeHref = '/',
  animated = true,
}) => {
  const persona = getErrorPersona(statusCode);
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 防止水合不匹配
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-lg animate-pulse">
          <div className="h-96 bg-slate-800 rounded-3xl" />
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-lg">
        {/* 顶部装饰 */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <Music className="w-5 h-5 text-white/30" />
          <span className="text-white/30 text-sm tracking-widest uppercase">
            MyGO!!!!! Error System
          </span>
          <Music className="w-5 h-5 text-white/30" />
        </div>
        
        {/* 角色卡片 */}
        <CharacterCard 
          persona={persona} 
          statusCode={statusCode}
          animated={animated}
        />
        
        {/* 操作按钮 */}
        <ActionButtons 
          reset={reset}
          homeHref={homeHref}
          personaColor={persona.color}
        />
        
        {/* 错误详情 */}
        {showDetails && <ErrorDetails error={error} />}
        
        {/* 底部彩蛋提示 */}
        <div className="mt-8 text-center">
          <p className="text-white/20 text-xs">
            这是彩蛋 #{statusCode} · 
            <span style={{ color: `${persona.color}60` }}>
              {' '}@{persona.character}
            </span>
          </p>
        </div>
      </div>
      
      {/* 全局CSS动画 */}
      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(1.05); }
        }
        .animate-float {
          animation: float 3s ease-in-out infinite;
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default ErrorPersona;
