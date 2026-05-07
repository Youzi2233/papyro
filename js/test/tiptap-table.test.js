import test from "node:test";
import assert from "node:assert/strict";

import {
  PapyroTableCellBackground,
  createPapyroTableExtensions,
} from "../src/tiptap-table.js";

test("Papyro table extensions expose the TableKit boundary", () => {
  const extensions = createPapyroTableExtensions();

  assert.deepEqual(
    extensions.map((extension) => extension.name),
    ["tableKit", "papyroTableCellBackground"],
  );
  assert.equal(extensions[0].options.table.resizable, true);
  assert.equal(extensions[0].options.table.handleWidth, 6);
  assert.equal(extensions[0].options.table.cellMinWidth, 96);
  assert.equal(extensions[0].options.table.lastColumnResizable, true);
  assert.equal(extensions[0].options.table.allowTableNodeSelection, false);
});

test("Papyro table cell background extension adds cell attributes", () => {
  const [config] = PapyroTableCellBackground.config.addGlobalAttributes();
  const background = config.attributes.backgroundColor;
  const element = {
    style: { backgroundColor: "rgb(245, 158, 11)" },
    getAttribute(name) {
      return name === "data-cell-background" ? "rgba(245, 158, 11, 0.16)" : null;
    },
  };

  assert.deepEqual(config.types, ["tableCell", "tableHeader"]);
  assert.equal(background.default, null);
  assert.equal(background.parseHTML(element), "rgba(245, 158, 11, 0.16)");
  assert.deepEqual(background.renderHTML({ backgroundColor: "rgba(16, 185, 129, 0.14)" }), {
    "data-cell-background": "rgba(16, 185, 129, 0.14)",
    style: "background-color: rgba(16, 185, 129, 0.14)",
  });
  assert.deepEqual(background.renderHTML({ backgroundColor: null }), {});
});
