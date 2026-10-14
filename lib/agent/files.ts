import { constants as fsConstants } from "node:fs";
import { access, chmod, mkdir, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, posix, resolve } from "node:path";

import ts from "typescript";

import type { GeneratedFile, GeneratedProject, ProjectPatch, ProjectState } from "./types";

export const GENERATED_ROOT = join(process.cwd(), "generated-projects");

const MAX_FILES = 16;
const MAX_FILE_BYTES = 36_000;
const MAX_TOTAL_BYTES = 140_000;
const SOURCE_PATH = /^src\/(?:App\.tsx|styles\.css|types\.ts|components\/[a-zA-Z0-9_/-]+\.tsx|data\/[a-zA-Z0-9_/-]+\.ts)$/;
const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DISALLOWED_SOURCE = /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function|require)\s*\(|dangerouslySetInnerHTML|\bimport\s*\(/;

const FIXED_FILES: Record<string, string> = {
  "package.json": JSON.stringify(
    {
      name: "atoms-generated-app",
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: { build: "tsc --noEmit && vite build", preview: "vite preview" },
      dependencies: { react: "19.1.0", "react-dom": "19.1.0" },
      devDependencies: {
        "@vitejs/plugin-react": "4.4.1",
        "@types/react": "19.1.0",
        "@types/react-dom": "19.1.0",
        typescript: "5.8.3",
        vite: "6.3.5",
      },
    },
    null,
    2,
  ),
  "index.html": `<!doctype html>\n<html lang="zh-CN">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <meta name="color-scheme" content="light" />\n    <link rel="icon" href="data:," />\n    <title>Atoms Generated App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`,
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        useDefineForClassFields: true,
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        allowJs: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        strict: true,
        forceConsistentCasingInFileNames: true,
        module: "ESNext",
        moduleResolution: "Bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        noEmit: true,
        jsx: "react-jsx",
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "vite.config.mjs": `import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react";\n\nexport default defineConfig({\n  base: "./",\n  plugins: [react()],\n  cacheDir: ".vite-cache",\n  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },\n});\n`,
  "src/main.tsx": `import { StrictMode } from "react";\nimport { createRoot } from "react-dom/client";\nimport App from "./App";\nimport "./styles.css";\n\ncreateRoot(document.getElementById("root")!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n);\n`,
};

function safeSourcePath(projectDir: string, path: string) {
  if (!SOURCE_PATH.test(path) || path.includes("..") || normalize(path) !== path) {
    throw new Error(`不允许的生成文件路径：${path}`);
  }
  const target = resolve(projectDir, path);
  if (!target.startsWith(`${resolve(projectDir)}/`)) {
    throw new Error(`生成文件越过项目目录：${path}`);
  }
  return target;
}

function validateImports(file: GeneratedFile) {
  if (!file.path.endsWith(".ts") && !file.path.endsWith(".tsx")) return;
  if (DISALLOWED_SOURCE.test(file.content)) {
    throw new Error(`${file.path} 使用了演示沙盒禁止的网络或动态执行 API。`);
  }

  const source = ts.createSourceFile(
    file.path,
    file.content,
    ts.ScriptTarget.Latest,
    true,
    file.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const value = statement.moduleSpecifier.text;
    if (value !== "react" && !value.startsWith("./") && !value.startsWith("../")) {
      throw new Error(`${file.path} 引用了未批准的依赖：${value}`);
    }
    if (value.startsWith(".")) {
      const resolvedImport = posix.normalize(posix.join(posix.dirname(file.path), value));
      if (!resolvedImport.startsWith("src/")) {
        throw new Error(`${file.path} 的相对导入越过了 src 目录：${value}`);
      }
    }
  }
}

export function validateProject(project: GeneratedProject) {
  if (!project.projectName.trim() || !project.summary.trim()) {
    throw new Error("模型必须返回项目名称和实现摘要。");
  }
  if (project.files.length < 2 || project.files.length > MAX_FILES) {
    throw new Error(`生成文件数量必须在 2 到 ${MAX_FILES} 之间。`);
  }
  const paths = new Set<string>();
  let total = 0;
  for (const file of project.files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error("模型返回了无效文件对象。");
    }
    if (!SOURCE_PATH.test(file.path) || file.path.includes("..")) {
      throw new Error(`不允许的生成文件路径：${file.path}`);
    }
    if (paths.has(file.path)) throw new Error(`模型返回了重复文件：${file.path}`);
    paths.add(file.path);
    const bytes = Buffer.byteLength(file.content);
    if (bytes > MAX_FILE_BYTES) throw new Error(`${file.path} 超过单文件大小限制。`);
    total += bytes;
    validateImports(file);
    if (file.path.endsWith(".css") && /@import\s|url\(\s*["']?https?:/i.test(file.content)) {
      throw new Error(`${file.path} 包含被禁止的远程 CSS 资源。`);
    }
  }
  if (total > MAX_TOTAL_BYTES) throw new Error("生成源码总大小超过限制。");
  if (!paths.has("src/App.tsx") || !paths.has("src/styles.css")) {
    throw new Error("生成项目必须包含 src/App.tsx 和 src/styles.css。");
  }
}

async function writePrivateFile(path: string, content: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, content, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
}

export async function prepareProjectDirectory(
  projectId: string,
  requirement: string,
  project: GeneratedProject,
  root = GENERATED_ROOT,
) {
  validateProject(project);
  if (!PROJECT_ID.test(projectId)) throw new Error("项目 ID 格式无效。");
  await mkdir(root, { recursive: true, mode: 0o700 });
  const projectDir = join(root, projectId);
  try {
    await access(projectDir, fsConstants.F_OK);
    throw new Error("项目目录已存在，拒绝覆盖。");
  } catch (error) {
    if (error instanceof Error && error.message === "项目目录已存在，拒绝覆盖。") throw error;
  }
  await mkdir(projectDir, { recursive: false, mode: 0o700 });
  await chmod(projectDir, 0o700);

  for (const [path, content] of Object.entries(FIXED_FILES)) {
    await writePrivateFile(join(projectDir, path), content);
  }
  await writeGeneratedFiles(projectDir, project);
  await writePrivateFile(
    join(projectDir, "generation.json"),
    JSON.stringify({ projectId, requirement, projectName: project.projectName, summary: project.summary }, null, 2),
  );
  return projectDir;
}

export async function hydrateProjectDirectoryAt(
  root: string,
  state: ProjectState,
  project: GeneratedProject,
) {
  if (!PROJECT_ID.test(state.projectId)) throw new Error("项目 ID 格式无效。");
  if (state.currentVersion < 1) throw new Error("项目没有可恢复的成功版本。");
  validateProject(project);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const actualRoot = await realpath(root);
  const candidate = join(actualRoot, state.projectId);
  await mkdir(candidate, { recursive: true, mode: 0o700 });
  const projectDir = await realpath(candidate);
  if (!projectDir.startsWith(`${actualRoot}/`)) throw new Error("项目恢复目录越界。");
  await chmod(projectDir, 0o700);

  for (const [path, content] of Object.entries(FIXED_FILES)) {
    await writePrivateFile(join(projectDir, path), content);
  }
  await writeGeneratedFiles(projectDir, project);
  await saveProjectState(projectDir, state);
  await snapshotProjectVersion(projectDir, state.currentVersion, project);
  return projectDir;
}

export function hydrateProjectDirectory(
  state: ProjectState,
  project: GeneratedProject,
) {
  return hydrateProjectDirectoryAt(GENERATED_ROOT, state, project);
}

export async function writeGeneratedFiles(projectDir: string, project: GeneratedProject) {
  validateProject(project);
  await rm(join(projectDir, "src", "components"), { recursive: true, force: true });
  await rm(join(projectDir, "src", "data"), { recursive: true, force: true });
  await rm(join(projectDir, "src", "types.ts"), { force: true });
  for (const file of project.files) {
    await writePrivateFile(safeSourcePath(projectDir, file.path), file.content);
  }
}

export function mergeProjectPatch(current: GeneratedProject, patch: ProjectPatch) {
  if (!patch.summary.trim()) throw new Error("增量补丁必须包含本轮修改摘要。");
  if (patch.files.length > MAX_FILES || patch.deletedFiles.length > MAX_FILES) {
    throw new Error("增量补丁涉及的文件数量超过限制。");
  }

  const nextFiles = new Map(current.files.map((file) => [file.path, file.content]));
  const submitted = new Set<string>();
  const changedFiles: string[] = [];
  for (const file of patch.files) {
    if (!file || typeof file.path !== "string" || typeof file.content !== "string") {
      throw new Error("模型返回了无效的增量文件对象。");
    }
    if (submitted.has(file.path)) throw new Error(`增量补丁包含重复文件：${file.path}`);
    submitted.add(file.path);
    if (nextFiles.get(file.path) !== file.content) {
      nextFiles.set(file.path, file.content);
      changedFiles.push(file.path);
    }
  }

  const deletedFiles: string[] = [];
  for (const path of patch.deletedFiles) {
    if (!SOURCE_PATH.test(path) || path === "src/App.tsx" || path === "src/styles.css") {
      throw new Error(`增量补丁试图删除受保护或非法文件：${path}`);
    }
    if (submitted.has(path)) throw new Error(`同一增量补丁不能同时修改和删除：${path}`);
    if (nextFiles.delete(path)) deletedFiles.push(path);
  }
  if (!changedFiles.length && !deletedFiles.length) {
    throw new Error("模型没有返回任何实际文件变化。");
  }

  const project: GeneratedProject = {
    projectName: patch.projectName?.trim() || current.projectName,
    summary: patch.summary.trim(),
    files: [...nextFiles.entries()]
      .map(([path, content]) => ({ path, content }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };
  validateProject(project);
  return { project, changedFiles, deletedFiles };
}

export async function writeProjectPatch(
  projectDir: string,
  project: GeneratedProject,
  changedFiles: string[],
  deletedFiles: string[],
) {
  validateProject(project);
  const byPath = new Map(project.files.map((file) => [file.path, file.content]));
  for (const path of changedFiles) {
    const content = byPath.get(path);
    if (content === undefined) throw new Error(`增量写入缺少文件内容：${path}`);
    await writePrivateFile(safeSourcePath(projectDir, path), content);
  }
  for (const path of deletedFiles) {
    await rm(safeSourcePath(projectDir, path), { force: true });
  }
}

async function collectSourceFiles(projectDir: string, relativeDir: string, files: GeneratedFile[]) {
  const absoluteDir = join(projectDir, relativeDir);
  let entries;
  try {
    entries = await readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`项目源码中不允许符号链接：${relativeDir}/${entry.name}`);
    const relativePath = posix.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      await collectSourceFiles(projectDir, relativePath, files);
    } else if (entry.isFile() && SOURCE_PATH.test(relativePath)) {
      files.push({ path: relativePath, content: await readFile(join(projectDir, relativePath), "utf8") });
    }
  }
}

export async function resolveProjectDirectory(projectId: string) {
  if (!PROJECT_ID.test(projectId)) throw new Error("项目 ID 格式无效。");
  const projectDir = resolve(GENERATED_ROOT, projectId);
  if (!projectDir.startsWith(`${resolve(GENERATED_ROOT)}/`)) throw new Error("项目目录越界。");
  await access(projectDir, fsConstants.R_OK | fsConstants.W_OK);
  const actual = await realpath(projectDir);
  if (!actual.startsWith(`${resolve(GENERATED_ROOT)}/`)) throw new Error("项目目录指向了生成目录之外。");
  return actual;
}

export async function loadProjectState(projectDir: string) {
  const raw = await readFile(join(projectDir, "project-state.json"), "utf8");
  const state = JSON.parse(raw) as ProjectState;
  if (!state.projectId || !state.projectName || !Array.isArray(state.messages) || !Array.isArray(state.turns)) {
    throw new Error("项目状态文件损坏或不完整。");
  }
  return state;
}

export async function saveProjectState(projectDir: string, state: ProjectState) {
  await writePrivateFile(join(projectDir, "project-state.json"), JSON.stringify(state, null, 2));
}

export async function loadGeneratedProject(projectDir: string, state: ProjectState) {
  const files: GeneratedFile[] = [];
  await collectSourceFiles(projectDir, "src", files);
  const project = {
    projectName: state.projectName,
    summary: state.summary,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };
  validateProject(project);
  return project;
}

export async function snapshotProjectVersion(
  projectDir: string,
  version: number,
  project: GeneratedProject,
) {
  const versionDir = join(projectDir, ".atoms", "versions", String(version));
  await rm(versionDir, { recursive: true, force: true });
  await mkdir(versionDir, { recursive: true, mode: 0o700 });
  for (const file of project.files) {
    await writePrivateFile(join(versionDir, file.path), file.content);
  }
  await writePrivateFile(
    join(versionDir, "manifest.json"),
    JSON.stringify({ version, projectName: project.projectName, summary: project.summary, files: project.files.map((file) => file.path) }, null, 2),
  );
}

export async function saveBuildLog(projectDir: string, turnId: string, attempt: number, log: string) {
  if (!PROJECT_ID.test(turnId)) throw new Error("执行轮次 ID 格式无效。");
  await writePrivateFile(
    join(projectDir, ".atoms", "runs", turnId, `build-attempt-${attempt}.log`),
    log.slice(-24_000),
  );
}

