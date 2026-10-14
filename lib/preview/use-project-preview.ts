"use client";

import { useEffect, useRef, useState } from "react";

type Input = { projectId?: string; version?: number; paused: boolean; onResumed: (url: string) => void; onVersionChanged: (projectId: string) => Promise<boolean | undefined> };
type PreviewState = { key: string; status: "checking" | "ready" | "restoring" | "error"; error: string };

export function useProjectPreview(input: Input) {
  const latest = useRef(input); latest.current = input;
  const alive = useRef(true);
  const busy = useRef(false);
  const expiryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [state, setState] = useState<PreviewState>({ key: "", status: "checking", error: "" });
  const [refreshKey, setRefreshKey] = useState(0);
  const key = `${input.projectId || ""}:${input.version || 0}`;

  async function refresh(reload = false) {
    const target = latest.current;
    if (!target.projectId || target.paused || busy.current || !alive.current || document.hidden) return;
    busy.current = true;
    const targetKey = `${target.projectId}:${target.version}`;
    const applicable = () => alive.current && !latest.current.paused && `${latest.current.projectId}:${latest.current.version}` === targetKey;
    try {
      const response = await fetch(`/api/projects/${target.projectId}/preview-status`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
      if (response.status === 401) { window.location.assign(`/login?next=${encodeURIComponent(location.pathname + location.search)}`); return; }
      const status = await response.json() as { active: boolean; expiresAt: number | null; currentVersion: number; error?: string };
      if (!response.ok) throw new Error(status.error || "无法检查预览状态，请重试。");
      if (!applicable()) return;
      if (status.currentVersion !== target.version) {
        setState({ key: targetKey, status: "restoring", error: "" });
        if (!await latest.current.onVersionChanged(target.projectId)) throw new Error("最新版本同步失败，请重试预览。");
        return;
      }
      let expiresAt = status.expiresAt;
      if (!status.active) {
        setState({ key: targetKey, status: "restoring", error: "" });
        const resumed = await fetch(`/api/projects/${target.projectId}/resume`, { method: "POST", cache: "no-store", signal: AbortSignal.timeout(75000) });
        const data = await resumed.json() as { projectId: string; currentVersion: number; previewUrl: string; expiresAt?: number | null; error?: string };
        if (!resumed.ok) throw new Error(data.error || "预览恢复失败，请重试。");
        if (!applicable()) return;
        if (data.projectId !== target.projectId || !data.previewUrl) throw new Error("项目恢复返回了无效结果，请重试。");
        if (data.currentVersion !== target.version) {
          if (!await latest.current.onVersionChanged(target.projectId)) throw new Error("最新版本同步失败，请重试预览。");
          return;
        }
        latest.current.onResumed(data.previewUrl);
        reload = true;
        expiresAt = data.expiresAt ?? null;
      }
      if (!applicable()) return;
      setState({ key: targetKey, status: "ready", error: "" });
      if (reload) setRefreshKey((value) => value + 1);
      clearTimeout(expiryTimer.current);
      if (expiresAt) expiryTimer.current = setTimeout(() => { void refresh(); }, Math.max(1000, expiresAt - Date.now() + 100));
    } catch (error) {
      if (applicable()) setState({ key: targetKey, status: "error", error: error instanceof Error ? error.message : "预览恢复失败，请重试。" });
    } finally {
      busy.current = false;
      if (alive.current && latest.current.projectId && `${latest.current.projectId}:${latest.current.version}` !== targetKey) void refresh();
    }
  }

  useEffect(() => {
    alive.current = true;
    if (!input.projectId || input.paused) return;
    void refresh();
    const checkVisible = () => { if (!document.hidden) void refresh(); };
    const interval = setInterval(checkVisible, 30000);
    window.addEventListener("focus", checkVisible);
    document.addEventListener("visibilitychange", checkVisible);
    return () => {
      clearInterval(interval); clearTimeout(expiryTimer.current);
      window.removeEventListener("focus", checkVisible); document.removeEventListener("visibilitychange", checkVisible);
    };
    // Only project/version/task transitions trigger the lifecycle; handlers read the latest input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input.projectId, input.version, input.paused]);

  useEffect(() => () => { alive.current = false; clearTimeout(expiryTimer.current); }, []);
  return { status: state.key === key ? state.status : "checking" as const, error: state.key === key ? state.error : "", refreshKey, refresh };
}
