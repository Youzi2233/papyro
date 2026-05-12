import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroTiptapFormatSnapshot,
  samePapyroTiptapFormatSnapshot,
} from "../src/tiptap-format-snapshot.js";

function createEditor({ active = [], textColor = null, highlightColor = null } = {}) {
  const activeMarks = new Set(active);
  return {
    isActive(name, attrs) {
      if (!attrs) return activeMarks.has(name);
      return activeMarks.has(`${name}:${attrs.color}`);
    },
    getAttributes(name) {
      if (name === "textStyle") return { color: textColor };
      if (name === "highlight") return { color: highlightColor };
      return {};
    },
  };
}

test("Tiptap format snapshot reads active marks and style attrs", () => {
  const snapshot = createPapyroTiptapFormatSnapshot(createEditor({
    active: [
      "bold",
      "link",
      "highlight:rgba(59, 130, 246, 0.18)",
    ],
    textColor: "var(--mn-danger)",
  }));

  assert.equal(snapshot.marks.bold, true);
  assert.equal(snapshot.marks.italic, false);
  assert.equal(snapshot.marks.link, true);
  assert.equal(snapshot.textColors.ink, false);
  assert.equal(snapshot.textColors.danger, true);
  assert.equal(snapshot.highlights.blue, true);
  assert.equal(snapshot.highlights.yellow, false);
  assert.equal(snapshot.textColor, "var(--mn-danger)");
});

test("Tiptap format snapshot treats missing text color as default ink", () => {
  const snapshot = createPapyroTiptapFormatSnapshot(createEditor());

  assert.equal(snapshot.textColors.ink, true);
  assert.equal(snapshot.textColor, null);
  assert.equal(snapshot.highlightColor, null);
});

test("Tiptap format snapshots compare by selected state values", () => {
  const left = createPapyroTiptapFormatSnapshot(createEditor({
    active: ["bold"],
    highlightColor: "rgba(245, 158, 11, 0.2)",
  }));
  const same = createPapyroTiptapFormatSnapshot(createEditor({
    active: ["bold"],
    highlightColor: "rgba(245, 158, 11, 0.2)",
  }));
  const different = createPapyroTiptapFormatSnapshot(createEditor({
    active: ["italic"],
  }));

  assert.equal(samePapyroTiptapFormatSnapshot(left, same), true);
  assert.equal(samePapyroTiptapFormatSnapshot(left, different), false);
});
