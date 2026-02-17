/**
 * Alice Push Notification Module - Alice悬浮球债务推送
 * HAJIMI-PHASE2-IMPL-001 工单 B-06/06：路线F-AutoPay实现
 *
 * 功能：实时通知、优先级过滤、交互式确认
 *
 * @module autopay/notify/alice-push
 * @version 1.0.0
 */

import { EventEmitter } from 'events';

// =============================================================================
// 类型定义
// =============================================================================

type NotificationPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';
type NotificationType = 'debt_alert' | 'budget_warning' | 'audit_complete' | 'system';
type NotificationStatus = 'pending' | 'displayed' | 'acknowledged' | 'dismissed';

export interface AliceNotification {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  details?: string;
  actions?: Array<{
    id: string;
    label: string;
    type: 'primary' | 'secondary' | 'danger';
    callback?: () => void;
  }>;
  metadata: {
    timestamp: string;
    source: string;
    expiresAt?: string;
  };
  status: NotificationStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

export interface PushConfig {
  enabled: boolean;
  priorityFilter: NotificationPriority[];
  maxQueueSize: number;
  displayDuration: number;
  autoDismiss: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  theme: 'light' | 'dark' | 'auto';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

export interface NotificationStats {
  total: number;
  pending: number;
  displayed: number;
  acknowledged: number;
  dismissed: number;
  byPriority: Record<NotificationPriority, number>;
  byType: Record<NotificationType, number>;
}

// =============================================================================
// 默认配置
// =============================================================================

const DEFAULT_CONFIG: PushConfig = {
  enabled: true,
  priorityFilter: ['URGENT', 'HIGH', 'NORMAL'],
  maxQueueSize: 50,
  displayDuration: 5000,
  autoDismiss: true,
  soundEnabled: true,
  vibrationEnabled: true,
  theme: 'auto',
  position: 'bottom-right',
};

// 优先级数值（用于比较）
const PRIORITY_VALUES: Record<NotificationPriority, number> = {
  URGENT: 4,
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

// =============================================================================
// Alice推送服务类
// =============================================================================

export class AlicePushService extends EventEmitter {
  private config: PushConfig;
  private notificationQueue: AliceNotification[] = [];
  private displayedNotifications: Map<string, AliceNotification> = new Map();
  private stats: NotificationStats;

  constructor(config: Partial<PushConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.stats = this.initializeStats();
  }

  // ==========================================================================
  // 初始化
  // ==========================================================================

  private initializeStats(): NotificationStats {
    return {
      total: 0,
      pending: 0,
      displayed: 0,
      acknowledged: 0,
      dismissed: 0,
      byPriority: { URGENT: 0, HIGH: 0, NORMAL: 0, LOW: 0 },
      byType: { debt_alert: 0, budget_warning: 0, audit_complete: 0, system: 0 },
    };
  }

  // ==========================================================================
  // 核心推送方法
  // ==========================================================================

  /**
   * 发送通知
   * @param notification 通知内容
   * @returns 通知ID
   */
  push(notification: Omit<AliceNotification, 'id' | 'status' | 'metadata'>): string {
    if (!this.config.enabled) {
      console.log('[AlicePush] Service disabled, notification ignored');
      return '';
    }

    // 检查优先级过滤
    if (!this.config.priorityFilter.includes(notification.priority)) {
      console.log(`[AlicePush] Priority ${notification.priority} filtered out`);
      return '';
    }

    const id = `ALICE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const fullNotification: AliceNotification = {
      ...notification,
      id,
      status: 'pending',
      metadata: {
        timestamp: new Date().toISOString(),
        source: 'AlicePushService',
        expiresAt: this.calculateExpiry(notification.priority),
      },
    };

    // 加入队列
    this.notificationQueue.push(fullNotification);
    this.stats.total++;
    this.stats.pending++;
    this.stats.byPriority[notification.priority]++;
    this.stats.byType[notification.type]++;

    // 按优先级排序队列
    this.sortQueue();

    // 触发事件
    this.emit('notification:queued', fullNotification);

    // 处理队列
    this.processQueue();

    console.log(`[AlicePush] Notification queued: ${id} (${notification.priority})`);
    
    return id;
  }

  /**
   * 快速发送债务告警
   */
  pushDebtAlert(
    priority: NotificationPriority,
    title: string,
    message: string,
    details?: string
  ): string {
    return this.push({
      type: 'debt_alert',
      priority,
      title,
      message,
      details,
      actions: this.getDefaultActions('debt_alert'),
    });
  }

  /**
   * 发送预算警告
   */
  pushBudgetWarning(usage: number, limit: number): string {
    const percentage = (usage / limit) * 100;
    const priority: NotificationPriority = percentage >= 100 ? 'URGENT' : percentage >= 90 ? 'HIGH' : 'NORMAL';
    
    return this.push({
      type: 'budget_warning',
      priority,
      title: `💰 Budget Alert: ${percentage.toFixed(1)}%`,
      message: `Current usage $${usage.toFixed(2)} / $${limit.toFixed(2)}`,
      actions: [
        { id: 'view', label: 'View Details', type: 'primary' },
        { id: 'dismiss', label: 'Dismiss', type: 'secondary' },
      ],
    });
  }

  /**
   * 发送审计完成通知
   */
  pushAuditComplete(auditId: string, passed: boolean): string {
    return this.push({
      type: 'audit_complete',
      priority: passed ? 'NORMAL' : 'URGENT',
      title: passed ? '✅ Audit Passed' : '❌ Audit Failed',
      message: `Audit ${auditId} has ${passed ? 'passed' : 'failed'}`,
      actions: passed 
        ? [{ id: 'view', label: 'View Report', type: 'primary' }]
        : [
            { id: 'view', label: 'View Details', type: 'primary' },
            { id: 'retry', label: 'Retry', type: 'secondary' },
          ],
    });
  }

  // ==========================================================================
  // 队列管理
  // ==========================================================================

  private sortQueue(): void {
    this.notificationQueue.sort((a, b) => {
      // 按优先级降序排列
      return PRIORITY_VALUES[b.priority] - PRIORITY_VALUES[a.priority];
    });
  }

  private processQueue(): void {
    // 限制队列大小
    while (this.notificationQueue.length > this.config.maxQueueSize) {
      const removed = this.notificationQueue.pop();
      if (removed) {
        this.emit('notification:dropped', removed);
        this.stats.pending--;
      }
    }

    // 显示队列中的通知
    const pendingNotifications = this.notificationQueue.filter(
      (n) => n.status === 'pending'
    );

    for (const notification of pendingNotifications) {
      this.displayNotification(notification);
    }
  }

  private displayNotification(notification: AliceNotification): void {
    notification.status = 'displayed';
    this.displayedNotifications.set(notification.id, notification);
    this.stats.pending--;
    this.stats.displayed++;

    // 触发显示事件
    this.emit('notification:displayed', notification);

    // 播放提示音（如果是浏览器环境）
    if (this.config.soundEnabled && typeof window !== 'undefined') {
      this.playNotificationSound(notification.priority);
    }

    // 振动（移动端）
    if (this.config.vibrationEnabled && typeof navigator !== 'undefined' && navigator.vibrate) {
      const pattern = this.getVibrationPattern(notification.priority);
      navigator.vibrate(pattern);
    }

    // 自动关闭
    if (this.config.autoDismiss) {
      setTimeout(() => {
        this.dismiss(notification.id);
      }, this.config.displayDuration);
    }

    console.log(`[AlicePush] Notification displayed: ${notification.id}`);
  }

  // ==========================================================================
  // 交互处理
  // ==========================================================================

  /**
   * 确认通知
   */
  acknowledge(notificationId: string, acknowledgedBy?: string): boolean {
    const notification = this.displayedNotifications.get(notificationId);
    
    if (!notification) {
      console.warn(`[AlicePush] Notification not found: ${notificationId}`);
      return false;
    }

    notification.status = 'acknowledged';
    notification.acknowledgedBy = acknowledgedBy || 'user';
    notification.acknowledgedAt = new Date().toISOString();

    this.stats.acknowledged++;
    this.stats.displayed--;
    this.displayedNotifications.delete(notificationId);

    this.emit('notification:acknowledged', notification);
    console.log(`[AlicePush] Notification acknowledged: ${notificationId}`);

    return true;
  }

  /**
   * 关闭通知
   */
  dismiss(notificationId: string): boolean {
    const notification = this.displayedNotifications.get(notificationId);
    
    if (!notification) {
      return false;
    }

    notification.status = 'dismissed';
    this.stats.dismissed++;
    this.stats.displayed--;
    this.displayedNotifications.delete(notificationId);

    this.emit('notification:dismissed', notification);
    console.log(`[AlicePush] Notification dismissed: ${notificationId}`);

    return true;
  }

  /**
   * 执行通知动作
   */
  executeAction(notificationId: string, actionId: string): boolean {
    const notification = this.displayedNotifications.get(notificationId);
    
    if (!notification || !notification.actions) {
      return false;
    }

    const action = notification.actions.find((a) => a.id === actionId);
    
    if (!action) {
      return false;
    }

    // 执行回调
    if (action.callback) {
      action.callback();
    }

    this.emit('notification:action', { notification, action });
    
    // 自动确认
    this.acknowledge(notificationId, `action:${actionId}`);

    return true;
  }

  // ==========================================================================
  // 辅助方法
  // ==========================================================================

  private calculateExpiry(priority: NotificationPriority): string {
    const now = new Date();
    const hours = priority === 'URGENT' ? 24 : priority === 'HIGH' ? 48 : 72;
    now.setHours(now.getHours() + hours);
    return now.toISOString();
  }

  private getDefaultActions(type: NotificationType): AliceNotification['actions'] {
    switch (type) {
      case 'debt_alert':
        return [
          { id: 'view', label: 'View', type: 'primary' },
          { id: 'clear', label: 'Mark Cleared', type: 'secondary' },
          { id: 'snooze', label: 'Snooze', type: 'secondary' },
        ];
      case 'budget_warning':
        return [
          { id: 'view', label: 'View Details', type: 'primary' },
          { id: 'dismiss', label: 'Dismiss', type: 'secondary' },
        ];
      default:
        return [
          { id: 'ok', label: 'OK', type: 'primary' },
        ];
    }
  }

  private playNotificationSound(priority: NotificationPriority): void {
    // 实际实现中这里会播放音频
    const frequencies: Record<NotificationPriority, number> = {
      URGENT: 880, // A5
      HIGH: 698,   // F5
      NORMAL: 523, // C5
      LOW: 440,    // A4
    };

    try {
      const AudioContext = (window as unknown as { AudioContext: typeof AudioContext }).AudioContext;
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = frequencies[priority];
      oscillator.type = priority === 'URGENT' ? 'square' : 'sine';

      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.5);
    } catch {
      // 音频播放失败，静默处理
    }
  }

  private getVibrationPattern(priority: NotificationPriority): number[] {
    switch (priority) {
      case 'URGENT':
        return [200, 100, 200, 100, 400];
      case 'HIGH':
        return [200, 100, 200];
      case 'NORMAL':
        return [100];
      case 'LOW':
        return [50];
      default:
        return [100];
    }
  }

  // ==========================================================================
  // 查询方法
  // ==========================================================================

  /**
   * 获取待处理通知
   */
  getPending(): AliceNotification[] {
    return this.notificationQueue.filter((n) => n.status === 'pending');
  }

  /**
   * 获取显示中的通知
   */
  getDisplayed(): AliceNotification[] {
    return Array.from(this.displayedNotifications.values());
  }

  /**
   * 获取所有通知
   */
  getAll(): AliceNotification[] {
    return [
      ...this.notificationQueue,
      ...Array.from(this.displayedNotifications.values()),
    ];
  }

  /**
   * 获取统计
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.notificationQueue = [];
    this.displayedNotifications.clear();
    this.stats = this.initializeStats();
    this.emit('queue:cleared');
  }

  // ==========================================================================
  // 配置管理
  // ==========================================================================

  updateConfig(config: Partial<PushConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config:updated', this.config);
  }

  getConfig(): PushConfig {
    return { ...this.config };
  }

  /**
   * 启用/禁用服务
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    this.emit('service:' + (enabled ? 'enabled' : 'disabled'));
  }
}

// =============================================================================
// 便捷函数
// =============================================================================

let defaultService: AlicePushService | null = null;

export function getAlicePushService(config?: Partial<PushConfig>): AlicePushService {
  if (!defaultService) {
    defaultService = new AlicePushService(config);
  }
  return defaultService;
}

export function resetAlicePushService(): void {
  defaultService = null;
}

// 快捷推送函数
export function pushAlert(
  priority: NotificationPriority,
  title: string,
  message: string
): string {
  const service = getAlicePushService();
  return service.pushDebtAlert(priority, title, message);
}

export default AlicePushService;
