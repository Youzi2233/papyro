"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"

// --- Hooks ---
import { useMenuNavigation } from "@/hooks/use-menu-navigation"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

// --- Icons ---
import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"

// --- Tiptap UI ---
import type {
  ColorType,
  ColorItem,
  RecentColor,
  UseColorTextPopoverConfig,
} from "@/components/tiptap-ui/color-text-popover"
import {
  useColorTextPopover,
  useRecentColors,
  getColorByValue,
} from "@/components/tiptap-ui/color-text-popover"
import {
  TEXT_COLORS,
  ColorTextButton,
} from "@/components/tiptap-ui/color-text-button"
import {
  HIGHLIGHT_COLORS,
  ColorHighlightButton,
} from "@/components/tiptap-ui/color-highlight-button"

// --- UI Primitives ---
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button } from "@/components/tiptap-ui-primitive/button"
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/tiptap-ui-primitive/popover"
import {
  Card,
  CardBody,
  CardGroupLabel,
  CardItemGroup,
} from "@/components/tiptap-ui-primitive/card"

// --- Utils ---
import { chunkArray } from "@/lib/tiptap-advanced-utils"
import { restoreEditorFocusAfterFloatingMenu } from "@/lib/tiptap-menu-focus"
import {
  colorKindLabel,
  colorOptionAriaLabel,
  colorOptionLabel,
  highlightColorsLabel,
  recentColorsLabel,
  textColorLabel,
  textColorOptionsLabel,
} from "@/tiptap-i18n"
import { usePapyroTiptapLanguage } from "@/tiptap-react/runtime-context"

// --- Styles ---
import "@/components/tiptap-ui/color-text-popover/color-text-popover.scss"
import { ButtonGroup } from "@/components/tiptap-ui-primitive/button-group"

// ─── Shared types ────────────────────────────────────────────────────────────

type ColorChangePayload = {
  type: ColorType
  label: string
  value: string
}

// ─── RecentColorButton ───────────────────────────────────────────────────────

export interface RecentColorButtonProps extends ButtonProps {
  colorObj: RecentColor
  withLabel?: boolean
  onColorChanged?: (payload: ColorChangePayload) => void
  editor?: Editor | null
}

export function RecentColorButton({
  colorObj,
  withLabel = false,
  onColorChanged,
  editor,
  ...props
}: RecentColorButtonProps) {
  const language = usePapyroTiptapLanguage()
  const colorSet = colorObj.type === "text" ? TEXT_COLORS : HIGHLIGHT_COLORS
  const color = getColorByValue(colorObj.value, colorSet)
  const localizedLabel = colorOptionLabel(language, colorObj.type, color.label)

  const commonProps = {
    tooltip: localizedLabel,
    text: withLabel ? localizedLabel : undefined,
    onApplied: () =>
      onColorChanged?.({
        type: colorObj.type,
        label: localizedLabel,
        value: color.value,
      }),
    ...props,
  }

  return colorObj.type === "text" ? (
    <ColorTextButton
      textColor={color.value}
      label={localizedLabel}
      editor={editor}
      {...commonProps}
    />
  ) : (
    <ColorHighlightButton
      highlightColor={color.value}
      label={localizedLabel}
      editor={editor}
      {...commonProps}
    />
  )
}

// ─── ColorGroup ──────────────────────────────────────────────────────────────

export interface ColorGroupProps {
  type: ColorType
  colors: ColorItem[][]
  onColorSelected: (payload: ColorChangePayload) => void
  selectedIndex?: number
  startIndexOffset: number
  editor?: Editor | null
}

