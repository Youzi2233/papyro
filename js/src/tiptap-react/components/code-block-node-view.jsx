import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
} from "@tiptap/react";

import {
  codeBlockDomAttributes,
  codeBlockHighlightedLanguage,
  codeBlockLanguageDisplayLabel,
  inferCodeBlockLanguage,
  setCodeBlockLanguage,
} from "../../tiptap-code-block.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import {
  createCodeBlockChromeCommands,
  createCodeBlockLanguageCommands,
} from "../commands/code-block-command-model.js";
import { usePapyroTiptapLanguage } from "../runtime-context.jsx";

const COPY_FEEDBACK_MS = 1400;

function safePosition(getPos) {
  if (typeof getPos !== "function") return null;
  try {
    const pos = getPos();
    return Number.isSafeInteger(pos) ? pos : null;
  } catch (_error) {
    return null;
  }
}

function nodeViewRootElement(editor, getPos) {
  const pos = safePosition(getPos);
  if (!Number.isSafeInteger(pos)) return null;
  try {
    const element = editor?.view?.nodeDOM?.(pos) ?? null;
    return element?.nodeType === 1 ? element : null;
  } catch (_error) {
    return null;
  }
}

function applyElementAttributes(element, attributes) {
  if (!element) return;
  Object.entries(attributes ?? {}).forEach(([name, value]) => {
    if (value === undefined || value === null) {
      element.removeAttribute?.(name);
    } else {
      element.setAttribute?.(name, String(value));
    }
  });
}

function writeCodeToClipboard(text) {
  const clipboard = globalThis?.navigator?.clipboard;
  if (typeof clipboard?.writeText !== "function") return Promise.resolve(false);
  return clipboard.writeText(String(text ?? "")).then(
    () => true,
    () => false,
  );
}

function CodeLanguageButton({
  command,
  expanded,
  onToggle,
}) {
  const activation = usePointerActivation(onToggle);

  return (
    <button
      type="button"
      className="mn-tiptap-code-language-button"
      contentEditable={false}
      draggable={false}
      data-language-badge={command.token}
      data-language-value={command.language ?? "auto"}
      data-language-mode={command.language ? "explicit" : "auto"}
      aria-haspopup="menu"
      aria-expanded={String(expanded)}
      aria-label={command.title}
      title={command.title}
      {...activation}
    >
      <span className="mn-tiptap-code-language-title">{command.title}</span>
    </button>
  );
}

function CodeLanguageMenu({
  language,
  currentLanguage,
  onChoose,
}) {
  const commands = useMemo(
    () => createCodeBlockLanguageCommands({ language, currentLanguage }),
    [currentLanguage, language],
  );

  return (
    <div className="mn-tiptap-code-language-menu mn-tiptap-code-language-menu-inline" role="menu">
      <div className="mn-tiptap-code-language-menu-header">
        {commands[0]?.group}
      </div>
      <div className="mn-tiptap-code-language-menu-list">
        {commands.map((command) => (
          <CodeLanguageMenuItem
            key={command.id}
            command={command}
            onChoose={onChoose}
          />
        ))}
      </div>
    </div>
  );
}

function CodeLanguageMenuItem({ command, onChoose }) {
  const activation = usePointerActivation(() => {
    if (!command.disabled) onChoose(command.language);
  });

  return (
    <button
      type="button"
      className="mn-tiptap-code-language-menu-item"
      contentEditable={false}
      disabled={command.disabled}
      data-language-id={command.optionId}
      data-language-value={command.language ?? ""}
      data-language-token={command.token}
      data-active={command.active ? "true" : "false"}
      role="menuitemradio"
      aria-checked={String(command.active)}
      title={command.description}
      {...activation}
    >
      {command.title}
    </button>
  );
}

function CodeToolbarButton({
  command,
  onRun,
}) {
  const activation = usePointerActivation(onRun);

  return (
    <button
      type="button"
      className="mn-tiptap-code-toolbar-button"
      contentEditable={false}
      data-action={command.meta?.action}
      data-state={command.state ?? undefined}
      aria-label={command.title}
      aria-pressed={command.pressed === undefined ? undefined : String(command.pressed)}
      title={command.title}
      {...activation}
    />
  );
}

