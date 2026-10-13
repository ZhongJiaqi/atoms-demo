begin;

create table public.projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  summary text not null default '',
  current_version integer not null default 0 check (current_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.messages (
  id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  turn_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sequence bigint not null check (sequence >= 0),
  created_at timestamptz not null,
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  unique (project_id, sequence)
);

create table public.project_files (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  owner_id uuid not null,
  path text not null check (path ~ '^src/'),
  content text not null,
  version integer not null check (version > 0),
  updated_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  unique (project_id, path)
);

create table public.project_versions (
  id bigint generated always as identity primary key,
  project_id uuid not null,
  owner_id uuid not null,
  version integer not null check (version > 0),
  name text not null,
  summary text not null,
  files jsonb not null check (jsonb_typeof(files) = 'array'),
  created_at timestamptz not null default now(),
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade,
  unique (project_id, version)
);

create table public.agent_runs (
  id uuid primary key,
  project_id uuid not null,
  owner_id uuid not null,
  mode text not null check (mode in ('create', 'modify')),
  requirement text not null,
  status text not null check (status in ('running', 'completed', 'failed')),
  model text,
  summary text,
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array'),
  changed_files text[],
  deleted_files text[],
  build_attempts integer,
  version integer,
  error text,
  started_at timestamptz not null,
  completed_at timestamptz,
  foreign key (project_id, owner_id) references public.projects(id, owner_id) on delete cascade
);

create index projects_owner_updated_idx on public.projects(owner_id, updated_at desc);
create index messages_owner_project_idx on public.messages(owner_id, project_id, sequence);
create index project_files_owner_project_idx on public.project_files(owner_id, project_id);
create index project_versions_owner_project_idx on public.project_versions(owner_id, project_id, version desc);
create index agent_runs_owner_project_idx on public.agent_runs(owner_id, project_id, started_at);

alter table public.projects enable row level security;
alter table public.messages enable row level security;
alter table public.project_files enable row level security;
alter table public.project_versions enable row level security;
alter table public.agent_runs enable row level security;

revoke all on table public.projects, public.messages, public.project_files, public.project_versions, public.agent_runs from anon, authenticated;
grant select, insert, update, delete on table public.projects, public.messages, public.project_files, public.project_versions, public.agent_runs to authenticated;
revoke all on sequence public.project_files_id_seq, public.project_versions_id_seq from anon, authenticated;
grant usage, select on sequence public.project_files_id_seq, public.project_versions_id_seq to authenticated;

create policy "owners manage projects" on public.projects
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners manage messages" on public.messages
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners manage project files" on public.project_files
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners manage project versions" on public.project_versions
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owners manage agent runs" on public.agent_runs
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create or replace function public.save_project_version(
  p_project_id uuid,
  p_expected_version integer,
  p_project_name text,
  p_summary text,
  p_messages jsonb,
  p_files jsonb,
  p_run jsonb
) returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_current_version integer;
  v_next_version integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select current_version
    into v_current_version
    from public.projects
   where id = p_project_id
     and owner_id = (select auth.uid())
   for update;

  if not found then
    raise exception 'project not found' using errcode = 'P0002';
  end if;
  if v_current_version <> p_expected_version then
    raise exception 'project version conflict' using errcode = '40001';
  end if;

  v_next_version := v_current_version + 1;

  insert into public.messages (id, project_id, owner_id, turn_id, role, content, sequence, created_at)
  select message.id, p_project_id, v_owner_id, message.turn_id, message.role, message.content, message.sequence, message.created_at
    from jsonb_to_recordset(p_messages) as message(
      id uuid,
      turn_id uuid,
      role text,
      content text,
      sequence bigint,
      created_at timestamptz
    )
  on conflict (project_id, sequence) do nothing;

  delete from public.project_files
   where project_id = p_project_id
     and owner_id = v_owner_id
     and path not in (select file.path from jsonb_to_recordset(p_files) as file(path text, content text));

  insert into public.project_files (project_id, owner_id, path, content, version, updated_at)
  select p_project_id, v_owner_id, file.path, file.content, v_next_version, now()
    from jsonb_to_recordset(p_files) as file(path text, content text)
  on conflict (project_id, path) do update
    set content = excluded.content,
        version = excluded.version,
        updated_at = excluded.updated_at;

  insert into public.project_versions (project_id, owner_id, version, name, summary, files)
  values (p_project_id, v_owner_id, v_next_version, p_project_name, p_summary, p_files);

  insert into public.agent_runs (
    id, project_id, owner_id, mode, requirement, status, model, summary, events,
    changed_files, deleted_files, build_attempts, version, error, started_at, completed_at
  ) values (
    (p_run->>'id')::uuid,
    p_project_id,
    v_owner_id,
    p_run->>'mode',
    p_run->>'requirement',
    p_run->>'status',
    p_run->>'model',
    p_run->>'summary',
    coalesce(p_run->'events', '[]'::jsonb),
    array(select jsonb_array_elements_text(coalesce(p_run->'changedFiles', '[]'::jsonb))),
    array(select jsonb_array_elements_text(coalesce(p_run->'deletedFiles', '[]'::jsonb))),
    (p_run->>'buildAttempts')::integer,
    v_next_version,
    p_run->>'error',
    (p_run->>'startedAt')::timestamptz,
    (p_run->>'completedAt')::timestamptz
  );

  update public.projects
     set name = p_project_name,
         summary = p_summary,
         current_version = v_next_version,
         updated_at = now()
   where id = p_project_id
     and owner_id = v_owner_id;

  return v_next_version;
end;
$$;

revoke all on function public.save_project_version(uuid, integer, text, text, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_project_version(uuid, integer, text, text, jsonb, jsonb, jsonb) to authenticated;

commit;
