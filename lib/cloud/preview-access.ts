import { artifactObjectPath, createSignedArtifactUrl, MAX_ARTIFACT_BYTES, validateArtifactBundle } from "./artifacts.ts";
import { createPreviewGrant, verifyPreviewGrant } from "./preview-grant.ts";
import { ensureScopedPreviewAlias } from "./preview-domain.ts";
import { renderArtifactPreview } from "./render-artifact-preview.ts";

export function versionArtifactPath(bundle: {
  project: {id: string};
  runs: {id: string; status: string; version: number | null; events: {event: string; data: Record<string, unknown>}[]}[];
}, ownerId: string, version: number): string {
  const run = bundle.runs.find(run => run.status === "completed" && run.version === version);
  if (!run) throw new Error("该版本没有对应的成功任务");
  const path = artifactObjectPath(ownerId, bundle.project.id, run.id);
  const complete = run.events.find(event => event.event === "complete");
  if (complete?.data.artifactPath !== undefined && complete.data.artifactPath !== path) throw new Error("产物路径与项目版本任务不一致");
  return path;
}

export async function createCloudPreviewLink(client: Parameters<typeof createSignedArtifactUrl>[0], projectId: string, version: number, artifactPath: string) {
  const deploymentId=process.env.VERCEL_DEPLOYMENT_ID;
  if (!deploymentId) throw new Error("缺少当前 VERCEL_DEPLOYMENT_ID，无法核验预览域名");
  const origin=await ensureScopedPreviewAlias(projectId,deploymentId);
  const signedArtifactUrl=await createSignedArtifactUrl(client,projectId,artifactPath,300);
  const grant=createPreviewGrant({projectId,version,artifactPath,signedArtifactUrl});
  const payload=verifyPreviewGrant(grant,{host:new URL(origin).hostname,projectId});
  const url=new URL(`/api/preview/${projectId}/`,origin);
  url.searchParams.set("grant",grant);
  return {previewUrl:url.toString(),previewReady:true,expiresAt:payload.expiresAt*1000};
}

export async function serveCloudPreview(request: Request, projectId: string, path: string[] = []) {
  const headers = new Headers({"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"});
  if (path.length || !["GET","HEAD"].includes(request.method)) return new Response("预览访问被拒绝",{status:403,headers});
  const url = new URL(request.url);
  let grant;
  try { grant=verifyPreviewGrant(url.searchParams.get("grant") ?? "",{host:url.hostname,projectId}); }
  catch { return new Response("预览授权无效或已过期，请重新打开项目",{status:403,headers}); }
  try {
    const response=await fetch(grant.signedArtifactUrl,{redirect:"error",signal:AbortSignal.timeout(10000)});
    if (!response.ok || !response.body) throw new Error("产物读取失败");
    const declared=Number(response.headers.get("content-length"));
    if (declared > MAX_ARTIFACT_BYTES) throw new Error("产物超限");
    const reader=response.body.getReader();
    const chunks:Uint8Array[]=[];
    let bytes=0;
    try {
      while(true){const next=await reader.read();if(next.done)break;bytes+=next.value.length;if(bytes>MAX_ARTIFACT_BYTES)throw new Error("产物超限");chunks.push(next.value);}
    } finally { await reader.cancel().catch(()=>{}); }
    const bundle=validateArtifactBundle(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const html=renderArtifactPreview(bundle);
    const appOrigin=process.env.APP_PUBLIC_ORIGIN ?? "https://atoms-demo-jiaqi.vercel.app";
    const ancestors=new Set([new URL(appOrigin).origin]);
    const deploymentHost=process.env.VERCEL_URL;
    if(deploymentHost && /^[a-z0-9.-]+\.vercel\.app$/.test(deploymentHost)) ancestors.add(`https://${deploymentHost}`);
    headers.set("Content-Type","text/html; charset=utf-8");
    headers.set("Content-Security-Policy",`default-src 'none'; script-src data:; style-src data: 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; media-src data: blob:; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors ${[...ancestors].join(" ")}`);
    return new Response(request.method === "HEAD" ? null : html,{headers});
  } catch { return new Response("云端预览产物暂不可用，请重新打开项目",{status:502,headers}); }
}
