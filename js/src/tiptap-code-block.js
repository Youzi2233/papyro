import { findChildren, mergeAttributes } from "@tiptap/core";
import { CodeBlockLowlight } from "@tiptap/extension-code-block-lowlight";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { all, createLowlight } from "lowlight";
import { localizedText } from "./tiptap-i18n.js";
import {
  commandElementId,
  createFloatingDismissController,
  defaultDocument,
  defaultWindow,
  isComposingKeyboardEvent,
  positionFloatingElement,
  setHidden,
  syncMenuActiveDescendant,
  viewportSize,
} from "./tiptap-ui-primitives.js";

const DEFAULT_CODE_LANGUAGE = null;
const DEFAULT_TAB_SIZE = 2;
const LANGUAGE_CLASS_PREFIX = "language-";
const LANGUAGE_MENU_WIDTH = 176;
const LANGUAGE_MENU_HEIGHT = 286;
const COPY_FEEDBACK_MS = 1400;
const codeBlockLowlight = createLowlight(all);
const CODE_HIGHLIGHT_PLUGIN_KEY = "papyroCodeHighlight";
const CODE_LANGUAGE_MENU_OWNER_ID_PREFIX = "mn-tiptap-code-language-menu";
let codeLanguageMenuSequence = 0;

export const PAPYRO_CODE_LANGUAGE_OPTIONS = Object.freeze([
  { id: "auto", label: "Auto detect", language: null },
  { id: "plaintext", label: "Plain text", language: "plaintext" },
  { id: "javascript", label: "JavaScript", language: "javascript" },
  { id: "typescript", label: "TypeScript", language: "typescript" },
  { id: "rust", label: "Rust", language: "rust" },
  { id: "python", label: "Python", language: "python" },
  { id: "go", label: "Go", language: "go" },
  { id: "json", label: "JSON", language: "json" },
  { id: "bash", label: "Bash", language: "bash" },
  { id: "markdown", label: "Markdown", language: "markdown" },
  { id: "html", label: "HTML", language: "html" },
  { id: "css", label: "CSS", language: "css" },
  { id: "sql", label: "SQL", language: "sql" },
  { id: "yaml", label: "YAML", language: "yaml" },
  { id: "toml", label: "TOML", language: "toml" },
]);

export const PAPYRO_CODE_LANGUAGE_ALIASES = Object.freeze({
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  ts: "typescript",
  js: "javascript",
  golang: "go",
  md: "markdown",
  yml: "yaml",
  xml: "html",
});

export function normalizeCodeBlockLanguage(language) {
  const normalized = String(language ?? "").trim().toLowerCase();
  if (!normalized) return null;
  if (!/^[a-z0-9_+.-]{1,48}$/u.test(normalized)) return null;
  return PAPYRO_CODE_LANGUAGE_ALIASES[normalized] ?? normalized;
}

export function codeBlockLanguageLabel(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  return normalized ?? "auto";
}

export function inferCodeBlockLanguage(source) {
  const text = String(source ?? "");
  if (!text.trim()) return null;

  try {
    const result = codeBlockLowlight.highlightAuto(text);
    const detected = normalizeCodeBlockLanguage(result?.data?.language);
    const relevance = Number(result?.data?.relevance ?? 0);
    if (!detected || relevance < 4) return null;
    return detected;
  } catch (_error) {
    return null;
  }
}

export function codeBlockLanguageOption(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  return PAPYRO_CODE_LANGUAGE_OPTIONS.find(
    (option) => normalizeCodeBlockLanguage(option.language) === normalized || option.id === normalized,
  ) ?? null;
}

function safeEditorView(editor) {
  if (!editor) return null;
  try {
    return editor.view ?? null;
  } catch (_error) {
    return null;
  }
}

function codeBlockHighlightLanguage(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  if (normalized === "plaintext") return null;
  return lowlightLanguageName(normalized);
}

export function codeBlockLanguageDisplayLabel(language, value, detectedLanguage = null) {
  const normalized = normalizeCodeBlockLanguage(value);
  const detected = normalizeCodeBlockLanguage(detectedLanguage);
  const option = codeBlockLanguageOption(normalized);
  if (option?.id === "auto" || !normalized) {
    if (detected) {
      const detectedLabel = codeBlockLanguageOption(detected)?.label ?? detected;
      return localizedText(
        language,
        `Auto · ${detectedLabel}`,
        `自动 · ${detectedLabel}`,
      );
    }
    return localizedText(language, "Auto", "自动");
  }
  if (option?.id === "plaintext") {
    return localizedText(language, "Plain text", "纯文本");
  }
  return option?.label ?? normalized;
}

