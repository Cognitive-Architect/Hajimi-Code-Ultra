# Lazy-RAG MVP 用户指南

> **文档版本**: v1.0.0  
> **适用版本**: Lazy-RAG MVP v1.5.0-final  
> **最后更新**: 2026-02-17

---

## 1. 快速开始

### 1.1 系统要求

| 项目 | 最低要求 | 推荐配置 |
|------|----------|----------|
| Node.js | v18.0.0+ | v20.10.0+ |
| 内存 | 2GB | 4GB |
| 磁盘空间 | 500MB | 2GB |
| 操作系统 | Windows 10 / Linux / macOS | Windows 11 / Ubuntu 22.04 |

### 1.2 启动服务

#### Windows (PowerShell)

```powershell
# 使用默认配置启动
.\scripts\start-lazy-rag.ps1

# 指定端口和存储路径
.\scripts\start-lazy-rag.ps1 -Port 7941 -StoragePath "D:\\hajimi-data"

# 开发模式（热重载）
.\scripts\start-lazy-rag.ps1 -Dev
```

#### Linux / macOS (Bash)

```bash
# 使用默认配置启动
./scripts/start-lazy-rag.sh

# 指定端口和存储路径
./scripts/start-lazy-rag.sh --port 7941 --storage /var/hajimi/data

# 开发模式
./scripts/start-lazy-rag.sh --dev
```

#### 启动成功提示

```
=====================================
    Lazy-RAG Server Launcher
=====================================

[INFO] Project root: F:\Hajimi Code Ultra
[INFO] Server path: F:\Hajimi Code Ultra\server\lazy-rag
[INFO] Configuration:
[INFO]   Port: 7941
[INFO]   Host: 0.0.0.0
[INFO]   Storage: F:\Hajimi Code Ultra\storage\lazy-rag
[INFO]   Mode: production

[SUCCESS] Lazy-RAG Server started on http://0.0.0.0:7941
[INFO] Ready to accept connections
```

---

## 2. API使用

### 2.1 查询接口

**端点**: `POST http://localhost:7941/query`

**请求头**:
```
Content-Type: application/json
```

**请求体**:
```json
{
  "query": "搜索关键词",
  "topK": 5,
  "threshold": 0.5,
  "timeout": 2000,
  "includeTelemetry": true
}
```

**参数说明**:

| 参数 | 类型 | 必需 | 默认值 | 说明 |
|------|------|------|--------|------|
| query | string | ✅ | - | 查询文本 |
| topK | number | ❌ | 5 | 返回结果数量（最大20） |
| threshold | number | ❌ | 0.5 | 相似度阈值（0-1） |
| timeout | number | ❌ | 2000 | 超时时间（毫秒） |
| includeTelemetry | boolean | ❌ | false | 是否包含性能埋点 |

### 2.2 使用示例

#### cURL

```bash
# 基础查询
curl -X POST http://localhost:7941/query \
  -H "Content-Type: application/json" \
  -d '{"query": "深度学习模型优化"}'

# 带参数查询
curl -X POST http://localhost:7941/query \
  -H "Content-Type: application/json" \
  -d '{
    "query": "深度学习模型优化",
    "topK": 10,
    "threshold": 0.7,
    "includeTelemetry": true
  }'
```

#### JavaScript / TypeScript

```typescript
// 基础查询
const response = await fetch('http://localhost:7941/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '深度学习模型优化' })
});

const result = await response.json();
console.log(result.results);

// 带参数查询
const result = await fetch('http://localhost:7941/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: '深度学习模型优化',
    topK: 10,
    threshold: 0.7,
    timeout: 3000
  })
}).then(r => r.json());
```

#### Python

```python
import requests

# 基础查询
response = requests.post(
    'http://localhost:7941/query',
    json={'query': '深度学习模型优化'}
)
result = response.json()
print(result['results'])

# 带参数查询
response = requests.post(
    'http://localhost:7941/query',
    json={
        'query': '深度学习模型优化',
        'topK': 10,
        'threshold': 0.7,
        'includeTelemetry': True
    }
)
```

### 2.3 响应格式

**成功响应**:
```json
{
  "queryId": "qr-1700000000000-abc123",
  "status": "success",
  "results": [
    {
      "id": "doc-001",
      "content": "文档内容...",
      "score": 0.92,
      "source": "fusion",
      "metadata": {
        "source": "github",
        "type": "code",
        "timestamp": 1699999999999
      },
      "vectorScore": 0.94,
      "bm25Score": 0.88
    }
  ],
  "total": 1,
  "latency": 45,
  "fallback": false
}
```

**降级响应**:
```json
{
  "queryId": "qr-1700000000000-def456",
  "status": "success",
  "results": [...],
  "total": 5,
  "latency": 32,
  "fallback": true,
  "fallbackReason": "timeout"
}
```

**字段说明**:

