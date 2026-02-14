/**
 * StateIndicator - 七权状态指示器组件
 * 打捞来源: F:\Hajimi Code 历史版本\A2A_Demo_Skills\2.0 luxury\src\components\ui\StateIndicator.tsx
 * 修复: 适配新类型定义
 */

'use client';

import React from 'react';
import { 
  Circle, ArrowRight, CheckCircle2, Clock, Zap,
  Layout, Code, Shield, Package, Rocket, Flag, History
} from 'lucide-react';
import type { PowerState } from '@/lib/ui/types';
import { STATE_ORDER } from '@/lib/ui/types';

const STATE_CONFIG: Record<PowerState, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  glowColor: string;
}> = {
  IDLE: {
    label: '空闲',
    description: '等待任务开始',
    icon: Circle,
    color: 'text-slate-400',
    bgColor: 'bg-slate-400/10',
    borderColor: 'border-slate-400/30',
    glowColor: 'shadow-slate-400/20',
  },
  DESIGN: {
    label: '设计',
    description: 'PM与Arch进行需求设计',
    icon: Layout,
    color: 'text-blue-400',
    bgColor: 'bg-blue-400/10',
    borderColor: 'border-blue-400/30',
    glowColor: 'shadow-blue-400/30',
  },
  CODE: {
    label: '编码',
    description: 'Engineer进行代码实现',
    icon: Code,
    color: 'text-orange-400',
    bgColor: 'bg-orange-400/10',
    borderColor: 'border-orange-400/30',
    glowColor: 'shadow-orange-400/30',
  },
  AUDIT: {
    label: '审计',
    description: 'QA进行代码审查',
    icon: Shield,
    color: 'text-green-400',
    bgColor: 'bg-green-400/10',
    borderColor: 'border-green-400/30',
    glowColor: 'shadow-green-400/30',
  },
  BUILD: {
    label: '构建',
    description: 'Mike进行打包构建',
    icon: Package,
    color: 'text-purple-400',
    bgColor: 'bg-purple-400/10',
    borderColor: 'border-purple-400/30',
    glowColor: 'shadow-purple-400/30',
  },
  DEPLOY: {
    label: '部署',
    description: 'Mike执行部署',
    icon: Rocket,
    color: 'text-red-400',
    bgColor: 'bg-red-400/10',
    borderColor: 'border-red-400/30',
    glowColor: 'shadow-red-400/30',
  },
  DONE: {
    label: '完成',
    description: '任务已完成',
    icon: Flag,
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-400/10',
    borderColor: 'border-emerald-400/30',
    glowColor: 'shadow-emerald-400/30',
  },
};

export interface StateIndicatorProps {
  currentState: PowerState;
  showFlowchart?: boolean;
  title?: string;
}

export const StateIndicator: React.FC<StateIndicatorProps> = ({
  currentState,
  showFlowchart = true,
  title = '七权状态',
}) => {
  const currentConfig = STATE_CONFIG[currentState];
  const CurrentIcon = currentConfig.icon;
  const currentIndex = STATE_ORDER.indexOf(currentState);

  return (
    <div className="w-full bg-slate-900 rounded-2xl border border-white/10 overflow-hidden">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-white/10 bg-slate-800/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Zap className={`w-5 h-5 ${currentConfig.color}`} />
            <h3 className="text-white font-semibold">{title}</h3>
          </div>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${currentConfig.bgColor} ${currentConfig.borderColor} border`}>
            <CurrentIcon className={`w-4 h-4 ${currentConfig.color}`} />
            <span className={`text-sm font-medium ${currentConfig.color}`}>{currentConfig.label}</span>
          </div>
        </div>
      </div>

      {/* 当前状态详情 */}
      <div className={`px-4 py-4 border-b border-white/10 ${currentConfig.bgColor}`}>
        <div className="flex items-start gap-4">
          <div className={`
            w-16 h-16 rounded-xl flex items-center justify-center flex-shrink-0
            bg-slate-900/50 border ${currentConfig.borderColor}
            ${currentConfig.glowColor} shadow-lg
          `}>
            <CurrentIcon className={`w-8 h-8 ${currentConfig.color}`} />
          </div>
          <div className="flex-1">
            <h4 className={`text-lg font-bold ${currentConfig.color}`}>{currentConfig.label}</h4>
            <p className="text-white/70 text-sm mt-1">{currentConfig.description}</p>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-white/50 mb-1">
                <span>整体进度</span>
                <span>{Math.round((currentIndex / (STATE_ORDER.length - 1)) * 100)}%</span>
              </div>
              <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${currentConfig.color.replace('text-', 'bg-')}`}
                  style={{ width: `${(currentIndex / (STATE_ORDER.length - 1)) * 100}%` }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 流程图 */}
      {showFlowchart && (
        <div className="px-4 py-4">
          <div className="hidden md:flex items-center justify-between">
            {STATE_ORDER.map((state, index) => {
              const config = STATE_CONFIG[state];
              const Icon = config.icon;
              const isActive = state === currentState;
              const isCompleted = index < currentIndex;

              return (
                <React.Fragment key={state}>
                  <div className="flex flex-col items-center">
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center
                      border-2 transition-all duration-300
                      ${isActive ? `${config.bgColor} ${config.borderColor} shadow-lg scale-110` : 
                        isCompleted ? 'bg-emerald-400/20 border-emerald-400/50' : 'bg-slate-800 border-slate-600'}
                    `}>
                      <Icon className={`w-5 h-5 ${isActive ? config.color : isCompleted ? 'text-emerald-400' : 'text-slate-500'}`} />
                    </div>
                    <span className={`mt-2 text-xs font-medium ${isActive ? config.color : isCompleted ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {config.label}
                    </span>
                  </div>
                  {index < STATE_ORDER.length - 1 && (
                    <div className="flex-1 h-0.5 mx-1 relative">
                      <div className="absolute inset-0 bg-slate-700" />
                      <div className="absolute inset-y-0 left-0 bg-emerald-400/50 transition-all duration-500" 
                        style={{ width: isCompleted ? '100%' : isActive ? '50%' : '0%' }} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default StateIndicator;
