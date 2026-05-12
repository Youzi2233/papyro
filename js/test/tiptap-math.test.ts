import test from "node:test";
import assert from "node:assert/strict";

import {
  createKatexRenderer,
  createPapyroMathExtensions,
  findInlineMathToken,
  PAPYRO_KATEX_OPTIONS,
  renderKatexElement,
  renderPreviewMath,
  tokenizeInlineMath,
  tokenizeMathBlock,
} from "../src/tiptap-math.js";
import { Window } from "happy-dom";

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

test("KaTeX renderer uses Papyro's hardened render options", () => {
  assert.deepEqual(PAPYRO_KATEX_OPTIONS, {
    output: "mathml",
    throwOnError: true,
    strict: "ignore",
    trust: false,
    maxSize: 8,
    maxExpand: 1000,
  });

  const calls = [];
  const renderer = createKatexRenderer({
    katexApi: {
      renderToString(source, options) {
        calls.push({ source, options });
        return `<math>${source}</math>`;
      },
    },
  });
  const target = createElement();

  assert.deepEqual(renderer.renderKatexElement(target, " x^2 ", true), {
    ok: true,
    error: null,
  });
  assert.deepEqual(calls, [
    {
      source: "x^2",
      options: {
        ...PAPYRO_KATEX_OPTIONS,
        displayMode: true,
      },
    },
  ]);
});

test("KaTeX renderer reports empty formulas without calling KaTeX", () => {
  const renderer = createKatexRenderer({
    katexApi: {
      renderToString() {
        throw new Error("should not render empty math");
      },
    },
  });
  const inline = createElement();
  const block = createElement();

  assert.deepEqual(renderer.renderKatexElement(inline, "  ", false), {
    ok: false,
    error: "empty_math",
  });
  assert.equal(inline.dataset.mathState, "empty");
  assert.equal(inline.textContent, "$$");
  assert.deepEqual(renderer.renderKatexElement(block, "", true), {
    ok: false,
    error: "empty_math",
  });
  assert.equal(block.textContent, "$$\n\n$$");
});

test("renderPreviewMath renders only changed Preview math nodes", () => {
  const windowRef = new Window({ url: "http://localhost/" });
  const calls = [];
  const renderer = createKatexRenderer({
    katexApi: {
      renderToString(source, options) {
        calls.push({ source, displayMode: options.displayMode });
        return `<math><mi>${source}</mi></math>`;
      },
    },
  });

  try {
    windowRef.document.body.innerHTML = `
      <main class="mn-preview">
        <p>Inline <span id="inline" class="mn-math-inline" data-math-state="source"><span class="mn-math-source">x^2</span></span></p>
        <div id="block" class="mn-math-block" data-math-state="source"><pre class="mn-math-source">y^2</pre></div>
      </main>
    `;

    assert.equal(renderer.renderPreviewMath(windowRef.document), 2);
    assert.deepEqual(calls, [
      { source: "x^2", displayMode: false },
      { source: "y^2", displayMode: true },
    ]);
    assert.equal(windowRef.document.querySelector("#inline")?.dataset.mathState, "rendered");
    assert.equal(windowRef.document.querySelector("#block")?.dataset.mathSource, "y^2");

    assert.equal(renderer.renderPreviewMath(windowRef.document), 0);
    assert.equal(calls.length, 2);

    const block = windowRef.document.querySelector("#block");
    block.dataset.mathState = "source";
    block.dataset.mathSource = "old";
    const source = windowRef.document.createElement("pre");
    source.className = "mn-math-source";
    source.textContent = "z^2";
    block.replaceChildren(source);

    assert.equal(renderPreviewMath(windowRef.document.createElement("div")), 0);
    assert.equal(renderer.renderPreviewMath(windowRef.document), 1);
    assert.deepEqual(calls.at(-1), { source: "z^2", displayMode: true });
  } finally {
    windowRef.close?.();
  }
});
