# 研究工单 R-08/09: 桌面级IDE测试策略研究报告

> **项目**: HAJIMI-PERF-DESKTOP-RESEARCH-011  
> **版本**: v1.0.0  
> **日期**: 2026-02-14  
> **作者**: 测试架构师

---

## 📋 目录

1. [测试金字塔](#1-测试金字塔)
2. [E2E 测试架构](#2-e2e-测试架构)
3. [崩溃恢复测试脚本](#3-崩溃恢复测试脚本)
4. [性能基准测试规范](#4-性能基准测试规范)
5. [测试代码模板](#5-测试代码模板)
6. [CI/CD 配置](#6-cicd-配置)

---

## 1. 测试金字塔

### 1.1 架构概览

```
                    ▲
                   ╱ ╲
                  ╱ E2E ╲          ← 端到端测试 (Playwright)
                 ╱─────────╲           模拟真实用户操作
                ╱   集成测试   ╲       跨模块流程验证
               ╱─────────────────╲
              ╱      单元测试       ╲  ← Jest + ts-jest
             ╱─────────────────────────╲   核心逻辑、边界条件
            ╱        静态分析 + Mock       ╲
           ╱─────────────────────────────────╲
```

### 1.2 各层测试范围定义

| 层级 | 范围 | 目标 | 覆盖率目标 |
|------|------|------|-----------|
| **单元测试** | 单个函数/类/组件 | 验证核心逻辑正确性 | > 80% |
| **集成测试** | 模块间交互 | 验证接口契约 | > 60% |
| **E2E测试** | 完整用户场景 | 验证端到端流程 | 关键路径 |
| **性能测试** | 特定操作性能 | 验证性能阈值 | 基准对比 |

### 1.3 工具选型对比表

| 测试类型 | 推荐工具 | 替代方案 | 选型理由 |
|----------|----------|----------|----------|
| 单元测试 | **Jest + ts-jest** | Mocha + Chai | TypeScript原生支持，内置Mock |
| 集成测试 | **Jest + Supertest** | Vitest | 与单元测试统一，API测试友好 |
| E2E测试 | **Playwright** | Spectron(废弃) | 官方推荐，Electron适配完善 |
| 性能测试 | **Benchmark.js** | 自定义计时 | 精准测量，统计报告 |
| 覆盖率 | **Istanbul/nyc** | Jest内置 | 行/分支/函数/语句全覆盖 |

---

## 2. E2E 测试架构

### 2.1 工具对比分析

| 工具 | 优势 | 劣势 | 推荐场景 | 推荐指数 |
|------|------|------|----------|----------|
| **Playwright** | • 官方支持Electron<br>• 自动等待机制<br>• 多浏览器支持<br>• 录制回放功能 | • 学习曲线较陡<br>• 资源占用较高 | **桌面应用E2E测试** | ⭐⭐⭐⭐⭐ |
| **Spectron** | • 专为Electron设计<br>• API简洁直观 | • **已废弃**(2022停止维护)<br>• 不支持新Electron版本 | 不推荐 | ⭐ |
| **electron-mocha** | • 主进程测试<br>• 渲染进程测试<br>• 轻量级 | • 无浏览器自动化<br>• 需自行处理IPC | 单元/集成测试 | ⭐⭐⭐ |
| **Cypress** | • 调试体验好<br>• 实时重载 | • Electron支持有限<br>• 多窗口测试困难 | Web应用测试 | ⭐⭐⭐ |
| **WebDriverIO** | • 协议标准<br>• 社区活跃 | • 配置复杂<br>• Electron需额外驱动 | 跨平台测试 | ⭐⭐⭐ |

### 2.2 Playwright Electron 适配器配置

```typescript
// tests/e2e/playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: false, // Electron测试需串行
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Electron应用只能单实例运行
  reporter: [
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'results.xml' }],
  ],
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'electron',
      use: {
        // Electron启动配置
        launchOptions: {
          executablePath: process.env.ELECTRON_PATH,
          args: ['.', '--no-sandbox'],
          env: {
            ...process.env,
            NODE_ENV: 'test',
            E2E_TEST: 'true',
          },
        },
      },
    },
  ],
});
```

### 2.3 Playwright Electron 启动器

```typescript
// tests/e2e/fixtures/electron-fixture.ts
import { test as base, electron, ElectronApplication, Page } from '@playwright/test';
import * as path from 'path';

// 扩展测试上下文
type TestFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
  secondWindow: Page | null;
};

export const test = base.extend<TestFixtures>({
  // Electron应用实例
  electronApp: async ({}, use) => {
    const electronPath = require.resolve('electron');
    const appPath = path.join(__dirname, '../../..');
    
    const app = await electron.launch({
      executablePath: electronPath,
      args: [appPath, '--no-sandbox'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TEST: 'true',
        // 使用内存数据库避免污染
        SQLITE_PATH: ':memory:',
      },
    });
    
    await use(app);
    await app.close();
  },

  // 主窗口
  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },

  // 第二个窗口(按需创建)
  secondWindow: async ({ electronApp }, use) => {
    const windows = electronApp.windows();
    const secondWindow = windows.length > 1 ? windows[1] : null;
    await use(secondWindow);
  },
});

export { expect } from '@playwright/test';
```

### 2.4 多窗口测试示例代码

```typescript
// tests/e2e/specs/multi-window.spec.ts
import { test, expect } from '../fixtures/electron-fixture';

test.describe('多窗口管理测试', () => {
  test('DEV-001: 打开新编辑器窗口', async ({ electronApp, mainWindow }) => {
    // 点击菜单打开新窗口
    await mainWindow.click('[data-testid="menu-file"]');
    await mainWindow.click('[data-testid="menu-new-window"]');
    
    // 等待新窗口创建
    const newWindow = await electronApp.waitForEvent('window', {
      timeout: 5000,
    });
    
    expect(newWindow).toBeDefined();
    await expect(newWindow).toHaveTitle(/Editor/);
    
    // 验证窗口数量
    const windows = electronApp.windows();
    expect(windows.length).toBe(2);
  });

  test('DEV-002: 窗口间文件拖拽', async ({ electronApp, mainWindow }) => {
    // 创建两个窗口
    await mainWindow.evaluate(() => {
      (window as any).electronAPI.createNewWindow();
    });
    
    const windows = electronApp.windows();
    expect(windows.length).toBeGreaterThanOrEqual(2);
    
    const [win1, win2] = windows;
    
    // 在win1中打开文件
    await win1.click('[data-testid="file-explorer"]');
    await win1.click('[data-testid="file-item"]:has-text("test.txt")');
    
    // 拖拽文件到win2
    const fileItem = win1.locator('[data-testid="file-item"]:has-text("test.txt")');
    const dropZone = win2.locator('[data-testid="editor-dropzone"]');
    
    await fileItem.dragTo(dropZone);
    
    // 验证win2中打开了该文件
    await expect(win2.locator('[data-testid="tab-label"]:has-text("test.txt")')).toBeVisible();
  });

  test('DEV-003: 窗口关闭前保存确认', async ({ electronApp, mainWindow }) => {
    // 编辑文件但不保存
    await mainWindow.click('[data-testid="editor-area"]');
    await mainWindow.fill('[data-testid="editor-area"] > textarea', '新内容');
    
    // 触发窗口关闭
    await mainWindow.close();
    
    // 验证保存确认对话框出现
    const dialog = mainWindow.locator('[data-testid="save-confirm-dialog"]');
    await expect(dialog).toBeVisible();
    
    // 点击"保存"
    await mainWindow.click('[data-testid="btn-save-and-close"]');
    
    // 验证窗口关闭
    await expect(mainWindow.isClosed()).resolves.toBe(true);
  });

  test('DEV-004: 主窗口崩溃时子窗口行为', async ({ electronWindow, mainWindow }) => {
    // 创建子窗口
    await mainWindow.evaluate(() => {
      (window as any).electronAPI.createNewWindow();
    });
    
    const windowsBefore = electronApp.windows();
    
    // 模拟主进程崩溃(通过 IPC 触发)
    await mainWindow.evaluate(() => {
      (window as any).electronAPI.simulateCrash();
    });
    
    // 验证子窗口也关闭(或保持独立)
    const windowsAfter = electronApp.windows();
    expect(windowsAfter.length).toBeLessThan(windowsBefore.length);
  });
});
```

### 2.5 IPC 通信测试示例

```typescript
// tests/e2e/specs/ipc-communication.spec.ts
import { test, expect } from '../fixtures/electron-fixture';

test.describe('IPC通信测试', () => {
  test('IPC-001: 主进程到渲染进程消息', async ({ electronApp, mainWindow }) => {
    // 设置消息监听
    const messagePromise = mainWindow.evaluate(() => {
      return new Promise<string>((resolve) => {
        (window as any).electronAPI.onMessage((msg: string) => resolve(msg));
      });
    });
    
    // 通过主进程发送消息
    await electronApp.evaluate(async ({ ipcMain }) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows[0]) {
        windows[0].webContents.send('test-message', 'Hello from main');
      }
    });
    
    // 验证消息接收
    const message = await messagePromise;
    expect(message).toBe('Hello from main');
  });

  test('IPC-002: 渲染进程调用主进程API', async ({ electronApp, mainWindow }) => {
    // 调用主进程方法
    const result = await mainWindow.evaluate(async () => {
      return await (window as any).electronAPI.getAppVersion();
    });
    
    expect(result).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('IPC-003: SQLite数据库操作', async ({ mainWindow }) => {
    // 插入数据
    const insertResult = await mainWindow.evaluate(async () => {
      return await (window as any).electronAPI.dbQuery(
        'INSERT INTO projects (name) VALUES (?)',
        ['Test Project']
      );
    });
    
    expect(insertResult.changes).toBe(1);
    
    // 查询数据
    const queryResult = await mainWindow.evaluate(async () => {
      return await (window as any).electronAPI.dbQuery(
        'SELECT * FROM projects WHERE name = ?',
        ['Test Project']
      );
    });
    
    expect(queryResult).toHaveLength(1);
    expect(queryResult[0].name).toBe('Test Project');
  });
});
```

---

## 3. 崩溃恢复测试脚本

### 3.1 测试策略

| 崩溃场景 | 模拟方法 | 验证点 |
|----------|----------|--------|
| SIGKILL 主进程 | `process.kill(pid, 'SIGKILL')` | 数据文件完整性 |
| 渲染进程崩溃 | `webContents.forcefullyCrashRenderer()` | 自动重启、状态恢复 |
| Worker 崩溃 | 抛出未处理异常 | 任务重新调度 |
| 系统断电 | 文件系统快照对比 | WAL日志恢复 |

### 3.2 PowerShell 崩溃恢复测试脚本

```powershell
# tests/crash-recovery/crash-recovery-test.ps1
# 桌面应用崩溃恢复测试脚本 (PowerShell)

param(
    [string]$ElectronPath = ".\node_modules\.bin\electron.cmd",
    [string]$AppPath = ".",
    [string]$TestDbPath = ".\test-crash.db",
    [int]$WaitTime = 3000
)

$ErrorActionPreference = "Stop"
$script:TestResults = @()

function Write-TestResult {
    param($TestName, $Passed, $Details)
    $script:TestResults += [PSCustomObject]@{
        Test = $TestName
        Passed = $Passed
        Details = $Details
        Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    }
    $status = if ($Passed) { "✅ PASS" } else { "❌ FAIL" }
    Write-Host "$status $TestName`: $Details" -ForegroundColor $(if ($Passed) { "Green" } else { "Red" })
}

function Start-TestApp {
    param($AdditionalArgs = @())
    
    $env:SQLITE_PATH = $TestDbPath
    $env:CRASH_TEST_MODE = "true"
    
    $process = Start-Process -FilePath $ElectronPath `
        -ArgumentList (@($AppPath) + $AdditionalArgs) `
        -PassThru -WindowStyle Hidden
    
    Start-Sleep -Milliseconds $WaitTime
    return $process
}

function Test-SqliteIntegrity {
    param($DbPath)
    
    if (-not (Test-Path $DbPath)) {
        return @{ Valid = $false; Error = "Database file not found" }
    }
    
    try {
        # 使用 SQLite3 命令行工具检查完整性
        $output = & sqlite3 $DbPath "PRAGMA integrity_check;" 2>&1
        $valid = ($output -eq "ok")
        return @{ Valid = $valid; Output = $output }
    }
    catch {
        return @{ Valid = $false; Error = $_.Exception.Message }
    }
}

function Test-UndoStackRecovery {
    param($DbPath)
    
    try {
        $count = & sqlite3 $DbPath "SELECT COUNT(*) FROM undo_stack;" 2>&1
        return @{ HasData = [int]$count -gt 0; Count = [int]$count }
    }
    catch {
        return @{ HasData = $false; Error = $_.Exception.Message }
    }
}

# ============================================================
# 测试用例
# ============================================================

Write-Host "
========================================" -ForegroundColor Cyan
Write-Host "Electron 崩溃恢复测试套件" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ---------- TEST CR-001: SIGKILL 恢复 ----------
Write-Host "`n[TEST CR-001] SIGKILL 后数据完整性" -ForegroundColor Yellow

# 清理测试环境
if (Test-Path $TestDbPath) { Remove-Item $TestDbPath -Force }
if (Test-Path "$TestDbPath-wal") { Remove-Item "$TestDbPath-wal" -Force }
if (Test-Path "$TestDbPath-shm") { Remove-Item "$TestDbPath-shm" -Force }

# 启动应用
$process = Start-TestApp
Write-Host "应用已启动, PID: $($process.Id)"

# 等待数据库初始化
Start-Sleep -Milliseconds 2000

# 模拟用户操作(通过 IPC 或直接数据库写入)
& sqlite3 $TestDbPath @"
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS undo_stack (id INTEGER PRIMARY KEY, operation TEXT, data TEXT);
INSERT INTO projects (name) VALUES ('Before Crash');
INSERT INTO undo_stack (operation, data) VALUES ('INSERT', '{"table":"projects"}');
PRAGMA wal_checkpoint(TRUNCATE);
"@

Write-Host "已写入测试数据"

# 强制终止进程 (模拟 kill -9)
Stop-Process -Id $process.Id -Force
Write-Host "进程已强制终止 (SIGKILL)"

# 等待文件系统同步
Start-Sleep -Milliseconds 1000

# 验证数据库完整性
$integrity = Test-SqliteIntegrity $TestDbPath
Write-TestResult -TestName "CR-001: SQLite 完整性" `
    -Passed $integrity.Valid `
    -Details $(if ($integrity.Valid) { "Database OK" } else { $integrity.Error })

# 验证数据恢复
$dataCheck = Test-UndoStackRecovery $TestDbPath
Write-TestResult -TestName "CR-001: Undo 栈恢复" `
    -Passed $dataCheck.HasData `
    -Details "Undo stack entries: $($dataCheck.Count)"

# ---------- TEST CR-002: 渲染进程崩溃恢复 ----------
Write-Host "`n[TEST CR-002] 渲染进程崩溃恢复" -ForegroundColor Yellow

$process = Start-TestApp @("--enable-logging")
Start-Sleep -Milliseconds $WaitTime

# 通过 Chrome DevTools Protocol 触发渲染进程崩溃
# 注意: 需要启用 remote-debugging-port
$debugPort = 9223
$process = Start-TestApp @("--remote-debugging-port=$debugPort")
Start-Sleep -Milliseconds $WaitTime

try {
    # 获取 WebSocket 调试 URL
    $response = Invoke-RestMethod -Uri "http://localhost:$debugPort/json/list"
    $page = $response | Select-Object -First 1
    
    if ($page) {
        Write-Host "连接调试页面: $($page.title)"
        
        # 触发渲染进程崩溃 (Inspector.targetCrashed)
        # 这里使用 Node.js 脚本发送 CDP 命令
        $crashScript = @"
const CDP = require('chrome-remote-interface');
async function crash() {
    const client = await CDP({ port: $debugPort });
    const { Runtime } = client;
    await Runtime.evaluate({ expression: 'process.crash()' });
    await client.close();
}
crash().catch(console.error);
"@
        $crashScript | node
        
        Start-Sleep -Milliseconds 2000
        
        # 验证应用仍在运行
        $stillRunning = Get-Process -Id $process.Id -ErrorAction SilentlyContinue
        $recovered = $stillRunning -ne $null
        
        Write-TestResult -TestName "CR-002: 应用存活" `
            -Passed $recovered `
            -Details $(if ($recovered) { "App restarted renderer" } else { "App terminated" })
    }
}
catch {
    Write-TestResult -TestName "CR-002" -Passed $false -Details $_.Exception.Message
}

# 清理
Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue

# ---------- TEST CR-003: WAL 模式恢复 ----------
Write-Host "`n[TEST CR-003] WAL 模式崩溃恢复" -ForegroundColor Yellow

if (Test-Path $TestDbPath) { Remove-Item $TestDbPath -Force }

# 创建 WAL 模式数据库
& sqlite3 $TestDbPath @"
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT);
BEGIN;
INSERT INTO test_data (value) VALUES ('Transaction 1');
INSERT INTO test_data (value) VALUES ('Transaction 2');
-- 故意不提交，模拟崩溃
"@

# 手动写入 WAL 文件内容
$walFile = "$TestDbPath-wal"
if (Test-Path $walFile) {
    Write-Host "WAL 文件存在，模拟未提交事务"
}

# 启动应用，验证自动恢复
$process = Start-TestApp
Start-Sleep -Milliseconds $WaitTime

# 检查数据库状态 (应该自动回滚未提交事务)
$count = & sqlite3 $TestDbPath "SELECT COUNT(*) FROM test_data;" 2>&1
$recovered = [int]$count -eq 0

Write-TestResult -TestName "CR-003: WAL 自动恢复" `
    -Passed $recovered `
    -Details "Records after recovery: $count"

Stop-Process -Id $process.Id -Force

# ---------- TEST CR-004: 自动备份恢复 ----------
Write-Host "`n[TEST CR-004] 自动备份恢复" -ForegroundColor Yellow

if (Test-Path $TestDbPath) { Remove-Item $TestDbPath -Force }
$backupPath = "$TestDbPath.backup"

# 创建数据库和备份
& sqlite3 $TestDbPath @"
CREATE TABLE important_data (id INTEGER PRIMARY KEY, content TEXT);
INSERT INTO important_data (content) VALUES ('Critical data');
"@

# 模拟备份机制
Copy-Item $TestDbPath $backupPath -Force

# 破坏原数据库
"CORRUPTED" | Out-File -FilePath $TestDbPath -Force

# 启动应用，验证从备份恢复
$process = Start-TestApp
Start-Sleep -Milliseconds $WaitTime

# 检查是否从备份恢复
$content = & sqlite3 $TestDbPath "SELECT content FROM important_data;" 2>&1
$recovered = $content -eq "Critical data"

Write-TestResult -TestName "CR-004: 备份恢复" `
    -Passed $recovered `
    -Details "Content recovered: $content"

Stop-Process -Id $process.Id -Force

# ============================================================
# 测试报告
# ============================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "测试报告" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

$passed = ($TestResults | Where-Object { $_.Passed }).Count
$failed = ($TestResults | Where-Object { -not $_.Passed }).Count

Write-Host "总测试数: $($TestResults.Count)" -ForegroundColor White
Write-Host "通过: $passed" -ForegroundColor Green
Write-Host "失败: $failed" -ForegroundColor Red

# 输出 JSON 报告
$reportPath = ".\crash-test-report.json"
$TestResults | ConvertTo-Json -Depth 3 | Out-File $reportPath
Write-Host "`n详细报告已保存: $reportPath"

# 清理
if (Test-Path $TestDbPath) { Remove-Item $TestDbPath -Force }
if (Test-Path $backupPath) { Remove-Item $backupPath -Force }

exit $failed
```

### 3.3 Bash 版本 (macOS/Linux)

```bash
#!/bin/bash
# tests/crash-recovery/crash-recovery-test.sh
# 桌面应用崩溃恢复测试脚本 (Bash)

set -e

ELECTRON_PATH="${ELECTRON_PATH:-./node_modules/.bin/electron}"
APP_PATH="${APP_PATH:-.}"
TEST_DB_PATH="./test-crash.db"
WAIT_TIME=3000

PASSED=0
FAILED=0

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

log_pass() {
    echo -e "${GREEN}✅ PASS${NC} $1"
    ((PASSED++))
}

log_fail() {
    echo -e "${RED}❌ FAIL${NC} $1"
    ((FAILED++))
}

log_info() {
    echo -e "${CYAN}$1${NC}"
}

# 启动应用
start_app() {
    SQLITE_PATH="$TEST_DB_PATH" CRASH_TEST_MODE="true" \
        "$ELECTRON_PATH" "$APP_PATH" "$@" &
    echo $!
}

# 测试 SQLite 完整性
test_sqlite_integrity() {
    if [ ! -f "$TEST_DB_PATH" ]; then
        echo "Database not found"
        return 1
    fi
    
    result=$(sqlite3 "$TEST_DB_PATH" "PRAGMA integrity_check;" 2>&1)
    if [ "$result" = "ok" ]; then
        return 0
    else
        echo "$result"
        return 1
    fi
}

# ============ 主测试流程 ============

log_info "========================================"
log_info "Electron 崩溃恢复测试套件"
log_info "========================================"

# CR-001: SIGKILL 测试
log_info "\n[TEST CR-001] SIGKILL 后数据完整性"

# 清理
rm -f "$TEST_DB_PATH" "$TEST_DB_PATH-wal" "$TEST_DB_PATH-shm"

# 启动应用
PID=$(start_app)
log_info "应用已启动, PID: $PID"
sleep 3

# 创建测试数据
sqlite3 "$TEST_DB_PATH" <<EOF
CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE IF NOT EXISTS undo_stack (id INTEGER PRIMARY KEY, operation TEXT);
INSERT INTO projects (name) VALUES ('Before Crash');
INSERT INTO undo_stack (operation) VALUES ('INSERT');
PRAGMA wal_checkpoint(TRUNCATE);
EOF

log_info "已写入测试数据"

# 强制终止
kill -9 $PID 2>/dev/null || true
log_info "进程已强制终止 (SIGKILL)"
sleep 1

# 验证完整性
if test_sqlite_integrity; then
    log_pass "CR-001: SQLite 完整性"
else
    log_fail "CR-001: SQLite 完整性"
fi

# 验证数据
undo_count=$(sqlite3 "$TEST_DB_PATH" "SELECT COUNT(*) FROM undo_stack;" 2>/dev/null || echo "0")
if [ "$undo_count" -gt 0 ]; then
    log_pass "CR-001: Undo 栈恢复 (count: $undo_count)"
else
    log_fail "CR-001: Undo 栈恢复"
fi

# CR-002: 优雅关闭测试
log_info "\n[TEST CR-002] 优雅关闭"

rm -f "$TEST_DB_PATH"
PID=$(start_app)
sleep 3

sqlite3 "$TEST_DB_PATH" "CREATE TABLE graceful_test (id INTEGER);"

# 优雅关闭
kill -TERM $PID 2>/dev/null
wait $PID 2>/dev/null || true
sleep 1

if test_sqlite_integrity; then
    log_pass "CR-002: 优雅关闭数据完整性"
else
    log_fail "CR-002: 优雅关闭数据完整性"
fi

# 报告
log_info "\n========================================"
log_info "测试报告"
log_info "========================================"
echo -e "总测试数: $((PASSED + FAILED))"
echo -e "通过: ${GREEN}$PASSED${NC}"
echo -e "失败: ${RED}$FAILED${NC}"

# 清理
rm -f "$TEST_DB_PATH" "$TEST_DB_PATH-wal" "$TEST_DB_PATH-shm"

exit $FAILED
```

---

## 4. 性能基准测试规范

### 4.1 性能测试矩阵

| 测试项 | 阈值 | 测试方法 | 测试数据 |
|--------|------|----------|----------|
| **Monaco Editor 初始化** | < 2s | Lighthouse + 自定义计时 | 空编辑器、带语法高亮 |
| **Monaco 大文件加载(1MB)** | < 1s | `performance.now()` | 1MB TypeScript 文件 |
| **Monaco 大文件加载(10MB)** | < 3s | `performance.now()` | 10MB JSON 文件 |
| **Monaco 大文件加载(100MB)** | < 10s | `performance.now()` | 100MB 日志文件 |
| **Worker 通信延迟** | < 50ms | 往返 ping 测试 | 10KB 数据包 |
| **Worker 大数据传输** | < 500ms | Transferable Objects | 10MB ArrayBuffer |
| **SQLite 查询(单条)** | < 10ms | `console.time()` | 1万条记录表 |
| **SQLite 批量插入(1000条)** | < 500ms | 事务计时 | 批量插入 |
| **文件打开(标准)** | < 100ms | E2E 计时 | 10KB 文件 |
| **文件打开(大文件)** | < 3s | E2E 计时 | 100MB 文件 |
| **Undo 操作** | < 100ms | 操作计时 | 单次撤销 |
| **Redo 操作** | < 100ms | 操作计时 | 单次重做 |
| **搜索索引构建** | < 5s | 全文索引计时 | 100个文件 |
| **项目加载** | < 2s | 冷启动计时 | 中型项目 |

### 4.2 性能测试实现

```typescript
// tests/performance/desktop-performance.spec.ts
import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// 性能阈值配置
const THRESHOLDS = {
  monacoInit: 2000,      // 2s
  monaco1MB: 1000,       // 1s
  monaco10MB: 3000,      // 3s
  monaco100MB: 10000,    // 10s
  workerLatency: 50,     // 50ms
  workerTransfer: 500,   // 500ms
  sqliteQuery: 10,       // 10ms
  sqliteBatch: 500,      // 500ms
  undoOperation: 100,    // 100ms
  fileOpenStandard: 100, // 100ms
  fileOpenLarge: 3000,   // 3s
};

// 测试数据生成器
function generateTestFile(sizeMB: number, type: 'text' | 'json' | 'code'): string {
  const sizeBytes = sizeMB * 1024 * 1024;
  const tempDir = path.join(__dirname, '../fixtures/temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  
  const filePath = path.join(tempDir, `test-${sizeMB}mb.${type}`);
  
  if (type === 'json') {
    // 生成大型 JSON
    const obj = { data: [] as any[] };
    const entrySize = 100; // 每个条目约100字节
    const count = Math.floor(sizeBytes / entrySize);
    for (let i = 0; i < count; i++) {
      obj.data.push({ id: i, value: 'x'.repeat(50), timestamp: Date.now() });
    }
    fs.writeFileSync(filePath, JSON.stringify(obj));
  } else if (type === 'code') {
    // 生成 TypeScript 代码
    const lines = Math.floor(sizeBytes / 50); // 每行约50字节
    const content = Array.from({ length: lines }, (_, i) => 
      `function func${i}(): number { return ${i}; }`
    ).join('\n');
    fs.writeFileSync(filePath, content);
  } else {
    // 纯文本
    fs.writeFileSync(filePath, 'x'.repeat(sizeBytes));
  }
  
  return filePath;
}

test.describe('桌面应用性能基准测试', () => {
  test.describe('Monaco Editor 性能', () => {
    test(`PERF-001: Monaco 初始化 < ${THRESHOLDS.monacoInit}ms`, async ({ page }) => {
      await page.goto('http://localhost:3000/editor');
      
      const initTime = await page.evaluate(async () => {
        const start = performance.now();
        await (window as any).monacoEditorReady;
        return performance.now() - start;
      });
      
      expect(initTime).toBeLessThan(THRESHOLDS.monacoInit);
      console.log(`Monaco 初始化时间: ${initTime.toFixed(2)}ms`);
    });

    test(`PERF-002: 1MB 文件加载 < ${THRESHOLDS.monaco1MB}ms`, async ({ page }) => {
      const testFile = generateTestFile(1, 'code');
      
      await page.goto('http://localhost:3000/editor');
      
      const loadTime = await page.evaluate(async (fileContent) => {
        const start = performance.now();
        const editor = (window as any).monaco.editor;
        const model = editor.createModel(fileContent, 'typescript');
        (window as any).editor.setModel(model);
        await (window as any).editorInitialized;
        return performance.now() - start;
      }, fs.readFileSync(testFile, 'utf-8'));
      
      expect(loadTime).toBeLessThan(THRESHOLDS.monaco1MB);
      console.log(`1MB 文件加载时间: ${loadTime.toFixed(2)}ms`);
      
      fs.unlinkSync(testFile);
    });

    test(`PERF-003: 10MB JSON 文件加载 < ${THRESHOLDS.monaco10MB}ms`, async ({ page }) => {
      const testFile = generateTestFile(10, 'json');
      const content = fs.readFileSync(testFile, 'utf-8');
      
      await page.goto('http://localhost:3000/editor');
      
      const loadTime = await page.evaluate(async (fileContent) => {
        const start = performance.now();
        const editor = (window as any).monaco.editor;
        
        // 使用 Web Worker 解析大 JSON
        const model = editor.createModel(
          fileContent.substring(0, 100000), // 截断显示
          'json'
        );
        (window as any).editor.setModel(model);
        
        return performance.now() - start;
      }, content);
      
      expect(loadTime).toBeLessThan(THRESHOLDS.monaco10MB);
      console.log(`10MB JSON 加载时间: ${loadTime.toFixed(2)}ms`);
      
      fs.unlinkSync(testFile);
    });

    test(`PERF-004: Undo 操作延迟 < ${THRESHOLDS.undoOperation}ms`, async ({ page }) => {
      await page.goto('http://localhost:3000/editor');
      
      // 模拟编辑操作
      await page.click('[data-testid="editor"]');
      await page.keyboard.type('Hello World');
      await page.waitForTimeout(100);
      
      // 测量 Undo 延迟
      const undoTime = await page.evaluate(async () => {
        const editor = (window as any).editor;
        const start = performance.now();
        editor.trigger('keyboard', 'undo', null);
        // 等待微任务完成
        await new Promise(resolve => setTimeout(resolve, 0));
        return performance.now() - start;
      });
      
      expect(undoTime).toBeLessThan(THRESHOLDS.undoOperation);
      console.log(`Undo 操作延迟: ${undoTime.toFixed(2)}ms`);
    });
  });

  test.describe('Worker 线程性能', () => {
    test(`PERF-005: Worker 通信延迟 < ${THRESHOLDS.workerLatency}ms`, async ({ page }) => {
      await page.goto('http://localhost:3000/editor');
      
      const latency = await page.evaluate(async () => {
        const worker = new Worker('./analysis-worker.js');
        
        return new Promise<number>((resolve) => {
          const start = performance.now();
          worker.postMessage({ type: 'ping', data: 'test' });
          
          worker.onmessage = () => {
            resolve(performance.now() - start);
          };
        });
      });
      
      expect(latency).toBeLessThan(THRESHOLDS.workerLatency);
      console.log(`Worker 通信延迟: ${latency.toFixed(2)}ms`);
    });

    test(`PERF-006: Worker 大数据传输 < ${THRESHOLDS.workerTransfer}ms`, async ({ page }) => {
      const dataSize = 10 * 1024 * 1024; // 10MB
      
      await page.goto('http://localhost:3000/editor');
      
      const transferTime = await page.evaluate(async (size) => {
        const buffer = new ArrayBuffer(size);
        const worker = new Worker('./analysis-worker.js');
        
        return new Promise<number>((resolve) => {
          const start = performance.now();
          // 使用 Transferable Objects 避免复制
          worker.postMessage({ type: 'analyze', data: buffer }, [buffer]);
          
          worker.onmessage = () => {
            resolve(performance.now() - start);
          };
        });
      }, dataSize);
      
      expect(transferTime).toBeLessThan(THRESHOLDS.workerTransfer);
      console.log(`Worker 10MB 数据传输: ${transferTime.toFixed(2)}ms`);
    });
  });

  test.describe('SQLite 数据库性能', () => {
    test(`PERF-007: 单条查询 < ${THRESHOLDS.sqliteQuery}ms`, async ({ page }) => {
      await page.goto('http://localhost:3000/editor');
      
      // 初始化测试数据
      await page.evaluate(async () => {
        const db = (window as any).electronAPI.db;
        await db.exec(`
          CREATE TABLE IF NOT EXISTS perf_test (id INTEGER PRIMARY KEY, data TEXT);
          INSERT INTO perf_test SELECT i, 'data' || i FROM generate_series(1, 10000) AS t(i);
        `);
      });
      
      const queryTime = await page.evaluate(async () => {
        const db = (window as any).electronAPI.db;
        const start = performance.now();
        const result = await db.query('SELECT * FROM perf_test WHERE id = 5000');
        return { time: performance.now() - start, result };
      });
      
      expect(queryTime.time).toBeLessThan(THRESHOLDS.sqliteQuery);
      console.log(`SQLite 单条查询: ${queryTime.time.toFixed(2)}ms`);
    });

    test(`PERF-008: 批量插入 1000 条 < ${THRESHOLDS.sqliteBatch}ms`, async ({ page }) => {
      await page.goto('http://localhost:3000/editor');
      
      const batchTime = await page.evaluate(async () => {
        const db = (window as any).electronAPI.db;
        const data = Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `item_${i}`,
          value: Math.random(),
        }));
        
        const start = performance.now();
        await db.transaction(async (trx) => {
          for (const item of data) {
            await trx.run(
              'INSERT INTO perf_test (id, data) VALUES (?, ?)',
              [item.id, JSON.stringify(item)]
            );
          }
        });
        return performance.now() - start;
      });
      
      expect(batchTime).toBeLessThan(THRESHOLDS.sqliteBatch);
      console.log(`SQLite 批量插入 1000 条: ${batchTime.toFixed(2)}ms`);
    });
  });

  test.describe('文件系统操作性能', () => {
    test(`PERF-009: 标准文件打开 < ${THRESHOLDS.fileOpenStandard}ms`, async ({ page }) => {
      const testFile = generateTestFile(0.01, 'text'); // 10KB
      
      await page.goto('http://localhost:3000/editor');
      
      const openTime = await page.evaluate(async (filePath) => {
        const start = performance.now();
        await (window as any).electronAPI.openFile(filePath);
        return performance.now() - start;
      }, testFile);
      
      expect(openTime).toBeLessThan(THRESHOLDS.fileOpenStandard);
      console.log(`10KB 文件打开: ${openTime.toFixed(2)}ms`);
      
      fs.unlinkSync(testFile);
    });

    test(`PERF-010: 100MB 大文件打开 < ${THRESHOLDS.fileOpenLarge}ms`, async ({ page }) => {
      test.setTimeout(30000); // 30s timeout for large file
      
      const testFile = generateTestFile(100, 'text');
      
      await page.goto('http://localhost:3000/editor');
      
      const openTime = await page.evaluate(async (filePath) => {
        const start = performance.now();
        // 使用流式读取
        await (window as any).electronAPI.openLargeFile(filePath);
        return performance.now() - start;
      }, testFile);
      
      expect(openTime).toBeLessThan(THRESHOLDS.fileOpenLarge);
      console.log(`100MB 大文件打开: ${openTime.toFixed(2)}ms`);
      
      fs.unlinkSync(testFile);
    });
  });
});
```

---

## 5. 测试代码模板

### 5.1 Electron 主进程单元测试模板

```typescript
// tests/unit/electron/main-process-template.test.ts
/**
 * Electron 主进程单元测试模板
 * 
 * 测试范围:
 * - IPC Handler 逻辑
 * - 窗口管理
 * - 原生模块调用
 */

import { jest } from '@jest/globals';

// ==================== Mock 配置 ====================

// Mock Electron 模块
jest.mock('electron', () => ({
  app: {
    on: jest.fn(),
    quit: jest.fn(),
    getPath: jest.fn((name) => `/mock/${name}`),
    getVersion: jest.fn(() => '1.0.0'),
    isReady: jest.fn(() => true),
    whenReady: jest.fn(() => Promise.resolve()),
  },
  BrowserWindow: jest.fn().mockImplementation(() => ({
    loadURL: jest.fn(),
    loadFile: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    webContents: {
      send: jest.fn(),
      on: jest.fn(),
      executeJavaScript: jest.fn(),
      isLoading: jest.fn(() => false),
    },
    close: jest.fn(),
    show: jest.fn(),
    hide: jest.fn(),
    focus: jest.fn(),
    isDestroyed: jest.fn(() => false),
    id: Math.random().toString(36).substring(7),
  })),
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
    removeHandler: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  dialog: {
    showOpenDialog: jest.fn(),
    showSaveDialog: jest.fn(),
    showMessageBox: jest.fn(),
  },
  Menu: {
    buildFromTemplate: jest.fn(() => ({
      popup: jest.fn(),
      append: jest.fn(),
    })),
    setApplicationMenu: jest.fn(),
  },
  Tray: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    setContextMenu: jest.fn(),
    setToolTip: jest.fn(),
  })),
  nativeTheme: {
    on: jest.fn(),
    shouldUseDarkColors: true,
  },
}));

