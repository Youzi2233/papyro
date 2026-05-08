import React from "react";

import { blockActionSubmenuLabel } from "../../tiptap-i18n.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { ToolbarButton } from "./primitives.jsx";

const FORMAT_TOOLBAR_OWNER_ID = "mn-tiptap-format-toolbar";
const FORMAT_TOOLBAR_SUBMENU_OWNER_ID = "mn-tiptap-format-toolbar-submenu";

function FormatToolbarButton({
  command,
  commandIndex,
  ownerId = FORMAT_TOOLBAR_OWNER_ID,
  submenuOwnerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
  activeCommandId,
  submenuOpen,
  run,
  setActiveCommand,
}) {
  const activation = usePointerActivation(() => run(command.id));
  const keyboardActive = activeCommandId === command.id;
  const hasSubmenu = command.id === "turn-into" && command.children?.length > 0;
  const submenuExpanded = hasSubmenu && submenuOpen === command.id;

  return (
    <ToolbarButton
      ownerId={ownerId}
      index={commandIndex}
      className="mn-tiptap-format-toolbar-button"
      title={command.title}
      ariaLabel={command.ariaLabel}
      active={command.active}
      pressed={command.active}
      commandId={command.id}
      commandIndex={commandIndex}
      data={{
        priority: command.priority ?? 100,
        "keyboard-active": keyboardActive ? "true" : "false",
        "submenu-open": submenuExpanded ? "true" : "false",
      }}
      aria={{
        "aria-controls": submenuExpanded ? submenuOwnerId : undefined,
        "aria-haspopup": hasSubmenu ? "menu" : undefined,
        "aria-expanded": hasSubmenu ? String(submenuExpanded) : undefined,
      }}
      tabIndex={keyboardActive ? 0 : -1}
      onPointerEnter={() => setActiveCommand?.(command.id, { keyboardActive: false })}
      onFocus={() => setActiveCommand?.(command.id, { keyboardActive: true })}
      activation={activation}
    >
      <span
        className={`mn-tiptap-format-toolbar-icon ${command.icon}`}
        aria-hidden="true"
      />
      <span className="mn-tiptap-format-toolbar-label">
        {command.label}
      </span>
    </ToolbarButton>
  );
}

function FormatToolbarSubmenuItem({
  command,
  commandIndex,
  ownerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
  activeChildCommandId,
  run,
  setActiveChildCommand,
}) {
  const activation = usePointerActivation(() => run(command.id));
  const keyboardActive = activeChildCommandId === command.id;

  return (
    <ToolbarButton
      ownerId={ownerId}
      index={commandIndex}
      className="mn-tiptap-format-toolbar-submenu-item"
      title={command.title}
      ariaLabel={command.ariaLabel}
      role="menuitem"
      active={command.active}
      commandId={command.id}
      commandIndex={undefined}
      data={{
        "submenu-command-index": commandIndex,
        active: command.active ? "true" : "false",
        "keyboard-active": keyboardActive ? "true" : "false",
        "parent-command-id": "turn-into",
      }}
      tabIndex={keyboardActive ? 0 : -1}
      onPointerEnter={() => setActiveChildCommand?.(command.id, { keyboardActive: false })}
      onFocus={() => setActiveChildCommand?.(command.id, { keyboardActive: true })}
      activation={activation}
    >
      <span
        className={`mn-tiptap-format-toolbar-submenu-icon ${command.icon}`}
        aria-hidden="true"
      />
      <span className="mn-tiptap-format-toolbar-submenu-label">
        {command.title}
      </span>
    </ToolbarButton>
  );
}

export function PapyroFormatToolbar({
  state,
  ownerId = FORMAT_TOOLBAR_OWNER_ID,
  submenuOwnerId = FORMAT_TOOLBAR_SUBMENU_OWNER_ID,
}) {
  const commands = state?.commands ?? [];
  const submenuCommand = commands.find((command) => command.id === state?.submenuOpen);
  const submenuLabel =
    submenuCommand?.title ?? blockActionSubmenuLabel(state?.language, "turn-into");

  return (
    <div className="mn-tiptap-format-toolbar-shell">
      <div className="mn-tiptap-format-toolbar-list">
        {commands.map((command, commandIndex) => (
          <FormatToolbarButton
            key={command.id}
            command={command}
            commandIndex={commandIndex}
            ownerId={ownerId}
            submenuOwnerId={submenuOwnerId}
            activeCommandId={state.activeCommandId}
            submenuOpen={state.submenuOpen}
            run={state.run}
            setActiveCommand={state.setActiveCommand}
          />
        ))}
      </div>
      <div
        id={submenuOwnerId}
        className={`mn-tiptap-format-toolbar-submenu${submenuCommand?.children?.length ? "" : " hidden"}`}
        role="menu"
        aria-label={submenuLabel}
        data-parent-command-id={submenuCommand?.id ?? ""}
      >
        {submenuCommand?.children?.map((command, commandIndex) => (
          <FormatToolbarSubmenuItem
            key={command.id}
            command={command}
            commandIndex={commandIndex}
            ownerId={submenuOwnerId}
            activeChildCommandId={state.activeChildCommandId}
            run={state.run}
            setActiveChildCommand={state.setActiveChildCommand}
          />
        ))}
      </div>
    </div>
  );
}
