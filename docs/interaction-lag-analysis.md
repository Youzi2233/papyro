# 交互卡顿根因分析报告

本文分析 Papyro 在侧边栏状态切换、关闭 tab、暗亮主题切换三类操作中的卡顿根因，并给出可执行的治理方案。

结论先行：这些卡顿不是单个组件写得慢，而是 **chrome 状态、设置持久化、Dioxus render、CodeMirror host 生命周期** 还没有完全分离。当前架构已经有正确方向，例如 `AppContext`、view model、editor bridge、延迟 destroy 和性能 trace，但关键交互路径仍会把轻量 UI 操作放大成同步存储、全局状态失效、隐藏 editor host 协同和浏览器重排。

更重要的是：**延迟执行、提前触发、idle cleanup 只能止血，不能作为根治方案**。如果一个任务本身会卡，换到 80ms 后、换到 `mousedown`、换到空闲时段，只是把卡顿挪走。顶层优化必须消灭不必要的工作量，让交互路径变成恒定、可预测、可证明不会扫全局的轻量事务。

本报告后续把“延后执行”只视为兼容现状的过渡措施。真正的治理目标是：

- 让一次 chrome 操作不做 IO、不跑文档派生、不遍历所有 editor host。
- 让一次 tab close 不销毁重 runtime、不触发全量 editor surface diff。
- 让一次 theme 切换不等待设置落库、不驱动无关 Dioxus 组件和 JS command。
- 让后台任务即使继续运行，也有独立队列、预算和取消策略，不与输入和布局竞争。

## 背景

项目文档已经把当前架构划成几条主线：

- `apps/*` 只负责平台宿主。
- `crates/app` 负责 runtime、dispatcher、effects 和 workspace use case。
- `crates/core` 负责模型、纯状态和 trait。
- `crates/ui` 负责 Dioxus 组件和 view model。
- `crates/editor` 与 `js/` 负责 Markdown 派生和 CodeMirror 协议/runtime。

`docs/roadmap.md` 和 `docs/performance-budget.md` 对交互预算有明确要求：

- chrome 操作目标为 50ms。
- tab close 目标为 80ms。
- view mode/theme/settings 更新不应触发 editor command storm。
- sidebar 切换只应影响 shell 布局和可见 editor host layout。

当前实现已经在局部做了优化：

- `EditorPaneModel` 用 `use_memo` 派生，避免每次 settings render 都重建 active document snapshot。
- 侧栏拖拽期间使用本地 preview width，鼠标释放才持久化设置。
- JS editor 有 spare pool、stale destroy 防护和延迟 destroy。
- `EditorHost` 对 `SetViewMode`、`SetPreferences`、`RefreshLayout` 有命令去重。

这些优化降低了最坏情况，但没有消除根因。

## 现象链路

### 侧边栏切换

当前主要路径：

```text
Header / shortcut
-> chrome::toggle_sidebar
-> ui_state.write().toggle_sidebar()
-> commands.save_settings / save_workspace_settings
-> dispatcher::apply_settings / apply_workspace_settings
-> storage.save_settings / save_workspace_settings
-> ui_state.write().apply_global_settings / apply_workspace_overrides
-> DesktopLayout / Header / Sidebar / EditorPane 重新评估
-> 可见 CodeMirror host 收到 layout changed / refresh_layout
```

关键问题：

- 一次点击会写 `UiState` 两次：先本地切换，再保存设置成功后再 apply。
- 设置保存是同步 SQLite 调用，仍在事件链路上执行。
- `UiState` 同时包含 sidebar、theme、view mode、editor preference、outline 等多个领域，写入会让所有读取 `ui_state` 的组件失效。
- 侧栏折叠导致主编辑区尺寸变化，CodeMirror `ResizeObserver` 会发 `LayoutChanged`，Rust 再发 `RefreshLayout`。这个布局刷新只应作用于可见 host，但仍会和 Dioxus render 同时发生。

### 暗亮主题切换

当前主要路径：

```text
Header / command palette
-> chrome::toggle_theme
-> commands.save_settings / save_workspace_settings
-> storage.save_settings / save_workspace_settings
-> ui_state.write().apply_global_settings / apply_workspace_overrides
-> DesktopLayout use_effect document::eval(data-theme)
-> CSS variables 全局失效
-> CodeMirror / preview / shell 重绘
```

关键问题：

