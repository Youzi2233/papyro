import React, { useCallback, useMemo, useRef } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";

import { createPapyroOfficialDragHandleConfig } from "../tiptap-official-drag-handle.js";
import { officialDragHandleBridgeState } from "./official-drag-handle-bridge-state.js";

export function PapyroOfficialDragHandleBridge({ editor, entry = null }) {
  const config = useMemo(() => createPapyroOfficialDragHandleConfig(), []);
  const bridgeState = officialDragHandleBridgeState({ editor, entry });
  const entryRef = useRef(entry);
  entryRef.current = entry;
  const handleNodeChange = useCallback((data) => {
    entryRef.current?.blockHandle?.handleOfficialNodeChange?.(data);
  }, []);
  const handleElementDragEnd = useCallback(() => {
    entryRef.current?.blockHandle?.cancelDrag?.();
  }, []);

  if (!bridgeState.active) return null;

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
      <span
        aria-hidden="true"
        data-view-mode={bridgeState.viewMode}
        data-state={bridgeState.reason}
      />
    </DragHandle>
  );
}
