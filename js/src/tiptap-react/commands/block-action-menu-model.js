const COMPACT_GROUPS = new Set(["Color", "Highlight", "Callout"]);
const SUBMENU_ORDER = ["turn-into", "code-language"];

function submenuOrder(submenu) {
  const index = SUBMENU_ORDER.indexOf(submenu);
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

function groupLayout(groupName) {
  return COMPACT_GROUPS.has(groupName) ? "swatch" : "list";
}

function groupTone(commands) {
  return commands.some((command) => command.tone === "danger") ? "danger" : "default";
}

export function groupBlockActionCommands(commands = []) {
  const groups = [];
  const groupByName = new Map();

  commands.forEach((command, index) => {
    if (command?.submenu) return;
    const groupKey = command?.groupKey || command?.group || "Actions";
    let group = groupByName.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        name: command?.group || groupKey,
        commands: [],
      };
      groupByName.set(groupKey, group);
      groups.push(group);
    }
    group.commands.push({ ...command, index: command?.index ?? index });
  });

  return groups.map((group) => ({
    ...group,
    layout: groupLayout(group.key),
    tone: groupTone(group.commands),
  }));
}

export function blockActionSubmenuGroups(commands = []) {
  return commands
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => command?.submenu && Array.isArray(command.children))
    .map(({ command, index }) => ({
      id: command.submenu,
      name: command.title,
      description: command.description,
      trigger: { ...command, index: command.index ?? index },
      commands: command.children.map((child) => ({ ...child })),
    }))
    .sort((left, right) => submenuOrder(left.id) - submenuOrder(right.id));
}

export function commandSubmenuId(command) {
  if (!command) return "";
  if (command.submenu && Array.isArray(command.children)) return command.submenu;
  return command.submenu ?? "";
}

export function prepareBlockActionMenuCommands(commands = []) {
  const childIds = new Set();
  const childCommands = [];
  const parentCommands = [];
  const topLevelCommands = [];

  commands.forEach((command) => {
    if (command?.submenu && Array.isArray(command.children)) {
      parentCommands.push(command);
      command.children.forEach((child) => childIds.add(child.id));
    }
  });

  commands.forEach((command) => {
    if (!command) return;
    if (command.submenu && Array.isArray(command.children)) {
      topLevelCommands.push(command);
    } else if (command.submenu) {
      childCommands.push(command);
    } else if (!childIds.has(command.id)) {
      topLevelCommands.push(command);
    }
  });

  parentCommands.forEach((parent) => {
    (parent.children ?? []).forEach((child) => {
      if (
        !childCommands.some(
          (command) => command.id === child.id && command.submenu === parent.submenu,
        )
      ) {
        childCommands.push({ ...child, submenu: parent.submenu });
      }
    });
  });

  const ordered = [...topLevelCommands];
  childCommands.forEach((command) => {
    if (parentCommands.some((parent) => parent.submenu === command.submenu)) {
      ordered.push(command);
    }
  });

  return ordered.map((command, index) => {
    if (command.submenu && Array.isArray(command.children)) {
      return {
        ...command,
        index,
        children: command.children.map((child) => ({ ...child })),
      };
    }
    return { ...command, index };
  });
}

export function submenuCommandIndex(commands = [], submenu = "", commandId = "") {
  return commands.findIndex(
    (command) => command?.submenu === submenu && command.id === commandId,
  );
}

export function firstSubmenuChildIndex(commands = [], submenu = "") {
  return commands.findIndex(
    (command) =>
      command?.submenu === submenu &&
      !Array.isArray(command.children) &&
      command.id !== submenu,
  );
}

export function submenuParentIndex(commands = [], submenu = "") {
  return commands.findIndex(
    (command) => command?.submenu === submenu && Array.isArray(command.children),
  );
}

export function nextCommandIndexInSubmenu(commands = [], currentIndex = 0, direction = 1) {
  const submenu = commandSubmenuId(commands[currentIndex]);
  if (!submenu) return currentIndex;

  const candidates = commands
    .map((command, index) => ({ command, index }))
    .filter(
      ({ command }) =>
        command?.submenu === submenu &&
        !Array.isArray(command.children) &&
        command.id !== submenu,
    );
  if (!candidates.length) return currentIndex;

  const currentChildIndex = candidates.findIndex(({ index }) => index === currentIndex);
  const nextChildIndex =
    currentChildIndex < 0
      ? 0
      : (currentChildIndex + direction + candidates.length) % candidates.length;
  return candidates[nextChildIndex]?.index ?? currentIndex;
}

export function blockActionHomeEndIndex(commands = [], selectedIndex = 0, key = "Home") {
  if (commands.length === 0) return -1;
  const selectedCommand = commands[selectedIndex];
  const onSubmenuChild =
    selectedCommand?.submenu &&
    !Array.isArray(selectedCommand.children) &&
    selectedCommand.id !== selectedCommand.submenu;
  const submenu = onSubmenuChild ? commandSubmenuId(selectedCommand) : "";

  if (submenu) {
    const children = commands
      .map((command, index) => ({ command, index }))
      .filter(
        ({ command }) =>
          command?.submenu === submenu &&
          !Array.isArray(command.children) &&
          command.id !== submenu,
      );
    if (!children.length) return selectedIndex;
    return key === "End" ? children.at(-1).index : children[0].index;
  }

  const topLevel = commands
    .map((command, index) => ({ command, index }))
    .filter(({ command }) => !command?.submenu || Array.isArray(command.children));
  if (!topLevel.length) return selectedIndex;
  return key === "End" ? topLevel.at(-1).index : topLevel[0].index;
}

export function blockActionShortcutCommandIdFromEvent(event = {}) {
  const key = String(event?.key ?? "").toLowerCase();
  const primaryModifier = event?.ctrlKey || event?.metaKey;
  if (event?.altKey && !primaryModifier && key === "arrowup") return "move-block-up";
  if (event?.altKey && !primaryModifier && key === "arrowdown") return "move-block-down";
  if (primaryModifier && !event?.altKey && key === "c") return "copy-block";
  if (primaryModifier && !event?.altKey && key === "d") return "duplicate-block";
  if (key === "delete" || key === "backspace") return "delete";
  return null;
}

export function blockActionSubmenuPanelWidth() {
  return 160;
}
