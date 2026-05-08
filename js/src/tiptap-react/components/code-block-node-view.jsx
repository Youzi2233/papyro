import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewWrapper,
} from "@tiptap/react";

import {
  codeBlockDomAttributes,
  codeBlockHighlightedLanguage,
  inferCodeBlockLanguage,
  setCodeBlockLanguage,
} from "../../tiptap-code-block.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import {
  activeCodeBlockLanguageCommandIndex,
  createCodeBlockChromeCommands,
  createCodeBlockLanguageChrome,
  createCodeBlockLanguageCommands,
  nextCodeBlockLanguageCommandIndex,
} from "../commands/code-block-command-model.js";
import { usePapyroTiptapLanguage } from "../runtime-context.jsx";

const COPY_FEEDBACK_MS = 1400;
const CODE_LANGUAGE_MENU_OWNER_ID = "mn-tiptap-react-code-language-menu";

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
  chrome,
  expanded,
  onToggle,
  onKeyDown,
  buttonRef,
}) {
  const activation = usePointerActivation(onToggle);

  return (
    <button
      type="button"
      className="mn-tiptap-code-language-button"
      contentEditable={false}
      draggable={false}
      data-language-badge={chrome.token}
      data-language-option-id={chrome.optionId}
      data-language-value={chrome.value}
      data-language-mode={chrome.mode}
      data-language-detected={chrome.detectedLanguage}
      aria-haspopup="menu"
      aria-expanded={String(expanded)}
      aria-label={chrome.ariaLabel}
      title={chrome.title}
      onKeyDown={onKeyDown}
      ref={buttonRef}
      {...activation}
    >
      <span className="mn-tiptap-code-language-title">{chrome.label}</span>
    </button>
  );
}

function CodeLanguageMenu({
  ownerId,
  language,
  currentLanguage,
  onChoose,
  onClose,
  buttonRef,
}) {
  const commands = useMemo(
    () => createCodeBlockLanguageCommands({ language, currentLanguage }),
    [currentLanguage, language],
  );
  const [activeIndex, setActiveIndex] = useState(() =>
    activeCodeBlockLanguageCommandIndex(commands),
  );
  const menuRef = useRef(null);
  const activeCommand = commands[activeIndex] ?? commands[0];
  const activeDescendant = activeCommand ? `${ownerId}-item-${activeIndex}` : undefined;

  useEffect(
    () => {
      setActiveIndex(activeCodeBlockLanguageCommandIndex(commands));
    },
    [commands],
  );
  useEffect(
    () => {
      menuRef.current?.focus?.({ preventScroll: true });
    },
    [],
  );
  useEffect(
    () => {
      if (!activeDescendant) return;
      const item = menuRef.current?.querySelector?.(`#${activeDescendant}`);
      item?.scrollIntoView?.({ block: "nearest" });
    },
    [activeDescendant],
  );

  const move = (direction) => {
    setActiveIndex((index) =>
      nextCodeBlockLanguageCommandIndex(commands, index, direction),
    );
  };
  const chooseActive = () => {
    if (activeCommand && !activeCommand.disabled) {
      onChoose(activeCommand.language);
    }
  };
  const closeAndReturnFocus = () => {
    onClose?.();
    buttonRef?.current?.focus?.({ preventScroll: true });
  };
  const handleKeyDown = (event) => {
    if (event?.isComposing || event?.keyCode === 229 || event?.which === 229) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      event.stopPropagation();
      move(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      event.stopPropagation();
      move(-1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(nextCodeBlockLanguageCommandIndex(commands, -1, 1));
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(nextCodeBlockLanguageCommandIndex(commands, commands.length, -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      chooseActive();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeAndReturnFocus();
    }
  };

  return (
    <div
      id={ownerId}
      className="mn-tiptap-code-language-menu mn-tiptap-code-language-menu-inline"
      role="menu"
      tabIndex={-1}
      aria-label={commands[0]?.group}
      aria-activedescendant={activeDescendant}
      onKeyDown={handleKeyDown}
      ref={menuRef}
    >
      <div className="mn-tiptap-code-language-menu-header">
        {commands[0]?.group}
      </div>
      <div className="mn-tiptap-code-language-menu-list">
        {commands.map((command, index) => (
          <CodeLanguageMenuItem
            key={command.id}
            id={`${ownerId}-item-${index}`}
            command={command}
            active={index === activeIndex}
            onActive={() => setActiveIndex(index)}
            onChoose={onChoose}
          />
        ))}
      </div>
    </div>
  );
}

function CodeLanguageMenuItem({ id, command, active, onActive, onChoose }) {
  const activation = usePointerActivation(() => {
    if (!command.disabled) onChoose(command.language);
  });

  return (
    <button
      type="button"
      id={id}
      className="mn-tiptap-code-language-menu-item"
      contentEditable={false}
      disabled={command.disabled}
      data-language-id={command.optionId}
      data-language-value={command.language ?? ""}
      data-language-token={command.token}
      data-active={command.active ? "true" : "false"}
      data-keyboard-active={active ? "true" : "false"}
      role="menuitemradio"
      aria-checked={String(command.active)}
      title={command.description}
      tabIndex={active ? 0 : -1}
      onPointerMove={onActive}
      onFocus={onActive}
      {...activation}
    >
      <span className="mn-tiptap-code-language-menu-item-title">{command.title}</span>
      <span className="mn-tiptap-code-language-menu-item-description">{command.description}</span>
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
  const languageButtonRef = useRef(null);
  const currentLanguage = node?.attrs?.language ?? null;
  const detectedLanguage = currentLanguage ? null : inferCodeBlockLanguage(node?.textContent);
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
  const languageChrome = useMemo(
    () =>
      createCodeBlockLanguageChrome({
        language,
        currentLanguage,
        detectedLanguage,
      }),
    [currentLanguage, detectedLanguage, language],
  );
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
  const openLanguageMenu = () => setMenuOpen(true);
  const closeLanguageMenu = () => setMenuOpen(false);
  const handleLanguageButtonKeyDown = (event) => {
    if (event?.isComposing || event?.keyCode === 229 || event?.which === 229) return;
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.stopPropagation();
      openLanguageMenu();
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      className="mn-tiptap-code-block-inner"
    >
      <CodeLanguageButton
        chrome={languageChrome}
        expanded={menuOpen}
        onToggle={() => setMenuOpen((value) => !value)}
        onKeyDown={handleLanguageButtonKeyDown}
        buttonRef={languageButtonRef}
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
          ownerId={CODE_LANGUAGE_MENU_OWNER_ID}
          language={language}
          currentLanguage={currentLanguage}
          onChoose={chooseLanguage}
          onClose={closeLanguageMenu}
          buttonRef={languageButtonRef}
        />
      ) : null}
      <NodeViewContent as="code" className={highlightedLanguage ? `hljs language-${highlightedLanguage}` : "hljs"} />
    </NodeViewWrapper>
  );
}
