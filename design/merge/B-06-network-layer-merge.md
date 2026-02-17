# B-06 网络层合并验证报告

**工单**: HAJIMI-MERGE-V140-VALIDATION B-06/09  
**任务**: OpenRouter 适配器兼容性 - IP直连方案与 LCR 跨端同步的 TLS/网络层共存  
**验证日期**: 2026-02-17  
**验证者**: Kimi Code CLI  

---

## 网络栈架构

| 层级 | v1.4.0 (IP直连) | LCR (WebRTC) | 冲突分析 |
|------|----------------|--------------|----------|
| **应用层** | OpenRouter API (HTTP/JSON) | CRDT 同步协议 | ❌ 无冲突 - 不同协议 |
| **传输层** | TCP 443 (HTTPS) | SCTP/UDP (DataChannel) | ❌ 无冲突 - 不同传输 |
| **网络层** | IPv4 直连 (104.21.x.x) | ICE/STUN/TURN 协商 | ⚠️ 需协调 - 端口范围不重叠 |
| **TLS层** | TLS 1.3 + 证书固定 | DTLS 1.2 (WebRTC内置) | ⚠️ 策略不统一 |
| **Agent层** | https.Agent (自定义) | 无 (浏览器/Node API) | ✅ 无冲突 |

---

## 验证点

### MERGE-016: Agent配置继承

**状态**: ⚠️ **部分冲突**

**分析**:

| 组件 | Agent类型 | rejectUnauthorized | 策略继承 |
|------|-----------|-------------------|----------|
| `openrouter-real.ts` | 全局 fetch | 系统默认 | 无自定义Agent |
| `openrouter-ip-direct.ts` | https.Agent | `false` (自定义检查) | 使用TLSGuardian |
| `cross-device-sync.ts` | 无 | N/A | WebRTC DTLS |

**问题识别**:
1. `openrouter-real.ts` 使用标准 `fetch` API，**不继承** `TLSGuardian` 的安全策略
2. `openrouter-ip-direct.ts` 虽设置 `rejectUnauthorized: false`，但通过 `checkServerIdentity` 进行自定义证书检查
3. 两个 OpenRouter 适配器之间的安全策略**不一致**

**建议**:
```typescript
// 统一使用 TLSGuardian 创建 Agent
import { tlsGuardian } from '@/lib/security/tls-guardian';

// openrouter-real.ts 应改用:
const agent = tlsGuardian.createSecureAgent(ip, 'api.openrouter.ai');
```

---

### MERGE-017: WebRTC共存

**状态**: ✅ **无冲突**

**分析**:

| 协议 | 端口范围 | 用途 | 冲突 |
|------|----------|------|------|
| HTTPS (OpenRouter) | TCP 443 | API请求 | - |
| WebRTC DataChannel | UDP 1024-65535 (动态) | P2P同步 | - |
| STUN/TURN | UDP 3478/5349 | NAT穿透 | - |

**共存验证**:
1. **端口不冲突**: HTTPS 使用固定 TCP 443，WebRTC 使用动态 UDP 端口
2. **协议隔离**: TCP 与 UDP 在传输层隔离
3. **连接独立**: 
   - OpenRouter: 客户端 → 服务器 (C/S)
   - WebRTC: 点对点 (P2P)

**DataChannel 配置检查**:
```typescript
// cross-device-sync.ts
pc.createDataChannel('sync', { ordered: true });
// 未配置 maxRetransmits 或 maxPacketLifeTime
```

**建议**: 为同步通道添加可靠性配置:
```typescript
pc.createDataChannel('sync', { 
  ordered: true,
  maxRetransmits: 3  // 防止无限重传阻塞
});
```

---

### MERGE-018: TLS证书固定策略

**状态**: ⚠️ **策略不统一**

**分析**:

v1.4.0 三层防护架构:

```
┌─────────────────────────────────────────────┐
│  Layer 3: Certificate Pinning (SPKI SHA256) │  ← certificate-pinning.ts
│  - 公钥指纹固定                              │
│  - 主/备/应急三级指纹                        │
├─────────────────────────────────────────────┤
│  Layer 2: TLS Guardian                      │  ← tls-guardian.ts
│  - IP白名单动态校验                          │
│  - SNI强制封装                               │
│  - 异常证书熔断                              │
├─────────────────────────────────────────────┤
│  Layer 1: Base TLS                          │
│  - rejectUnauthorized 配置                   │
│  - servername 验证                           │
└─────────────────────────────────────────────┘
```

