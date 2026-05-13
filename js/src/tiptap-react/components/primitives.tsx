import React from "react";

import { commandElementId } from "../../tiptap-ui-primitives.ts";

type AttributeValue = string | number | boolean | null | undefined;
type AttributeMap = Record<string, AttributeValue>;
type ActivationHandlers = React.DOMAttributes<HTMLElement> & Record<string, unknown>;
type PolymorphicComponent = React.ElementType;
type CommandLike = {
  index?: number;
  title?: string;
  description?: string;
  disabled?: boolean;
};

function dataAttributes(data: AttributeMap = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [`data-${key}`, String(value)]),
  );
}

function ariaAttributes(aria: AttributeMap = {}) {
  return Object.fromEntries(
    Object.entries(aria).filter(([, value]) => value !== undefined),
  );
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function CommandIconFrame({
  className = "",
  icon,
  children,
  dataIcon = icon,
  data = {},
}: {
  className?: string;
  icon?: string | null;
  children?: React.ReactNode;
  dataIcon?: string | null;
  data?: AttributeMap;
}) {
  return (
    <span
      className={classNames(className, icon ?? "block")}
      aria-hidden="true"
      data-icon={dataIcon ?? icon ?? "block"}
      {...dataAttributes(data)}
    >
      {children}
    </span>
  );
}

export function CommandText({
  className,
  titleClassName,
  descriptionClassName,
  title,
  description = "",
}: {
  className?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
}) {
  return (
    <span className={className}>
      <span className={titleClassName}>{title}</span>
      <span className={descriptionClassName}>{description}</span>
    </span>
  );
}

export function CommandRow({
  as: Component = "button",
  ownerId,
  index,
  selected = false,
  className = "",
  activeClassName = "active",
  title,
  disabled = false,
  role,
  tabIndex = selected ? 0 : -1,
  data = {},
  aria = {},
  onPointerMove,
  onFocus,
  activation = {},
  children,
}: {
  as?: PolymorphicComponent;
  ownerId?: string;
  index?: number;
  selected?: boolean;
  className?: string;
  activeClassName?: string;
  title?: string;
  disabled?: boolean;
  role?: React.AriaRole;
  tabIndex?: number;
  data?: AttributeMap;
  aria?: AttributeMap;
  onPointerMove?: React.PointerEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  activation?: ActivationHandlers;
  children?: React.ReactNode;
}) {
  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      id={ownerId && Number.isInteger(index) ? commandElementId(ownerId, index) : undefined}
      className={classNames(className, selected ? activeClassName : "")}
      title={title}
      disabled={Component === "button" ? disabled : undefined}
      role={role}
      tabIndex={tabIndex}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      {...dataAttributes(data)}
      {...ariaAttributes(aria)}
      {...activation}
    >
      {children}
    </Component>
  );
}

export function VisuallyHidden({
  as: Component = "span",
  className = "",
  children,
}: {
  as?: PolymorphicComponent;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <Component className={classNames("mn-tiptap-visually-hidden", className)}>
      {children}
    </Component>
  );
}

export function Kbd({
  className = "",
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <kbd className={classNames("mn-tiptap-kbd", className)}>
      {children}
    </kbd>
  );
}

export function EditorPopover({
  as: Component = "div",
  id,
  className = "",
  role = "dialog",
  label,
  labelledBy,
  hidden = false,
  tabIndex,
  data = {},
  aria = {},
  onKeyDown,
  children,
}: {
  as?: PolymorphicComponent;
  id?: string;
  className?: string;
  role?: React.AriaRole;
  label?: string;
  labelledBy?: string;
  hidden?: boolean;
  tabIndex?: number;
  data?: AttributeMap;
  aria?: AttributeMap;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  children?: React.ReactNode;
}) {
  return (
    <Component
      id={id}
      className={classNames("mn-tiptap-editor-popover", className)}
      role={role}
      hidden={hidden}
      tabIndex={tabIndex}
      aria-label={label}
      aria-labelledby={labelledBy}
      onKeyDown={onKeyDown}
      {...ariaAttributes(aria)}
      {...dataAttributes(data)}
    >
      {children}
    </Component>
  );
}

export function CommandMenu({
  as: Component = "div",
  id,
  className = "",
  role = "menu",
  label,
  labelledBy,
  activeDescendant,
  data = {},
  aria = {},
  onKeyDown,
  children,
}: {
  as?: PolymorphicComponent;
  id?: string;
  className?: string;
  role?: React.AriaRole;
  label?: string;
  labelledBy?: string;
  activeDescendant?: string;
  data?: AttributeMap;
  aria?: AttributeMap;
  onKeyDown?: React.KeyboardEventHandler<HTMLElement>;
  children?: React.ReactNode;
}) {
  return (
    <Component
      id={id}
      className={classNames("mn-tiptap-command-menu", className)}
      role={role}
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-activedescendant={activeDescendant}
      onKeyDown={onKeyDown}
      {...ariaAttributes(aria)}
      {...dataAttributes(data)}
    >
      {children}
    </Component>
  );
}

