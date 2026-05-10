"use client";
import { useCallback, useEffect, useState } from "react"
import { useHotkeys } from "react-hotkeys-hook"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"
import { useIsBreakpoint } from "@/hooks/use-is-breakpoint"

// --- Lib ---
import {
  isMarkInSchema,
  isNodeTypeSelected,
  isExtensionAvailable,
} from "@/lib/tiptap-utils"

// --- Icons ---
import { HighlighterIcon } from "@/components/tiptap-icons/highlighter-icon"

export const COLOR_HIGHLIGHT_SHORTCUT_KEY = "mod+shift+h"
export const HIGHLIGHT_COLORS = [
  {
    label: "Default background",
    value: "var(--tt-bg-color)",
    colorValue: "#ffffff",
    border: "var(--tt-bg-color-contrast)",
  },
  {
    label: "Gray background",
    value: "var(--tt-color-highlight-gray)",
    colorValue: "#f8f8f7",
    border: "var(--tt-color-highlight-gray-contrast)",
  },
  {
    label: "Brown background",
    value: "var(--tt-color-highlight-brown)",
    colorValue: "#f4eeee",
    border: "var(--tt-color-highlight-brown-contrast)",
  },
  {
    label: "Orange background",
    value: "var(--tt-color-highlight-orange)",
    colorValue: "#fbecdd",
    border: "var(--tt-color-highlight-orange-contrast)",
  },
  {
    label: "Yellow background",
    value: "var(--tt-color-highlight-yellow)",
    colorValue: "#fef9c3",
    border: "var(--tt-color-highlight-yellow-contrast)",
  },
  {
    label: "Green background",
    value: "var(--tt-color-highlight-green)",
    colorValue: "#dcfce7",
    border: "var(--tt-color-highlight-green-contrast)",
  },
  {
    label: "Blue background",
    value: "var(--tt-color-highlight-blue)",
    colorValue: "#e0f2fe",
    border: "var(--tt-color-highlight-blue-contrast)",
  },
  {
    label: "Purple background",
    value: "var(--tt-color-highlight-purple)",
    colorValue: "#f3e8ff",
    border: "var(--tt-color-highlight-purple-contrast)",
  },
  {
    label: "Pink background",
    value: "var(--tt-color-highlight-pink)",
    colorValue: "#fcf1f6",
    border: "var(--tt-color-highlight-pink-contrast)",
  },
  {
    label: "Red background",
    value: "var(--tt-color-highlight-red)",
    colorValue: "#ffe4e6",
    border: "var(--tt-color-highlight-red-contrast)",
  },
];

export function pickHighlightColorsByValue(values) {
  const colorMap = new Map(HIGHLIGHT_COLORS.map((color) => [color.value, color]))
  return values
    .map((value) => colorMap.get(value))
    .filter(color => !!color);
}

/**
 * Gets the appropriate color value based on configuration
 */
export function getHighlightColorValue(color, useColorValue = false) {
  if (!useColorValue) return color

  const colorItem = HIGHLIGHT_COLORS.find((c) => c.value === color || c.colorValue === color)
  return colorItem?.colorValue || color
}

/**
 * Checks if highlight can be applied based on the mode and current editor state
 */
export function canColorHighlight(editor, mode = "mark") {
  if (!editor || !editor.isEditable) return false

  if (mode === "mark") {
    if (
      !isMarkInSchema("highlight", editor) ||
      isNodeTypeSelected(editor, ["image"])
    )
      return false

    return editor.can().setMark("highlight");
  } else {
    if (!isExtensionAvailable(editor, ["nodeBackground"])) return false

    try {
      return editor.can().toggleNodeBackgroundColor("test");
    } catch {
      return false
    }
  }
}

/**
 * Checks if highlight is currently active
 */
export function isColorHighlightActive(editor, highlightColor, mode = "mark") {
  if (!editor || !editor.isEditable) return false

  if (mode === "mark") {
    return highlightColor
      ? editor.isActive("highlight", { color: highlightColor })
      : editor.isActive("highlight");
  } else {
    if (!highlightColor) return false

    try {
      const { state } = editor
      const { selection } = state

      const $pos = selection.$anchor
      for (let depth = $pos.depth; depth >= 0; depth--) {
        const node = $pos.node(depth)
        if (node && node.attrs?.backgroundColor === highlightColor) {
          return true
        }
      }
      return false
    } catch {
      return false
    }
  }
}

