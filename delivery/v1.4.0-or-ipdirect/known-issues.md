# 已知问题

## DEBT-OR-001: 模型漂移

OpenRouter 模型 ID 可能变更，需要持续更新映射表。

**缓解**: 运行时启发式推断 + 手动更新配置。

## DEBT-OR-002: TLS 绕过安全风险

`rejectUnauthorized: false` 存在 MITM 风险。

**缓解**: IP 白名单 + SNI + 审计日志。

## DEBT-OR-003: IP 池硬编码

Cloudflare IP 可能变更。

**缓解**: 季度审查，通过健康检查自动剔除失效 IP。

## 流式响应未实现

B-02 中 `chatCompletionStream` 为骨架实现。

**计划**: v1.4.0-beta 完善。
