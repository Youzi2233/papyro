"use client"

import { useEffect, useState } from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"
import { cn } from "@/lib/tiptap-utils"
import "@/components/tiptap-ui-primitive/popover/popover.scss"

function useDeferredFloatingVisibility() {
  const [isPositioned, setIsPositioned] = useState(false)

  useEffect(() => {
    const requestFrame =
      globalThis.requestAnimationFrame ??
      ((callback: FrameRequestCallback) =>
        globalThis.setTimeout(() => callback(performance.now()), 16))
    const cancelFrame =
      globalThis.cancelAnimationFrame ??
      ((handle: number) => globalThis.clearTimeout(handle))

    const frame = requestFrame(() => {
      setIsPositioned(true)
    })

    return () => cancelFrame(frame)
  }, [])

  return isPositioned
}

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger {...props} />
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  style,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content>) {
  const isPositioned = useDeferredFloatingVisibility()

  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        data-positioned={isPositioned ? "true" : "false"}
        style={{
          ...style,
          visibility: isPositioned ? style?.visibility : "hidden",
        }}
        className={cn("tiptap-popover", className)}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
