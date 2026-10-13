export type GeneratedFile = {
  path: string;
  content: string;
};

export type GeneratedProject = {
  projectName: string;
  summary: string;
  files: GeneratedFile[];
};

export type ProjectPatch = {
  projectName?: string;
  summary: string;
  files: GeneratedFile[];
  deletedFiles: string[];
};

export type ProjectMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  turnId: string;
};

export type ProjectTurn = {
  id: string;
  mode: "create" | "modify";
  requirement: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  model?: string;
  summary?: string;
  changedFiles?: string[];
  deletedFiles?: string[];
  buildAttempts?: number;
  version?: number;
  error?: string;
  events: Array<{ event: AgentEventName; data: Record<string, unknown>; at: string }>;
};

export type ProjectState = {
  projectId: string;
  projectName: string;
  summary: string;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  messages: ProjectMessage[];
  turns: ProjectTurn[];
};

export type AgentEventName =
  | "accepted"
  | "project_loaded"
  | "model_started"
  | "model_completed"
  | "files_saved"
  | "build_started"
  | "build_failed"
  | "repair_started"
  | "repair_completed"
  | "preview_started"
  | "complete"
  | "error";

export type AgentEvent = {
  event: AgentEventName;
  data: Record<string, unknown>;
};

