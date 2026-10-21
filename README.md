# GD Singh & Associates PMS — Web MVP v0.4

This is the next implementation phase after the browser-only prototype: a **multi-user web application scaffold** using Next.js + Supabase Auth/Postgres. It includes the dashboard, client register, task register, team/access screen, role-aware database policies, and database audit logging for client/task changes.

## Included
- `src/` — Next.js application source.
- `supabase/migrations/202610210001_initial_schema.sql` — initial schema, RLS policies, profile bootstrap, human-readable codes and audit triggers.
- `supabase/migrations/202610220001_recurring_templates_and_reviews.sql` — recurring templates, duplicate-safe occurrence generation and reviewer decision history.
- `supabase/migrations/202610230001_lifetime_recurring_services.sql` — ongoing client-service schedules, optional end dates, and protected generator for scheduled runs.
- `supabase/scheduled_jobs/enable_daily_recurring_generation.sql` — optional daily Supabase Cron setup.
- `.env.example` — required public Supabase settings.
- `docs/PRODUCTION_CHECKLIST.md` — launch and security checklist.

## Architecture
- Front end: Next.js 14, React, TypeScript.
- Authentication/database: Supabase Auth + PostgreSQL.
- Security boundary: PostgreSQL Row Level Security (RLS), not just front-end hiding.
- Deployment target: managed Next.js host (e.g. Vercel) + Supabase project.

## Run locally
Prerequisites: Node.js 20 LTS or compatible, npm, and a Supabase project.

1. Extract the ZIP and open a terminal in the project folder.
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env.local`.
4. In Supabase, create a project. Copy the Project URL and anon/public key into `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
   ```
   Never put the Supabase service-role key in a browser environment variable.
5. In Supabase SQL Editor, run `supabase/migrations/202610210001_initial_schema.sql`.
6. Then run `supabase/migrations/202610220001_recurring_templates_and_reviews.sql`.
7. Then run `supabase/migrations/202610230001_lifetime_recurring_services.sql`.
7. In Supabase Authentication settings, disable public sign-ups. Invite/create the firm users yourself.
8. Create the first user, then promote the account to partner using SQL Editor:
   ```
   update public.profiles
   set role = 'partner', full_name = 'CA Gurwinder Singh'
   where email = 'YOUR_ADMIN_EMAIL';
   ```
9. Invite additional users from Supabase Authentication. Profiles are created automatically with `staff` role. A partner can then change roles in Team & Access.
10. Run `npm run dev` and open `http://localhost:3000/login`.
11. Run `npm run build` before deployment.

## Current implemented features
- Email/password sign-in through Supabase Auth.
- Client create/list/edit/delete with entity identifiers, contacts and assigned partner.
- Task create/list/edit/delete with due date, internal target date, assignee, reviewer, priority, frequency and status.
- Team directory with role/access management (partner role required by database policy).
- Recurring service schedule register with frequency, client, default assignee/reviewer, first due date, editable next due/effective date, optional service end date and active/inactive state. A schedule continues while active and without an end date; deactivate the individual service when it ends.
- Manual occurrence generation for the next 45 days, protected by role checks and a duplicate-prevention key. Optional daily generation is available through Supabase Cron after enabling `pg_cron` and running `supabase/scheduled_jobs/enable_daily_recurring_generation.sql`.
- Database RPC for reviewer decisions (approved / changes requested) with append-only review history; UI integration is a follow-up task.
- Dashboard metrics and upcoming/outstanding task list.
- CSV export for tasks.
- Database audit log triggers for client/task inserts, updates and deletes.
- Row-level security on all application tables.

## Important limitations — do not skip
This is a foundation/MVP, **not a finished, independently audited production PMS**.
- Do not load live client records until a qualified developer reviews and tests the SQL/RLS policies, authentication settings, access flows, and backup/restore.
- Statutory due dates are user-entered; there is no legal due-date engine or GST/MCA/Income Tax portal integration.
- Recurring service schedules and the manual 45-day generator are included. Daily generation is optional and must be enabled in Supabase Cron; confirm the extension is available and test the job before relying on it.
- The database review-decision RPC and append-only review table are included, but a reviewer decision UI is not yet integrated into the task screen.
- Task comments UI, document vault, billing, time sheets, email/WhatsApp notifications, leave/workload planning, and client-specific permission scopes are not included yet.
- Role policy in this initial phase: partners/managers can delete clients/tasks; active staff can read and create/update internal records. All active users can see the internal client/task registers. If staff must be restricted to assigned clients/tasks, design and test that policy before launch.
- Client/task audit rows store old/new record JSON. Treat them as confidential and configure retention policies.
- The browser uses the Supabase anon key; this is expected only with RLS enabled. Never expose a service-role key.
- Have a professional test RLS policies with separate partner, manager, staff and inactive accounts, including direct API attempts.
- Backups, MFA, password policy, rate limiting, monitoring, data residency, retention and incident response must be configured for the live environment.