// Mock Node.js 内置模块
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    access: jest.fn(),
    stat: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
  },
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('path', () => ({
  ...jest.requireActual('path'),
  join: jest.fn((...args) => args.join('/')),
  resolve: jest.fn((...args) => args.join('/')),
}));

// ==================== 测试套件 ====================

describe('Electron 主进程测试模板', () => {
  let mockWindow: any;
  let ipcHandlers: Map<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();
    ipcHandlers = new Map();

    // 捕获 IPC Handler 注册
    const { ipcMain } = require('electron');
    (ipcMain.handle as jest.Mock).mockImplementation((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    });
    (ipcMain.on as jest.Mock).mockImplementation((channel: string, handler: Function) => {
      ipcHandlers.set(channel, handler);
    });

    // 创建 mock 窗口
    const { BrowserWindow } = require('electron');
    mockWindow = new BrowserWindow();
  });

  describe('IPC Handler 测试', () => {
    test('应该正确处理文件打开请求', async () => {
      const { dialog } = require('electron');
      const mockFilePath = '/test/project/package.json';
      
      (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
        canceled: false,
        filePaths: [mockFilePath],
      });

      // 模拟注册 IPC Handler
      const { ipcMain } = require('electron');
      ipcMain.handle('dialog:openFile', async () => {
        const result = await dialog.showOpenDialog({
          properties: ['openFile'],
          filters: [{ name: 'JSON', extensions: ['json'] }],
        });
        return result.canceled ? null : result.filePaths[0];
      });

      // 调用 Handler
      const handler = ipcHandlers.get('dialog:openFile');
      const result = await handler?.({} as any);

      expect(result).toBe(mockFilePath);
      expect(dialog.showOpenDialog).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: ['openFile'],
        })
      );
    });

    test('应该处理取消对话框的情况', async () => {
      const { dialog } = require('electron');
      
      (dialog.showOpenDialog as jest.Mock).mockResolvedValue({
        canceled: true,
        filePaths: [],
      });

      const { ipcMain } = require('electron');
      ipcMain.handle('dialog:openFile', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openFile'] });
        return result.canceled ? null : result.filePaths[0];
      });

      const handler = ipcHandlers.get('dialog:openFile');
      const result = await handler?.({} as any);

      expect(result).toBeNull();
    });

    test('应该处理文件读取错误', async () => {
      const fs = require('fs').promises;
      (fs.readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));

      const { ipcMain } = require('electron');
      ipcMain.handle('file:read', async (_event, filePath: string) => {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          return { success: true, content };
        } catch (error) {
          return { success: false, error: (error as Error).message };
        }
      });

      const handler = ipcHandlers.get('file:read');
      const result = await handler?.({} as any, '/nonexistent/file.txt');

      expect(result.success).toBe(false);
      expect(result.error).toBe('ENOENT');
    });
  });

  describe('窗口管理测试', () => {
    test('应该正确创建主窗口', () => {
      const { BrowserWindow } = require('electron');
      
      const window = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          preload: '/preload.js',
        },
      });

      expect(BrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          width: 1200,
          height: 800,
        })
      );
      expect(window.loadURL).toHaveBeenCalled();
    });

    test('应该在所有窗口关闭时退出应用', () => {
      const { app, BrowserWindow } = require('electron');
      
      // 获取注册的 app.on('window-all-closed') 回调
      const windowAllClosedHandler = (app.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'window-all-closed'
      )?.[1];

      expect(windowAllClosedHandler).toBeDefined();

      // 模拟窗口全部关闭
      (BrowserWindow.getAllWindows as jest.Mock) = jest.fn(() => []);
      windowAllClosedHandler?.();

      expect(app.quit).toHaveBeenCalled();
    });

    test('应该向所有窗口广播消息', () => {
      const { BrowserWindow } = require('electron');
      const mockWindows = [
        { webContents: { send: jest.fn() }, isDestroyed: () => false },
        { webContents: { send: jest.fn() }, isDestroyed: () => false },
        { webContents: { send: jest.fn() }, isDestroyed: () => true }, // 已销毁
      ];
      
      (BrowserWindow.getAllWindows as jest.Mock) = jest.fn(() => mockWindows);

      // 广播函数
      function broadcast(channel: string, ...args: any[]) {
        BrowserWindow.getAllWindows().forEach((win: any) => {
          if (!win.isDestroyed()) {
            win.webContents.send(channel, ...args);
          }
        });
      }

      broadcast('app:notification', { title: 'Test' });

      expect(mockWindows[0].webContents.send).toHaveBeenCalledWith(
        'app:notification',
        { title: 'Test' }
      );
      expect(mockWindows[1].webContents.send).toHaveBeenCalled();
      expect(mockWindows[2].webContents.send).not.toHaveBeenCalled();
    });
  });

  describe('应用生命周期测试', () => {
    test('应该在应用就绪时初始化', async () => {
      const { app } = require('electron');
      const initFn = jest.fn();

      // 模拟 app.whenReady()
      (app.whenReady as jest.Mock).mockResolvedValue(undefined);

      await app.whenReady().then(initFn);
      expect(initFn).toHaveBeenCalled();
    });

    test('应该处理应用激活事件(重新打开窗口)', () => {
      const { app, BrowserWindow } = require('electron');
      
      const activateHandler = (app.on as jest.Mock).mock.calls.find(
        ([event]) => event === 'activate'
      )?.[1];

      // 模拟没有窗口时激活
      (BrowserWindow.getAllWindows as jest.Mock) = jest.fn(() => []);
      const createWindow = jest.fn();

      activateHandler?.({}, { wasOpenedAsHidden: false });
      
      // 应该创建新窗口
      expect(BrowserWindow).toHaveBeenCalled();
    });
  });
});
```

### 5.2 IPC 通信 Mock 策略

```typescript
// tests/mocks/electron-mock.ts
/**
 * Electron IPC Mock 工厂
 * 提供完整的 IPC 通信模拟环境
 */

