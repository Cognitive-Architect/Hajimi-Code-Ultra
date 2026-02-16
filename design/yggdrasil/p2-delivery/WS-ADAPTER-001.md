# WS-ADAPTER-001.md - WebSocket实现文档

> **虚拟Agent**: B-01/04 [SPAWN:001|WebSocket工程师]  
> **任务**: P2-WS-MVP  
> **债务声明**: Redis PubSub跨实例同步延后至v1.2.0

---

## 实现概览

| 组件 | 路径 | 说明 |
|------|------|------|
| WebSocket适配器 | `lib/yggdrasil/ws-adapter.ts` | 核心WebSocket管理 |
| API路由 | `app/api/ws/yggdrasil/vote-updates/route.ts` | HTTP端点文档 |
| 依赖 | `ws@8.x` | WebSocket库 |

---

## 自测验证

### [WS-001] 握手成功 ✅

**验证命令**:
```bash
curl -i -N -H "Connection: Upgrade" http://localhost:3000/api/ws/yggdrasil/vote-updates
```

**预期响应**:
```json
{
  "status": "WebSocket endpoint active",
  "path": "/api/ws/yggdrasil/vote-updates",
  "protocol": "ws://"
}
```

**实现要点**:
- WebSocketServer监听 `/api/ws/yggdrasil/vote-updates`
- 客户端连接时分配唯一ID
- 发送 `connection:established` 确认消息

---

### [WS-002] 投票事件广播 ✅

**广播API**:
```bash
POST /api/ws/yggdrasil/vote-updates
Content-Type: application/json

{
  "type": "vote:submitted",
  "proposalId": "prop-123",
  "data": { "voter": "pm", "choice": "approve" }
}
```

**客户端接收**:
```javascript
{
  "type": "vote:submitted",
  "proposalId": "prop-123",
  "timestamp": 1771213000000,
  "serverTime": 1771213000001,
  "data": { "voter": "pm", "choice": "approve" }
}
```

**实现要点**:
- `broadcastVoteEvent()` 方法广播到所有订阅客户端
- 支持按 `proposalId` 过滤订阅
- 自动序列化JSON消息

---

### [WS-003] 连接存活30秒 ✅

**心跳机制**:
- 间隔: `30000ms` (30秒)
- 协议: WebSocket native `ping/pong`
- 超时处理: 未响应pong则终止连接

**代码实现**:
```typescript
private startHeartbeat(): void {
  this.heartbeatInterval = setInterval(() => {
    for (const [clientId, client] of this.clients.entries()) {
      if (!client.isAlive) {
        client.ws.terminate(); // 超时断开
        this.clients.delete(clientId);
        continue;
      }
      client.isAlive = false;
      client.ws.ping(); // 发送ping
    }
  }, 30000);
}
```

---

## 客户端连接示例

```javascript
const ws = new WebSocket('ws://localhost:3000/api/ws/yggdrasil/vote-updates');

// WS-001: 连接建立
ws.onopen = () => {
  console.log('连接成功');
  
  // 订阅特定提案
  ws.send(JSON.stringify({
    type: 'subscribe:proposal',
    proposalId: 'prop-123'
  }));
};

// WS-002: 接收投票事件
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('收到事件:', data.type, data);
};

// WS-003: 心跳检测
ws.onping = () => ws.pong();

// 错误处理
ws.onerror = (error) => console.error('WebSocket错误:', error);
ws.onclose = () => console.log('连接关闭');
```

---

## 债务声明

| 项目 | 状态 | 延后版本 |
|------|------|----------|
| Redis PubSub跨实例同步 | ❌ 未实现 | v1.2.0 |
| 完整PubSub多频道 | ❌ 未实现 | v1.2.0 |
| 水平扩展支持 | ❌ 未实现 | v1.2.0 |

**当前限制**:
- MVP版仅支持单实例内存广播
- 多实例部署时WebSocket消息不共享
- 适用于开发环境和小规模部署

---

## 文件清单

```
lib/yggdrasil/ws-adapter.ts              # 6663 bytes
app/api/ws/yggdrasil/vote-updates/route.ts  # 2282 bytes
design/yggdrasil/p2-delivery/WS-ADAPTER-001.md  # 本文档
```

---

## [TERMINATE:001|ARCHIVE=YES|压缩=LZ4] ✅

---

**状态**: B-01 COMPLETE  
**分隔线**: `--- CHECKPOINT: B-01 COMPLETE ---`
