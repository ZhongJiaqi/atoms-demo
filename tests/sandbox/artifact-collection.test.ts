import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("上传产物保留index和相对资源的字节与MIME，并拒绝符号链接", async () => {
  const module = await import("../../lib/sandbox/index.ts");
  assert.equal(typeof module.collectArtifactBundle, "function", "缺少云构建产物收集入口");
  const root = await mkdtemp(join(tmpdir(), "atoms-collect-"));
  try {
    await mkdir(join(root, "dist/assets"), { recursive: true });
    await writeFile(join(root, "dist/index.html"), '<script src="./assets/app.js"></script>');
    await writeFile(join(root, "dist/assets/app.js"), "console.log('中文')");
    const bundle = await module.collectArtifactBundle(root);
    assert.deepEqual(bundle.files, [
      { path: "assets/app.js", content: "Y29uc29sZS5sb2coJ+S4reaWhycp", contentType: "text/javascript" },
      { path: "index.html", content: "PHNjcmlwdCBzcmM9Ii4vYXNzZXRzL2FwcC5qcyI+PC9zY3JpcHQ+", contentType: "text/html" },
    ]);
    await symlink(join(root, "dist/index.html"), join(root, "dist/leak.html"));
    await assert.rejects(module.collectArtifactBundle(root), /软链接/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
