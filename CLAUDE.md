# Training Provider for Claude Code

For a fee-for-service AU training provider or NZ private training establishment. Ask the operator which jurisdiction, courses and reporting obligations apply. The demo is fictional and is not a course approved for delivery.

## Rules

Read current records through the CLI before answering. No sends, submissions, credential issuance or deletions. Documents are drafts for staff review. Do not equate a local check with regulator approval. Actual USI verification happens outside this system; never fabricate its evidence. Preserve academic records and document archives. Never total different currencies together.

One CLI: `node scripts/training.mjs help --json`. Use argument arrays for JSON. DATABASE_URL selects Postgres, otherwise DATA_DIR selects the embedded database. Never use demo data with real learners. Read docs/compliance.md and docs/replace-wisenet.md before operational work.

## Routing

- `/learners`: List learner identities without exposing full identifiers in routine summaries.
- `/courses`: List the course register and jurisdiction.
- `/units`: List the required units for each course.
- `/trainers`: Review trainer portfolio references and review dates.
- `/enrolments`: Review course progress, trainer ownership and quiet enrolments.
- `/results`: Review recorded outcomes and evidence references.
- `/sessions`: Check the timetable and trainer assignments.
- `/attendance`: Review attendance totals and expected sessions.
- `/invoices`: Read fee balances with currencies kept separate.
- `/notes`: Read the recorded learner-contact history.
- `/credentials`: Read the register of credentials already issued outside this system.
- `/assessment-chase`: Review overdue and upcoming assessment decisions.
- `/attendance-gaps`: Find absences and sessions with missing attendance.
- `/fees-overdue`: Review unpaid invoices past their due dates.
- `/certificates-due`: Review completed enrolments without a recorded credential.
- `/trainer-load`: Compare active learners, quiet records and overdue results by trainer.
- `/attention`: Prioritise overdue assessments and enrolments quiet for fourteen days.
- `/retention`: Review enrolment, assessment-material and credential retention floors.
- `/audit`: Read the change log.
- `/compliance`: Run the cited record checks and state their limited scope.
- `/weekly-review`: Read attention, assessment-chase, fees-overdue, certificates-due and compliance together. Write a Monday plan with the responsible trainer for each action.
- `/learner`: Read one learner and their enrolments.
- `/enrolment`: Read one enrolment, results, fee records and notes.
- `/add`: Add a validated record from facts supplied by the operator.
- `/update`: Correct an existing record with an audit entry.
- `/log`: Record a real learner contact and update the last-contact date.
- `/complete-enrolment`: Record completion after every unit passes and an authorised reviewer confirms the full course requirements.
- `/record-credential`: Record a credential already issued outside this system, including the document reference and authorised signer.
- `/draft-progress`: Draft a learner progress note from current records into drafts. Review and remove internal context before sharing.
- `/draft-fee-reminder`: Draft a fee reminder from unpaid invoices into drafts. Review and remove internal context before sharing.
- `/import`: Preview and import Wisenet CSV exports using the replace guide.
- `/export`: Export a complete JSON snapshot, including the audit log, to a new folder.
- `/customise`: change fields, rules and migrations with tests.
- `/new-view`: add a read-only branded report.

Every workflow lives in .claude/commands, for Claude Code, Codex, OpenCode or Cursor. No parallel command libraries. Migrations live in supabase/migrations. Documents use documents.json; dashboards use views.json and brand.json. All drafts stay local. Limit access to the database, exports and generated files; this base has no login or per-user permission layer.

Omni by Enterprise DNA installs, customises and operates the provider's system. https://enterprisedna.co/omni/book?offer=replace-software&utm_campaign=wisenet
