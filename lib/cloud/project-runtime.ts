import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hydrateProjectDirectoryAt } from "../agent/files.ts";
import { confirmRestoredVersion, loadPersistedProject, loadProjectVersion, persistedBundleToRuntime, projectSnapshotFromState, requireAuthenticatedUser, type ProjectStoreClient } from "../persistence/project-store.ts";
import { restoreProjectVersion } from "../persistence/restore-version.ts";
import { buildInVercelSandbox } from "../sandbox/vercel-build.ts";
import { collectArtifactBundle } from "../sandbox/index.ts";
import { readArtifact, uploadArtifact } from "./artifacts.ts";
import { saveCloudProjectSnapshot, withProjectLease } from "./project-lease.ts";
import { createCloudPreviewLink, versionArtifactPath } from "./preview-access.ts";

export async function resumeCloudProject(client: SupabaseClient, projectId: string) {
  const store=client as unknown as ProjectStoreClient;
  const owner=await requireAuthenticatedUser(store);
  const restored=await withProjectLease(store,projectId,async(_lease,signal)=>{
    const bundle=await loadPersistedProject(store,projectId);
    const runtime=persistedBundleToRuntime(bundle);
    const version=runtime.state.currentVersion;
    if(version<1)throw new Error("项目尚无可恢复的成功版本");
    const artifactPath=versionArtifactPath(bundle,owner.id,version);
    try{await readArtifact(client,projectId,artifactPath);}
    catch(error){
      if(!(error instanceof Error) || !/产物读取失败：(?:Object not found|Not Found)/i.test(error.message))throw error;
      const project=await loadProjectVersion(store,projectId,version);
      const root=await realpath(await mkdtemp(join(tmpdir(),"atoms-cloud-resume-")));
      try{
        const directory=await hydrateProjectDirectoryAt(root,runtime.state,project);
        signal.throwIfAborted();
        const result=await buildInVercelSandbox(directory);
        signal.throwIfAborted();
        if(!result.success)throw new Error(`云端源码恢复构建失败：${result.stderr || result.stdout}`.slice(-4000));
        const run=bundle.runs.find(run=>run.status==="completed" && run.version===version)!;
        await uploadArtifact(client,projectId,run.id,await collectArtifactBundle(directory));
        signal.throwIfAborted();
      }finally{await rm(root,{recursive:true,force:true});}
    }
    return {...runtime,artifactPath};
  });
  try{return {...restored,...await createCloudPreviewLink(client,projectId,restored.state.currentVersion,restored.artifactPath)};}
  catch(error){return {...restored,previewReady:false,previewError:error instanceof Error ? error.message : "云端预览配置不可用",expiresAt:null};}
}

export async function restoreCloudProject(client: SupabaseClient, projectId: string, targetVersion: number, expectedVersion: number) {
  const store=client as unknown as ProjectStoreClient;
  const restored=await withProjectLease(store,projectId,async(lease,signal)=>{
    const {state}=persistedBundleToRuntime(await loadPersistedProject(store,projectId));
    const project=await loadProjectVersion(store,projectId,targetVersion);
    let root:string|undefined;
    let artifactPath="";
    try{
      const result=await restoreProjectVersion({state,project,targetVersion,expectedVersion},{
        stage:async(nextState,target)=>{
          root=await realpath(await mkdtemp(join(tmpdir(),"atoms-cloud-restore-")));
          const directory=await hydrateProjectDirectoryAt(root,nextState,target);
          signal.throwIfAborted();
          const built=await buildInVercelSandbox(directory);
          signal.throwIfAborted();
          if(!built.success)throw new Error(`云端历史版本构建失败：${built.stderr || built.stdout}`.slice(-4000));
          artifactPath=await uploadArtifact(client,projectId,nextState.turns.at(-1)!.id,await collectArtifactBundle(directory));
          signal.throwIfAborted();
          return {artifactPath};
        },
        finalize:async(staging,nextState)=>{
          const complete=nextState.turns.at(-1)!.events.at(-1)!;
          complete.data={...complete.data,projectId,artifactPath:staging.artifactPath,previewReady:false};
        },
        save:async(nextState,target,turn,expected)=>{
          signal.throwIfAborted();
          return saveCloudProjectSnapshot(store,lease,projectSnapshotFromState(nextState,target,turn,expected));
        },
        isCommitted:async(turnId,version)=>{
          signal.throwIfAborted();
          return confirmRestoredVersion(store,projectId,turnId,version);
        },
        activate:async()=>{signal.throwIfAborted();},
        discard:async()=>{},
      });
      return {...result,artifactPath};
    }finally{if(root)await rm(root,{recursive:true,force:true});}
  });
  try{return {...restored,...await createCloudPreviewLink(client,projectId,restored.state.currentVersion,restored.artifactPath)};}
  catch(error){return {...restored,previewReady:false,previewError:error instanceof Error ? error.message : "云端预览配置不可用",expiresAt:null};}
}
