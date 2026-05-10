"use client";
import { useCallback, useEffect, useState } from "react"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { TextColorSmallIcon } from "@/components/tiptap-icons/text-color-small-icon"

// --- Lib ---
import { isMarkInSchema } from "@/lib/tiptap-utils"
import { getActiveMarkAttrs } from "@/lib/tiptap-advanced-utils"

// --- Tiptap UI ---
import { canColorText } from "@/components/tiptap-ui/use-color-text"
import { canColorHighlight } from "@/components/tiptap-ui/use-color-highlight";

/**
 * Get a color object by its value
 */
export function getColorByValue(value, colorArray) {
  return (colorArray.find((color) => color.value === value) ?? {
    value,
    label: value,
  });
}

/**
 * Checks if color text popover should be shown
 */
export function shouldShowColorTextPopover(params) {
  const { editor, hideWhenUnavailable } = params

  if (!editor) return false

  if (!hideWhenUnavailable) {
    return true
  }

  if (!editor.isEditable) return false

  if (!editor.isActive("code")) {
    return canColorText(editor) || canColorHighlight(editor);
  }

  return true
}

/**
 * Hook to manage recently used colors
 */
export function useRecentColors(maxColors = 3) {
  const [recentColors, setRecentColors] = useState([])
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    try {
      const storedColors = localStorage.getItem("tiptapRecentlyUsedColors")
      if (storedColors) {
        const colors = JSON.parse(storedColors)
        setRecentColors(colors.slice(0, maxColors))
      }
    } catch (e) {
      console.error("Failed to load stored colors:", e)
    } finally {
      setIsInitialized(true)
    }
  }, [maxColors])

  const addRecentColor = useCallback(({
    type,
    label,
    value
  }) => {
    setRecentColors((prevColors) => {
      const filtered = prevColors.filter((c) => !(c.type === type && c.value === value))
      const updated = [{ type, label, value }, ...filtered].slice(0, maxColors)

      try {
        localStorage.setItem("tiptapRecentlyUsedColors", JSON.stringify(updated))
      } catch (e) {
        console.error("Failed to store colors:", e)
      }

      return updated
    })
  }, [maxColors])

  return { recentColors, addRecentColor, isInitialized }
}

/**
 * Custom hook that provides color text popover functionality for Tiptap editor
 *
 * @example
 * ```tsx
 * // Simple usage - no params needed
 * function MySimpleColorTextPopover() {
 *   const { isVisible, handleColorChanged } = useColorTextPopover()
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <Popover>
 *       <PopoverTrigger asChild>
 *         <button>Color Text</button>
 *       </PopoverTrigger>
 *       <PopoverContent>
 *         <TextStyleColorPanel onColorChanged={handleColorChanged} />
 *       </PopoverContent>
 *     </Popover>
 *   )
 * }
 *
 * // Advanced usage with configuration
 * function MyAdvancedColorTextPopover() {
 *   const {
 *     isVisible,
 *     activeTextStyle,
 *     activeHighlight,
 *     handleColorChanged,
 *     label,
 *     Icon,
 *   } = useColorTextPopover({
 *     editor: myEditor,
 *     hideWhenUnavailable: true,
 *     onColorChanged: ({ type, label, value }) => console.log('Color changed!', { type, label, value })
 *   })
 *
 *   if (!isVisible) return null
 *
 *   return (
 *     <Popover>
 *       <PopoverTrigger asChild>
 *         <Button
 *           disabled={isDisabled}
 *           aria-label={label}
 *         >
 *           <Icon style={{ color: activeTextStyle.color }} />
 *         </Button>
 *       </PopoverTrigger>
 *       <PopoverContent>
 *         <TextStyleColorPanel onColorChanged={handleColorChanged} />
 *       </PopoverContent>
 *     </Popover>
 *   )
 * }
 * ```
 */
export function useColorTextPopover(config) {
  const {
    editor: providedEditor,
    hideWhenUnavailable = false,
    onColorChanged,
  } = config || {}

  const { editor } = useTiptapEditor(providedEditor)
  const [isVisible, setIsVisible] = useState(true)

  const textStyleInSchema = isMarkInSchema("textStyle", editor)
  const highlightInSchema = isMarkInSchema("highlight", editor)

  const activeTextStyle = getActiveMarkAttrs(editor, "textStyle") || {}
  const activeHighlight = getActiveMarkAttrs(editor, "highlight") || {}

  const canToggle = canColorText(editor) || canColorHighlight(editor)

  useEffect(() => {
    if (!editor) return

    const updateVisibility = () => {
      setIsVisible(shouldShowColorTextPopover({
        editor,
        hideWhenUnavailable,
      }))
    }

    updateVisibility()

    editor.on("selectionUpdate", updateVisibility)

    return () => {
      editor.off("selectionUpdate", updateVisibility)
    };
  }, [editor, hideWhenUnavailable, highlightInSchema, textStyleInSchema])

  const handleColorChanged = useCallback(({
    type,
    label,
    value
  }) => {
    onColorChanged?.({ type, label, value })
  }, [onColorChanged])

  return {
    isVisible,
    canToggle,
    activeTextStyle,
    activeHighlight,
    handleColorChanged,
    label: "Text color",
    Icon: TextColorSmallIcon,
  }
}
