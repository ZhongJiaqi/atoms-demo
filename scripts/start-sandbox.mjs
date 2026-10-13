import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sandboxRoot = join(projectRoot, "sandbox-template");
const viteBin = join(projectRoot, "node_modules", "vite", "bin", "vite.js");

// 只向 Vite 传递运行所需的非敏感变量，避免宿主模型密钥进入生成应用进程。
const safeEnvironment = {
  PATH: process.env.PATH,
  TMPDIR: process.env.TMPDIR || "/private/tmp",
  NODE_ENV: "development",
  NO_COLOR: "1",
};

const child = spawn(
  "/usr/bin/sandbox-exec",
  [
    "-f",
    join(projectRoot, "sandbox", "vite.sb"),
    process.execPath,
    viteBin,
    "--configLoader",
    "native",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ],
  {
    cwd: sandboxRoot,
    env: safeEnvironment,
    stdio: "inherit",
    shell: false,
  },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
