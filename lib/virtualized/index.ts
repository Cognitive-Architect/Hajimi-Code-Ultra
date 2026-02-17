/**
 * HAJIMI VIRTUALIZED - 统一出口
 * 
 * 虚拟化集群引擎，基于ID-85九维理论
 * 实现1点额度模式下3点Agent集群的等效能力
 * 
 * @version 1.0.0
 */

// 核心类型 - 显式 export type 以兼容 isolatedModules
export type {
  BNFCommand,
  BNFCommandType,
  AgentState,
  IsolationLevel,
  VirtualAgentOptions,
  IVirtualAgent,
  AgentSnapshot,
  IsolationReport,
  AgentPoolConfig,
  IVirtualAgentPool,
  IBNFParser,
} from './types';

// 核心值/常量 - 保持普通 export
export {
  ProtocolError,
  IsolationViolationError,
  DEFAULT_POOL_CONFIG,
} from './types';

// VirtualAgentPool核心引擎
export {
  VirtualAgent,
  VirtualAgentPool,
  BNFParser,
  defaultPool,
  bnfParser,
} from './agent-pool';

// 三级Checkpoint服务
export type {
  CheckpointLevel,
  Checkpoint,
  CheckpointMetadata,
} from './checkpoint';

export {
  CheckpointService,
  defaultCheckpointService,
} from './checkpoint';

// ResilienceMonitor韧性监控
export type {
  MetricType,
  DegradationRecommendation,
  HealthStatus,
  MetricDataPoint,
  SlidingWindowStats,
  HealthReport,
  PrometheusMetrics,
  PanelIntegrationData,
  MonitorConfig,
} from './monitor';

export {
  ResilienceMonitor,
  defaultMonitor,
} from './monitor';

// BNF协议解析器（已包含在agent-pool中导出）
export { BNFParser as ProtocolBNFParser } from './protocol/bnf-parser';
