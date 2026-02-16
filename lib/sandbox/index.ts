/**
 * 奶龙娘·清道夫 - 沙箱自毁与取证模块
 * Phase B-06: 自动清理 + 数字取证
 */

// 自毁模块
export {
  Destroyer,
  createDestroyer,
  DestructionStatus,
  type DestroyerConfig,
  type DestructionTask,
  type DestructionResult,
  type DestructionError,
  type CleanupTarget,
  type ResidualCheckResult,
  type VerificationResult,
} from './destroyer';

// 证据链模块
export {
  EvidenceChain,
  createEvidenceChain,
  calculateHash,
  verifyHash,
  type EvidenceBlock,
  type AuditData,
  type AuditEventType,
  type ChainConfig,
  type ChainStats,
  type ChainVerificationResult,
  type VerificationDetail,
} from './evidence-chain';

// 数字取证模块
export {
  ForensicsAnalyzer,
  createForensicsAnalyzer,
  type ForensicsConfig,
  type ForensicsReport,
  type ExecutionContext,
  type ResourceUsage,
  type SyscallStat,
  type RiskAssessment,
  type RiskItem,
  type RiskThresholds,
  type SuspiciousBehavior,
  type ComplianceCheck,
  type ReportOutput,
} from './forensics';
