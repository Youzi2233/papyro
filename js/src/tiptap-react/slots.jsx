import React from "react";

import { PapyroOfficialDragHandleBridge } from "./official-drag-handle-bridge.jsx";
import { PapyroOfficialTableNodeLayer } from "./official-table-node-layer.jsx";

function PapyroOverlayLayer(runtime) {
  return (
    <>
      <PapyroOfficialDragHandleBridge {...runtime} />
      <PapyroOfficialTableNodeLayer {...runtime} />
    </>
  );
}

export function renderIslandSlot(SlotComponent, runtime) {
  if (!SlotComponent) return null;
  if (React.isValidElement(SlotComponent)) return SlotComponent;
  if (typeof SlotComponent === "function") {
    return <SlotComponent {...runtime} />;
  }
  return null;
}

export function createPapyroTiptapReactComponents(components = {}) {
  return {
    BeforeContent: null,
    EditorContent: null,
    AfterContent: null,
    OverlayLayer: PapyroOverlayLayer,
    ...components,
  };
}
