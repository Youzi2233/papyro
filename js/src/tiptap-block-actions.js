import { PAPYRO_CALLOUT_KIND_OPTIONS } from "./tiptap-markdown-snippets.ts";
import {
  PAPYRO_CODE_LANGUAGE_OPTIONS,
  codeBlockLanguageDisplayLabel,
  normalizeCodeBlockLanguage,
  setCodeBlockLanguage,
} from "./tiptap-code-block.js";
import {
  applyMarkToBlockText,
  PAPYRO_HIGHLIGHT_OPTIONS,
  PAPYRO_TEXT_COLOR_OPTIONS,
} from "./tiptap-text-style.ts";
import {
  blockActionSubmenuDescription,
  blockActionSubmenuLabel,
  localizeBlockAction,
  normalizeTiptapLanguage,
} from "./tiptap-i18n.ts";
import { serializeTiptapMarkdown } from "./tiptap-markdown.js";
import {
  blockSiblingDrop,
  canMoveTiptapBlock,
  moveTiptapBlock,
  targetEndPos,
} from "./tiptap-block-move.ts";
import { PAPYRO_TIPTAP_TURN_INTO_COMMANDS } from "./tiptap-turn-into-commands.ts";

function normalizeCommandId(value) {
  return String(value ?? "").trim().toLowerCase();
}

function freezeCommand(command) {
  return Object.freeze({ ...command });
}

function clipboardApi() {
  if (typeof globalThis === "undefined") return null;
  return globalThis.navigator?.clipboard ?? null;
}