function editorLanguage(editor, view = null) {
  const dom = view?.dom ?? safeEditorView(editor)?.dom ?? null;
  const root =
    dom?.closest?.(".mn-tiptap-runtime") ??
    dom?.parentElement ??
    null;
  return root?.dataset?.language ?? dom?.ownerDocument?.documentElement?.lang ?? "english";
}

function codeLanguageMenuLabel(language) {
  return localizedText(language, "Code language", "代码语言");
}

function codeLanguageButtonAriaLabel(language) {
  return localizedText(language, "Change code language", "修改代码语言");
}

function codeBlockCopyLabel(language) {
  return localizedText(language, "Copy code", "\u590d\u5236\u4ee3\u7801");
}

function codeBlockCopiedLabel(language) {
  return localizedText(language, "Copied", "\u5df2\u590d\u5236");
}

function codeBlockCopyFailedLabel(language) {
  return localizedText(language, "Copy failed", "\u590d\u5236\u5931\u8d25");
}

function codeBlockWrapLabel(language, wrapped) {
  return wrapped
    ? localizedText(language, "Disable line wrap", "\u5173\u95ed\u81ea\u52a8\u6362\u884c")
    : localizedText(language, "Wrap lines", "\u81ea\u52a8\u6362\u884c");
}

export function codeBlockLanguageUiLabel(language, value) {
  return codeBlockLanguageDisplayLabel(language, value);
}

function languageClassName(language, prefix = LANGUAGE_CLASS_PREFIX) {
  const normalized = normalizeCodeBlockLanguage(language);
  const highlighted = highlightedDisplayLanguage(lowlightLanguageName(normalized));
  return highlighted ? `${prefix}${highlighted}` : "";
}

function lowlightLanguageName(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  if (normalized === "plaintext") return null;
  if (normalized === "html") return "xml";
  return normalized;
}

function highlightedDisplayLanguage(language) {
  const normalized = normalizeCodeBlockLanguage(language);
  return normalized;
}

function safePosition(getPos) {
  if (typeof getPos !== "function") return null;
  try {
    const pos = getPos();
    return Number.isSafeInteger(pos) ? pos : null;
  } catch (_error) {
    return null;
  }
}

function lowlightClassName(node) {
  const className = node?.properties?.className;
  if (Array.isArray(className)) return className.filter(Boolean).join(" ");
  return typeof className === "string" ? className : "";
}

function flattenedLowlightNodes(nodes = [], classNames = []) {
  return (nodes ?? []).flatMap((node) => {
    const nextClassNames = [
      ...classNames,
      ...lowlightClassName(node).split(/\s+/u).filter(Boolean),
    ];
    if (Array.isArray(node?.children)) {
      return flattenedLowlightNodes(node.children, nextClassNames);
    }
    return [{
      text: String(node?.value ?? ""),
      className: nextClassNames.join(" "),
    }];
  });
}

function highlightCodeNodes(source, language = null) {
  const text = String(source ?? "");
  const normalizedLanguage = codeBlockHighlightLanguage(language);
  if (!text || normalizedLanguage === "plaintext") return [];

  try {
    const highlighted =
      normalizedLanguage && codeBlockLowlight.registered?.(normalizedLanguage)
        ? codeBlockLowlight.highlight(normalizedLanguage, text)
        : codeBlockLowlight.highlightAuto(text);
    return Array.isArray(highlighted?.children) ? highlighted.children : [];
  } catch (_error) {
    return [];
  }
}

export function createCodeHighlightDecorations(doc, typeName = "codeBlock") {
  const decorations = [];
  findChildren(doc, (node) => node.type?.name === typeName).forEach((block) => {
    let from = block.pos + 1;
    const language = normalizeCodeBlockLanguage(block.node.attrs?.language);
    flattenedLowlightNodes(highlightCodeNodes(block.node.textContent, language)).forEach((node) => {
      const to = from + node.text.length;
      if (node.className && to > from) {
        decorations.push(Decoration.inline(from, to, { class: node.className }));
      }
      from = to;
    });
  });
  return DecorationSet.create(doc, decorations);
}