## Suggested next development sprint
1. Recurring compliance templates + scheduled occurrence generator.
2. Review workflow with approval/rejection comments and immutable history.
3. Task comments and controlled document vault.
4. Email reminders and daily overdue digest.
5. Fee proposals, invoices, receipts and ageing.
6. Firm-wide reports, export controls and dashboard filters.
7. Fine-grained client assignment rules and approval permissions.
8. Automated tests for RLS, unit tests and deployment pipeline.


## v0.4 ongoing client-service schedules

1. Apply all three migrations in order: initial schema, recurring templates/reviews, then ongoing client-service schedules.
2. Sign in as a partner or manager.
3. Open **Recurring Templates** and create one template per client service (for example, ABC Ltd — GST returns).
4. Set frequency, first due date and next due/effective date. Leave service end date blank for an ongoing service.
5. Click **Generate next 45 days** to create upcoming occurrences. Re-running it should not duplicate the same template/period.
6. When a client stops one service, edit that service template and turn off **Service schedule active**; when service ends on a known date, set the optional end date. Existing tasks remain in history.
7. When frequency changes, edit the frequency and set the correct next due/effective date. Review already-generated future tasks manually so old-frequency tasks are not mistakenly treated as valid.
8. For daily unattended generation, first confirm Supabase supports `pg_cron`, then run `supabase/scheduled_jobs/enable_daily_recurring_generation.sql`. This schedules at 00:15 UTC / 05:45 India time. Verify the job in the Cron dashboard and test task generation.
9. Reviewer decision history can be recorded using the `submit_task_review` RPC after a task has status `under_review` and the current user is its assigned reviewer or a partner. A dedicated review UI remains to be built.


## v0.5 — Assigned staff work and acknowledgement tracking

Apply `supabase/migrations/202610240001_staff_assigned_work_acknowledgement.sql` after the migrations already used by your current database. Do not rerun the initial schema. This migration adds `acknowledgement_number`, limits staff task visibility to tasks assigned to their own account, limits staff client visibility to clients linked to those assigned tasks, prevents staff from creating/editing/deleting task details, and allows staff to update only status, completion date and acknowledgement number. A task cannot be marked completed by staff unless completion date and acknowledgement/reference are provided. Partners and managers retain management access.

Create each staff account in Supabase Authentication, then have the user sign in once so the profile is created. In Team & Access, keep the user's role as `staff`. Partners/managers can then assign tasks to that profile. Test with a separate staff login before using confidential live data.

This is an MVP change; review and test all policies in a non-production project before entering client-confidential information.


## v0.6 — Invite team members from inside the PMS

- Partners can invite staff from Team & Access by entering full name and work email. Supabase sends the configured invitation email; the database profile bootstrap creates the user with the default `staff` role.
- The invite API verifies the caller's Supabase access token and checks that the caller is an active `partner` before using Supabase Admin Auth.
- Add `SUPABASE_SERVICE_ROLE_KEY` to the server-side `.env.local` file for local development. Find the service-role/secret key in Supabase project API settings. It must remain server-only: do not prefix it with `NEXT_PUBLIC_`, expose it to browser code, commit it, or share it. Restart `npm run dev` after changing environment variables.
- In Supabase Authentication URL Configuration, configure the Site URL and allowed redirect URL(s) for your local and production application. Verify invitation email delivery and link redirection before inviting employees.
- If a service-role key was ever placed in browser code or shared publicly, rotate it immediately.
- Invite flow is an implementation-stage feature and must be tested with an ordinary staff email before production use. Confirm email templates, invite expiry, role defaults, and staff RLS policies.
