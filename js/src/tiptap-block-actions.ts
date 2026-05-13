import type { JSONContent } from "@tiptap/core";
import type { PapyroTurnIntoEditor } from "./tiptap-turn-into-commands";
import { PAPYRO_CALLOUT_KIND_OPTIONS } from "./tiptap-markdown-snippets";
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
} from "./tiptap-text-style";
import {
  blockActionSubmenuDescription,
  blockActionSubmenuLabel,
  localizeBlockAction,
  normalizeTiptapLanguage,
} from "./tiptap-i18n";
import { serializeTiptapMarkdown } from "./tiptap-markdown.ts";
import {
  blockSiblingDrop,
  canMoveTiptapBlock,
  moveTiptapBlock,
  targetEndPos,
} from "./tiptap-block-move";
import { PAPYRO_TIPTAP_TURN_INTO_COMMANDS } from "./tiptap-turn-into-commands";

type EditorCommand = (...args: unknown[]) => unknown;
type EditorCommandMap = Record<string, EditorCommand | undefined>;

type MarkdownManagerLike = {
  serialize: (doc: JSONContent) => string;
};

type BlockActionNode = {
  nodeSize?: number;
  text?: string;
  attrs?: Record<string, unknown>;
  type?: string | {
    name?: string;
  };
  content?: BlockActionNode[] | {
    content?: BlockActionNode[];
  };
  toJSON?: () => JSONContent;
};

export type TiptapBlockActionTarget = {
  pos?: number | null;
  node?: BlockActionNode | null;
  kind?: string | null;
  block?: {
    pmViewDesc?: {
      node?: BlockActionNode | null;
    } | null;
  } | null;
};

export type TiptapBlockActionEditor = PapyroTurnIntoEditor & {
  commands?: EditorCommandMap;
  state?: {
    doc?: {
      nodeAt?: (pos: number) => BlockActionNode | null;
      textBetween?: (
        from: number,
        to: number,
        blockSeparator?: string,
        leafText?: string,
      ) => string;
    } | null;
    schema?: {
      marks?: Record<string, unknown>;
    };
  };
  storage?: {
    markdown?: {
      manager?: MarkdownManagerLike | null;
    };
  };
  view?: {
    dispatch?: (transaction: unknown) => unknown;
  };
};

export type TiptapBlockActionContext = {
  editor?: TiptapBlockActionEditor | null;
  target?: TiptapBlockActionTarget | null;
  entry?: {
    preferences?: {
      language?: unknown;
    };
  } | null;
  language?: unknown;
};

type TiptapBlockActionMeta = {
  codeLanguage?: string | null;
  [key: string]: unknown;
} | null;

type TiptapBlockActionInput = {
  id: string;
  title: string;
  description: string;
  group: string;
  icon: string;
  meta?: TiptapBlockActionMeta;
  visibleInBlockMenu?: boolean;
  shortcut?: string;
  priority?: number;
  tone?: string;
  submenu?: string | null;
  enabled?: (context: TiptapBlockActionContext) => boolean;
  run: (context: TiptapBlockActionContext) => boolean;
};

export type TiptapBlockAction = Readonly<{
  id: string;
  title: string;
  description: string;
  group: string;
  icon: string;
  meta: TiptapBlockActionMeta;
  visibleInBlockMenu: boolean;
  shortcut: string;
  priority: number;
  tone: string;
  submenu: string | null;
  enabled: (context: TiptapBlockActionContext) => boolean;
  run: (context: TiptapBlockActionContext) => boolean;
}>;

type BlockActionMenuCommand = {
  id: string;
  title: string;
  description: string;
  group: string;
  groupKey: string;
  icon: string;
  meta?: TiptapBlockActionMeta;
  shortcut: string;
  tone: string;
  visibleInBlockMenu?: boolean;
  submenu?: string | null;
  priority?: number;
  active?: boolean;
  children?: BlockActionMenuCommand[];
};

type ListedBlockActionCommand = BlockActionMenuCommand & {
  visibleInBlockMenu: boolean;
  submenu: string | null;
  priority: number;
};

export type TiptapBlockActionResult = {
  ok: boolean;
  commandId: string;
  error: "unknown_block_action" | "block_action_failed" | null;
};

