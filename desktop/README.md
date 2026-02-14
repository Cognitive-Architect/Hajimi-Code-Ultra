# Hajimi Desktop

> 🖥️ Electron + Next.js 桌面IDE

## 架构

```
desktop/
├── electron/              # 主进程 (Node.js)
│   ├── main.ts           # 入口
│   ├── preload.ts        # 安全桥接
│   ├── ipc/              # IPC处理器
│   └── managers/         # 业务管理器
│       ├── FileManager.ts
│       ├── WindowManager.ts
│       ├── ProjectManager.ts
│       └── DatabaseManager.ts
├── renderer/              # 渲染进程 (Next.js)
│   ├── app/              # Next.js 14 App Router
│   └── components/       # UI组件
├── types/                 # 类型定义
└── tests/                 # 测试
```

## 开发

```bash
cd desktop

# 安装依赖
npm install

# 开发模式（需要同时运行Next.js和Electron）
npm run dev

# 构建
npm run build

# 打包
npm run dist
```

## 功能

- [x] Electron主进程
- [x] 安全IPC通信
- [x] 文件管理（原子写入、回收站）
- [x] 窗口管理（多窗口、状态恢复）
- [x] SQLite数据库（WAL模式）
- [x] Next.js渲染进程
- [ ] Monaco Editor集成
- [ ] Undo/Redo系统
- [ ] Worker线程

## License

Apache 2.0
