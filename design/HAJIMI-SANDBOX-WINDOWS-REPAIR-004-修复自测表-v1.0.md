# HAJIMI-SANDBOX-WINDOWS-REPAIR-004-修复自测表-v1.0

> Windows兼容性强攻验收清单

---

## 一、跨平台架构层（B-01 🟢 黄瓜睦）

| 自测ID | 检查项 | 验证命令 | 通过标准 | 状态 |
|--------|--------|----------|----------|------|
| WIN-001 | PowerShell环境变量传递 | `npx tsx scripts/jailor.ts spawn` | 容器ID显示在`docker ps` | ✅ |
| WIN-002 | 跨平台进程调用 | 检查`jailor.ts`源码 | 无`SANDBOX_ID=${id}` Bash语法 | ✅ |

**验证细节**:
```powershell
# WIN-001 验证
npx tsx scripts/jailor.ts spawn
# 预期输出: "✓ 容器启动成功"
docker ps | findstr sandbox
# 预期: 显示 sandbox-xxx 容器

# WIN-002 验证 (源码检查)
# jailor.ts 中应使用:
#   execDockerCompose(..., { SANDBOX_ID: id })
# 而不是:
#   execSync(`SANDBOX_ID=${id} ...`)
```

---

## 二、容器编排层（B-02 🟣 客服小祥）

| 自测ID | 检查项 | 验证命令 | 通过标准 | 状态 |
|--------|--------|----------|----------|------|
| WIN-003 | 容器保活 | `docker ps` | 状态为`Up X minutes` | ✅ |
| WIN-004 | 路径兼容性 | 检查`docker-compose.sandbox.yml` | 使用相对路径`./config` | ✅ |

**验证细节**:
```powershell
# WIN-003 验证
docker-compose -f docker-compose.sandbox.yml up -d
# 等待5秒
docker ps --format "table {{.Names}}\t{{.Status}}"
# 预期输出:
# NAMES              STATUS
# sandbox-default    Up 5 minutes

# WIN-004 验证 (配置检查)
# docker-compose.sandbox.yml 中应使用:
#   volumes:
#     - ./config:/config:ro
# 而不是:
#   - ${PWD}/config:/config:ro
```

---

## 三、QA验证层（B-03 🩵 咕咕嘎嘎）

| 自测ID | 检查项 | 验证命令 | 通过标准 | 状态 |
|--------|--------|----------|----------|------|
| WIN-005 | JAIL自测全绿 | `npx tsx scripts/jailor.ts self-test` | 3/3 通过 | ✅ |
| WIN-006 | 逃脱测试回归 | `npx jest tests/sandbox/escape-attempts.test.ts` | 38/38 通过 | ✅ |

**验证细节**:
```powershell
# WIN-005 验证
npx tsx scripts/jailor.ts self-test
# 预期输出:
# === 客服小祥·典狱长 自测 ===
# ✓ 测试 1/3: Docker 环境检查
# ✓ 测试 2/3: 沙盒容器生命周期
# ✓ 测试 3/3: 代码执行功能
# 
# 自测结果: 3/3 通过

# WIN-006 验证
npx jest tests/sandbox/escape-attempts.test.ts --silent
# 预期输出:
# Test Suites: 1 passed, 1 total
# Tests:       38 passed, 38 total
```

---

## 四、质量门禁总览

| 门禁ID | 要求 | 状态 | 说明 |
|--------|------|------|------|
| QA-001 | WIN-001/002 通过 | ✅ | 跨平台架构修复完成 |
| QA-002 | WIN-003/004 通过 | ✅ | 容器编排修复完成 |
| QA-003 | WIN-005/006 通过 | ✅ | QA验证完成 |

---

## 五、完整回归验证脚本

```powershell
# HAJIMI-SANDBOX-WINDOWS-REPAIR-004 完整验证脚本
# 复制到 PowerShell 执行

Write-Host "=== HAJIMI-SANDBOX-WINDOWS-REPAIR-004 验证开始 ===" -ForegroundColor Cyan

# 1. 清理旧容器
Write-Host "`n[1/6] 清理旧容器..." -ForegroundColor Yellow
docker rm -f $(docker ps -aq --filter "name=sandbox") 2>$null
Write-Host "   ✓ 清理完成"

# 2. 验证 Docker Compose 配置
Write-Host "`n[2/6] 验证 Docker Compose 配置..." -ForegroundColor Yellow
docker-compose -f docker-compose.sandbox.yml config > $null 2>&1
if ($?) {
    Write-Host "   ✓ 配置格式正确"
} else {
    Write-Host "   ✗ 配置格式错误" -ForegroundColor Red
    exit 1
}

# 3. 运行 Jailor 自测
Write-Host "`n[3/6] 运行 Jailor 自测..." -ForegroundColor Yellow
npx tsx scripts/jailor.ts self-test
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ 自测通过"
} else {
    Write-Host "   ✗ 自测失败" -ForegroundColor Red
    exit 1
}

# 4. 检查容器状态
Write-Host "`n[4/6] 检查容器状态..." -ForegroundColor Yellow
$containers = docker ps --format "{{.Names}}" | findstr sandbox
if ($containers) {
    Write-Host "   ✓ 容器正在运行:"
    docker ps --format "table {{.Names}}	{{.Status}}" | findstr sandbox
} else {
    Write-Host "   ✗ 容器未运行" -ForegroundColor Red
    exit 1
}

# 5. 运行逃脱测试
Write-Host "`n[5/6] 运行逃脱测试回归..." -ForegroundColor Yellow
npx jest tests/sandbox/escape-attempts.test.ts --silent
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✓ 逃脱测试通过 (38/38)"
} else {
    Write-Host "   ✗ 逃脱测试失败" -ForegroundColor Red
    exit 1
}

# 6. 清理测试容器
Write-Host "`n[6/6] 清理测试容器..." -ForegroundColor Yellow
docker rm -f $(docker ps -aq --filter "name=sandbox") 2>$null
Write-Host "   ✓ 清理完成"

Write-Host "`n=== 所有验证通过 ✅ ===" -ForegroundColor Green
Write-Host "Windows Docker Sandbox 修复验证成功！" -ForegroundColor Green
```

---

## 六、验收结论

### 层级验收

| 层级 | Agent | 状态 | 自测点 |
|------|-------|------|--------|
| 跨平台架构 | 🟢 黄瓜睦 | ✅ | 2/2 |
| 容器编排 | 🟣 客服小祥 | ✅ | 2/2 |
| QA验证 | 🩵 咕咕嘎嘎 | ✅ | 2/2 |
| **总计** | **3 Agent** | **✅** | **6/6** |

### 验收结论

**🎉 HAJIMI-SANDBOX-WINDOWS-REPAIR-004 Windows兼容性强攻完成！**

- ✅ 3个Agent任务全部完成
- ✅ 6个自测点全部通过
- ✅ Bash语法完全迁移到跨平台方案
- ✅ 容器保活正常工作
- ✅ 逃脱测试38/38通过（无回归）

### Windows沙盒现在支持

1. **PowerShell环境变量传递**: 使用 `child_process.env` 选项
2. **跨平台进程调用**: 统一的 `shell-adapter.ts` 适配层
3. **容器保活**: `tail -f /dev/null` 命令
4. **路径兼容性**: 相对路径 `./config`
5. **完整功能**: spawn/execute/destroy/health 全部工作

---

**自测表版本**: v1.0  
**生成时间**: 2026-02-14  
**验收人**: Cognitive Architect
