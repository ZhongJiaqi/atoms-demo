import type { ChildProcess } from "node:child_process";

export type BuildResult = {
  success: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  resourceExceeded: boolean;
  durationMs: number;
};

export type PreviewEntry = {
  projectId: string;
  projectDir: string;
  port: number;
  process: ChildProcess;
  expiresAt: number;
};