export function ColorGroup({
  type,
  colors,
  onColorSelected,
  selectedIndex,
  startIndexOffset,
  editor,
}: ColorGroupProps) {
  const language = usePapyroTiptapLanguage()

  return colors.map((group, groupIndex) => (
    <ButtonGroup key={`${type}-group-${groupIndex}`}>
      {group.map((color, colorIndex) => {
        const itemIndex =
          startIndexOffset +
          colors.slice(0, groupIndex).reduce((acc, g) => acc + g.length, 0) +
          colorIndex

        const isHighlighted = selectedIndex === itemIndex
        const localizedLabel = colorOptionLabel(language, type, color.label)

        const commonProps = {
          tooltip: localizedLabel,
          onApplied: () =>
            onColorSelected({ type, label: localizedLabel, value: color.value }),
          tabIndex: isHighlighted ? 0 : -1,
          "data-highlighted": isHighlighted,
          "aria-label": colorOptionAriaLabel(language, type, color.label),
        }

        return type === "text" ? (
          <ButtonGroup key={`${type}-${color.value}-${colorIndex}`}>
            <ColorTextButton
              textColor={color.value}
              label={localizedLabel}
              editor={editor}
              {...commonProps}
            />
          </ButtonGroup>
        ) : (
          <ButtonGroup key={`${type}-${color.value}-${colorIndex}`}>
            <ColorHighlightButton
              highlightColor={color.value}
              label={localizedLabel}
              editor={editor}
              {...commonProps}
            />
          </ButtonGroup>
        )
      })}
    </ButtonGroup>
  ))
}

// ─── RecentColorsSection ─────────────────────────────────────────────────────

interface RecentColorsSectionProps {
  recentColors: RecentColor[]
  onColorSelected: (payload: ColorChangePayload) => void
  selectedIndex?: number
  editor?: Editor | null
}

function RecentColorsSection({
  recentColors,
  onColorSelected,
  selectedIndex,
  editor,
}: RecentColorsSectionProps) {
  const language = usePapyroTiptapLanguage()
  if (recentColors.length === 0) return null

  return (
    <CardItemGroup>
      <CardGroupLabel>{recentColorsLabel(language)}</CardGroupLabel>
      <ButtonGroup>
        {recentColors.map((colorObj, index) => (
          <RecentColorButton
            key={`recent-${colorObj.type}-${colorObj.value}`}
            colorObj={colorObj}
            onColorChanged={onColorSelected}
            tabIndex={selectedIndex === index ? 0 : -1}
            data-highlighted={selectedIndex === index}
            editor={editor}
          />
        ))}
      </ButtonGroup>
    </CardItemGroup>
  )
}

// ─── TextStyleColorPanel ─────────────────────────────────────────────────────

export interface TextStyleColorPanelProps {
  maxColorsPerGroup?: number
  maxRecentColors?: number
  onColorChanged?: (payload: ColorChangePayload) => void
  editor?: Editor | null
}

