export async function cleanupCloudFixture(operations: {
  listProjects: () => Promise<string[]>;
  removeArtifacts: (id: string) => Promise<void>;
  removeProject: (id: string) => Promise<void>;
  removeAccount: () => Promise<void>;
}, knownProjectIds: string[]) {
  const failures: unknown[] = [];
  const ids = new Set(knownProjectIds);
  try { (await operations.listProjects()).forEach(id => ids.add(id)); }
  catch (error) { failures.push(error); }
  for (const id of ids) {
    try { await operations.removeArtifacts(id); } catch (error) { failures.push(error); }
    try { await operations.removeProject(id); } catch (error) { failures.push(error); }
  }
  try { await operations.removeAccount(); } catch (error) { failures.push(error); }
  return failures;
}
