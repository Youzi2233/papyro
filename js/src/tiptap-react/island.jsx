import React from "react";
import { Tiptap } from "@tiptap/react";

import { loadingEditorLabel } from "../tiptap-i18n.js";
import { PapyroTiptapRuntimeProvider } from "./runtime-context.jsx";
import {
  createPapyroTiptapReactComponents,
  renderIslandSlot,
} from "./slots.jsx";

export function PapyroTiptapEditorContent({
  className = "mn-tiptap-react-content",
} = {}) {
  return <Tiptap.Content className={className} />;
}

export function PapyroTiptapReactIsland({
  editor,
  entry = null,
  components = {},
}) {
  if (!editor) {
    const language = entry?.preferences?.language ?? entry?.dom?.dataset?.language ?? "english";
    return (
      <div
        className="mn-tiptap-react-loading"
        role="status"
        aria-label={loadingEditorLabel(language)}
      />
    );
  }

  const {
    BeforeContent,
    AfterContent,
    OverlayLayer,
    EditorContent: EditorContentComponent,
  } = createPapyroTiptapReactComponents(components);
  const EditorContent = EditorContentComponent ?? PapyroTiptapEditorContent;
  const runtime = { editor, entry };

  return (
    <Tiptap editor={editor}>
      <PapyroTiptapRuntimeProvider editor={editor} entry={entry}>
        {renderIslandSlot(BeforeContent, runtime)}
        <EditorContent editor={editor} entry={entry} />
        {renderIslandSlot(AfterContent, runtime)}
        {renderIslandSlot(OverlayLayer, runtime)}
      </PapyroTiptapRuntimeProvider>
    </Tiptap>
  );
}
