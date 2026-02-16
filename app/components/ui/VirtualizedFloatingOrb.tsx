/**
 * HAJIMI VIRTUALIZED - 客服小祥虚拟化悬浮球
 * 
 * Phase 5人格化UI集成
 * 主题色: #884499 (客服小祥)
 * 
 * @version 1.0.0
 */

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { FloatingBall, FloatingBallState } from '@/app/api/v1/virtualized/ui/floating-ball';

interface VirtualizedFloatingOrbProps {
  /** 初始虚拟化模式 */
  defaultVirtualizedMode?: boolean;
  /** 活跃Agent数量 */
  activeAgents?: number;
  /** 污染率 */
  contaminationRate?: number;
}

/**
 * 客服小祥虚拟化悬浮球组件
 * 
 * 功能:
 * - 显示虚拟化模式指示灯（🟢/🔴）
 * - 快捷键提示（Ctrl+R/M/Z）
 * - 实时健康状态
 */
export const VirtualizedFloatingOrb: React.FC<VirtualizedFloatingOrbProps> = ({
  defaultVirtualizedMode = true,
  activeAgents = 0,
  contaminationRate = 0,
}) => {
  const [floatingBall] = useState(() => new FloatingBall());
  const [state, setState] = useState<FloatingBallState>(() => floatingBall.getState());
  const [isHovered, setIsHovered] = useState(false);

  // 更新状态
  useEffect(() => {
    const newState = floatingBall.updateState(contaminationRate, activeAgents);
    setState(newState);
  }, [floatingBall, activeAgents, contaminationRate]);

  // 快捷键处理
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const key = e.ctrlKey ? `Ctrl+${e.key.toUpperCase()}` : e.key;
    const result = floatingBall.handleShortcut(key);
    
    if (result.handled) {
      e.preventDefault();
      console.log(`[Virtualized] Shortcut triggered: ${key} -> ${result.action}`);
      
      // 触发相应操作
      switch (result.action) {
        case 'spawn':
          // 调用spawn API
          fetch('/api/v1/virtualized/spawn', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: `agent-${Date.now()}` }),
          });
          break;
        case 'remix':
          // 调用remix API
          fetch('/api/v1/virtualized/remix', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: 'test data', mode: 'BALANCED' }),
          });
          break;
        case 'rollback':
          // 调用rollback API
          fetch('/api/v1/virtualized/rollback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ level: 'L1', agentId: 'current' }),
          });
          break;
      }
    }
  }, [floatingBall]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // 主题色
  const themeColor = '#884499';
  const healthColor = state.healthScore >= 90 ? '#22c55e' : state.healthScore >= 70 ? '#eab308' : '#ef4444';

  return (
    <div
      className="fixed bottom-5 right-5 z-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 悬浮球 */}
      <div
        className="w-14 h-14 rounded-full flex items-center justify-center cursor-pointer transition-all duration-300 hover:scale-110 shadow-lg"
        style={{
          background: `linear-gradient(135deg, ${themeColor} 0%, #667eea 100%)`,
          boxShadow: `0 4px 15px ${themeColor}66`,
        }}
      >
        <span className="text-2xl">{state.indicator}</span>
      </div>

      {/* 提示框 */}
      {isHovered && (
        <div
          className="absolute bottom-16 right-0 w-72 bg-white rounded-xl shadow-2xl p-4 border"
          style={{ borderColor: `${themeColor}33` }}
        >
          <h3 className="text-base font-semibold mb-2" style={{ color: themeColor }}>
            客服小祥 - 虚拟化模式
          </h3>
          
          <p className="text-sm text-gray-600 mb-3">
            {state.virtualizationMode === 'ACTIVE' && '虚拟化运行中'}
            {state.virtualizationMode === 'PAUSED' && '虚拟化已暂停'}
            {state.virtualizationMode === 'ERROR' && '虚拟化异常'}
          </p>

          <div className="space-y-2 mb-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">健康得分:</span>
              <span className="font-semibold" style={{ color: healthColor }}>
                {state.healthScore}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">活跃Agent:</span>
              <span className="font-semibold">{state.activeAgents}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">污染率:</span>
              <span className="font-semibold">
                {(state.contaminationRate * 100).toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="border-t pt-3">
            <p className="text-xs text-gray-400 mb-2">快捷键:</p>
            <div className="space-y-1">
              {state.shortcuts.map((shortcut, idx) => (
                <p key={idx} className="text-xs text-gray-600">
                  <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-700 font-mono">
                    {shortcut.key}
                  </kbd>
                  {' '}: {shortcut.description}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VirtualizedFloatingOrb;
