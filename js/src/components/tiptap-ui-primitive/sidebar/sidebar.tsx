import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { useMergeRefs } from "@floating-ui/react"
import "./sidebar.scss"
import { Button } from "../button"
import { cn, clamp } from "@/lib/tiptap-utils"

const SIDEBAR_COOKIE_NAME = "sidebar:state"
const SIDEBAR_WIDTH_COOKIE_NAME = "sidebar:width"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

function getCookie(name: string): string | undefined {
  if (typeof document === "undefined") return undefined
  const value = `; ${document.cookie}`
  const parts = value.split(`; ${name}=`)
  if (parts.length === 2) return parts.pop()?.split(";").shift()
  return undefined
}

function setCookie(
  name: string,
  value: string,
  maxAge = SIDEBAR_COOKIE_MAX_AGE
) {
  if (typeof document === "undefined") return
  document.cookie = `${name}=${value}; max-age=${maxAge}; path=/; SameSite=Lax`
}

export type SidebarMode = "push" | "overlay"
export type SidebarSide = "left" | "right"
export type SidebarStyle = "plain" | "elevated"
export type SidebarAppearance = "default" | "subdued" | "emphasized"
export type SidebarBreakpoint = "sm" | "md" | "lg" | "xl" | "2xl"

interface SidebarContextValue {
  id: string
  open: boolean
  setOpen: (open: boolean) => void
  fullsize: boolean
  setFullsize: (fullsize: boolean) => void
  width: number
  setWidth: (width: number) => void
  isResizing: boolean
  setIsResizing: (isResizing: boolean) => void
  toggleSidebar: () => void
  mode: SidebarMode
  side: SidebarSide
  variant: SidebarStyle
  appearance: SidebarAppearance
  resizable: boolean
  minWidth: number
  maxWidth: number
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined)

/**
 * Hook to access sidebar context.
 * @throws Error if used outside of SidebarProvider
 */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

/**
 * Hook to optionally access sidebar context.
 * Returns undefined if used outside of SidebarProvider.
 */
export function useSidebarOptional(): SidebarContextValue | undefined {
  return useContext(SidebarContext)
}

interface UseResizableOptions {
  side: SidebarSide
  minWidth: number
  maxWidth: number
  initialWidth: number
  enabled: boolean
  onResize?: (width: number) => void
  onResizeEnd?: (width: number) => void
}

function useResizable({
  side,
  minWidth,
  maxWidth,
  initialWidth,
  enabled,
  onResize,
  onResizeEnd,
}: UseResizableOptions) {
  const elementRef = useRef<HTMLDivElement>(null)
  const [isResizing, setIsResizing] = useState(false)
  const [width, setWidth] = useState(initialWidth)

  const resizeState = useRef({
    startX: 0,
    startWidth: 0,
    currentWidth: initialWidth,
    rafId: null as number | null,
  })

  // Keep current width in sync
  useEffect(() => {
    resizeState.current.currentWidth = width
  }, [width])

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!enabled) return

      e.preventDefault()
      e.stopPropagation()

      const state = resizeState.current
      state.startX = e.clientX
      state.startWidth = state.currentWidth

      // Apply width directly to DOM to prevent flash
      if (elementRef.current) {
        elementRef.current.style.width = `${state.currentWidth}px`
      }

      document.body.style.cursor = "ew-resize"
      document.body.style.userSelect = "none"

      setIsResizing(true)
    },
    [enabled]
  )

  useEffect(() => {
    if (!isResizing) return

    const state = resizeState.current

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault()

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId)
      }

      state.rafId = requestAnimationFrame(() => {
        const deltaX =
          side === "left" ? e.clientX - state.startX : state.startX - e.clientX

        const newWidth = clamp(state.startWidth + deltaX, minWidth, maxWidth)
        state.currentWidth = newWidth

        if (elementRef.current) {
          elementRef.current.style.width = `${newWidth}px`
        }

        onResize?.(newWidth)
      })
    }

    const handleMouseUp = () => {
      const finalWidth = state.currentWidth

      // Cleanup
      document.body.style.cursor = ""
      document.body.style.userSelect = ""

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId)
        state.rafId = null
      }

      setIsResizing(false)
      setWidth(finalWidth)
      onResizeEnd?.(finalWidth)
    }

    document.addEventListener("mousemove", handleMouseMove)
    document.addEventListener("mouseup", handleMouseUp)

    return () => {
      document.removeEventListener("mousemove", handleMouseMove)
      document.removeEventListener("mouseup", handleMouseUp)
      document.body.style.cursor = ""
      document.body.style.userSelect = ""

      if (state.rafId !== null) {
        cancelAnimationFrame(state.rafId)
      }
    }
  }, [isResizing, side, minWidth, maxWidth, onResize, onResizeEnd])

  return {
    elementRef,
    isResizing,
    width,
    setWidth,
    handleResizeStart,
  }
}

export interface SidebarProviderProps extends React.ComponentProps<"div"> {
  /** Sidebar mode: "push" moves content, "overlay" floats above. @default "push" */
  mode?: SidebarMode
  /** Which side the sidebar appears on. @default "left" */
  side?: SidebarSide
  /** Visual style variant. @default "plain" */
  variant?: SidebarStyle
  /** Visual prominence. @default "default" */
  appearance?: SidebarAppearance
  /** Whether sidebar can be resized. @default false */
  resizable?: boolean
  /** Default open state. @default true */
  defaultOpen?: boolean
  /** Controlled open state. */
  open?: boolean
  /** Callback when open state changes. */
  onOpenChange?: (open: boolean) => void
  /** Default fullsize state. @default false */
  defaultFullsize?: boolean
  /** Default width in pixels. @default 320 */
  defaultWidth?: number
  /** Minimum width in pixels. @default 200 */
  minWidth?: number
  /** Maximum width in pixels. @default 600 */
  maxWidth?: number
}

/**
 * Provides sidebar context with state management, keyboard shortcuts, and persistence.
 */
export const SidebarProvider = forwardRef<HTMLDivElement, SidebarProviderProps>(
  (
    {
      id: idProp,
      mode = "push",
      side = "left",
      variant = "plain",
      appearance = "default",
      resizable = false,
      defaultOpen = true,
      open: controlledOpen,
      onOpenChange,
      defaultFullsize = false,
      defaultWidth = 320,
      minWidth = 200,
      maxWidth = 600,
      children,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const id = idProp ?? `sidebar-${generatedId}`

    // Open state with cookie persistence
    const [open, setOpenState] = useState(() => {
      if (controlledOpen !== undefined) return controlledOpen
      const cookieValue = getCookie(SIDEBAR_COOKIE_NAME)
      return cookieValue ? cookieValue === "true" : defaultOpen
    })

    const [fullsize, setFullsize] = useState(defaultFullsize)
    const [isResizing, setIsResizing] = useState(false)

    // Width state with cookie persistence
    const [width, setWidthState] = useState(() => {
      const cookieValue = getCookie(SIDEBAR_WIDTH_COOKIE_NAME)
      if (cookieValue) {
        const parsed = parseInt(cookieValue, 10)
        if (!isNaN(parsed)) return clamp(parsed, minWidth, maxWidth)
      }
      return defaultWidth
    })

    // Sync controlled open prop
    useEffect(() => {
      if (controlledOpen !== undefined) {
        setOpenState(controlledOpen)
      }
    }, [controlledOpen])

    const setOpen = useCallback(
      (newOpen: boolean) => {
        setOpenState(newOpen)
        setCookie(SIDEBAR_COOKIE_NAME, String(newOpen))
        onOpenChange?.(newOpen)
      },
      [onOpenChange]
    )

    const setWidth = useCallback(
      (newWidth: number) => {
        const clamped = clamp(newWidth, minWidth, maxWidth)
        setWidthState(clamped)
        setCookie(SIDEBAR_WIDTH_COOKIE_NAME, String(clamped))
      },
      [minWidth, maxWidth]
    )

    const toggleSidebar = useCallback(() => {
      setOpen(!open)
    }, [open, setOpen])

    // Keyboard shortcut: Ctrl/Cmd + B
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === SIDEBAR_KEYBOARD_SHORTCUT) {
          e.preventDefault()
          toggleSidebar()
        }
      }

      document.addEventListener("keydown", handleKeyDown)
      return () => document.removeEventListener("keydown", handleKeyDown)
    }, [toggleSidebar])

    const contextValue: SidebarContextValue = {
      id,
      open,
      setOpen,
      fullsize,
      setFullsize,
      width,
      setWidth,
      isResizing,
      setIsResizing,
      toggleSidebar,
      mode,
      side,
      variant,
      appearance,
      resizable,
      minWidth,
      maxWidth,
    }

    return (
      <SidebarContext.Provider value={contextValue}>
        <div ref={ref} {...props}>
          {children}
        </div>
      </SidebarContext.Provider>
    )
  }
)

SidebarProvider.displayName = "SidebarProvider"

export interface SidebarProps extends React.ComponentProps<"div"> {
  /** Unique identifier. Auto-generated if not provided. */
  id?: string
  /** Sidebar mode. @default "push" */
  mode?: SidebarMode
  /** Which side the sidebar appears on. @default "left" */
  side?: SidebarSide
  /** Visual style variant. @default "plain" */
  variant?: SidebarStyle
  /** Visual prominence. @default "default" */
  appearance?: SidebarAppearance
  /** Whether sidebar can be resized. @default false */
  resizable?: boolean
  /** Breakpoint for responsive behavior. @default "md" */
  breakpoint?: SidebarBreakpoint
  /** Whether the sidebar is open. @default false */
  open?: boolean
  /** Whether the sidebar is fullsize. @default false */
  fullsize?: boolean
  /** Callback when sidebar is resized. */
  onSidebarResize?: (width: number) => void
  /** Default width in pixels. @default 320 */
  defaultWidth?: number
  /** Minimum width in pixels. @default 200 */
  minWidth?: number
  /** Maximum width in pixels. @default 600 */
  maxWidth?: number
}

/**
 * A flexible sidebar component that can be used standalone or with SidebarProvider.
 */
export const Sidebar = forwardRef<HTMLDivElement, SidebarProps>(
  (
    {
      id: idProp,
      mode: modeProp,
      side: sideProp,
      variant: variantProp,
      appearance: appearanceProp,
      resizable: resizableProp,
      breakpoint = "md",
      open: openProp,
      fullsize: fullsizeProp,
      onSidebarResize,
      defaultWidth = 320,
      minWidth: minWidthProp = 200,
      maxWidth: maxWidthProp = 600,
      className,
      children,
      style,
      ...props
    },
    ref
  ) => {
    const context = useSidebarOptional()
    const generatedId = useId()

    const id = context?.id ?? idProp ?? `sidebar-${generatedId}`
    const mode = context?.mode ?? modeProp ?? "push"
    const side = context?.side ?? sideProp ?? "left"
    const variant = context?.variant ?? variantProp ?? "plain"
    const appearance = context?.appearance ?? appearanceProp ?? "default"
    const resizable = context?.resizable ?? resizableProp ?? false
    const minWidth = context?.minWidth ?? minWidthProp
    const maxWidth = context?.maxWidth ?? maxWidthProp

    // State (from context or local)
    const [localOpen, setLocalOpen] = useState(openProp ?? false)
    const [localFullsize, setLocalFullsize] = useState(fullsizeProp ?? false)

    const open = context?.open ?? localOpen
    const fullsize = context?.fullsize ?? localFullsize

    // Sync controlled props when not using context
    useEffect(() => {
      if (!context && openProp !== undefined) setLocalOpen(openProp)
    }, [openProp, context])

    useEffect(() => {
      if (!context && fullsizeProp !== undefined) setLocalFullsize(fullsizeProp)
    }, [fullsizeProp, context])

    // Resize handling
    const {
      elementRef: resizeRef,
      isResizing: localIsResizing,
      width: localWidth,
      handleResizeStart,
    } = useResizable({
      side,
      minWidth,
      maxWidth,
      initialWidth: context?.width ?? defaultWidth,
      enabled: resizable,
      onResize: onSidebarResize,
      onResizeEnd: context?.setWidth,
    })

    const isResizing = context?.isResizing ?? localIsResizing
    const width = context?.width ?? localWidth

    useEffect(() => {
      context?.setIsResizing(localIsResizing)
    }, [localIsResizing, context])

    const mergedRef = useMergeRefs([ref, resizeRef])

    const sidebarStyle: React.CSSProperties = {
      ...style,
      ...(resizable && { width: `${width}px` }),
    }

    return (
      <div
        ref={mergedRef}
        id={id}
        className={cn("tiptap-sidebar", className)}
        data-mode={mode}
        data-side={side}
        data-style={variant}
        data-appearance={appearance}
        data-open={open}
        data-fullsize={fullsize}
        data-resizable={resizable}
        data-breakpoint={breakpoint}
        data-resizing={isResizing}
        style={sidebarStyle}
        {...props}
      >
        {children}
        {resizable && open && (
          <div
            className="tiptap-sidebar-resize-handle"
            onMouseDown={handleResizeStart}
            data-resizing={isResizing}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            tabIndex={0}
          />
        )}
      </div>
    )
  }
)

Sidebar.displayName = "Sidebar"

export const SidebarHeader = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("tiptap-sidebar-header", className)}
    {...props}
  />
))
SidebarHeader.displayName = "SidebarHeader"

export const SidebarContent = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("tiptap-sidebar-content", className)}
    {...props}
  />
))
SidebarContent.displayName = "SidebarContent"

export const SidebarFooter = forwardRef<
  HTMLDivElement,
  React.ComponentProps<"div">
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("tiptap-sidebar-footer", className)}
    {...props}
  />
))
SidebarFooter.displayName = "SidebarFooter"
export interface SidebarTriggerProps extends React.ComponentProps<
  typeof Button
> {
  onToggle?: () => void
}

export const SidebarTrigger = forwardRef<
  HTMLButtonElement,
  SidebarTriggerProps
>(({ className, children, onClick, onToggle, ...props }, ref) => {
  const context = useSidebar()

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    onClick?.(e)
    onToggle?.()
    context.toggleSidebar()
  }

  return (
    <Button
      ref={ref}
      className={className}
      onClick={handleClick}
      aria-expanded={context.open}
      aria-controls={context.id}
      {...props}
    >
      {children}
    </Button>
  )
})

SidebarTrigger.displayName = "SidebarTrigger"

export const SidebarInset = forwardRef<
  HTMLElement,
  React.ComponentProps<"main">
>(({ className, ...props }, ref) => (
  <main ref={ref} className={cn("tiptap-main-content", className)} {...props} />
))

SidebarInset.displayName = "SidebarInset"

export interface SidebarBackdropProps extends React.ComponentProps<"div"> {
  /** Whether the backdrop is visible. */
  visible?: boolean
  /** Called when backdrop is clicked. */
  onClose?: () => void
}

export const SidebarBackdrop = forwardRef<HTMLDivElement, SidebarBackdropProps>(
  ({ className, visible, onClose, onClick, ...props }, ref) => {
    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
      onClick?.(e)
      onClose?.()
    }

    return (
      <div
        ref={ref}
        className={cn("tiptap-sidebar-backdrop", className)}
        data-visible={visible}
        onClick={handleClick}
        aria-hidden="true"
        {...props}
      />
    )
  }
)

SidebarBackdrop.displayName = "SidebarBackdrop"
