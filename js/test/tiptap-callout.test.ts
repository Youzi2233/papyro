import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroCalloutExtensions,
  tokenizeCalloutBlock,
} from "../src/tiptap-callout.js";

test("Papyro callout extensions expose the callout block node", () => {
  const extensions = createPapyroCalloutExtensions();

  assert.deepEqual(extensions.map((extension) => extension.name), ["calloutBlock"]);
});

test("callout tokenizer reads Markdown admonition blockquotes", () => {
  const token = tokenizeCalloutBlock(
    "> [!TIP]\r\n> Use small commits.\r\n> Keep Markdown portable.\r\nPlain text",
    [],
    {
      blockTokens(markdown) {
        return [{ type: "paragraph", raw: markdown, text: markdown }];
      },
    },
  );

  assert.deepEqual(token, {
    type: "calloutBlock",
    raw: "> [!TIP]\r\n> Use small commits.\r\n> Keep Markdown portable.\r\n",
    kind: "TIP",
    text: "Use small commits.\nKeep Markdown portable.",
    tokens: [
      {
        type: "paragraph",
        raw: "Use small commits.\nKeep Markdown portable.",
        text: "Use small commits.\nKeep Markdown portable.",
      },
    ],
  });
});

test("callout kind command updates the explicit target node", () => {
  const [extension] = createPapyroCalloutExtensions();
  const command = extension.config.addCommands.call(extension).setCalloutKind({
    kind: "warning",
    pos: 7,
  });
  const transactions = [];
  const tr = {
    setNodeMarkup(pos, type, attrs) {
      transactions.push(["setNodeMarkup", pos, type, attrs]);
      return this;
    },
  };

  assert.equal(
    command({
      state: {
        doc: {
          nodeAt(pos) {
            assert.equal(pos, 7);
            return {
              type: { name: "calloutBlock" },
              attrs: { kind: "NOTE" },
            };
          },
        },
        selection: { from: 0, to: 0 },
      },
      tr,
      dispatch(transaction) {
        transactions.push(["dispatch", transaction === tr]);
      },
    }),
    true,
  );
  assert.deepEqual(transactions, [
    ["setNodeMarkup", 7, undefined, { kind: "WARNING" }],
    ["dispatch", true],
  ]);
});