**各组件策略矩阵**:

| 组件 | Layer 1 | Layer 2 | Layer 3 | 合规 |
|------|---------|---------|---------|------|
| `openrouter-ip-direct.ts` | ✅ | ✅ | ⚠️ 可选 | 基本合规 |
| `openrouter-real.ts` | ❌ 默认 | ❌ 未使用 | ❌ 未使用 | **不合规** |
| `cross-device-sync.ts` | DTLS内置 | ❌ 不适用 | ❌ 不适用 | 部分合规 |

**关键问题**:
1. `openrouter-real.ts` 完全依赖系统 CA，**未启用** IP 白名单和证书固定
2. WebRTC DTLS **无法直接应用** SPKI 固定（证书由浏览器/系统管理）
3. 三层防护在 LCR 模块**未被继承**

**修复建议**:

```typescript
// 1. 统一适配器入口
// lib/quintant/adapters/openrouter-unified.ts
import { tlsGuardian } from '@/lib/security/tls-guardian';
import { certificatePinning } from '@/lib/security/certificate-pinning';

export class OpenRouterUnifiedAdapter {
  private async makeSecureRequest(ip: string, request: Request) {
    // 强制通过 TLSGuardian
    const agent = tlsGuardian.createSecureAgent(ip, 'api.openrouter.ai');
    
    // 启用证书固定
    const checkPinning = certificatePinning.createCheckCallback();
    (agent as any).options.checkServerIdentity = checkPinning;
    
    return this.requestWithAgent(agent, request);
  }
}

// 2. WebRTC 安全增强
// lib/lcr/sync/cross-device-sync.ts
export interface SecureSyncConfig extends SyncConfig {
  // 添加预共享密钥验证
  psk?: string;
  // 设备证书白名单
  allowedDevices?: string[];
}
```

---

## 安全继承矩阵

| 安全特性 | v1.4.0 标准 | LCR 当前 | 合并后目标 | 状态 |
|----------|-------------|----------|------------|------|
| **IP白名单** | ✅ Cloudflare段 | N/A | WebRTC TURN 限制 | ⚠️ 待实现 |
| **证书固定** | ✅ SPKI SHA256 | ❌ DTLS默认 | 应用层签名验证 | ⚠️ 待实现 |
| **SNI强制** | ✅ 不可绕过 | N/A | 信令服务器强制 | ⚠️ 待实现 |
| **熔断机制** | ✅ 5分钟冷却 | ❌ 无 | 统一熔断器 | ⚠️ 待实现 |
| **异常检测** | ✅ 证书透明度 | ❌ 无 | 操作日志审计 | ⚠️ 待实现 |

---

## 结论与建议

### 总体评估

| 验证项 | 状态 | 优先级 |
|--------|------|--------|
| MERGE-016 Agent配置 | ⚠️ 部分冲突 | P1 |
| MERGE-017 WebRTC共存 | ✅ 无冲突 | - |
| MERGE-018 TLS固定 | ⚠️ 策略不统一 | P0 |

### 必须修复 (P0)

1. **统一 TLS 策略**: `openrouter-real.ts` 必须继承 `TLSGuardian`
2. **WebRTC 安全增强**: 添加应用层签名验证，弥补 DTLS 无法证书固定的缺陷

### 建议优化 (P1)

1. **熔断器共享**: 将 `CircuitBreaker` 提取到公共模块，供 HTTP 和 WebRTC 共用
2. **端口管理**: 明确文档化 WebRTC 端口范围，避免与系统服务冲突

### 合并风险等级

```
高风险 ⚠️
├── TLS策略不统一可能导致中间人攻击绕过
└── 建议：在 v1.4.0 发布前完成统一

中风险 ℹ️
├── WebRTC 与 HTTPS 共存无技术冲突
└── 需关注 TURN 服务器 IP 白名单
```

---

## 附录

### 参考文件

1. `lib/quintant/adapters/openrouter-real.ts` - B-01 标准适配器
2. `lib/quintant/adapters/openrouter-ip-direct.ts` - B-02 IP直连适配器
3. `lib/lcr/sync/cross-device-sync.ts` - B-06 WebRTC跨端同步
4. `lib/security/tls-guardian.ts` - TLS安全守护者
5. `lib/security/certificate-pinning.ts` - 证书固定实现

### 相关债务

- `DEBT-OR-002`: TLS Guardian 清偿
- `DEBT-QUIN-TEMP-KEY-001`: OpenRouter 临时密钥轮换