function editorCommand(editor, commandName, ...args) {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function focusEditor(editor, pos = null) {
  if (Number.isFinite(pos)) {
    editor?.commands?.focus?.(pos);
  } else {
    editor?.commands?.focus?.();
  }
}

function insertMarkdownAt(editor, markdown, pos) {
  if (typeof editor?.commands?.insertContentAt === "function" && Number.isFinite(pos)) {
    return editor.commands.insertContentAt(pos, markdown, { contentType: "markdown" }) !== false;
  }
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function insertMarkdown(editor, markdown) {
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function nodeToJson(node) {
  if (!node) return null;
  if (typeof node.toJSON === "function") return node.toJSON();
  return {
    type: node.type?.name ?? node.type ?? "paragraph",
    text: node.text,
    attrs: node.attrs,
    content: Array.isArray(node.content)
      ? node.content
      : node.content?.content?.map?.((child) => nodeToJson(child)),
  };
}

function readTargetMarkdown(editor, target) {
  const from = target?.pos;
  const to = targetEndPos(target);
  const doc = editor?.state?.doc;
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || !doc) {
    return "";
  }

  if (typeof editor?.storage?.markdown?.manager?.serialize === "function") {
    try {
      const node = target?.node ?? (typeof doc.nodeAt === "function" ? doc.nodeAt(from) : null);
      const json = nodeToJson(node);
      const markdown = json ? serializeTiptapMarkdown(json, editor.storage.markdown.manager) : "";
      if (typeof markdown === "string" && markdown.trim()) return markdown.trim();
    } catch (_error) {
      // Fall back to plain text when Markdown serialization is unavailable for a custom node.
    }
  }

  if (typeof doc.textBetween === "function") {
    return doc.textBetween(from, to, "\n", "\n").trim();
  }
  return "";
}

function readTargetText(editor, target) {
  const from = target?.pos;
  const to = targetEndPos(target);
  const doc = editor?.state?.doc;
  if (!Number.isFinite(from) || !Number.isFinite(to) || typeof doc?.textBetween !== "function") {
    return "";
  }
  return doc.textBetween(from, to, "\n", "\n").trim();
}

async function writeClipboard(text) {
  const clipboard = clipboardApi();
  if (typeof clipboard?.writeText !== "function") return false;
  await clipboard.writeText(text);
  return true;
}

function runEditorCommand(editor, commandName, args = [], fallbackMarkdown = null) {
  const ok = editorCommand(editor, commandName, ...args);
  if (!ok && typeof fallbackMarkdown === "string") {
    return insertMarkdown(editor, fallbackMarkdown);
  }
  return ok;
}

function canRunEditorCommand(editor, commandName) {
  return typeof editor?.commands?.[commandName] === "function";
}

function deleteTarget(editor, target) {
  const from = target?.pos;
  const to = targetEndPos(target);
  if (Number.isFinite(from) && Number.isFinite(to) && to > from) {
    return editorCommand(editor, "deleteRange", { from, to });
  }
  return editorCommand(editor, "deleteNode", target?.kind);
}

function duplicateTarget(editor, target) {
  const markdown = readTargetMarkdown(editor, target);
  const position = targetEndPos(target);
  if (!markdown || !Number.isFinite(position)) return false;
  return insertMarkdownAt(editor, `\n${markdown}\n`, position);
}

function moveTarget(editor, target, direction) {
  const drop = blockSiblingDrop(editor, target, direction);
  return drop ? moveTiptapBlock(editor, target, drop) : false;
}

function clearTargetFormatting(editor, target) {
  let ran = false;
  if (typeof editor?.commands?.unsetAllMarks === "function") {
    ran = editorCommand(editor, "unsetAllMarks") !== false || ran;
  }
  if (typeof editor?.commands?.clearNodes === "function") {
    ran = editorCommand(editor, "clearNodes") !== false || ran;
  }
  if (canStyleTarget(editor, target)) {
    ran = setTargetTextColor(editor, target, null) !== false || ran;
  }
  if (canHighlightTarget(editor, target)) {
    ran = setTargetHighlight(editor, target, null) !== false || ran;
  }
  return ran;
}

function targetNodeName(target) {
  return target?.node?.type?.name ?? target?.node?.type ?? target?.kind ?? "";
}

function isCalloutTarget(target) {
  return targetNodeName(target) === "calloutBlock";
}

function isCodeBlockTarget(target) {
  const name = targetNodeName(target);
  return name === "codeBlock" || name === "code_block";
}

function setCalloutKind(editor, target, kind) {
  return editorCommand(editor, "setCalloutKind", { kind, pos: target?.pos });
}

function canStyleTarget(editor, target) {
  return !!editor?.state?.schema?.marks?.textStyle && Number.isFinite(target?.pos);
}

function canHighlightTarget(editor, target) {
  return !!editor?.state?.schema?.marks?.highlight && Number.isFinite(target?.pos);
}

function setTargetTextColor(editor, target, color) {
  return applyMarkToBlockText(
    editor,
    target,
    "textStyle",
    color ? { color } : null,
  );
}

function setTargetHighlight(editor, target, color) {
  return applyMarkToBlockText(
    editor,
    target,
    "highlight",
    color ? { color } : null,
  );
}

function createCommand({
  id,
  title,
  description,
  group,
  icon,
  meta = null,
  visibleInBlockMenu = true,
  shortcut = "",
  priority = 100,
  tone = "default",
  submenu = null,
  enabled = () => true,
  run,
}) {
  if (!id || typeof run !== "function") {
    throw new TypeError("Tiptap block actions require an id and run function");
  }

  return freezeCommand({
    id,
    title,
    description,
    group,
    icon,
    meta,
    visibleInBlockMenu,
    shortcut,
    priority,
    tone,
    submenu,
    enabled,
    run,
  });
}

export const PAPYRO_TIPTAP_BLOCK_ACTIONS = Object.freeze([
  ...PAPYRO_TIPTAP_TURN_INTO_COMMANDS.map((command) =>
    createCommand({
      ...command,
      submenu: "turn-into",
    }),
  ),
  ...PAPYRO_CALLOUT_KIND_OPTIONS.map((option, index) =>
    createCommand({
      id: `callout-kind-${option.kind.toLowerCase()}`,
      title: option.title,
      description: `Switch callout to ${option.title.toLowerCase()}`,
      group: "Callout",
      icon: "callout",
      priority: 20 + index,
      enabled: ({ target }) => isCalloutTarget(target),
      run: ({ editor, target }) => setCalloutKind(editor, target, option.kind),
    }),
  ),
  ...PAPYRO_TEXT_COLOR_OPTIONS.map((option, index) =>
    createCommand({
      id: `text-color-${option.id}`,
      title: option.title,
      description: option.description,
      group: "Color",
      icon: `text-color ${option.id}`,
      priority: 30 + index,
      enabled: ({ editor, target }) => canStyleTarget(editor, target),
      run: ({ editor, target }) => setTargetTextColor(editor, target, option.color),
    }),
  ),
  ...PAPYRO_HIGHLIGHT_OPTIONS.map((option, index) =>
    createCommand({
      id: `highlight-${option.id}`,
      title: option.title,
      description: option.description,
      group: "Highlight",
      icon: `highlight ${option.id}`,
      priority: 40 + index,
      enabled: ({ editor, target }) => canHighlightTarget(editor, target),
      run: ({ editor, target }) => setTargetHighlight(editor, target, option.color),
    }),
  ),
  ...PAPYRO_CODE_LANGUAGE_OPTIONS.map((option, index) =>
    createCommand({
      id: `code-language-${option.id}`,
      title: option.label,
      description: option.language
        ? `Highlight this block as ${option.label}`
        : "Let Papyro auto-detect this code block",
      group: "Code language",
      icon: "code-language",
      meta: { codeLanguage: option.language ?? null },
      submenu: "code-language",
      priority: 50 + index,
      enabled: ({ target }) => isCodeBlockTarget(target),
      run: ({ editor, target }) => setCodeBlockLanguage(editor, option.language, target?.pos),
    }),
  ),
  createCommand({
    id: "divider",
    title: "Divider",
    description: "Insert a horizontal rule",
    group: "Blocks",
    icon: "divider",
    visibleInBlockMenu: false,
    priority: 53,
    run: ({ editor }) => runEditorCommand(editor, "setHorizontalRule", [], "\n---\n"),
  }),
  createCommand({
    id: "table",
    title: "Table",
    description: "Insert a 3 by 2 table",
    group: "Advanced",
    icon: "table",
    priority: 50,
    enabled: () => false,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "insertTable",
        [{ rows: 3, cols: 2, withHeaderRow: true }],
        "\n| Column | Notes |\n| --- | --- |\n|  |  |\n",
      ),
  }),
  createCommand({
    id: "math-block",
    title: "Math block",
    description: "Insert a display formula",
    group: "Advanced",
    icon: "math",
    priority: 51,
    enabled: () => false,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setMathBlock",
        [{ source: "x^2 + y^2 = z^2" }],
        "\n$$\n\n$$\n",
      ),
  }),
  createCommand({
    id: "mermaid",
    title: "Mermaid diagram",
    description: "Insert a flowchart block",
    group: "Advanced",
    icon: "mermaid",
    priority: 52,
    enabled: () => false,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setMermaidBlock",
        [{ source: "flowchart TD\n  A --> B" }],
        "\n```mermaid\nflowchart TD\n  A --> B\n```\n",
      ),
  }),
  createCommand({
    id: "image",
    title: "Image",
    description: "Insert Markdown image syntax",
    group: "Advanced",
    icon: "image",
    priority: 53,
    enabled: () => false,
    run: ({ editor }) =>
      runEditorCommand(
        editor,
        "setImage",
        [{ src: "assets/image.png", alt: "alt text", title: "" }],
        "![alt text](assets/image.png)",
      ),
  }),
  createCommand({
    id: "reset-formatting",
    title: "Reset formatting",
    description: "Clear marks and return to plain text",
    group: "Actions",
    icon: "reset-formatting",
    priority: 12,
    run: ({ editor, target }) => clearTargetFormatting(editor, target),
  }),
  createCommand({
    id: "copy-block",
    title: "Copy block",
    description: "Copy this block as Markdown",
    group: "Actions",
    icon: "copy",
    shortcut: "Ctrl C",
    priority: 10,
    run: ({ editor, target }) => {
      const text = readTargetMarkdown(editor, target) || readTargetText(editor, target);
      if (!text) return false;
      writeClipboard(text).catch(() => {});
      return true;
    },
  }),
  createCommand({
    id: "duplicate-block",
    title: "Duplicate block",
    description: "Copy this block below",
    group: "Actions",
    icon: "duplicate",
    shortcut: "Ctrl D",
    priority: 11,
    run: ({ editor, target }) => duplicateTarget(editor, target),
  }),
  createCommand({
    id: "move-block-up",
    title: "Move up",
    description: "Move this block above the previous block",
    group: "Actions",
    icon: "move-up",
    shortcut: "Alt Up",
    priority: 11.2,
    enabled: ({ editor, target }) => canMoveTiptapBlock(editor, target, "up"),
    run: ({ editor, target }) => moveTarget(editor, target, "up"),
  }),
  createCommand({
    id: "move-block-down",
    title: "Move down",
    description: "Move this block below the next block",
    group: "Actions",
    icon: "move-down",
    shortcut: "Alt Down",
    priority: 11.4,
    enabled: ({ editor, target }) => canMoveTiptapBlock(editor, target, "down"),
    run: ({ editor, target }) => moveTarget(editor, target, "down"),
  }),
  createCommand({
    id: "delete",
    title: "Delete block",
    description: "Remove this block",
    group: "Danger",
    icon: "delete",
    shortcut: "Del",
    priority: 90,
    tone: "danger",
    run: ({ editor, target }) => deleteTarget(editor, target),
  }),
]);