- theme 切换不像 sidebar 一样先乐观更新，而是等待同步持久化后才更新 UI。
- `data-theme` 改在 `document::eval` effect 中执行，发生在 Dioxus 状态更新之后，不是最短绘制路径。
- CSS 主题变量覆盖了 shell、sidebar、editor、preview、CodeMirror 等大量区域。浏览器必须做全局 style recalculation 和 repaint。
- `UiState` 写入还会触发 `EditorPane` 读取 typography、view mode、auto link paste、outline 等状态，扩大 Rust/Dioxus render 面。

### 关闭 tab

当前主要路径：

```text
Tab close mousedown
-> request_tab_close
-> retired_hosts 写入
-> commands.close_tab
-> dispatcher::close_tab
-> dirty tab 可能触发 save_tab_by_id
-> EditorTabs close_tab
-> TabContentsMap close_tab
-> EditorPane host_items 重新派生
-> stale bridge cleanup
-> send destroy after idle delay
-> JS recycleEditor / detach channel / disconnect ResizeObserver
```

当前已有两个有价值的临时优化：

- close 用 `mousedown` 提前触发，减少 click 延迟。
- JS destroy 延迟 80ms，且带 instance id，避免旧 destroy 误伤新 host。

但它们不是根治。仍然卡顿的原因：

- dirty tab 第一次关闭会触发保存流程和二次确认，保存路径会把 tab 标成 saving，并启动异步 IO。这对用户来说不是“关闭”，而是“保存 + 提示 + 等待下一次确认”。
- 关闭 clean tab 虽然不等待 JS destroy，但仍会同步更新 `retired_hosts`、`EditorTabs`、`TabContentsMap`、`status_message`，触发 tabbar、status bar、EditorPane 和 host cleanup 重新评估。
- `EditorPane` 当前为所有打开 tab 渲染 `EditorHost`，只是隐藏非 active host。关闭一个 tab 会重新计算全部 `host_items`，打开 tab 越多，Dioxus diff 和 host 组件检查越重。
- `TabContentsMap::close_tab` 会删除正文、revision 和 stats，导致 active document、preview/outline cache、status 信息连锁失效。

## 根因

### 1. Chrome 操作仍绑定同步持久化

`dispatcher::apply_settings`、`apply_workspace_settings` 和部分 tree state 保存直接调用 `storage.save_*`。这和打开笔记、保存笔记、搜索等路径使用 `spawn_blocking` 的策略不一致。

结果是：

- 主题切换要等 SQLite 写入完成后才更新界面。
- 侧栏折叠虽然先更新 UI，但同一个事件回调中继续同步落库，浏览器可能无法及时绘制。
- SQLite pool、文件系统、autosave 或 watcher 抢占时，轻量 chrome 操作会被 IO 放大。

### 2. `UiState` 过粗，状态域仍互相牵动

`UiState` 同时承载：

- `settings.theme`
- `settings.sidebar_collapsed`
- `settings.sidebar_width`
- `settings.view_mode`
- `settings.auto_link_paste`
- editor typography
- `outline_visible`
- global settings 和 workspace overrides

Dioxus signal 是按读取关系失效的。组件只要读了 `ui_state`，任何字段写入都可能让它重跑。当前 `EditorPane` 虽已用 memo 避免重建 document snapshot，但它仍读取 `ui_state` 来拿 `view_mode`、typography、auto link paste 和 outline。

这会造成：

- sidebar/theme 这类 chrome 操作牵动 editor surface。
- theme/sidebar/settings 保存后的第二次 `UiState` 写入继续触发同一批订阅者。
- 未来新增设置项会继续扩大失效范围。

### 3. Editor host 保活策略偏重

为避免 tab 切换重建 CodeMirror，当前 `EditorPane` 为所有打开 tab 保留 host：

```text
open tabs + retired hosts -> host_items -> for each EditorHost
```

这对 tab 切换有利，但代价是：

- 每次 `EditorPane` render 都要遍历所有 host item。
- 每个 `EditorHost` 都有多个 `use_effect` 和 bridge/drop 逻辑。
- hidden host 虽不会收到 visible-only 命令，但仍参与 Dioxus 组件生命周期。
- tab close、theme/settings、view mode 变更都会穿过这一组 host。

当前 bounded retired host 只限制关闭后的短期保留数量，不限制已打开 tab 的 host 总数。

