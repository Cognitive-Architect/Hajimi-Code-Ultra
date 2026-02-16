🚀 Deep Research 模式：电脑级满血配置

研究课题：HAJIMI-001-PERF Phase 1-4 桌面IDE级架构设计

目标平台：Windows/macOS/Linux（电脑本地，非浏览器限制）

技术栈：Node.js原生API + Electron/Tauri（或Next.js+独立进程） + 系统级资源

---

🖥️ Phase 1：桌面级持久化（原子级可靠）

技术选型（电脑专属）

方案	优势	适用场景	
Node.js fs + 内存映射	直接操作GB级文件，mmap加速	大文件（>100MB）秒开	
Better-SQLite3	Node原生绑定，比WASM快10倍	项目元数据、操作历史	
原生Git	child_process.spawn，完整功能	版本控制、分支管理	
Chokidar	原生文件系统监视	实时同步外部编辑器修改	
Proper-lockfile	跨进程文件锁	防止多实例数据损坏	

架构设计（桌面级）

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Process (Node.js)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │   Next.js    │  │  Governance  │  │   File System    │  │
│  │   Renderer   │  │   Core (v1)  │  │     Manager      │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│         │                 │                    │            │
│         └─────────────────┴────────────────────┘            │
│                           │                                 │
│              ┌────────────▼────────────┐                   │
│              │   SQLite (Better-SQLite3)│  ← 同步API，极速  │
│              │   Project Metadata       │                   │
│              └────────────┬────────────┘                   │
│                           │                                 │
│  ┌────────────────────────▼────────────────────────┐       │
│  │              Native File System                 │       │
│  │  F:\Hajimi-Projects\                          │       │
│  │  ├── Project-A\ (.git + sqlite + files)       │       │
│  │  ├── Project-B\                               │       │
│  │  └── .trash\ (系统回收站映射)                  │       │
│  └─────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

核心实现（电脑级）

```typescript
// lib/desktop/fs-manager.ts
import { promises as fs } from 'fs';
import { open, read, write, close } from 'fs/promises';
import { mmap } from 'mmap-io'; // 内存映射大文件

export class DesktopFileManager {
  private projectsRoot = 'F:\\Hajimi-Projects';
  
  // 内存映射大文件（电脑级特权：GB级秒开）
  async mmapLargeFile(filePath: string): Promise<Buffer> {
    const fd = await open(filePath, 'r');
    const { size } = await fd.stat();
    
    // 电脑级：直接内存映射，而非流式读取
    const buffer = mmap.map(size, mmap.PROT_READ, mmap.MAP_SHARED, fd.fd, 0);
    return buffer;
  }
  
  // 原子写入（先写临时文件，再rename，保证不损坏原文件）
  async atomicWrite(filePath: string, data: Buffer | string) {
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tempPath, data, { encoding: 'utf-8' });
    await fs.rename(tempPath, filePath); // 原子操作
  }
  
  // 实时文件监视（电脑级：chokidar原生绑定）
  watchProject(projectPath: string, onChange: (event: string, path: string) => void) {
    const chokidar = require('chokidar');
    const watcher = chokidar.watch(projectPath, {
      ignored: /(^|[\/\\])\../, // 忽略隐藏文件
      persistent: true,
      ignoreInitial: true,
      usePolling: false, // 电脑级：使用原生fsevents/inotify
    });
    
    watcher.on('change', path => onChange('modify', path));
    watcher.on('add', path => onChange('create', path));
    watcher.on('unlink', path => onChange('delete', path));
  }
}

// lib/desktop/sqlite-manager.ts
import Database from 'better-sqlite3';

export class ProjectDB {
  private db: Database;
  
  constructor(projectPath: string) {
    // 电脑级：原生SQLite，非WASM，支持并发
    this.db = new Database(`${projectPath}\\.hajimi\\project.db`, {
      verbose: process.env.DEBUG ? console.log : undefined,
      fileMustExist: false,
    });
    
    // WAL模式（Write-Ahead Logging），电脑级性能
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    
    this.initSchema();
  }
  
  private initSchema() {
    // 操作历史表（支持Undo/Redo）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS operations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload JSON,
        timestamp INTEGER DEFAULT (strftime('%s', 'now')),
        checksum TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_ops_time ON operations(timestamp);
      
      // 文件快照表（用于Git-like版本控制）
      CREATE TABLE IF NOT EXISTS snapshots (
        id TEXT PRIMARY KEY,
        parent_id TEXT,
        message TEXT,
        created_at INTEGER,
        tree_hash TEXT
      );
    `);
  }
  
  // 同步事务（电脑级：无需async/await开销）
  transaction<T>(fn: (db: Database) => T): T {
    return this.db.transaction(fn)();
  }
}
```

---

🛡️ Phase 2：系统级容错（ Undo/Redo + 系统回收站）

电脑级优势

- 系统回收站：调用Windows shell API/macOS Finder API，删除文件进系统回收站，而非自建.trash
- 进程级隔离：Undo栈存储在Main Process内存，Renderer崩溃不丢失
- AOF持久化：每个操作即时追加到SQLite，防进程崩溃

```typescript
// lib/desktop/undo-system.ts
import { ipcMain, ipcRenderer } from 'electron'; // 或类似机制

