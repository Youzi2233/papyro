export function groupCommandsForMenu(commands = []) {
  const groups = [];
  const byName = new Map();

  commands.forEach((command, index) => {
    const groupName = command?.group || "Text";
    let group = byName.get(groupName);
    if (!group) {
      group = {
        name: groupName,
        commands: [],
      };
      byName.set(groupName, group);
      groups.push(group);
    }
    group.commands.push({ ...command, index: command?.index ?? index });
  });

  return groups;
}

export function commandMenuSidePanel(command) {
  if (command?.id === "table") return "table";
  if (command?.id === "callout") return "callout";
  return "none";
}

export function commandMenuSidePanelWidth(panel) {
  if (panel === "table") return 136;
  if (panel === "callout") return 154;
  return 0;
}
