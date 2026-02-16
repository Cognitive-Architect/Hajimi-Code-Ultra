#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Windows防火墙Docker兼容配置脚本
    
.DESCRIPTION
    本脚本在不关闭Windows Defender防火墙的情况下，配置Docker Desktop和Redis容器的网络访问规则。
    适用于WSL2和Hyper-V后端的Docker Desktop环境。
    
.PARAMETER Verify
    仅验证当前配置状态，不添加规则
    
.PARAMETER RemoveRules
    移除本脚本创建的所有防火墙规则
    
.EXAMPLE
    .\windows-docker-fix.ps1
    执行完整的防火墙规则配置
    
.EXAMPLE
    .\windows-docker-fix.ps1 -Verify
    仅验证当前配置状态
    
.EXAMPLE
    .\windows-docker-fix.ps1 -RemoveRules
    移除所有由本脚本创建的规则
    
.NOTES
    文件名: windows-docker-fix.ps1
    作者: Hajimi Code Team
    创建日期: 2026-02-14
    版本: 1.0.0
#>

param(
    [switch]$Verify,
    [switch]$RemoveRules
)

# ============================================
# 配置常量
# ============================================
$script:RulePrefix = "Hajimi-Docker-"
$script:RedisPort = 6379
$script:RedisRuleName = "${RulePrefix}Redis-Local"
$script:DockerDesktopRuleName = "${RulePrefix}Docker-Desktop"
$script:DockerWSLRuleName = "${RulePrefix}Docker-WSL"
$script:DockerHyperVRuleName = "${RulePrefix}Docker-HyperV"
$script:RedisContainerRuleName = "${RulePrefix}Redis-Container"

# Docker Desktop 默认安装路径
$script:DockerDesktopPaths = @(
    "${env:ProgramFiles}\Docker\Docker\Docker Desktop.exe",
    "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
    "${env:LocalAppData}\Programs\Docker\Docker\Docker Desktop.exe"
)

# ============================================
# 辅助函数
# ============================================

function Write-Status {
    param(
        [string]$Message,
        [string]$Status = "Info"  # Info, Success, Warning, Error
    )
    
    $colors = @{
        "Info"    = "Cyan"
        "Success" = "Green"
        "Warning" = "Yellow"
        "Error"   = "Red"
    }
    
    $prefix = @{
        "Info"    = "[ℹ]"
        "Success" = "[✓]"
        "Warning" = "[!]"
        "Error"   = "[✗]"
    }
    
    Write-Host "$($prefix[$Status]) $Message" -ForegroundColor $colors[$Status]
}

