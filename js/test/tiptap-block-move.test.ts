import test from "node:test";
import assert from "node:assert/strict";

import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection } from "@tiptap/pm/state";

import {
  blockSiblingDrop,
  createTiptapBlockMove,
  moveTiptapBlock,
} from "../src/tiptap-block-move.js";

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "text*",
      group: "block",
      selectable: true,
      toDOM: () => ["p", 0],
      parseDOM: [{ tag: "p" }],
    },
    text: { group: "inline" },
  },
  marks: {},
});

function paragraph(text) {
  return schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
}

function createMoveHarness(texts = ["one", "two", "three"]) {
  const calls = [];
  let state = EditorState.create({
    doc: schema.nodes.doc.create(null, texts.map((text) => paragraph(text))),
  });
  const editor = {
    get state() {
      return state;
    },
    view: {
      dispatch(transaction) {
        calls.push(["dispatch", transaction.selection.from]);
        state = state.apply(transaction);
      },
    },
    commands: {
      focus(pos = null) {
        calls.push(["focus", pos]);
        return true;
      },
      setNodeSelection(pos) {
        calls.push(["setNodeSelection", pos]);
        return true;
      },
      setTextSelection(pos) {
        calls.push(["setTextSelection", pos]);
        return true;
      },
    },
  };
  return { calls, editor };
}

function paragraphTexts(doc) {
  const texts = [];
  doc.descendants((node) => {
    if (node.type.name === "paragraph") {
      texts.push(node.textContent);
      return false;
    }
    return true;
  });
  return texts;
}

test("Tiptap block move reorders a real ProseMirror document downward", () => {
  const { calls, editor } = createMoveHarness();
  const source = { pos: 0, node: editor.state.doc.nodeAt(0) };
  const move = createTiptapBlockMove(editor, source, { pos: 10 });

  assert.equal(move.pos, 5);
  assert.equal(move.selection instanceof NodeSelection, true);
  assert.equal(move.selection.from, 5);
  assert.deepEqual(paragraphTexts(move.tr.doc), ["two", "one", "three"]);

  assert.equal(moveTiptapBlock(editor, source, { pos: 10 }), true);
  assert.deepEqual(paragraphTexts(editor.state.doc), ["two", "one", "three"]);
  assert.equal(editor.state.selection.from, 5);
  assert.equal(editor.state.selection.node.textContent, "one");
  assert.deepEqual(calls, [
    ["dispatch", 5],
    ["focus", null],
  ]);
});

test("Tiptap block move reorders a real ProseMirror document upward", () => {
  const { editor } = createMoveHarness();
  const source = { pos: 10, node: editor.state.doc.nodeAt(10) };
  const move = createTiptapBlockMove(editor, source, { pos: 0 });

  assert.equal(move.pos, 0);
  assert.deepEqual(paragraphTexts(move.tr.doc), ["three", "one", "two"]);
  assert.equal(move.selection.from, 0);
  assert.equal(move.selection.node.textContent, "three");
});

test("Tiptap block sibling drops use real document positions", () => {
  const { editor } = createMoveHarness();

  assert.deepEqual(
    blockSiblingDrop(editor, { pos: 5, node: editor.state.doc.nodeAt(5) }, "up"),
    { pos: 0, placement: "before" },
  );
  assert.deepEqual(
    blockSiblingDrop(editor, { pos: 5, node: editor.state.doc.nodeAt(5) }, "down"),
    { pos: 17, placement: "after" },
  );
  assert.equal(
    blockSiblingDrop(editor, { pos: 0, node: editor.state.doc.nodeAt(0) }, "up"),
    null,
  );
  assert.equal(
    blockSiblingDrop(editor, { pos: 10, node: editor.state.doc.nodeAt(10) }, "down"),
    null,
  );
});

test("Tiptap block move rejects self drops without dispatching", () => {
  const { calls, editor } = createMoveHarness();
  const source = { pos: 0, node: editor.state.doc.nodeAt(0) };

  assert.equal(createTiptapBlockMove(editor, source, { pos: 2 }), null);
  assert.equal(moveTiptapBlock(editor, source, { pos: 2 }), false);
  assert.deepEqual(paragraphTexts(editor.state.doc), ["one", "two", "three"]);
  assert.deepEqual(calls, []);
});
