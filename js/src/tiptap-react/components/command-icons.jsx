import React from "react";

const ICON_STROKE_WIDTH = 1.8;

function SvgIcon({ children }) {
  return (
    <svg
      className="mn-tiptap-command-icon-svg"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={ICON_STROKE_WIDTH}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function HeadingIcon({ level }) {
  return (
    <span className="mn-tiptap-command-icon-text" aria-hidden="true">
      H{level}
    </span>
  );
}

const COMMAND_ICONS = Object.freeze({
  paragraph: (
    <SvgIcon>
      <path d="M5 5.5h10" />
      <path d="M5 10h7" />
      <path d="M5 14.5h9" />
    </SvgIcon>
  ),
  "heading-1": <HeadingIcon level="1" />,
  "heading-2": <HeadingIcon level="2" />,
  "heading-3": <HeadingIcon level="3" />,
  "bullet-list": (
    <SvgIcon>
      <path d="M8 6h7" />
      <path d="M8 10h7" />
      <path d="M8 14h7" />
      <circle cx="5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="10" r="1" fill="currentColor" stroke="none" />
      <circle cx="5" cy="14" r="1" fill="currentColor" stroke="none" />
    </SvgIcon>
  ),
  "ordered-list": (
    <SvgIcon>
      <path d="M9 6h6" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
      <path d="M4.4 5.2h1.1v3" />
      <path d="M4.2 12.2c0-1.1 2.3-1.1 2.3 0 0 .9-1.5 1.2-2.2 2.5h2.4" />
    </SvgIcon>
  ),
  "task-list": (
    <SvgIcon>
      <path d="M8.5 6h6.5" />
      <path d="M8.5 14h6.5" />
      <path d="M4.2 5.8l1 1 2-2" />
      <rect x="4" y="12.5" width="2.5" height="2.5" rx=".5" />
    </SvgIcon>
  ),
  quote: (
    <SvgIcon>
      <path d="M7.5 6.5h-2a2 2 0 0 0-2 2v1.8h3.2v-2H5.4" />
      <path d="M15.5 6.5h-2a2 2 0 0 0-2 2v1.8h3.2v-2h-1.3" />
    </SvgIcon>
  ),
  callout: (
    <SvgIcon>
      <path d="M4 5.5h12v8.2H8.5L5 16v-2.3H4z" />
      <path d="M7 8.5h6" />
      <path d="M7 11h4" />
    </SvgIcon>
  ),
  "code-block": (
    <SvgIcon>
      <path d="M7.5 6.5 4 10l3.5 3.5" />
      <path d="M12.5 6.5 16 10l-3.5 3.5" />
    </SvgIcon>
  ),
  divider: (
    <SvgIcon>
      <path d="M4 10h12" />
    </SvgIcon>
  ),
  table: (
    <SvgIcon>
      <rect x="4" y="4.5" width="12" height="11" rx="1.5" />
      <path d="M4 8h12" />
      <path d="M8 4.5v11" />
      <path d="M12 4.5v11" />
    </SvgIcon>
  ),
  math: (
    <SvgIcon>
      <path d="M5 6.5h6" />
      <path d="M8 6.5v7" />
      <path d="M5 13.5h6" />
      <path d="M13 8.5l3 3" />
      <path d="M16 8.5l-3 3" />
    </SvgIcon>
  ),
  mermaid: (
    <SvgIcon>
      <rect x="4" y="4.5" width="4.2" height="4.2" rx="1" />
      <rect x="11.8" y="11.3" width="4.2" height="4.2" rx="1" />
      <path d="M8.2 6.6h2.2a3.6 3.6 0 0 1 3.6 3.6v1.1" />
    </SvgIcon>
  ),
  image: (
    <SvgIcon>
      <rect x="4" y="5" width="12" height="10" rx="1.5" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <path d="M5.5 14 9 10.7l2.1 2 1.3-1.2L15 14" />
    </SvgIcon>
  ),
});

export function CommandMenuIcon({ icon }) {
  return COMMAND_ICONS[icon] ?? COMMAND_ICONS.paragraph;
}
