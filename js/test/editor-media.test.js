import assert from "node:assert/strict";
import test from "node:test";

import { friendlyMermaidErrorMessage, mermaidSvgErrorMessage } from "../src/editor-media.js";

test("friendlyMermaidErrorMessage normalizes common Mermaid failures", () => {
  assert.equal(friendlyMermaidErrorMessage("Syntax error in text"), "Mermaid syntax error.");
  assert.equal(friendlyMermaidErrorMessage("Parse error on line 2"), "Mermaid syntax error.");
  assert.equal(
    friendlyMermaidErrorMessage("DOMPurify.sanitize is not a function"),
    "Mermaid render is unavailable in this runtime.",
  );
  assert.equal(friendlyMermaidErrorMessage("Mermaid render timed out"), "Mermaid render timed out.");
});

test("mermaidSvgErrorMessage extracts Mermaid error text from SVG output", () => {
  const svg = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\">",
    "<g>",
    "<path class=\"error-icon\" d=\"M0 0\" />",
    "<text class=\"error-text\">Syntax error in text</text>",
    "</g>",
    "</svg>",
  ].join("");

  assert.equal(mermaidSvgErrorMessage(svg), "Syntax error in text");
});

test("mermaidSvgErrorMessage falls back when Mermaid returns an error SVG without text", () => {
  const svg = [
    "<svg xmlns=\"http://www.w3.org/2000/svg\">",
    "<g>",
    "<path class=\"error-icon\" d=\"M0 0\" />",
    "</g>",
    "</svg>",
  ].join("");

  assert.equal(mermaidSvgErrorMessage(svg), "Mermaid diagram could not be rendered.");
});
