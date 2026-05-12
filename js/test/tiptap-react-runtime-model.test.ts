import test from "node:test";
import assert from "node:assert/strict";

import { importBundledModule } from "./helpers/load-esbuild-module.js";

const {
  createPapyroTiptapCommandExecutor,
  createPapyroTiptapFormatSnapshot,
  createPapyroTiptapRuntimeModel,
  createPapyroTiptapSelectionSnapshot,
  normalizePapyroTiptapLanguage,
  normalizePapyroTiptapViewMode,
  samePapyroTiptapFormatSnapshot,
  samePapyroTiptapSelectionSnapshot,
} = await importBundledModule(
  new URL("../src/tiptap-react/runtime-model.ts", import.meta.url),
);

test("Tiptap React runtime model normalizes host language and view mode", () => {
  assert.equal(normalizePapyroTiptapLanguage("zh-CN"), "chinese");
  assert.equal(normalizePapyroTiptapLanguage({ preferences: { language: "zh_cn" } }), "chinese");
  assert.equal(normalizePapyroTiptapLanguage({ preferences: { language: "English" } }), "english");
  assert.equal(normalizePapyroTiptapViewMode("source"), "source");
  assert.equal(normalizePapyroTiptapViewMode({ viewMode: "preview" }), "preview");
  assert.equal(normalizePapyroTiptapViewMode({ viewMode: "unknown" }), "hybrid");
});

test("Tiptap React runtime model snapshots cursor range and table selections", () => {
  assert.deepEqual(createPapyroTiptapSelectionSnapshot(null), {
    kind: "none",
    empty: true,
    from: null,
    to: null,
    anchor: null,
    head: null,
    table: null,
  });

  assert.deepEqual(
    createPapyroTiptapSelectionSnapshot({
      state: {
        selection: {
          empty: false,
          from: 4,
          to: 12,
          anchor: 12,
          head: 4,
        },
      },
    }),
    {
      kind: "range",
      empty: false,
      from: 4,
      to: 12,
      anchor: 12,
      head: 4,
      table: null,
    },
  );

  assert.deepEqual(
    createPapyroTiptapSelectionSnapshot({
      state: {
        selection: {
          empty: false,
          from: 8,
          to: 24,
          $anchorCell: { pos: 10 },
          $headCell: { pos: 18 },
        },
      },
    }),
    {
      kind: "table",
      empty: false,
      from: 8,
      to: 24,
      anchor: 8,
      head: 24,
      table: {
        anchorCell: 10,
        headCell: 18,
      },
    },
  );
});

test("Tiptap React command executor routes known command scopes", () => {
  const calls = [];
  const controller = (scope) => ({
    run(commandId, context) {
      calls.push([scope, commandId, context.tabId, context.message?.type]);
      return { ok: true, commandId, error: null };
    },
  });
  const entry = {
    slashCommands: controller("slash"),
    formatCommands: controller("format"),
    historyCommands: controller("history"),
    blockActions: controller("block"),
    tableCommands: controller("table"),
  };
  const executor = createPapyroTiptapCommandExecutor({
    editor: { id: "editor" },
    entry,
    tabId: "tab-a",
  });

  assert.equal(executor.runInsert("table", { message: { type: "insert" } }).ok, true);
  assert.equal(executor.runFormat("bold").ok, true);
  assert.equal(executor.runHistory("undo").ok, true);
  assert.equal(executor.runBlockAction("copy-block").ok, true);
  assert.equal(executor.runTableAction("merge-cells").ok, true);
  assert.deepEqual(calls, [
    ["slash", "table", "tab-a", "insert"],
    ["format", "bold", "tab-a", undefined],
    ["history", "undo", "tab-a", undefined],
    ["block", "copy-block", "tab-a", undefined],
    ["table", "merge-cells", "tab-a", undefined],
  ]);
});

test("Tiptap React command executor reports missing table command controllers", () => {
  const executor = createPapyroTiptapCommandExecutor({
    entry: {},
    tabId: "tab-a",
  });

  assert.deepEqual(executor.runTableAction("merge-cells"), {
    ok: false,
    commandId: "merge-cells",
    error: "missing_table_command_controller",
  });
});

