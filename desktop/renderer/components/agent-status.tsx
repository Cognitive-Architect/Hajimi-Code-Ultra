/**
 * ============================================================
 * HAJIMI Desktop v1.4.0 - Agent状态呼吸灯面板
 * ============================================================
 * 文件: desktop/renderer/components/agent-status.tsx
 * 职责: 实时状态显示、性能指标(CPU/内存)、日志滚动
 * 设计: 赛博朋克风格呼吸灯效果
 * 
 * @version 1.4.0
 * @author Hajimi Team
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================================
// 类型定义
// ============================================================

interface PerformanceMetrics {
  cpu: number;           // CPU使用率 0-100
  memory: number;        // 内存使用率 0-100
  heapUsed: number;      // 堆内存使用 (MB)
  heapTotal: number;     // 堆内存总量 (MB)
  responseTime: number;  // 响应时间 (ms)
  activeConnections: number;
}

interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  agent: string;
  message: string;
  details?: any;
}

interface AgentHealth {
  agentId: string;
  agentName: string;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  heartbeat: number;     // 上次心跳 (ms ago)
  tasksPending: number;
  tasksCompleted: number;
  errorRate: number;     // 错误率 0-1
}

interface AgentStatusProps {
  /** Agent健康状态列表 */
  agents?: AgentHealth[];
  /** 性能指标 */
  metrics?: PerformanceMetrics;
  /** 日志条目 */
  logs?: LogEntry[];
  /** 是否显示日志 */
  showLogs?: boolean;
  /** 主题 */
  theme?: 'light' | 'dark' | 'cyberpunk';
  /** 紧凑模式 */
  compact?: boolean;
  /** 刷新间隔(ms) */
  refreshInterval?: number;
}

// ============================================================
// 辅助函数
// ============================================================