### 4. 布局变化会进入 Rust/JS 往返

侧栏折叠和窗口布局变化会触发 CodeMirror 侧 `ResizeObserver`：

```text
ResizeObserver
-> layout_changed event
-> Rust EditorEvent::LayoutChanged
-> EditorCommand::RefreshLayout
-> JS view.requestMeasure()
```

当前已经按 visible、nonzero size、size changed 做了去重，但仍是一次跨 Rust/JS 的异步往返。侧栏动画、CSS transition、主题 repaint 如果引发多次尺寸变化，仍会形成 layout pressure。

### 5. 文档派生仍有同步残留

Preview 和 Outline 已经有 revision cache 和大文件降级，但派生动作仍在 component effect 中同步执行：

- `PreviewPane::render_preview`
- `OutlinePane::derive_outline`

当关闭 tab、切换 active tab、进入 Preview 或打开 outline 时，这些派生可能和用户交互同帧竞争。不是当前三类卡顿的唯一根因，但会放大 tab close 和 theme repaint 的体感。

### 6. CSS 主题切换的 repaint 面积过大

`data-theme` 改变的是根节点变量，影响：

- shell 背景、边框、阴影
- sidebar
- tabbar
- CodeMirror 容器
- preview HTML
- modal、button、input、scrollbar

这种全局 repaint 本身不可避免，但当前还叠加了同步设置保存和 Dioxus render，使它从“浏览器重绘”变成“IO + render + 重绘 + editor layout”。

## 功能点专项判断

### 侧边栏状态切换

主要根因优先级：

1. 同步保存 settings 阻塞交互链路。
2. 一次操作两次写 `UiState`。
3. `UiState` 粗粒度失效导致 `EditorPane` 被牵动。
4. 主编辑区尺寸变化触发可见 CodeMirror layout refresh。

应优先把它治理成：

```text
同步 UI 乐观更新
-> 浏览器先绘制
-> 后台 debounce 保存设置
-> 只对 visible host 做一次 layout refresh
```

### 关闭 tab

主要根因优先级：

1. close 同时更新 tab、content、status、retired host，多 signal 连续失效。
2. 所有 open tab 都保留 `EditorHost`，关闭时 host list 和 bridge cleanup 成本随 tab 数增长。
3. dirty tab close 被保存流程和二次确认语义放大。
4. active tab 变化可能触发 active document、preview/outline、status 的连锁更新。

应优先把它治理成：

```text
立即从 tabbar 移除视觉项
-> active tab 快速切换
-> content/cache/host cleanup 延迟批处理
-> dirty tab 使用明确确认 UI，不在 close 热路径里混入保存
```

### 暗亮主题切换

主要根因优先级：

1. theme 切换等待同步持久化后才更新 UI。
2. 根 CSS 变量全局 repaint 不可避免，但被 Dioxus render 和 editor layout 放大。
3. `document::eval` 设置 theme 属于 effect 后置路径，不是最短路径。
4. theme 与 editor preferences 混在同一个 settings 信号中。

应优先把它治理成：

```text
立即设置 data-theme / chrome theme signal
-> 后台保存设置
-> 不向 CodeMirror 发送非必要 preferences
-> 不重算 preview / outline
```

## 顶层优化原则

### 1. 不移动卡顿，消灭卡顿源

性能治理不能停在“把任务放到之后”。判断一个优化是否治本，看三个问题：

- 任务总工作量是否减少？
- 任务是否离开用户当前交互的必要路径？
- 任务失败或变慢是否不会影响当前可见反馈？

如果答案是否定的，它就是调度优化，不是架构优化。

### 2. 交互路径必须是恒定时间

侧栏切换、主题切换、关闭 tab 这类 chrome 操作，不应该随以下因素线性变慢：

- 打开 tab 数量。
- 文档大小。
- 文件树大小。
- preview / outline 是否开启。
- SQLite 当前是否繁忙。

目标不是“平均快”，而是把热路径约束成 O(1)：只改一个小状态，只影响一个小 UI 区域，只通知当前可见 runtime。

### 3. 持久化不是交互真相

设置落库是恢复能力，不是当前 UI 能否变化的真相。交互真相应该是内存中的 session state。

这意味着：

