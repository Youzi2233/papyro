> **历史文档** — 编辑器演进方向以 [roadmap.md](roadmap.md) Phase 2-3 为准。

# 编辑器设计方案

## 目标体验

对标 Typora 的核心体验：
- **所见即所得（WYSIWYG）**：不分左右两栏，在同一区域输入并实时渲染
- 焦点行显示原始 Markdown 语法，非焦点行显示渲染结果
- 流畅的输入体验，解析延迟 < 16ms（不阻塞一帧）
- 支持键盘快捷键完成常见格式操作

---

## 编辑器架构

```
┌─────────────────────────────────────────────┐
│             EditorArea 组件                  │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │         Toolbar 组件                 │   │
│  │  B  I  U  ~~  `  链接  图片  表格    │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │       ContentEditable 包装层         │   │
│  │                                      │   │
│  │  # 标题（焦点行：显示原始语法）       │   │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │   │
│  │  这是一段普通文字，**加粗**渲染正常   │   │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │   │
│  │  > 引用块渲染                        │   │
│  │  ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄   │   │
│  │  ```rust  （焦点时展开代码原文）      │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │         StatusBar 组件               │   │
│  │  行 42，列 15  |  共 1,234 字        │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## WYSIWYG 实现方案

### 方案选择

由于 Dioxus 基于 WebView 渲染，编辑器本质是在 WebView 内的 HTML DOM 上操作。
有两种实现路径：

#### 方案 A：纯 Dioxus 组件树（推荐）

将 Markdown 文档解析为 AST，每个 AST 节点渲染为对应的 Dioxus 组件。
编辑时通过 JavaScript 桥接获取 `contenteditable` 的输入事件，回传给 Rust 更新 AST。

```
用户输入 → JS input 事件 → eval() 传递给 Rust → 更新 AST → 重新渲染组件
```

**优点**：Rust 完全掌控状态，调试方便  
**缺点**：光标管理复杂，需要处理 JS ↔ Rust 的双向通信

#### 方案 B：嵌入成熟 JS 编辑器（备选）

使用 [CodeMirror 6](https://codemirror.net/) 或 [ProseMirror](https://prosemirror.net/) 作为编辑器内核，通过 `eval()` / `wry` JSbridge 与 Rust 通信。

```
JS 编辑器 → onChange → eval bridge → Rust 状态同步 → 保存/搜索
```

**优点**：编辑体验成熟，光标/选区/IME 处理完善  
**缺点**：需要维护 JS 代码，增加包体积

**最终选择：阶段一用方案 B，阶段二迁移至方案 A**
- 先用 CodeMirror 6（Markdown 模式）快速验证产品形态
- 待编辑器体验稳定后，逐步用 Dioxus 原生组件替换

---

## CodeMirror 6 集成方案

### 初始化

在 `index.html`（通过 manganis 管理）中内嵌 CodeMirror 6：

```html
<!-- assets/editor.js - 通过 asset!() 宏引入 -->
<script type="module">
  import { EditorView, basicSetup } from "codemirror";
  import { markdown } from "@codemirror/lang-markdown";
  import { oneDark } from "@codemirror/theme-one-dark";

  window.initEditor = function(containerId, initialContent, theme) {
    const view = new EditorView({
      doc: initialContent,
      extensions: [
        basicSetup,
        markdown(),
        theme === 'dark' ? oneDark : [],
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            // 通知 Rust 内容变更
            window.ipc.postMessage(JSON.stringify({
              type: "content_changed",
              content: update.state.doc.toString()
            }));
          }
        })
      ],
      parent: document.getElementById(containerId)
    });
    window.editorViews = window.editorViews || {};
    window.editorViews[containerId] = view;
  };
</script>
```

### Rust 侧桥接

```rust
// crates/ui/src/components/editor/editor_area.rs

