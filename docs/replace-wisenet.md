# Replace Wisenet: reconcile first

Wisenet lets an operator select export columns. There is no single universal CSV header layout. This importer takes CSV bundles with explicit headings and stable record identifiers. The fixture is a fictional contract example, not a captured Wisenet export. Keep Wisenet available until records, reporting and access are reconciled.

## Export

Open the relevant filtered list, clear row selections, choose Action > Export CSV and select the needed columns. Download the resulting CSV. Wisenet documents a 10,000-row limit for course enrolment and application exports; use non-overlapping filters above that limit. Export links expire after 24 hours.

Sources checked 28 September 2026: [How to export data](https://learn.wisenet.co/how-to-export-data/) and [How to find data exports](https://learn.wisenet.co/how-to-find-data-exports/).

Save the original files unchanged. Work from copies named learners.csv, courses.csv, units.csv, trainers.csv, enrolments.csv, results.csv, sessions.csv, attendance.csv, invoices.csv, notes.csv and credentials.csv as available. The importer reads them in dependency order. Every row needs source_id or Source ID. Relationships refer to that original source identifier or an existing local UUID, not a person's name.

## Map

`node scripts/training.mjs help --json` lists every allowed destination field. Direct field names are accepted case-insensitively. Common aliases include Name, Date of Birth, Start Date, End Date, Learner Reference, Course Reference and Enrolment Reference. Use mapping.json in the import folder for selected Wisenet headings:

```json
{
  "learners": {"Your learner code column": "source_id", "Your learner full name column": "name", "Unused report column": null},
  "enrolments": {"Your learner code column": "learner_id"}
}
```

Replace the example heading names with those actually selected. Unknown headings, duplicate mappings, unresolved references, invalid dates or changed source records stop the whole import. Explicit null mappings exclude a column. Preserve the original export and document every exclusion. Dates must be YYYY-MM-DD; convert regional dates in the working copy. Booleans are true or false. Money is integer cents, with AUD and NZD kept separate. Names and jurisdictions must be supplied from actual source records. Do not invent missing information.

## One import command

```bash
node scripts/training.mjs import wisenet ./exports --dry-run --json
node scripts/training.mjs import wisenet ./exports --json
```

The first run writes inside a transaction and rolls it all back, including audit entries. The second commits the same validated bundle. Repeat unchanged exports safely; changed source rows require reconciliation, not silent replacement. This accepts mapped CSV exports, not Wisenet backup files or a direct API connection. Enterprise DNA maps and reconciles the provider's selected exports as part of the setup.

## What maps

Learners, courses and units; trainer assignments; enrolment dates and completion state; assessment outcomes and evidence references; sessions and attendance; invoice amounts and recorded payments; notes and historical credential references. Existing credentials are imported as historical evidence even when checks flag missing retention dates. Import never issues a credential.

## What stays outside

Attachments, assessment files, issued certificate PDFs, login accounts, portal history, email delivery history, automations, payment tokens, reporting submissions, USI verification connections and course accreditation are not reconstructed. Preserve external archives and cross-reference them. Export JSON is a full local snapshot, not a restore command; test a database backup and restore separately.

## Reconcile before switching

Compare counts and stable identifiers by course and status, required units and outcomes, attendance marks, fee balances by currency and the credential register. Run compliance and resolve every mismatch with the registrar. Keep the original export and evidence archive. Test the provider's government reporting and official issuance process independently. A clean import alone is not a completed migration.