import { jest } from '@jest/globals';

export interface IPCMockOptions {
  /** 模拟延迟(ms) */
  delay?: number;
  /** 是否模拟错误 */
  shouldFail?: boolean;
  /** 错误概率(0-1) */
  errorRate?: number;
}

export class IPCMockFactory {
  private handlers: Map<string, Function> = new Map();
  private listeners: Map<string, Set<Function>> = new Map();
  private options: IPCMockOptions;

  constructor(options: IPCMockOptions = {}) {
    this.options = {
      delay: 0,
      shouldFail: false,
      errorRate: 0,
      ...options,
    };
  }

  /**
   * 注册 IPC Handler (invoke/handle 模式)
   */
  registerHandler(channel: string, handler: Function) {
    this.handlers.set(channel, handler);
    return this;
  }

  /**
   * 模拟调用 IPC Handler
   */
  async invoke(channel: string, ...args: any[]): Promise<any> {
    const handler = this.handlers.get(channel);
    
    if (!handler) {
      throw new Error(`No handler registered for channel: ${channel}`);
    }

    // 模拟延迟
    if (this.options.delay) {
      await new Promise(resolve => setTimeout(resolve, this.options.delay));
    }

    // 模拟随机错误
    if (this.options.shouldFail || Math.random() < (this.options.errorRate || 0)) {
      throw new Error(`Mock IPC error for channel: ${channel}`);
    }

    return handler(...args);
  }

