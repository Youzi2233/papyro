import React from "react";

import { commandElementId } from "../../tiptap-ui-primitives.js";

function dataAttributes(data = {}) {
  return Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [`data-${key}`, String(value)]),
  );
}

function ariaAttributes(aria = {}) {
  return Object.fromEntries(
    Object.entries(aria).filter(([, value]) => value !== undefined),
  );
}

function classNames(...values) {
  return values.filter(Boolean).join(" ");
}

export function CommandIconFrame({
  className = "",
  icon,
  children,
  dataIcon = icon,
  data = {},
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