/** 生成唯一ID */
const generateId = () => `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

/** 格式化时间 */
const formatTime = (date: Date): string => {
  return date.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

/** 获取状态颜色 */
const getStatusColor = (status: AgentHealth['status'], theme: string): string => {
  const colors: Record<string, Record<string, string>> = {
    healthy: { light: '#22C55E', dark: '#4ADE80', cyberpunk: '#00FF88' },
    warning: { light: '#F59E0B', dark: '#FBBF24', cyberpunk: '#FFAA00' },
    critical: { light: '#EF4444', dark: '#F87171', cyberpunk: '#FF0044' },
    offline: { light: '#6B7280', dark: '#9CA3AF', cyberpunk: '#666666' },
  };
  return colors[status]?.[theme] || colors[status].light;
};

/** 获取日志级别颜色 */
const getLogLevelColor = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return '#EF4444';
    case 'warn': return '#F59E0B';
    case 'info': return '#3B82F6';
    case 'debug': return '#6B7280';
    default: return '#6B7280';
  }
};

/** 获取日志级别图标 */
const getLogLevelIcon = (level: LogEntry['level']): string => {
  switch (level) {
    case 'error': return '✕';
    case 'warn': return '⚠';
    case 'info': return 'ℹ';
    case 'debug': return '◆';
    default: return '•';
  }
};

// ============================================================
// 子组件: 呼吸灯
// ============================================================

interface BreatheLightProps {
  status: AgentHealth['status'];
  size?: number;
  theme: string;
  pulse?: boolean;
}

const BreatheLight: React.FC<BreatheLightProps> = ({ 
  status, 
  size = 12, 
  theme,
  pulse = true,
}) => {
  const color = getStatusColor(status, theme);
  const isOffline = status === 'offline';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        backgroundColor: color,
        boxShadow: isOffline 
          ? 'none'
          : `0 0 ${size}px ${color}, 0 0 ${size * 2}px ${color}40`,
        animation: pulse && !isOffline ? `breathe-${status} 2s ease-in-out infinite` : undefined,
        transition: 'all 0.3s ease',
      }}
    >
      <style>{`
        @keyframes breathe-healthy {
          0%, 100% { opacity: 0.8; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
        @keyframes breathe-warning {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          25% { opacity: 1; transform: scale(1.1); }
          75% { opacity: 0.8; transform: scale(1.05); }
        }
        @keyframes breathe-critical {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
};

// ============================================================
// 子组件: 性能仪表盘
// ============================================================

interface GaugeProps {
  value: number;
  max?: number;
  label: string;
  unit?: string;
  color?: string;
  size?: number;
  theme: string;
}

const Gauge: React.FC<GaugeProps> = ({ 
  value, 
  max = 100, 
  label, 
  unit = '%',
  color,
  size = 80,
  theme,
}) => {
  const percentage = Math.min(Math.max(value / max, 0), 1);
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - percentage * circumference;

  // 根据值自动选择颜色
  const getColor = () => {
    if (color) return color;
    if (percentage > 0.8) return '#EF4444';
    if (percentage > 0.6) return '#F59E0B';
    return '#22C55E';
  };

  const barColor = getColor();
  const bgColor = theme === 'dark' ? '#374151' : '#E5E7EB';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        {/* 背景圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={bgColor}
          strokeWidth={strokeWidth}
        />
        {/* 进度圆环 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={barColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'all 0.5s ease' }}
        />
      </svg>
      <div style={{ 
        marginTop: -size / 2 - 8, 
        fontSize: size / 4,
        fontWeight: 'bold',
        color: barColor,
      }}>
        {Math.round(value)}{unit}
      </div>
      <div style={{ 
        fontSize: size / 6, 
        color: theme === 'dark' ? '#9CA3AF' : '#6B7280',
        marginTop: size / 8,
      }}>
        {label}
      </div>
    </div>
  );
};

// ============================================================
// 子组件: 日志面板
// ============================================================

interface LogPanelProps {
  logs: LogEntry[];
  theme: string;
  maxHeight?: number;
}

const LogPanel: React.FC<LogPanelProps> = ({ logs, theme, maxHeight = 200 }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // 自动滚动到底部
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 20;
      setAutoScroll(isAtBottom);
    }
  }, []);

  return (
    <div
      style={{
        background: theme === 'dark' ? '#111827' : '#F9FAFB',
        borderRadius: 8,
        padding: 12,
        fontFamily: 'monospace',
        fontSize: 12,
      }}
    >
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8,
        paddingBottom: 8,
        borderBottom: `1px solid ${theme === 'dark' ? '#374151' : '#E5E7EB'}`,
      }}>
        <span style={{ fontWeight: 'bold', color: theme === 'dark' ? '#E5E7EB' : '#1F2937' }}>
          系统日志
        </span>
        <span style={{ fontSize: 10, color: '#6B7280' }}>
          {logs.length} 条 · {autoScroll ? '自动滚动中' : '已暂停'}
        </span>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        style={{
          maxHeight,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {logs.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#6B7280', padding: '20px 0' }}>
            暂无日志
          </div>
        ) : (
          logs.slice(-100).map((log) => (
            <div
              key={log.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                padding: '4px 8px',
                borderRadius: 4,
                background: log.level === 'error' 
                  ? 'rgba(239, 68, 68, 0.1)' 
                  : log.level === 'warn'
                  ? 'rgba(245, 158, 11, 0.1)'
                  : 'transparent',
              }}
            >
              <span style={{ 
                color: getLogLevelColor(log.level),
                fontWeight: 'bold',
                minWidth: 16,
              }}>
                {getLogLevelIcon(log.level)}
              </span>
              <span style={{ color: '#6B7280', minWidth: 60 }}>
                {formatTime(log.timestamp)}
              </span>
              <span style={{ 
                color: getLogLevelColor(log.level),
                fontWeight: log.level === 'error' ? 'bold' : 'normal',
                flex: 1,
              }}>
                [{log.agent}] {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

// ============================================================
// 主组件
// ============================================================

export const AgentStatus: React.FC<AgentStatusProps> = ({
  agents = [],
  metrics,
  logs = [],
  showLogs = true,
  theme = 'dark',
  compact = false,
  refreshInterval = 1000,
}) => {
  const [currentMetrics, setCurrentMetrics] = useState<PerformanceMetrics | undefined>(metrics);
  const [currentLogs, setCurrentLogs] = useState<LogEntry[]>(logs);

  // 模拟实时数据更新（如果没有提供）
  useEffect(() => {
    if (metrics) {
      setCurrentMetrics(metrics);
      return;
    }

    const interval = setInterval(() => {
      // 模拟性能数据
      setCurrentMetrics({
        cpu: 20 + Math.random() * 30,
        memory: 40 + Math.random() * 20,
        heapUsed: 150 + Math.random() * 50,
        heapTotal: 512,
        responseTime: 50 + Math.random() * 100,
        activeConnections: Math.floor(5 + Math.random() * 10),
      });

      // 模拟日志
      if (Math.random() > 0.7) {
        const levels: LogEntry['level'][] = ['info', 'debug', 'warn', 'error'];
        const agents = ['Orchestrator', 'Architect', 'Engineer', 'QA', 'Audit', 'PM', 'Doctor'];
        const messages = [
          '处理用户请求',
          '执行分支操作',
          '完成代码分析',
          '检测到异常',
          '同步完成',
          '任务队列更新',
        ];

        const newLog: LogEntry = {
          id: generateId(),
          timestamp: new Date(),
          level: levels[Math.floor(Math.random() * levels.length)],
          agent: agents[Math.floor(Math.random() * agents.length)],
          message: messages[Math.floor(Math.random() * messages.length)],
        };

        setCurrentLogs(prev => [...prev, newLog].slice(-200));
      }
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [metrics, refreshInterval]);

  // 默认Agent数据（如果没有提供）
  const displayAgents = agents.length > 0 ? agents : [
    { agentId: 'orchestrator', agentName: 'Orchestrator', status: 'healthy' as const, heartbeat: 500, tasksPending: 2, tasksCompleted: 156, errorRate: 0.01 },
    { agentId: 'architect', agentName: 'Architect', status: 'healthy' as const, heartbeat: 800, tasksPending: 0, tasksCompleted: 89, errorRate: 0 },
    { agentId: 'engineer', agentName: 'Engineer', status: 'warning' as const, heartbeat: 1200, tasksPending: 5, tasksCompleted: 234, errorRate: 0.03 },
    { agentId: 'qa', agentName: 'QA', status: 'healthy' as const, heartbeat: 600, tasksPending: 1, tasksCompleted: 178, errorRate: 0.02 },
    { agentId: 'audit', agentName: 'Audit', status: 'healthy' as const, heartbeat: 900, tasksPending: 0, tasksCompleted: 67, errorRate: 0 },
    { agentId: 'pm', agentName: 'PM', status: 'healthy' as const, heartbeat: 700, tasksPending: 3, tasksCompleted: 112, errorRate: 0.01 },
    { agentId: 'doctor', agentName: 'Doctor', status: 'offline' as const, heartbeat: 5000, tasksPending: 0, tasksCompleted: 0, errorRate: 0 },
  ];

  const bgColor = theme === 'dark' ? '#1F2937' : '#FFFFFF';
  const textColor = theme === 'dark' ? '#E5E7EB' : '#1F2937';
  const borderColor = theme === 'dark' ? '#374151' : '#E5E7EB';

  return (
    <div
      style={{
        background: bgColor,
        borderRadius: 12,
        padding: compact ? 12 : 20,
        minWidth: compact ? 280 : 360,
        boxShadow: theme === 'cyberpunk' 
          ? '0 0 20px rgba(0, 255, 136, 0.3)' 
          : '0 4px 20px rgba(0,0,0,0.1)',
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* 标题 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: compact ? 12 : 20,
      }}>
        <h3 style={{ margin: 0, color: textColor, fontSize: compact ? 14 : 16 }}>
          Agent 状态监控
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ 
            fontSize: 11, 
            color: '#6B7280',
            background: theme === 'dark' ? '#374151' : '#F3F4F6',
            padding: '2px 8px',
            borderRadius: 4,
          }}>
            {displayAgents.filter(a => a.status === 'healthy').length}/{displayAgents.length} 在线
          </span>
          <BreatheLight 
            status={displayAgents.every(a => a.status === 'healthy') ? 'healthy' : 'warning'} 
            size={8}
            theme={theme}
          />
        </div>
      </div>

      {/* Agent状态列表 */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: compact ? '1fr' : 'repeat(2, 1fr)',
        gap: 12,
        marginBottom: showLogs ? 20 : 0,
      }}>
        {displayAgents.map((agent) => (
          <div
            key={agent.agentId}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: compact ? 8 : 12,
              background: theme === 'dark' ? '#111827' : '#F9FAFB',
              borderRadius: 8,
              border: `1px solid ${getStatusColor(agent.status, theme)}30`,
            }}
          >
            <BreatheLight status={agent.status} size={compact ? 10 : 12} theme={theme} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ 
                fontSize: compact ? 12 : 13, 
                fontWeight: 600, 
                color: textColor,
                display: 'flex',
                justifyContent: 'space-between',
              }}>
                <span>{agent.agentName}</span>
                {agent.tasksPending > 0 && (
                  <span style={{ 
                    fontSize: 10, 
                    background: '#F59E0B', 
                    color: '#FFFFFF',
                    padding: '0 6px',
                    borderRadius: 10,
                  }}>
                    {agent.tasksPending}
                  </span>
                )}
              </div>
              <div style={{ 
                fontSize: 10, 
                color: '#6B7280',
                marginTop: 2,
              }}>
                心跳 {Math.round(agent.heartbeat)}ms · 完成 {agent.tasksCompleted}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* 性能仪表盘 */}
      {currentMetrics && !compact && (
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-around',
          padding: '16px 0',
          marginBottom: showLogs ? 20 : 0,
          borderTop: `1px solid ${borderColor}`,
          borderBottom: showLogs ? `1px solid ${borderColor}` : undefined,
        }}>
          <Gauge 
            value={currentMetrics.cpu} 
            label="CPU" 
            theme={theme}
            size={70}
          />
          <Gauge 
            value={currentMetrics.memory} 
            label="内存" 
            theme={theme}
            size={70}
          />
          <Gauge 
            value={currentMetrics.responseTime} 
            max={500}
            label="响应" 
            unit="ms"
            theme={theme}
            size={70}
          />
          <div style={{ textAlign: 'center' }}>
            <div style={{ 
              fontSize: 24, 
              fontWeight: 'bold', 
              color: '#22C55E',
            }}>
              {currentMetrics.activeConnections}
            </div>
            <div style={{ fontSize: 11, color: '#6B7280' }}>连接数</div>
          </div>
        </div>
      )}

      {/* 日志面板 */}
      {showLogs && <LogPanel logs={currentLogs} theme={theme} />}
    </div>
  );
};

export default AgentStatus;
