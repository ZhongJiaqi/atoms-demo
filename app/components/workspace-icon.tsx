import type { ReactNode } from "react";

type IconName = "plus" | "projects" | "code" | "history" | "logout" | "monitor" | "phone" | "refresh" | "external" | "terminal" | "arrow-up" | "close" | "copy";

const shapes: Record<IconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  projects: <><rect x="3" y="4" width="7" height="7" rx="1.5" /><rect x="14" y="4" width="7" height="7" rx="1.5" /><rect x="3" y="15" width="7" height="6" rx="1.5" /><rect x="14" y="15" width="7" height="6" rx="1.5" /></>,
  code: <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" />,
  history: <><path d="M3 10a9 9 0 1 1 1 7M3 4v6h6" /><path d="M12 7v5l3 2" /></>,
  logout: <><path d="M9 4H4v16h5m6-13 5 5-5 5m-6-5h11" /></>,
  monitor: <><rect x="3" y="3" width="18" height="13" rx="2" /><path d="M12 16v5m-4 0h8" /></>,
  phone: <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M10 18h4" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M19 11a7 7 0 0 0-12-6L4 8m1 5a7 7 0 0 0 12 6l3-3" /></>,
  external: <><path d="M14 3h7v7m0-7L10 14" /><path d="M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5" /></>,
  terminal: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m6 9 3 3-3 3m7 0h5" /></>,
  "arrow-up": <path d="M12 20V4m-6 6 6-6 6 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V3H3v13h5" /></>,
};

export function WorkspaceIcon({ name }: { name: IconName }) {
  return <svg className="workspace-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
