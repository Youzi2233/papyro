const COMMAND_GROUP_ORDER = Object.freeze([
  "Text",
  "文本",
  "Lists",
  "列表",
  "Blocks",
  "块",
  "Data",
  "数据",
  "Media",
  "媒体",
  "Advanced",
  "高级",
]);

function commandGroupRank(groupName) {
  const index = COMMAND_GROUP_ORDER.indexOf(groupName);
  return index < 0 ? COMMAND_GROUP_ORDER.length : index;
}

export function commandMenuGroupTone(command = {}) {
  const groupName = String(command?.group ?? "Text").trim().toLowerCase();
  const commandId = String(command?.id ?? "").trim().toLowerCase();
  const searchable = `${groupName} ${commandId}`;
  const tones = new Map([
    ["text", "text"],
    ["lists", "lists"],
    ["blocks", "blocks"],
    ["data", "data"],
    ["media", "media"],
    ["advanced", "advanced"],
  ]);
  const byLabel = tones.get(groupName);
  if (byLabel) return byLabel;

  const aliases = {
    text: ["paragraph", "heading"],
    lists: ["list", "task"],
    blocks: ["quote", "callout", "code", "divider"],
    data: ["table"],
    media: ["image"],
    advanced: ["math", "mermaid"],
  };
  for (const [tone, markers] of Object.entries(aliases)) {
    if (markers.some((marker) => searchable.includes(marker))) return tone;
  }
  return "text";
}

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

  return groups.sort(
    (left, right) =>
      commandGroupRank(left.name) - commandGroupRank(right.name),
  );
}

export function commandMenuSidePanel(command) {
  if (command?.id === "table") return "table";
  if (command?.id === "callout") return "callout";
  if (command?.id === "code-block") return "code-language";
  return "none";
}

export function commandMenuSidePanelWidth(panel) {
  if (panel === "table") return 166;
  if (panel === "callout") return 166;
  if (panel === "code-language") return 176;
  return 0;
}

export function commandMenuSidePanelId(ownerId, panel) {
  const sidePanel = String(panel ?? "none");
  if (!ownerId || sidePanel === "none") return undefined;
  return `${ownerId}-${sidePanel}-panel`;
}
