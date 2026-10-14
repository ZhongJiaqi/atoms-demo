import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { restrictThumbnailBrowser } from "../../lib/preview/thumbnail-browser";

test("项目主页截图在未登录时拒绝读取", async ({ request }) => {
  const response = await request.get("/api/projects/123e4567-e89b-42d3-a456-426614174000/thumbnail?version=1");
  expect(response.status()).toBe(401);
});

test("截图上下文阻断异源HTTP、所有WebSocket及WebRTC", async ({ browser }) => {
  let requests = 0;
  const server = createServer((_request, response) => { requests++; response.end("blocked"); });
  server.on("upgrade", (_request, socket) => { requests++; socket.destroy(); });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const context = await browser.newContext({ serviceWorkers: "block" });
  try {
    await restrictThumbnailBrowser(context, "http://127.0.0.1:1");
    const page = await context.newPage();
    await page.goto("data:text/html,<h1>network guard</h1>");
    expect(await page.evaluate(() => typeof RTCPeerConnection)).toBe("undefined");
    await page.evaluate(async (port) => {
      await fetch(`http://127.0.0.1:${port}/private`).catch(() => undefined);
      await new Promise<void>((resolve) => {
        const Alias = globalThis["WebSocket"];
        const socket = new Alias(`ws://127.0.0.1:${port}/socket`);
        socket.onclose = socket.onerror = () => resolve();
      });
    }, port);
    expect(requests).toBe(0);
  } finally { await context.close(); await new Promise<void>((resolve) => server.close(() => resolve())); }
});
