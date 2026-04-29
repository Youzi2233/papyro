# 变更摘要

- Phase / issue:
- Change type: architecture / performance / UI/UX / file workflow / reliability / platform
- Summary:

# 改动范围

- 改动模块：
- 不改动模块：
- 用户可见变化：

# 渲染通道

勾选本次改动触达的通道。

- [ ] Workspace lane：workspace path、file watcher、file operations、file tree、recent files、trash、tags
- [ ] Chrome lane：sidebar、modals、command palette、settings、status bar、shell layout
- [ ] Document lane：active document snapshot、stats、outline、preview HTML、search snippets
- [ ] Editor runtime lane：visible editor host、view mode、content snapshot、preferences、JS bridge
- [ ] 不触达运行时渲染通道

# 性能预算

- 目标交互预算：
- 已检查 trace：
- 是否用 `node scripts/check-perf-smoke.js <log>` 检查手工 smoke 日志：yes / no / not needed
- 为什么不会给无关交互路径增加工作量：

# UI/UX 验收

- 影响的主用户路径：
- 主写作区是否仍保持文档优先：yes / no / not relevant
- 常见桌面尺寸下是否无文字溢出、遮挡、错位或焦点回归：yes / no / not relevant
- 用户可见文案或行为变化：

# 数据安全

- 是否保护 dirty 内容：yes / no / not relevant
- 是否考虑保存失败或外部文件变化：yes / no / not relevant
- 是否涉及 storage 或 migration：

# 验证

- [ ] `cargo fmt --check`
- [ ] `cargo check --workspace --all-features`
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `node scripts/check-workspace-deps.js`
- [ ] `node scripts/report-file-lines.js`
- [ ] `node scripts/check-perf-smoke.js --self-test`
- [ ] `npm --prefix js run build`
- [ ] `npm --prefix js test`
- [ ] `assets/editor.js` 与宿主副本已同步
- [ ] 若触达交互/render 路径，已完成手工性能或 UI smoke

# 风险与回滚

- Risk:
- Rollback:

# Checklist

- [ ] commit title/body use English
- [ ] commit title follows `type: summary` and stays within 72 chars
- [ ] complex commits explain context, scope, risk, and verification in the body
- [ ] 无无关文件变更
- [ ] 文档已按需更新
- [ ] 测试已按风险补齐
- [ ] 未违反模块依赖方向
- [ ] 生成文件已与源文件同步