export function TextStyleColorPanel({
  maxColorsPerGroup = 5,
  maxRecentColors = 3,
  onColorChanged,
  editor,
}: TextStyleColorPanelProps) {
  const language = usePapyroTiptapLanguage()
  const { recentColors, addRecentColor, isInitialized } =
    useRecentColors(maxRecentColors)
  const containerRef = useRef<HTMLDivElement>(null)

  const textColorGroups = useMemo(
    () => chunkArray(TEXT_COLORS, maxColorsPerGroup),
    [maxColorsPerGroup]
  )

  const highlightColorGroups = useMemo(
    () => chunkArray(HIGHLIGHT_COLORS, maxColorsPerGroup),
    [maxColorsPerGroup]
  )

  const allTextColors = useMemo(() => textColorGroups.flat(), [textColorGroups])
  const allHighlightColors = useMemo(
    () => highlightColorGroups.flat(),
    [highlightColorGroups]
  )

  const textColorStartIndex = useMemo(
    () => (isInitialized ? recentColors.length : 0),
    [isInitialized, recentColors.length]
  )

  const highlightColorStartIndex = useMemo(
    () => textColorStartIndex + allTextColors.length,
    [textColorStartIndex, allTextColors.length]
  )

  const menuItems = useMemo(() => {
    const items = []

    if (isInitialized && recentColors.length > 0) {
      items.push(
        ...recentColors.map((color) => ({
          type: color.type,
          value: color.value,
          label: `${recentColorsLabel(language)} ${colorKindLabel(language, color.type)}`,
          group: "recent",
        }))
      )
    }

    items.push(
      ...allTextColors.map((color) => ({
        type: "text" as ColorType,
        value: color.value,
        label: colorOptionLabel(language, "text", color.label),
        group: "text",
      }))
    )

    items.push(
      ...allHighlightColors.map((color) => ({
        type: "highlight" as ColorType,
        value: color.value,
        label: colorOptionLabel(language, "highlight", color.label),
        group: "highlight",
      }))
    )

    return items
  }, [isInitialized, recentColors, allTextColors, allHighlightColors, language])

  const handleColorSelected = useCallback(
    ({ type, label, value }: ColorChangePayload) => {
      if (!containerRef.current) return false

      const highlighted = containerRef.current.querySelector(
        '[data-highlighted="true"]'
      ) as HTMLElement | null

      highlighted?.click()

      addRecentColor({ type, label, value })
      onColorChanged?.({ type, label, value })
    },
    [addRecentColor, onColorChanged]
  )

  const { selectedIndex } = useMenuNavigation({
    containerRef,
    items: menuItems,
    onSelect: (item) => {
      if (item)
        handleColorSelected({
          type: item.type,
          label: item.label,
          value: item.value,
        })
    },
    orientation: "both",
    autoSelectFirstItem: false,
  })

  return (
    <Card ref={containerRef} tabIndex={0} role="menu">
      <CardBody>
        {isInitialized && (
          <RecentColorsSection
            recentColors={recentColors}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
            editor={editor}
          />
        )}

        <CardItemGroup>
          <CardGroupLabel>{textColorLabel(language)}</CardGroupLabel>
          <ColorGroup
            type="text"
            colors={textColorGroups}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
            startIndexOffset={textColorStartIndex}
            editor={editor}
          />
        </CardItemGroup>

        <CardItemGroup>
          <CardGroupLabel>{highlightColorsLabel(language)}</CardGroupLabel>
          <ColorGroup
            type="highlight"
            colors={highlightColorGroups}
            onColorSelected={handleColorSelected}
            selectedIndex={selectedIndex}
            startIndexOffset={highlightColorStartIndex}
            editor={editor}
          />
        </CardItemGroup>
      </CardBody>
    </Card>
  )
}

// ─── ColorTextPopover ────────────────────────────────────────────────────────

export interface ColorTextPopoverProps
  extends
    Omit<React.ComponentProps<typeof Button>, "type">,
    UseColorTextPopoverConfig {}

/**
 * Color text popover component for Tiptap editors.
 *
 * For custom popover implementations, use the `useColorTextPopover` hook instead.
 */
export function ColorTextPopover({
  editor: providedEditor,
  hideWhenUnavailable = false,
  onColorChanged,
  onClick,
  children,
  ref,
  ...buttonProps
}: ColorTextPopoverProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const language = usePapyroTiptapLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const {
    isVisible,
    canToggle,
    activeTextStyle,
    activeHighlight,
    handleColorChanged,
    label,
    Icon,
  } = useColorTextPopover({ editor, hideWhenUnavailable, onColorChanged })

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      setIsOpen((prev) => !prev)
    },
    [onClick]
  )

  const handleOpenChange = useCallback(
    (nextIsOpen: boolean) => {
      setIsOpen(nextIsOpen)
      if (!nextIsOpen) {
        restoreEditorFocusAfterFloatingMenu(editor)
      }
    },
    [editor]
  )

  if (!isVisible) return null

  return (
    <Popover open={isOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          data-appearance="default"
          role="button"
          aria-label={label}
          tooltip={label}
          disabled={!canToggle}
          data-disabled={!canToggle}
          onClick={handleClick}
          ref={ref}
          {...buttonProps}
        >
          {children ?? (
            <>
              <span
                className="tiptap-button-color-text-popover"
                style={
                  activeHighlight.color
                    ? ({
                        "--active-highlight-color": activeHighlight.color,
                      } as React.CSSProperties)
                    : {}
                }
              >
                <Icon
                  className="tiptap-button-icon"
                  style={{ color: activeTextStyle.color || undefined }}
                />
              </span>
              <ChevronDownIcon className="tiptap-button-dropdown-small" />
            </>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        aria-label={textColorOptionsLabel(language)}
        side="bottom"
        align="start"
      >
        <TextStyleColorPanel
          onColorChanged={handleColorChanged}
          editor={editor}
        />
      </PopoverContent>
    </Popover>
  )
}

export default ColorTextPopover
