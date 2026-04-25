> **历史文档** — 本文写于项目早期（当时项目名为 Mark-Note），部分设计已演进。保留供参考。

# 数据模型设计

## 概述

Mark-Note 采用**双轨存储**策略：
- **`.md` 文件**：内容本身，与 Typora / Obsidian 等工具完全兼容
- **SQLite 数据库**：元数据、索引、标签，不修改 `.md` 文件内容

---

## SQLite 数据库 Schema

数据库文件默认存放在：
- macOS：`~/Library/Application Support/mark-note/meta.db`
- Windows：`%APPDATA%\mark-note\meta.db`
- iOS：`<AppSandbox>/Documents/mark-note/meta.db`
- Android：`<AppSandbox>/files/mark-note/meta.db`

### 表结构

```sql
-- 工作空间（可以打开多个文件夹）
CREATE TABLE workspaces (
    id          TEXT PRIMARY KEY,       -- UUID
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,   -- 绝对路径
    created_at  INTEGER NOT NULL,       -- Unix timestamp (ms)
    last_opened INTEGER,
    sort_order  INTEGER DEFAULT 0
);

-- 笔记文件
CREATE TABLE notes (
    id              TEXT PRIMARY KEY,   -- UUID
    workspace_id    TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    relative_path   TEXT NOT NULL,      -- 相对 workspace 的路径
    title           TEXT NOT NULL,      -- 从 H1 或文件名提取
    created_at      INTEGER NOT NULL,
    updated_at      INTEGER NOT NULL,
    word_count      INTEGER DEFAULT 0,
    char_count      INTEGER DEFAULT 0,
    is_favorite     INTEGER DEFAULT 0,  -- Boolean
    is_trashed      INTEGER DEFAULT 0,  -- 软删除
    trashed_at      INTEGER,
    front_matter    TEXT,               -- YAML front matter (JSON 存储)
    UNIQUE(workspace_id, relative_path)
);

-- 标签
CREATE TABLE tags (
    id      TEXT PRIMARY KEY,
    name    TEXT NOT NULL UNIQUE,
    color   TEXT DEFAULT '#6B7280'      -- HEX 颜色
);

-- 笔记-标签关联
CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

-- 最近打开记录
CREATE TABLE recent_files (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id     TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    opened_at   INTEGER NOT NULL,
    cursor_pos  INTEGER DEFAULT 0       -- 记录上次光标位置
);

-- 用户设置（KV 存储）
CREATE TABLE settings (
    key     TEXT PRIMARY KEY,
    value   TEXT NOT NULL               -- JSON 值
);

-- 索引
CREATE INDEX idx_notes_workspace    ON notes(workspace_id);
CREATE INDEX idx_notes_updated      ON notes(updated_at DESC);
CREATE INDEX idx_notes_favorite     ON notes(is_favorite) WHERE is_favorite = 1;
CREATE INDEX idx_note_tags_note     ON note_tags(note_id);
CREATE INDEX idx_note_tags_tag      ON note_tags(tag_id);
CREATE INDEX idx_recent_opened      ON recent_files(opened_at DESC);
```

---

## Rust 数据结构

### crates/core/src/models.rs

```rust
use serde::{Deserialize, Serialize};

/// 工作空间
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    pub created_at: i64,
    pub last_opened: Option<i64>,
    pub sort_order: i32,
}

/// 笔记元数据（不含正文）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NoteMeta {
    pub id: String,
    pub workspace_id: String,
    pub relative_path: PathBuf,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub word_count: u32,
    pub char_count: u32,
    pub is_favorite: bool,
    pub is_trashed: bool,
    pub tags: Vec<Tag>,
}

/// 带正文内容的完整笔记
#[derive(Debug, Clone)]
pub struct Note {
    pub meta: NoteMeta,
    pub content: String,    // 原始 Markdown 文本
    pub front_matter: Option<FrontMatter>,
}

/// YAML front matter
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FrontMatter {
    pub title: Option<String>,
    pub date: Option<String>,
    pub tags: Option<Vec<String>>,
    pub aliases: Option<Vec<String>>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// 标签
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

/// 用户设置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: Theme,
    pub font_family: String,
    pub font_size: u8,          // 单位: px，范围 12-32
    pub line_height: f32,       // 1.2 ~ 2.0
    pub editor_width: EditorWidth,
    pub auto_save: AutoSave,
    pub spell_check: bool,
    pub show_word_count: bool,
    pub default_workspace: Option<String>,
    pub tab_size: u8,           // 2 or 4
    pub indent_with_tabs: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum Theme {
    #[default]
    System,     // 跟随系统
    Light,
    Dark,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub enum EditorWidth {
    Normal,     // ~800px
    #[default]
    Wide,       // ~1000px
    Full,       // 100%
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AutoSave {
    Off,
    Delay(u16),     // 延迟 N 毫秒后保存（默认 500ms）
    OnFocusLost,    // 失去焦点时保存
}
```

