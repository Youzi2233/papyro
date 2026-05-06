import { mergeAttributes } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";

const DEFAULT_CODE_LANGUAGE = null;
const DEFAULT_TAB_SIZE = 2;
const LANGUAGE_CLASS_PREFIX = "language-";
const codeBlockLowlight = createLowlight(common);

export const PAPYRO_CODE_LANGUAGE_OPTIONS = Object.freeze([
  { id: "auto", label: "Auto detect", language: null },
  { id: "plaintext", label: "Plain text", language: "plaintext" },
  { id: "javascript", label: "JavaScript", language: "javascript" },
  { id: "typescript", label: "TypeScript", language: "typescript" },
  { id: "rust", label: "Rust", language: "rust" },
  { id: "python", label: "Python", language: "python" },
  { id: "json", label: "JSON", language: "json" },
  { id: "bash", label: "Bash", language: "bash" },
  { id: "markdown", label: "Markdown", language: "markdown" },
  { id: "html", label: "HTML", language: "xml" },
  { id: "css", label: "CSS", language: "css" },
  { id: "sql", label: "SQL", language: "sql" },
  { id: "yaml", label: "YAML", language: "yaml" },
]);

export function normalizeCodeBlockLanguage(language) {
  const normalized = String(language ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_+.-]{1,48}$/u.test(normalized)) return null;
  return normalized;
}

export function codeBlockLanguageLabel(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  return normalized ?? "auto";
}

export function codeBlockLanguageOption(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  return PAPYRO_CODE_LANGUAGE_OPTIONS.find(
    (option) => option.language === normalized || option.id === normalized,
  ) ?? null;
}

function selectedCodeBlockPosition(state, typeName, explicitPos = null) {
  if (Number.isSafeInteger(explicitPos)) {
    const node = state?.doc?.nodeAt?.(explicitPos);
    return node?.type?.name === typeName ? { pos: explicitPos, node } : null;
  }

  const selection = state?.selection;
  const $from = selection?.$from;
  if (!$from) return null;

  for (let depth = $from.depth; depth >= 0; depth -= 1) {
    const node = $from.node(depth);
    if (node?.type?.name === typeName) {
      return {
        pos: depth === 0 ? 0 : $from.before(depth),
        node,
      };
    }
  }

  const node = state?.doc?.nodeAt?.(selection.from);
  return node?.type?.name === typeName ? { pos: selection.from, node } : null;
}

export function setCodeBlockLanguage(editor, language, pos = null) {
  const state = editor?.state;
  const match = selectedCodeBlockPosition(state, "codeBlock", pos);
  if (!state?.tr || !match || typeof editor?.view?.dispatch !== "function") {
    return false;
  }

  const nextLanguage = normalizeCodeBlockLanguage(language);
  const tr = state.tr.setNodeMarkup(match.pos, undefined, {
    ...match.node.attrs,
    language: nextLanguage,
  });
  editor.view.dispatch(tr);
  editor.commands?.focus?.();
  return true;
}

export function createPapyroCodeBlockOptions() {
  return {
    defaultLanguage: DEFAULT_CODE_LANGUAGE,
    enableTabIndentation: true,
    tabSize: DEFAULT_TAB_SIZE,
    lowlight: codeBlockLowlight,
    languageClassPrefix: LANGUAGE_CLASS_PREFIX,
    HTMLAttributes: {
      class: "mn-tiptap-code-block",
    },
  };
}

export const PapyroCodeBlock = CodeBlockLowlight.extend({
  renderHTML({ node, HTMLAttributes }) {
    const language = normalizeCodeBlockLanguage(node.attrs.language);
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-code-language": codeBlockLanguageLabel(language),
      }),
      [
        "code",
        {
          class: language ? this.options.languageClassPrefix + language : null,
        },
        0,
      ],
    ];
  },

  addCommands() {
    return {
      ...this.parent?.(),
      setCodeBlockLanguage:
        (language, pos = null) =>
        ({ editor }) =>
          setCodeBlockLanguage(editor, language, pos),
    };
  },
});

export function createPapyroCodeBlockExtensions() {
  return [PapyroCodeBlock.configure(createPapyroCodeBlockOptions())];
}
