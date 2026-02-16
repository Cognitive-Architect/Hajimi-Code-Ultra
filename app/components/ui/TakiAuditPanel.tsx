/**
 * TakiAuditPanel - 压力怪（椎名立希）审计界面组件
 * B-02/09 压力怪界面工程师 → 审计界面人格化
 * 
 * 人设：深蓝 #7777AA，锐利眼神，鼓手
 * 性格：严格、毒舌、但认可时会别扭地表达
 */

'use client';

import React, { useState, useEffect } from 'react';

// 评级类型
export type AuditGrade = 'S' | 'A' | 'B' | 'C' | 'D';

// 审计结果接口
export interface AuditResult {
  grade: AuditGrade;
  score: number;
  issues: AuditIssue[];
  debtCount: number;
  timestamp: Date;
}

// 审计问题接口
export interface AuditIssue {
  id: string;
  type: 'critical' | 'warning' | 'info';
  message: string;
  file?: string;
  line?: number;
}

// 评级配置
interface GradeConfig {
  label: string;
  color: string;
  bgColor: string;
  quote: string;
  quoteCn: string;
  intensity: number; // 震动强度
}

// 压力怪台词系统
const GRADE_CONFIG: Record<AuditGrade, GradeConfig> = {
  S: {
    label: 'S',
    color: '#FFD700',
    bgColor: 'rgba(255, 215, 0, 0.2)',
    quote: '認める',
    quoteCn: '认可',
    intensity: 0,
  },
  A: {
    label: 'A',
    color: '#7777AA',
    bgColor: 'rgba(119, 119, 170, 0.2)',
    quote: '...悪くない',
    quoteCn: '...还行吧',
    intensity: 0,
  },
  B: {
    label: 'B',
    color: '#6699CC',
    bgColor: 'rgba(102, 153, 204, 0.2)',
    quote: 'まあまあ',
    quoteCn: '还行',
    intensity: 0,
  },
  C: {
    label: 'C',
    color: '#888888',
    bgColor: 'rgba(136, 136, 136, 0.2)',
    quote: 'ふつう',
    quoteCn: '普通',
    intensity: 0,
  },
  D: {
    label: 'D',
    color: '#CC4444',
    bgColor: 'rgba(204, 68, 68, 0.2)',
    quote: 'つまらない',
    quoteCn: '无聊',
    intensity: 4, // D级触发震动
  },
};

interface TakiAuditPanelProps {
  result?: AuditResult;
  isLoading?: boolean;
  onReaudit?: () => void;
  className?: string;
}

/**
 * 压力怪审计面板组件
 * 
 * 使用示例：
 * ```tsx
 * <TakiAuditPanel 
 *   result={{
 *     grade: 'A',
 *     score: 92,
 *     issues: [],
 *     debtCount: 0,
 *     timestamp: new Date()
 *   }}
 * />
 * ```
 */
