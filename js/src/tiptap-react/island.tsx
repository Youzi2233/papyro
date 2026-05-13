import React from "react";
import { Tiptap } from "@tiptap/react";

import { loadingEditorLabel } from "../tiptap-i18n.ts";
import { PapyroTiptapRuntimeProvider } from "./runtime-context.tsx";
import {
  createPapyroTiptapReactComponents,
  renderIslandSlot,
} from "./slots.tsx";

class PapyroTiptapChromeErrorBoundary extends React.Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    const message = error instanceof Error ? error.message : String(error);
    this.props.entry?.dioxus?.send?.({
      type: "runtime_error",
      tab_id: this.props.entry?.dom?.dataset?.tabId ?? "",
      message: `Editor chrome failed in ${this.props.name}: ${message}`,
    });
  }

  render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

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
        <PapyroTiptapChromeErrorBoundary name="before-content" entry={entry}>
          {renderIslandSlot(BeforeContent, runtime)}
        </PapyroTiptapChromeErrorBoundary>
        <EditorContent editor={editor} entry={entry} />
        <PapyroTiptapChromeErrorBoundary name="after-content" entry={entry}>
          {renderIslandSlot(AfterContent, runtime)}
        </PapyroTiptapChromeErrorBoundary>
        <PapyroTiptapChromeErrorBoundary name="overlay" entry={entry}>
          {renderIslandSlot(OverlayLayer, runtime)}
        </PapyroTiptapChromeErrorBoundary>
      </PapyroTiptapRuntimeProvider>
    </Tiptap>
  );
}
