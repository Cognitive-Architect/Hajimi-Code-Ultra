/**
 * YGGDRASIL 四象限控制面板
 * 
 * 集成四象限操作按钮:
 * - Regenerate: 状态重置
 * - Remix: 上下文重生
 * - Branch: 分支管理
 * - Rollback: 回滚操作
 */

'use client';

import { useState, useCallback } from 'react';
import { 
  RefreshCw, 
  GitBranch, 
  Undo2, 
  Compress,
  Zap,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { QuadrantAction, CompressionLevel } from '@/lib/yggdrasil/types';

interface OperationStatus {
  action: QuadrantAction | null;
  loading: boolean;
  result: { success: boolean; message: string } | null;
}

interface YggdrasilMetrics {
  regenerate: {
    totalOperations: number;
    averageDurationMs: number;
  };
  remix: {
    averageSavingsRate: number;
    totalPatterns: number;
  };
}

export default function YggdrasilPanel() {
  const [status, setStatus] = useState<OperationStatus>({
    action: null,
    loading: false,
    result: null,
  });
  
  const [metrics, setMetrics] = useState<YggdrasilMetrics>({
    regenerate: { totalOperations: 0, averageDurationMs: 0 },
    remix: { averageSavingsRate: 0, totalPatterns: 0 },
  });

  const [showRemixOptions, setShowRemixOptions] = useState(false);
  const [compressionLevel, setCompressionLevel] = useState<CompressionLevel>(2);

  // 执行Regenerate
  const handleRegenerate = useCallback(async () => {
    setStatus({ action: 'REGENERATE', loading: true, result: null });
    
    try {
      const response = await fetch('/api/v1/yggdrasil/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          sessionId: 'default-session',
          preserveAgentState: true,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus({
          action: 'REGENERATE',
          loading: false,
          result: { 
            success: true, 
            message: `释放 ${(data.data.releasedBytes / 1024 / 1024).toFixed(2)} MB, 耗时 ${data.data.durationMs}ms` 
          },
        });
        // 更新指标
        setMetrics(prev => ({
          ...prev,
          regenerate: {
            totalOperations: prev.regenerate.totalOperations + 1,
            averageDurationMs: data.data.durationMs,
          },
        }));
      } else {
        setStatus({
          action: 'REGENERATE',
          loading: false,
          result: { success: false, message: data.error || '操作失败' },
        });
      }
    } catch (error) {
      setStatus({
        action: 'REGENERATE',
        loading: false,
        result: { success: false, message: '网络错误' },
      });
    }
  }, []);

  // 执行Remix
  const handleRemix = useCallback(async () => {
    setStatus({ action: 'REMIX', loading: true, result: null });
    setShowRemixOptions(false);
    
    try {
      const response = await fetch('/api/v1/yggdrasil/remix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: 'default-session',
          workspaceId: 'default-workspace',
          compressionLevel,
          minSavingsRate: 0.6,
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus({
          action: 'REMIX',
          loading: false,
          result: {
            success: true,
            message: `Token: ${data.data.originalTokens} → ${data.data.compressedTokens} (节省 ${(data.data.savingsRate * 100).toFixed(0)}%)`,
          },
        });
        setMetrics(prev => ({
          ...prev,
          remix: {
            totalPatterns: prev.remix.totalPatterns + 1,
            averageSavingsRate: data.data.savingsRate,
          },
        }));
      } else {
        setStatus({
          action: 'REMIX',
          loading: false,
          result: { success: false, message: data.error || '压缩失败' },
        });
      }
    } catch (error) {
      setStatus({
        action: 'REMIX',
        loading: false,
        result: { success: false, message: '网络错误' },
      });
    }
  }, [compressionLevel]);

  // 创建快照
  const handleCreateSnapshot = useCallback(async () => {
    setStatus({ action: 'ROLLBACK', loading: true, result: null });
    
    try {
      const response = await fetch('/api/v1/yggdrasil/rollback', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'default-session' }),
      });

      const data = await response.json();
      
      if (data.success) {
        setStatus({
          action: 'ROLLBACK',
          loading: false,
          result: { success: true, message: `快照已创建: ${data.snapshot.id.slice(0, 8)}...` },
        });
      } else {
        setStatus({
          action: 'ROLLBACK',
          loading: false,
          result: { success: false, message: data.error || '创建失败' },
        });
      }
    } catch (error) {
      setStatus({
        action: 'ROLLBACK',
        loading: false,
        result: { success: false, message: '网络错误' },
      });
    }
  }, []);

  // 按钮组件
  const ActionButton = ({
    action,
    icon: Icon,
    label,
    color,
    onClick,
    disabled = false,
  }: {
    action: QuadrantAction;
    icon: React.ElementType;
    label: string;
    color: string;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={onClick}
      disabled={disabled || status.loading}
      className={`group relative flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200 ${
        status.loading && status.action === action
          ? 'bg-gray-100 cursor-wait'
          : `bg-white hover:bg-${color}-50 border border-gray-200 hover:border-${color}-300 shadow-sm hover:shadow-md`
      }`}
    >
      {status.loading && status.action === action ? (
        <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
      ) : (
        <Icon className={`w-8 h-8 text-${color}-500 group-hover:scale-110 transition-transform`} />
      )}
      <span className="mt-2 text-sm font-medium text-gray-700">{label}</span>
      
      {/* 悬停提示 */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
        {action === 'REGENERATE' && '清空Transient层，释放内存'}
        {action === 'REMIX' && '压缩上下文，节省Token'}
        {action === 'BRANCH' && '创建并行分支'}
        {action === 'ROLLBACK' && '创建回滚快照'}
      </div>
    </button>
  );

  return (
    <div className="bg-white rounded-2xl shadow-lg p-6 max-w-2xl mx-auto">
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800">YGGDRASIL</h2>
            <p className="text-sm text-gray-500">四象限聊天治理系统</p>
          </div>
        </div>
        
        {/* 指标展示 */}
        <div className="flex gap-4 text-xs text-gray-500">
          <div className="text-right">
            <div className="font-semibold text-emerald-600">{metrics.regenerate.totalOperations}</div>
            <div>重置次数</div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-blue-600">{(metrics.remix.averageSavingsRate * 100).toFixed(0)}%</div>
            <div>节省率</div>
          </div>
        </div>
      </div>

      {/* 四象限按钮 */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <ActionButton
          action="REGENERATE"
          icon={RefreshCw}
          label="状态重置"
          color="emerald"
          onClick={handleRegenerate}
        />
        
        <div className="relative">
          <ActionButton
            action="REMIX"
            icon={Compress}
            label="上下文重生"
            color="blue"
            onClick={() => setShowRemixOptions(!showRemixOptions)}
          />
          
          {/* Remix选项弹窗 */}
          {showRemixOptions && (
            <div className="absolute top-full left-0 mt-2 p-4 bg-white rounded-xl shadow-xl border border-gray-200 z-10 w-48">
              <p className="text-sm font-medium text-gray-700 mb-3">压缩级别</p>
              <div className="space-y-2">
                {([1, 2, 3] as CompressionLevel[]).map((level) => (
                  <label key={level} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="compression"
                      checked={compressionLevel === level}
                      onChange={() => setCompressionLevel(level)}
                      className="text-blue-500"
                    />
                    <span className="text-sm text-gray-600">
                      Level {level} ({level === 1 ? '50%' : level === 2 ? '70%' : '90%'})
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleRemix}
                className="mt-4 w-full py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
              >
                执行压缩
              </button>
            </div>
          )}
        </div>

        <ActionButton
          action="BRANCH"
          icon={GitBranch}
          label="并行提案"
          color="purple"
          onClick={() => alert('分支功能在P1版本提供')}
        />
        
        <ActionButton
          action="ROLLBACK"
          icon={Undo2}
          label="三重回滚"
          color="amber"
          onClick={handleCreateSnapshot}
        />
      </div>

      {/* 操作结果 */}
      {status.result && (
        <div className={`flex items-center gap-3 p-4 rounded-xl ${
          status.result.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
        }`}>
          {status.result.success ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <div className="flex-1">
            <p className="font-medium">
              {status.action === 'REGENERATE' && '状态重置'}
              {status.action === 'REMIX' && '上下文重生'}
              {status.action === 'BRANCH' && '分支操作'}
              {status.action === 'ROLLBACK' && '回滚操作'}
              {status.result.success ? '成功' : '失败'}
            </p>
            <p className="text-sm opacity-80">{status.result.message}</p>
          </div>
        </div>
      )}

      {/* 帮助文本 */}
      <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-400">
        <p>YGGDRASIL v0.1 | P0 MVP: Regenerate + Remix 已就绪</p>
      </div>
    </div>
  );
}
