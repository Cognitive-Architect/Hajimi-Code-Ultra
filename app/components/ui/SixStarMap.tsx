/**
 * SixStarMap - 六权星图侧边栏
 * 新增组件：Ouroboros六边形布局
 */

'use client';

import React from 'react';
import { Crown, HardHat, Search, Code, Package, FileCheck } from 'lucide-react';
import type { AgentRole } from '@/lib/ui/types';
import { getAgentDisplayName, AGENT_DISPLAY_CONFIG } from '@/lib/ui/types';

interface SixStarMapProps {
  activeAgent?: AgentRole;
  onAgentClick?: (agent: AgentRole) => void;
  className?: string;
}

const AGENT_ICONS: Record<AgentRole, React.ElementType> = {
  pm: Crown,
  arch: HardHat,
  qa: Search,
  engineer: Code,
  mike: Package,
  soyorin: FileCheck,
};

const AGENT_POSITIONS = [
  { agent: 'pm' as AgentRole, x: 50, y: 10 },
  { agent: 'arch' as AgentRole, x: 85, y: 35 },
  { agent: 'qa' as AgentRole, x: 70, y: 75 },
  { agent: 'engineer' as AgentRole, x: 30, y: 75 },
  { agent: 'mike' as AgentRole, x: 15, y: 35 },
  { agent: 'soyorin' as AgentRole, x: 50, y: 50 },
];

export const SixStarMap: React.FC<SixStarMapProps> = ({
  activeAgent,
  onAgentClick,
  className = '',
}) => {
  return (
    <div className={`bg-slate-900 rounded-2xl border border-white/10 overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
          六权星图
        </h3>
      </div>
      
      {/* 六边形布局 */}
      <div className="relative h-[300px] p-4">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {/* 连接线 */}
          {AGENT_POSITIONS.map((pos, i) => {
            const nextPos = AGENT_POSITIONS[(i + 1) % AGENT_POSITIONS.length];
            return (
              <line
                key={`line-${i}`}
                x1={pos.x}
                y1={pos.y}
                x2={nextPos.x}
                y2={nextPos.y}
                stroke="rgba(136, 68, 153, 0.3)"
                strokeWidth="0.5"
              />
            );
          })}
          {/* 中心到各点的线 */}
          {AGENT_POSITIONS.filter(p => p.agent !== 'soyorin').map((pos, i) => (
            <line
              key={`center-line-${i}`}
              x1={50}
              y1={50}
              x2={pos.x}
              y2={pos.y}
              stroke="rgba(136, 68, 153, 0.2)"
              strokeWidth="0.3"
              strokeDasharray="2,2"
            />
          ))}
        </svg>
        
        {/* Agent节点 */}
        {AGENT_POSITIONS.map((pos) => {
          const Icon = AGENT_ICONS[pos.agent];
          const config = AGENT_DISPLAY_CONFIG[pos.agent];
          const isActive = activeAgent === pos.agent;
          
          return (
            <button
              key={pos.agent}
              onClick={() => onAgentClick?.(pos.agent)}
              className={`
                absolute transform -translate-x-1/2 -translate-y-1/2
                flex flex-col items-center gap-1
                transition-all duration-300
                ${isActive ? 'scale-110 z-10' : 'hover:scale-105'}
              `}
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center
                transition-all duration-300
                ${isActive 
                  ? 'bg-gradient-to-br from-purple-500 to-blue-500 shadow-lg shadow-purple-500/50 animate-pulse' 
                  : 'bg-slate-800 border border-white/20 hover:border-purple-500/50'}
              `}>
                <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-white/60'}`} />
              </div>
              <span className={`
                text-xs font-medium whitespace-nowrap
                ${isActive ? 'text-purple-400' : 'text-white/50'}
              `}>
                {config.name}
              </span>
            </button>
          );
        })}
      </div>
      
      {/* 底部状态 */}
      <div className="px-4 py-3 border-t border-white/10 bg-slate-800/30">
        <div className="flex items-center justify-between text-xs text-white/50">
          <span>Ouroboros v1.0</span>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
            运行中
          </span>
        </div>
      </div>
    </div>
  );
};

export default SixStarMap;
