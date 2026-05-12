import test from "node:test";
import assert from "node:assert/strict";

import {
  autoLinkSelectedTextOnPaste,
  createTiptapPasteController,
} from "../src/tiptap-paste-controller.js";

function createEditor({
  text = "Read docs",
  from = 5,
  to = 9,
  autoLinkPaste = true,
} = {}) {
  const calls = [];
  const state = {
    doc: {
      textBetween(start, end) {
        return text.slice(start, end);
      },
    },
    selection: {
      empty: from === to,
      from,
      to,
    },
  };
  const editor = {
    state,
    commands: {
      focus: () => calls.push(["focus"]),
      setLink: (attrs) => {
        calls.push(["setLink", attrs.href]);
        return true;
      },
      setTextSelection: (range) => {
        calls.push(["setTextSelection", range.from, range.to]);
        return true;
      },
    },
  };

  return {
    calls,
    editor,
    entry: { preferences: { autoLinkPaste } },
    event: {
      clipboardData: {
        getData: () => "https://example.test/docs",
      },
      preventDefault: () => calls.push(["preventDefault"]),
    },
    view: { state },
  };
}

test("Tiptap paste controller links selected text when auto link paste is enabled", () => {
  const { calls, editor, event, view } = createEditor();

  assert.equal(
    autoLinkSelectedTextOnPaste({
      editor,
      event,
      view,
      preferences: { autoLinkPaste: true },
    }),
    true,
  );

  assert.deepEqual(calls, [
    ["setTextSelection", 5, 9],
    ["setLink", "https://example.test/docs"],
    ["preventDefault"],
    ["focus"],
  ]);
});

test("Tiptap paste controller respects disabled auto link paste", () => {
  const { calls, editor, event, view } = createEditor();

  assert.equal(
    autoLinkSelectedTextOnPaste({
      editor,
      event,
      view,
      preferences: { autoLinkPaste: false },
    }),
    false,
  );
  assert.deepEqual(calls, []);
});

test("Tiptap paste controller ignores non URLs and empty selections", () => {
  const nonUrl = createEditor();
  nonUrl.event.clipboardData.getData = () => "not a url";

  assert.equal(
    autoLinkSelectedTextOnPaste({
      editor: nonUrl.editor,
      event: nonUrl.event,
      view: nonUrl.view,
      preferences: { autoLinkPaste: true },
    }),
    false,
  );

  const emptySelection = createEditor({ from: 5, to: 5 });
  assert.equal(
    autoLinkSelectedTextOnPaste({
      editor: emptySelection.editor,
      event: emptySelection.event,
      view: emptySelection.view,
      preferences: { autoLinkPaste: true },
    }),
    false,
  );
});

test("Tiptap paste controller uses attached entry preferences", () => {
  const { calls, editor, entry, event, view } = createEditor({ autoLinkPaste: false });
  const controller = createTiptapPasteController();
  controller.attach({ editor, entry });

  assert.equal(controller.handlePaste({ event, view }), false);
  assert.deepEqual(calls, []);
});
