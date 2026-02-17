/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - 七权六角星形面板
 * ============================================================
 * 文件: desktop/renderer/components/seven-star.tsx
 * 职责: 七权可视化React组件、权限控制、交互面板
 * 设计: 六角星形布局，七色主题系统
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';

// ============================================================
// 类型定义
// ============================================================

type AgentRole = 'orchestrator' | 'architect' | 'engineer' | 'qa' | 'audit' | 'pm' | 'doctor';

interface AgentConfig {
  id: AgentRole;
  name: string;
  displayName: string;
  color: string;
  secondaryColor: string;
  icon: string;
  description: string;
  permissions: string[];
  shortcut: string;
}

interface AgentStatus {
  id: AgentRole;
  status: 'active' | 'idle' | 'busy' | 'offline';
  load: number;
  lastActive: string;
  taskCount: number;
}

interface SevenStarProps {
  /** 当前激活的Agent */
  activeAgent?: AgentRole;
  /** Agent状态列表 */
  agentStatuses?: AgentStatus[];
  /** 尺寸 */
  size?: number;
  /** 切换Agent回调 */
  onAgentSwitch?: (agent: AgentRole) => void;
  /** 是否可交互 */
  interactive?: boolean;
  /** 主题模式 */
  theme?: 'light' | 'dark';
}

// ============================================================
// 七权配置
// ============================================================

const AGENT_CONFIGS: Record<AgentRole, AgentConfig> = {
  orchestrator: {
    id: 'orchestrator',
    name: '客服小祥',
    displayName: 'Mutsumi',
    color: '#884499',
    secondaryColor: '#BB88CC',
    icon: '👑',
    description: 'Orchestrator - 编排与协调',
    permissions: ['all', 'governance', 'system'],
    shortcut: '1',
  },
  architect: {
    id: 'architect',
    name: '黄瓜睦',
    displayName: 'Mortis',
    color: '#669966',
    secondaryColor: '#99CC99',
    icon: '🥒',
    description: 'Architect - 架构设计',
    permissions: ['design', 'patterns', 'review'],
    shortcut: '2',
  },
  engineer: {
    id: 'engineer',
    name: '唐音',
    displayName: 'Anon',
    color: '#FF9999',
    secondaryColor: '#FFCCCC',
    icon: '💻',
    description: 'Engineer - 工程实现',
    permissions: ['code', 'debug', 'optimize'],
    shortcut: '3',
  },
  qa: {
    id: 'qa',
    name: '咕咕嘎嘎',
    displayName: 'Tomori',
    color: '#77BBDD',
    secondaryColor: '#AADDEE',
    icon: '🔍',
    description: 'QA - 质量保证',
    permissions: ['test', 'verify', 'report'],
    shortcut: '4',
  },
  audit: {
    id: 'audit',
    name: '压力怪',
    displayName: 'Taki',
    color: '#7777AA',
    secondaryColor: '#AAAAEE',
    icon: '📊',
    description: 'Audit - 审计与合规',
    permissions: ['audit', 'security', 'compliance'],
    shortcut: '5',
  },
  pm: {
    id: 'pm',
    name: 'Soyorin',
    displayName: 'Soyo',
    color: '#FFDD88',
    secondaryColor: '#FFEEAA',
    icon: '📋',
    description: 'PM - 项目管理',
    permissions: ['plan', 'track', 'coordinate'],
    shortcut: '6',
  },
  doctor: {
    id: 'doctor',
    name: '奶龙娘',
    displayName: 'Kotone',
    color: '#FFDD00',
    secondaryColor: '#FFEE66',
    icon: '✨',
    description: 'Doctor - 诊断与修复',
    permissions: ['diagnose', 'repair', 'heal'],
    shortcut: '7',
  },
};

const AGENT_ORDER: AgentRole[] = [
  'orchestrator',
  'architect',
  'engineer',
  'qa',
  'audit',
  'pm',
  'doctor',
];

// ============================================================
// 辅助函数
// ============================================================

/** 计算七边形顶点位置 */
function calculateHeptagonPositions(centerX: number, centerY: number, radius: number): Array<{ x: number; y: number; angle: number }> {
  const positions = [];
  const angleStep = (2 * Math.PI) / 7;
  
  for (let i = 0; i < 7; i++) {
    // 从顶部开始 (-90度)
    const angle = -Math.PI / 2 + i * angleStep;
    positions.push({
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
      angle: (angle * 180) / Math.PI,
    });
  }
  
  return positions;
}

/** 获取状态颜色 */
function getStatusColor(status: AgentStatus['status']): string {
  switch (status) {
    case 'active': return '#22C55E';  // green-500
    case 'busy': return '#F59E0B';    // amber-500
    case 'idle': return '#6B7280';    // gray-500
    case 'offline': return '#EF4444'; // red-500
    default: return '#6B7280';
  }
}

/** 获取状态文字 */
function getStatusText(status: AgentStatus['status']): string {
  switch (status) {
    case 'active': return '活跃';
    case 'busy': return '忙碌';
    case 'idle': return '空闲';
    case 'offline': return '离线';
    default: return '未知';
  }
}