function createPapyroCodeHighlightPlugin(typeName = "codeBlock") {
  const plugin = new Plugin({
    key: new PluginKey(CODE_HIGHLIGHT_PLUGIN_KEY),
    state: {
      init: (_config, state) => createCodeHighlightDecorations(state.doc, typeName),
      apply(transaction, decorationSet) {
        if (transaction.docChanged) {
          return createCodeHighlightDecorations(transaction.doc, typeName);
        }
        return decorationSet.map(transaction.mapping, transaction.doc);
      },
    },
    props: {
      decorations(state) {
        return plugin.getState(state);
      },
    },
  });
  return plugin;
}

function languageMenuButton(documentRef, option, language) {
  const button = documentRef?.createElement?.("button") ?? null;
  if (!button) return null;
  button.type = "button";
  button.className = "mn-tiptap-code-language-menu-item";
  button.dataset.languageId = option.id;
  button.dataset.languageValue = option.language ?? "";
  button.role = "menuitemradio";
  button.textContent =
    option.id === "auto"
      ? localizedText(language, "Auto detect", "自动检测")
      : codeBlockLanguageUiLabel(language, option.language);
  return button;
}

async function writeCodeToClipboard(text) {
  const clipboard = globalThis?.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") return false;
  await clipboard.writeText(String(text ?? ""));
  return true;
}

