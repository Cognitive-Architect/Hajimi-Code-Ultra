/**
 * SixStarMap - 六权星图侧边栏 v2人格化版
 * Ouroboros六边形布局 - 每节点对应角色色+头像
 */

'use client';

import React from 'react';
import type { AgentRole } from '@/lib/ui/types';
import { getAgentDisplayName } from '@/lib/ui/types';

interface SixStarMapProps {
  activeAgent?: AgentRole;
  onAgentClick?: (agent: AgentRole) => void;
  className?: string;
}

// ============ 六权星图色板 ============
const STAR_COLOR_PALETTE: Record<AgentRole, string> = {
  pm: '#884499',        // 客服小祥 - 深紫
  arch: '#669966',      // 黄瓜睦 - 深绿
  qa: '#77BBDD',        // 咕咕嘎嘎 - 水蓝
  engineer: '#FF9999',  // 唐音 - 粉
  mike: '#7777AA',      // 压力怪 - 深蓝 (Audit)
  soyorin: '#FFDD88',   // Soyorin - 米金
};

// ============ 角色人格化配置 ============
interface PersonaConfig {
  avatar: string;       // Emoji头像或首字母
  glowColor: string;    // 发光颜色
  title: string;        // 角色称号
}

const PERSONA_CONFIG: Record<AgentRole, PersonaConfig> = {
  pm: {
    avatar: '祥',
    glowColor: 'rgba(136, 68, 153, 0.6)',
    title: '立法者',
  },
  arch: {
    avatar: '🥒',
    glowColor: 'rgba(102, 153, 102, 0.6)',
    title: '架构师',
  },
  qa: {
    avatar: '🦆',
    glowColor: 'rgba(119, 187, 221, 0.6)',
    title: '质守卫',
  },
  engineer: {
    avatar: '🎀',
    glowColor: 'rgba(255, 153, 153, 0.6)',
    title: '编码使',
  },
  mike: {
    avatar: '⚡',
    glowColor: 'rgba(119, 119, 170, 0.6)',
    title: '审计官',
  },
  soyorin: {
    avatar: '素',
    glowColor: 'rgba(255, 221, 136, 0.6)',
    title: '验收者',
  },
};

// ============ 六边形布局坐标 ============
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
  const handleNodeClick = (agent: AgentRole) => {
    onAgentClick?.(agent);
  };

  return (
    <div className={`star-map-container ${className}`}>
      <style jsx>{`
        .star-map-container {
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
        }
        
        .star-header {
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .star-title {
          color: #fff;
          font-weight: 600;
          font-size: 14px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .star-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #884499;
          animation: pulse 2s infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.2); }
        }
        
        .star-map-area {
          position: relative;
          height: 300px;
          padding: 16px;
        }
        
        .star-node {
          position: absolute;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          transition: all 0.3s ease;
          z-index: 10;
        }
        
        .star-node:hover {
          transform: translate(-50%, -50%) scale(1.1);
        }
        
        .star-node.active {
          z-index: 20;
        }
        
        .star-avatar {
          width: 44px;
          height: 44px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          font-weight: bold;
          border: 2px solid rgba(255, 255, 255, 0.3);
          transition: all 0.3s ease;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        }
        
        .star-node.active .star-avatar {
          box-shadow: 0 0 20px currentColor;
          animation: pulse-glow 2s infinite;
          border-color: rgba(255, 255, 255, 0.8);
        }
        
        @keyframes pulse-glow {
          0%, 100% { 
            box-shadow: 0 0 20px currentColor, 0 0 40px currentColor;
          }
          50% { 
            box-shadow: 0 0 30px currentColor, 0 0 60px currentColor;
          }
        }
        
        .star-label {
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          color: rgba(255, 255, 255, 0.6);
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
          transition: all 0.3s ease;
        }
        
        .star-node.active .star-label {
          color: #fff;
          text-shadow: 0 0 10px currentColor;
        }
        
        .star-subtitle {
          font-size: 9px;
          color: rgba(255, 255, 255, 0.4);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        
        .star-footer {
          padding: 12px 16px;
          background: rgba(0, 0, 0, 0.2);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        
        .star-status {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: rgba(255, 255, 255, 0.5);
        }
        
        .star-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #4ade80;
          margin-right: 6px;
        }
        
        .connection-line {
          stroke: rgba(136, 68, 153, 0.3);
          stroke-width: 1;
          transition: all 0.3s ease;
        }
        
        .connection-line.active {
          stroke: rgba(136, 68, 153, 0.6);
          stroke-width: 1.5;
          filter: drop-shadow(0 0 4px rgba(136, 68, 153, 0.5));
        }
        
        .center-line {
          stroke: rgba(136, 68, 153, 0.15);
          stroke-width: 0.5;
          stroke-dasharray: 3,3;
        }
      `}</style>
      
      {/* 头部 */}
      <div className="star-header">
        <div className="star-title">
          <span className="star-pulse" />
          六权星图
          <span style={{ marginLeft: 'auto', fontSize: '10px', opacity: 0.5 }}>v2.0</span>
        </div>
      </div>
      
      {/* 六边形布局 */}
      <div className="star-map-area">
        <svg 
          className="absolute inset-0 w-full h-full" 
          viewBox="0 0 100 100"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          {/* 外圈连接线 */}
          {AGENT_POSITIONS.map((pos, i) => {
            const nextPos = AGENT_POSITIONS[(i + 1) % AGENT_POSITIONS.length];
            const isActive = activeAgent === pos.agent || activeAgent === nextPos.agent;
            return (
              <line
                key={`line-${i}`}
                x1={pos.x}
                y1={pos.y}
                x2={nextPos.x}
                y2={nextPos.y}
                className={`connection-line ${isActive ? 'active' : ''}`}
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
              className="center-line"
            />
          ))}
        </svg>
        
        {/* Agent节点 */}
        {AGENT_POSITIONS.map((pos) => {
          const persona = PERSONA_CONFIG[pos.agent];
          const color = STAR_COLOR_PALETTE[pos.agent];
          const isActive = activeAgent === pos.agent;
          const displayName = getAgentDisplayName(pos.agent);
          
          return (
            <button
              key={pos.agent}
              onClick={() => handleNodeClick(pos.agent)}
              className={`star-node ${isActive ? 'active' : ''}`}
              style={{ 
                left: `${pos.x}%`, 
                top: `${pos.y}%`,
                color: color, // 用于currentColor继承
              }}
              aria-label={displayName}
              title={`${displayName} - ${persona.title}`}
            >
              <div 
                className="star-avatar"
                style={{ 
                  background: `linear-gradient(135deg, ${color}dd, ${color}88)`,
                  color: '#fff',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                {persona.avatar}
              </div>
              <div className="star-label" style={{ color: isActive ? color : undefined }}>
                {displayName}
              </div>
              <div className="star-subtitle">{persona.title}</div>
            </button>
          );
        })}
      </div>
      
      {/* 底部状态 */}
      <div className="star-footer">
        <div className="star-status">
          <span>Ouroboros System</span>
          <span style={{ display: 'flex', alignItems: 'center' }}>
            <span className="star-status-dot" />
            运行中
          </span>
        </div>
      </div>
    </div>
  );
};

export default SixStarMap;
