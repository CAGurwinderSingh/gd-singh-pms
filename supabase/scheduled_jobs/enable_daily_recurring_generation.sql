-- OPTIONAL: unattended daily generation of the next 45 days of recurring tasks.
-- First confirm pg_cron is available/enabled for your Supabase project.
-- Run this in Supabase SQL Editor as project administrator.
-- This schedules a database function; no secret key is exposed to the browser.

create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'gd-singh-pms-recurring-tasks';

select cron.schedule(
  'gd-singh-pms-recurring-tasks',
  '15 0 * * *', -- 00:15 UTC daily (05:45 India time)
  $$select public.generate_task_occurrences_system(45, null);$$
);