#[component]
pub fn EditorArea(note_id: String) -> Element {
    let mut content = use_signal(|| String::new());
    let container_id = format!("editor-{}", &note_id[..8]);

    // 初始化编辑器
    use_effect(move || {
        let js = format!(
            r#"window.initEditor("{}", {}, "{}");"#,
            container_id,
            serde_json::to_string(&*content.read()).unwrap(),
            if *dark_mode.read() { "dark" } else { "light" }
        );
        document::eval(&js);
    });

    rsx! {
        div {
            id: container_id,
            class: "editor-container h-full w-full",
            // CodeMirror 渲染到此 div
        }
    }
}
```

---

## 支持的 Markdown 特性

### 标准特性（CommonMark）
| 特性 | 语法示例 |
|------|---------|
| 标题 H1-H6 | `# 标题` |
| 粗体 | `**文字**` / `__文字__` |
| 斜体 | `*文字*` / `_文字_` |
| 删除线 | `~~文字~~` |
| 行内代码 | `` `code` `` |
| 代码块 | ` ```lang ` |
| 有序/无序列表 | `- item` / `1. item` |
| 任务列表 | `- [x] 完成` |
| 引用块 | `> 引用` |
| 链接 | `[文字](url)` |
| 图片 | `![alt](url)` |
| 表格（GFM） | `\| a \| b \|` |
| 水平线 | `---` |

### 扩展特性
| 特性 | 语法示例 | 说明 |
|------|---------|------|
| 高亮 | `==高亮文字==` | 自定义扩展 |
| 数学公式（行内） | `$E=mc^2$` | KaTeX 渲染 |
| 数学公式（块） | `$$\int...$$` | KaTeX 渲染 |
| 脚注 | `[^1]` | GFM 扩展 |
| YAML Front Matter | `---\ntitle: ...\n---` | 文档元数据 |
| Mermaid 图表 | ` ```mermaid ` | 通过 Mermaid.js 渲染 |

---

## 快捷键设计

### 通用（桌面端）

| 快捷键 | 功能 |
|--------|------|
| `Ctrl/Cmd + B` | 加粗 |
| `Ctrl/Cmd + I` | 斜体 |
| `Ctrl/Cmd + K` | 插入链接 |
| `Ctrl/Cmd + \`` | 行内代码 |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` | 重做 |
| `Ctrl/Cmd + S` | 保存 |
| `Ctrl/Cmd + F` | 文内搜索 |
| `Ctrl/Cmd + Shift + F` | 全局搜索 |
| `Ctrl/Cmd + N` | 新建笔记 |
| `Ctrl/Cmd + P` | 命令面板 |
| `Tab` | 增加缩进 |
| `Shift + Tab` | 减少缩进 |

### 移动端手势
| 手势 | 功能 |
|------|------|
| 长按选中文字 | 弹出格式菜单（B/I/链接） |
| 下拉刷新 | 同步文件列表 |
| 左滑文件 | 快速删除/归档 |

---

## 自动保存策略

```rust
// crates/core/src/editor_state.rs

pub struct AutoSaveTimer {
    last_edit: Instant,
    delay_ms: u64,      // 默认 500ms
}

impl AutoSaveTimer {
    /// 每次内容变更时调用，重置计时器
    pub fn on_change(&mut self) {
contentcontent        self.last_edit = Instant::now();
    }

    /// 后台 tick，到期则触发保存
    pub fn should_save(&self) -> bool {
        self.last_edit.elapsed().as_millis() as u64 >= self.delay_ms
    }
}
```

自动保存流程：
1. 用户输入 → 更新内存中的 `content` Signal → 标记 `is_dirty = true`
2. 后台 tokio 任务每 100ms 检查 `AutoSaveTimer`
3. 距最后一次输入超过 500ms → 写入文件 → `is_dirty = false`
4. 应用失去焦点时立即触发保存（无论计时器状态）

---

## 图片处理

### 插入图片
1. **拖拽**：监听 `dragover` / `drop` 事件，将图片复制到 `assets/` 目录，插入相对路径引用
2. **粘贴**：监听 `paste` 事件，同上
3. **文件选择**：通过平台文件对话框选择，同上

### 图片路径规则
```markdown
<!-- 相对路径（推荐，跨设备兼容） -->
![图片说明](assets/image.png)

<!-- 外链（直接渲染，不下载） -->
![图片说明](https://example.com/image.png)
```

### 图片缩放
- 渲染时自动限制最大宽度为编辑器宽度
- 支持 `![alt](url =500x300)` 语法指定尺寸（扩展）

---

## 代码块高亮

使用 `syntect` 在 Rust 侧生成带高亮的 HTML，嵌入渲染结果：

```rust
use syntect::highlighting::ThemeSet;
use syntect::html::highlighted_html_for_string;
use syntect::parsing::SyntaxSet;

pub fn highlight_code(code: &str, lang: &str, dark: bool) -> String {
    let ss = SyntaxSet::load_defaults_newlines();
    let ts = ThemeSet::load_defaults();
    let theme_name = if dark { "base16-ocean.dark" } else { "base16-ocean.light" };
    let theme = &ts.themes[theme_name];
    let syntax = ss.find_syntax_by_token(lang)
        .unwrap_or_else(|| ss.find_syntax_plain_text());
    highlighted_html_for_string(code, &ss, syntax, theme)
        .unwrap_or_else(|_| format!("<pre><code>{}</code></pre>", html_escape(code)))
}
```
