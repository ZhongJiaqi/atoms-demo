import { execFile } from "node:child_process";
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { spawn } from "node:child_process";

import type { BuildResult, PreviewEntry } from "./types";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const NODE_MODULES = join(PROJECT_ROOT, "node_modules");
const TSC_BIN = join(NODE_MODULES, "typescript", "bin", "tsc");
const VITE_BIN = join(NODE_MODULES, "vite", "bin", "vite.js");
const BUILD_TIMEOUT_MS = 40_000;
const PREVIEW_LIFETIME_MS = 15 * 60_000;
const MAX_RSS_KB = 640 * 1024;
const MAX_PROCESS_COUNT = 32;
const MAX_LOG_BYTES = 64_000;

declare global {
  // eslint-disable-next-line no-var
  var __atomsPreviewRegistry: Map<string, PreviewEntry> | undefined;
  // eslint-disable-next-line no-var
  var __atomsPreviewCleanupRegistered: boolean | undefined;
  // eslint-disable-next-line no-var
  var __atomsRuntimeDirectories: Map<string, string> | undefined;
}

const previewRegistry = globalThis.__atomsPreviewRegistry ?? new Map<string, PreviewEntry>();
globalThis.__atomsPreviewRegistry = previewRegistry;
const runtimeDirectories = globalThis.__atomsRuntimeDirectories ?? new Map<string, string>();
globalThis.__atomsRuntimeDirectories = runtimeDirectories;

if (!globalThis.__atomsPreviewCleanupRegistered) {
  globalThis.__atomsPreviewCleanupRegistered = true;
  process.on("exit", () => {
    for (const entry of previewRegistry.values()) killProcessGroup(entry.process.pid);
    previewRegistry.clear();
  });
}

function sbpl(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

async function writeSandboxProfile(projectDir: string, allowLoopback: boolean) {
  const profilePath = join(projectDir, allowLoopback ? ".preview.sb" : ".build.sb");
  const networkRules = allowLoopback
    ? `\n(allow network-inbound (local ip "localhost:*"))\n(allow network-outbound (remote ip "localhost:*"))`
    : "";
  const profile = `(version 1)
(deny default)

(allow process*)
(allow signal (target self))
(allow sysctl-read)
(allow mach-lookup)

(allow file-read*)
(deny file-read*
  (subpath "/Users/jiaqizhong/.ssh")
  (subpath "/Users/jiaqizhong/.aws")
  (subpath "/Users/jiaqizhong/.codex")
  (subpath "/Users/jiaqizhong/.agents")
  (subpath "/Users/jiaqizhong/ai-news-radar")
  (literal "/Users/jiaqizhong/.git-credentials")
  (literal "/Users/jiaqizhong/.npmrc")
  (literal "${sbpl(join(PROJECT_ROOT, ".env"))}")
  (literal "${sbpl(join(PROJECT_ROOT, ".env.local"))}"))

(allow file-write*
  (subpath "${sbpl(projectDir)}"))${networkRules}
`;
  await writeFile(profilePath, profile, { encoding: "utf8", mode: 0o600 });
  await chmod(profilePath, 0o600);
  return profilePath;
}

function appendLog(current: string, chunk: Buffer | string) {
  const next = current + chunk.toString();
  return next.length > MAX_LOG_BYTES ? next.slice(-MAX_LOG_BYTES) : next;
}

function killProcessGroup(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // The process already exited.
    }
  }
}

async function processTreeStats(rootPid: number) {
  const { stdout } = await execFileAsync("/bin/ps", ["-axo", "pid=,ppid=,rss="]);
  const rows = stdout
    .trim()
    .split("\n")
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row) => row.length === 3 && row.every(Number.isFinite));
  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [pid, ppid] of rows) {
      if (descendants.has(ppid) && !descendants.has(pid)) {
        descendants.add(pid);
        changed = true;
      }
    }
  }
  return {
    rssKb: rows.reduce((sum, [pid, , rss]) => sum + (descendants.has(pid) ? rss : 0), 0),
    processCount: descendants.size,
  };
}

type LimitedProcessOptions = {
  projectDir: string;
  args: string[];
  timeoutMs: number;
  allowLoopback: boolean;
  keepAlive?: boolean;
};

type CompletedProcess = {
  kind: "completed";
  child: ReturnType<typeof spawn>;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  resourceExceeded: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  durationMs: number;
};

type RunningProcess = {
  kind: "running";
  child: ReturnType<typeof spawn>;
  stopMonitoring: () => void;
  getLogs: () => { stdout: string; stderr: string; timedOut: boolean; resourceExceeded: boolean };
};

