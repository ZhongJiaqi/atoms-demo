import assert from "node:assert/strict";
import test from "node:test";

test("每项目preview host只准对应UUID的根gateway，不准宿主登录API或其他项目",async()=>{
  const module=await import("../../lib/cloud/preview-host-policy.ts");
  assert.equal(typeof module.previewHostDecision,"function","缺少预览host限制");
  const id="123e4567-e89b-42d3-a456-426614174002",host=`atoms-app-${id}.vercel.app`;
  assert.equal(module.previewHostDecision(host,`/api/preview/${id}/`),"gateway");
  for(const path of ["/","/login","/api/generate","/api/preview/123e4567-e89b-42d3-a456-426614174003/",`/api/preview/${id}/assets/app.js`])assert.equal(module.previewHostDecision(host,path),"blocked");
  assert.equal(module.previewHostDecision("atoms-app-invalid.vercel.app","/"),"blocked");
  assert.equal(module.previewHostDecision("atoms-demo-jiaqi.vercel.app","/login"),"app");
});