export const TakiAuditPanel: React.FC<TakiAuditPanelProps> = ({
  result,
  isLoading = false,
  onReaudit,
  className = '',
}) => {
  const [isShaking, setIsShaking] = useState(false);
  const [showDebtWarning, setShowDebtWarning] = useState(false);

  // D级评级触发震动动画
  useEffect(() => {
    if (result?.grade === 'D') {
      setIsShaking(true);
      const timer = setTimeout(() => setIsShaking(false), 900); // 0.3s * 3 = 900ms
      return () => clearTimeout(timer);
    }
  }, [result?.grade]);

  // 发现债务时触发警告
  useEffect(() => {
    if (result && result.debtCount > 0) {
      setShowDebtWarning(true);
      const timer = setTimeout(() => setShowDebtWarning(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [result?.debtCount]);

  const config = result ? GRADE_CONFIG[result.grade] : null;

  // 计算评级进度条宽度
  const getProgressWidth = (grade: AuditGrade) => {
    const widths: Record<AuditGrade, string> = {
      S: '100%',
      A: '80%',
      B: '60%',
      C: '40%',
      D: '20%',
    };
    return widths[grade];
  };

  if (isLoading) {
    return (
      <div className={`ouroboros-card p-6 ${className}`}>
        <div className="flex items-center gap-4">
          {/* 压力怪头像占位 */}
          <div className="agent-avatar bg-[#7777AA] animate-breathe">
            <span className="text-2xl">🥁</span>
          </div>
          <div className="flex-1">
            <div className="h-4 bg-slate-700 rounded animate-pulse w-32 mb-2" />
            <div className="h-3 bg-slate-700 rounded animate-pulse w-48" />
          </div>
        </div>
        <div className="mt-4 text-center text-[#7777AA] animate-pulse">
          正在敲鼓审计中...
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={`ouroboros-card p-6 ${className}`}>
        <div className="flex items-center gap-4">
          <div className="agent-avatar bg-[#7777AA]">
            <span className="text-2xl">🥁</span>
          </div>
          <div>
            <h3 className="text-lg font-bold text-[#7777AA]">椎名立希</h3>
            <p className="text-sm text-slate-400">等待审计...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`ouroboros-card p-6 ${className} ${
        isShaking ? 'audit-warning' : ''
      } ${showDebtWarning ? 'audit-debt-warning' : ''}`}
      style={{
        borderColor: isShaking ? '#7777AA' : undefined,
      }}
    >
      {/* 头部：压力怪头像 + 评级 */}
      <div className="flex items-center gap-4 mb-6">
        <div
          className="agent-avatar bg-[#7777AA] relative"
          style={{
            animation: showDebtWarning ? 'drum-beat 0.15s ease-in-out 4' : undefined,
          }}
        >
          <span className="text-2xl">🥁</span>
          {/* 锐利眼神指示器 */}
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-pulse" />
        </div>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-bold text-[#7777AA]">椎名立希</h3>
            {result.debtCount > 0 && (
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                哈？！{result.debtCount}个债务
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">
            审计时间: {result.timestamp.toLocaleTimeString()}
          </p>
        </div>

        {/* 评级徽章 */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold"
          style={{
            backgroundColor: config?.bgColor,
            color: config?.color,
            border: `2px solid ${config?.color}`,
          }}
        >
          {config?.label}
        </div>
      </div>

      {/* 台词显示区 */}
      <div className="mb-6 p-4 bg-slate-900/50 rounded-xl border border-[#7777AA]/20">
        <div className="flex items-start gap-3">
          <span className="text-3xl font-bold text-[#7777AA]">"</span>
          <div className="flex-1">
            <p className="text-xl font-medium text-white mb-1">
              {config?.quote}
            </p>
            <p className="text-sm text-slate-400">{config?.quoteCn}</p>
          </div>
          <span className="text-3xl font-bold text-[#7777AA]">"</span>
        </div>
      </div>

      {/* 分数进度条 */}
      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-slate-400">代码质量评分</span>
          <span
            className="font-bold"
            style={{ color: config?.color }}
          >
            {result.score}/100
          </span>
        </div>
        <div className="h-3 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-1000 ease-out"
            style={{
              width: getProgressWidth(result.grade),
              background: `linear-gradient(90deg, ${config?.color}, ${config?.color}88)`,
            }}
          />
        </div>
        {/* 评级刻度 */}
        <div className="flex justify-between mt-1 text-xs text-slate-500">
          <span>D</span>
          <span>C</span>
          <span>B</span>
          <span>A</span>
          <span>S</span>
        </div>
      </div>

      {/* 问题列表 */}
      {result.issues.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-slate-300 mb-3">
            发现问题 ({result.issues.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {result.issues.map((issue) => (
              <div
                key={issue.id}
                className={`p-3 rounded-lg text-sm ${
                  issue.type === 'critical'
                    ? 'bg-red-500/10 border border-red-500/30'
                    : issue.type === 'warning'
                    ? 'bg-yellow-500/10 border border-yellow-500/30'
                    : 'bg-blue-500/10 border border-blue-500/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      issue.type === 'critical'
                        ? 'bg-red-500'
                        : issue.type === 'warning'
                        ? 'bg-yellow-500'
                        : 'bg-blue-500'
                    }`}
                  />
                  <span className="font-medium text-slate-200">
                    {issue.type === 'critical'
                      ? '严重'
                      : issue.type === 'warning'
                      ? '警告'
                      : '提示'}
                  </span>
                  {issue.file && (
                    <span className="text-xs text-slate-500">
                      {issue.file}:{issue.line}
                    </span>
                  )}
                </div>
                <p className="text-slate-400 pl-4">{issue.message}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 底部操作 */}
      {onReaudit && (
        <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
          <button
            onClick={onReaudit}
            className="ouroboros-btn text-sm"
            style={{
              background: 'linear-gradient(135deg, #7777AA, #555588)',
            }}
          >
            重新审计
          </button>
        </div>
      )}
    </div>
  );
};

export default TakiAuditPanel;