| 字段 | 类型 | 说明 |
|------|------|------|
| queryId | string | 查询唯一ID |
| status | string | 状态: success/timeout/fallback/error |
| results | array | 检索结果列表 |
| total | number | 结果总数 |
| latency | number | 查询耗时（毫秒） |
| fallback | boolean | 是否使用降级 |
| fallbackReason | string | 降级原因（如有） |
| telemetry | object | 性能埋点（如请求） |

---

## 3. 停止服务

### 3.1 正常停止

```bash
# 在运行服务的终端中按
Ctrl + C
```

### 3.2 强制停止

#### Windows

```powershell
# 查找进程
Get-Process -Name "node" | Where-Object { $_.CommandLine -like "*lazy-rag*" }

# 停止进程
Stop-Process -Id <PID>
```

#### Linux / macOS

```bash
# 查找进程
ps aux | grep lazy-rag

# 停止进程
kill <PID>

# 强制停止
kill -9 <PID>
```

---

## 4. 配置说明

### 4.1 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `LAZY_RAG_PORT` | 服务端口 | 7941 |
| `LAZY_RAG_HOST` | 绑定地址 | 0.0.0.0 |
| `LAZY_RAG_STORAGE` | 数据存储路径 | `./storage/lazy-rag` |
| `NODE_ENV` | 运行环境 | production |

### 4.2 数据存储路径

| 操作系统 | 默认路径 |
|----------|----------|
| Windows | `%APPDATA%/Hajimi-RAG/data/` |
| Linux | `~/.config/hajimi-rag/data/` |
| macOS | `~/Library/Application Support/Hajimi-RAG/data/` |

### 4.3 配置文件

```json
// storage/lazy-rag/config.json
{
  "hnswParams": {
    "M": 16,
    "efConstruction": 200,
    "efSearch": 64
  },
  "fusionWeights": {
    "vector": 0.7,
    "bm25": 0.3
  },
  "performanceBudget": {
    "coldStartMaxMs": 5000,
    "p50TargetMs": 30,
    "p95TargetMs": 100
  }
}
```

---

## 5. 故障排查

### 5.1 常见问题

#### 端口被占用

```
Error: Port 7941 is already in use
```

**解决方案**:
```bash
# 使用其他端口
./scripts/start-lazy-rag.sh --port 7942
```

#### 索引文件不存在

```
[ERROR] Index file not found: index.hnsw
```

**解决方案**:
```bash
# 初始化示例数据
npm run init-sample-data
```

#### 内存不足

```
[ERROR] Memory limit exceeded: 512MB
```

**解决方案**:
- 减少向量数量
- 增加系统内存
- 调整`memoryExceeded`阈值

### 5.2 日志查看

```bash
# 查看实时日志
tail -f storage/lazy-rag/logs/server.log

# 查看错误日志
tail -f storage/lazy-rag/logs/error.log
```

### 5.3 性能诊断

```bash
# 运行性能测试
npm run benchmark

# 查看决策门报告
cat storage/lazy-rag/data/benchmark.json
```

---

## 6. 最佳实践

### 6.1 生产部署

```bash
# 1. 使用生产模式
NODE_ENV=production ./scripts/start-lazy-rag.sh

# 2. 指定稳定的存储路径
./scripts/start-lazy-rag.sh --storage /var/lib/hajimi-rag

# 3. 使用进程管理器（推荐）
pm install -g pm2
pm2 start server/lazy-rag/index.js --name "lazy-rag"
```

### 6.2 监控建议

```bash
# 监控端点（每分钟）
while true; do
  curl -s http://localhost:7941/health | jq '.status'
  sleep 60
done

# 性能监控
watch -n 5 'curl -s http://localhost:7941/metrics'
```

### 6.3 数据备份

```bash
# 备份数据
tar -czf backup-$(date +%Y%m%d).tar.gz storage/lazy-rag/data/

# 恢复数据
tar -xzf backup-20260217.tar.gz -C /
```

---

## 7. API限制

| 限制项 | 值 | 说明 |
|--------|-----|------|
| 最大topK | 20 | 单次返回结果数限制 |
| 默认超时 | 2000ms | 触发降级阈值 |
| 请求体大小 | 1MB | POST body限制 |
| 并发限制 | 10 | 推荐并发数 |

---

## 8. 附录

### 8.1 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v1.0.0 | 2026-02-17 | 初始版本 |

### 8.2 参考文档

- [性能预算验证报告](./性能预算验证报告.md)
- [ONNX量化优化指南](./ONNX量化优化指南.md)
- [架构决策记录](./ADR-Lazy-RAG.md)

### 8.3 获取帮助

```bash
# 查看帮助
./scripts/start-lazy-rag.sh --help

# 检查版本
./scripts/start-lazy-rag.sh --version
```

---

**文档结束**

> 如有问题，请参考故障排查章节或查看日志文件。