  /**
   * 注册事件监听器 (on/send 模式)
   */
  on(channel: string, listener: Function) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);
    
    // 返回取消订阅函数
    return () => this.off(channel, listener);
  }

  off(channel: string, listener: Function) {
    this.listeners.get(channel)?.delete(listener);
  }

  /**
   * 发送事件到监听器
   */
  emit(channel: string, ...args: any[]) {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in IPC listener for ${channel}:`, error);
        }
      });
    }
  }

  /**
   * 创建 Mock Electron API 对象
   */
  createRendererAPI() {
    return {
      invoke: (channel: string, ...args: any[]) => this.invoke(channel, ...args),
      send: (channel: string, ...args: any[]) => this.emit(channel, ...args),
      on: (channel: string, listener: Function) => this.on(channel, listener),
      once: (channel: string, listener: Function) => {
        const wrapped = (...args: any[]) => {
          this.off(channel, wrapped);
          listener(...args);
        };
        return this.on(channel, wrapped);
      },
      removeAllListeners: (channel?: string) => {
        if (channel) {
          this.listeners.delete(channel);
        } else {
          this.listeners.clear();
        }
      },
    };
  }

  /**
   * 创建 Mock 主进程 IPC
   */
  createMainAPI() {
    return {
      handle: (channel: string, handler: Function) => {
        this.registerHandler(channel, handler);
      },
      on: (channel: string, handler: Function) => {
        this.on(channel, handler);
      },
      removeHandler: (channel: string) => {
        this.handlers.delete(channel);
      },
    };
  }

  /**
   * 清理所有注册
   */
  reset() {
    this.handlers.clear();
    this.listeners.clear();
  }
}

// ==================== 预配置 Mock ====================

/**
 * 快速创建标准 Electron Mock
 */
export function createStandardElectronMock() {
  const ipcMock = new IPCMockFactory({ delay: 10 });

  // 预注册常用 Handler
  ipcMock
    .registerHandler('app:getVersion', () => '1.0.0-test')
    .registerHandler('app:getPath', (name: string) => `/mock/${name}`)
    .registerHandler('dialog:openFile', async () => ({
      canceled: false,
      filePaths: ['/mock/test-file.txt'],
    }))
    .registerHandler('dialog:saveFile', async () => ({
      canceled: false,
      filePath: '/mock/saved-file.txt',
    }))
    .registerHandler('file:read', async (filePath: string) => ({
      success: true,
      content: `Mock content of ${filePath}`,
    }))
    .registerHandler('file:write', async () => ({ success: true }))
    .registerHandler('db:query', async (sql: string, params: any[]) => ({
      rows: [],
      changes: 0,
    }))
    .registerHandler('window:minimize', () => {})
    .registerHandler('window:maximize', () => {})
    .registerHandler('window:close', () => {});

  return ipcMock;
}

// ==================== Jest 全局 Mock ====================

/**
 * 在 Jest 测试中使用
 */
export function setupElectronMock() {
  const ipcMock = createStandardElectronMock();

  Object.defineProperty(global, 'electronAPI', {
    value: ipcMock.createRendererAPI(),
    writable: true,
  });

  return ipcMock;
}
```

### 5.3 文件系统操作 Mock

```typescript
// tests/mocks/fs-mock.ts
/**
 * 文件系统操作 Mock
 * 提供虚拟文件系统环境，支持权限模拟、延迟模拟
 */

import { jest } from '@jest/globals';

export interface VirtualFile {
  content: string | Buffer;
  mode: number;
  mtime: Date;
  isDirectory: boolean;
}

export class VirtualFileSystem {
  private files: Map<string, VirtualFile> = new Map();
  private permissions: Map<string, number> = new Map();

  /**
   * 创建文件
   */
  createFile(
    path: string,
    content: string | Buffer = '',
    options: { mode?: number; isDirectory?: boolean } = {}
  ) {
    this.files.set(this.normalizePath(path), {
      content,
      mode: options.mode || 0o644,
      mtime: new Date(),
      isDirectory: options.isDirectory || false,
    });
    return this;
  }

  /**
   * 创建目录
   */
  createDirectory(path: string, mode: number = 0o755) {
    return this.createFile(path, '', { mode, isDirectory: true });
  }

  /**
   * 删除文件/目录
   */
  delete(path: string) {
    const normalized = this.normalizePath(path);
    this.files.delete(normalized);
    
    // 同时删除子项
    for (const [key] of this.files) {
      if (key.startsWith(normalized + '/')) {
        this.files.delete(key);
      }
    }
    return this;
  }

  /**
   * 设置权限
   */
  setPermission(path: string, mode: number) {
    this.permissions.set(this.normalizePath(path), mode);
    return this;
  }

  /**
   * 获取文件
   */
  getFile(path: string): VirtualFile | undefined {
    return this.files.get(this.normalizePath(path));
  }

  /**
   * 检查存在性
   */
  exists(path: string): boolean {
    return this.files.has(this.normalizePath(path));
  }

  /**
   * 读取目录
   */
  readdir(path: string): string[] {
    const normalized = this.normalizePath(path);
    const entries: string[] = [];
    
    for (const [key, file] of this.files) {
      if (key.startsWith(normalized + '/') || key === normalized) {
        const relative = key.slice(normalized.length + 1);
        if (relative && !relative.includes('/')) {
          entries.push(relative);
        }
      }
    }
    
    return entries;
  }

  /**
   * 检查权限
   */
  checkPermission(path: string, requiredMode: number): boolean {
    const file = this.getFile(path);
    if (!file) return false;
    
    const permission = this.permissions.get(this.normalizePath(path));
    if (permission !== undefined) {
      return (permission & requiredMode) === requiredMode;
    }
    
    return true; // 默认允许
  }

  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/$/, '') || '/';
  }

  /**
   * 生成 Jest Mock 函数
   */
  createMocks() {
    const vfs = this;

    return {
      readFileSync: jest.fn((path: string, options?: { encoding?: string }) => {
        const file = vfs.getFile(path);
        if (!file) {
          throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        }
        if (file.isDirectory) {
          throw new Error(`EISDIR: illegal operation on a directory, read '${path}'`);
        }
        
        if (options?.encoding === 'utf-8' || options?.encoding === 'utf8') {
          return file.content.toString();
        }
        return Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content);
      }),

      writeFileSync: jest.fn((path: string, data: string | Buffer) => {
        if (!vfs.checkPermission(path, 0o200)) {
          throw new Error(`EACCES: permission denied, open '${path}'`);
        }
        vfs.createFile(path, data);
      }),

      existsSync: jest.fn((path: string) => vfs.exists(path)),

      mkdirSync: jest.fn((path: string, options?: { recursive?: boolean }) => {
        if (vfs.exists(path) && !options?.recursive) {
          throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
        }
        vfs.createDirectory(path);
      }),

      readdirSync: jest.fn((path: string) => vfs.readdir(path)),

      statSync: jest.fn((path: string) => {
        const file = vfs.getFile(path);
        if (!file) {
          throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
        }
        
        return {
          isFile: () => !file.isDirectory,
          isDirectory: () => file.isDirectory,
          size: Buffer.isBuffer(file.content) ? file.content.length : file.content.length,
          mtime: file.mtime,
          mode: file.mode,
        };
      }),

      unlinkSync: jest.fn((path: string) => {
        if (!vfs.exists(path)) {
          throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
        }
        vfs.delete(path);
      }),

      rmdirSync: jest.fn((path: string) => {
        if (!vfs.exists(path)) {
          throw new Error(`ENOENT: no such file or directory, rmdir '${path}'`);
        }
        const entries = vfs.readdir(path);
        if (entries.length > 0) {
          throw new Error(`ENOTEMPTY: directory not empty, rmdir '${path}'`);
        }
        vfs.delete(path);
      }),

      promises: {
        readFile: jest.fn(async (path: string, encoding?: string) => {
          await new Promise(resolve => setTimeout(resolve, 1)); // 模拟异步
          const file = vfs.getFile(path);
          if (!file) {
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
          }
          return encoding ? file.content.toString() : file.content;
        }),

        writeFile: jest.fn(async (path: string, data: string | Buffer) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          vfs.createFile(path, data);
        }),

        access: jest.fn(async (path: string, mode?: number) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          if (!vfs.exists(path)) {
            throw new Error(`ENOENT: no such file or directory, access '${path}'`);
          }
          if (mode && !vfs.checkPermission(path, mode)) {
            throw new Error(`EACCES: permission denied, access '${path}'`);
          }
        }),

        stat: jest.fn(async (path: string) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          const file = vfs.getFile(path);
          if (!file) {
            throw new Error(`ENOENT: no such file or directory, stat '${path}'`);
          }
          return {
            isFile: () => !file.isDirectory,
            isDirectory: () => file.isDirectory,
            size: Buffer.isBuffer(file.content) ? file.content.length : file.content.length,
            mtime: file.mtime,
          };
        }),

        readdir: jest.fn(async (path: string) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          return vfs.readdir(path);
        }),

        mkdir: jest.fn(async (path: string, options?: { recursive?: boolean }) => {
          await new Promise(resolve => setTimeout(resolve, 1));
          if (vfs.exists(path) && !options?.recursive) {
            throw new Error(`EEXIST: file already exists, mkdir '${path}'`);
          }
          vfs.createDirectory(path);
        }),
      },
    };
  }
}

// ==================== 使用示例 ====================

/**
 * 在测试中配置虚拟文件系统
 */
export function setupVirtualFS() {
  const vfs = new VirtualFileSystem();
  const mocks = vfs.createMocks();

  jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    ...mocks,
  }));

  return vfs;
}
```

---

## 6. CI/CD 配置

### 6.1 GitHub Actions 配置

```yaml
# .github/workflows/desktop-test.yml
name: Desktop App Test Suite

on:
  push:
    branches: [main, develop]
    paths:
      - 'src/**'
      - 'tests/**'
      - 'package.json'
      - 'electron/**'
  pull_request:
    branches: [main]

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  # ============================================================
  # 单元测试和集成测试
  # ============================================================
  unit-tests:
    name: Unit & Integration Tests
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [18.x, 20.x]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run linter
        run: npm run lint

      - name: Run type check
        run: npm run type-check

      - name: Run unit tests
        run: npm run test:unit -- --coverage
        env:
          CI: true

      - name: Run integration tests
        run: npm run test:integration
        env:
          CI: true

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: unittests
          name: codecov-umbrella

  # ============================================================
  # E2E 测试 (多平台)
  # ============================================================
  e2e-tests:
    name: E2E Tests
    runs-on: ${{ matrix.os }}
    
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
        include:
          - os: ubuntu-latest
            platform: linux
          - os: windows-latest
            platform: win32
          - os: macos-latest
            platform: darwin

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      # Linux 需要额外的依赖
      - name: Install Linux dependencies
        if: matrix.os == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libgtk-3-dev \
            libnotify-dev \
            libgconf-2-4 \
            libnss3 \
            libxss1 \
            libasound2 \
            libgbm-dev \
            xvfb

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build:electron

      # Linux E2E 需要 xvfb
      - name: Run E2E tests (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: xvfb-run --auto-servernum --server-args="-screen 0 1280x960x24" npm run test:e2e
        env:
          CI: true
          PLAYWRIGHT_BROWSERS_PATH: 0

      - name: Run E2E tests (Windows/macOS)
        if: matrix.os != 'ubuntu-latest'
        run: npm run test:e2e
        env:
          CI: true
          PLAYWRIGHT_BROWSERS_PATH: 0

      - name: Upload E2E artifacts
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-artifacts-${{ matrix.platform }}
          path: |
            test-results/
            playwright-report/

  # ============================================================
  # 崩溃恢复测试
  # ============================================================
  crash-recovery-tests:
    name: Crash Recovery Tests
    runs-on: ${{ matrix.os }}
    
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install SQLite
        if: matrix.os == 'ubuntu-latest'
        run: sudo apt-get install -y sqlite3

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build:electron

      - name: Run crash recovery tests (Linux)
        if: matrix.os == 'ubuntu-latest'
        run: |
          chmod +x tests/crash-recovery/crash-recovery-test.sh
          ./tests/crash-recovery/crash-recovery-test.sh
        shell: bash

      - name: Run crash recovery tests (Windows)
        if: matrix.os == 'windows-latest'
        run: |
          powershell -ExecutionPolicy Bypass -File tests\crash-recovery\crash-recovery-test.ps1
        shell: pwsh

      - name: Upload crash test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: crash-test-report-${{ matrix.os }}
          path: crash-test-report.json

  # ============================================================
  # 性能基准测试
  # ============================================================
  performance-tests:
    name: Performance Benchmarks
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Run performance tests
        run: xvfb-run --auto-servernum npm run test:performance
        env:
          CI: true

      - name: Upload performance results
        uses: actions/upload-artifact@v4
        with:
          name: performance-results
          path: |
            performance-results.json
            performance-report/

      - name: Check performance regression
        run: |
          npm run perf:compare -- --threshold=10
        continue-on-error: true

  # ============================================================
  # 构建验证
  # ============================================================
  build-verification:
    name: Build Verification
    runs-on: ${{ matrix.os }}
    
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]

    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Build application
        run: npm run build

      - name: Package application
        run: npm run dist -- --publish=never
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.os }}
          path: |
            dist/*.exe
            dist/*.dmg
            dist/*.AppImage
            dist/*.deb

  # ============================================================
  # 测试摘要
  # ============================================================
  test-summary:
    name: Test Summary
    needs: [unit-tests, e2e-tests, crash-recovery-tests, performance-tests]
    runs-on: ubuntu-latest
    if: always()

    steps:
      - name: Generate summary
        run: |
          echo "## 测试结果摘要" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Job | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|-----|--------|" >> $GITHUB_STEP_SUMMARY
          echo "| Unit Tests | ${{ needs.unit-tests.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| E2E Tests | ${{ needs.e2e-tests.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Crash Recovery | ${{ needs.crash-recovery-tests.result }} |" >> $GITHUB_STEP_SUMMARY
          echo "| Performance | ${{ needs.performance-tests.result }} |" >> $GITHUB_STEP_SUMMARY
```

### 6.2 覆盖率门槛配置

```javascript
// jest.coverage.config.js
/** @type {import('jest').Config} */
module.exports = {
  ...require('./jest.config'),
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html', 'json'],
  
  // 覆盖率门槛 - 桌面应用标准
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    // 核心业务模块更严格
    './src/core/**/*.ts': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    // IPC 处理层
    './src/main/ipc/**/*.ts': {
      branches: 85,
      functions: 90,
      lines: 85,
      statements: 85,
    },
    // 数据持久化层
    './src/main/db/**/*.ts': {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
  
  // 排除不需要测试的文件
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/tests/',
    '/dist/',
    '/out/',
    '\.d\.ts$',
    // 生成的代码
    '/src/generated/',
    // 第三方绑定
    '/src/native/bindings/',
  ],
};
```

### 6.3 并行测试策略

```javascript
// scripts/test-runner.js
/**
 * 智能测试运行器
 * 实现测试分片、缓存、并行优化
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 测试类型配置
const TEST_SUITES = {
  unit: {
    pattern: 'tests/unit/**/*.test.ts',
    workers: 4,
    maxWorkers: '50%',
  },
  integration: {
    pattern: 'tests/integration/**/*.test.ts',
    workers: 2,
    maxWorkers: 2,
    setupFiles: ['tests/setup/integration-setup.ts'],
  },
  e2e: {
    pattern: 'tests/e2e/**/*.spec.ts',
    workers: 1, // E2E 必须串行
    maxWorkers: 1,
    globalSetup: 'tests/e2e/global-setup.ts',
    globalTeardown: 'tests/e2e/global-teardown.ts',
  },
  performance: {
    pattern: 'tests/performance/**/*.perf.ts',
    workers: 1,
    testTimeout: 60000,
  },
  crash: {
    pattern: 'tests/crash-recovery/**/*.test.ts',
    workers: 1,
    testTimeout: 120000,
  },
};

// 测试分片计算
function calculateShards(testFiles, totalShards) {
  const shards = Array.from({ length: totalShards }, () => []);
  
  // 按预估执行时间排序（简单按文件名长度估计）
  const sorted = [...testFiles].sort((a, b) => b.length - a.length);
  
  // 轮询分配到各个分片
  sorted.forEach((file, index) => {
    shards[index % totalShards].push(file);
  });
  
  return shards;
}

// 智能缓存检测
function shouldRunTest(testFile, cacheDir = '.test-cache') {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
    return true;
  }
  
  const cacheFile = path.join(cacheDir, `${path.basename(testFile)}.hash`);
  const currentHash = execSync(`git hash-object ${testFile}`).toString().trim();
  
  if (fs.existsSync(cacheFile)) {
    const cachedHash = fs.readFileSync(cacheFile, 'utf-8');
    if (cachedHash === currentHash) {
      console.log(`⏭️  Skipping unchanged test: ${testFile}`);
      return false;
    }
  }
  
  fs.writeFileSync(cacheFile, currentHash);
  return true;
}

// 主运行函数
async function runTests(options = {}) {
  const {
    suite = 'unit',
    shard,
    totalShards,
    ci = process.env.CI === 'true',
    coverage = false,
    cache = true,
  } = options;

  const config = TEST_SUITES[suite];
  if (!config) {
    throw new Error(`Unknown test suite: ${suite}`);
  }

  // 查找测试文件
  const testFiles = execSync(`find tests -name "*.test.ts" -path "*/${suite}/*"`)
    .toString()
    .trim()
    .split('\n')
    .filter(Boolean);

  console.log(`🧪 Found ${testFiles.length} test files for ${suite} suite`);

  // 分片处理
  let filesToRun = testFiles;
  if (totalShards && shard !== undefined) {
    const shards = calculateShards(testFiles, totalShards);
    filesToRun = shards[shard];
    console.log(`📦 Running shard ${shard + 1}/${totalShards} (${filesToRun.length} files)`);
  }

  // 缓存过滤
  if (cache && !ci) {
    filesToRun = filesToRun.filter(f => shouldRunTest(f));
  }

  if (filesToRun.length === 0) {
    console.log('✅ All tests cached, nothing to run');
    return;
  }

  // 构建 Jest 命令
  const args = [
    'jest',
    ...filesToRun,
    `--maxWorkers=${config.maxWorkers}`,
    `--testTimeout=${config.testTimeout || 10000}`,
  ];

  if (config.setupFiles) {
    args.push(`--setupFilesAfterEnv=${config.setupFiles.join(',')}`);
  }
  if (config.globalSetup) {
    args.push(`--globalSetup=${config.globalSetup}`);
  }
  if (config.globalTeardown) {
    args.push(`--globalTeardown=${config.globalTeardown}`);
  }
  if (coverage) {
    args.push('--coverage', '--config=jest.coverage.config.js');
  }
  if (ci) {
    args.push('--ci', '--reporters=default', '--reporters=jest-junit');
  }

  // 执行测试
  console.log(`🏃 Running: ${args.join(' ')}`);
  
  try {
    execSync(args.join(' '), { stdio: 'inherit' });
    console.log(`✅ ${suite} tests passed`);
  } catch (error) {
    console.error(`❌ ${suite} tests failed`);
    process.exit(1);
  }
}

// CLI 处理
const args = require('minimist')(process.argv.slice(2));

runTests({
  suite: args.suite || args.s || 'unit',
  shard: args.shard !== undefined ? parseInt(args.shard) : undefined,
  totalShards: args['total-shards'] !== undefined ? parseInt(args['total-shards']) : undefined,
  ci: args.ci,
  coverage: args.coverage,
  cache: args.cache !== false,
}).catch(error => {
  console.error(error);
  process.exit(1);
});
```

---

## 附录

### A. 测试环境快速启动脚本

```bash
#!/bin/bash
# scripts/setup-test-env.sh
# 一键配置测试环境

echo "🔧 设置 Electron 测试环境..."

# 安装 Playwright 浏览器
npx playwright install chromium

# 安装 Electron
npm install -D electron

# 创建测试目录结构
mkdir -p tests/{e2e/{specs,fixtures,pages},unit,integration,performance,crash-recovery}

# 生成测试数据
mkdir -p tests/fixtures/{files,projects,databases}
dd if=/dev/urandom of=tests/fixtures/files/10mb.bin bs=1M count=10

echo "✅ 测试环境配置完成"
```

### B. 参考资料

| 资源 | 链接 |
|------|------|
| Playwright Electron | https://playwright.dev/docs/api/class-electron |
| Electron Testing Best Practices | https://www.electronjs.org/docs/latest/tutorial/automated-testing |
| Jest Electron Runner | https://github.com/facebook-atom/jest-electron-runner |
| Electron Builder | https://www.electron.build/ |

---

**文档版本**: v1.0.0  
**最后更新**: 2026-02-14  
**维护者**: 测试架构师
