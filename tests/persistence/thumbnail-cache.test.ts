import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trimThumbnailCache } from "../../lib/preview/thumbnail-cache.ts";

test("封面缓存按字节上限清理最旧PNG，不碰其他文件", async () => {
  const root = await mkdtemp(join(tmpdir(), "atoms-cover-cache-"));
  const prefix = "123e4567-e89b-42d3-a456-426614174000";
  try {
    for (const version of [1, 2, 3]) {
      const file = join(root, `${prefix}-${version}.png`);
      await writeFile(file, "1234"); await utimes(file, version, version);
    }
    await writeFile(join(root, "unrelated.txt"), "do not remove");
    await trimThumbnailCache(root, 8);
    assert.deepEqual((await readdir(root)).sort(), [`${prefix}-2.png`, `${prefix}-3.png`, "unrelated.txt"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
