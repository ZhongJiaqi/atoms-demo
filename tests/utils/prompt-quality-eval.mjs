// Real-model comparison using deliberately short, non-technical user requirements.
import { mkdtemp, realpath, symlink, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import { expect } from '@playwright/test';
import nextEnv from '@next/env';
import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
import { generateProject } from '../../lib/agent/model.ts';
import { prepareProjectDirectory, loadGeneratedProject } from '../../lib/agent/files.ts';
import { buildProject, startPreview, stopPreview } from '../../lib/sandbox/local-sandbox.ts';

nextEnv.loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
setGlobalDispatcher(new EnvHttpProxyAgent({ noProxy: 'localhost,127.0.0.1' }));
process.env.LLM_MODEL = 'deepseek-v4.1-flash';
const label = process.argv[2];
assert(['before','after'].includes(label));
const reusedRoot=process.env.PROMPT_EVAL_REUSE_ROOT;
const root = await realpath(reusedRoot ?? await mkdtemp(join(tmpdir(), `atoms-prompt-${label}-`)));
if(!reusedRoot)await symlink(join(process.cwd(), 'node_modules'), join(root, 'node_modules'), 'dir');
const previous=reusedRoot?JSON.parse(await readFile(join(root,'results.json'),'utf8')).results:[];
const results = [];
const browser = await chromium.launch({ headless: true });
const host = createServer((req,res) => {res.setHeader('Content-Type','text/html');res.end('<!doctype html><link rel="icon" href="data:,"><body style="margin:0"><iframe style="width:100vw;height:100vh;border:0" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>');});
await new Promise(resolve => host.listen(0,'127.0.0.1',resolve));
try {
  for (const requirement of ['做一个待办事项应用','做一个个人记账应用']) {
    const regenerate=process.env.PROMPT_EVAL_REGENERATE;
    const cached=previous.find(r=>r.requirement===requirement && !(regenerate==='todo'&&requirement.includes('待办')) && !(regenerate==='expense'&&requirement.includes('记账')) && !(process.env.PROMPT_EVAL_REGENERATE_EXPENSE==='1'&&requirement.includes('记账')));
    const id = cached?.projectId??randomUUID(), result = { requirement, model: process.env.LLM_MODEL, projectId: id };
    results.push(result);
    let context;
    const started = Date.now();
    try {
      const generated = cached ? {project:await loadGeneratedProject(cached.directory,JSON.parse(await readFile(join(cached.directory,'generation.json'),'utf8')))} : await generateProject(requirement);
      result.modelMs = cached?.modelMs??Date.now() - started;
      const dir = cached?.directory??await prepareProjectDirectory(id, requirement, generated.project, root);
      result.directory = dir;
      if(!cached)await writeFile(join(dir,'eval-source.json'),JSON.stringify(generated.project),{mode:0o600});
      const built = await buildProject(dir);
      await writeFile(join(dir,'eval-build.log'),built.stdout+built.stderr);
      assert(built.success,'Generated project must pass the existing controlled build');
      result.readyMs = cached?.readyMs??Date.now() - started;
      const entry = await startPreview(id,dir);
      context = await browser.newContext({ viewport:{width:1440,height:900}, colorScheme:'light' });
      context.setDefaultTimeout(8000);
      const page = await context.newPage(), errors = [], responses = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', m => {if(m.type()==='error')errors.push(m.text());});
      page.on('response', r => {if(r.status()>=400)responses.push(r.status());});
      const hostURL=`http://127.0.0.1:${host.address().port}/`, url=`http://127.0.0.1:${entry.port}/`;
      await context.route('**/*',r=>{const u=new URL(r.request().url());return [new URL(hostURL).origin,new URL(url).origin].includes(u.origin)?r.continue():r.abort();});
      page.on('dialog',d=>d.accept());
      await page.goto(hostURL);
      await page.locator('iframe').evaluate((el,url)=>{el.src=url;},url);
      const frame=page.frameLocator('iframe');await expect(frame.locator('body')).not.toBeEmpty();
      await page.waitForLoadState('networkidle');
      await page.screenshot({path:join(dir,'desktop.png')});
      result.controls=await frame.locator('input,select,button').evaluateAll(elements=>elements.map(el=>({tag:el.tagName,text:el.textContent?.trim(),name:el.getAttribute('aria-label'),placeholder:el.getAttribute('placeholder'),type:el.getAttribute('type')})));
      result.initialText=(await frame.locator('body').innerText()).slice(0,1600);
      await page.setViewportSize({width:390,height:844});
      await page.screenshot({path:join(dir,'mobile.png')});
      await expect.poll(()=>frame.locator('body').evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
      result.mobileFits=true;
      assert.equal(errors.length,0);assert.equal(responses.length,0);
      result.consoleErrors=errors.length;result.badResponses=responses.length;
      // Failure catches omission of a useful default interaction, not prompt wording.
      if(requirement.includes('待办')) {
        const search=frame.getByRole('searchbox').or(frame.getByRole('textbox',{name:/搜索/})).or(frame.getByPlaceholder(/搜索/)).first();
        await expect(search,'Short Todo requirement should include a working search control').toBeVisible();
        await search.fill('不存在的验收任务');
        await expect(frame.locator('body')).toContainText(/没有|暂无|未找到|无匹配|空/);
        result.searchAvailable=true;
      }else{
        const amounts=[...result.initialText.matchAll(/[¥￥]\s*([-+]?\d[\d,]*(?:\.\d+)?)/g)].map(m=>Number(m[1].replaceAll(',','')));
        assert(amounts.length>=2,'Expense app must show explicit income/expense overview');
        assert(amounts.every(amount=>amount===0),'New account must not contain fabricated transactions or balances');
        result.initialAmountsZero=true;
      }
      result.passed=true;
    } catch(error) {result.passed=false;result.error=error.message.slice(0,700);}
    finally {stopPreview(id);await context?.close();console.log(JSON.stringify(result));await writeFile(join(root,'results.json'),JSON.stringify({label,root,results},null,2),{mode:0o600});}
  }
}finally {await browser.close();await new Promise(resolve=>host.close(resolve));}
console.log('RESULTS',join(root,'results.json'));
if(results.some(r=>!r.passed))process.exitCode=1;
