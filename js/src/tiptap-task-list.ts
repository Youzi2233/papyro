import { TaskItem } from "@tiptap/extension-list/task-item";
import { TaskList } from "@tiptap/extension-list/task-list";
import type { Extension as TiptapExtension } from "@tiptap/core";

type TaskItemLabelNode = {
  textContent?: string | null;
} | null | undefined;

export function taskItemCheckboxLabel(
  node: TaskItemLabelNode,
  checked: boolean,
): string {
  const text = String(node?.textContent ?? "").trim();
  const target = text ? `: ${text}` : "";
  return checked ? `Mark task incomplete${target}` : `Mark task complete${target}`;
}

export function createPapyroTaskListExtensions(): TiptapExtension[] {
  return [
    TaskList.configure({
      HTMLAttributes: {
        class: "mn-tiptap-task-list",
      },
    }),
    TaskItem.configure({
      nested: true,
      HTMLAttributes: {
        class: "mn-tiptap-task-item",
      },
      a11y: {
        checkboxLabel: taskItemCheckboxLabel,
      },
    }),
  ];
}