interface UndoableCommand {
  id: string;
  type: 'file' | 'git' | 'setting';
  execute(): void;
  undo(): void;
  redo(): void;
  serialize(): object;
}

export class DesktopUndoManager {
  private stack: UndoableCommand[] = [];
  private pointer = -1; // 当前位置
  private maxSize = 1000; // 电脑级：支持1000步，非50步
  private db: ProjectDB;
  
  constructor(db: ProjectDB) {
    this.db = db;
    this.loadFromDisk(); // 重启后恢复Undo栈
  }
  
  execute(cmd: UndoableCommand) {
    cmd.execute();
    
    // 截断Redo历史（如果有）
    if (this.pointer < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.pointer + 1);
    }
    
    this.stack.push(cmd);
    this.pointer++;
    
    // 超出限制，移除最老的
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      this.pointer--;
    }
    
    this.persistToDisk(); // 即时持久化
  }
  
  undo() {
    if (this.pointer >= 0) {
      const cmd = this.stack[this.pointer];
      cmd.undo();
      this.pointer--;
      this.persistToDisk();
    }
  }
  
  // 持久化到SQLite（防崩溃）
  private persistToDisk() {
    const serialized = this.stack.map((cmd, idx) => ({
      idx,
      data: cmd.serialize(),
      pointer: this.pointer
    }));
    
    this.db.transaction((db) => {
      db.prepare('DELETE FROM undo_stack').run();
      const insert = db.prepare('INSERT INTO undo_stack (idx, data, is_current) VALUES (?, ?, ?)');
      serialized.forEach(row => {
        insert.run(row.idx, JSON.stringify(row.data), row.idx === this.pointer ? 1 : 0);
      });
    });
  }
}

// lib/desktop/trash-manager.ts（系统级回收站）
import { shell } from 'electron'; // 或 trash 模块

export async function moveToSystemTrash(filePath: string) {
  // Windows: 调用Shell API到回收站
  // macOS: Finder的Move to Trash
  // Linux: 符合XDG规范的Trash
  await shell.trashItem(filePath);
}

// 危险操作：系统级确认对话框（非网页alert）
export function showDangerConfirm(action: 'delete-project'): boolean {
  const { dialog } = require('electron');
  const result = dialog.showMessageBoxSync({
    type: 'warning',
    buttons: ['取消', '删除'],
    defaultId: 0,
    title: '危险操作确认',
    message: '此操作不可撤销，文件将进入系统回收站',
    detail: '项目包含 128 个文件，总计 45MB',
    checkboxLabel: '我确认要删除此项目',
    checkboxChecked: false,
  });
  
  return result.response === 1 && result.checkboxChecked;
}
```

---

⚡ Phase 3：桌面级性能（多核+大内存）

架构升级（电脑专属）

功能	手机方案	电脑级方案	收益	
代码编辑器	textarea/CodeMirror 6	Monaco Editor (VS Code同款)	语法高亮、智能提示、多光标	
文件树	虚拟滚动	原生虚拟化 + 系统图标缓存	10万文件秒开	
ZIP打包	Web Worker	Node Stream + 多线程(worker_threads)	利用全核压缩，速度x10	
搜索	简单遍历	Ripgrep (rg) 绑定	百万行代码秒搜	
Git操作	简单JS实现	原生Git child_process	完整功能，速度极快	
渲染	DOM-based	GPU加速 (WebGL/Skia)	4K屏丝滑滚动	

```typescript
// lib/desktop/editor-manager.ts (Monaco集成)
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';

// 电脑级：本地加载Monaco，非CDN
loader.config({ 
  paths: { 
    vs: 'node_modules/monaco-editor/min/vs' 
  } 
});

