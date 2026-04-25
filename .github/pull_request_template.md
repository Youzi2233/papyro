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

- [ ] commit title/body use English
- [ ] commit title follows `type: summary` and stays within 72 chars
- [ ] complex commits explain context, scope, risk, and verification in the body
- [ ] 无无关文件变更
- [ ] 文档已按需更新
- [ ] 测试已按风险补齐
- [ ] 未违反模块依赖方向
- [ ] 生成文件已与源文件同步
