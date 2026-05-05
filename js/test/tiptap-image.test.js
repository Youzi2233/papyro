import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroImageExtensions,
  tokenizeMarkdownImage,
} from "../src/tiptap-image.js";

test("Papyro image extension exposes the image node boundary", () => {
  const extensions = createPapyroImageExtensions();

  assert.deepEqual(extensions.map((extension) => extension.name), ["image"]);
});

test("Papyro image extension parses and renders Markdown image attributes", () => {
  const [extension] = createPapyroImageExtensions();
  const parsed = extension.config.parseMarkdown(
    {
      type: "image",
      href: "../assets/pasted image.png",
      text: "Pasted image",
      title: "Screenshot",
    },
    {
      createNode: (type, attrs) => ({ type, attrs }),
    },
  );

  assert.deepEqual(parsed, {
    type: "image",
    attrs: {
      src: "../assets/pasted image.png",
      alt: "Pasted image",
      title: "Screenshot",
    },
  });
  assert.equal(
    extension.config.renderMarkdown(parsed),
    '![Pasted image](../assets/pasted image.png "Screenshot")',
  );
});

test("Papyro image tokenizer preserves local paths with spaces", () => {
  assert.deepEqual(
    tokenizeMarkdownImage('![Pasted image](../assets/pasted image.png "Screenshot") after'),
    {
      type: "image",
      raw: '![Pasted image](../assets/pasted image.png "Screenshot")',
      href: "../assets/pasted image.png",
      text: "Pasted image",
      title: "Screenshot",
    },
  );
  assert.deepEqual(tokenizeMarkdownImage("![Logo](<assets/papyro logo.png>)"), {
    type: "image",
    raw: "![Logo](<assets/papyro logo.png>)",
    href: "assets/papyro logo.png",
    text: "Logo",
    title: "",
  });
});