- theme / sidebar / view mode 先写内存 session。
- 持久化层只保存最终一致状态。
- 保存失败只影响“下次启动能否恢复”，不应让当前点击卡住。
- 持久化任务需要合并、覆盖、取消旧请求，而不是每次点击都写 SQLite。

### 4. Editor runtime 必须有容量上限

CodeMirror host 是重资源，不能和打开 tab 数量一比一长期绑定。

正确模型应该是 runtime cache，而不是 DOM 保活列表：

- active host 是必要资源。
- warm host 是性能缓存。
- hidden host 是有上限的缓存项。
- tab 是文档会话，不等于必须有活的 CodeMirror DOM。

### 5. 派生数据必须按 revision 异步生产

Preview、Outline、Stats、Search snippet 都是文档派生数据。它们不能在 chrome 操作、tab close 或 render effect 中被顺手计算。

正确模型是：

```text
DocumentSnapshot(tab_id, revision, content)
-> 派生任务队列
-> 可取消 / 可丢弃旧 revision
-> cache
-> UI 读取 cache 或 placeholder
```

## 解决方案

### Phase A：重建 chrome session state，移除交互路径 IO

目标：侧栏、主题、view mode 的当前状态由内存 session 决定，不由 SQLite 写入成功决定。

建议改动：

- 建立 `ChromeSessionState`，包含 `theme`、`sidebar_collapsed`、`sidebar_width`、modal state。
- `chrome::toggle_sidebar`、`toggle_theme`、`set_view_mode` 只写 session state，不直接调用 `save_settings`。
- 建立 `SettingsPersistenceQueue`，用 key 覆盖旧任务。例如 `theme` 连续切换三次，只保存最后一次。
- `dispatcher::apply_settings` 不再作为交互入口的第一站，而是作为后台 persistence effect。
- 保存完成后不重复 apply 同一份 session state，只更新 `last_persisted_settings` 和 status。
- 保存失败不阻塞当前 UI。必要时显示“设置未保存，下次启动可能不恢复”。

验收：

- `perf chrome toggle sidebar` 不包含 SQLite 写入时间。
- theme click 到 `data-theme` 变化不依赖 `storage.save_settings` 完成。
- 同一个 setting key 在队列中最多一个待保存任务。
- 连续切换主题 10 次，SQLite 写入次数应接近 1 次，而不是 10 次。

### Phase B：拆分 `UiState` 的响应式域，减少任务本身工作量

目标：chrome 变化不牵动 document/editor lane。

建议状态拆分：

```rust
ChromeState {
    theme,
    sidebar_collapsed,
    sidebar_width,
    outline_visible,
    modal_state,
}

EditorPreferenceState {
    view_mode,
    font_family,
    font_size,
    line_height,
    auto_link_paste,
}

SettingsPersistenceState {
    global_settings,
    workspace_overrides,
    dirty_keys,
    last_save_status,
}
```

短期不一定要立刻改 struct，可以先在 `crates/app/src/runtime.rs` 暴露更细的 memo/signal：

- `chrome_model`
- `editor_preferences_model`
- `settings_persistence_model`

并限制组件读取：

- `DesktopLayout` 只读 theme、sidebar collapsed、modal state。
- `Sidebar` 只读 sidebar width、workspace view model。
- `EditorPane` 只读 active editor surface 需要的数据。
- `Header` 不直接读完整 `UiState`。

验收：

- sidebar collapsed 改变时，`EditorPaneModel` 输出稳定，Preview/Outline 不重算。
- theme 改变时，不触发 `SetPreferences`，不触发 preview/outline 派生。
- view model 增加测试：无关 domain 变化不改变对应输出。
- Dioxus trace 能证明 theme/sidebar 变化不重新执行 active document snapshot 派生。

### Phase C：把 Editor host 从“所有 tab 保活”改为“有容量的 runtime cache”

目标：tab 切换快，但打开 tab 数量不线性拖慢 chrome 操作。

建议策略：

```text
active host: 1 个，必须可编辑
warm host: 1-2 个，最近使用或 spare
hidden host: 有上限，超出后序列化 selection/scroll/undo metadata
retired host: 继续 bounded + idle destroy
```

实现要点：

- `EditorPane` 不再为所有 open tab 无上限渲染 `EditorHost`。
- 为非活动 tab 保存最小恢复状态：content revision、selection、scroll position，后续再评估 undo stack 保留策略。
- tab 切换时优先复用 warm host；池 miss 才创建新 CodeMirror。
- close tab 对 active/warm cache 做 O(1) 删除，不扫描全部 open tab host。
- JS spare pool 只保留固定数量 view，超出后释放真正资源，而不是继续藏在 DOM 或数组里。