function Test-Administrator {
    $currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    return $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-FirewallState {
    try {
        $profile = Get-NetFirewallProfile -Profile Domain,Public,Private -ErrorAction Stop
        $enabled = $profile | Where-Object { $_.Enabled -eq 'True' }
        $disabled = $profile | Where-Object { $_.Enabled -eq 'False' }
        
        return @{
            Domain  = ($profile | Where-Object { $_.Profile -eq 'Domain' }).Enabled
            Public  = ($profile | Where-Object { $_.Profile -eq 'Public' }).Enabled
            Private = ($profile | Where-Object { $_.Profile -eq 'Private' }).Enabled
            AnyEnabled = ($enabled.Count -gt 0)
            AllEnabled = ($disabled.Count -eq 0)
        }
    }
    catch {
        Write-Status "获取防火墙状态失败: $($_.Exception.Message)" "Error"
        return $null
    }
}

function Get-DockerDesktopPath {
    foreach ($path in $script:DockerDesktopPaths) {
        if (Test-Path $path) {
            return $path
        }
    }
    return $null
}

function Test-RuleExists {
    param([string]$RuleName)
    
    try {
        $rule = Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue
        return ($null -ne $rule)
    }
    catch {
        return $false
    }
}

function Remove-HajimiRules {
    Write-Status "正在移除所有Hajimi-Docker防火墙规则..." "Info"
    
    $rules = Get-NetFirewallRule | Where-Object { $_.DisplayName -like "${RulePrefix}*" }
    
    if ($rules.Count -eq 0) {
        Write-Status "未找到Hajimi-Docker相关规则" "Warning"
        return
    }
    
    foreach ($rule in $rules) {
        try {
            Remove-NetFirewallRule -DisplayName $rule.DisplayName -ErrorAction Stop
            Write-Status "已移除规则: $($rule.DisplayName)" "Success"
        }
        catch {
            Write-Status "移除规则失败 ($($rule.DisplayName)): $($_.Exception.Message)" "Error"
        }
    }
    
    Write-Status "规则清理完成" "Success"
}

# ============================================
# 防火墙规则添加函数
# ============================================

function Add-RedisLocalRule {
    <#
    .DESCRIPTION
        添加Redis本地回环访问规则
        仅允许127.0.0.1访问6379端口，最安全的方式
    #>
    
    if (Test-RuleExists $script:RedisRuleName) {
        Write-Status "Redis本地规则已存在，跳过创建" "Warning"
        return $true
    }
    
    try {
        # 方法1: 使用New-NetFirewallRule (PowerShell原生)
        New-NetFirewallRule `
            -DisplayName $script:RedisRuleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort $script:RedisPort `
            -RemoteAddress "127.0.0.1" `
            -Profile Any `
            -Description "允许本地回环访问Redis端口6379 - 由Hajimi脚本自动创建" `
            -ErrorAction Stop
        
        Write-Status "已添加Redis本地回环规则 (端口 $script:RedisPort)" "Success"
        return $true
    }
    catch {
        Write-Status "添加Redis规则失败: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Add-DockerDesktopRule {
    <#
    .DESCRIPTION
        添加Docker Desktop程序例外规则
    #>
    
    if (Test-RuleExists $script:DockerDesktopRuleName) {
        Write-Status "Docker Desktop规则已存在，跳过创建" "Warning"
        return $true
    }
    
    $dockerPath = Get-DockerDesktopPath
    
    if (-not $dockerPath) {
        Write-Status "未找到Docker Desktop安装路径" "Warning"
        return $false
    }
    
    try {
        New-NetFirewallRule `
            -DisplayName $script:DockerDesktopRuleName `
            -Direction Inbound `
            -Action Allow `
            -Program $dockerPath `
            -Profile Any `
            -Description "允许Docker Desktop入站连接 - 由Hajimi脚本自动创建" `
            -ErrorAction Stop
        
        Write-Status "已添加Docker Desktop程序规则" "Success"
        return $true
    }
    catch {
        Write-Status "添加Docker Desktop规则失败: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Add-DockerWSLRule {
    <#
    .DESCRIPTION
        添加WSL2 Docker网络规则
        WSL2使用虚拟交换机进行网络通信
    #>
    
    if (Test-RuleExists $script:DockerWSLRuleName) {
        Write-Status "Docker WSL规则已存在，跳过创建" "Warning"
        return $true
    }
    
    try {
        # WSL2使用动态端口范围，允许WSL子系统通信
        New-NetFirewallRule `
            -DisplayName $script:DockerWSLRuleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort 32768-60999 `
            -Profile Private `
            -Description "允许WSL2 Docker动态端口通信 - 由Hajimi脚本自动创建" `
            -ErrorAction Stop
        
        Write-Status "已添加Docker WSL2网络规则" "Success"
        return $true
    }
    catch {
        Write-Status "添加WSL规则失败: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Add-DockerHyperVRule {
    <#
    .DESCRIPTION
        添加Hyper-V Docker网络规则
        Hyper-V后端使用NAT网络
    #>
    
    if (Test-RuleExists $script:DockerHyperVRuleName) {
        Write-Status "Docker Hyper-V规则已存在，跳过创建" "Warning"
        return $true
    }
    
    try {
        # Hyper-V NAT默认使用172.16.0.0/12范围
        New-NetFirewallRule `
            -DisplayName $script:DockerHyperVRuleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalAddress @("172.16.0.0/12", "192.168.0.0/16", "10.0.0.0/8") `
            -Profile Any `
            -Description "允许Hyper-V Docker NAT网络通信 - 由Hajimi脚本自动创建" `
            -ErrorAction Stop
        
        Write-Status "已添加Docker Hyper-V网络规则" "Success"
        return $true
    }
    catch {
        Write-Status "添加Hyper-V规则失败: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Add-RedisContainerRule {
    <#
    .DESCRIPTION
        添加Redis容器特定规则
        允许从Docker网络访问Redis容器
    #>
    
    if (Test-RuleExists $script:RedisContainerRuleName) {
        Write-Status "Redis容器规则已存在，跳过创建" "Warning"
        return $true
    }
    
    try {
        # 允许Docker子网访问Redis端口
        New-NetFirewallRule `
            -DisplayName $script:RedisContainerRuleName `
            -Direction Inbound `
            -Action Allow `
            -Protocol TCP `
            -LocalPort $script:RedisPort `
            -RemoteAddress @("172.16.0.0/12", "192.168.0.0/16", "10.0.0.0/8") `
            -Profile Any `
            -Description "允许Docker容器网络访问Redis - 由Hajimi脚本自动创建" `
            -ErrorAction Stop
        
        Write-Status "已添加Redis容器网络规则" "Success"
        return $true
    }
    catch {
        Write-Status "添加Redis容器规则失败: $($_.Exception.Message)" "Error"
        return $false
    }
}

# ============================================
# 验证函数
# ============================================

function Test-RedisConnection {
    <#
    .DESCRIPTION
        测试Redis连接
    #>
    
    Write-Status "正在测试Redis连接..." "Info"
    
    try {
        # 尝试连接本地Redis
        $connection = Test-NetConnection -ComputerName "127.0.0.1" -Port $script:RedisPort -WarningAction SilentlyContinue
        
        if ($connection.TcpTestSucceeded) {
            Write-Status "Redis连接测试成功 (127.0.0.1:$script:RedisPort)" "Success"
            return $true
        }
        else {
            Write-Status "Redis连接测试失败，端口未开放或服务未运行" "Warning"
            return $false
        }
    }
    catch {
        Write-Status "Redis连接测试异常: $($_.Exception.Message)" "Error"
        return $false
    }
}

function Show-CurrentRules {
    <#
    .DESCRIPTION
        显示当前Hajimi相关防火墙规则
    #>
    
    Write-Status "当前Hajimi-Docker防火墙规则:" "Info"
    
    $rules = Get-NetFirewallRule | Where-Object { $_.DisplayName -like "${RulePrefix}*" }
    
    if ($rules.Count -eq 0) {
        Write-Host "  未找到相关规则" -ForegroundColor Yellow
        return
    }
    
    foreach ($rule in $rules) {
        $status = if ($rule.Enabled -eq 'True') { "已启用" } else { "已禁用" }
        $statusColor = if ($rule.Enabled -eq 'True') { "Green" } else { "Red" }
        
        Write-Host "  • $($rule.DisplayName)" -NoNewline
        Write-Host " [$status]" -ForegroundColor $statusColor
        Write-Host "    方向: $($rule.Direction), 操作: $($rule.Action), 描述: $($rule.Description)" -ForegroundColor Gray
    }
}

function Show-NetshAlternatives {
    <#
    .DESCRIPTION
        显示netsh命令行替代方案
    #>
    
    Write-Host ""
    Write-Status "Netsh命令替代方案 (如PowerShell方法失败可使用):" "Info"
    Write-Host ""
    
    $netshCommands = @"
# 1. 添加Redis本地回环规则 (推荐)
netsh advfirewall firewall add rule name="$script:RedisRuleName" dir=in action=allow protocol=tcp localport=$script:RedisPort remoteip=127.0.0.1

# 2. 添加Docker Desktop程序例外
netsh advfirewall firewall add rule name="$script:DockerDesktopRuleName" dir=in action=allow program="C:\Program Files\Docker\Docker\Docker Desktop.exe"

# 3. 添加Docker WSL2端口范围
netsh advfirewall firewall add rule name="$script:DockerWSLRuleName" dir=in action=allow protocol=tcp localport=32768-60999

# 4. 添加Docker网络规则 (容器间通信)
netsh advfirewall firewall add rule name="$script:RedisContainerRuleName" dir=in action=allow protocol=tcp localport=$script:RedisPort remoteip=172.16.0.0/12

# 5. 删除规则示例
netsh advfirewall firewall delete rule name="$script:RedisRuleName"
"@
    
    Write-Host $netshCommands -ForegroundColor Cyan
}

function Show-RegistryMethod {
    <#
    .DESCRIPTION
        显示注册表修改方法
    #>
    
    Write-Host ""
    Write-Status "注册表修改方案 (高级用户):" "Info"
    Write-Host ""
    
    $registryInfo = @"
# 注册表路径: HKEY_LOCAL_MACHINE\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules

# 注意: 直接修改注册表需要重启Windows Firewall服务生效
# 建议优先使用PowerShell或netsh命令

# Redis规则注册表示例 (仅供参考):
`$regPath = "HKLM:\SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\FirewallRules"
`$ruleName = "{$(New-Guid)}"
`$ruleValue = "v2.31|Action=Allow|Active=TRUE|Dir=In|Protocol=6|LPort=6379|RPort=|RMAddr=127.0.0.1|"

# 不建议直接操作，使用以下命令重启防火墙服务:
Restart-Service -Name "mpssvc" -Force
"@
    
    Write-Host $registryInfo -ForegroundColor Gray
}

# ============================================
# 主程序
# ============================================

function Main {
    param(
        [switch]$Verify,
        [switch]$RemoveRules
    )
    
    # 检查管理员权限
    if (-not (Test-Administrator)) {
        Write-Status "此脚本需要管理员权限运行，请右键以管理员身份运行" "Error"
        exit 1
    }
    
    Clear-Host
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "   Windows防火墙 Docker 兼容配置工具    " -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # 处理移除规则请求
    if ($RemoveRules) {
        Remove-HajimiRules
        exit 0
    }
    
    # 检查防火墙状态
    $firewallState = Get-FirewallState
    
    if (-not $firewallState) {
        Write-Status "无法获取防火墙状态，退出" "Error"
        exit 1
    }
    
    Write-Status "当前防火墙状态:" "Info"
    Write-Host "  域网络:   $($firewallState.Domain)" -ForegroundColor $(if($firewallState.Domain -eq 'True'){'Red'}else{'Green'})
    Write-Host "  专用网络: $($firewallState.Private)" -ForegroundColor $(if($firewallState.Private -eq 'True'){'Red'}else{'Green'})
    Write-Host "  公用网络: $($firewallState.Public)" -ForegroundColor $(if($firewallState.Public -eq 'True'){'Red'}else{'Green'})
    
    if (-not $firewallState.AnyEnabled) {
        Write-Status "Windows防火墙已完全关闭，无需额外配置" "Warning"
    }
    
    # 仅验证模式
    if ($Verify) {
        Write-Host ""
        Write-Status "验证模式 - 仅显示当前配置" "Info"
        Show-CurrentRules
        Test-RedisConnection | Out-Null
        exit 0
    }
    
    # 配置模式
    Write-Host ""
    Write-Status "开始配置防火墙规则..." "Info"
    Write-Host ""
    
    $results = @()
    
    # 1. 添加Redis本地回环规则 (最安全，最必要)
    $results += @{ Name = "Redis本地回环"; Success = (Add-RedisLocalRule) }
    
    # 2. 添加Docker Desktop程序规则
    $results += @{ Name = "Docker Desktop程序"; Success = (Add-DockerDesktopRule) }
    
    # 3. 添加WSL2网络规则
    $results += @{ Name = "Docker WSL2网络"; Success = (Add-DockerWSLRule) }
    
    # 4. 添加Hyper-V网络规则
    $results += @{ Name = "Docker Hyper-V网络"; Success = (Add-DockerHyperVRule) }
    
    # 5. 添加Redis容器规则 (允许容器间访问)
    $results += @{ Name = "Redis容器网络"; Success = (Add-RedisContainerRule) }
    
    # 显示配置结果
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Status "配置结果汇总:" "Info"
    Write-Host ""
    
    foreach ($result in $results) {
        $status = if ($result.Success) { "✓ 成功" } else { "✗ 失败/跳过" }
        $color = if ($result.Success) { "Green" } else { "Yellow" }
        Write-Host "  $($result.Name): " -NoNewline
        Write-Host $status -ForegroundColor $color
    }
    
    # 显示当前规则
    Write-Host ""
    Show-CurrentRules
    
    # 测试Redis连接
    Write-Host ""
    $redisTest = Test-RedisConnection
    
    # 显示替代方案
    Show-NetshAlternatives
    Show-RegistryMethod
    
    # 最终状态
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    
    if ($redisTest) {
        Write-Status "配置完成! Redis连接正常，防火墙保持开启" "Success"
        exit 0
    }
    else {
        Write-Status "配置完成，但Redis连接测试未通过" "Warning"
        Write-Status "请确保Redis服务正在运行，然后再次测试" "Info"
        exit 1
    }
}

# 执行主程序
Main -Verify:$Verify -RemoveRules:$RemoveRules
