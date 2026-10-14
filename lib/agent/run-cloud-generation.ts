import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadArtifact } from "../cloud/artifacts.ts";
import { saveCloudProjectSnapshot, withProjectLease } from "../cloud/project-lease.ts";
import { createProjectDraft, loadPersistedProject, persistedBundleToRuntime, projectSnapshotFromState, type ProjectStoreClient } from "../persistence/project-store.ts";
import { collectArtifactBundle } from "../sandbox/index.ts";
import { buildInVercelSandbox } from "../sandbox/vercel-build.ts";
import { hydrateProjectDirectoryAt } from "./files.ts";
import { runGeneration } from "./run-generation.ts";
import type { AgentEvent } from "./types";

// Deliberately not wired into the HTTP route until the separate preview gateway is ready.
export async function runCloudGeneration(
  requirement: string,
  origin: string,
  emit: (event: AgentEvent) => void,
  client: SupabaseClient,
  existingProjectId?: string,
) {
  const store = client as unknown as ProjectStoreClient;
  const projectId = existingProjectId ?? randomUUID();
  if (!existingProjectId) await createProjectDraft(store, { projectId, name: "正在创建项目" });
  let complete: AgentEvent | undefined;
  await withProjectLease(store, projectId, async (lease, signal) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), "atoms-cloud-task-")));
    try {
      await runGeneration(requirement, origin, event => {
        signal.throwIfAborted();
        if (event.event === "complete") complete = event;
        else emit(event);
      }, {
        createDraft: async () => {},
        saveVersion: async (state, project, turn, expectedVersion) => {
          signal.throwIfAborted();
          const version = await saveCloudProjectSnapshot(store, lease, projectSnapshotFromState(state, project, turn, expectedVersion));
          if (version !== turn.version) throw new Error("云项目保存返回了不一致的版本号");
          return version;
        },
      }, existingProjectId, {
        projectId, root,
        build: async directory => {
          signal.throwIfAborted();
          const result = await buildInVercelSandbox(directory);
          signal.throwIfAborted();
          return result;
        },
        load: async id => {
          signal.throwIfAborted();
          const { state, project } = persistedBundleToRuntime(await loadPersistedProject(store, id));
          const projectDir = await hydrateProjectDirectoryAt(root, state, project);
          return { state, project, projectDir };
        },
        publish: async (id, directory, turnId) => {
          signal.throwIfAborted();
          const artifactPath = await uploadArtifact(client, id, turnId, await collectArtifactBundle(directory));
          signal.throwIfAborted();
          return { artifactPath, previewReady: false };
        },
      });
    } finally {
      // Only this mkdtemp-created task root is removed; persisted artifacts survive ambiguous RPC responses.
      await rm(root, { recursive: true, force: true });
    }
  });
  if (complete) emit(complete);
}
