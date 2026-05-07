import React, { useMemo } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";

import { createPapyroOfficialDragHandleConfig } from "../tiptap-official-drag-handle.js";

export function PapyroOfficialDragHandleBridge({ editor, entry = null }) {
  const config = useMemo(() => createPapyroOfficialDragHandleConfig(), []);
  if (!editor || !entry?.blockHandle) return null;

  return (
    <DragHandle
      editor={editor}
      pluginKey={config.pluginKey}
      computePositionConfig={config.computePositionConfig}
      nested={config.nested}
      className="mn-tiptap-official-drag-handle-bridge"
      onNodeChange={(data) => entry.blockHandle?.handleOfficialNodeChange?.(data)}
      onElementDragEnd={() => entry.blockHandle?.cancelDrag?.()}
    >
      <span aria-hidden="true" />
    </DragHandle>
  );
}