type BlockMoveEditorInput = Parameters<typeof blockSiblingDrop>[0];
type BlockMoveTargetInput = Parameters<typeof blockSiblingDrop>[1];
type TargetEndInput = Parameters<typeof targetEndPos>[0];
type TextStyleEditorInput = Parameters<typeof applyMarkToBlockText>[0];
type TextStyleTargetInput = Parameters<typeof applyMarkToBlockText>[1];
type MarkdownSerializeManager = Parameters<typeof serializeTiptapMarkdown>[1];
type SetCodeBlockLanguage = (
  editor: TiptapBlockActionEditor | null | undefined,
  language: unknown,
  pos?: number | null,
) => boolean;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function normalizeCommandId(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function freezeCommand<T extends object>(command: T): Readonly<T> {
  return Object.freeze({ ...command });
}

function clipboardApi(): Clipboard | null {
  if (typeof globalThis === "undefined") return null;
  return globalThis.navigator?.clipboard ?? null;
}

function editorCommand(
  editor: TiptapBlockActionEditor | null | undefined,
  commandName: string,
  ...args: unknown[]
): boolean {
  const command = editor?.commands?.[commandName];
  if (typeof command !== "function") {
    return false;
  }
  return command(...args) !== false;
}

function focusEditor(
  editor: TiptapBlockActionEditor | null | undefined,
  pos: number | null = null,
): void {
  if (isFiniteNumber(pos)) {
    editor?.commands?.focus?.(pos);
  } else {
    editor?.commands?.focus?.();
  }
}

function insertMarkdownAt(
  editor: TiptapBlockActionEditor | null | undefined,
  markdown: string,
  pos: number | null,
): boolean {
  if (typeof editor?.commands?.insertContentAt === "function" && isFiniteNumber(pos)) {
    return editor.commands.insertContentAt(pos, markdown, { contentType: "markdown" }) !== false;
  }
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function insertMarkdown(
  editor: TiptapBlockActionEditor | null | undefined,
  markdown: string,
): boolean {
  return editorCommand(editor, "insertContent", markdown, { contentType: "markdown" });
}

function nodeToJson(node: BlockActionNode | null | undefined): JSONContent | null {
  if (!node) return null;
  if (typeof node.toJSON === "function") return node.toJSON();
  return {
    type: typeof node.type === "string" ? node.type : node.type?.name ?? "paragraph",
    text: node.text,
    attrs: node.attrs,
    content: Array.isArray(node.content)
      ? node.content.map((child) => nodeToJson(child) ?? {})
      : node.content?.content?.map?.((child) => nodeToJson(child) ?? {}),
  };
}

function blockTargetEndPos(target: TiptapBlockActionTarget | null | undefined): number | null {
  return targetEndPos(target as TargetEndInput);
}

function readTargetMarkdown(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): string {
  const from = target?.pos;
  const to = blockTargetEndPos(target);
  const doc = editor?.state?.doc;
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || to <= from || !doc) {
    return "";
  }

  if (typeof editor?.storage?.markdown?.manager?.serialize === "function") {
    try {
      const node = target?.node ?? (typeof doc.nodeAt === "function" ? doc.nodeAt(from) : null);
      const json = nodeToJson(node);
      const markdown = json
        ? serializeTiptapMarkdown(
            json,
            editor.storage.markdown.manager as MarkdownSerializeManager,
          )
        : "";
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

function readTargetText(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): string {
  const from = target?.pos;
  const to = blockTargetEndPos(target);
  const doc = editor?.state?.doc;
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || typeof doc?.textBetween !== "function") {
    return "";
  }
  return doc.textBetween(from, to, "\n", "\n").trim();
}

async function writeClipboard(text: string): Promise<boolean> {
  const clipboard = clipboardApi();
  if (typeof clipboard?.writeText !== "function") return false;
  await clipboard.writeText(text);
  return true;
}

function runEditorCommand(
  editor: TiptapBlockActionEditor | null | undefined,
  commandName: string,
  args: unknown[] = [],
  fallbackMarkdown: string | null = null,
): boolean {
  const ok = editorCommand(editor, commandName, ...args);
  if (!ok && typeof fallbackMarkdown === "string") {
    return insertMarkdown(editor, fallbackMarkdown);
  }
  return ok;
}

function canRunEditorCommand(
  editor: TiptapBlockActionEditor | null | undefined,
  commandName: string,
): boolean {
  return typeof editor?.commands?.[commandName] === "function";
}

function deleteTarget(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): boolean {
  const from = target?.pos;
  const to = blockTargetEndPos(target);
  if (isFiniteNumber(from) && isFiniteNumber(to) && to > from) {
    return editorCommand(editor, "deleteRange", { from, to });
  }
  return editorCommand(editor, "deleteNode", target?.kind);
}

function duplicateTarget(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): boolean {
  const markdown = readTargetMarkdown(editor, target);
  const position = blockTargetEndPos(target);
  if (!markdown || !isFiniteNumber(position)) return false;
  return insertMarkdownAt(editor, `\n${markdown}\n`, position);
}

function moveTarget(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
  direction: "up" | "down",
): boolean {
  const drop = blockSiblingDrop(
    editor as BlockMoveEditorInput,
    target as BlockMoveTargetInput,
    direction,
  );
  return drop
    ? moveTiptapBlock(editor as BlockMoveEditorInput, target as BlockMoveTargetInput, drop)
    : false;
}

function clearTargetFormatting(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): boolean {
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

function targetNodeName(target: TiptapBlockActionTarget | null | undefined): string {
  const type = target?.node?.type;
  return (typeof type === "string" ? type : type?.name) ?? target?.kind ?? "";
}

function isCalloutTarget(target: TiptapBlockActionTarget | null | undefined): boolean {
  return targetNodeName(target) === "calloutBlock";
}

function isCodeBlockTarget(target: TiptapBlockActionTarget | null | undefined): boolean {
  const name = targetNodeName(target);
  return name === "codeBlock" || name === "code_block";
}

function setCalloutKind(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
  kind: string,
): boolean {
  return editorCommand(editor, "setCalloutKind", { kind, pos: target?.pos });
}

function canStyleTarget(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): boolean {
  return !!editor?.state?.schema?.marks?.textStyle && isFiniteNumber(target?.pos);
}

function canHighlightTarget(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
): boolean {
  return !!editor?.state?.schema?.marks?.highlight && isFiniteNumber(target?.pos);
}

function setTargetTextColor(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
  color: string | null,
): boolean {
  return applyMarkToBlockText(
    editor as TextStyleEditorInput,
    target as TextStyleTargetInput,
    "textStyle",
    color ? { color } : null,
  );
}

function setTargetHighlight(
  editor: TiptapBlockActionEditor | null | undefined,
  target: TiptapBlockActionTarget | null | undefined,
  color: string | null,
): boolean {
  return applyMarkToBlockText(
    editor as TextStyleEditorInput,
    target as TextStyleTargetInput,
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
}: TiptapBlockActionInput): TiptapBlockAction {
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
      run: ({ editor, target }) =>
        (setCodeBlockLanguage as SetCodeBlockLanguage)(
          editor,
          option.language,
          isFiniteNumber(target?.pos) ? target.pos : null,
        ),
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
    enabled: ({ editor, target }) =>
      canMoveTiptapBlock(
        editor as BlockMoveEditorInput,
        target as BlockMoveTargetInput,
        "up",
      ),
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
    enabled: ({ editor, target }) =>
      canMoveTiptapBlock(
        editor as BlockMoveEditorInput,
        target as BlockMoveTargetInput,
        "down",
      ),
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
  #commands: readonly TiptapBlockAction[];
  #language: ReturnType<typeof normalizeTiptapLanguage>;

  constructor(
    commands: readonly TiptapBlockAction[] = PAPYRO_TIPTAP_BLOCK_ACTIONS,
    { language = "english" }: { language?: unknown } = {},
  ) {
    this.#commands = Object.freeze([...commands]);
    this.#language = normalizeTiptapLanguage(language);
  }

  get commands(): readonly TiptapBlockAction[] {
    return this.#commands;
  }

  find(commandId: unknown): TiptapBlockAction | null {
    const id = normalizeCommandId(commandId);
    return this.#commands.find((command) => command.id === id) ?? null;
  }

  setLanguage(language: unknown): void {
    this.#language = normalizeTiptapLanguage(language);
  }

  list(context: TiptapBlockActionContext = {}): BlockActionMenuCommand[] {
    const language = normalizeTiptapLanguage(context.language ?? context.entry?.preferences?.language ?? this.#language);
    const commands: ListedBlockActionCommand[] = this.#commands
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
    const submenuCommands = (submenu: string): BlockActionMenuCommand[] =>
      commands
        .filter((command) => command.submenu === submenu)
        .map(({ visibleInBlockMenu, priority, ...command }) => {
          if (
            submenu === "code-language" &&
            command.meta &&
            Object.prototype.hasOwnProperty.call(command.meta, "codeLanguage")
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

  run(
    commandId: string,
    context: TiptapBlockActionContext = {},
  ): TiptapBlockActionResult {
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

export function createTiptapBlockActionController(
  commands?: readonly TiptapBlockAction[],
): TiptapBlockActionController {
  return new TiptapBlockActionController(commands);
}
