"use client"

import { forwardRef, useCallback } from "react"

// --- Lib ---
import { parseShortcutKeys } from "@/lib/tiptap-utils"

// --- Hooks ---
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Tiptap UI ---
import type {
  IndentAction,
  UseIndentConfig,
} from "@/components/tiptap-ui/indent-button"
import {
  INDENT_SHORTCUT_KEYS,
  useIndent,
} from "@/components/tiptap-ui/indent-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import { Badge } from "@/components/tiptap-ui-primitive/badge"

type IconProps = React.SVGProps<SVGSVGElement>
type IconComponent = ({ className, ...props }: IconProps) => React.ReactElement

export interface IndentButtonProps
  extends Omit<ButtonProps, "type">, UseIndentConfig {
  /**
   * Optional text to display alongside the icon.
   */
  text?: string
  /**
   * Optional show shortcut keys in the button.
   * @default false
   */
  showShortcut?: boolean
  /**
   * Optional custom icon component to render instead of the default.
   */
  icon?: React.MemoExoticComponent<IconComponent> | React.FC<IconProps>
}

export function IndentShortcutBadge({
  action,
  shortcutKeys = INDENT_SHORTCUT_KEYS[action],
}: {
  action: IndentAction
  shortcutKeys?: string
}) {
  return <Badge>{parseShortcutKeys({ shortcutKeys })}</Badge>
}

/**
 * Button component for controlling indentation in a Tiptap editor.
 *
 * For custom button implementations, use the `useIndent` hook instead.
 */
export const IndentButton = forwardRef<HTMLButtonElement, IndentButtonProps>(
  (
    {
      editor: providedEditor,
      action,
      text,
      hideWhenUnavailable = false,
      onIndented,
      showShortcut = false,
      onClick,
      icon: CustomIcon,
      children,
      ...buttonProps
    },
    ref
  ) => {
    const { editor } = useTiptapEditor(providedEditor)
    const { isVisible, handleIndent, label, canIndent, Icon, shortcutKeys } =
      useIndent({
        editor,
        action,
        hideWhenUnavailable,
        onIndented,
      })

    const handleClick = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        handleIndent()
      },
      [handleIndent, onClick]
    )

    if (!isVisible) {
      return null
    }

    const RenderIcon = CustomIcon ?? Icon

    return (
      <Button
        type="button"
        disabled={!canIndent}
        variant="ghost"
        data-disabled={!canIndent}
        role="button"
        tabIndex={-1}
        aria-label={label}
        tooltip={label}
        onClick={handleClick}
        {...buttonProps}
        ref={ref}
      >
        {children ?? (
          <>
            <RenderIcon className="tiptap-button-icon" />
            {text && <span className="tiptap-button-text">{text}</span>}
            {showShortcut && (
              <IndentShortcutBadge
                action={action}
                shortcutKeys={shortcutKeys}
              />
            )}
          </>
        )}
      </Button>
    )
  }
)

IndentButton.displayName = "IndentButton"
