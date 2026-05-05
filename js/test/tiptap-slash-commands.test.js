import test from "node:test";
import assert from "node:assert/strict";

import {
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
      toggleBulletList: () => {
        calls.push(["toggleBulletList"]);
        return true;
      },
      toggleCodeBlock: () => {
        calls.push(["toggleCodeBlock"]);
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
    "code-block",
    "divider",
    "table",
    "math-block",
    "mermaid",
    "image",
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
      "\n| Column | Notes |\n| --- | --- |\n|  |  |\n",
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

test("Tiptap slash command controller reports unknown commands", () => {
  const controller = createTiptapSlashCommandController();

  assert.deepEqual(controller.run("unknown"), {
    ok: false,
    error: "unknown_slash_command",
    commandId: "unknown",
  });
});
