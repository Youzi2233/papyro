"use client";
import { useCallback, useEffect, useMemo } from "react"
import * as Ariakit from "@ariakit/react"

export function useComboboxValueState() {
  const store = Ariakit.useComboboxContext()
  const searchValue = Ariakit.useStoreState(store, "value") ?? ""

  if (!store) {
    throw new Error("useComboboxValueState must be used within ComboboxProvider")
  }

  return [searchValue, store.setValue];
}

export function useMenuPlacement() {
  const store = Ariakit.useMenuStore()
  const currentPlacement = Ariakit.useStoreState(store, (state) => state.currentPlacement?.split("-")[0] || "bottom")
  return currentPlacement
}

export function useContextMenu(anchorRect) {
  const menu = Ariakit.useMenuStore()

  useEffect(() => {
    if (anchorRect) {
      menu.render()
    }
  }, [anchorRect, menu])

  const getAnchorRect = useCallback(() => anchorRect, [anchorRect])

  const show = useCallback(() => {
    menu.show()
    menu.setAutoFocusOnShow(true)
  }, [menu])

  return useMemo(() => ({
    store: menu,
    getAnchorRect,
    show,
  }), [menu, getAnchorRect, show]);
}

export function useFloatingMenuStore() {
  const menu = Ariakit.useMenuStore()

  const show = useCallback((anchorElement) => {
    menu.setAnchorElement(anchorElement)
    menu.show()
    menu.setAutoFocusOnShow(true)
  }, [menu])

  return useMemo(() => ({
    store: menu,
    show,
  }), [menu, show]);
}

export function useMenuItemClick(
  menu,
  preventClose
) {
  return useCallback((event) => {
    const expandable = event.currentTarget.hasAttribute("aria-expanded")

    if (expandable || preventClose) {
      return false
    }

    menu?.hideAll()
    return false
  }, [menu, preventClose]);
}
