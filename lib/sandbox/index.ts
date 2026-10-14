import { lstat, open, readdir } from "node:fs/promises";
import { constants } from "node:fs";
import { extname, join } from "node:path";
import { validateArtifactBundle, MAX_ARTIFACT_BYTES, type ArtifactBundle } from "../cloud/artifacts.ts";

const mime: Record<string, string> = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2" };

export async function collectArtifactBundle(projectDir: string): Promise<ArtifactBundle> {
  const files: ArtifactBundle["files"] = [];
  let bytes = 0;
  let directories = 0;
  async function walk(relative: string) {
    const directory = join(projectDir, "dist", relative);
    const info = await lstat(directory);
    if (info.isSymbolicLink()) throw new Error("构建产物不允许软链接");
    if (!info.isDirectory() || ++directories > 512) throw new Error("构建产物目录无效或超限");
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error("构建产物不允许软链接");
      if (entry.isDirectory()) { await walk(path); continue; }
      if (!entry.isFile() || files.length >= 256) throw new Error("构建产物文件无效或超限");
      const handle = await open(join(directory, entry.name), constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const size = (await handle.stat()).size;
        if ((bytes += size) > MAX_ARTIFACT_BYTES) throw new Error("构建产物超限");
        const content = await handle.readFile();
        if (content.length !== size) throw new Error("构建产物读取时发生变化");
        files.push({ path, content: content.toString("base64"), contentType: mime[extname(path)] ?? "application/octet-stream" });
      } finally { await handle.close(); }
    }
  }
  await walk("");
  if (!files.some(file => file.path === "index.html")) throw new Error("构建产物缺少 index.html");
  return validateArtifactBundle({ files: files.sort((a, b) => a.path.localeCompare(b.path)) });
}
