/**
 * HAJIMI VIRTUALIZED - 客服小祥悬浮球UI
 * 
 * 工单 6/6: API层暴露与YGGDRASIL四象限集成
 * 
 * 功能:
 * - 显示"虚拟化模式"指示灯（🟢/🔴）
 * - 快捷键绑定显示
 * - 实时状态监控
 * 
 * 参考规范:
 * - ID-78（YGGDRASIL聊天治理四象限）
 * - ID-77（Phase 5人格化UI）
 * 
 * @module ui/floating-ball
 * @version 1.0.0
 */

import { ResilienceMonitor } from '../../../../lib/virtualized/monitor';

/**
 * 悬浮球状态
 */
export interface FloatingBallState {
  /** 虚拟化模式状态 */
  virtualizationMode: 'ACTIVE' | 'PAUSED' | 'ERROR';
  /** 指示灯 */
  indicator: '🟢' | '🟡' | '🔴';
  /** 健康得分 */
  healthScore: number;
  /** 活跃Agent数量 */
  activeAgents: number;
  /** 污染率 */
  contaminationRate: number;
  /** 快捷键绑定 */
  shortcuts: Array<{
    key: string;
    action: string;
    description: string;
  }>;
  /** 最后更新 */
  lastUpdated: number;
}

/**
 * 快捷键绑定配置
 */
export const SHORTCUTS = {
  /** Ctrl+R - 重置/Spawn */
  SPAWN: {
    key: 'Ctrl+R',
    action: 'spawn',
    description: '创建新的VirtualAgent实例',
  },
  /** Ctrl+M - Remix */
  REMIX: {
    key: 'Ctrl+M',
    action: 'remix',
    description: '压缩并生成Remix Pattern',
  },
  /** Ctrl+Z - Rollback */
  ROLLBACK: {
    key: 'Ctrl+Z',
    action: 'rollback',
    description: '执行YGGDRASIL回滚',
  },
};

/**
 * 客服小祥悬浮球组件
 */
export class FloatingBall {
  private monitor: ResilienceMonitor;
  private state: FloatingBallState;

  constructor() {
    this.monitor = new ResilienceMonitor();
    this.state = {
      virtualizationMode: 'ACTIVE',
      indicator: '🟢',
      healthScore: 100,
      activeAgents: 0,
      contaminationRate: 0,
      shortcuts: Object.values(SHORTCUTS),
      lastUpdated: Date.now(),
    };
  }

  /**
   * 获取当前状态
   */
  getState(): FloatingBallState {
    return { ...this.state };
  }

  /**
   * 更新状态
   */
  updateState(
    contaminationRate: number = 0,
    activeAgents: number = 0
  ): FloatingBallState {
    // 获取健康报告
    const healthReport = this.monitor.getHealthReport();
    
    // 确定虚拟化模式状态
    let virtualizationMode: 'ACTIVE' | 'PAUSED' | 'ERROR';
    let indicator: '🟢' | '🟡' | '🔴';
    
    if (healthReport.status === 'CRITICAL') {
      virtualizationMode = 'ERROR';
      indicator = '🔴';
    } else if (healthReport.status === 'DEGRADED') {
      virtualizationMode = 'PAUSED';
      indicator = '🟡';
    } else {
      virtualizationMode = 'ACTIVE';
      indicator = '🟢';
    }

    this.state = {
      virtualizationMode,
      indicator,
      healthScore: healthReport.score,
      activeAgents,
      contaminationRate,
      shortcuts: Object.values(SHORTCUTS),
      lastUpdated: Date.now(),
    };

    return this.getState();
  }

  /**
   * 获取UI渲染数据
   */
  getRenderData(): {
    indicator: string;
    title: string;
    status: string;
    shortcuts: string[];
    healthScore: number;
    activeAgents: number;
  } {
    return {
      indicator: this.state.indicator,
      title: '客服小祥 - 虚拟化模式',
      status: this.getStatusText(),
      shortcuts: this.state.shortcuts.map(s => `${s.key}: ${s.description}`),
      healthScore: this.state.healthScore,
      activeAgents: this.state.activeAgents,
    };
  }

  /**
   * 获取状态文本
   */
  private getStatusText(): string {
    switch (this.state.virtualizationMode) {
      case 'ACTIVE':
        return '虚拟化运行中';
      case 'PAUSED':
        return '虚拟化已暂停';
      case 'ERROR':
        return '虚拟化异常';
      default:
        return '未知状态';
    }
  }

  /**
   * 获取HTML渲染字符串
   */
  renderHTML(): string {
    const data = this.getRenderData();
    
    return `
<div class="hajimi-floating-ball" style="
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  box-shadow: 0 4px 15px rgba(0,0,0,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 9999;
  transition: transform 0.3s ease;
">
  <span style="font-size: 24px;">${data.indicator}</span>
  <div class="hajimi-tooltip" style="
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 280px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.2);
    padding: 16px;
    display: none;
    font-family: system-ui, -apple-system, sans-serif;
  ">
    <h3 style="margin: 0 0 12px 0; font-size: 16px;">${data.title}</h3>
    <p style="margin: 0 0 12px 0; color: #666; font-size: 14px;">${data.status}</p>
    <div style="margin-bottom: 12px;">
      <span style="font-size: 12px; color: #999;">健康得分: </span>
      <span style="font-size: 14px; font-weight: bold; color: ${data.healthScore >= 90 ? '#22c55e' : data.healthScore >= 70 ? '#eab308' : '#ef4444'}">${data.healthScore}</span>
    </div>
    <div style="margin-bottom: 12px;">
      <span style="font-size: 12px; color: #999;">活跃Agent: </span>
      <span style="font-size: 14px; font-weight: bold;">${data.activeAgents}</span>
    </div>
    <div style="border-top: 1px solid #eee; padding-top: 12px;">
      <p style="margin: 0 0 8px 0; font-size: 12px; color: #999;">快捷键:</p>
      ${data.shortcuts.map(s => `<p style="margin: 4px 0; font-size: 12px;">${s}</p>`).join('')}
    </div>
  </div>
</div>
<style>
  .hajimi-floating-ball:hover {
    transform: scale(1.1);
  }
  .hajimi-floating-ball:hover .hajimi-tooltip {
    display: block;
  }
</style>
    `.trim();
  }

  /**
   * 获取JSON数据（用于API）
   */
  getJSON(): FloatingBallState {
    return this.getState();
  }

  /**
   * 处理快捷键
   */
  handleShortcut(key: string): { action: string; handled: boolean } {
    const shortcut = Object.values(SHORTCUTS).find(s => s.key === key);
    
    if (shortcut) {
      return { action: shortcut.action, handled: true };
    }
    
    return { action: '', handled: false };
  }

  /**
   * 模拟7天数据（用于测试）
   */
  simulateSevenDayData(): void {
    this.monitor.simulateSevenDayData();
  }
}

// 导出默认实例
export const floatingBall = new FloatingBall();
export { SHORTCUTS };
