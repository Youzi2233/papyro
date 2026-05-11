import { Extension } from "@tiptap/core"
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "@tiptap/pm/state"
import {
  clamp,
  getSelectedNodesOfType,
  updateNodesAttr,
} from "@/lib/tiptap-utils"

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    indent: {
      /**
       * Increase the indent level of the selected blocks by 1.
       * In lists, nests the list item under the previous sibling.
       */
      indent: () => ReturnType
      /**
       * Decrease the indent level of the selected blocks by 1.
       * In lists, lifts the list item out of its parent.
       */
      outdent: () => ReturnType
      /**
       * Set the indent level of the selected blocks to a specific value.
       */
      setIndent: (level: number) => ReturnType
      /**
       * Remove indentation from the selected blocks.
       */
      unsetIndent: () => ReturnType
    }
  }
}
export interface IndentOptions {
  /**
   * Block node types that support indentation.
   * List items are handled separately via sinkListItem/liftListItem.
   * @default ["paragraph", "heading", "blockquote"]
   */
  types: string[]

  /**
   * Node types that are treated as list items.
   * When the cursor is inside one of these, indent/outdent delegates to
   * sinkListItem/liftListItem instead of applying block-level indent.
   * @default ["listItem", "taskItem"]
   */
  listItemTypes: string[]

  /**
   * Minimum indent level.
   * @default 0
   */
  minLevel: number

  /**
   * Maximum indent level.
   * @default 8
   */
  maxLevel: number

  /**
   * Use inline style instead of data attribute.
   * When false, only the `data-indent` attribute is set — use CSS to style indentation.
   * When true, adds `style="margin-left: {level * indentUnit}px"` for immediate visual feedback.
   * @default false
   */
  useStyle?: boolean

  /**
   * Pixels per indent level when useStyle is enabled.
   * @default 24
   */
  indentUnit: number
}

/**
 * Parse an indent level from an HTML element by checking:
 * 1. Our own `data-indent` attribute (canonical source).
 * 2. Common CSS properties used by external editors like Google Docs and Word
 *    (`margin-left`, `padding-left`, `text-indent`).
 *
 * Returns 0 when no indentation is detected.
 */
export function parseIndentLevel(
  element: HTMLElement,
  minLevel: number,
  maxLevel: number,
  indentUnit: number
): number {
  // Our own attribute — check first
  const dataIndent = element.getAttribute("data-indent")
  if (dataIndent) {
    const level = parseInt(dataIndent, 10)
    if (!isNaN(level)) {
      return clamp(level, minLevel, maxLevel)
    }
  }

  // Fallback: CSS properties that external editors use for indentation
  const cssProps = ["marginLeft", "paddingLeft", "textIndent"] as const
  for (const prop of cssProps) {
    const value = element.style?.[prop]
    if (value) {
      const px = parseFloat(value)
      if (!isNaN(px) && px > 0 && indentUnit > 0) {
        const level = Math.round(px / indentUnit)
        return clamp(level, minLevel, maxLevel)
      }
    }
  }

  return 0
}

/**
 * Walk up the document tree from the cursor and return the first list-item
 * node name found, or `null` if the cursor is not inside a list.
 */
export function getListItemName(
  state: EditorState,
  listItemTypes: Set<string>
): string | null {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth--) {
    const name = $from.node(depth).type.name
    if (listItemTypes.has(name)) {
      return name
    }
  }
  return null
}

/**
 * Shared check for the Enter and Backspace shortcuts.
 *
 * Both keys should trigger an outdent when the cursor is:
 * - in a non-list block that supports indentation
 * - the block has indent > 0
 *
 * The difference:
 * - **Enter**: fires when the block is completely empty (user pressed Enter
 *   on a blank indented line — behaves like Google Docs).
 * - **Backspace**: fires when the cursor is at the very start of the block
 *   (the block can still have content).
 */
function shouldOutdentAtCursor(
  state: EditorState,
  types: string[],
  listItemTypes: Set<string>,
  options: { onlyIfEmpty: boolean }
): boolean {
  const { selection } = state
  const { $from } = selection

  // Only applies to collapsed cursors (no range selected)
  if (!selection.empty) return false

  // Lists have their own indent/outdent via sink/lift — skip
  if (getListItemName(state, listItemTypes) !== null) return false

  const parent = $from.parent

  // Must be one of the block types we handle
  if (!types.includes(parent.type.name)) return false

  // Must already be indented
  if ((parent.attrs.indent as number) <= 0) return false

  if (options.onlyIfEmpty) {
    // Enter: only outdent if the block has no content
    return parent.content.size === 0
  }

  // Backspace: only outdent if the cursor is at position 0 in the block
  return $from.parentOffset === 0
}

const indentPluginKey = new PluginKey("indent")