export function CommandSection({
  as: Component = "section",
  className = "",
  titleClassName = "",
  title,
  label = title,
  role = "group",
  data = {},
  children,
}: {
  as?: PolymorphicComponent;
  className?: string;
  titleClassName?: string;
  title?: React.ReactNode;
  label?: string;
  role?: React.AriaRole;
  data?: AttributeMap;
  children?: React.ReactNode;
}) {
  return (
    <Component
      className={classNames("mn-tiptap-command-section", className)}
      role={role}
      aria-label={label}
      {...dataAttributes(data)}
    >
      {title ? (
        <div className={classNames("mn-tiptap-command-section-title", titleClassName)}>
          {title}
        </div>
      ) : null}
      {children}
    </Component>
  );
}

export function CommandItem({
  command,
  ownerId,
  index = command?.index,
  selected = false,
  className = "",
  activeClassName = "active",
  role = "menuitem",
  title = command?.title,
  description = command?.description,
  disabled = !!command?.disabled,
  tabIndex = selected ? 0 : -1,
  icon,
  accessory,
  textClassName,
  titleClassName,
  descriptionClassName,
  data = {},
  aria = {},
  onPointerMove,
  onFocus,
  activation = {},
  children,
}: {
  command?: CommandLike;
  ownerId?: string;
  index?: number;
  selected?: boolean;
  className?: string;
  activeClassName?: string;
  role?: React.AriaRole;
  title?: string;
  description?: React.ReactNode;
  disabled?: boolean;
  tabIndex?: number;
  icon?: React.ReactNode;
  accessory?: React.ReactNode;
  textClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
  data?: AttributeMap;
  aria?: AttributeMap;
  onPointerMove?: React.PointerEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  activation?: ActivationHandlers;
  children?: React.ReactNode;
}) {
  return (
    <CommandRow
      ownerId={ownerId}
      index={index}
      selected={selected}
      className={className}
      activeClassName={activeClassName}
      title={title}
      disabled={disabled}
      role={role}
      tabIndex={tabIndex}
      data={data}
      aria={aria}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      activation={activation}
    >
      {children ?? (
        <>
          {icon}
          <CommandText
            className={textClassName}
            titleClassName={titleClassName}
            descriptionClassName={descriptionClassName}
            title={title}
            description={description}
          />
          {accessory}
        </>
      )}
    </CommandRow>
  );
}

export function IconButton({
  id,
  role,
  className = "",
  active = false,
  activeClassName = "active",
  title,
  label = title,
  pressed,
  disabled = false,
  tabIndex,
  iconClassName,
  data = {},
  aria = {},
  activation = {},
  onPointerEnter,
  onPointerMove,
  onFocus,
  onBlur,
  onKeyDown,
  onMouseDown,
  onContextMenu,
  children,
}: {
  id?: string;
  role?: React.AriaRole;
  className?: string;
  active?: boolean;
  activeClassName?: string;
  title?: string;
  label?: string;
  pressed?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  iconClassName?: string;
  data?: AttributeMap;
  aria?: AttributeMap;
  activation?: ActivationHandlers;
  onPointerEnter?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: React.PointerEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  onMouseDown?: React.MouseEventHandler<HTMLButtonElement>;
  onContextMenu?: React.MouseEventHandler<HTMLButtonElement>;
  children?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      className={classNames(className, active ? activeClassName : "")}
      title={title}
      role={role}
      aria-label={label}
      aria-pressed={pressed === undefined ? undefined : String(pressed)}
      disabled={disabled}
      tabIndex={tabIndex}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      {...dataAttributes(data)}
      {...ariaAttributes(aria)}
      {...activation}
    >
      {children ?? (
        <>
          {iconClassName ? (
            <span className={iconClassName} aria-hidden="true" />
          ) : null}
          {label ? <VisuallyHidden>{label}</VisuallyHidden> : null}
        </>
      )}
    </button>
  );
}

export function ToolbarButton({
  ownerId,
  index,
  role,
  commandId,
  commandIndex = index,
  className = "",
  active = false,
  activeClassName = "active",
  title,
  label,
  ariaLabel = label ?? title,
  pressed,
  disabled = false,
  tabIndex,
  data = {},
  aria = {},
  activation = {},
  onPointerEnter,
  onPointerMove,
  onFocus,
  onBlur,
  onKeyDown,
  children,
}: {
  ownerId?: string;
  index?: number;
  role?: React.AriaRole;
  commandId?: string;
  commandIndex?: number;
  className?: string;
  active?: boolean;
  activeClassName?: string;
  title?: string;
  label?: string;
  ariaLabel?: string;
  pressed?: boolean;
  disabled?: boolean;
  tabIndex?: number;
  data?: AttributeMap;
  aria?: AttributeMap;
  activation?: ActivationHandlers;
  onPointerEnter?: React.PointerEventHandler<HTMLButtonElement>;
  onPointerMove?: React.PointerEventHandler<HTMLButtonElement>;
  onFocus?: React.FocusEventHandler<HTMLButtonElement>;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  onKeyDown?: React.KeyboardEventHandler<HTMLButtonElement>;
  children?: React.ReactNode;
}) {
  return (
    <IconButton
      id={ownerId && Number.isInteger(index) ? commandElementId(ownerId, index) : undefined}
      role={role}
      className={className}
      active={active}
      activeClassName={activeClassName}
      title={title}
      label={ariaLabel}
      pressed={pressed}
      disabled={disabled}
      tabIndex={tabIndex}
      data={{
        "command-id": commandId,
        "command-index": Number.isInteger(commandIndex) ? commandIndex : undefined,
        ...data,
      }}
      aria={aria}
      activation={activation}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
    >
      {children}
    </IconButton>
  );
}
