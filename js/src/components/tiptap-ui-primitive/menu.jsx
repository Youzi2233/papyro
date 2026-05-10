"use client";
import * as Ariakit from "@ariakit/react"
import { useCallback, useMemo, useRef, useState } from "react"

// -- Hooks --
import { useOnClickOutside } from "@/hooks/use-on-click-outside"
import { useComposedRef } from "@/hooks/use-composed-ref"

// -- Utils --
import { cn } from "@/lib/tiptap-utils"

// -- UI Primitives --
import {
  ComboboxItem,
  ComboboxProvider,
} from "@/components/tiptap-ui-primitive/combobox"

import {
  SearchableContext,
  MenuContext,
  useSearchableContext,
  useMenuContext,
} from "@/components/tiptap-ui-primitive/menu-context"
import {
  useMenuPlacement,
  useMenuItemClick,
} from "@/components/tiptap-ui-primitive/menu-hooks"

// -- Styles --
import "@/components/tiptap-ui-primitive/menu/menu.scss"

export function MenuProvider({
  ...props
}) {
  return <Ariakit.MenuProvider {...props} />;
}

export function Menu({
  children,
  trigger,
  value,
  onOpenChange,
  onValueChange,
  onValuesChange,
  ...props
}) {
  const isRootMenu = !Ariakit.useMenuContext()
  const [open, setOpen] = useState(false)
  const searchable = !!onValuesChange || isRootMenu

  const handleOpenChange = useCallback((v) => {
    if (props.open === undefined) {
      setOpen(v)
    }
    onOpenChange?.(v)
  }, [props.open, onOpenChange])

  const menuContextValue = useMemo(() => ({
    isRootMenu,
    open: props.open ?? open,
  }), [isRootMenu, props.open, open])

  const menuProvider = (
    <Ariakit.MenuProvider
      open={open}
      setOpen={handleOpenChange}
      setValues={onValuesChange}
      showTimeout={100}
      {...props}>
      {trigger}
      <MenuContext.Provider value={menuContextValue}>
        <SearchableContext.Provider value={searchable}>
          {children}
        </SearchableContext.Provider>
      </MenuContext.Provider>
    </Ariakit.MenuProvider>
  )

  if (searchable) {
    return (
      <ComboboxProvider value={value} setValue={onValueChange}>
        {menuProvider}
      </ComboboxProvider>
    );
  }

  return menuProvider
}

export function MenuContent({
  children,
  className,
  ref,
  onClickOutside,
  ...props
}) {
  const menuRef = useRef(null)
  const { open } = useMenuContext()
  const side = useMenuPlacement()

  useOnClickOutside(menuRef, onClickOutside || (() => {}))

  return (
    <Ariakit.Menu
      ref={useComposedRef(menuRef, ref)}
      className={cn("tiptap-menu-content", className)}
      data-side={side}
      data-state={open ? "open" : "closed"}
      gutter={4}
      flip
      unmountOnHide
      {...props}>
      {children}
    </Ariakit.Menu>
  );
}

export function MenuList({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuList
      data-slot="tiptap-menu-list"
      className={cn("tiptap-menu-list", className)}
      {...props} />
  );
}

export function MenuButton({
  className,
  ...props
}) {
  return (<Ariakit.MenuButton {...props} className={cn("tiptap-menu-button", className)} />);
}

export function MenuButtonArrow({
  className,
  ...props
}) {
  return (<Ariakit.MenuButtonArrow {...props} className={cn("tiptap-menu-button-arrow", className)} />);
}

export function MenuArrow({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuArrow
      data-slot="tiptap-menu-arrow"
      className={cn("tiptap-menu-arrow", className)}
      {...props} />
  );
}

export function MenuHeading({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuHeading
      data-slot="tiptap-menu-heading"
      className={cn("tiptap-menu-heading", className)}
      {...props} />
  );
}

export function MenuDescription({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuDescription
      data-slot="tiptap-menu-description"
      className={cn("tiptap-menu-description", className)}
      {...props} />
  );
}

export function MenuDismiss({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuDismiss
      data-slot="tiptap-menu-dismiss"
      className={cn("tiptap-menu-dismiss", className)}
      {...props} />
  );
}

export function MenuGroup({
  className,
  ...props
}) {
  return (<Ariakit.MenuGroup {...props} className={cn("tiptap-menu-group", className)} />);
}

export function MenuGroupLabel({
  className,
  ...props
}) {
  return (<Ariakit.MenuGroupLabel {...props} className={cn("tiptap-menu-group-label", className)} />);
}

export function MenuSeparator({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuSeparator
      data-slot="tiptap-menu-separator"
      className={cn("tiptap-menu-separator", className)}
      {...props} />
  );
}

export function MenuItemCheck({
  className,
  ...props
}) {
  return (<Ariakit.MenuItemCheck {...props} className={cn("tiptap-menu-item-check", className)} />);
}

export function MenuItemCheckbox({
  className,
  ...props
}) {
  return (
    <Ariakit.MenuItemCheckbox
      data-slot="tiptap-menu-item-checkbox"
      className={cn("tiptap-menu-item-checkbox", className)}
      {...props} />
  );
}

export function MenuItemRadio({
  className,
  ...props
}) {
  return (<Ariakit.MenuItemRadio {...props} className={cn("tiptap-menu-item-radio", className)} />);
}

export function MenuItem({
  name,
  value,
  preventClose,
  className,
  ...props
}) {
  const menu = Ariakit.useMenuContext()
  const searchable = useSearchableContext()

  const hideOnClick = useMenuItemClick(menu, preventClose)

  const itemProps = {
    blurOnHoverEnd: false,
    focusOnHover: true,
    className: cn("tiptap-menu-item", className),
    ...props,
  }

  if (!searchable) {
    if (name && value) {
      return (<MenuItemRadio {...itemProps} hideOnClick={true} name={name} value={value} />);
    }

    return <Ariakit.MenuItem {...itemProps} />;
  }

  return <ComboboxItem {...itemProps} hideOnClick={hideOnClick} />;
}
