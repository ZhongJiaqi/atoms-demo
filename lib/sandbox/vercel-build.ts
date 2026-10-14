import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, mkdtemp, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { Sandbox } from "@vercel/sandbox";
import type { BuildResult } from "./types.ts";

const WORKDIR = "/vercel/sandbox";
const LIFETIME_MS = 180_000;
const LOG_BYTES = 64 * 1024;
const MAX_ARTIFACT_FILES = 256;
const MAX_ARTIFACT_BYTES = 3 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const SOURCE_PATH = /^src\/(?:App\.tsx|styles\.css|types\.ts|components\/[a-zA-Z0-9_/-]+\.tsx|data\/[a-zA-Z0-9_/-]+\.ts)$/;
// These are trusted application-owned files, never read from the generated directory.
const FIXED_FILES: Record<string, string> = {
  "package.json": JSON.stringify({ private: true, type: "module", dependencies: {
    react: "19.1.0", "react-dom": "19.1.0", "@vitejs/plugin-react": "4.4.1", vite: "6.3.5",
    "@types/react": "19.1.0", "@types/react-dom": "19.1.0", typescript: "5.8.3",
  } }),
  "tsconfig.json": JSON.stringify({ compilerOptions: { target: "ES2022", lib: ["ES2022", "DOM", "DOM.Iterable"], skipLibCheck: true, esModuleInterop: true, strict: true, module: "ESNext", moduleResolution: "Bundler", resolveJsonModule: true, isolatedModules: true, noEmit: true, jsx: "react-jsx" }, include: ["src"] }),
  "vite.config.mjs": 'import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ base: "./", plugins: [react()], cacheDir: ".vite-cache", build: { outDir: "dist", emptyOutDir: true, sourcemap: false } });',
  "index.html": '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Atoms Generated App</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>',
  "src/main.tsx": 'import { StrictMode } from "react"; import { createRoot } from "react-dom/client"; import App from "./App"; import "./styles.css"; createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);',
};

// Runs after compilation inside the VM. No archive extraction or generated shell commands.
const COLLECT = `const fs=require('node:fs'),p=require('node:path');const root='/vercel/sandbox/dist';let bytes=0,nodes=0;const files=[];
function walk(dir){if(++nodes>512)throw Error('构建产物目录过多');for(const name of fs.readdirSync(dir)){const full=p.join(dir,name),s=fs.lstatSync(full);if(s.isSymbolicLink())throw Error('构建产物含软链接');if(s.isDirectory())walk(full);else if(s.isFile()){const path=p.relative(root,full);if(path.length>160||s.size>${MAX_FILE_BYTES}||(bytes+=s.size)>${MAX_ARTIFACT_BYTES}||files.length>=${MAX_ARTIFACT_FILES})throw Error('构建产物超限');files.push({path,size:s.size});}else throw Error('构建产物类型不允许');}}
if(!fs.lstatSync(root).isDirectory())throw Error('构建产物目录无效');walk(root);console.log(JSON.stringify(files));`;

function capture(limit = LOG_BYTES) {
  let bytes = 0;
  const chunks: Buffer[] = [];
  const stream = new Writable({ write(chunk, _encoding, callback) {
    const value = Buffer.from(chunk);
    if (bytes < limit) chunks.push(value.subarray(0, limit - bytes));
    bytes += value.length;
    callback();
  } });
  return { stream, text: () => Buffer.concat(chunks).toString("utf8"), exceeded: () => bytes > limit };
}

async function sourceFiles(projectDir: string) {
  const root = resolve(projectDir);
  if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error("项目目录含软链接或无效路径。");
  const files: { path: string; content: Buffer }[] = [];
  let total = 0;
  async function walk(relative: string) {
    const directory = join(root, relative);
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new Error("源码目录不允许软链接。");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error("源码不允许软链接。");
      if (entry.isDirectory()) {
        if (!/^src\/(components|data)(\/[a-zA-Z0-9_-]+)*$/.test(path) || path.length > 160) throw new Error("不允许的源码目录。");
        await walk(path);
      } else {
        if (path === "src/main.tsx") continue;
        if (!entry.isFile() || !SOURCE_PATH.test(path) || path.includes("..") || path.length > 160) throw new Error("不允许的源码路径。");
        const handle = await open(join(root, path), constants.O_RDONLY | constants.O_NOFOLLOW);
        try {
          const size = (await handle.stat()).size;
          if (size > 36_000 || (total += size) > 140_000 || files.length >= 16) throw new Error("源码大小或文件数超限。");
          const content = await handle.readFile();
          if (content.length !== size) throw new Error("源码读取期间已变化。");
          files.push({ path: join(WORKDIR, path), content });
        } finally { await handle.close(); }
      }
    }
  }
  await walk("src");
  if (!files.some(f => f.path.endsWith("/src/App.tsx")) || !files.some(f => f.path.endsWith("/src/styles.css"))) throw new Error("项目缺少必要源码。");
  return { root, files };
}