// ============================================================
// 主组件
// ============================================================

export const SevenStar: React.FC<SevenStarProps> = ({
  activeAgent = 'orchestrator',
  agentStatuses = [],
  size = 400,
  onAgentSwitch,
  interactive = true,
  theme = 'light',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredAgent, setHoveredAgent] = useState<AgentRole | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [animationPhase, setAnimationPhase] = useState(0);

  // 中心点和半径
  const centerX = size / 2;
  const centerY = size / 2;
  const outerRadius = size * 0.38;
  const innerRadius = size * 0.15;

  // 计算位置
  const positions = calculateHeptagonPositions(centerX, centerY, outerRadius);

  // 状态映射
  const statusMap = React.useMemo(() => {
    const map = new Map<AgentRole, AgentStatus>();
    agentStatuses.forEach(s => map.set(s.id, s));
    return map;
  }, [agentStatuses]);

  // 动画效果
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimationPhase(p => (p + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  // 键盘快捷键
  useEffect(() => {
    if (!interactive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const index = parseInt(e.key) - 1;
      if (index >= 0 && index < 7) {
        const agent = AGENT_ORDER[index];
        handleAgentClick(agent);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [interactive]);

  // Agent切换处理
  const handleAgentClick = useCallback((agentId: AgentRole) => {
    if (!interactive) return;
    
    const status = statusMap.get(agentId);
    if (status?.status === 'offline') {
      return; // 离线Agent不可选
    }

    onAgentSwitch?.(agentId);
    
    // 切换动画
    setIsExpanded(true);
    setTimeout(() => setIsExpanded(false), 300);
  }, [interactive, onAgentSwitch, statusMap]);

  // 渲染Agent节点
  const renderAgentNode = (agentId: AgentRole, index: number) => {
    const config = AGENT_CONFIGS[agentId];
    const status = statusMap.get(agentId) || { 
      status: 'idle', 
      load: 0, 
      taskCount: 0,
      lastActive: new Date().toISOString(),
    };
    const pos = positions[index];
    const isActive = activeAgent === agentId;
    const isHovered = hoveredAgent === agentId;
    const isOffline = status.status === 'offline';

    // 动态样式
    const nodeSize = isActive ? 64 : isHovered ? 56 : 48;
    const scale = isActive ? 1.1 : isHovered ? 1.05 : 1;
    const glowOpacity = isActive ? 0.6 : isHovered ? 0.4 : 0.2;

    return (
      <g
        key={agentId}
        transform={`translate(${pos.x}, ${pos.y})`}
        style={{
          cursor: interactive && !isOffline ? 'pointer' : 'not-allowed',
          transition: 'all 0.3s ease',
        }}
        onClick={() => handleAgentClick(agentId)}
        onMouseEnter={() => setHoveredAgent(agentId)}
        onMouseLeave={() => setHoveredAgent(null)}
      >
        {/* 外发光 */}
        <circle
          r={nodeSize * 0.8}
          fill={`url(#glow-${agentId})`}
          opacity={glowOpacity}
          style={{
            animation: isActive ? 'pulse 2s ease-in-out infinite' : undefined,
          }}
        />

        {/* 连接线 */}
        <line
          x1={0}
          y1={0}
          x2={centerX - pos.x}
          y2={centerY - pos.y}
          stroke={config.color}
          strokeWidth={isActive ? 3 : 1}
          strokeOpacity={isActive ? 0.8 : 0.3}
          strokeDasharray={isOffline ? '4 4' : undefined}
        />

        {/* 主节点 */}
        <circle
          r={nodeSize / 2}
          fill={isOffline ? '#374151' : config.color}
          stroke={isActive ? '#FFFFFF' : config.secondaryColor}
          strokeWidth={isActive ? 4 : 2}
          style={{
            filter: `drop-shadow(0 4px 8px ${config.color}40)`,
            transform: `scale(${scale})`,
            transition: 'all 0.2s ease',
            opacity: isOffline ? 0.5 : 1,
          }}
        />

        {/* 图标 */}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={isActive ? 28 : 24}
          style={{ pointerEvents: 'none' }}
        >
          {config.icon}
        </text>

        {/* 状态指示器 */}
        <circle
          cx={nodeSize / 3}
          cy={-nodeSize / 3}
          r={6}
          fill={getStatusColor(status.status)}
          stroke="#FFFFFF"
          strokeWidth={2}
        />

        {/* 负载指示条 */}
        {status.load > 0 && (
          <g transform={`translate(${-nodeSize / 2}, ${nodeSize / 2 + 8})`}>
            <rect
              width={nodeSize}
              height={4}
              rx={2}
              fill="#374151"
            />
            <rect
              width={nodeSize * status.load}
              height={4}
              rx={2}
              fill={status.load > 0.8 ? '#EF4444' : status.load > 0.5 ? '#F59E0B' : '#22C55E'}
            />
          </g>
        )}

        {/* 标签 */}
        <g transform={`translate(0, ${nodeSize / 2 + 24})`}>
          <text
            textAnchor="middle"
            fontSize={12}
            fontWeight={isActive ? 'bold' : 'normal'}
            fill={theme === 'dark' ? '#E5E7EB' : '#1F2937'}
          >
            {config.name}
          </text>
          <text
            textAnchor="middle"
            y={14}
            fontSize={10}
            fill={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
          >
            {getStatusText(status.status)}
            {status.taskCount > 0 && ` · ${status.taskCount}任务`}
          </text>
        </g>

        {/* 快捷键提示 */}
        {isHovered && interactive && (
          <g transform={`translate(${nodeSize / 2 + 8}, ${-nodeSize / 2})`}>
            <rect
              width={20}
              height={20}
              rx={4}
              fill="#1F2937"
            />
            <text
              x={10}
              y={14}
              textAnchor="middle"
              fontSize={12}
              fill="#FFFFFF"
              fontWeight="bold"
            >
              {config.shortcut}
            </text>
          </g>
        )}
      </g>
    );
  };

  // 渲染中心节点
  const renderCenterNode = () => {
    const activeConfig = AGENT_CONFIGS[activeAgent];
    const rotation = animationPhase;

    return (
      <g transform={`translate(${centerX}, ${centerY})`}>
        {/* 旋转背景 */}
        <g style={{ transform: `rotate(${rotation}deg)`, transformOrigin: 'center' }}>
          {[...Array(7)].map((_, i) => (
            <line
              key={i}
              x1={0}
              y1={0}
              x2={innerRadius * 1.5 * Math.cos((i * 2 * Math.PI) / 7)}
              y2={innerRadius * 1.5 * Math.sin((i * 2 * Math.PI) / 7)}
              stroke={activeConfig.color}
              strokeWidth={2}
              strokeOpacity={0.3}
            />
          ))}
        </g>

        {/* 中心圆 */}
        <circle
          r={innerRadius}
          fill={theme === 'dark' ? '#1F2937' : '#FFFFFF'}
          stroke={activeConfig.color}
          strokeWidth={3}
          style={{
            filter: `drop-shadow(0 0 20px ${activeConfig.color}60)`,
          }}
        />

        {/* 中心图标 */}
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={36}
          style={{ pointerEvents: 'none' }}
        >
          {activeConfig.icon}
        </text>

        {/* 活跃Agent名称 */}
        <text
          y={innerRadius + 24}
          textAnchor="middle"
          fontSize={14}
          fontWeight="bold"
          fill={activeConfig.color}
        >
          {activeConfig.name}
        </text>
        <text
          y={innerRadius + 40}
          textAnchor="middle"
          fontSize={11}
          fill={theme === 'dark' ? '#9CA3AF' : '#6B7280'}
        >
          {activeConfig.description}
        </text>
      </g>
    );
  };

  return (
    <div
      ref={containerRef}
      className={`seven-star-panel ${theme}`}
      style={{
        width: size,
        height: size + 60,
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <svg
        width={size}
        height={size + 60}
        viewBox={`0 0 ${size} ${size + 60}`}
        style={{
          overflow: 'visible',
          transform: isExpanded ? 'scale(1.02)' : 'scale(1)',
          transition: 'transform 0.3s ease',
        }}
      >
        <defs>
          {/* 发光渐变定义 */}
          {AGENT_ORDER.map((agentId) => {
            const config = AGENT_CONFIGS[agentId];
            return (
              <radialGradient key={agentId} id={`glow-${agentId}`}>
                <stop offset="0%" stopColor={config.color} stopOpacity="1" />
                <stop offset="100%" stopColor={config.color} stopOpacity="0" />
              </radialGradient>
            );
          })}
        </defs>

        {/* 外圈连线 */}
        <polygon
          points={positions.map(p => `${p.x},${p.y}`).join(' ')}
          fill="none"
          stroke={theme === 'dark' ? '#374151' : '#E5E7EB'}
          strokeWidth={2}
          strokeDasharray="8 4"
          opacity={0.5}
        />

        {/* Agent节点 */}
        {AGENT_ORDER.map((agentId, index) => renderAgentNode(agentId, index))}

        {/* 中心节点 */}
        {renderCenterNode()}

        {/* CSS动画定义 */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 0.4; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.1); }
          }
        `}</style>
      </svg>

      {/* 权限面板 */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          textAlign: 'center',
          padding: '8px 16px',
          background: theme === 'dark' ? '#1F2937' : '#F9FAFB',
          borderRadius: 8,
          border: `1px solid ${AGENT_CONFIGS[activeAgent].color}40`,
        }}
      >
        <div style={{ fontSize: 11, color: '#6B7280', marginBottom: 4 }}>
          当前权限
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {AGENT_CONFIGS[activeAgent].permissions.map((perm) => (
            <span
              key={perm}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                background: `${AGENT_CONFIGS[activeAgent].color}20`,
                color: AGENT_CONFIGS[activeAgent].color,
                borderRadius: 4,
                textTransform: 'uppercase',
              }}
            >
              {perm}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default SevenStar;
