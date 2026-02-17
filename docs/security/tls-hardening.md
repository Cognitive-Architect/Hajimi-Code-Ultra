# TLS安全加固指南

> **文档编号**: DEBT-OR-002 清偿  
> **作者**: 奶龙娘 (Doctor) - B-02/09

---

## 1. 执行摘要

DEBT-OR-002 (TLS绕过安全风险) 已通过以下措施清偿：

- ✅ IP白名单强制校验 (仅Cloudflare段)
- ✅ 证书透明度检查
- ✅ SNI强制不可绕过
- ✅ 异常证书自动熔断

---

## 2. 安全措施

### 2.1 IP白名单

```typescript
const ALLOWED_IP_RANGES = [
  '104.21.0.0/16',   // Cloudflare主段
  '172.67.0.0/16',   // Cloudflare副段
];
```

### 2.2 SNI强制

```typescript
// 强制要求servername，且不能是IP地址
if (!servername || servername === ip) {
  throw new Error('SNI is required');
}
```

### 2.3 证书检查

- 有效期验证
- 受信任CA检查
- 异常自动熔断

---

## 3. 熔断机制

```
检测到异常证书
      ↓
  立即熔断
      ↓
  5分钟后恢复探测
      ↓
  正常则关闭熔断
```

---

## 4. 使用示例

```typescript
import { tlsGuardian } from './lib/security/tls-guardian';

// 检查IP是否允许
if (!tlsGuardian.isIPAllowed(ip)) {
  throw new Error('IP not in whitelist');
}

// 创建安全Agent
const agent = tlsGuardian.createSecureAgent(ip, 'api.openrouter.ai');
```

---

## 5. 残余风险

| 风险 | 缓解状态 |
|------|----------|
| BGP劫持 | 监控中 (P2) |
| 国家级攻击 | 无法完全缓解 (接受) |