export async function buildInVercelSandbox(projectDir: string): Promise<BuildResult> {
  const started = Date.now();
  const result: BuildResult = { success: false, exitCode: null, signal: null, stdout: "", stderr: "", timedOut: false, resourceExceeded: false, durationMs: 0 };
  let sandbox: Sandbox | undefined;
  let stage: string | undefined;
  const signal = AbortSignal.timeout(LIFETIME_MS);
  const stdout = capture();
  const stderr = capture();
  try {
    const { root, files } = await sourceFiles(projectDir);
    sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", resources: { vcpus: 1 }, timeout: LIFETIME_MS, persistent: false, networkPolicy: { allow: ["registry.npmjs.org"] }, signal });
    await sandbox.writeFiles(Object.entries(FIXED_FILES).map(([path, content]) => ({ path: join(WORKDIR, path), content: Buffer.from(content) })), { signal });
    async function run(cmd: string, args: string[], output = stdout) {
      const timeoutMs = Math.max(1, LIFETIME_MS - (Date.now() - started));
      // Non-detached SDK calls retain the entire output internally even with Writable sinks.
      const running = await sandbox!.runCommand({ cmd, args, cwd: WORKDIR, timeoutMs, signal, detached: true });
      for await (const log of running.logs({ signal })) {
        (log.stream === "stdout" ? output.stream : stderr.stream).write(log.data);
      }
      const command = await running.wait({ signal });
      result.exitCode = command.exitCode;
      if (command.exitCode !== 0) {
        result.timedOut = command.exitCode === 137 && (command.durationMs ?? 0) >= timeoutMs;
        throw new Error(result.timedOut ? "云端构建超时。" : `云端命令失败（退出码 ${command.exitCode}）。`);
      }
    }
    await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
    await sandbox.update({ networkPolicy: "deny-all" }, { signal });
    await sandbox.writeFiles(files, { signal });
    await run("node", ["node_modules/typescript/bin/tsc", "--noEmit", "--project", "tsconfig.json"]);
    await run("node", ["node_modules/vite/bin/vite.js", "build", "--config", "vite.config.mjs", "--configLoader", "native"]);
    const manifestOutput = capture();
    await run("node", ["-e", COLLECT], manifestOutput);
    if (manifestOutput.exceeded()) throw new Error("构建产物清单超限。");
    const manifest: unknown = JSON.parse(manifestOutput.text());
    if (!Array.isArray(manifest) || !manifest.length || manifest.length > MAX_ARTIFACT_FILES) throw new Error("构建产物文件数无效。");
    const seen = new Set<string>();
    let total = 0;
    for (const file of manifest) {
      if (!file || typeof file.path !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(file.path) || file.path.length > 160 || file.path.startsWith("/") || file.path.split("/").some((part: string) => !part || part === "." || part === "..") || seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES || (total += file.size) > MAX_ARTIFACT_BYTES) throw new Error("构建产物路径或大小无效。");
      seen.add(file.path);
    }
    if (!seen.has("index.html")) throw new Error("构建产物缺少 index.html。");
    stage = await mkdtemp(join(root, ".cloud-dist-"));
    for (const file of manifest) {
      const stream = await sandbox.readFile({ path: join(WORKDIR, "dist", file.path) }, { signal });
      if (!stream) throw new Error("构建产物不存在。");
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of stream as Readable) {
        const buffer = Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > file.size || bytes > MAX_FILE_BYTES) { (stream as Readable).destroy(); throw new Error("构建产物读取超限。"); }
        chunks.push(buffer);
      }
      if (bytes !== file.size) throw new Error("构建产物大小发生变化。");
      const target = join(stage, file.path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, Buffer.concat(chunks), { flag: "wx" });
    }
    // Only replace this task's validated dist directory after every artifact is checked.
    const dist = join(root, "dist");
    const old = await lstat(dist).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error; return null; });
    if (old?.isSymbolicLink() || (old && !old.isDirectory())) throw new Error("构建产物目标目录无效。");
    if (old) await rm(dist, { recursive: true });
    await rename(stage, dist);
    stage = undefined;
    result.success = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.timedOut ||= signal.aborted || /timeout|timed out|超时/i.test(message);
    result.stderr = result.timedOut ? "云端构建超时。" : `云端构建失败：${message}`;
  } finally {
    if (stage) await rm(stage, { recursive: true, force: true }).catch(() => {});
    if (sandbox) {
      try { await sandbox.stop({ signal: AbortSignal.timeout(10_000) }); }
      catch { result.success = false; result.stderr += "\n云端沙盒停止失败，等待硬时限自动回收。"; }
    }
    result.stdout = stdout.text();
    result.stderr = [stderr.text(), result.stderr].filter(Boolean).join("\n");
    result.durationMs = Date.now() - started;
  }
  return result;
}