export class DesktopEditor {
  private editor: monaco.editor.IStandaloneCodeEditor;
  
  init(container: HTMLElement, filePath: string) {
    this.editor = monaco.editor.create(container, {
      value: '',
      language: 'typescript',
      theme: 'vs-dark',
      fontSize: 14,
      minimap: { enabled: true }, // 电脑级：小地图导航
      automaticLayout: true,
      scrollBeyondLastLine: false,
      largeFileOptimizations: true, // 针对大文件优化
      maxTokenizationLineLength: 20000,
    });
    
    // 大文件分块加载（电脑级：GB级文件处理）
    this.loadLargeFile(filePath);
  }
  
  async loadLargeFile(filePath: string) {
    const stats = await fs.stat(filePath);
    
    if (stats.size > 100 * 1024 * 1024) { // >100MB
      // 电脑级特权：内存映射
      const fd = await open(filePath, 'r');
      const buffer = Buffer.alloc(1000000); // 先读前1MB显示
      await fd.read(buffer, 0, 1000000, 0);
      this.editor.setValue(buffer.toString('utf-8'));
      
      // 后台线程读取剩余
      this.loadRestInBackground(fd, stats.size);
    } else {
      const content = await fs.readFile(filePath, 'utf-8');
      this.editor.setValue(content);
    }
  }
}

// lib/desktop/worker-pool.ts (多线程利用多核)
import { Worker } from 'worker_threads';
import os from 'os';

export class WorkerPool {
  private workers: Worker[] = [];
  private queue: Task[] = [];
  private maxWorkers = os.cpus().length; // 电脑级：CPU核数决定线程数
  
  constructor() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = new Worker('./workers/task-processor.js');
      worker.on('message', (result) => this.handleResult(result));
      this.workers.push({ worker, busy: false });
    }
  }
  
  async executeTask(type: 'zip' | 'search' | 'git-gc', payload: any): Promise<any> {
    // 分配空闲Worker，或排队
    const available = this.workers.find(w => !w.busy);
    if (available) {
      available.busy = true;
      available.worker.postMessage({ type, payload });
      return new Promise((resolve) => {
        // 等待结果...
      });
    } else {
      return new Promise((resolve) => {
        this.queue.push({ type, payload, resolve });
      });
    }
  }
}

// workers/task-processor.ts
import { parentPort } from 'worker_threads';
import { createWriteStream } from 'fs';
import archiver from 'archiver';

parentPort?.on('message', async ({ type, payload }) => {
  if (type === 'zip') {
    // 在独立线程中执行ZIP打包，不阻塞主线程
    const output = createWriteStream(payload.outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    
    archive.pipe(output);
    archive.directory(payload.sourcePath, false);
    await archive.finalize();
    
    parentPort?.postMessage({ success: true, path: payload.outputPath });
  }
});
```

---

🗂️ Phase 4：桌面级多开（真·多窗口）

电脑级Workspace架构

不再是"浏览器标签页"，而是"真窗口"：

```
Main Process (Node.js)
├── Window 1: Project-A (独立进程)
│   ├── URL: app://editor?project=project-a
│   ├── 独立LocalStorage/Session
│   └── 独立Git工作区
├── Window 2: Project-B (独立进程)  
│   └── URL: app://editor?project=project-b
└── Window 3: Settings/Dashboard

进程间通信 (IPC):
- 跨窗口拖拽文件 → 通过Main Process中转
- 全局快捷键 (Ctrl+N, Ctrl+Shift+T) → 主进程捕获分发
```

```typescript
// main.ts (Electron主进程示例)
import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';

class HajimiDesktop {
  private windows: Map<string, BrowserWindow> = new Map();
  
  createProjectWindow(projectId: string) {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js'),
        // 电脑级：大内存限制（可处理GB级文件）
        additionalArguments: [`--project-id=${projectId}`],
      },
      titleBarStyle: 'hiddenInset', // macOS风格
      // Windows/linux自定义标题栏支持七权主题色
    });
    
    win.loadURL(`http://localhost:3000/editor?project=${projectId}`);
    this.windows.set(projectId, win);
    
    // 系统级文件拖拽进窗口
    win.webContents.on('dom-ready', () => {
      // 注册系统拖拽目标
    });
  }
  
  // 跨窗口通信（拖拽文件从Window A到Window B）
  setupIPC() {
    ipcMain.handle('cross-window-copy', async (event, { 
      sourceProject, 
      targetProject, 
      filePath 
    }) => {
      const content = await fs.readFile(
        `F:\\Hajimi-Projects\\${sourceProject}\\${filePath}`
      );
      await fs.writeFile(
        `F:\\Hajimi-Projects\\${targetProject}\\${filePath}`,
        content
      );
      return { success: true };
    });
  }
}

