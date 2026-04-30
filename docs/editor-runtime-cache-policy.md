# Editor Runtime Cache Policy

本文定义非活动 tab 的 selection、scroll 和 undo 保存策略。它服务于当前性能主线：让 `EditorHost` 数量有上限，同时不把 tab 切换退化成频繁重建 CodeMirror。

## 目标

- tab 切换保持快，优先复用 active / warm host。
- 打开的 tab 数量不决定活跃 CodeMirror DOM 数量。
- Rust 继续拥有 document content、revision、dirty/save state 的真相。
- JavaScript runtime 只拥有浏览器编辑器能力：selection、scroll、composition、decorations 和 undo stack。
- host 被销毁后，用户至少能恢复到正确文档内容；selection/scroll 作为轻量 metadata 恢复，undo stack 不做跨销毁承诺。

## Host 层级

| 层级 | 作用 | 保存内容 | 淘汰策略 |
| --- | --- | --- | --- |
| active host | 当前可编辑 tab | CodeMirror view、selection、scroll、undo stack | 必须存在，除非当前处于纯 Preview |
| warm host | 最近使用的非活动 tab | CodeMirror view、selection、scroll、undo stack | 有数量上限，优先保留最近 tab |
| retired host | 已不在 host pool 里的旧实例 | 只保留 pending destroy command | 通过 `Destroy { instance_id }` 延迟批量释放 |
| cold document | 没有活跃 host 的 tab | Rust content snapshot、revision、save state | 重新激活时从 Rust snapshot 创建 host |

当前实现已经落地 active + warm host 上限。`EditorPaneViewModel.host_items` 决定 host pool，`EditorPane` 对 host lifecycle 打 trace，`EditorBridge` 用 instance id 防止 stale destroy 误伤新实例。

## 状态保存规则

### Content 和 revision

Content 和 revision 永远属于 Rust：

- `TabContentsMap` 保存每个 tab 的 `Arc<str>` content。
- `revision` 是单调内容版本，派生数据和恢复 metadata 必须绑定 revision。
- JS 的 `content_changed` 事件只提交新内容，不能成为保存状态或文件状态的真相来源。

### Hybrid block hints

Hybrid block hints 是按 `tab_id + revision` 派生的轻量结构，仍然属于 Rust 侧派生数据：

- 只为当前 active tab 发送 block hints；warm / hidden host 不接收 Hybrid block hints。
- 100KB 级文档可以使用完整 block hints 和近视口 decoration。
- 超过 interactive block analysis 上限的文档返回 `source_only` fallback，JS 只保留 Source-like 编辑路径。
- JS 在 `content_changed` 事件里只回传当前 Hybrid 输入 trace 上下文，例如 block kind、state、tier 和 fallback reason；这些字段只用于性能定位，不改变文档真相。
- Mermaid、数学、表格和图片 widget 必须服从同一个 fallback 策略，不能绕过 block hints 自行全量扫描大文档。

### Selection 和 scroll

Selection 和 scroll 是浏览器编辑器状态。策略是轻量保存，按 revision 校验：

- warm host 存活时，不序列化，直接依赖 CodeMirror view 保持 selection 和 scroll。
- host 即将退出 warm pool 时，未来应由 JS 发送轻量 viewport snapshot。
- viewport snapshot 至少包含 `tab_id`、`revision`、selection anchor/head、scroll top。
- Rust 只在 snapshot revision 与当前 tab revision 一致时保存。
- cold document 重新激活时，先用 content snapshot 创建 host，再应用匹配的 selection/scroll metadata。
- revision 不匹配时丢弃 metadata，避免跳到错误位置。

### Undo stack

Undo stack 当前只在 active / warm host 存活期间保留：

- host 未销毁时，CodeMirror 自身保留 undo/redo。
- host 被销毁后，不承诺恢复 undo stack。
- 未来如果要跨销毁保存 undo stack，必须先证明序列化成本、兼容性和数据安全都可控。
- 在没有完整方案前，不能为了保存 undo stack 重新让所有 tab 常驻 host。

## Tab 切换语义

```text
activate tab
-> if warm host exists: show host and preserve CodeMirror state
-> else: create host from Rust content snapshot
-> if selection/scroll metadata matches revision: restore viewport
-> else: use CodeMirror default position
```

这意味着性能优先级是：

1. active host 立即可用。
2. 最近 tab 通过 warm host 保持完整编辑器状态。
3. 较旧 tab 从 Rust content 恢复，selection/scroll 尽力恢复。
4. undo stack 不跨 host 销毁恢复。

## 关闭和销毁

- clean tab 关闭可以立即从 tabbar 和 host pool 移除。
- dirty tab 第一次关闭只进入确认态，不在 close 热路径触发保存。
- host destroy 必须带 `instance_id`。
- JS 收到 stale destroy 时必须忽略，不能 detach 新 host。
- destroy 延迟批处理只负责释放 runtime 资源，不修改 document content。

## 后续实现顺序

1. 在 `crates/editor` protocol 中增加 viewport snapshot event 和 restore command。
2. JS runtime 在 host 退出 warm pool 前发送 selection/scroll snapshot。
3. Rust 按 `tab_id + revision` 保存 metadata。
4. 新 host ready 后，只恢复匹配 revision 的 metadata。
5. 增加 tab switch smoke，覆盖 warm hit、cold restore、revision mismatch discard。

## 验收标准

- 打开 50 个 tab 时，活跃 CodeMirror DOM 数量仍受上限约束。
- 最近 tab 切换保留 selection、scroll 和 undo。
- 较旧 tab 重新激活能恢复 content，selection/scroll 尽力恢复。
- revision 变化后不会应用旧 selection/scroll。
- 为恢复 undo stack 不得扩大 host 常驻数量。
