import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroMermaidExtensions,
  tokenizeMermaidBlock,
} from "../src/tiptap-mermaid.js";

test("Papyro Mermaid extension exposes a single block node", () => {
  const extensions = createPapyroMermaidExtensions();

  assert.deepEqual(extensions.map((extension) => extension.name), ["mermaidBlock"]);
});

test("Mermaid tokenizer reads backtick and tilde code fences", () => {
  assert.deepEqual(tokenizeMermaidBlock("```mermaid\nflowchart TD\n  A --> B\n```\nnext"), {
    type: "mermaidBlock",
    raw: "```mermaid\nflowchart TD\n  A --> B\n```\n",
    text: "flowchart TD\n  A --> B",
  });
  assert.deepEqual(tokenizeMermaidBlock("~~~ mermaid\nsequenceDiagram\nA->>B: Hi\n~~~\n"), {
    type: "mermaidBlock",
    raw: "~~~ mermaid\nsequenceDiagram\nA->>B: Hi\n~~~\n",
    text: "sequenceDiagram\nA->>B: Hi",
  });
});

test("Mermaid tokenizer ignores non-Mermaid code fences", () => {
  assert.equal(tokenizeMermaidBlock("```rust\nfn main() {}\n```\n"), undefined);
  assert.equal(tokenizeMermaidBlock("not a fence"), undefined);
});