// 系统级快捷键（全局）
app.on('ready', () => {
  const { globalShortcut } = require('electron');
  
  // Ctrl+Shift+N: 新建项目窗口
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    hajimi.createProjectWindow(`new-${Date.now()}`);
  });
});
```

多项目并行架构

```typescript
// lib/desktop/multi-project.ts
export class ProjectManager {
  private activeProjects: Map<string, ProjectInstance> = new Map();
  
  openProject(projectPath: string): ProjectInstance {
    // 检查是否已打开（防止重复）
    if (this.activeProjects.has(projectPath)) {
      return this.activeProjects.get(projectPath)!;
    }
    
    // 每个项目：独立SQLite连接 + 独立Git仓库 + 独立文件监视
    const instance = new ProjectInstance({
      path: projectPath,
      db: new ProjectDB(projectPath),
      git: simpleGit(projectPath), // 原生Git
      watcher: new DesktopFileManager().watchProject(projectPath, (event, path) => {
        this.handleExternalChange(projectPath, event, path);
      }),
    });
    
    this.activeProjects.set(projectPath, instance);
    return instance;
  }
  
  // 跨项目操作（拖拽、复制）
  async copyBetweenProjects(
    source: string, 
    target: string, 
    relativePath: string
  ) {
    const sourceInstance = this.activeProjects.get(source);
    const targetInstance = this.activeProjects.get(target);
    
    if (!sourceInstance || !targetInstance) {
      throw new Error('项目未打开');
    }
    
    const content = await fs.readFile(
      path.join(source, relativePath)
    );
    
    // 原子操作
    await targetInstance.db.transaction((db) => {
      // 写入文件
      fs.writeFileSync(path.join(target, relativePath), content);
      // 记录Undo
      db.prepare('INSERT INTO operations ...').run({
        type: 'cross_copy',
        source,
        target,
        path: relativePath,
      });
    });
  }
}
```

---

🔌 与 v1.0.0 Ouroboros 治理核心集成

关键融合点（电脑级增强）：

1. 六件套导出 = 调用 Worker Pool 多线程 ZIP（Phase 3）+ 写入 `F:\Hajimi-Projects\.archive\`（Phase 1）
2. TSA Branch = 每个 Project Window 对应一个 Git Branch，原生 Git 操作（毫秒级）
3. Undo/Redo = DesktopUndoManager 与 Governance State 解耦（UI级操作Undo不影响治理提案状态）
4. 自动保存 = Chokidar 监视外部编辑器修改，自动触发 Governance 的 "外部修改检测" 提案

```typescript
// 集成示例：电脑级自动保存触发治理审计
fileManager.watchProject(projectPath, async (event, filePath) => {
  if (event === 'modify') {
    // 1. 立即持久化（Phase 1）
    await saveToDisk(filePath);
    
    // 2. 如果修改的是关键文件，触发治理提案（v1.0.0集成）
    if (isCriticalFile(filePath)) {
      await governance.createProposal({
        type: 'FILE_MODIFIED_EXTERNALLY',
        file: filePath,
        diff: await git.diff([filePath]), // 原生Git diff
      });
    }
  }
});
```

---

📋 施工路线图（电脑级）

阶段A（基础设施）：2周
- Week 1: Electron/Next.js混合架构 + Better-SQLite3 + 原生文件管理器
- Week 2: Monaco Editor集成 + 系统级Undo/Redo + 回收站API

阶段B（性能满血）：1周
- Week 3: Worker线程池 + Ripgrep搜索 + Git原生绑定 + GPU加速渲染

阶段C（多开豪华）：1周
- Week 4: 多窗口管理 + 跨进程通信 + 系统快捷键 + 多项目拖拽

电脑级依赖包清单：

```json
{
  "better-sqlite3": "^9.4.0",
  "chokidar": "^3.5.3",
  "monaco-editor": "^0.45.0",
  "simple-git": "^3.22.0",
  "worker_threads": "native",
  "mmap-io": "^1.0.0",
  "trash": "^8.1.0"
}
```

立即启动 HAJIMI-PERF-DESKTOP-010 施工集群？ 🖥️🐍♾️