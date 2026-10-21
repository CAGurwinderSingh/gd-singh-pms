-- GD Singh PMS v0.4: ongoing client-service schedules and safe unattended generation.
-- Apply after 202610210001_initial_schema.sql and 202610220001_recurring_templates_and_reviews.sql.

alter table public.recurring_templates
  add column if not exists end_date date;

alter table public.recurring_templates
  add constraint recurring_templates_end_after_start
  check (end_date is null or end_date >= first_due_date);

comment on column public.recurring_templates.end_date is
  'Optional final service date. NULL means the service schedule continues until deactivated.';

-- Internal generator used by the authenticated UI wrapper and by a database scheduler.
-- Not executable by ordinary browser roles.
create or replace function public.generate_task_occurrences_system(horizon_days integer default 45, actor_id uuid default null)
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
  if horizon_days < 1 or horizon_days > 366 then
    raise exception 'horizon_days must be between 1 and 366';
  end if;

  for t in
    select * from public.recurring_templates
    where active = true
      and next_due_date <= current_date + horizon_days
      and (end_date is null or next_due_date <= end_date)
    order by next_due_date
    for update
  loop
    due := t.next_due_date;
    case t.frequency
      when 'Monthly' then step := interval '1 month';
      when 'Quarterly' then step := interval '3 months';
      when 'Half-yearly' then step := interval '6 months';
      when 'Annual' then step := interval '1 year';
      else raise exception 'Unsupported recurrence frequency: %', t.frequency;
    end case;

    while due <= current_date + horizon_days
      and (t.end_date is null or due <= t.end_date)
    loop
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
      ) values (
        t.title,t.client_id,t.category,t.frequency,due,null,
        t.assignee_id,t.reviewer_id,t.priority,'open',t.description,
        t.id::text,period_start,period_end,actor_id
      )
      on conflict (recurrence_key,period_start)
        where recurrence_key is not null and period_start is not null
      do nothing;
      if found then made := made + 1; end if;

      -- Preserve month-end behavior by calculating each occurrence from the previous due date.
      due := (due + step)::date;
    end loop;

    update public.recurring_templates
      set next_due_date = due, last_generated_at = now()
      where id = t.id;
  end loop;
  return made;
end;
$$;

revoke all on function public.generate_task_occurrences_system(integer, uuid) from public, anon, authenticated;

-- Replace the browser-facing function with a role-checked wrapper.
create or replace function public.generate_task_occurrences(horizon_days integer default 45)
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare made integer;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Active authenticated firm user required';
  end if;
  if public.current_role() not in ('partner','manager') then
    raise exception 'Only partners or managers may generate recurring task occurrences';
  end if;
  made := public.generate_task_occurrences_system(horizon_days, auth.uid());
  return made;
end;
$$;
revoke all on function public.generate_task_occurrences(integer) from public;
grant execute on function public.generate_task_occurrences(integer) to authenticated;
