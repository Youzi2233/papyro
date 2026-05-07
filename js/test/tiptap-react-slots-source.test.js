import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const slotsSource = readFileSync(
  new URL("../src/tiptap-react/slots.jsx", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../src/tiptap-react/index.js", import.meta.url),
  "utf8",
);
const officialDragHandleBridgeSource = readFileSync(
  new URL("../src/tiptap-react/official-drag-handle-bridge.jsx", import.meta.url),
  "utf8",
);

test("React island slots register the official drag handle bridge by default", () => {
  assert.match(
    slotsSource,
    /import\s+\{\s*PapyroOfficialDragHandleBridge\s*\}\s+from\s+"\.\/official-drag-handle-bridge\.jsx";/u,
  );
  assert.match(slotsSource, /OverlayLayer:\s*PapyroOfficialDragHandleBridge/u);
});

test("React index exports the official drag handle bridge", () => {
  assert.match(indexSource, /PapyroOfficialDragHandleBridge/u);
  assert.match(indexSource, /official-drag-handle-bridge\.jsx/u);
});

test("official drag handle bridge keeps Tiptap callbacks stable across renders", () => {
  assert.match(officialDragHandleBridgeSource, /useCallback/u);
  assert.match(officialDragHandleBridgeSource, /useRef/u);
  assert.match(officialDragHandleBridgeSource, /entryRef\.current\s*=\s*entry/u);
  assert.match(officialDragHandleBridgeSource, /onNodeChange=\{handleNodeChange\}/u);
  assert.match(officialDragHandleBridgeSource, /onElementDragEnd=\{handleElementDragEnd\}/u);
});
