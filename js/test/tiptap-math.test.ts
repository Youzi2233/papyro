import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroMathExtensions,
  findInlineMathToken,
  renderKatexElement,
  tokenizeInlineMath,
  tokenizeMathBlock,
} from "../src/tiptap-math.js";

function createElement() {
  return {
    classList: {
      values: new Set(),
      add(value) {
        this.values.add(value);
      },
      remove(value) {
        this.values.delete(value);
      },
      contains(value) {
        return this.values.has(value);
      },
    },
    dataset: {},
    innerHTML: "",
    textContent: "",
    title: "",
  };
}

test("Papyro math extensions expose inline and display math nodes", () => {
  const extensions = createPapyroMathExtensions();

  assert.deepEqual(extensions.map((extension) => extension.name), ["inlineMath", "mathBlock"]);
});

test("inline math tokenizer skips escaped, display, and currency-like dollar spans", () => {
  assert.deepEqual(findInlineMathToken("Euler: $e^{i\\pi} + 1 = 0$."), {
    index: 7,
    raw: "$e^{i\\pi} + 1 = 0$",
    source: "e^{i\\pi} + 1 = 0",
  });
  assert.equal(findInlineMathToken("Escaped \\$x$"), null);
  assert.equal(findInlineMathToken("Display $$x$$"), null);
  assert.equal(findInlineMathToken("Price $5 and $6"), null);
});

test("inline math tokenizer emits marked-compatible tokens", () => {
  assert.deepEqual(tokenizeInlineMath("$x + y$ rest"), {
    type: "inlineMath",
    raw: "$x + y$",
    text: "x + y",
  });
  assert.equal(tokenizeInlineMath("plain $x$"), undefined);
});

test("display math tokenizer handles fenced and single-line math blocks", () => {
  assert.deepEqual(tokenizeMathBlock("$$\nx^2 + y^2\n$$\nnext"), {
    type: "mathBlock",
    raw: "$$\nx^2 + y^2\n$$\n",
    text: "x^2 + y^2",
    singleLine: false,
  });
  assert.deepEqual(tokenizeMathBlock("$$x^2$$\n"), {
    type: "mathBlock",
    raw: "$$x^2$$\n",
    text: "x^2",
    singleLine: true,
  });
  assert.equal(tokenizeMathBlock("not math"), undefined);
});

test("KaTeX renderer exposes rendered and error states", () => {
  const valid = createElement();
  assert.deepEqual(renderKatexElement(valid, "x^2", false), { ok: true, error: null });
  assert.equal(valid.dataset.mathState, "rendered");
  assert.equal(valid.dataset.mathSource, "x^2");
  assert.match(valid.innerHTML, /math/);

  const invalid = createElement();
  const result = renderKatexElement(invalid, "\\notacommand{", true);
  assert.equal(result.ok, false);
  assert.equal(invalid.dataset.mathState, "error");
  assert.equal(invalid.classList.contains("mn-tiptap-math-error"), true);
  assert.equal(invalid.textContent, "$$\n\\notacommand{\n$$");
});
