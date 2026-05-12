import React from "react";

import { PapyroOfficialTableNodeLayer } from "./official-table-node-layer.jsx";
import { DragContextMenu } from "@/components/tiptap-ui/drag-context-menu";
import { SlashDropdownMenu } from "@/components/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu.tsx";
import { PapyroToolbarFloating } from "@/components/tiptap-templates/notion/notion-like/papyro-toolbar-floating.tsx";

function PapyroOverlayLayer(runtime) {
  return (
    <>
      <DragContextMenu />
      <PapyroOfficialTableNodeLayer {...runtime} />
      <SlashDropdownMenu />
      <PapyroToolbarFloating />
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