验收：

- 打开 10 个 tab 后，sidebar/theme 操作的 Dioxus host 遍历成本仍稳定。
- 打开 50 个 tab 后，活跃 CodeMirror DOM 数量仍不超过上限。
- tab switch 仍满足 80ms。
- close tab 的 Rust 热路径不随 tab 数增长。

### Phase D：让布局刷新从事件风暴变成单一布局事务

目标：侧栏折叠只对可见编辑器做一次 layout refresh。

建议改动：

- 给 sidebar toggle 增加 `trigger_reason = "sidebar_toggle"`。
- `ResizeObserver` 保留，但 Rust 侧对同一 animation frame 内的 layout changed 合并。
- 侧栏折叠动画期间不连续发 `RefreshLayout`，在 transition end 或下一帧稳定尺寸后发一次。
- hidden host 的 layout size 变化直接忽略，不更新 command cache。
- 取消不必要的 sidebar width transition，或让 editor layout 使用最终宽度一次提交。

验收：

- 一次 sidebar toggle 最多出现一次 `perf editor command refresh_layout`。
- hidden/inactive tab 不产生 `refresh_layout` trace。
- 侧栏状态切换不产生连续 `LayoutChanged` 事件。

### Phase E：文档派生彻底离开 render/effect 热路径

目标：Preview/Outline 不和 tab close/theme/sidebar 同帧竞争。

建议改动：

- 将 preview render 和 outline extract 迁入 async resource 或 app/editor 派生任务。
- 派生任务输入为 `DocumentSnapshot { tab_id, revision, content }`。
- 任务完成前 UI 使用缓存或轻量 placeholder。
- 新 revision 到达时丢弃旧结果。

验收：

- tab close 和 theme toggle 不出现 `perf editor preview render` 或 `perf editor outline extract`。
- 进入 Preview 后可以延迟显示渲染结果，但编辑 surface 不被阻塞。

## 推荐实施顺序

1. **先定义交互路径不变量**：chrome 操作不 IO、不扫 host、不派生文档。
2. **拆出 `ChromeSessionState`**：让主题和侧栏状态成为内存 session，而不是持久化回调结果。
3. **去掉重复 `UiState` 写入**：一次用户意图只产生一次对应 domain state mutation。
4. **建立 settings persistence queue**：后台保存只保留每个 key 的最终值。
5. **拆细 chrome/editor preference model**：降低无关 rerender。
6. **限制 EditorHost 数量**：解决 tab 数增长后的结构性卡顿。
7. **合并 layout refresh**：稳定 sidebar 折叠体验。
8. **异步化 preview/outline 派生**：治理大文档和 Preview/Outline 叠加卡顿。

## 验证清单

运行：

```bash
PAPYRO_PERF=1 cargo run -p papyro-desktop
```

手工场景：

- 打开 1 个、5 个、10 个 tab 后分别切换 sidebar。
- 在 100KB、1MB 文档中切换 light/dark。
- 关闭 clean tab、dirty tab、active tab、inactive tab。
- 在 Source、Hybrid、Preview 三种模式下重复以上操作。

期望 trace：

- sidebar toggle：只有 `perf chrome toggle sidebar` 和可见 host 的一次 layout refresh。
- theme toggle：不出现 preview/outline 重算，不出现 hidden host preferences command。
- close tab：`perf tab close trigger` 与 `perf runtime close_tab handler` 在预算内，destroy 延迟发生。
- 打开多个 tab 后，上述 trace 不随 tab 数线性恶化。

## 最终判断

当前软件卡顿的根因是状态边界和副作用边界还不够硬：

- chrome 操作仍会同步保存设置。
- `UiState` 仍把多个响应式域绑在一起。
- editor host 保活策略解决了 tab switch，却把 chrome 操作成本变成随 tab 数增长。
- layout、preview、outline 仍可能和轻量交互竞争同一帧。

顶层优化不应该追求“卡顿晚点发生”，而应该让重任务不再属于这次交互。优先建立 session state、settings persistence queue、细粒度响应式域和有容量的 editor runtime cache，才能从架构上解决“打开越久、tab 越多、操作越卡”的趋势。
