import React, { useMemo } from "react";

import {
  tableContextEyebrowLabel,
  tableContextSubtitleLabel,
  tableContextTitleLabel,
  tableCommandLayoutGroupDescription,
  tableCommandLayoutGroupLabel,
  tableCommandMenuSectionLabel,
  tableToolsLabel,
} from "../../tiptap-i18n.js";
import {
  createTableCommandMenuModel,
  TABLE_STYLE_LAYOUT_GROUPS,
  tableCommandVariant,
} from "../../tiptap-table-commands.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandIconFrame, CommandRow, CommandText } from "./primitives.jsx";
import { TableCommandIcon } from "./table-command-icons.jsx";

const TABLE_STYLE_LAYOUT_GROUP_SET = new Set(TABLE_STYLE_LAYOUT_GROUPS);

function TableCommandVisual({ command }) {
  const icon = command.icon ?? command.id;
  const variant = command.variant ?? tableCommandVariant(command);
  return (
    <CommandIconFrame
      className="mn-tiptap-table-toolbar-button-visual"
      icon=""
      dataIcon={icon}
      data={{
        "icon-source": "lucide",
        variant,
        tone: command.tone ?? "default",
      }}
    >
      <TableCommandIcon icon={icon} />
    </CommandIconFrame>
  );
}

function tableCommandAccessibleLabel(command) {
  const description = command.description?.trim?.() ?? "";
  return description ? `${command.title}. ${description}` : command.title;
}

function TableCommandButton({
  command,
  commandIndex,
  mode,
  ownerId,
  selected,
  setActiveCommand,
  run,
}) {
  const variant = command.variant ?? tableCommandVariant(command);
  const activation = usePointerActivation(() => {
    if (command.disabled) return false;
    return run(command.id);
  });
  const showVisual =
    variant === "icon" ||
    variant === "swatch" ||
    variant === "text-swatch" ||
    mode === "context";
  const showTextLabel =
    mode === "context" &&
    variant !== "icon" &&
    variant !== "swatch" &&
    variant !== "text-swatch";

  return (
    <CommandRow
      ownerId={ownerId}
      index={commandIndex}
      selected={selected}
      activeClassName=""
      className="mn-tiptap-table-toolbar-button"
      role={mode === "context" ? "menuitem" : "button"}
      tabIndex={selected ? 0 : -1}
      title={command.title}
      disabled={!!command.disabled}
      aria={{
        "aria-label": tableCommandAccessibleLabel(command),
        "aria-disabled": command.disabled ? "true" : "false",
      }}
      data={{
        "command-id": command.id,
        "command-index": commandIndex,
        group: command.group,
        icon: command.icon ?? command.id,
        variant,
        tone: command.tone ?? "default",
        active: command.active ? "true" : "false",
        "keyboard-active": selected ? "true" : "false",
        disabled: command.disabled ? "true" : "false",
      }}
      onPointerMove={() => setActiveCommand(command.id, { keyboardActive: false })}
      onFocus={() => setActiveCommand(command.id, { keyboardActive: true })}
      activation={activation}
    >
      {showVisual ? <TableCommandVisual command={command} /> : null}
      {showTextLabel ? (
        <CommandText
          className="mn-tiptap-table-toolbar-button-copy"
          titleClassName="mn-tiptap-table-toolbar-button-label"
          descriptionClassName="mn-tiptap-table-toolbar-button-description"
          title={command.title}
          description={command.description}
        />
      ) : null}
      {!showVisual && !showTextLabel ? command.label : null}
    </CommandRow>
  );
}

function TableCommandSubmenuTrigger({
  group,
  language,
}) {
  const label = tableCommandLayoutGroupLabel(language, group.layoutGroup);
  const description = tableCommandLayoutGroupDescription(language, group.layoutGroup);
  const firstCommand = group.commands.find((command) => !command.disabled) ?? group.commands[0];
  const icon = firstCommand?.icon ?? group.commands[0]?.icon ?? group.layoutGroup;

  return (
    <div
      className="mn-tiptap-table-toolbar-submenu-trigger"
      role="menuitem"
      tabIndex={0}
      aria-haspopup="menu"
      aria-expanded="false"
      data-layout-group={group.layoutGroup}
    >
      <TableCommandVisual command={{ ...firstCommand, icon }} />
      <CommandText
        className="mn-tiptap-table-toolbar-button-copy"
        titleClassName="mn-tiptap-table-toolbar-button-label"
        descriptionClassName="mn-tiptap-table-toolbar-button-description"
        title={label}
        description={description}
      />
      <span
        className="mn-tiptap-table-toolbar-submenu-chevron"
        aria-hidden="true"
      />
    </div>
  );
}