async function spawnLimited(options: LimitedProcessOptions): Promise<CompletedProcess | RunningProcess> {
  const profile = await writeSandboxProfile(options.projectDir, options.allowLoopback);
  const tempDir = join(options.projectDir, ".tmp");
  await mkdir(tempDir, { recursive: true, mode: 0o700 });
  const wrapper = "ulimit -t 35; ulimit -f 65536; ulimit -n 128; exec \"$@\"";
  const child = spawn(
    "/usr/bin/sandbox-exec",
    ["-f", profile, "/bin/zsh", "-c", wrapper, "atoms-sandbox", process.execPath, ...options.args],
    {
      cwd: options.projectDir,
      detached: true,
      env: {
        PATH: "/usr/bin:/bin",
        TMPDIR: tempDir,
        NODE_ENV: "production",
        NO_COLOR: "1",
        LANG: "en_US.UTF-8",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stdout = "";
  let stderr = "";
  let timedOut = false;
  let resourceExceeded = false;
  child.stdout?.on("data", (chunk) => {
    stdout = appendLog(stdout, chunk);
  });
  child.stderr?.on("data", (chunk) => {
    stderr = appendLog(stderr, chunk);
  });

  const timeout = setTimeout(() => {
    timedOut = true;
    killProcessGroup(child.pid);
  }, options.timeoutMs);
  const memoryCheck = setInterval(async () => {
    if (!child.pid || child.exitCode !== null) return;
    try {
      const stats = await processTreeStats(child.pid);
      if (stats.rssKb > MAX_RSS_KB || stats.processCount > MAX_PROCESS_COUNT) {
        resourceExceeded = true;
        killProcessGroup(child.pid);
      }
    } catch {
      // A failed sample does not disable the hard timeout or OS limits.
    }
  }, 300);

  if (options.keepAlive) {
    return {
      kind: "running",
      child,
      stopMonitoring() {
        clearTimeout(timeout);
        clearInterval(memoryCheck);
      },
      getLogs: () => ({ stdout, stderr, timedOut, resourceExceeded }),
    };
  }

  const startedAt = Date.now();
  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  clearInterval(memoryCheck);
  return {
    kind: "completed",
    child,
    stdout,
    stderr,
    timedOut,
    resourceExceeded,
    exitCode: exit.code,
    signal: exit.signal,
    durationMs: Date.now() - startedAt,
  };
}

async function runCommand(projectDir: string, args: string[]): Promise<BuildResult> {
  const result = await spawnLimited({
    projectDir,
    args,
    timeoutMs: BUILD_TIMEOUT_MS,
    allowLoopback: false,
  });
  if (result.kind !== "completed") throw new Error("内部沙盒状态错误。");
  return {
    success: result.exitCode === 0 && !result.signal && !result.timedOut && !result.resourceExceeded,
    exitCode: result.exitCode,
    signal: result.signal,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
    resourceExceeded: result.resourceExceeded,
    durationMs: result.durationMs,
  };
}

export async function buildProject(projectDir: string): Promise<BuildResult> {
  const typecheck = await runCommand(projectDir, [TSC_BIN, "--noEmit", "--project", "tsconfig.json"]);
  if (!typecheck.success) return typecheck;
  const vite = await runCommand(projectDir, [
    VITE_BIN,
    "build",
    "--config",
    "vite.config.mjs",
    "--configLoader",
    "native",
  ]);
  return {
    ...vite,
    stdout: [typecheck.stdout, vite.stdout].filter(Boolean).join("\n"),
    stderr: [typecheck.stderr, vite.stderr].filter(Boolean).join("\n"),
    durationMs: typecheck.durationMs + vite.durationMs,
  };
}

async function findOpenPort() {
  const net = await import("node:net");
  for (let port = 4310; port <= 4399; port += 1) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("没有可用的本地预览端口。");
}

export async function startPreview(projectId: string, projectDir: string) {
  const port = await findOpenPort();
  const running = await spawnLimited({
    projectDir,
    args: [
      VITE_BIN,
      "preview",
      "--config",
      "vite.config.mjs",
      "--configLoader",
      "native",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    timeoutMs: PREVIEW_LIFETIME_MS,
    allowLoopback: true,
    keepAlive: true,
  });
  if (running.kind !== "running") throw new Error("无法启动预览沙盒。");

  const target = `http://127.0.0.1:${port}/`;
  let ready = false;
  for (let index = 0; index < 40; index += 1) {
    if (running.child.exitCode !== null) break;
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(500) });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  if (!ready) {
    const logs = running.getLogs();
    running.stopMonitoring();
    killProcessGroup(running.child.pid);
    throw new Error(`Vite 预览未能启动：${logs.stderr.slice(-3000) || "没有可用日志"}`);
  }

  const entry: PreviewEntry = {
    projectId,
    projectDir,
    port,
    process: running.child,
    expiresAt: Date.now() + PREVIEW_LIFETIME_MS,
  };
  stopPreview(projectId);
  previewRegistry.set(projectId, entry);
  runtimeDirectories.set(projectId, projectDir);
  const cleanup = () => {
    running.stopMonitoring();
    if (previewRegistry.get(entry.projectId)?.process === running.child) {
      previewRegistry.delete(entry.projectId);
    }
  };
  running.child.once("exit", cleanup);
  setTimeout(() => {
    killProcessGroup(running.child.pid);
    cleanup();
  }, PREVIEW_LIFETIME_MS).unref();
  return entry;
}

export function stopPreview(projectId: string) {
  const entry = previewRegistry.get(projectId);
  if (!entry) return;
  previewRegistry.delete(projectId);
  killProcessGroup(entry.process.pid);
}

export function activateStagedPreview(entry: PreviewEntry, projectId: string) {
  if (entry.process.exitCode !== null || entry.process.signalCode !== null || entry.expiresAt <= Date.now()) {
    return { activated: false as const };
  }
  const stagedId = entry.projectId;
  const previousDirectory = runtimeDirectories.get(projectId);
  stopPreview(projectId);
  previewRegistry.delete(stagedId);
  entry.projectId = projectId;
  previewRegistry.set(projectId, entry);
  runtimeDirectories.delete(stagedId);
  runtimeDirectories.set(projectId, entry.projectDir);
  return { activated: true as const, previousDirectory };
}

export function discardStagedPreview(projectId: string) {
  stopPreview(projectId);
  runtimeDirectories.delete(projectId);
}

export function getProjectRuntimeDirectory(projectId: string) {
  return runtimeDirectories.get(projectId);
}

export function getPreview(projectId: string) {
  const entry = previewRegistry.get(projectId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now() || entry.process.exitCode !== null || entry.process.signalCode !== null) {
    previewRegistry.delete(projectId);
    killProcessGroup(entry.process.pid);
    return null;
  }
  return entry;
}

