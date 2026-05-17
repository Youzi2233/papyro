import test from "node:test";
import assert from "node:assert/strict";

import {
  createPapyroDragHandleNestedOptions,
  createPapyroOfficialDragHandleConfig,
  normalizedPapyroDragHandleNestedOptions,
  papyroComplexBlockRule,
  papyroDragHandlePluginKey,
  papyroTableOverlayRule,
} from "../src/tiptap-official-drag-handle.ts";

function node(name, extra = {}) {
  return {
    type: { name },
    ...extra,
  };
}

test("Papyro official drag handle config preserves official positioning defaults", () => {
  const config = createPapyroOfficialDragHandleConfig();

  assert.equal(config.pluginKey, papyroDragHandlePluginKey);
  assert.equal(config.computePositionConfig.placement, "left-start");
  assert.equal(config.computePositionConfig.strategy, "absolute");
  assert.equal(config.nested.allowedContainers, undefined);
});

test("Papyro official drag handle config accepts focused overrides", () => {
  const config = createPapyroOfficialDragHandleConfig({
    pluginKey: "custom-drag",
    computePositionConfig: {
      placement: "right-start",
    },
    nested: {
      allowedContainers: ["blockquote"],
      edgeDetection: "right",
    },
  });

  assert.equal(config.pluginKey, "custom-drag");
  assert.equal(config.computePositionConfig.placement, "right-start");
  assert.equal(config.computePositionConfig.strategy, "absolute");
  assert.deepEqual(config.nested.allowedContainers, ["blockquote"]);
  assert.equal(config.nested.edgeDetection, "right");
});

test("Papyro official drag handle nested options normalize through Tiptap", () => {
  const normalized = normalizedPapyroDragHandleNestedOptions(
    createPapyroDragHandleNestedOptions(),
  );

  assert.equal(normalized.enabled, true);
  assert.equal(normalized.defaultRules, true);
  assert.deepEqual(normalized.edgeDetection.edges, ["left", "top"]);
  assert.equal(normalized.edgeDetection.threshold, 16);
  assert.equal(normalized.edgeDetection.strength, 420);
  assert.equal(normalized.allowedContainers, undefined);
  assert.equal(normalized.rules.length, 2);
});

test("Papyro drag handle rules keep complex blocks as outer owners", () => {
  assert.equal(papyroComplexBlockRule({ node: node("table") }), 0);
  assert.equal(papyroComplexBlockRule({ node: node("heading") }), 0);
  assert.equal(papyroComplexBlockRule({ node: node("codeBlock") }), 0);
  assert.equal(papyroComplexBlockRule({ node: node("image") }), 0);
  assert.equal(
    papyroComplexBlockRule({
      node: node("paragraph"),
      parent: node("codeBlock"),
    }),
    1000,
  );
  assert.equal(
    papyroComplexBlockRule({
      node: node("paragraph"),
      parent: node("mermaidBlock"),
    }),
    1000,
  );
});

test("Papyro drag handle rules leave table internals to table overlay", () => {
  assert.equal(papyroTableOverlayRule({ node: node("table") }), 0);
  assert.equal(papyroTableOverlayRule({ node: node("tableRow") }), 1000);
  assert.equal(papyroTableOverlayRule({ node: node("tableCell") }), 1000);
  assert.equal(papyroTableOverlayRule({ node: node("tableHeader") }), 1000);
  assert.equal(
    papyroTableOverlayRule({
      node: node("paragraph"),
      parent: node("tableCell"),
    }),
    1000,
  );
});
