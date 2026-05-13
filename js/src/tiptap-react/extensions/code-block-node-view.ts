import type {
  Editor,
  NodeViewRenderer,
  NodeViewRendererProps,
} from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

import { PapyroCodeBlockNodeView } from "../components/code-block-node-view.tsx";
import { codeBlockDomAttributes } from "../../tiptap-code-block.js";

type CodeBlockRendererFactoryOptions = {
  fallbackNodeView?: NodeViewRenderer | null;
};

export function reactCodeBlockEditorLanguage(editor: Editor | null | undefined) {
  const dom = editor?.view?.dom ?? null;
  const root =
    dom?.closest?.(".mn-tiptap-runtime") ??
    dom?.parentElement ??
    null;
  return root?.dataset?.language ?? dom?.ownerDocument?.documentElement?.lang ?? "english";
}

export function createReactCodeBlockAttrs({ editor }: Pick<NodeViewRendererProps, "editor">) {
  return ({ node }) =>
    codeBlockDomAttributes({
      language: reactCodeBlockEditorLanguage(editor),
      node,
      wrapped: false,
    });
}

export function createTiptapReactCodeBlockNodeViewRenderer() {
  return ({ fallbackNodeView }: CodeBlockRendererFactoryOptions = {}): NodeViewRenderer =>
    (props: NodeViewRendererProps) => {
      if (!props?.editor?.contentComponent && typeof fallbackNodeView === "function") {
        return fallbackNodeView(props);
      }

      const renderer = ReactNodeViewRenderer(PapyroCodeBlockNodeView, {
        as: "div",
        className: "mn-tiptap-code-block mn-tiptap-react-code-block-node-view",
        attrs: createReactCodeBlockAttrs(props),
      });

      return renderer(props);
    };
}
