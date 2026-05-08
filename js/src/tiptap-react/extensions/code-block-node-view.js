import { ReactNodeViewRenderer } from "@tiptap/react";

import { PapyroCodeBlockNodeView } from "../components/code-block-node-view.jsx";
import { codeBlockDomAttributes } from "../../tiptap-code-block.js";

export function reactCodeBlockEditorLanguage(editor) {
  const dom = editor?.view?.dom ?? null;
  const root =
    dom?.closest?.(".mn-tiptap-runtime") ??
    dom?.parentElement ??
    null;
  return root?.dataset?.language ?? dom?.ownerDocument?.documentElement?.lang ?? "english";
}

export function createReactCodeBlockAttrs({ editor }) {
  return ({ node }) =>
    codeBlockDomAttributes({
      language: reactCodeBlockEditorLanguage(editor),
      node,
      wrapped: false,
    });
}

export function createTiptapReactCodeBlockNodeViewRenderer() {
  return ({ fallbackNodeView } = {}) =>
    (props) => {
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
