# Lazy-RAG MVP 用户指南

> **文档版本**: v1.0.0  
> **适用版本**: Lazy-RAG MVP v1.5.0-final  

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

# 开发模式
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

---

## 2. API使用

### 2.1 查询接口

**端点**: `POST http://localhost:7941/query`

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
| query | string | 是 | - | 查询文本 |
| topK | number | 否 | 5 | 返回结果数量（最大20） |
| threshold | number | 否 | 0.5 | 相似度阈值（0-1） |
| timeout | number | 否 | 2000 | 超时时间（毫秒） |
| includeTelemetry | boolean | 否 | false | 是否包含性能埋点 |

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

#### JavaScript

```javascript
// 基础查询
const response = await fetch('http://localhost:7941/query', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: '深度学习模型优化' })
});
const result = await response.json();
console.log(result.results);
```

### 2.3 响应格式

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
      "metadata": { "source": "github", "type": "code" }
    }
  ],
  "total": 1,
  "latency": 45,
  "fallback": false
}
```

---

## 3. 停止服务

### 3.1 正常停止

在运行服务的终端中按 `Ctrl + C`

### 3.2 强制停止

#### Windows

```powershell
# 查找并停止进程
Get-Process -Name "node" | Where-Object { $_.CommandLine -like "*lazy-rag*" } | Stop-Process
```

#### Linux / macOS

```bash
# 查找并停止进程
ps aux | grep lazy-rag
kill <PID>
```

---

## 4. 配置说明

### 4.1 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| LAZY_RAG_PORT | 服务端口 | 7941 |
| LAZY_RAG_HOST | 绑定地址 | 0.0.0.0 |
| LAZY_RAG_STORAGE | 数据存储路径 | ./storage/lazy-rag |
| NODE_ENV | 运行环境 | production |

---

## 5. 故障排查

### 5.1 常见问题

#### 端口被占用

**错误**: `Port 7941 is already in use`

**解决**: 使用其他端口启动
```bash
./scripts/start-lazy-rag.sh --port 7942
```

#### 索引文件不存在

**错误**: `Index file not found: index.hnsw`

**解决**: 初始化示例数据
```bash
npm run init-sample-data
```

---

**文档结束**
