import test from "node:test";
import assert from "node:assert/strict";

import {
  createMarkdownCodeBlock,
  createMarkdownCallout,
  createMarkdownTable,
  createTiptapSlashCommandController,
  PAPYRO_TIPTAP_SLASH_COMMANDS,
} from "../src/tiptap-slash-commands.js";

function createFakeEditor() {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
      setHorizontalRule: () => {
        calls.push(["setHorizontalRule"]);
        return true;
      },
      setParagraph: () => {
        calls.push(["setParagraph"]);
        return true;
      },
      toggleBlockquote: () => {
        calls.push(["toggleBlockquote"]);
        return true;
      },
      setCalloutBlock: (attrs) => {
        calls.push(["setCalloutBlock", attrs.kind, attrs.text]);
        return true;
      },
      toggleBulletList: () => {
        calls.push(["toggleBulletList"]);
        return true;
      },
      toggleCodeBlock: (attrs = null) => {
        calls.push(["toggleCodeBlock", attrs?.language ?? null]);
        return true;
      },
      toggleHeading: (attrs) => {
        calls.push(["toggleHeading", attrs.level]);
        return true;
      },
      insertTable: (attrs) => {
        calls.push(["insertTable", attrs.rows, attrs.cols, attrs.withHeaderRow]);
        return true;
      },
      setMathBlock: (attrs) => {
        calls.push(["setMathBlock", attrs.source]);
        return true;
      },
      setMermaidBlock: (attrs) => {
        calls.push(["setMermaidBlock", attrs.source]);
        return true;
      },
      setImage: (attrs) => {
        calls.push(["setImage", attrs.src, attrs.alt, attrs.title]);
        return true;
      },
      toggleOrderedList: () => {
        calls.push(["toggleOrderedList"]);
        return true;
      },
    },
  };

  return { calls, editor };
}

test("Tiptap slash commands expose stable command ids", () => {
  const commandIds = PAPYRO_TIPTAP_SLASH_COMMANDS.map((command) => command.id);

  assert.deepEqual(commandIds, [
    "paragraph",
    "heading-1",
    "heading-2",
    "heading-3",
    "bullet-list",
    "ordered-list",
    "task-list",
    "blockquote",
    "callout",
    "code-block",
    "divider",
    "table",
    "image",
    "math-block",
    "mermaid",
  ]);
});

test("Tiptap slash command query ranks exact aliases before fuzzy matches", () => {
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(
    controller.query("h2", { limit: 3 }).map((command) => command.id),
    ["heading-2"],
  );
  assert.deepEqual(
    controller.query("标题", { limit: 3 }).map((command) => command.id),
    ["heading-1", "heading-2", "heading-3"],
  );
  assert.deepEqual(
    controller.query("code", { limit: 2 }).map((command) => command.id),
    ["code-block", "mermaid"],
  );
});

test("Tiptap slash command query localizes visible command labels", () => {
  const controller = createTiptapSlashCommandController();
  const englishCommand = controller.query("h1")[0];

  assert.deepEqual(controller.query("h1", { language: "Chinese" })[0], {
    id: "heading-1",
    title: "一级标题",
    description: "大型章节标题",
    group: "文本",
    icon: "heading-1",
    aliases: ["h1", "title"],
    keywords: ["heading", "headline", "标题", "一级标题"],
    priority: 20,
    run: englishCommand.run,
    index: 0,
    sourceIndex: 1,
    recent: false,
  });

  assert.equal(controller.query("table", { language: "Chinese" })[0].group, "数据");
  assert.equal(controller.query("image", { language: "Chinese" })[0].group, "媒体");
});

test("Tiptap slash command query separates visible and source indexes", () => {
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(
    controller.query("table", { limit: 1 }).map((command) => ({
      id: command.id,
      index: command.index,
      sourceIndex: command.sourceIndex,
    })),
    [{ id: "table", index: 0, sourceIndex: 11 }],
  );
});

test("Tiptap slash commands promote recent commands in empty insert menus", () => {
  const { editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  controller.run("table", { editor });
  controller.run("code-block", { editor, codeLanguage: "rust" });

  assert.deepEqual(controller.recentCommandIds, ["code-block", "table"]);
  assert.deepEqual(
    controller.query("", { limit: 4 }).map((command) => ({
      id: command.id,
      group: command.group,
      recent: command.recent,
      index: command.index,
      sourceIndex: command.sourceIndex,
    })),
    [
      { id: "code-block", group: "Recent", recent: true, index: 0, sourceIndex: 9 },
      { id: "table", group: "Recent", recent: true, index: 1, sourceIndex: 11 },
      { id: "paragraph", group: "Text", recent: false, index: 2, sourceIndex: 0 },
      { id: "heading-1", group: "Text", recent: false, index: 3, sourceIndex: 1 },
    ],
  );
  assert.equal(controller.query("", { language: "Chinese", limit: 1 })[0].group, "最近使用");
  assert.equal(controller.query("table", { limit: 1 })[0].group, "Data");
});

test("Tiptap slash commands call rich editor commands when available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("heading-2", { editor }), {
    ok: true,
    commandId: "heading-2",
    error: null,
  });
  assert.deepEqual(calls, [["toggleHeading", 2], ["focus"]]);
});

