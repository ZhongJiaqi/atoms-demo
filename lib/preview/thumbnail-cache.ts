import { lstat, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

export async function trimThumbnailCache(root: string, maxBytes: number) {
  const files = [];
  for (const name of await readdir(root)) {
    if (!/^[0-9a-f-]{36}-[1-9][0-9]*\.png$/i.test(name)) continue;
    const path = join(root, name);
    const info = await lstat(path).catch(() => null);
    if (info?.isFile()) files.push({ path, size: info.size, at: info.mtimeMs });
  }
  let total = files.reduce((sum, file) => sum + file.size, 0);
  for (const file of files.sort((a, b) => a.at - b.at)) {
    if (total <= maxBytes) break;
    await rm(file.path, { force: true });
    total -= file.size;
  }
}