export const Indent = Extension.create<IndentOptions>({
  name: "indent",

  addOptions() {
    return {
      types: ["paragraph", "heading", "blockquote"],
      listItemTypes: ["listItem", "taskItem"],
      minLevel: 0,
      maxLevel: 8,
      useStyle: false,
      indentUnit: 24,
    }
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,

            parseHTML: (element) => {
              return parseIndentLevel(
                element,
                this.options.minLevel,
                this.options.maxLevel,
                this.options.indentUnit
              )
            },

            renderHTML: (attributes) => {
              const level = Number(attributes.indent) || 0
              if (level === 0) return {}

              const attrs: Record<string, string> = {
                "data-indent": String(level),
                style: `--tt-indent-level: ${level}`,
              }

              if (this.options.useStyle && this.options.indentUnit > 0) {
                attrs.style = `--tt-indent-level: ${level}; margin-left: ${level * this.options.indentUnit}px`
              }

              return attrs
            },
          },
        },
      },
    ]
  },

  addCommands() {
    const listItemTypesSet = new Set(this.options.listItemTypes)

    /**
     * Core helper — finds every selected block that supports indentation
     * and applies a `resolve` function to compute the new indent level.
     *
     * Examples:
     *   applyIndent(props, (cur) => cur + 1)   // indent
     *   applyIndent(props, (cur) => cur - 1)   // outdent
     *   applyIndent(props, () => 3)             // set to 3
     *   applyIndent(props, () => 0)             // reset
     */
    const applyIndent = (
      { state, tr }: { state: EditorState; tr: Transaction },
      resolve: (currentLevel: number) => number
    ) => {
      const targets = getSelectedNodesOfType(
        state.selection,
        this.options.types
      )
      if (targets.length === 0) return false

      return updateNodesAttr(tr, targets, "indent", (prev) => {
        return clamp(
          resolve(Number(prev) || 0),
          this.options.minLevel,
          this.options.maxLevel
        )
      })
    }

    return {
      indent: () => (props) => {
        // Lists use their own nesting mechanism (sink)
        const listItemName = getListItemName(props.state, listItemTypesSet)
        if (listItemName && "sinkListItem" in props.commands) {
          return props.commands.sinkListItem(listItemName)
        }

        return applyIndent(props, (current) => current + 1)
      },

      outdent: () => (props) => {
        // Lists use their own nesting mechanism (lift)
        const listItemName = getListItemName(props.state, listItemTypesSet)
        if (listItemName && "liftListItem" in props.commands) {
          return props.commands.liftListItem(listItemName)
        }

        return applyIndent(props, (current) => current - 1)
      },

      setIndent: (level: number) => (props) => {
        return applyIndent(props, () => level)
      },

      unsetIndent: () => (props) => {
        return applyIndent(props, () => 0)
      },
    }
  },

  addProseMirrorPlugins() {
    const types = this.options.types

    return [
      new Plugin({
        key: indentPluginKey,

        /**
         * After a drag-and-drop, adjust the indent of the dropped blocks so
         * they match their new neighbours. Without this, dragging an indented
         * paragraph to a non-indented area would keep the old indent level.
         */
        appendTransaction(
          transactions: readonly Transaction[],
          _oldState: EditorState,
          newState: EditorState
        ) {
          const isDrop = transactions.some(
            (tr) => tr.getMeta("uiEvent") === "drop"
          )
          if (!isDrop) return null

          const { doc, selection } = newState
          const { $from, $to } = selection

          // --- Figure out what indent level the drop target has ---

          const depth = $from.depth > 0 ? $from.depth : 1
          const dropBlockStart = $from.before(depth)
          const $drop = doc.resolve(dropBlockStart)
          const parent = $drop.node($drop.depth)
          const index = $drop.index($drop.depth)

          let targetIndent = 0

          if (index > 0) {
            // Use the previous sibling's indent
            const prevSibling = parent.child(index - 1)
            targetIndent = (prevSibling.attrs.indent as number) || 0
          } else {
            // First child — look at the next sibling after the dropped content
            const endDepth = $to.depth > 0 ? $to.depth : 1
            const dropBlockEnd = $to.after(endDepth)
            const $afterDrop = doc.resolve(dropBlockEnd)
            const afterIndex = $afterDrop.indexAfter($afterDrop.depth)
            const afterParent = $afterDrop.node($afterDrop.depth)

            if (afterIndex < afterParent.childCount) {
              targetIndent =
                (afterParent.child(afterIndex).attrs.indent as number) || 0
            }
          }

          // --- Apply that indent to every dropped block ---

          const { tr } = newState
          let changed = false

          doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
            if (!types.includes(node.type.name)) return false

            const currentIndent = (node.attrs.indent as number) || 0
            if (currentIndent === targetIndent) return false

            tr.setNodeMarkup(
              pos,
              undefined,
              { ...node.attrs, indent: targetIndent },
              node.marks
            )
            changed = true
            return false
          })

          return changed ? tr : null
        },
      }),
    ]
  },

  addKeyboardShortcuts() {
    const listItemTypesSet = new Set(this.options.listItemTypes)

    /**
     * Check whether the cursor is in a context where indent/outdent applies.
     * Returns `true` for indentable block types and list items, `false` for
     * nodes that handle Tab themselves (e.g. codeBlock).
     */
    const isIndentableContext = (): boolean => {
      const state = this.editor.state

      // List items use sink/lift — always an indentable context
      if (getListItemName(state, listItemTypesSet) !== null) return true

      // Check if the parent block is one of the configured types
      const { $from } = state.selection
      return this.options.types.includes($from.parent.type.name)
    }

    return {
      // Tab / Shift-Tab — only capture when in an indentable context,
      // otherwise let other extensions handle it (e.g. codeBlock inserts a tab)
      Tab: () => {
        if (!isIndentableContext()) return false
        this.editor.commands.indent()
        return true
      },
      "Shift-Tab": () => {
        if (!isIndentableContext()) return false
        this.editor.commands.outdent()
        return true
      },

      // Enter on an empty indented block → outdent
      Enter: ({ editor }) => {
        if (
          !shouldOutdentAtCursor(
            editor.state,
            this.options.types,
            listItemTypesSet,
            {
              onlyIfEmpty: true,
            }
          )
        ) {
          return false
        }
        return editor.commands.outdent()
      },

      // Backspace at the start of an indented block → outdent
      Backspace: ({ editor }) => {
        if (
          !shouldOutdentAtCursor(
            editor.state,
            this.options.types,
            listItemTypesSet,
            {
              onlyIfEmpty: false,
            }
          )
        ) {
          return false
        }
        return editor.commands.outdent()
      },
    }
  },
})
