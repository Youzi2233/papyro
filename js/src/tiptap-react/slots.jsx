import React from "react";

import { PapyroOfficialTableNodeLayer } from "./official-table-node-layer.jsx";
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
