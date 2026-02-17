/**
 * AutoPay System - 债务自动化清偿系统
 * HAJIMI-PHASE2-IMPL-001 工单 B-06/06：路线F-AutoPay实现
 *
 * 自测点：
 * - PAY-001：季度指纹更新零人工
 * - PAY-002：自动合并前审计100%通过
 * - PAY-003：超支熔断<5s
 *
 * 债务声明：
 * - GitHub Action运行时长限制（P1，大任务拆分多Job）
 * - Mike审计Agent自动化（P2，当前模拟，需后续接入真实API）
 *
 * @module autopay
 * @version 1.0.0
 */

// =============================================================================
// Dashboard - 债务监控仪表盘
// =============================================================================
export {
  DebtHealthCalculator,
  calculateHealth,
  quickScan,
  exportReport,
  getCalculator,
  // Types
  type Debt,
  type DebtPriority,
  type DebtStatistics,
  type TrendData,
  type HealthScore,
  type HealthReport,
  type VisualizationData,
} from './dashboard/debt-health';

// =============================================================================
// Budget - 预算分配与熔断控制
// =============================================================================
export {
  BudgetController,
  getBudgetController,
  resetBudgetController,
  // Types
  type BudgetConfig,
  type BudgetUsage,
  type BudgetPeriod,
  type BudgetCategory,
  type CircuitState,
  type CircuitBreakerMetrics,
  type BudgetAlert,
  type BudgetReport,
} from './budget/controller';

// =============================================================================
// Audit - Mike审计门拦截机制
// =============================================================================
export {
  MikeAuditGate,
  getMikeAuditGate,
  resetMikeAuditGate,
  // Types
  type AuditRule,
  type AuditRuleType,
  type AuditSeverity,
  type AuditStatus,
  type AuditFinding,
  type AuditResult,
  type AuditRequest,
  type AuditGateConfig,
} from './audit/mike-gate';

// =============================================================================
// Report - 每周债务健康报告生成
// =============================================================================
export {
  WeeklyReportGenerator,
  getWeeklyReportGenerator,
  generateWeeklyReport,
  saveWeeklyReport,
  // Types
  type WeeklyReportConfig,
  type WeeklyReport,
} from './report/weekly';

// =============================================================================
// Notify - Alice悬浮球债务推送
// =============================================================================
export {
  AlicePushService,
  getAlicePushService,
  resetAlicePushService,
  pushAlert,
  // Types
  type AliceNotification,
  type PushConfig,
  type NotificationStats,
} from './notify/alice-push';
