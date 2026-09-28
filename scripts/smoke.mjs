import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { REPO_ROOT } from "./lib/db.mjs";
import { parseCsv } from "./lib/csv.mjs";
import { esc } from "./lib/render.mjs";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "training-test-"));
const env = {
  ...process.env,
  DATABASE_URL: process.env.TEST_DATABASE_URL || "",
  DATA_DIR: path.join(dir, "db"),
  OUTPUT_DIR: dir,
};
const uid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let checks = 0;
function run(file, args = [], expected = 0) {
  const p = spawnSync(
    process.execPath,
    [path.join(REPO_ROOT, "scripts", file), ...args],
    { cwd: REPO_ROOT, env, encoding: "utf8" },
  );
  assert.equal(
    p.status,
    expected,
    `${file} ${args.join(" ")}\n${p.stdout}\n${p.stderr}`,
  );
  checks++;
  return p.stdout;
}
function cli(args, expected = 0) {
  return JSON.parse(run("training.mjs", [...args, "--json"], expected));
}
const j = JSON.stringify;
try {
  if (env.DATABASE_URL) {
    const { getDb } = await import("./lib/db.mjs");
    process.env.DATABASE_URL = env.DATABASE_URL;
    const db = await getDb();
    try {
      const rows = await db.query(
        "select tablename from pg_tables where schemaname='public'",
      );
      assert.equal(
        rows.length,
        0,
        "TEST_DATABASE_URL must point to an empty disposable database",
      );
    } finally {
      await db.close();
    }
  }
  run("migrate.mjs");
  run("migrate.mjs");
  run("seed.mjs");
  run("seed.mjs");
  const help = cli(["help"]);
  for (const cmd of help.reads) assert.ok(Array.isArray(cli([cmd])));
  assert.equal(cli(["learners"]).length, 4);
  assert.equal(cli(["enrolments"]).length, 4);
  assert.equal(cli(["attention"]).length, 2);
  assert.equal(cli(["assessment-chase"]).length, 3);
  assert.equal(Number(cli(["attendance-gaps"])[0].absences), 1);
  const fees = cli(["fees-overdue"]);
  assert.equal(fees.length, 2);
  assert.deepEqual(
    fees.map((r) => r.currency),
    ["AUD", "NZD"],
  );
  assert.equal(fees[0].balance_cents, 75000);
  assert.equal(cli(["learner", "aROHa"]).learner.name, "Aroha Taylor");
  assert.equal(cli(["learner", uid(1)]).learner.name, "Aroha Taylor");
  assert.match(
    cli(["learner", "Jordan"], 1).error,
    /Ambiguous.*Jordan Lee.*Jordan Patel/,
  );
  assert.match(cli(["learner", "missing"], 1).error, /No match/);
  assert.equal(cli(["enrolment", "ENR-41"]).results.length, 2);
  assert.ok(cli(["weekly-review"]).checks.length);
  assert.ok(cli(["compliance"]).some((x) => x.rule === "AU-USI"));
  assert.ok(cli(["compliance"]).some((x) => x.rule === "AU-ISSUE-30"));
  const added = cli([
    "add",
    "learners",
    j({
      name: "<script>alert(1)</script>",
      jurisdiction: "AU",
      email: "review@example.test",
    }),
  ]);
  assert.ok(added.id);
  cli(["update", "learners", added.id, j({ name: "Review learner" })]);
  assert.equal(cli(["learner", added.id]).learner.name, "Review learner");
  assert.match(
    cli(
      [
        "add",
        "learners",
        j({ name: "Invalid", jurisdiction: "AU", birth_date: "2026-02-30" }),
      ],
      1,
    ).error,
    /Invalid calendar/,
  );
  cli(["add", "learners", j({ name: "Invalid", jurisdiction: "ZZ" })], 1);
  cli(
    ["add", "learners", j({ name: "Bad", jurisdiction: "AU", unknown: 1 })],
    1,
  );
  cli(
    [
      "add",
      "invoices",
      j({
        name: "Bad cents",
        enrolment_id: uid(41),
        currency: "AUD",
        amount_cents: 1.2,
        due_on: "2026-10-01",
      }),
    ],
    1,
  );
  cli(["update", "invoices", "INV-AU-01", j({ paid_cents: 125001 })], 1);
  cli(["update", "results", uid(53), j({ outcome: "pending" })], 1);
  cli(["update", "invoices", "INV-AU-01", j({ currency: "NZD" })], 1);
  cli(
    [
      "update",
      "courses",
      "Workplace Administration AU",
      j({ jurisdiction: "NZ" }),
    ],
    1,
  );
  cli(
    [
      "log",
      "ENR-41",
      j({
        name: "Future call",
        author: "Test",
        happened_on: "2099-01-01",
        body: "Invalid future contact",
      }),
    ],
    1,
  );
  cli(["update", "enrolments", "ENR-41", j({ learner_id: uid(3) })], 1);
  cli(
    [
      "add",
      "results",
      j({
        name: "Wrong course",
        enrolment_id: uid(40),
        unit_id: uid(20),
        outcome: "pending",
      }),
    ],
    1,
  );
  cli(
    [
      "add",
      "attendance",
      j({
        name: "Too long",
        enrolment_id: uid(41),
        session_id: uid(61),
        status: "present",
        minutes: 121,
      }),
    ],
    1,
  );
  cli(
    [
      "add",
      "attendance",
      j({
        name: "Wrong course",
        enrolment_id: uid(40),
        session_id: uid(61),
        status: "present",
        minutes: 120,
      }),
    ],
    1,
  );
  const today = new Date().toISOString().slice(0, 10);
  cli([
    "log",
    "ENR-41",
    j({
      name: "Progress call",
      author: "Test registrar",
      happened_on: today,
      body: "Agreed an assessment review.",
    }),
  ]);
  assert.equal(cli(["enrolment", "ENR-41"]).enrolment.last_contact_on, today);
  cli(["update", "notes", uid(90), j({ body: "Replace history" })], 1);
  cli(["complete-enrolment", "ENR-41", j({ completed_on: today })], 1);
  cli(["add", "credentials", j({ name: "Bypass" })], 1);
  cli(["record-credential", "ENR-41", j({ name: "Bypass" })], 1);
  cli(
    [
      "record-credential",
      "ENR-42",
      j({
        name: "Early retention",
        issued_on: today,
        document_ref: "test.pdf",
        authorised_by: "Test registrar",
        retain_until: today,
      }),
    ],
    1,
  );
  const future = new Date();
  future.setUTCFullYear(future.getUTCFullYear() + 31);
  const retention = future.toISOString().slice(0, 10);
  const credential = cli([
    "record-credential",
    "ENR-42",
    j({
      name: "TEST-CREDENTIAL",
      issued_on: today,
      document_ref: "archive/test.pdf",
      authorised_by: "Test registrar",
      retain_until: retention,
    }),
  ]);
  assert.ok(credential.id);
  assert.equal(cli(["certificates-due"]).length, 0);
  cli(
    [
      "record-credential",
      "ENR-42",
      j({
        name: "Duplicate",
        issued_on: today,
        document_ref: "archive/test.pdf",
        authorised_by: "Test registrar",
        retain_until: retention,
      }),
    ],
    1,
  );
  // Complete the NZ learner from real-looking evidence and exercise the separate NZ retention gate.
  cli([
    "update",
    "results",
    uid(50),
    j({
      outcome: "competent",
      achieved_on: today,
      evidence_ref: "test/result.pdf",
      retain_until: retention,
    }),
  ]);
  cli([
    "update",
    "enrolments",
    "ENR-40",
    j({
      requirements_confirmed: true,
      requirements_ref: "Signed registrar decision",
      fees_confirmed: true,
    }),
  ]);
  cli(["update", "invoices", "INV-NZ-01", j({ paid_cents: 85000 })]);
  cli([
    "complete-enrolment",
    "ENR-40",
    j({ completed_on: today, retention_until: retention }),
  ]);
  cli(
    [
      "record-credential",
      "ENR-40",
      j({
        name: "NZ-invalid",
        issued_on: today,
        document_ref: "nz.pdf",
        authorised_by: "Registrar",
      }),
    ],
    1,
  );
  cli([
    "record-credential",
    "ENR-40",
    j({
      name: "NZ-record",
      issued_on: today,
      document_ref: "nz.pdf",
      authorised_by: "Registrar",
      permanent: true,
    }),
  ]);
  for (const cmd of ["draft-progress", "draft-fee-reminder"]) {
    const d = cli([cmd, "ENR-41"]);
    assert.equal(d.sent, false);
    assert.match(
      fs.readFileSync(d.draft, "utf8"),
      /DRAFT: staff review required/,
    );
  }
  const fixture = path.join(REPO_ROOT, "fixtures", "wisenet");
  const before = cli(["learners"]).length;
  const auditBefore = cli(["audit"]).length;
  const preview = cli(["import", "wisenet", fixture, "--dry-run"]);
  assert.equal(preview[0].added, 1);
  assert.equal(cli(["learners"]).length, before);
  assert.equal(cli(["audit"]).length, auditBefore);
  assert.equal(cli(["import", "wisenet", fixture])[0].added, 1);
  assert.equal(cli(["import", "wisenet", fixture])[0].skipped, 1);
  const bad = path.join(dir, "bad");
  fs.cpSync(fixture, bad, { recursive: true });
  fs.writeFileSync(
    path.join(bad, "learners.csv"),
    "source_id,name,jurisdiction\nIMPORT-L2,Rollback learner,NZ\n",
  );
  fs.writeFileSync(
    path.join(bad, "enrolments.csv"),
    "source_id,name,learner_id,course_id,start_on,end_on\nBAD-E,Bad enrolment,UNKNOWN,IMPORT-C1,2026-01-01,2026-12-31\n",
  );
  const n = cli(["learners"]).length;
  cli(["import", "wisenet", bad], 1);
  assert.equal(cli(["learners"]).length, n);
  const changed = path.join(dir, "changed");
  fs.cpSync(fixture, changed, { recursive: true });
  fs.writeFileSync(
    path.join(changed, "learners.csv"),
    fs
      .readFileSync(path.join(changed, "learners.csv"), "utf8")
      .replace("Robin Example", "Changed Name"),
  );
  assert.match(cli(["import", "wisenet", changed], 1).error, /changed source/);
  const mapped = path.join(dir, "mapped");
  fs.mkdirSync(mapped);
  fs.writeFileSync(
    path.join(mapped, "learners.csv"),
    "VendorID,Full Name,Region,Ignore Me\nMAP-1,Mapping Example,NZ,unused\n",
  );
  fs.writeFileSync(
    path.join(mapped, "mapping.json"),
    j({
      learners: {
        VendorID: "source_id",
        "Full Name": "name",
        Region: "jurisdiction",
        "Ignore Me": null,
      },
    }),
  );
  assert.equal(cli(["import", "wisenet", mapped])[0].added, 1);
  const exportDir = path.join(dir, "export");
  const ex = cli(["export", exportDir]);
  assert.equal(ex.entities.length, 12);
  assert.ok(
    JSON.parse(fs.readFileSync(path.join(exportDir, "audit_log.json"))).length,
  );
  cli(["export", exportDir], 1);
  run("view.mjs");
  run("docs.mjs");
  assert.ok(fs.existsSync(path.join(dir, "views", "week.html")));
  assert.ok(
    fs
      .readFileSync(
        path.join(dir, "docs-out", "record-of-results", uid(42) + ".html"),
        "utf8",
      )
      .includes("not an issued qualification"),
  );
  assert.equal(
    parseCsv('\uFEFFname,note\r\n"A, B","line1\nline2"\r\n')[0].note,
    "line1\nline2",
  );
  assert.throws(() => parseCsv("x,x\n1,2"));
  assert.throws(() => parseCsv('x\n"unfinished'));
  assert.equal(esc("<script>"), "&lt;script&gt;");
  cli(["unknown"], 1);
  cli(["learners", "--bad"], 1);
  console.log(
    `PASS: ${checks} CLI/script checks; all routes, transaction rollback, record gates, import mapping, audit, documents and views (${env.DATABASE_URL ? "Postgres" : "PGlite"}).`,
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
