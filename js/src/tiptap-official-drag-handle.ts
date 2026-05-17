import {
  defaultComputePositionConfig,
  normalizeNestedOptions,
} from "@tiptap/extension-drag-handle";
import type { ComputePositionConfig } from "@floating-ui/dom";
import type {
  DragHandleOptions,
  DragHandlePluginProps,
  DragHandleRule,
  NestedOptions,
} from "@tiptap/extension-drag-handle";

const PAPYRO_COMPLEX_NODE_TYPES = new Set([
  "codeBlock",
  "image",
  "mathBlock",
  "mermaidBlock",
  "table",
]);

const PAPYRO_TABLE_STRUCTURE_TYPES = new Set([
  "tableRow",
  "tableCell",
  "tableHeader",
]);

export const papyroDragHandlePluginKey = "papyro-official-drag-handle";

type DragHandleRuleContext = {
  node?: {
    type?: {
      name?: string;
    };
  } | null;
  parent?: {
    type?: {
      name?: string;
    };
  } | null;
};

type PapyroDragHandleConfigOverrides = {
  pluginKey?: DragHandlePluginProps["pluginKey"];
  nested?: DragHandleOptions["nested"];
  computePositionConfig?: Partial<ComputePositionConfig>;
};

type PapyroDragHandleConfig = Pick<DragHandleOptions, "nested" | "computePositionConfig"> & {
  pluginKey: DragHandlePluginProps["pluginKey"];
};

export const papyroComplexBlockDragHandleRule: DragHandleRule = {
  id: "papyroComplexBlock",
  evaluate: papyroComplexBlockRule,
};

export const papyroTableOverlayDragHandleRule: DragHandleRule = {
  id: "papyroTableOverlay",
  evaluate: papyroTableOverlayRule,
};

export function createPapyroDragHandleNestedOptions(): NestedOptions {
  return {
    defaultRules: true,
    edgeDetection: {
      edges: ["left", "top"],
      threshold: 16,
      strength: 420,
    },
    rules: [papyroComplexBlockDragHandleRule, papyroTableOverlayDragHandleRule],
  };
}

export function createPapyroOfficialDragHandleConfig(
  overrides: PapyroDragHandleConfigOverrides = {},
): PapyroDragHandleConfig {
  const nested = overrides.nested ?? createPapyroDragHandleNestedOptions();

  return {
    pluginKey: overrides.pluginKey ?? papyroDragHandlePluginKey,
    nested,
    computePositionConfig: {
      ...defaultComputePositionConfig,
      placement: "left-start",
      strategy: "absolute",
      ...(overrides.computePositionConfig ?? {}),
    },
  };
}

export function normalizedPapyroDragHandleNestedOptions(
  input: NestedOptions = createPapyroDragHandleNestedOptions(),
) {
  return normalizeNestedOptions(input);
}

export function papyroComplexBlockRule({ node, parent }: DragHandleRuleContext): number {
  const nodeName = nodeTypeName(node);
  const parentName = nodeTypeName(parent);

  if (PAPYRO_COMPLEX_NODE_TYPES.has(nodeName)) {
    return 0;
  }

  if (PAPYRO_COMPLEX_NODE_TYPES.has(parentName)) {
    return 1000;
  }

  return 0;
}

export function papyroTableOverlayRule({ node, parent }: DragHandleRuleContext): number {
  const nodeName = nodeTypeName(node);
  const parentName = nodeTypeName(parent);

  if (PAPYRO_TABLE_STRUCTURE_TYPES.has(nodeName)) {
    return 1000;
  }

  if (PAPYRO_TABLE_STRUCTURE_TYPES.has(parentName)) {
    return 1000;
  }

  return 0;
}

function nodeTypeName(node: DragHandleRuleContext["node"]): string {
  return String(node?.type?.name ?? "");
}