test("Tiptap React runtime model exposes stable hooks data", () => {
  const entry = {
    preferences: { language: "zh-CN" },
    viewMode: "hybrid",
    dioxus: { send() {} },
    dom: { dataset: { tabId: "tab-b" } },
    slashCommands: {
      run(commandId) {
        return { ok: true, commandId, error: null };
      },
    },
  };
  const editor = {
    state: {
      selection: {
        empty: true,
        from: 6,
        to: 6,
      },
    },
  };

  const model = createPapyroTiptapRuntimeModel({ editor, entry });

  assert.equal(model.editor, editor);
  assert.equal(model.entry, entry);
  assert.equal(model.language, "chinese");
  assert.equal(model.viewMode, "hybrid");
  assert.equal(model.preferences, entry.preferences);
  assert.deepEqual(model.selection, {
    kind: "cursor",
    empty: true,
    from: 6,
    to: 6,
    anchor: 6,
    head: 6,
    table: null,
  });
  assert.equal(model.format.marks.bold, false);
  assert.equal(model.format.textColors.ink, true);
  assert.equal(model.commands.runInsert("paragraph").ok, true);
});

test("Tiptap React runtime model accepts an externally subscribed selection snapshot", () => {
  const selection = Object.freeze({
    kind: "range",
    empty: false,
    from: 2,
    to: 8,
    anchor: 2,
    head: 8,
    table: null,
  });
  const model = createPapyroTiptapRuntimeModel({
    editor: {
      state: {
        selection: {
          empty: true,
          from: 1,
          to: 1,
        },
      },
    },
    entry: {
      preferences: { language: "english" },
      viewMode: "hybrid",
    },
    selection,
  });

  assert.equal(model.selection, selection);
});

test("Tiptap React selection snapshots compare by value", () => {
  const cursor = createPapyroTiptapSelectionSnapshot({
    state: {
      selection: {
        empty: true,
        from: 3,
        to: 3,
      },
    },
  });
  const sameCursor = createPapyroTiptapSelectionSnapshot({
    state: {
      selection: {
        empty: true,
        from: 3,
        to: 3,
      },
    },
  });
  const nextCursor = createPapyroTiptapSelectionSnapshot({
    state: {
      selection: {
        empty: true,
        from: 4,
        to: 4,
      },
    },
  });
  const tableSelection = createPapyroTiptapSelectionSnapshot({
    state: {
      selection: {
        empty: false,
        from: 8,
        to: 24,
        $anchorCell: { pos: 10 },
        $headCell: { pos: 18 },
      },
    },
  });
  const sameTableSelection = createPapyroTiptapSelectionSnapshot({
    state: {
      selection: {
        empty: false,
        from: 8,
        to: 24,
        $anchorCell: { pos: 10 },
        $headCell: { pos: 18 },
      },
    },
  });

  assert.equal(samePapyroTiptapSelectionSnapshot(cursor, sameCursor), true);
  assert.equal(samePapyroTiptapSelectionSnapshot(cursor, nextCursor), false);
  assert.equal(
    samePapyroTiptapSelectionSnapshot(tableSelection, sameTableSelection),
    true,
  );
  assert.equal(samePapyroTiptapSelectionSnapshot(tableSelection, cursor), false);
});

test("Tiptap React runtime model exposes format snapshots", () => {
  const format = createPapyroTiptapFormatSnapshot({
    isActive(name) {
      return name === "bold";
    },
    getAttributes(name) {
      if (name === "textStyle") return { color: "var(--mn-danger)" };
      return {};
    },
  });
  const model = createPapyroTiptapRuntimeModel({
    editor: null,
    entry: { viewMode: "hybrid" },
    format,
  });
  const same = createPapyroTiptapFormatSnapshot({
    isActive(name) {
      return name === "bold";
    },
    getAttributes(name) {
      if (name === "textStyle") return { color: "var(--mn-danger)" };
      return {};
    },
  });

  assert.equal(model.format, format);
  assert.equal(format.marks.bold, true);
  assert.equal(format.textColors.danger, true);
  assert.equal(samePapyroTiptapFormatSnapshot(format, same), true);
  assert.equal(
    samePapyroTiptapFormatSnapshot(format, createPapyroTiptapFormatSnapshot(null)),
    false,
  );
});
