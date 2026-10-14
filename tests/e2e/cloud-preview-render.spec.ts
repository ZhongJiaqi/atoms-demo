import { expect, test } from "@playwright/test";
import { renderArtifactPreview } from "../../lib/cloud/render-artifact-preview";

// 明确的浏览器渲染契约样本，不冒充真实模型或线上域名验收。
test("云产物内嵌资源在独立iframe真实交互、刷新持久化且项目间隔离", async ({ page }) => {
  const errors: string[] = [], failures: number[] = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) failures.push(r.status()); });
  const file = (path: string, content: string, contentType: string) => ({ path, content: Buffer.from(content).toString("base64"), contentType });
  const html = renderArtifactPreview({ files: [
    file("index.html", '<html><head><meta charset="UTF-8"><link rel="stylesheet" href="/assets/app.css"></head><body><button id="count"></button><script type="module" crossorigin src="/assets/app.js"></script></body></html>', "text/html"),
    file("assets/app.js", 'let count=Number(localStorage.getItem("count")||0); const b=document.getElementById("count");const show=()=>b.textContent="次数 "+count;show();b.onclick=()=>{localStorage.setItem("count",String(++count));show();};', "text/javascript"),
    file("assets/app.css", 'button{background:rgb(49,94,251);color:white;padding:16px}', "text/css"),
  ] });
  await page.route("http://parent.localhost:3010/", r => r.fulfill({ contentType: "text/html; charset=utf-8", body: '<iframe sandbox="allow-scripts allow-same-origin" src="http://app-one.localhost:3010/preview"></iframe>' }));
  await page.route("**/preview", r => r.fulfill({ contentType: "text/html; charset=utf-8", headers: { "Content-Security-Policy": "default-src 'none'; script-src data:; style-src data: 'unsafe-inline'; connect-src 'none'; frame-ancestors http://parent.localhost:3010" }, body: html }));
  await page.goto("http://parent.localhost:3010/");
  const button = page.frameLocator("iframe").getByRole("button");
  await expect(button).toHaveText("次数 0");
  expect(await button.evaluate(el => getComputedStyle(el).backgroundColor)).toBe("rgb(49, 94, 251)");
  await button.click();
  await expect(button).toHaveText("次数 1");
  await button.evaluate(() => location.reload());
  await expect(button).toHaveText("次数 1");
  await page.locator("iframe").evaluate(el => (el as HTMLIFrameElement).src = "http://app-two.localhost:3010/preview");
  await expect(button).toHaveText("次数 0");
  await page.locator("iframe").evaluate(el => (el as HTMLIFrameElement).src = "http://app-one.localhost:3010/preview");
  await expect(button).toHaveText("次数 1");
  expect(errors).toEqual([]); expect(failures).toEqual([]);
});
