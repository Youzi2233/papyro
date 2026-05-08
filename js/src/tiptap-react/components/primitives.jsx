import React from "react";

import { commandElementId } from "../../tiptap-ui-primitives.js";

export function CommandIconFrame({
  className,
  icon,
  children,
  dataIcon = icon,
  data = {},
}) {
  const dataProps = Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [`data-${key}`, String(value)]),
  );

  return (
    <span
      className={`${className} ${icon ?? "block"}`}
      aria-hidden="true"
      data-icon={dataIcon ?? icon ?? "block"}
      {...dataProps}
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
  className,
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
  const classNames = `${className}${selected ? ` ${activeClassName}` : ""}`;
  const dataProps = Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [`data-${key}`, String(value)]),
  );
  const ariaProps = Object.fromEntries(
    Object.entries(aria).filter(([, value]) => value !== undefined),
  );

  return (
    <Component
      type={Component === "button" ? "button" : undefined}
      id={ownerId && Number.isInteger(index) ? commandElementId(ownerId, index) : undefined}
      className={classNames}
      title={title}
      disabled={Component === "button" ? disabled : undefined}
      role={role}
      tabIndex={tabIndex}
      onPointerMove={onPointerMove}
      onFocus={onFocus}
      {...dataProps}
      {...ariaProps}
      {...activation}
    >
      {children}
    </Component>
  );
}
