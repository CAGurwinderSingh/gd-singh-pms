# Production readiness checklist

## Before any live client data
- [ ] Create firm-owned Supabase and hosting accounts; use MFA.
- [ ] Confirm region/data residency and contractual requirements with the firm.
- [ ] Disable public sign-ups and configure invite-only account provisioning.
- [ ] Promote one named partner account; verify no other account can promote itself.
- [ ] Test RLS with separate partner, manager, staff, inactive and unauthenticated accounts.
- [ ] Confirm unauthenticated requests cannot read any client, task, profile, comment or audit row.
- [ ] Confirm inactive users cannot query data even with an old session.
- [ ] Review profile update policies: users must not be able to change their own role/active flag.
- [ ] Configure MFA/strong password settings, session duration, recovery and sign-out behavior.
- [ ] Configure database backups, restore drill, monitoring, alerts and retention.
- [ ] Review what client data is stored; do not store passwords, DSC private keys, bank credentials or unnecessary sensitive personal data.
- [ ] Have the SQL schema and RLS policies independently reviewed before live use.

## Application tests
- [ ] Client create/edit and duplicate-code behavior.
- [ ] Task create/edit/status transitions and due-date boundaries.
- [ ] Completed tasks set/clear `completed_at` correctly.
- [ ] Export CSV with commas, quotes and non-English names.
- [ ] Partner/manager/staff permissions on every action.
- [ ] Audit log completeness, confidentiality and retention.
- [ ] Responsive UI and browser compatibility.
- [ ] Build and deployment environment variables.

## Production deployment
- [ ] Connect repository to hosting provider.
- [ ] Configure environment variables only in host secret settings.
- [ ] Use preview environment with synthetic data.
- [ ] Deploy and run smoke tests.
- [ ] Confirm custom domain, TLS, security headers, logging and incident contacts.
- [ ] Announce internal SOP for task assignment, reviews, record corrections and access removal.


## v0.3 recurring templates and review
- [ ] Test each frequency across month-end, leap years, and due dates on the 29th–31st.
- [ ] Confirm repeated generator runs create no duplicate task occurrences.
- [ ] Confirm only partner/manager can create or edit templates and generate occurrences.
- [ ] Confirm staff cannot call generator RPC or submit review for another reviewer’s task.
- [ ] Verify reviewer decision rows are append-only and approval transitions tasks to completed.
- [ ] Decide and document the firm's review rejection/rework conventions.
- [ ] Add an approved scheduled job only after the above tests pass.
