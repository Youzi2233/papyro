# UI Token 审计

[English](../ui-token-audit.md) | [文档首页](README.md)

这份审计记录 Phase 3.5 重构前当前 CSS token 债务，避免后续视觉改版继续凭感觉扩散样式。

运行方式：

```bash
node scripts/report-ui-tokens.js
node scripts/report-ui-tokens.js --self-test
```

脚本默认只报告，不阻断 CI。当某个界面已经清理到足够稳定时，可以本地使用 `--strict` 检查新增风险。

## 当前结果

审计日期：2026 年 5 月 2 日。

```text
Scanned files: 37
Raw color values: 570
  allowed: 488
  component: 47
  fallback: 32
  data: 3
Literal spacing values: 664
  component: 587
  allowed: 77
UI token audit found 669 migration risks.
```

## 分类含义

| 分类 | 含义 | 动作 |
| --- | --- | --- |
| `allowed` | 主题色板、语义 token 或无害 reset 值。 | token 模型不变时保留。 |
| `component` | 组件/界面 CSS 里的裸色值或字面量间距。 | 在界面重构时迁移到语义 token 或组件 token。 |
| `fallback` | JS 编辑器 `var(...)` 链中的 fallback 色值。 | 短期可保留，等 CodeMirror token 稳定后再减少。 |
| `data` | 面向用户的数据值，例如标签颜色。 | 作为数据保留，但不要当成 chrome 样式。 |

## 主要发现

- 桌面共享 CSS 和桌面运行时 CSS 基本同步，但两边都有组件级间距字面量。
- 移动端 CSS 还有不少独立 rgba/hex，认真做移动端 UI 前需要先 token 化。
- `js/src/editor-theme.js` 在 CodeMirror 样式里有 fallback 色值，短期可接受，但应随着语义 token 稳定逐步减少。
- Rust UI 里有少量标签色和语言/视图元信息色值。它们属于数据值，除非变成 chrome 样式，否则不需要直接改掉。
- 重复 selector 显示最需要 primitives 的区域：Preview/Markdown、工具图标、按钮、视图模式控件、tooltip、文件树行、空状态。

## 迁移目标

| 风险 | 目标 |
| --- | --- |
| 桌面 CSS 的 `component` 裸色值 | 替换为 `--mn-chrome-*`、`--mn-control-*`、`--mn-selection-*` 或 `--mn-status-*`。 |
| 移动端 CSS 的 `component` 裸色值 | 在新增移动端主题前对齐共享语义 token。 |
| 控件尺寸字面量 | 提升为组件 token，例如 button height、icon button size、tree row height、menu padding。 |
| 重复 row 样式 | 抽出 `ResultRow`、`TreeRow`、`SidebarItem`、`SettingsRow` pattern。 |
| 重复 Markdown selector | 保留在 Markdown token 层，并逐步减少 Preview 与 Hybrid 的重复。 |

## 后续规则

- 大范围 UI 重构前运行 `node scripts/report-ui-tokens.js`。
- 不新增组件裸色值，除非它是文档化的 token fallback。
- 跨界面重复出现的间距值应提升为组件 token。
- 新 primitives 必须在 [UI 架构与组件盘点](ui-architecture.md) 中记录 token 契约。
- 某个界面清理完成后，同步更新本审计里的风险数量。
