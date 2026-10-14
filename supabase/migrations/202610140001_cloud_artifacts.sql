-- 仅新增云产物和租约，不变更既有版本数据。回退应用即可停用，禁止删除生产产物。
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('atoms-artifacts', 'atoms-artifacts', false, 5242880, array['application/json']);

create function public.owns_artifact_path(p_name text) returns boolean
language sql stable security invoker set search_path = ''
as $$
  select auth.uid() is not null
    and p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$'
    and split_part(p_name, '/', 1) = auth.uid()::text
    and exists (select 1 from public.projects p where p.id::text = split_part(p_name, '/', 2) and p.owner_id = auth.uid());
$$;
revoke all on function public.owns_artifact_path(text) from public, anon;
grant execute on function public.owns_artifact_path(text) to authenticated;

create policy "atoms owners upload artifacts" on storage.objects for insert to authenticated
  with check (bucket_id = 'atoms-artifacts' and public.owns_artifact_path(name));
create policy "atoms owners read artifacts" on storage.objects for select to authenticated
  using (bucket_id = 'atoms-artifacts' and public.owns_artifact_path(name));
create policy "atoms owners delete artifacts" on storage.objects for delete to authenticated
  using (bucket_id = 'atoms-artifacts' and public.owns_artifact_path(name));

create table public.project_leases (
  project_id uuid primary key,
  owner_id uuid not null,
  token uuid not null,
  expires_at timestamptz not null,
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);
alter table public.project_leases enable row level security;
revoke all on table public.project_leases from public, anon, authenticated;
grant select on table public.project_leases to authenticated;
create policy "atoms owners read leases" on public.project_leases for select to authenticated using (owner_id = auth.uid());

create function public.acquire_project_lease(p_project_id uuid, p_token uuid, p_ttl_seconds integer default 900)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_rows integer;
begin
  if v_owner is null then raise exception '请先登录' using errcode = '42501'; end if;
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 1800 then raise exception '租约参数无效' using errcode = '22023'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = v_owner for update;
  if not found then raise exception '项目不存在或无权限' using errcode = '42501'; end if;
  insert into public.project_leases as lease_row (project_id, owner_id, token, expires_at)
  values (p_project_id, v_owner, p_token, clock_timestamp() + make_interval(secs => p_ttl_seconds))
  on conflict (project_id) do update set token = excluded.token, expires_at = excluded.expires_at
    where lease_row.expires_at <= clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create function public.renew_project_lease(p_project_id uuid, p_token uuid, p_ttl_seconds integer default 900)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_rows integer;
begin
  if v_owner is null then raise exception '请先登录' using errcode = '42501'; end if;
  if p_token is null or p_ttl_seconds is null or p_ttl_seconds < 300 or p_ttl_seconds > 1800 then raise exception '租约参数无效' using errcode = '22023'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = v_owner for update;
  if not found then raise exception '项目不存在或无权限' using errcode = '42501'; end if;
  update public.project_leases set expires_at = clock_timestamp() + make_interval(secs => p_ttl_seconds)
    where project_id = p_project_id and owner_id = v_owner and token = p_token and expires_at > clock_timestamp();
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

create function public.release_project_lease(p_project_id uuid, p_token uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare v_owner uuid := auth.uid(); v_rows integer;
begin
  if v_owner is null then raise exception '请先登录' using errcode = '42501'; end if;
  if p_token is null then raise exception '租约参数无效' using errcode = '22023'; end if;
  perform 1 from public.projects where id = p_project_id and owner_id = v_owner for update;
  if not found then raise exception '项目不存在或无权限' using errcode = '42501'; end if;
  delete from public.project_leases where project_id = p_project_id and owner_id = v_owner and token = p_token;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

revoke all on function public.acquire_project_lease(uuid, uuid, integer), public.renew_project_lease(uuid, uuid, integer), public.release_project_lease(uuid, uuid) from public, anon;
grant execute on function public.acquire_project_lease(uuid, uuid, integer), public.renew_project_lease(uuid, uuid, integer), public.release_project_lease(uuid, uuid) to authenticated;

-- 仅提供行锁和身份/令牌校验，避免给调用者租约表 UPDATE 权限。
create function public.assert_project_lease(p_project_id uuid, p_token uuid)
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
    raise exception '项目租约已失效，拒绝保存' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.assert_project_lease(uuid, uuid) from public, anon;
grant execute on function public.assert_project_lease(uuid, uuid) to authenticated;

create function public.save_cloud_project_version(
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
end;
$$;
revoke all on function public.save_cloud_project_version(uuid, uuid, integer, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_cloud_project_version(uuid, uuid, integer, text, text, jsonb, jsonb, jsonb) to authenticated;
commit;