---

## 编辑器 AST

### crates/editor/src/parser/ast.rs

```rust
/// Markdown 文档 AST 节点
#[derive(Debug, Clone)]
pub enum Node {
    Document(Vec<Node>),

    // 块级节点
    Heading { level: u8, children: Vec<InlineNode>, id: String },
    Paragraph(Vec<InlineNode>),
    CodeBlock { lang: Option<String>, content: String },
    BlockQuote(Vec<Node>),
    List { ordered: bool, items: Vec<ListItem> },
    Table { headers: Vec<TableCell>, rows: Vec<Vec<TableCell>> },
    ThematicBreak,
    HtmlBlock(String),

    // 特殊块
    FrontMatter(String),    // YAML front matter 原始文本
    MathBlock(String),      // $$ ... $$ (KaTeX)
}

#[derive(Debug, Clone)]
pub struct ListItem {
    pub checked: Option<bool>,  // None = 普通列表；Some = 任务列表
    pub children: Vec<Node>,
}

#[derive(Debug, Clone)]
pub struct TableCell {
    pub children: Vec<InlineNode>,
    pub align: Option<Alignment>,
}

#[derive(Debug, Clone)]
pub enum Alignment { Left, Center, Right }

/// 内联节点
#[derive(Debug, Clone)]
pub enum InlineNode {
    Text(String),
    Bold(Vec<InlineNode>),
    Italic(Vec<InlineNode>),
    BoldItalic(Vec<InlineNode>),
    Code(String),
    Link { text: Vec<InlineNode>, url: String, title: Option<String> },
    Image { alt: String, url: String, title: Option<String> },
    Strikethrough(Vec<InlineNode>),
    Highlight(Vec<InlineNode>),     // ==高亮== (扩展)
    InlineMath(String),             // $...$ (KaTeX)
    HardBreak,
    SoftBreak,
}
```

---

## 文件系统布局

用户工作空间示例：
```
~/Documents/MyNotes/         ← workspace root
├── .mark-note/              ← 隐藏配置目录（不污染用户文件）
│   └── .gitignore           ← 排除此目录
├── 日记/
│   ├── 2025-01-01.md
│   └── 2025-01-02.md
├── 工作/
│   ├── 项目A.md
│   └── assets/
│       └── diagram.png      ← 附件与笔记同级
├── 读书笔记.md
└── README.md
```

**设计原则**：
1. 不在工作空间目录写入任何元数据文件（元数据全在 SQLite）
2. 附件存放在笔记同级的 `assets/` 目录（或任意用户指定位置）
3. 完全兼容 Git 版本控制工作流

---

## 状态管理（Dioxus Signals）

```rust
// crates/core/src/lib.rs

/// 全局应用状态 - 通过 Dioxus Context 注入
pub struct AppState {
    // 工作空间
    pub workspaces: Signal<Vec<Workspace>>,
    pub active_workspace: Signal<Option<Workspace>>,

    // 文件树
    pub file_tree: Signal<Vec<FileNode>>,

    // 编辑器标签页
    pub tabs: Signal<Vec<EditorTab>>,
    pub active_tab: Signal<Option<usize>>,

    // 搜索
    pub search_query: Signal<String>,
    pub search_results: Signal<Vec<SearchResult>>,

    // UI
    pub settings: Signal<AppSettings>,
    pub sidebar_visible: Signal<bool>,
    pub command_palette_open: Signal<bool>,
}

#[derive(Debug, Clone)]
pub struct EditorTab {
    pub note_id: String,
    pub title: String,
    pub content: Signal<String>,    // 编辑中的原始内容
    pub is_dirty: Signal<bool>,     // 未保存标记
    pub cursor: Signal<CursorPos>,
}

#[derive(Debug, Clone, Default)]
pub struct CursorPos {
    pub line: usize,
    pub column: usize,
    pub selection: Option<(usize, usize)>,  // 字节偏移范围
}
```
