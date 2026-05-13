import React from "react";
import {
  Code2,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  List,
  ListOrdered,
  ListChecks,
  MessageSquareText,
  Pilcrow,
  Quote,
  SeparatorHorizontal,
  Sigma,
  SquareCode,
  TableProperties,
  Workflow,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

type CommandIconKey =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet-list"
  | "ordered-list"
  | "task-list"
  | "quote"
  | "callout"
  | "code-block"
  | "divider"
  | "table"
  | "math"
  | "mermaid"
  | "image"
  | "code-language"
  | "file";

const ICON_PROPS = Object.freeze({
  className: "mn-tiptap-command-icon-svg",
  size: 15,
  strokeWidth: 1.85,
  absoluteStrokeWidth: true,
  "aria-hidden": "true",
  focusable: "false",
} satisfies LucideProps);

function LucideCommandIcon({ as: Icon }: { as: LucideIcon }) {
  return <Icon {...ICON_PROPS} />;
}

const COMMAND_ICONS: Readonly<Record<CommandIconKey, React.ReactElement>> = Object.freeze({
  paragraph: <LucideCommandIcon as={Pilcrow} />,
  "heading-1": <LucideCommandIcon as={Heading1} />,
  "heading-2": <LucideCommandIcon as={Heading2} />,
  "heading-3": <LucideCommandIcon as={Heading3} />,
  "bullet-list": <LucideCommandIcon as={List} />,
  "ordered-list": <LucideCommandIcon as={ListOrdered} />,
  "task-list": <LucideCommandIcon as={ListChecks} />,
  quote: <LucideCommandIcon as={Quote} />,
  callout: <LucideCommandIcon as={MessageSquareText} />,
  "code-block": <LucideCommandIcon as={SquareCode} />,
  divider: <LucideCommandIcon as={SeparatorHorizontal} />,
  table: <LucideCommandIcon as={TableProperties} />,
  math: <LucideCommandIcon as={Sigma} />,
  mermaid: <LucideCommandIcon as={Workflow} />,
  image: <LucideCommandIcon as={ImagePlus} />,
  "code-language": <LucideCommandIcon as={Code2} />,
  file: <LucideCommandIcon as={FileText} />,
});

function isCommandIconKey(icon: unknown): icon is CommandIconKey {
  return typeof icon === "string" && icon in COMMAND_ICONS;
}

export function CommandMenuIcon({ icon }: { icon?: string | null }) {
  return isCommandIconKey(icon) ? COMMAND_ICONS[icon] : COMMAND_ICONS.paragraph;
}
