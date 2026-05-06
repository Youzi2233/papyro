import test from "node:test";
import assert from "node:assert/strict";

import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockLanguageLabel,
  codeBlockLanguageOption,
  createPapyroCodeBlockOptions,
  createPapyroCodeBlockExtensions,
  normalizeCodeBlockLanguage,
} from "../src/tiptap-code-block.js";

test("Papyro code block options keep Tiptap's official node configurable", () => {
  const options = createPapyroCodeBlockOptions();
  assert.equal(options.defaultLanguage, null);
  assert.equal(options.enableTabIndentation, true);
  assert.equal(options.tabSize, 2);
  assert.equal(options.languageClassPrefix, "language-");
  assert.equal(options.HTMLAttributes.class, "mn-tiptap-code-block");
  assert.equal(typeof options.lowlight.highlight, "function");
  assert.ok(options.lowlight.listLanguages().includes("rust"));
});

test("Papyro code block language normalization accepts safe language ids", () => {
  assert.equal(normalizeCodeBlockLanguage("Rust"), "rust");
  assert.equal(normalizeCodeBlockLanguage("ts-node"), "ts-node");
  assert.equal(normalizeCodeBlockLanguage("c++"), "c++");
  assert.equal(normalizeCodeBlockLanguage(""), null);
  assert.equal(normalizeCodeBlockLanguage("bad lang"), null);
  assert.equal(normalizeCodeBlockLanguage("x".repeat(80)), null);
});

test("Papyro code block extension uses lowlight and exposes language commands", () => {
  const [extension] = createPapyroCodeBlockExtensions();
  assert.equal(extension.name, "codeBlock");
  assert.equal(typeof extension.config.addCommands, "function");
});

test("Papyro code block language options are stable and label empty fences", () => {
  assert.equal(codeBlockLanguageLabel(""), "auto");
  assert.equal(codeBlockLanguageLabel("Rust"), "rust");
  assert.equal(codeBlockLanguageOption("ts-node"), null);
  assert.deepEqual(
    PAPYRO_CODE_LANGUAGE_OPTIONS.slice(0, 4).map((option) => option.id),
    ["auto", "plaintext", "javascript", "typescript"],
  );
});
