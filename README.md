# Training Provider for Claude Code

Learners, courses, attendance, results, fees and the Monday review in a database you own. MIT licence. Built by Enterprise DNA.

| Do it yourself | We customise it | We run it for you |
| --- | --- | --- |
| Free source. Follow the quick start. | Your fields, course rules, Wisenet migration, reports, a web interface or a different stack. | Installed, connected and operated through Omni by Enterprise DNA. One setup fee, then a retainer. |

[Talk to Sam](https://enterprisedna.co/omni/book?offer=replace-software&utm_campaign=wisenet&utm_medium=readme) · [Instead of Wisenet](https://enterprisedna.co/omni/instead-of/wisenet?utm_source=github&utm_medium=readme&utm_campaign=wisenet)

Works with Claude Code, Codex, OpenCode or Cursor. Read AGENTS.md and CLAUDE.md.

## Quick start

```bash
git clone https://github.com/Enterprise-DNA-OS/training-provider-for-claude-code.git
cd training-provider-for-claude-code
npm install
npm run demo
npm run training -- weekly-review
npm run view
npm run docs
```

Node 20 or newer. PGlite works without a separate database installation. Use DATABASE_URL for Postgres. The migration uses no extensions and runs on both adapters. Seed data is fictional: four learners, two courses, three units, two trainers, overdue assessments, missing attendance, two currencies and a completed learner awaiting credential review. Repeating the seed preserves existing rows.

Use a fresh DATA_DIR or an empty managed database for real work. Run npm run migrate and import reconciled records. Do not seed a real provider database. Agent subscriptions, hosting and operational support are separate from the source licence.

## The week's work

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
- `/customise`: change your fields, rules and reports with a tested migration.
- `/new-view`: add a branded read-only dashboard.

Every CLI command accepts --json. A unique name fragment or UUID prefix resolves records; matching ignores name case. Ambiguous names list candidates and exit 1. Write relationships use UUIDs. `help --json` lists the permitted fields. Values ending in _cents are integer cents. Use JSON argument arrays on Windows to avoid shell quoting mistakes.

Writes are transactional and have database-triggered before/after audit entries. Notes are append-only through the CLI. Database administrators can alter the audit trail. Imported credentials are historical records, not newly issued credentials. Completed academic results require a reviewed correction migration rather than an ordinary edit.

## Compliance checks and paperwork

Read [the cited rules](docs/compliance.md). Checks cover selected record gaps and retention floors, not complete regulatory compliance. AU USI verification is recorded from an external verification, never performed here. AVETMISS checks are preliminary data checks only; the base does not generate or submit NAT files. Government funding, CRICOS, loans, payments, NZ SDR submissions and official credential issuance remain outside this base. Fee-for-service providers still have reporting duties.

`npm run docs` renders draft learner progress reports, fee statements, assessment follow-up plans and records of results. These are not qualifications or statements of attainment. `record-credential` records a document already issued by an authorised person elsewhere. It requires completed results, confirmed course requirements, confirmed fees, identity evidence where applicable and a retention date. It never issues or sends anything.

`npm run view` renders the week, overdue fees, attendance and retention review. Change the business name, logo and colours in brand.json. References to evidence do not copy or preserve the underlying documents. Back up the document archive with the database.

## Ten questions across your provider

Wisenet supports custom reporting and a BI connector. These are questions this CLI answers today, not a claim that Wisenet cannot be configured to answer them.

1. Which learners have both overdue assessment work and a quiet enrolment? (`attention`)
2. Which trainer owns the oldest assessment backlog? (`assessment-chase + trainer-load`)
3. Which course sessions have no attendance recorded? (`attendance-gaps`)
4. Which learners missed sessions while fees remain unpaid? (`attendance-gaps + fees-overdue`)
5. Which finished enrolments still await credential review? (`certificates-due`)
6. Which learners lack recorded external identity verification? (`compliance`)
7. Which retention dates fall below the applicable floor? (`compliance + retention`)
8. How much is overdue in each currency? (`fees-overdue`)
9. Which learners have evidence for credit transfer or prior learning? (`results`)
10. What should each trainer do at the Monday meeting? (`weekly-review`)

## Your first hour: ten things to ask for

1. Put our business name and logo on the reports.
2. Add our trainer register and portfolio references.
3. Add our courses and required units.
4. Map the headings in our Wisenet exports.
5. Change our quiet-learner policy from fourteen days to seven.
6. Add learning-support review dates.
7. Add a report for one trainer's weekly meeting.
8. Add our approved progress-letter wording.
9. Add an assessment evidence checklist.
10. Add a retention review report for our jurisdiction.

Use `/customise`; keep migrations, validation, reports and tests together.

## Switching and operation

[The replace guide](docs/replace-wisenet.md) covers CSV selection, mapping, a single import command, a rollback preview and reconciliation. Exports vary with the Wisenet columns selected; the fixtures show this importer contract, not a vendor-certified export sample. Unknown columns stop the import unless explicitly mapped or excluded. Exact repeats are skipped. Changed source records stop for review. Export makes a full JSON snapshot including audit records; it does not produce a Wisenet import bundle.

[Why no front end](docs/why-no-front-end.md) explains the operational boundary. There is no learner portal, trainer app, mobile capture, offline synchronisation, payment gateway or regulatory submission service. Enterprise DNA scopes those requirements with you before a switch. Keep the incumbent running until reporting, privacy, permissions, backups and reconciliation are accepted.

## Validation

`npm test` creates a temporary database, migrates and seeds twice, exercises every CLI route, and checks write gates, import rollback, duplicate handling, currency separation, dates, evidence, HTML escaping and draft outputs. CI runs the same test on Windows and Linux. A separate CI job runs it against disposable Postgres. Local tests use only temporary data.

MIT. Copyright 2026 Enterprise DNA.
