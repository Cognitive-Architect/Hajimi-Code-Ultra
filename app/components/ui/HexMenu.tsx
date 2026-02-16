/**
 * HexMenu - 七权拨号盘（六角星形菜单）
 * B-04/09 悬浮球工程师 → 七权头像悬浮球基础
 * 
 * 功能：
 * - 六角星形布局菜单
 * - 六权环绕中心
 * - 点击选择切换主题
 */

'use client';

import React, { useCallback } from 'react';
import { Crown, HardHat, Search, Code, Package, FileCheck, X } from 'lucide-react';

type AgentRole = 'pm' | 'arch' | 'qa' | 'engineer' | 'mike' | 'soyorin' | 'mutsumi';

interface HexMenuProps {
  activeAgent?: AgentRole;
  onSelect?: (agent: AgentRole) => void;
  onClose?: () => void;
}

interface AgentConfig {
  id: AgentRole;
  name: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}

const AGENT_CONFIGS: AgentConfig[] = [
  {
    id: 'pm',
    name: '产品经理',
    color: '#884499',
    bgColor: 'rgba(136, 68, 153, 0.2)',
    icon: Crown,
  },
  {
    id: 'arch',
    name: '架构师',
    color: '#EE6677',
    bgColor: 'rgba(238, 102, 119, 0.2)',
    icon: HardHat,
  },
  {
    id: 'qa',
    name: '质检',
    color: '#66BB66',
    bgColor: 'rgba(102, 187, 102, 0.2)',
    icon: Search,
  },
  {
    id: 'engineer',
    name: '工程师',
    color: '#FFDD88',
    bgColor: 'rgba(255, 221, 136, 0.2)',
    icon: Code,
  },
  {
    id: 'mike',
    name: 'Mike',
    color: '#7777AA',
    bgColor: 'rgba(119, 119, 170, 0.2)',
    icon: Package,
  },
  {
    id: 'soyorin',
    name: 'Soyorin',
    color: '#884499',
    bgColor: 'rgba(136, 68, 153, 0.2)',
    icon: FileCheck,
  },
];

// 六角形位置（从顶部开始，顺时针）
const HEX_POSITIONS = [
  { angle: -90, distance: 80 },   // 顶部 - PM
  { angle: -30, distance: 80 },   // 右上 - Arch
  { angle: 30, distance: 80 },    // 右下 - QA
  { angle: 90, distance: 80 },    // 底部 - Engineer
  { angle: 150, distance: 80 },   // 左下 - Mike
  { angle: 210, distance: 80 },   // 左上 - Soyorin
];

export const HexMenu: React.FC<HexMenuProps> = ({
  activeAgent = 'soyorin',
  onSelect,
  onClose,
}) => {
  const handleSelect = useCallback((agent: AgentRole) => {
    onSelect?.(agent);
  }, [onSelect]);

  // 计算位置
  const getPosition = (index: number) => {
    const pos = HEX_POSITIONS[index];
    const radian = (pos.angle * Math.PI) / 180;
    const x = Math.cos(radian) * pos.distance;
    const y = Math.sin(radian) * pos.distance;
    return { x, y };
  };

  return (
    <div className="absolute bottom-14 right-14">
      {/* 背景遮罩 */}
      <div 
        className="fixed inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        style={{ zIndex: -1 }}
      />
      
      {/* 菜单容器 */}
      <div className="relative w-48 h-48">
        {/* 中心装饰 */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 animate-pulse" />
        
        {/* 六角星形连接线 SVG */}
        <svg 
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 192 192"
          style={{ transform: 'translate(-50%, -50%)', left: '50%', top: '50%' }}
        >
          {/* 六边形连接线 */}
          {HEX_POSITIONS.map((_, i) => {
            const start = getPosition(i);
            const end = getPosition((i + 1) % 6);
            return (
              <line
                key={`hex-line-${i}`}
                x1={96 + start.x}
                y1={96 + start.y}
                x2={96 + end.x}
                y2={96 + end.y}
                stroke="rgba(136, 68, 153, 0.3)"
                strokeWidth="1"
                strokeDasharray="4,4"
              />
            );
          })}
          {/* 中心到各点的连接线 */}
          {HEX_POSITIONS.map((_, i) => {
            const pos = getPosition(i);
            return (
              <line
                key={`center-line-${i}`}
                x1={96}
                y1={96}
                x2={96 + pos.x}
                y2={96 + pos.y}
                stroke="rgba(136, 68, 153, 0.15)"
                strokeWidth="0.5"
              />
            );
          })}
        </svg>

        {/* Agent按钮 */}
        {AGENT_CONFIGS.map((agent, index) => {
          const pos = getPosition(index);
          const isActive = activeAgent === agent.id;
          const Icon = agent.icon;

          return (
            <button
              key={agent.id}
              onClick={() => handleSelect(agent.id)}
              className={`
                absolute w-12 h-12 rounded-full
                flex flex-col items-center justify-center
                transition-all duration-300 ease-out
                hover:scale-110 active:scale-95
                ${isActive ? 'scale-110 z-10' : 'opacity-90'}
              `}
              style={{
                left: `calc(50% + ${pos.x}px - 24px)`,
                top: `calc(50% + ${pos.y}px - 24px)`,
                background: isActive 
                  ? `linear-gradient(135deg, ${agent.color}, ${agent.color}DD)`
                  : `linear-gradient(135deg, ${agent.bgColor}, rgba(30, 41, 59, 0.8))`,
                border: isActive 
                  ? `2px solid ${agent.color}` 
                  : '1px solid rgba(255,255,255,0.1)',
                boxShadow: isActive 
                  ? `0 0 20px ${agent.color}66, 0 4px 8px rgba(0,0,0,0.3)` 
                  : '0 2px 8px rgba(0,0,0,0.2)',
              }}
              title={agent.name}
            >
              <Icon 
                className="w-5 h-5" 
                style={{ 
                  color: isActive ? 'white' : agent.color,
                }} 
              />
              {/* 标签 */}
              <span 
                className={`
                  absolute -bottom-5 text-[10px] whitespace-nowrap font-medium
                  transition-opacity duration-300
                  ${isActive ? 'opacity-100' : 'opacity-70'}
                `}
                style={{ color: isActive ? agent.color : '#94A3B8' }}
              >
                {agent.name}
              </span>
            </button>
          );
        })}

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-white/60 hover:text-white hover:bg-slate-700/80 transition-all duration-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default HexMenu;