export function PapyroCodeBlockNodeView({
  editor,
  node,
  getPos,
}) {
  const language = usePapyroTiptapLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wrapped, setWrapped] = useState(false);
  const [copyState, setCopyState] = useState("idle");
  const copyTimerRef = useRef(null);
  const currentLanguage = node?.attrs?.language ?? null;
  const detectedLanguage = currentLanguage ? null : inferCodeBlockLanguage(node?.textContent);
  const displayLabel = codeBlockLanguageDisplayLabel(
    language,
    currentLanguage,
    detectedLanguage,
  );
  const rootAttributes = useMemo(
    () =>
      codeBlockDomAttributes({
        language,
        node,
        detectedLanguage,
        wrapped,
      }),
    [detectedLanguage, language, node, wrapped],
  );
  const languageCommands = useMemo(
    () => createCodeBlockLanguageCommands({ language, currentLanguage }),
    [currentLanguage, language],
  );
  const activeLanguage =
    languageCommands.find((command) => command.active) ?? languageCommands[0];
  const chromeCommands = useMemo(
    () => createCodeBlockChromeCommands({ language, wrapped, copyState }),
    [copyState, language, wrapped],
  );
  const highlightedLanguage = codeBlockHighlightedLanguage(currentLanguage ?? detectedLanguage);

  useEffect(
    () => () => {
      const windowRef = editor?.view?.dom?.ownerDocument?.defaultView ?? globalThis.window;
      if (copyTimerRef.current && typeof windowRef?.clearTimeout === "function") {
        windowRef.clearTimeout(copyTimerRef.current);
      }
    },
    [editor],
  );
  useEffect(
    () => {
      applyElementAttributes(nodeViewRootElement(editor, getPos), rootAttributes);
    },
    [editor, getPos, rootAttributes],
  );
  useEffect(
    () => {
      if (!menuOpen) return undefined;
      const documentRef = editor?.view?.dom?.ownerDocument ?? globalThis.document;
      const closeOnPointerDown = (event) => {
        const target = event?.target;
        if (target?.closest?.(".mn-tiptap-code-language-menu-inline, .mn-tiptap-code-language-button")) {
          return;
        }
        setMenuOpen(false);
      };
      documentRef?.addEventListener?.("pointerdown", closeOnPointerDown, true);
      return () => {
        documentRef?.removeEventListener?.("pointerdown", closeOnPointerDown, true);
      };
    },
    [editor, menuOpen],
  );

  const chooseLanguage = (nextLanguage) => {
    const pos = safePosition(getPos);
    const ok = setCodeBlockLanguage(editor, nextLanguage, pos);
    if (ok) setMenuOpen(false);
  };

  const runCopy = () => {
    writeCodeToClipboard(node?.textContent ?? "").then((ok) => {
      setCopyState(ok ? "copied" : "failed");
      const windowRef = editor?.view?.dom?.ownerDocument?.defaultView ?? globalThis.window;
      if (copyTimerRef.current && typeof windowRef?.clearTimeout === "function") {
        windowRef.clearTimeout(copyTimerRef.current);
      }
      if (typeof windowRef?.setTimeout === "function") {
        copyTimerRef.current = windowRef.setTimeout(() => {
          copyTimerRef.current = null;
          setCopyState("idle");
        }, COPY_FEEDBACK_MS);
      }
    });
  };

  const copyCommand = chromeCommands.find((command) => command.id === "copy-code");
  const wrapCommand = chromeCommands.find((command) => command.id === "toggle-code-wrap");

  return (
    <NodeViewWrapper
      as="div"
      className="mn-tiptap-code-block-inner"
    >
      <CodeLanguageButton
        command={activeLanguage}
        expanded={menuOpen}
        onToggle={() => setMenuOpen((value) => !value)}
      />
      <div className="mn-tiptap-code-toolbar" contentEditable={false}>
        <CodeToolbarButton command={copyCommand} onRun={runCopy} />
        <CodeToolbarButton
          command={wrapCommand}
          onRun={() => setWrapped((value) => !value)}
        />
      </div>
      {menuOpen ? (
        <CodeLanguageMenu
          language={language}
          currentLanguage={currentLanguage}
          onChoose={chooseLanguage}
        />
      ) : null}
      <NodeViewContent as="code" className={highlightedLanguage ? `hljs language-${highlightedLanguage}` : "hljs"} />
    </NodeViewWrapper>
  );
}
