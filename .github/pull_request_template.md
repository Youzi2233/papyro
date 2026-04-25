# 变更摘要

- 待填写

# 改动范围

- 待填写

# 验证

- [ ] `cargo fmt --check`
- [ ] `cargo check --workspace --all-features`
- [ ] `cargo clippy --workspace --all-targets --all-features -- -D warnings`
- [ ] `cargo test --workspace`
- [ ] `node scripts/check-workspace-deps.js`
- [ ] `node scripts/report-file-lines.js`
- [ ] `npm --prefix js run build`
- [ ] `npm --prefix js test`
- [ ] `assets/editor.js` 与宿主副本已同步

# 风险与回滚

- Risk:
- Rollback:

# UI

- [ ] 无 UI 变化
- [ ] 已附截图或说明手动验证方式

# Checklist

- [ ] commit 标题符合 `type: 摘要`，最多 20 字
- [ ] 复杂提交已用正文说明背景、影响范围、风险和验证
- [ ] 无无关文件变更
- [ ] 文档已按需更新
- [ ] 测试已按风险补齐
- [ ] 未违反模块依赖方向
- [ ] 生成文件已与源文件同步
