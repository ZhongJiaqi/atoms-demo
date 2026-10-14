import assert from "node:assert/strict";
import test from "node:test";
import { renderArtifactPreview } from "../../lib/cloud/render-artifact-preview.ts";
const file = (path: string, content: string, contentType: string) => ({ path, content: Buffer.from(content).toString("base64"), contentType });
test("私有产物渲染为独立HTML，JS和CSS不再请求共享资源路径", () => {
  const html = renderArtifactPreview({ files: [file("index.html", '<html><head><link rel="stylesheet" href="/assets/app.css"></head><body><script type="module" src="/assets/app.js"></script></body></html>', "text/html"), file("assets/app.js", 'console.log("</script>")', "text/javascript"), file("assets/app.css", 'body{background:url("./dot.svg")}', "text/css"), file("assets/dot.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>', "image/svg+xml")] });
  assert.match(html, /src="data:text\/javascript;base64,/);
  assert.match(html, /href="data:text\/css;base64,/);
  assert.ok(!html.includes('src="/assets/'));
  assert.ok(!html.includes('console.log("</script>")'));
  const css = Buffer.from(html.match(/href="data:text\/css;base64,([^"]+)"/)![1], "base64").toString();
  assert.match(css, /data:image\/svg\+xml;base64,/);
});
test("渲染拒绝丢失资源、外部依赖及CSS循环，不偷偷返回失效页面", () => {
  for (const src of ["/missing.js", "https://example.com/app.js", "//example.com/app.js"]) {
    assert.throws(() => renderArtifactPreview({ files: [file("index.html", `<script src="${src}"></script>`, "text/html")] }));
  }
  assert.throws(() => renderArtifactPreview({ files: [file("index.html", '<link rel="stylesheet" href="/loop.css">', "text/html"), file("loop.css", 'body{background:url("./loop.css")}', "text/css")] }));
  assert.throws(() => renderArtifactPreview({ files: [file("index.html", '<link rel="stylesheet" href="/app.css">', "text/html"), file("app.css", '@import "https://example.com/style.css";', "text/css")] }));
});
