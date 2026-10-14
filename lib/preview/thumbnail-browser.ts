import type { BrowserContext } from "playwright";

export async function restrictThumbnailBrowser(context: BrowserContext, origin: string) {
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin && route.request().method() === "GET" ? route.continue() : route.abort());
  await context.routeWebSocket("**/*", (socket) => socket.close());
  await context.addInitScript(() => {
    for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) {
      Object.defineProperty(globalThis, name, { value: undefined, configurable: false, writable: false });
    }
  });
}
