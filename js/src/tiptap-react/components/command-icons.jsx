import React from "react";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  ListTodo,
  MessageSquareText,
  Minus,
  Quote,
  Sigma,
  Table2,
  Type,
  Workflow,
} from "lucide-react";

const ICON_PROPS = Object.freeze({
  className: "mn-tiptap-command-icon-svg",
  size: 15,
  strokeWidth: 1.85,
  absoluteStrokeWidth: true,
  "aria-hidden": "true",
  focusable: "false",
});

function LucideCommandIcon({ as: Icon }) {
  return <Icon {...ICON_PROPS} />;
}

const COMMAND_ICONS = Object.freeze({
  paragraph: <LucideCommandIcon as={Type} />,
  "heading-1": <LucideCommandIcon as={Heading1} />,
  "heading-2": <LucideCommandIcon as={Heading2} />,
  "heading-3": <LucideCommandIcon as={Heading3} />,
  "bullet-list": <LucideCommandIcon as={List} />,
  "ordered-list": <LucideCommandIcon as={ListOrdered} />,
  "task-list": <LucideCommandIcon as={ListTodo} />,
  quote: <LucideCommandIcon as={Quote} />,
  callout: <LucideCommandIcon as={MessageSquareText} />,
  "code-block": <LucideCommandIcon as={Code2} />,
  divider: <LucideCommandIcon as={Minus} />,
  table: <LucideCommandIcon as={Table2} />,
  math: <LucideCommandIcon as={Sigma} />,
  mermaid: <LucideCommandIcon as={Workflow} />,
  image: <LucideCommandIcon as={Image} />,
});

export function CommandMenuIcon({ icon }) {
  return COMMAND_ICONS[icon] ?? COMMAND_ICONS.paragraph;
}