function TableCommandSubmenuGroup({
  group,
  mode,
  ownerId,
  state,
  language,
}) {
  return (
    <div
      key={group.groupKey}
      className="mn-tiptap-table-toolbar-group mn-tiptap-table-toolbar-submenu-group"
      data-group-key={group.groupKey}
      data-group={group.group}
      data-layout-group={group.layoutGroup}
      data-menu-section={group.menuSection}
    >
      <TableCommandSubmenuTrigger group={group} language={language} />
      <div
        className="mn-tiptap-table-toolbar-submenu-panel"
        role="menu"
        aria-label={tableCommandLayoutGroupLabel(language, group.layoutGroup)}
        data-layout-group={group.layoutGroup}
      >
        {group.commands.map((command) => (
          <TableCommandButton
            key={command.id}
            command={command}
            commandIndex={command.index}
            mode={mode}
            ownerId={ownerId}
            selected={command.id === state?.activeCommandId}
            setActiveCommand={state?.setActiveCommand}
            run={state?.run}
          />
        ))}
      </div>
    </div>
  );
}

function TableCommandGroup({
  group,
  mode,
  ownerId,
  state,
  language,
}) {
  if (
    mode === "context" &&
    group.menuSection === "style" &&
    TABLE_STYLE_LAYOUT_GROUP_SET.has(group.layoutGroup)
  ) {
    return (
      <TableCommandSubmenuGroup
        group={group}
        mode={mode}
        ownerId={ownerId}
        state={state}
        language={language}
      />
    );
  }

  return (
    <div
      key={group.groupKey}
      className="mn-tiptap-table-toolbar-group"
      data-group-key={group.groupKey}
      data-group={group.group}
      data-layout-group={group.layoutGroup}
      data-menu-section={group.menuSection}
    >
      {group.showLabel ? (
        <div className="mn-tiptap-table-toolbar-group-label">
          {group.group}
        </div>
      ) : null}
      {group.commands.map((command) => (
        <TableCommandButton
          key={command.id}
          command={command}
          commandIndex={command.index}
          mode={mode}
          ownerId={ownerId}
          selected={command.id === state?.activeCommandId}
          setActiveCommand={state?.setActiveCommand}
          run={state?.run}
        />
      ))}
    </div>
  );
}

export function PapyroTableContextMenu({
  ownerId,
  state,
  commands = [],
  language = "english",
}) {
  const mode = state?.mode === "keyboard" ? "keyboard" : "context";
  const selectionKind = state?.selection?.kind ?? "cell";
  const model = useMemo(
    () =>
      createTableCommandMenuModel(commands, {
        mode,
        selectionKind,
        activeCommandId: state?.activeCommandId,
        sectionLabel: (section) => tableCommandMenuSectionLabel(language, section),
      }),
    [commands, mode, selectionKind, state?.activeCommandId, language],
  );

  return (
    <>
      <div className="mn-tiptap-table-toolbar-header">
        <div className="mn-tiptap-table-toolbar-eyebrow">
          {tableContextEyebrowLabel(language)}
        </div>
        <div className="mn-tiptap-table-toolbar-title">
          {mode === "context"
            ? tableContextTitleLabel(language, selectionKind)
            : tableToolsLabel(language)}
        </div>
        <div className="mn-tiptap-table-toolbar-subtitle">
          {mode === "context"
            ? tableContextSubtitleLabel(language, state?.selection)
            : ""}
        </div>
      </div>
      <div className="mn-tiptap-table-toolbar-list">
        {model.groups.map((group) => (
          <TableCommandGroup
            key={group.groupKey}
            group={group}
            mode={mode}
            ownerId={ownerId}
            state={state}
            language={language}
          />
        ))}
      </div>
    </>
  );
}