test("Tiptap slash commands create rich tables when the table extension is available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("table", { editor }), {
    ok: true,
    commandId: "table",
    error: null,
  });
  assert.deepEqual(calls, [
    ["insertTable", 3, 2, true],
    ["focus"],
  ]);
});

test("Tiptap slash commands create tables with requested dimensions", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.equal(
    controller.run("table", { editor, tableSize: { rows: 4, cols: 5 } }).ok,
    true,
  );
  assert.deepEqual(calls, [
    ["insertTable", 4, 5, true],
    ["focus"],
  ]);
  assert.equal(
    createMarkdownTable(2, 3),
    "\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n",
  );
});

test("Tiptap slash commands create rich math blocks when the math extension is available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("math-block", { editor }), {
    ok: true,
    commandId: "math-block",
    error: null,
  });
  assert.deepEqual(calls, [
    ["setMathBlock", "x^2 + y^2 = z^2"],
    ["focus"],
  ]);
});

test("Tiptap slash commands create rich callout blocks when available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("callout", { editor }), {
    ok: true,
    commandId: "callout",
    error: null,
  });
  assert.deepEqual(calls, [
    ["setCalloutBlock", "NOTE", "Callout text"],
    ["focus"],
  ]);
});

test("Tiptap slash commands create code blocks with requested languages", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("code-block", { editor, codeLanguage: "rust" }), {
    ok: true,
    commandId: "code-block",
    error: null,
  });
  assert.deepEqual(calls, [
    ["toggleCodeBlock", "rust"],
    ["focus"],
  ]);
});

test("Tiptap slash commands create requested callout kinds", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("callout", { editor, calloutKind: "warning" }), {
    ok: true,
    commandId: "callout",
    error: null,
  });
  assert.deepEqual(calls, [
    ["setCalloutBlock", "WARNING", "Callout text"],
    ["focus"],
  ]);
});

test("Tiptap slash commands create rich Mermaid blocks when the Mermaid extension is available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("mermaid", { editor }), {
    ok: true,
    commandId: "mermaid",
    error: null,
  });
  assert.deepEqual(calls, [
    ["setMermaidBlock", "flowchart TD\n  A --> B"],
    ["focus"],
  ]);
});

test("Tiptap slash commands create rich images when the image extension is available", () => {
  const { calls, editor } = createFakeEditor();
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("image", { editor }), {
    ok: true,
    commandId: "image",
    error: null,
  });
  assert.deepEqual(calls, [
    ["setImage", "assets/image.png", "alt text", ""],
    ["focus"],
  ]);
});

test("Tiptap slash commands fall back to Markdown when an editor command is unavailable", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("heading-1", { editor }), {
    ok: true,
    commandId: "heading-1",
    error: null,
  });
  assert.deepEqual(calls, [["insertContent", "# ", "markdown"], ["focus"]]);
});

test("Tiptap slash commands fall back to Markdown for tables without table commands", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("table", { editor }), {
    ok: true,
    commandId: "table",
    error: null,
  });
  assert.deepEqual(calls, [
    [
      "insertContent",
      "\n| Column 1 | Column 2 |\n| --- | --- |\n|  |  |\n|  |  |\n",
      "markdown",
    ],
    ["focus"],
  ]);
});

test("Tiptap slash commands fall back to Markdown for images without image commands", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("image", { editor }), {
    ok: true,
    commandId: "image",
    error: null,
  });
  assert.deepEqual(calls, [
    ["insertContent", "![alt text](assets/image.png)", "markdown"],
    ["focus"],
  ]);
});

test("Tiptap slash commands fall back to Markdown for callouts", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("callout", { editor, calloutKind: "tip" }), {
    ok: true,
    commandId: "callout",
    error: null,
  });
  assert.equal(createMarkdownCallout(), "\n> [!NOTE]\n> Callout text\n");
  assert.deepEqual(calls, [
    ["insertContent", "\n> [!TIP]\n> Callout text\n", "markdown"],
    ["focus"],
  ]);
});

test("Tiptap slash commands fall back to Markdown for code block languages", () => {
  const calls = [];
  const editor = {
    commands: {
      focus: () => calls.push(["focus"]),
      insertContent: (content, options) => {
        calls.push(["insertContent", content, options.contentType]);
        return true;
      },
    },
  };
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("code-block", { editor, codeLanguage: "typescript" }), {
    ok: true,
    commandId: "code-block",
    error: null,
  });
  assert.equal(createMarkdownCodeBlock("ts"), "```typescript\ncode\n```");
  assert.deepEqual(calls, [
    ["insertContent", "```typescript\ncode\n```", "markdown"],
    ["focus"],
  ]);
});

test("Tiptap slash command controller reports unknown commands", () => {
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("unknown"), {
    ok: false,
    error: "unknown_slash_command",
    commandId: "unknown",
  });
});
