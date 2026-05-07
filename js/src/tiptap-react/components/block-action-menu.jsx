import React, { useMemo } from "react";

import {
  blockActionTargetLabel,
  blockHandleActionsLabel,
} from "../../tiptap-i18n.js";
import {
  blockActionSubmenuGroups,
  commandSubmenuId,
  groupBlockActionCommands,
} from "../commands/block-action-menu-model.js";
import { usePointerActivation } from "../hooks/use-pointer-activation.js";
import { CommandIconFrame, CommandRow, CommandText } from "./primitives.jsx";

function MenuIcon({ icon }) {
  return (
    <CommandIconFrame
      className="mn-tiptap-block-action-menu-icon"
      icon={icon ?? "block"}
    />
  );
}

function CommandCopy({ command }) {
  return (
    <CommandText
      className="mn-tiptap-block-action-menu-copy"
      titleClassName="mn-tiptap-block-action-menu-title"
      descriptionClassName="mn-tiptap-block-action-menu-description"
      title={command.title}
      description={command.description}
    />
  );
}

function BlockActionCommandItem({
  command,
  ownerId,
  selected,
  activate,
  run,
}) {
  const activation = usePointerActivation(() => run(command.id));

  return (
    <CommandRow
      ownerId={ownerId}
      index={command.index}
      selected={selected}
      className="mn-tiptap-block-action-menu-item"
      role="menuitem"
      tabIndex={selected ? 0 : -1}
      data={{
        "command-id": command.id,
        "command-index": command.index,
        submenu: "",
        tone: command.tone,
      }}
      onPointerMove={() => activate(command.index, { scroll: false })}
      onFocus={() => activate(command.index, { scroll: true })}
      activation={activation}
    >
      <MenuIcon icon={command.icon} />
      <CommandCopy command={command} />
      <span className="mn-tiptap-block-action-menu-shortcut" hidden={!command.shortcut}>
        {command.shortcut ?? ""}
      </span>
    </CommandRow>
  );
}

function SubmenuTrigger({
  group,
  ownerId,
  selectedIndex,
  activate,
}) {
  const selected = group.trigger.index === selectedIndex;

  return (
    <CommandRow
      ownerId={ownerId}
      index={group.trigger.index}
      selected={selected}
      className="mn-tiptap-block-action-menu-item mn-tiptap-block-action-submenu-trigger"
      role="menuitem"
      tabIndex={selected ? 0 : -1}
      data={{
        "command-id": group.trigger.id,
        "command-index": group.trigger.index,
        "submenu-trigger": group.id,
      }}
      onPointerMove={() => activate(group.trigger.index, { scroll: false })}
      onFocus={() => activate(group.trigger.index, { scroll: true })}
    >
      <MenuIcon icon={group.id === "code-language" ? "code-language" : "turn-into"} />
      <CommandCopy command={{ title: group.name, description: group.description }} />
      <span className="mn-tiptap-block-action-submenu-arrow" aria-hidden="true" />
    </CommandRow>
  );
}

function SubmenuPanelItem({
  command,
  commandIndex,
  groupId,
  ownerId,
  selected,
  activate,
  run,
}) {
  const activation = usePointerActivation(() => run(command.id));

  return (
    <CommandRow
      ownerId={ownerId}
      index={commandIndex}
      selected={selected}
      className="mn-tiptap-block-action-submenu-item"
      role="menuitem"
      tabIndex={selected ? 0 : -1}
      data={{
        "command-id": command.id,
        "command-index": commandIndex,
        submenu: groupId,
        active: command.active ? "true" : "false",
      }}
      onPointerMove={() => {
        if (commandIndex >= 0) {
          activate(commandIndex, { scroll: false });
        }
      }}
      onFocus={() => {
        if (commandIndex >= 0) {
          activate(commandIndex, { scroll: true });
        }
      }}
      activation={activation}
    >
      <MenuIcon icon={command.icon} />
      <CommandCopy command={command} />
    </CommandRow>
  );
}

function BlockActionSubmenu({
  group,
  commands,
  ownerId,
  selectedIndex,
  activate,
  run,
}) {
  const activeSubmenu = commandSubmenuId(commands[selectedIndex]);
  const active = activeSubmenu === group.id;

  return (
    <section
      className="mn-tiptap-block-action-submenu"
      role="group"
      data-submenu={group.id}
      data-active={active ? "true" : "false"}
    >
      <div className="mn-tiptap-block-action-submenu-panel">
        {group.commands.map((command) => {
          const commandIndex = Number.isInteger(command.index)
            ? command.index
            : commands.findIndex(
                (candidate) =>
                  candidate.submenu === group.id && candidate.id === command.id,
              );
          return (
            <SubmenuPanelItem
              key={command.id}
              command={command}
              commandIndex={commandIndex}
              groupId={group.id}
              ownerId={ownerId}
              selected={commandIndex === selectedIndex}
              activate={activate}
              run={run}
            />
          );
        })}
      </div>
    </section>
  );
}

export function PapyroBlockActionMenu({
  ownerId,
  state,
  language = "english",
}) {
  const commands = state?.commands ?? [];
  const selectedIndex = state?.selectedIndex ?? 0;
  const groups = useMemo(() => groupBlockActionCommands(commands), [commands]);
  const submenus = useMemo(() => blockActionSubmenuGroups(commands), [commands]);
  const actionGroupIndex = groups.findIndex((group) => group.key === "Actions");
  const activeSubmenu = commandSubmenuId(commands[selectedIndex]);
  const targetKind = state?.target?.kind ?? "block";

  return (
    <>
      <div className="mn-tiptap-block-action-menu-header">
        <div className="mn-tiptap-block-action-menu-eyebrow">
          {blockHandleActionsLabel(language)}
        </div>
        <div className="mn-tiptap-block-action-menu-heading">
          {blockActionTargetLabel(language, targetKind)}
        </div>
      </div>
      <div className="mn-tiptap-block-action-menu-body">
        <div className="mn-tiptap-block-action-menu-list">
          {groups.map((group, groupIndex) => (
            <section
              key={group.key}
              className="mn-tiptap-block-action-menu-section"
              role="group"
              aria-label={group.name}
              data-group={group.key}
              data-layout={group.layout}
              data-tone={group.tone}
            >
              <div className="mn-tiptap-block-action-menu-section-title">
                {group.name}
              </div>
              {group.commands.map((command) => (
                <BlockActionCommandItem
                  key={command.id}
                  command={command}
                  ownerId={ownerId}
                  selected={command.index === selectedIndex}
                  activate={state.activate}
                  run={state.run}
                />
              ))}
              {groupIndex === actionGroupIndex
                ? submenus.map((submenu) => (
                    <SubmenuTrigger
                      key={submenu.id}
                      group={submenu}
                      ownerId={ownerId}
                      selectedIndex={selectedIndex}
                      activate={state.activate}
                    />
                  ))
                : null}
            </section>
          ))}
        </div>
        <div className="mn-tiptap-block-action-submenus">
          {submenus.map((submenu) => (
            <BlockActionSubmenu
              key={submenu.id}
              group={submenu}
              commands={commands}
              ownerId={ownerId}
              selectedIndex={selectedIndex}
              activate={state.activate}
              run={state.run}
            />
          ))}
        </div>
        <div
          className={`mn-tiptap-block-action-submenu-hint${submenus.length === 0 ? " hidden" : ""}`}
        >
          {submenus.find((submenu) => submenu.id === activeSubmenu)?.description ??
            submenus[0]?.description ??
            ""}
        </div>
      </div>
    </>
  );
}