/**
 * Removes highlight based on the mode
 */
export function removeHighlight(editor, mode = "mark") {
  if (!editor || !editor.isEditable) return false
  if (!canColorHighlight(editor, mode)) return false

  if (mode === "mark") {
    return editor.chain().focus().unsetMark("highlight").run();
  } else {
    return editor.chain().focus().unsetNodeBackgroundColor().run();
  }
}

/**
 * Determines if the highlight button should be shown
 */
export function shouldShowButton(props) {
  const { editor, hideWhenUnavailable, mode } = props

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!editor.isEditable) return false

  // hideWhenUnavailable=true: check schema/extension availability
  if (mode === "mark") {
    if (!isMarkInSchema("highlight", editor)) return false
  } else {
    if (!isExtensionAvailable(editor, ["nodeBackground"])) return false
  }

  if (!editor.isActive("code")) {
    return canColorHighlight(editor, mode);
  }

  return true
}

export function useColorHighlight(config) {
  const {
    editor: providedEditor,
    label,
    highlightColor,
    hideWhenUnavailable = false,
    mode = "mark",
    useColorValue = false,
    onApplied,
  } = config

  const { editor } = useTiptapEditor(providedEditor)
  const isMobile = useIsBreakpoint()
  const [isVisible, setIsVisible] = useState(true)
  const canColorHighlightState = canColorHighlight(editor, mode)
  const actualColor = highlightColor
    ? getHighlightColorValue(highlightColor, useColorValue)
    : highlightColor
  const isActive = isColorHighlightActive(editor, actualColor, mode)

  useEffect(() => {
    if (!editor) return

    const handleSelectionUpdate = () => {
      setIsVisible(shouldShowButton({ editor, hideWhenUnavailable, mode }))
    }

    handleSelectionUpdate()

    editor.on("selectionUpdate", handleSelectionUpdate)

    return () => {
      editor.off("selectionUpdate", handleSelectionUpdate)
    };
  }, [editor, hideWhenUnavailable, mode])

  const handleColorHighlight = useCallback(() => {
    if (!editor || !canColorHighlightState || !actualColor || !label)
      return false

    if (mode === "mark") {
      if (editor.state.storedMarks) {
        const highlightMarkType = editor.schema.marks.highlight
        if (highlightMarkType) {
          editor.view.dispatch(editor.state.tr.removeStoredMark(highlightMarkType))
        }
      }

      setTimeout(() => {
        const success = editor
          .chain()
          .focus()
          .toggleHighlight({ color: actualColor })
          .run()
        if (success) {
          onApplied?.({ color: actualColor, label, mode })
        }
        return success
      }, 0)

      return true
    } else {
      const success = editor
        .chain()
        .focus()
        .toggleNodeBackgroundColor(actualColor)
        .run()

      if (success) {
        onApplied?.({ color: actualColor, label, mode })
      }
      return success
    }
  }, [canColorHighlightState, actualColor, editor, label, onApplied, mode])

  const handleRemoveHighlight = useCallback(() => {
    const success = removeHighlight(editor, mode)
    if (success) {
      onApplied?.({ color: "", label: "Remove highlight", mode })
    }
    return success
  }, [editor, onApplied, mode])

  useHotkeys(COLOR_HIGHLIGHT_SHORTCUT_KEY, (event) => {
    event.preventDefault()
    handleColorHighlight()
  }, {
    enabled: isVisible && canColorHighlightState,
    enableOnContentEditable: !isMobile,
    enableOnFormTags: true,
  })

  return {
    isVisible,
    isActive,
    handleColorHighlight,
    handleRemoveHighlight,
    canColorHighlight: canColorHighlightState,
    label: label || `Highlight`,
    shortcutKeys: COLOR_HIGHLIGHT_SHORTCUT_KEY,
    Icon: HighlighterIcon,
    mode,
  }
}
