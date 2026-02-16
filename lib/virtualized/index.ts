/**
 * HAJIMI VIRTUALIZED - 统一出口
 * 
 * 虚拟化集群引擎，基于ID-85九维理论
 * 实现1点额度模式下3点Agent集群的等效能力
 * 
 * @version 1.0.0
 */

// 核心类型
export {
  BNFCommand,
  BNFCommandType,
  AgentState,
  IsolationLevel,
  VirtualAgentOptions,
  IVirtualAgent,
  AgentSnapshot,
  IsolationReport,
  ProtocolError,
  IsolationViolationError,
  AgentPoolConfig,
  DEFAULT_POOL_CONFIG,
  IVirtualAgentPool,
  IBNFParser,
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
export {
  CheckpointLevel,
  Checkpoint,
  CheckpointMetadata,
  ICheckpointService,
  CheckpointService,
  defaultCheckpointService,
} from './checkpoint';

// ResilienceMonitor韧性监控
export {
  ResilienceMetrics,
  IResilienceMonitor,
  ResilienceMonitor,
  defaultResilienceMonitor,
} from './monitor';

// BNF协议解析器（已包含在agent-pool中导出）
export { BNFParser as ProtocolBNFParser } from './protocol/bnf-parser';
