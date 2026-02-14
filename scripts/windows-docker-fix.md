# Windows防火墙 Docker 兼容配置方案

## 概述

本方案提供在不关闭Windows Defender防火墙的情况下，使Docker Desktop和Redis容器正常工作的完整解决方案。

## 文件说明

| 文件 | 说明 |
|------|------|
| `windows-docker-fix.ps1` | 主配置脚本，自动添加所有必要的防火墙规则 |
| `windows-docker-fix.md` | 本文档，包含详细说明和手动操作指南 |

## 快速开始

### 1. 自动配置 (推荐)

以**管理员身份**打开PowerShell，执行：

```powershell
# 进入脚本目录
cd scripts

# 执行配置脚本
.\windows-docker-fix.ps1
```

### 2. 验证配置

```powershell
# 仅验证，不添加规则
.\windows-docker-fix.ps1 -Verify
```

### 3. 移除规则

```powershell
# 删除本脚本创建的所有规则
.\windows-docker-fix.ps1 -RemoveRules
```

## 创建的防火墙规则

脚本会自动创建以下规则（均带有 `Hajimi-Docker-` 前缀）：

| 规则名称 | 用途 | 优先级 |
|---------|------|--------|
| `Hajimi-Docker-Redis-Local` | 允许127.0.0.1访问Redis端口 | ★★★ 最高 |
| `Hajimi-Docker-Docker-Desktop` | 允许Docker Desktop程序入站 | ★★☆ 高 |
| `Hajimi-Docker-WSL` | WSL2动态端口范围 (32768-60999) | ★★☆ 高 |
| `Hajimi-Docker-HyperV` | Hyper-V NAT网络通信 | ★☆☆ 中 |
| `Hajimi-Docker-Redis-Container` | 容器网络访问Redis | ★★☆ 高 |

## 手动配置方案

如果PowerShell脚本无法运行，可使用以下手动方法：

### 方法1: Netsh命令

以管理员身份运行CMD或PowerShell：

```cmd
:: 1. Redis本地回环规则 (必须)
netsh advfirewall firewall add rule name="Hajimi-Docker-Redis-Local" dir=in action=allow protocol=tcp localport=6379 remoteip=127.0.0.1

:: 2. Docker Desktop程序例外
netsh advfirewall firewall add rule name="Hajimi-Docker-Docker-Desktop" dir=in action=allow program="C:\Program Files\Docker\Docker\Docker Desktop.exe"

:: 3. WSL2端口范围
netsh advfirewall firewall add rule name="Hajimi-Docker-WSL" dir=in action=allow protocol=tcp localport=32768-60999

:: 4. Docker容器网络
netsh advfirewall firewall add rule name="Hajimi-Docker-Redis-Container" dir=in action=allow protocol=tcp localport=6379 remoteip=172.16.0.0/12
```

### 方法2: Windows安全中心GUI

1. 打开 **Windows安全中心** → **防火墙和网络保护**
2. 点击 **高级设置**
3. 右键 **入站规则** → **新建规则**
4. 选择 **端口** → 下一步
5. 选择 **TCP**，输入 `6379` → 下一步
6. 选择 **允许连接** → 下一步
7. 配置文件保持默认 → 下一步
8. 名称输入 `Redis Local` → 完成

### 方法3: 注册表修改 (高级)

⚠️ 警告：修改注册表有风险，请谨慎操作

```powershell
# 注册表路径
$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules"

# 重启防火墙服务使更改生效
Restart-Service -Name "mpssvc" -Force
```

## 验证清单

### SEC-001: Windows Defender入站规则自动配置脚本

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 防火墙保持开启 | ⬜ | 确认Windows Defender防火墙处于启用状态 |
| Redis本地连接 | ⬜ | `redis-cli -h 127.0.0.1 -p 6379 ping` 返回 PONG |
| Docker容器访问 | ⬜ | 容器内可访问宿主机的Redis服务 |
| 规则持久化 | ⬜ | 重启后规则仍然有效 |

## 故障排除

### 问题1: 脚本提示需要管理员权限

**解决**: 右键点击PowerShell → 以管理员身份运行

### 问题2: Redis连接仍然失败

**排查步骤**:
1. 确认Redis服务正在运行: `docker ps | findstr redis`
2. 检查Redis端口映射: `docker port <redis-container>`
3. 验证防火墙规则: `Get-NetFirewallRule | Where-Object { $_.DisplayName -like "Hajimi*" }`

### 问题3: WSL2网络不通

**解决**: 检查WSL2虚拟交换机
```powershell
# 查看WSL网络适配器
Get-NetAdapter | Where-Object { $_.Name -like "*WSL*" -or $_.Name -like "*Hyper-V*" }
```

### 问题4: 规则被其他安全软件阻止

某些第三方杀毒软件可能会覆盖Windows防火墙规则，需要在相应软件中添加例外。

## 安全说明

1. **最小权限原则**: 所有规则均限制在最小必要范围
2. **本地回环优先**: Redis端口仅对127.0.0.1开放，不暴露给外部网络
3. **网络隔离**: Docker容器网络使用私有地址段，与公网隔离
4. **可审计**: 所有规则带有"Hajimi"前缀，便于识别和管理

## 参考链接

- [Microsoft: 使用防火墙规则](https://docs.microsoft.com/windows/security/threat-protection/windows-firewall/create-an-inbound-port-rule)
- [Docker Desktop Windows网络](https://docs.docker.com/desktop/networking/)
- [WSL2网络架构](https://docs.microsoft.com/windows/wsl/networking)

## 更新日志

### v1.0.0 (2026-02-14)
- 初始版本
- 支持WSL2和Hyper-V后端
- 完整的PowerShell和Netsh方案
