# B-09: 回滚预案与急救方案

## 三级急救方案

### Level 1（实习）：在线修正
**适用场景**: mermaid语法错误、错别字、格式问题

**操作步骤**:
1. 访问 GitHub 仓库主页
2. 点击 README.md 右上角 "Edit" 按钮
3. 在线编辑修正
4. 提交 commit（"fix: 修正xxx"）

### Level 2（主治）：强制回滚到备份
**适用场景**: 内容截断、重大错误、需要恢复旧版

**操作步骤**:
```bash
# 恢复到备份分支的 README
git checkout backup/readme-legacy-20260217 -- README.md

# 强制提交（覆盖当前）
git add README.md
git commit -m "rollback: 恢复README至备份版本"
git push origin master --force
```

### Level 3（主任）：完整仓库回滚
**适用场景**: 敏感信息泄露、恶意提交、历史重写需求

**操作步骤**:
```bash
# 撤销最后一次 commit（保留更改）
git revert HEAD

# 或完全重置到推送前状态
git reset --hard HEAD~1
git push origin master --force

# 若需从历史中彻底删除敏感信息
git filter-branch --force --index-filter 'git rm --cached --ignore-unmatch README.md' HEAD
```

## 备份验证

| 备份类型 | 名称 | 验证命令 | 状态 |
|:---|:---|:---|:---:|
| 文件备份 | .legacy/README.md.backup | `Test-Path .legacy/README.md.backup` | ✅ 存在 |
| 分支备份 | backup/readme-legacy-20260217 | `git branch -a \| grep backup` | ✅ 存在 |
| Tag备份 | archive/readme-pre-whitelist-v1.5.0 | `git tag \| grep archive` | ✅ 存在 |

## 回滚触发条件

| 触发条件 | 级别 | 响应时间 | 负责人 |
|:---|:---:|:---:|:---|
| mermaid渲染失败 | Level 1 | 5分钟 | 任何协作者 |
| 内容截断(<10KB) | Level 2 | 15分钟 | 黄瓜睦(Architect) |
| 敏感信息泄露 | Level 3 | 立即 | 压力怪(Audit) |

---

**文档状态**: 已验证 ✅  
**备份有效性**: 已确认 ✅  
**回滚流程**: 已测试（dry-run）✅
