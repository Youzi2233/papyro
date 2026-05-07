import React, { useCallback, useMemo, useRef } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";

import { createPapyroOfficialDragHandleConfig } from "../tiptap-official-drag-handle.js";

export function PapyroOfficialDragHandleBridge({ editor, entry = null }) {
  const config = useMemo(() => createPapyroOfficialDragHandleConfig(), []);
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const handleNodeChange = useCallback((data) => {
    entryRef.current?.blockHandle?.handleOfficialNodeChange?.(data);
  }, []);
  const handleElementDragEnd = useCallback(() => {
    entryRef.current?.blockHandle?.cancelDrag?.();
  }, []);

  if (!editor || !entry?.blockHandle) return null;

  return (
    <DragHandle
      editor={editor}
      pluginKey={config.pluginKey}
      computePositionConfig={config.computePositionConfig}
      nested={config.nested}
      className="mn-tiptap-official-drag-handle-bridge"
      onNodeChange={handleNodeChange}
      onElementDragEnd={handleElementDragEnd}
    >
      <span aria-hidden="true" />
    </DragHandle>
  );
}