export class TiptapBlockActionController {
  #commands;
  #language;

  constructor(commands = PAPYRO_TIPTAP_BLOCK_ACTIONS, { language = "english" } = {}) {
    this.#commands = Object.freeze([...commands]);
    this.#language = normalizeTiptapLanguage(language);
  }

  get commands() {
    return this.#commands;
  }

  find(commandId) {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  setLanguage(language) {
    this.#language = normalizeTiptapLanguage(language);
  }

  list(context = {}) {
    const language = normalizeTiptapLanguage(context.language ?? context.entry?.preferences?.language ?? this.#language);
    const commands = this.#commands
      .filter((command) => command.enabled(context) !== false)
      .sort((left, right) => left.priority - right.priority)
      .map((command) => ({
        id: command.id,
        title: command.title,
        description: command.description,
        group: command.group,
        groupKey: command.group,
        icon: command.icon,
        meta: command.meta ?? null,
        shortcut: command.shortcut,
        tone: command.tone,
        visibleInBlockMenu: command.visibleInBlockMenu,
        submenu: command.submenu,
        priority: command.priority,
      }))
      .map((command) => localizeBlockAction(command, language));
    const topLevel = commands
      .filter((command) => command.visibleInBlockMenu !== false && !command.submenu)
      .map(({ visibleInBlockMenu, submenu, meta: _meta, ...command }) => command);
    const targetLanguage = isCodeBlockTarget(context.target)
      ? normalizeCodeBlockLanguage(context.target?.node?.attrs?.language ?? null)
      : null;
    const submenuCommands = (submenu) =>
      commands
        .filter((command) => command.submenu === submenu)
        .map(({ visibleInBlockMenu, priority, ...command }) => {
          if (
            submenu === "code-language" &&
            Object.prototype.hasOwnProperty.call(command.meta ?? {}, "codeLanguage")
          ) {
            const selectedLanguage = normalizeCodeBlockLanguage(command.meta.codeLanguage ?? null);
            const active =
              (targetLanguage ?? null) === (selectedLanguage ?? null) ||
              (!targetLanguage && selectedLanguage === null);
            const { meta: _meta, ...visibleCommand } = command;
            return {
              ...visibleCommand,
              title: codeBlockLanguageDisplayLabel(language, selectedLanguage),
              active,
            };
          }
          const { meta: _meta, ...visibleCommand } = command;
          return visibleCommand;
        });
    const submenuParents = [
      {
        id: "turn-into",
        submenu: "turn-into",
        priority: 12.5,
        group: localizeBlockAction({ group: "Actions" }, language).group,
        groupKey: "Actions",
        icon: "turn-into",
      },
      {
        id: "code-language",
        submenu: "code-language",
        priority: 13.5,
        group: localizeBlockAction({ group: "Actions" }, language).group,
        groupKey: "Actions",
        icon: "code-language",
      },
    ]
      .map((parent) => ({
        ...parent,
        title: blockActionSubmenuLabel(language, parent.submenu),
        description: blockActionSubmenuDescription(language, parent.submenu),
        shortcut: "",
        tone: "default",
        children: submenuCommands(parent.submenu),
      }))
      .filter((parent) => parent.children.length > 0);
    return [...topLevel, ...submenuParents]
      .sort((left, right) => (left.priority ?? 100) - (right.priority ?? 100))
      .map(({ priority, ...command }) => command);
  }

  run(commandId, context = {}) {
    const command = this.find(commandId);
    if (!command) {
      return {
        ok: false,
        commandId,
        error: "unknown_block_action",
      };
    }

    focusEditor(context.editor, context.target?.pos);
    const ok = command.run(context) !== false;
    if (ok) {
      focusEditor(context.editor);
    }

    return {
      ok,
      commandId: command.id,
      error: ok ? null : "block_action_failed",
    };
  }
}

export function createTiptapBlockActionController(commands) {
  return new TiptapBlockActionController(commands);
}
