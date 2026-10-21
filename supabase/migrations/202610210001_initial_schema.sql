-- GD Singh PMS initial schema
-- Apply this migration in a new Supabase project. Review with your technical administrator first.
create extension if not exists pgcrypto;

create type public.app_role as enum ('partner','manager','staff');
create type public.client_status as enum ('active','inactive');
create type public.task_status as enum ('open','in_progress','under_review','completed','cancelled');
create type public.task_priority as enum ('low','medium','high','urgent');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role public.app_role not null default 'staff',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  client_code text unique,
  name text not null,
  entity_type text not null default 'Other',
  pan text,
  tan text,
  gstin text,
  cin text,
  contact_person text,
  email text,
  phone text,
  assigned_partner uuid references public.profiles(id) on delete set null,
  status public.client_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_code text unique,
  title text not null,
  client_id uuid references public.clients(id) on delete restrict,
  category text not null default 'Other',
  frequency text not null default 'Ad hoc' check (frequency in ('Ad hoc','Monthly','Quarterly','Half-yearly','Annual')),
  due_date date not null,
  internal_due_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  priority public.task_priority not null default 'medium',
  status public.task_status not null default 'open',
  description text,
  recurrence_key text,
  period_start date,
  period_end date,
  completed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tasks_recurrence_unique on public.tasks(recurrence_key, period_start) where recurrence_key is not null and period_start is not null;
create index clients_name_idx on public.clients using btree (name);
create index clients_status_idx on public.clients (status);
create index tasks_due_status_idx on public.tasks (due_date,status);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_client_idx on public.tasks (client_id);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now()
);
create index task_comments_task_idx on public.task_comments(task_id,created_at);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id text not null,
  action text not null,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_record_idx on public.audit_logs(table_name,record_id,created_at desc);

-- Updated timestamp, client/task human-readable codes, and auth profile bootstrap.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create or replace function public.assign_client_code() returns trigger language plpgsql as $$
begin
  if new.client_code is null or trim(new.client_code) = '' then
    new.client_code := 'CL-' || upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  return new;
end; $$;

create or replace function public.assign_task_code() returns trigger language plpgsql as $$
begin
  if new.task_code is null or trim(new.task_code) = '' then
    new.task_code := 'TS-' || upper(substr(replace(new.id::text,'-',''),1,8));
  end if;
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end; $$;

create or replace function public.bootstrap_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,full_name,email,role,active)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name',''),coalesce(new.email,''),'staff',true)
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;
create trigger auth_user_profile_created after insert on auth.users for each row execute procedure public.bootstrap_profile();

create trigger clients_updated_at before update on public.clients for each row execute procedure public.set_updated_at();
create trigger clients_code before insert on public.clients for each row execute procedure public.assign_client_code();
create trigger tasks_updated_at before update on public.tasks for each row execute procedure public.set_updated_at();
create trigger tasks_code before insert or update of status on public.tasks for each row execute procedure public.assign_task_code();

create or replace function public.current_role() returns public.app_role
language sql stable security definer set search_path=public as $$
  select role from public.profiles where id = auth.uid() and active = true limit 1;
$$;
create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles where id=auth.uid() and active=true);
$$;

create or replace function public.write_audit_log() returns trigger language plpgsql security definer set search_path=public as $$
declare oldj jsonb; newj jsonb; rid text;
begin
  if tg_op='INSERT' then oldj:=null; newj:=to_jsonb(new); rid:=new.id::text;
  elsif tg_op='UPDATE' then oldj:=to_jsonb(old); newj:=to_jsonb(new); rid:=new.id::text;
  else oldj:=to_jsonb(old); newj:=null; rid:=old.id::text;
  end if;
  insert into public.audit_logs(actor_id,table_name,record_id,action,old_data,new_data)
  values(auth.uid(),tg_table_name,rid,tg_op,oldj,newj);
  return coalesce(new,old);
end; $$;
create trigger audit_clients after insert or update or delete on public.clients for each row execute procedure public.write_audit_log();
create trigger audit_tasks after insert or update or delete on public.tasks for each row execute procedure public.write_audit_log();

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles: active users can see the directory; only partners can change role/access.
create policy "profiles_select_active" on public.profiles for select to authenticated using (public.is_active_user());
create policy "profiles_update_partner" on public.profiles for update to authenticated
using (public.current_role()='partner') with check (public.current_role()='partner');
create policy "profiles_self_read" on public.profiles for select to authenticated using (id=auth.uid());

-- Internal client and task data is available only to authenticated, active firm users.
create policy "clients_select_internal" on public.clients for select to authenticated using (public.is_active_user());
create policy "clients_insert_internal" on public.clients for insert to authenticated with check (public.is_active_user());
create policy "clients_update_internal" on public.clients for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "clients_delete_partner_manager" on public.clients for delete to authenticated using (public.current_role() in ('partner','manager'));

create policy "tasks_select_internal" on public.tasks for select to authenticated using (public.is_active_user());
create policy "tasks_insert_internal" on public.tasks for insert to authenticated with check (public.is_active_user());
create policy "tasks_update_internal" on public.tasks for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
create policy "tasks_delete_partner_manager" on public.tasks for delete to authenticated using (public.current_role() in ('partner','manager'));

create policy "comments_select_internal" on public.task_comments for select to authenticated using (public.is_active_user());
create policy "comments_insert_internal" on public.task_comments for insert to authenticated with check (public.is_active_user() and author_id=auth.uid());
create policy "comments_delete_author_or_partner" on public.task_comments for delete to authenticated using (author_id=auth.uid() or public.current_role()='partner');

create policy "audit_read_partner_manager" on public.audit_logs for select to authenticated using (public.current_role() in ('partner','manager'));
-- No direct insert/update/delete policy on audit_logs; triggers write audit records.

-- Do not expose this schema to anon users. In Supabase, grant access to authenticated only.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.clients,public.tasks,public.task_comments to authenticated;
grant select,update on public.profiles to authenticated;
grant select on public.audit_logs to authenticated;
grant usage,select on all sequences in schema public to authenticated;

-- IMPORTANT: promote the initial firm administrator to partner through the Supabase SQL editor
-- after creating the first account, e.g.:
-- update public.profiles set role='partner', full_name='CA Gurwinder Singh' where email='YOUR_ADMIN_EMAIL';
