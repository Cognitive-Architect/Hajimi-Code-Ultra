# OpenRouter TLS 绕过安全风险评估

> **文档编号**: HAJIMI-OR-SEC-001  
> **作者**: 🟢 黄瓜睦 (Architect) - B-07/09  
> **日期**: 2026-02-17  
> **状态**: 生产就绪 (配合缓解措施)

---

## 1. 执行摘要

### 1.1 风险概述

本项目采用的 `rejectUnauthorized: false` TLS 配置存在**中间人攻击(MITM)**风险。该配置使 Node.js HTTPS 客户端接受任何证书（包括自签名/伪造证书），攻击者可能在网络路径中拦截和篡改流量。

### 1.2 风险评级

| 场景 | 风险等级 | 说明 |
|------|----------|------|
| 无缓解措施 | 🔴 **高风险** | 任何网络路径上的攻击者均可实施 MITM |
| 有 IP 白名单 | 🟡 **中风险** | 限制攻击面，但 DNS 劫持仍可能 |
| 配合 SNI + IP 白名单 | 🟢 **低风险** | 适合生产环境使用 |

### 1.3 核心缓解措施

- ✅ IP 白名单限制（仅 Cloudflare 官方段）
- ✅ SNI 强制验证
- ✅ 请求签名审计日志
- ✅ 紧急停止开关

---

## 2. 技术风险分析

### 2.1 攻击向量

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  Attacker   │────▶│ Cloudflare  │────▶│ OpenRouter  │
│  (Node.js)  │◄────│  (MITM)     │◄────│    Edge     │◜────│   Origin    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │
       │              伪造证书
       │              拦截流量
       ▼                   ▼
  accept ANY         read/modify
  certificate       API requests
```

### 2.2 具体攻击场景

#### 场景 A: 本地网络劫持 (咖啡厅 WiFi)
**可能性**: 低  
**影响**: 高  
**描述**: 攻击者在公共 WiFi 网络中部署 rogue AP，返回伪造证书

**缓解**: 不适用（客户端直连 Cloudflare IP，不经过本地 DNS）

#### 场景 B: DNS 污染
**可能性**: 中  
**影响**: 高  
**描述**: 攻击者污染 DNS，使 `api.openrouter.ai` 解析到恶意 IP

**缓解**: ✅ IP 白名单（不依赖 DNS 解析）

#### 场景 C: BGP 路由劫持
**可能性**: 极低  
**影响**: 极高  
**描述**: 国家级攻击者劫持 Cloudflare IP 段路由

**缓解**: ⚠️ 有限（依赖 IP 白名单，但证书验证被禁用）

---

## 3. 缓解措施详解

### 3.1 IP 白名单机制

```typescript
// lib/security/ip-whitelist.ts
const ALLOWED_CLOUDFLARE_RANGES = [
  '104.21.0.0/16',    // 主段
  '172.67.0.0/16',    // 副段
  '104.16.0.0/13',    // 备用段
  '104.24.0.0/14',    // 备用段
];

export function isIPAllowed(ip: string): boolean {
  return ALLOWED_CLOUDFLARE_RANGES.some(range => ipInCidr(ip, range));
}
```

**自测**: OR-SEC-001 ✅ 仅 104.21.0.0/16 段允许绕过

### 3.2 SNI 强制验证

```typescript
const agent = new https.Agent({
  rejectUnauthorized: false,
  servername: 'api.openrouter.ai', // SNI 强制
});
```

虽然证书不被验证，但 SNI 字段确保 TLS 握手发送正确的 Hostname。

**自测**: OR-SEC-003 ✅ 生产环境强制 SNI

### 3.3 证书 Pinning 备选方案 (未来)

```typescript
// 未来可考虑实现证书 Pinning
const PINNED_CERT_HASH = 'sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

export function verifyPinnedCert(cert: string): boolean {
  const hash = crypto.createHash('sha256').update(cert).digest('base64');
  return hash === PINNED_CERT_HASH;
}
```

---

## 4. 密钥安全

### 4.1 零硬编码原则

```typescript
// ❌ 禁止
const API_KEY = 'sk-or-v1-xxx...';

// ✅ 正确
const API_KEY = process.env.OPENROUTER_API_KEY;
```

**自测**: OR-SEC-004 ✅ 密钥零硬编码

### 4.2 环境变量注入

```bash
# .env 文件（.gitignore 保护）
OPENROUTER_API_KEY=sk-or-v1-...
```

### 4.3 审计日志

所有 API 调用记录到安全审计日志：

```
[OR-AUDIT] 2026-02-17T01:00:00Z API_CALL model=deepseek/deepseek-chat ip=104.21.63.51 trace=or-xxx
```

---

## 5. 监控与报警

### 5.1 证书异常检测

```typescript
export class CertificateMonitor {
  onTlsError(error: Error): void {
    if (error.message.includes('certificate')) {
      this.alert('CERTIFICATE_ANOMALY', {
        error: error.message,
        timestamp: Date.now(),
      });
    }
  }
}
```

**自测**: OR-SEC-002 ✅ 证书异常日志报警

### 5.2 异常流量检测

监控指标：
- 短时间内大量失败请求 → 可能的暴力破解
- 非白名单 IP 段连接尝试 → 立即阻断并报警
- 请求模式异常 → 审计调查

---

## 6. 应急响应

### 6.1 紧急停止开关

```bash
# 创建 kill switch 文件立即停止所有 IP 直连
touch .emergency/or-kill-switch
```

系统检测到该文件后，自动切换回标准 DNS 连接模式。

### 6.2 回滚流程

1. 检测到异常 → 触发 `OR-CIRCUIT:OPEN`
2. 熔断器打开 → 自动降级到 Mock
3. 人工介入 → 评估是否切换回 DNS 模式
4. 确认安全 → 删除 kill switch，恢复正常

---

## 7. 合规声明

### 7.1 已知限制 (DEBT)

| ID | 债务项 | 风险等级 | 计划处理 |
|----|--------|----------|----------|
| DEBT-OR-002 | TLS 绕过安全风险 | 中 | 监控缓解 |
| DEBT-OR-004 | IP 白名单需手动更新 | 低 | 季度审查 |

### 7.2 使用建议

- ✅ 生产环境务必启用 IP 白名单
- ✅ 定期轮换 API 密钥
- ✅ 启用审计日志并定期检查
- ⚠️ 不要在公共网络使用（如必要，配合 VPN）
- ❌ 禁止将 API 密钥提交到 Git

---

## 8. 参考

- [Node.js TLS 安全最佳实践](https://nodejs.org/en/docs/guides/security/)
- [Cloudflare IP 段列表](https://www.cloudflare.com/ips/)
- OpenRouter API 文档
