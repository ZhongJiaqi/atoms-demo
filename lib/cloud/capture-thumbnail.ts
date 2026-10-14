import { Sandbox } from "@vercel/sandbox";
import { renderArtifactPreview } from "./render-artifact-preview.ts";
import type { ArtifactBundle } from "./artifacts.ts";

const ROOT = "/vercel/sandbox";
const DEADLINE = 120_000;
const PNG_LIMIT = 1024 * 1024;
// Trusted screenshot driver only. Generated JavaScript runs in Chromium, not Node.
const DRIVER = `import fs from 'node:fs/promises';import http from 'node:http';import {chromium} from 'playwright';
const html=await fs.readFile('/vercel/sandbox/page.html');
const csp="default-src 'none';script-src data: 'unsafe-inline';style-src data: 'unsafe-inline';img-src data:;font-src data:;connect-src 'none';frame-src 'none';object-src 'none';base-uri 'none';form-action 'none'";
const server=http.createServer((request,response)=>{if(request.method!=='GET'||request.url!=='/'){response.writeHead(404).end();return;}response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':csp});response.end(html);});
let browser;try{
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const origin='http://127.0.0.1:'+server.address().port;
browser=await chromium.launch({headless:true,timeout:10000,args:['--renderer-process-limit=2','--disable-background-networking','--force-webrtc-ip-handling-policy=disable_non_proxied_udp']});
const context=await browser.newContext({viewport:{width:960,height:600},deviceScaleFactor:1,locale:'zh-CN',reducedMotion:'reduce',serviceWorkers:'block'});
await context.route('**/*',route=>route.request().method()==='GET'&&route.request().url()===origin+'/'?route.continue():route.abort());
await context.routeWebSocket('**/*',socket=>socket.close());
await context.addInitScript(()=>{for(const name of ['RTCPeerConnection','webkitRTCPeerConnection'])Object.defineProperty(globalThis,name,{value:undefined,configurable:false,writable:false});});
const page=await context.newPage();let failed=false;page.on('pageerror',()=>{failed=true;});page.on('console',message=>{if(message.type()==='error')failed=true;});
await page.goto(origin+'/',{waitUntil:'networkidle',timeout:10000});
await page.waitForFunction(()=>Boolean(document.querySelector('#root')?.children.length||document.querySelector('#root')?.textContent?.trim()),undefined,{timeout:5000});
await page.evaluate(()=>document.fonts.ready);
if(failed)throw Error('应用页面执行异常');
const png=await page.screenshot({type:'png',animations:'disabled',timeout:5000});
if(png.length>1048576)throw Error('PNG超限');await fs.writeFile('/vercel/sandbox/thumbnail.png',png,{mode:0o600});
}finally{try{await browser?.close();}finally{server.close();}}`;

export async function captureCloudThumbnail(artifact: ArtifactBundle, options: { timeoutMs?: number } = {}): Promise<Buffer> {
  const deadline = options.timeoutMs ?? DEADLINE;
  if (!Number.isSafeInteger(deadline) || deadline < 1000 || deadline > DEADLINE) throw Error("封面执行预算无效。");
  const html = renderArtifactPreview(artifact);
  const signal = AbortSignal.timeout(deadline);
  const started = Date.now();
  let sandbox: Sandbox | undefined;
  let phase = "准备";
  try {
    // No generated content exists in this VM while trusted dependencies install.
    sandbox = await Sandbox.create({ image: "vercel/sandbox/node:24", resources: { vcpus: 1 },
      persistent: false, timeout: deadline, networkPolicy: "allow-all", signal });
    await sandbox.writeFiles([
      { path: `${ROOT}/package.json`, content: Buffer.from(JSON.stringify({ private: true, type: "module", dependencies: { playwright: "1.64.0" } })) },
      { path: `${ROOT}/capture.mjs`, content: Buffer.from(DRIVER) },
    ], { signal });
    async function run(cmd: string, args: string[], sudo = false) {
      const running = await sandbox!.runCommand({ cmd, args, cwd: ROOT, sudo, detached: true, signal,
        timeoutMs: Math.max(1, deadline - (Date.now() - started)),
        env: { PLAYWRIGHT_BROWSERS_PATH: `${ROOT}/.browsers` } });
      // Drain, never retain or expose setup/browser output or application contents.
      for await (const _log of running.logs({ signal })) { /* bounded by VM deadline */ }
      if ((await running.wait({ signal })).exitCode !== 0) throw Error("截图命令未成功");
    }
    phase = "安装";
    await run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--registry=https://registry.npmjs.org"]);
    phase = "浏览器";
    await run("node", ["node_modules/playwright/cli.js", "install", "--with-deps", "--only-shell", "chromium"], true);
    await sandbox.update({ networkPolicy: "deny-all" }, { signal });
    await sandbox.writeFiles([{ path: `${ROOT}/page.html`, content: Buffer.from(html) }], { signal });
    phase = "截图";
    await run("node", ["capture.mjs"]);
    phase = "PNG读取";
    const stream = await sandbox.readFile({ path: `${ROOT}/thumbnail.png` }, { signal });
    if (!stream) throw Error("PNG不存在");
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.from(chunk);
      if ((bytes += buffer.length) > PNG_LIMIT) throw Error("PNG超限");
      chunks.push(buffer);
    }
    const png = Buffer.concat(chunks);
    if (png.length < 33 || !png.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
        png.toString("ascii", 12, 16) !== "IHDR" || png.readUInt32BE(16) !== 960 || png.readUInt32BE(20) !== 600) throw Error("PNG格式无效");
    return png;
  } catch {
    throw Error(signal.aborted ? "云端封面生成超时，请稍后重试。" : `云端封面${phase}失败，未保存截图。`);
  } finally {
    if (sandbox) {
      try { await sandbox.stop({ signal: AbortSignal.timeout(10_000) }); }
      catch { throw Error("封面沙盒停止失败，等待硬时限回收。请稍后重试。"); }
    }
  }
}