export function createPapyroCodeBlockNodeView({ editor, node, getPos, view = null, options = {} } = {}) {
  const documentRef = view?.dom?.ownerDocument ?? safeEditorView(editor)?.dom?.ownerDocument ?? defaultDocument();
  const windowRef = defaultWindow(documentRef);
  const pre = documentRef?.createElement?.("pre") ?? null;
  const code = documentRef?.createElement?.("code") ?? null;
  const languageButton = documentRef?.createElement?.("button") ?? null;
  const toolbar = documentRef?.createElement?.("div") ?? null;
  const copyButton = documentRef?.createElement?.("button") ?? null;
  const wrapButton = documentRef?.createElement?.("button") ?? null;
  const menu = documentRef?.createElement?.("div") ?? null;
  const menuHeader = documentRef?.createElement?.("div") ?? null;
  const menuList = documentRef?.createElement?.("div") ?? null;
  if (!pre || !code || !languageButton || !toolbar || !copyButton || !wrapButton || !menu || !menuHeader || !menuList) {
    return null;
  }

  const className = options.HTMLAttributes?.class ?? "mn-tiptap-code-block";
  const languagePrefix = options.languageClassPrefix ?? LANGUAGE_CLASS_PREFIX;
  let currentNode = node;
  let currentLanguage = editorLanguage(editor, view);
  let codePointerHandled = false;
  let copyPointerHandled = false;
  let wrapPointerHandled = false;
  let copyFeedbackTimer = null;
  let wrapped = false;
  let languageCommands = [];
  let selectedLanguageIndex = 0;
  const menuOwnerId = `${CODE_LANGUAGE_MENU_OWNER_ID_PREFIX}-${++codeLanguageMenuSequence}`;

  pre.className = className;
  pre.dataset.hasLanguageControl = "true";
  pre.dataset.codeWrap = "false";
  code.setAttribute("spellcheck", "false");
  languageButton.type = "button";
  languageButton.className = "mn-tiptap-code-language-button";
  languageButton.contentEditable = "false";
  languageButton.draggable = false;
  languageButton.setAttribute("aria-haspopup", "menu");
  languageButton.setAttribute("aria-expanded", "false");
  toolbar.className = "mn-tiptap-code-toolbar";
  toolbar.contentEditable = "false";
  copyButton.type = "button";
  copyButton.className = "mn-tiptap-code-toolbar-button";
  copyButton.dataset.action = "copy";
  copyButton.contentEditable = "false";
  copyButton.draggable = false;
  wrapButton.type = "button";
  wrapButton.className = "mn-tiptap-code-toolbar-button";
  wrapButton.dataset.action = "wrap";
  wrapButton.contentEditable = "false";
  wrapButton.draggable = false;
  wrapButton.setAttribute("aria-pressed", "false");
  toolbar.append(copyButton, wrapButton);

  menu.className = "mn-tiptap-code-language-menu hidden";
  menu.role = "menu";
  menu.id = menuOwnerId;
  menu.tabIndex = -1;
  menuHeader.className = "mn-tiptap-code-language-menu-header";
  menuList.className = "mn-tiptap-code-language-menu-list";
  menu.append(menuHeader, menuList);
  documentRef?.body?.appendChild?.(menu);
  setHidden(menu, true);

  const closeMenu = () => {
    setHidden(menu, true);
    languageButton.setAttribute("aria-expanded", "false");
    dismiss.close();
  };
  const dismiss = createFloatingDismissController({
    document: documentRef,
    window: windowRef,
    contains: (target) => menu.contains?.(target) || languageButton.contains?.(target),
    onDismiss: closeMenu,
  });

  const syncMenu = () => {
    currentLanguage = editorLanguage(editor, view);
    const selected = normalizeCodeBlockLanguage(currentNode?.attrs?.language);
    languageCommands = [];
    menu.setAttribute("aria-label", codeLanguageMenuLabel(currentLanguage));
    menuHeader.textContent = codeLanguageMenuLabel(currentLanguage);
    menuList.replaceChildren();
    PAPYRO_CODE_LANGUAGE_OPTIONS.forEach((option) => {
      const item = languageMenuButton(documentRef, option, currentLanguage);
      if (!item) return;
      let pointerHandled = false;
      const index = languageCommands.length;
      const active =
        normalizeCodeBlockLanguage(option.language) === selected ||
        (!selected && option.id === "auto");
      const run = () => {
        const pos = safePosition(getPos);
        const ok = setCodeBlockLanguage(editor, option.language, pos);
        if (ok) {
          closeMenu();
        }
        return ok;
      };
      languageCommands.push({ id: option.id, run });
      item.id = commandElementId(menuOwnerId, index);
      item.dataset.commandIndex = String(index);
      item.dataset.active = active ? "true" : "false";
      item.setAttribute("aria-checked", String(active));
      item.addEventListener("mouseenter", () => {
        selectedLanguageIndex = index;
        syncMenuActiveDescendant(menu, menuOwnerId, languageCommands, selectedLanguageIndex, {
          activeClass: "keyboard-active",
          manageTabIndex: true,
          scroll: false,
        });
      });
      item.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        pointerHandled = run();
      });
      item.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation?.();
        if (!pointerHandled) {
          run();
        }
        pointerHandled = false;
      });
      menuList.appendChild(item);
    });
    const customLanguage = normalizeCodeBlockLanguage(currentNode?.attrs?.language);
    if (customLanguage && !codeBlockLanguageOption(customLanguage)) {
      const item = languageMenuButton(
        documentRef,
        {
          id: customLanguage,
          label: customLanguage,
          language: customLanguage,
        },
        currentLanguage,
      );
      if (item) {
        const index = languageCommands.length;
        languageCommands.push({ id: customLanguage, run: () => false });
        item.id = commandElementId(menuOwnerId, index);
        item.dataset.commandIndex = String(index);
        item.dataset.active = "true";
        item.setAttribute("aria-checked", "true");
        item.disabled = true;
        item.title = localizedText(
          currentLanguage,
          "Custom language detected from Markdown",
          "从 Markdown 检测到的自定义语言",
        );
        menuList.appendChild(item);
      }
    }
    selectedLanguageIndex = Math.max(
      0,
      languageCommands.findIndex((command) => command.id === (codeBlockLanguageOption(selected)?.id ?? selected ?? "auto")),
    );
    if (selectedLanguageIndex < 0) selectedLanguageIndex = 0;
    syncMenuActiveDescendant(menu, menuOwnerId, languageCommands, selectedLanguageIndex, {
      activeClass: "keyboard-active",
      manageTabIndex: true,
      scroll: false,
    });
  };

  const openMenu = () => {
    syncMenu();
    setHidden(menu, false);
    languageButton.setAttribute("aria-expanded", "true");
    positionFloatingElement(menu, languageButton.getBoundingClientRect?.(), {
      viewport: viewportSize(pre, windowRef),
      size: {
        width: LANGUAGE_MENU_WIDTH,
        height: LANGUAGE_MENU_HEIGHT,
        margin: 10,
      },
      placement: "bottom",
    });
    dismiss.open();
    menu.focus?.({ preventScroll: true });
    return true;
  };

  let buttonPointerHandled = false;
  const toggleMenu = () => {
    if (menu.hidden) {
      return openMenu();
    }
    closeMenu();
    return true;
  };

  const clearCopyFeedback = () => {
    if (copyFeedbackTimer && typeof windowRef?.clearTimeout === "function") {
      windowRef.clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = null;
    copyButton.dataset.state = "idle";
    copyButton.setAttribute("aria-label", codeBlockCopyLabel(currentLanguage));
    copyButton.title = codeBlockCopyLabel(currentLanguage);
  };
  const scheduleCopyFeedbackClear = () => {
    if (typeof windowRef?.setTimeout !== "function") return;
    if (copyFeedbackTimer && typeof windowRef.clearTimeout === "function") {
      windowRef.clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = windowRef.setTimeout(clearCopyFeedback, COPY_FEEDBACK_MS);
  };
  const runCopy = async () => {
    const ok = await writeCodeToClipboard(currentNode?.textContent ?? code.textContent ?? "");
    const label = ok ? codeBlockCopiedLabel(currentLanguage) : codeBlockCopyFailedLabel(currentLanguage);
    copyButton.dataset.state = ok ? "copied" : "failed";
    copyButton.setAttribute("aria-label", label);
    copyButton.title = label;
    scheduleCopyFeedbackClear();
    return ok;
  };
  const toggleWrap = () => {
    wrapped = !wrapped;
    pre.dataset.codeWrap = wrapped ? "true" : "false";
    wrapButton.setAttribute("aria-pressed", String(wrapped));
    const label = codeBlockWrapLabel(currentLanguage, wrapped);
    wrapButton.setAttribute("aria-label", label);
    wrapButton.title = label;
    return true;
  };
  copyButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    copyPointerHandled = true;
    return runCopy();
  });
  copyButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    if (!copyPointerHandled) {
      return runCopy();
    }
    copyPointerHandled = false;
    return true;
  });
  wrapButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    wrapPointerHandled = toggleWrap();
    return wrapPointerHandled;
  });
  wrapButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    if (!wrapPointerHandled) {
      return toggleWrap();
    }
    wrapPointerHandled = false;
    return true;
  });
  languageButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    buttonPointerHandled = toggleMenu();
  });
  languageButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation?.();
    if (!buttonPointerHandled) {
      toggleMenu();
    }
    buttonPointerHandled = false;
  });
  languageButton.addEventListener("keydown", (event) => {
    if (isComposingKeyboardEvent(event)) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation?.();
      if (menu.hidden) openMenu();
    }
  });

  menu.addEventListener("keydown", (event) => {
    if (isComposingKeyboardEvent(event)) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation?.();
      closeMenu();
      languageButton.focus?.({ preventScroll: true });
      return;
    }

    if (!languageCommands.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation?.();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      selectedLanguageIndex =
        (selectedLanguageIndex + direction + languageCommands.length) % languageCommands.length;
      syncMenuActiveDescendant(menu, menuOwnerId, languageCommands, selectedLanguageIndex, {
        activeClass: "keyboard-active",
        manageTabIndex: true,
      });
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      event.stopPropagation?.();
      selectedLanguageIndex = event.key === "Home" ? 0 : languageCommands.length - 1;
      syncMenuActiveDescendant(menu, menuOwnerId, languageCommands, selectedLanguageIndex, {
        activeClass: "keyboard-active",
        manageTabIndex: true,
      });
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation?.();
      languageCommands[selectedLanguageIndex]?.run?.();
    }
  });

  code.addEventListener("pointerdown", (event) => {
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    const rect = languageButton.getBoundingClientRect?.();
    const nearLanguageControl =
      rect &&
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      y >= rect.top - 8 &&
      y <= rect.bottom + 8 &&
      x >= rect.left - 12 &&
      x <= rect.right + 12;
    if (!nearLanguageControl) {
      codePointerHandled = false;
      return;
    }

    event.preventDefault();
    event.stopPropagation?.();
    codePointerHandled = toggleMenu();
  });

  code.addEventListener("click", (event) => {
    if (!codePointerHandled) return;
    event.preventDefault();
    event.stopPropagation?.();
    codePointerHandled = false;
  });

  function sync(nextNode = currentNode) {
    currentNode = nextNode;
    currentLanguage = editorLanguage(editor, view);
    const language = normalizeCodeBlockLanguage(currentNode?.attrs?.language);
    const detectedLanguage = language ? null : inferCodeBlockLanguage(currentNode?.textContent);
    const label = codeBlockLanguageDisplayLabel(currentLanguage, language, detectedLanguage);
    pre.dataset.codeLanguage = codeBlockLanguageLabel(language);
    pre.dataset.codeLanguageLabel = label;
    pre.dataset.codeLanguageMode = language ? "explicit" : "auto";
    pre.dataset.codeLanguageDetected = detectedLanguage ?? "";
    pre.setAttribute(
      "aria-label",
      localizedText(
        currentLanguage,
        `Code block, ${label}`,
        `代码块，${label}`,
      ),
    );
    const highlightedLanguage = lowlightLanguageName(language ?? detectedLanguage);
    const displayLanguage = highlightedDisplayLanguage(highlightedLanguage);
    pre.dataset.codeLanguageHighlighted = displayLanguage ?? "";
    code.className = [
      languageClassName(language ?? detectedLanguage, languagePrefix),
      displayLanguage ? `hljs language-${displayLanguage}` : "hljs",
    ]
      .filter(Boolean)
      .join(" ");
    languageButton.textContent = label;
    languageButton.title = codeLanguageButtonAriaLabel(currentLanguage);
    languageButton.setAttribute("aria-label", `${codeLanguageButtonAriaLabel(currentLanguage)}: ${label}`);
    if (copyButton.dataset.state !== "copied" && copyButton.dataset.state !== "failed") {
      copyButton.dataset.state = "idle";
      copyButton.setAttribute("aria-label", codeBlockCopyLabel(currentLanguage));
      copyButton.title = codeBlockCopyLabel(currentLanguage);
    }
    wrapButton.setAttribute("aria-label", codeBlockWrapLabel(currentLanguage, wrapped));
    wrapButton.title = codeBlockWrapLabel(currentLanguage, wrapped);
  }

  sync(node);
  pre.append(languageButton, toolbar, code);

  return {
    dom: pre,
    contentDOM: code,
    update(nextNode) {
      if (nextNode?.type?.name !== currentNode?.type?.name) return false;
      sync(nextNode);
      if (!menu.hidden) syncMenu();
      return true;
    },
    destroy() {
      if (copyFeedbackTimer && typeof windowRef?.clearTimeout === "function") {
        windowRef.clearTimeout(copyFeedbackTimer);
      }
      dismiss.close();
      menu.remove?.();
    },
  };
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
  const view = safeEditorView(editor);
  if (!state?.tr || !match || typeof view?.dispatch !== "function") {
    return false;
  }

  const nextLanguage = normalizeCodeBlockLanguage(language);
  const tr = state.tr.setNodeMarkup(match.pos, undefined, {
    ...match.node.attrs,
    language: nextLanguage,
  });
  view.dispatch(tr);
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
  addNodeView() {
    return ({ editor, node, getPos, view }) =>
      createPapyroCodeBlockNodeView({
        editor,
        node,
        getPos,
        view,
        options: this.options,
      });
  },

  renderHTML({ node, HTMLAttributes }) {
    const language = normalizeCodeBlockLanguage(node.attrs.language);
    const detectedLanguage = language ? null : inferCodeBlockLanguage(node.textContent);
    const highlightedLanguage = lowlightLanguageName(language ?? detectedLanguage);
    const displayLanguage = highlightedDisplayLanguage(highlightedLanguage);
    return [
      "pre",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-code-language": codeBlockLanguageLabel(language),
        "data-code-language-label": codeBlockLanguageDisplayLabel(
          "english",
          language,
          detectedLanguage,
        ),
        "data-code-language-mode": language ? "explicit" : "auto",
        "data-code-language-detected": detectedLanguage ?? "",
        "data-code-language-highlighted": displayLanguage ?? "",
      }),
      [
        "code",
        {
          class: [
            displayLanguage ? this.options.languageClassPrefix + displayLanguage : null,
            displayLanguage ? `hljs language-${displayLanguage}` : "hljs",
          ]
            .filter(Boolean)
            .join(" "),
        },
        0,
      ],
    ];
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      createPapyroCodeHighlightPlugin(this.name),
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
