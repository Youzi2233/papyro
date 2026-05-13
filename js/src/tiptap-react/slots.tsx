import React from "react";

import { createPapyroOfficialDragHandleConfig } from "../tiptap-official-drag-handle.js";
import { PapyroOfficialTableNodeLayer } from "./official-table-node-layer";
import { DragContextMenu } from "@/components/tiptap-ui/drag-context-menu";
import { SlashDropdownMenu } from "@/components/tiptap-ui/slash-dropdown-menu/slash-dropdown-menu.tsx";
import { PapyroToolbarFloating } from "@/components/tiptap-templates/notion/notion-like/papyro-toolbar-floating.tsx";

import "@/components/tiptap-node/paragraph-node/paragraph-node.scss";
import "@/components/tiptap-node/heading-node/heading-node.scss";
import "@/components/tiptap-node/list-node/list-node.scss";
import "@/components/tiptap-node/blockquote-node/blockquote-node.scss";
import "@/components/tiptap-node/code-block-node/code-block-node.scss";
import "@/components/tiptap-node/horizontal-rule-node/horizontal-rule-node.scss";
import "@/components/tiptap-node/image-node/image-node.scss";

function PapyroDragContextMenu() {
  const dragHandleConfig = React.useMemo(
    () => createPapyroOfficialDragHandleConfig(),
    [],
  );

  return (
    <DragContextMenu
      pluginKey={dragHandleConfig.pluginKey}
      nested={dragHandleConfig.nested}
      className="drag-handle mn-tiptap-drag-context-menu-handle"
    />
  );
}

function PapyroOverlayLayer(runtime) {
  return (
    <>
      <PapyroDragContextMenu />
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
    OverlayLayer: PapyroOverlayLayer,
    ...components,
  };
}
