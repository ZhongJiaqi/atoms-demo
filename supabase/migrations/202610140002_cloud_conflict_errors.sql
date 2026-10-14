-- 向前修复：业务冲突返回 HTTP 409，避免 PostgREST 对 40001 无限重试。
-- 保留已部署迁移、租约行锁和既有本地保存 RPC；回退应用即可停用云路径。
begin;

create or replace function public.assert_project_lease(p_project_id uuid, p_token uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_lease public.project_leases%rowtype;
begin
  if v_owner is null then raise exception '请先登录' using errcode = '42501'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = v_owner for update;
  if not found then raise exception '项目不存在或无权限' using errcode = '42501'; end if;
  select * into v_lease from public.project_leases
    where project_id = p_project_id and owner_id = v_owner for update;
  if not found or p_token is null or v_lease.token <> p_token or v_lease.expires_at <= clock_timestamp() then
    raise exception '项目租约已失效，拒绝保存' using errcode = 'PT409';
  end if;
end;
$$;

create or replace function public.save_cloud_project_version(
  p_project_id uuid,
  p_lease_token uuid,
  p_expected_version integer,
  p_project_name text,
  p_summary text,
  p_messages jsonb,
  p_files jsonb,
  p_run jsonb
) returns integer language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception '请先登录' using errcode = '42501'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = auth.uid() for update;
  if not found then raise exception '项目不存在或无权限' using errcode = '42501'; end if;
  perform public.assert_project_lease(p_project_id, p_lease_token);
  return public.save_project_version(p_project_id, p_expected_version, p_project_name, p_summary, p_messages, p_files, p_run);
exception when serialization_failure then
  -- 本地 RPC 的版本冲突仍为 40001；只在云调用边界转换，保留原消息。
  raise exception using errcode = 'PT409', message = sqlerrm;
end;
$$;

revoke all on function public.assert_project_lease(uuid, uuid), public.save_cloud_project_version(uuid, uuid, integer, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.assert_project_lease(uuid, uuid), public.save_cloud_project_version(uuid, uuid, integer, text, text, jsonb, jsonb, jsonb) to authenticated;
commit;
