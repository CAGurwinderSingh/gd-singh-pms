-- GD Singh PMS v0.3: recurring templates and review history
create table public.recurring_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  client_id uuid references public.clients(id) on delete restrict,
  category text not null default 'Other',
  frequency text not null check (frequency in ('Monthly','Quarterly','Half-yearly','Annual')),
  first_due_date date not null,
  next_due_date date not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  reviewer_id uuid references public.profiles(id) on delete set null,
  priority public.task_priority not null default 'medium',
  description text,
  active boolean not null default true,
  last_generated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index recurring_templates_active_due_idx on public.recurring_templates(active,next_due_date);
create or replace function public.initialize_recurring_template() returns trigger language plpgsql as $$
begin
  if new.next_due_date is null then new.next_due_date := new.first_due_date; end if;
  if new.created_by is null then new.created_by := auth.uid(); end if;
  return new;
end; $$;
create trigger recurring_templates_initialize before insert on public.recurring_templates for each row execute procedure public.initialize_recurring_template();
create trigger recurring_templates_updated_at before update on public.recurring_templates for each row execute procedure public.set_updated_at();
create trigger audit_recurring_templates after insert or update or delete on public.recurring_templates for each row execute procedure public.write_audit_log();

alter table public.recurring_templates enable row level security;
create policy "templates_select_internal" on public.recurring_templates for select to authenticated using (public.is_active_user());
create policy "templates_insert_partner_manager" on public.recurring_templates for insert to authenticated with check (public.current_role() in ('partner','manager'));
create policy "templates_update_partner_manager" on public.recurring_templates for update to authenticated using (public.current_role() in ('partner','manager')) with check (public.current_role() in ('partner','manager'));
create policy "templates_delete_partner_manager" on public.recurring_templates for delete to authenticated using (public.current_role() in ('partner','manager'));
grant select,insert,update,delete on public.recurring_templates to authenticated;

-- Generates tasks due within the horizon and advances each template's next_due_date.
-- Execute manually from the Recurring Templates screen or schedule via Supabase Cron.
create or replace function public.generate_task_occurrences(horizon_days integer default 45)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.recurring_templates%rowtype;
  due date;
  period_start date;
  period_end date;
  made integer := 0;
  step interval;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active authenticated firm user required';
  end if;
  if public.current_role() not in ('partner','manager') then
    raise exception 'Only partners or managers may generate recurring task occurrences';
  end if;
  if horizon_days < 1 or horizon_days > 366 then
    raise exception 'horizon_days must be between 1 and 366';
  end if;

  for t in select * from public.recurring_templates where active=true and next_due_date <= current_date + horizon_days order by next_due_date
  loop
    due := t.next_due_date;
    while due <= current_date + horizon_days loop
      case t.frequency
        when 'Monthly' then step := interval '1 month';
        when 'Quarterly' then step := interval '3 months';
        when 'Half-yearly' then step := interval '6 months';
        when 'Annual' then step := interval '1 year';
        else raise exception 'Unsupported recurrence frequency: %', t.frequency;
      end case;

      period_end := due;
      period_start := case t.frequency
        when 'Monthly' then (due - interval '1 month' + interval '1 day')::date
        when 'Quarterly' then (due - interval '3 months' + interval '1 day')::date
        when 'Half-yearly' then (due - interval '6 months' + interval '1 day')::date
        when 'Annual' then (due - interval '1 year' + interval '1 day')::date
      end;

      insert into public.tasks(
        title,client_id,category,frequency,due_date,internal_due_date,
        assignee_id,reviewer_id,priority,status,description,
        recurrence_key,period_start,period_end,created_by
      )
      values(
        t.title,t.client_id,t.category,t.frequency,due,null,
        t.assignee_id,t.reviewer_id,t.priority,'open',t.description,
        t.id::text,period_start,period_end,auth.uid()
      )
      on conflict (recurrence_key,period_start) where recurrence_key is not null and period_start is not null do nothing;
      if found then made := made + 1; end if;
      due := (due + step)::date;
    end loop;

    update public.recurring_templates
      set next_due_date=due,last_generated_at=now()
      where id=t.id;
  end loop;
  return made;
end;
$$;
revoke all on function public.generate_task_occurrences(integer) from public;
grant execute on function public.generate_task_occurrences(integer) to authenticated;

-- Task review decisions are append-only and linked to the task.
create table public.task_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision text not null check (decision in ('approved','changes_requested')),
  comments text,
  created_at timestamptz not null default now()
);
create index task_reviews_task_idx on public.task_reviews(task_id,created_at desc);
alter table public.task_reviews enable row level security;
create policy "task_reviews_select_internal" on public.task_reviews for select to authenticated using (public.is_active_user());
create policy "task_reviews_insert_reviewer" on public.task_reviews for insert to authenticated with check (
  public.is_active_user()
  and reviewer_id=auth.uid()
  and exists(select 1 from public.tasks t where t.id=task_id and t.reviewer_id=auth.uid() and t.status='under_review')
);
grant select,insert on public.task_reviews to authenticated;

create or replace function public.submit_task_review(p_task_id uuid,p_decision text,p_comments text default null)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare t public.tasks%rowtype;
begin
  if auth.uid() is null or not public.is_active_user() then raise exception 'Active authenticated firm user required'; end if;
  if p_decision not in ('approved','changes_requested') then raise exception 'Invalid review decision'; end if;
  select * into t from public.tasks where id=p_task_id for update;
  if not found then raise exception 'Task not found'; end if;
  if t.reviewer_id is distinct from auth.uid() and public.current_role() <> 'partner' then
    raise exception 'Only the assigned reviewer or a partner may review this task';
  end if;
  if t.status <> 'under_review' then raise exception 'Task must be Under Review before a decision'; end if;
  insert into public.task_reviews(task_id,reviewer_id,decision,comments)
  values(p_task_id,auth.uid(),p_decision,nullif(trim(p_comments),''));
  update public.tasks set status=case when p_decision='approved' then 'completed'::public.task_status else 'in_progress'::public.task_status end
    where id=p_task_id;
end;
$$;
revoke all on function public.submit_task_review(uuid,text,text) from public;
grant execute on function public.submit_task_review(uuid,text,text) to authenticated;
