# FIX-WAVE-001-INTERNAL-REVIEW-001 报告
## 执行摘要
- 评级：C
- 关键发现： 存在文案不一致（bench 中仍有 SHA256 引用）和债务声明不完整（bench 缺少 DEBT-BENCH-003 声明）的问题。
## 详细审计表
检查项 状态 证据 建议 1.1.1 验证 bench 添加 commander ✅ 通过 apps/hajimi-bench/package.json 第 18 行： "commander": "^11.0.0" - 1.1.2 验证 external-verify.ps1 存在 ✅ 通过 scripts/external-verify.ps1 存在且可执行 - 1.1.3 验证 commander 版本冲突 ✅ 通过 根目录 package.json 无 commander 依赖 - 1.2.1 验证 CLI 添加 100MB 检查 ✅ 通过 apps/hajimi-cli/src/index.ts 第 21-31 行 - 1.2.2 验证 Bench 添加 100MB 检查 ✅ 通过 apps/hajimi-bench/src/orchestrator.ts 第 20-30 行 - 1.2.3 验证检查逻辑 ✅ 通过 使用 fs.statSync 同步检查 建议改为 fs.promises.stat 异步检查 1.2.4 验证错误码 ✅ 通过 拒绝时返回 exit 1，错误信息包含 "DEBT-CLI-003" - 1.3.1 全局 grep "SHA256" ❌ 失败 apps/hajimi-bench/src/orchestrator.ts 第 164 行仍有 "SHA256" 引用 统一改为 "BLAKE3-256" 1.3.2 验证哈希日志统一 ✅ 通过 CLI 中所有哈希相关日志统一为 "BLAKE3-256" - 2.1.1 验证 CLI 添加 DEBT-CLI-003 ✅ 通过 apps/hajimi-cli/CLI-README.md 第 44 行 - 2.1.2 验证 Bench 添加 DEBT-BENCH-003 ❌ 失败 apps/hajimi-bench/BENCH-README.md 中无此声明 添加 DEBT-BENCH-003 债务声明 2.2.1 验证 DEBT-CLI-003 分级 ✅ 通过 DEBT-CLI-003 标记为 P0 - 2.3.1 隐藏债务扫描 ✅ 通过 无未声明的 TODO/FIXME/XXX - 3.1.1 检查跨包循环依赖 ✅ 通过 未发现跨包循环依赖 - 3.1.2 检查 hajimi-diff 冻结状态 ✅ 通过 未触碰核心包 - 3.2.1 检查 OOM 检查函数封装 ✅ 通过 封装为独立的 checkFileSize 函数 - 3.3.1 检查错误处理 ❌ 失败 checkFileSize 函数在文件不存在时会抛出堆栈 建议先检查文件存在性，再检查大小 4.1.1 检查新增测试覆盖 ❌ 失败 无针对 100MB 限制的单元测试 添加边界测试用例 4.2.1 执行回归测试 ✅ 通过 CLI 6/6 通过，Bench 5/5 通过 -

## 债务补全（如有）
- DEBT-BENCH-003 (P0) ：文件大小限制 100MB，v1.1 改用 stream（在 apps/hajimi-bench/src/orchestrator.ts 第 8 行声明，但 README 中缺失）
## v1.0.0-alpha 准入建议
- 立即冻结（A）
- 带债准入（B）
- 修复后复验（C）
- 回滚（D）
## 修复建议
1. 文案一致性 ：
   
   - 将 apps/hajimi-bench/src/orchestrator.ts 第 164 行的 "SHA256 must match" 改为 "BLAKE3-256 must match"
   - 将 apps/hajimi-bench/BENCH-README.md 第 17 行的 "正确性校验 (SHA256)" 改为 "正确性校验 (BLAKE3-256)"
2. 债务声明完整性 ：
   
   - 在 apps/hajimi-bench/BENCH-README.md 的 "Known Debts" 部分添加 DEBT-BENCH-003 声明，格式参考 DEBT-CLI-003
3. 错误处理优化 ：
   
   - 修改 checkFileSize 函数，先检查文件存在性，再检查大小，避免抛出堆栈
4. 性能优化 ：
   
   - 考虑将 fs.statSync 改为 fs.promises.stat 异步检查，特别是在 Bench 的批量测试场景中
5. 测试覆盖 ：
   
   - 添加针对 100MB 限制的边界测试用例，验证 100MB 文件通过，100MB+1 字节文件被拒绝
修复以上问题后，建议重新运行审计以确认风险缓解状态。