#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getDb, REPO_ROOT } from "./lib/db.mjs";
import { table } from "./lib/format.mjs";
import {
  fields,
  reads,
  entity,
  match,
  insert,
  update,
  transaction,
  completionCheck,
  credentialCheck,
  compliance,
} from "./lib/domain.mjs";
import { importWisenet } from "./lib/import.mjs";
const argv = process.argv.slice(2),
  json = argv.includes("--json"),
  preview = argv.includes("--dry-run");
const args = argv.filter((a) => !["--json", "--dry-run"].includes(a));
const [cmd = "help", ...rest] = args;
const help = {
  reads: Object.keys(reads),
  writes: [
    "add <entity> <json>",
    "update <entity> <name-or-id> <json>",
    "log <enrolment> <json>",
    "complete-enrolment <enrolment> <json>",
    "record-credential <enrolment> <json>",
  ],
  other: [
    "learner <name-or-id>",
    "enrolment <name-or-id>",
    "compliance",
    "weekly-review",
    "draft-progress <enrolment>",
    "draft-fee-reminder <enrolment>",
    "import wisenet <folder> [--dry-run]",
    "export <new-folder>",
  ],
  fields,
};
function print(out) {
  if (json) console.log(JSON.stringify(out, null, 2));
  else if (Array.isArray(out)) {
    console.log(
      table(
        out,
        Object.keys(out[0] || {}).map((key) => ({
          key,
          label: key.replaceAll("_", " "),
          width: 44,
        })),
      ),
    );
  } else if (typeof out === "object") {
    for (const [k, v] of Object.entries(out)) {
      console.log("\n" + k);
      if (Array.isArray(v)) print(v);
      else console.log(typeof v === "object" ? JSON.stringify(v, null, 2) : v);
    }
  } else console.log(out);
}
let db;
try {
  if (cmd === "help" || cmd === "--help") {
    print(help);
    process.exit(0);
  }
  if (args.some((a) => a.startsWith("--"))) throw Error("Unknown option");
  db = await getDb();
  let out;
  if (reads[cmd]) out = await db.query(reads[cmd]);
  else if (cmd === "compliance") out = await compliance(db);
  else if (cmd === "learner") {
    const l = await match(db, "learners", rest[0]);
    out = {
      learner: l,
      enrolments: await db.query(
        "select * from enrolment_board where id in (select id from enrolments where learner_id=$1)",
        [l.id],
      ),
    };
  } else if (cmd === "enrolment") {
    const e = await match(db, "enrolments", rest[0]);
    out = {
      enrolment: e,
      learner: await db.query(
        "select name,email,jurisdiction from learners where id=$1",
        [e.learner_id],
      ),
      results: await db.query("select * from results where enrolment_id=$1", [
        e.id,
      ]),
      notes: await db.query(
        "select * from notes where enrolment_id=$1 order by happened_on",
        [e.id],
      ),
      fees: await db.query("select * from invoices where enrolment_id=$1", [
        e.id,
      ]),
    };
  } else if (cmd === "weekly-review") {
    out = {
      attention: await db.query(reads.attention),
      assessments: await db.query(reads["assessment-chase"]),
      fees: await db.query(reads["fees-overdue"]),
      certificates: await db.query(reads["certificates-due"]),
      checks: await compliance(db),
    };
  } else if (cmd === "add" || cmd === "update") {
    const t = entity(rest[0]);
    if (t === "credentials")
      throw Error("Use record-credential for issued credentials");
    if (cmd === "update" && t === "notes")
      throw Error("Notes are append-only; add a correction");
    const data = JSON.parse(rest[cmd === "add" ? 1 : 2]);
    if (
      t === "enrolments" &&
      ["status", "completed_on"].some((k) => Object.hasOwn(data, k)) &&
      data.status !== "active" &&
      data.status !== "withdrawn"
    )
      throw Error("Use complete-enrolment to record completion");
    if (cmd === "update" && Object.keys(data).some((k) => k.endsWith("_id")))
      throw Error(
        "Relationships and source identities cannot be reassigned; add a correction record",
      );
    out = await transaction(db, async () => {
      if (cmd === "add") {
        if (t === "results") {
          const e = (
            await db.query("select status from enrolments where id=$1", [
              data.enrolment_id,
            ])
          )[0];
          if (e?.status === "completed")
            throw Error(
              "Completed results require a reviewed correction migration",
            );
        }
        return insert(db, t, data);
      }
      const row = await match(db, t, rest[1]);
      if (
        ["learners", "courses"].includes(t) &&
        Object.hasOwn(data, "jurisdiction") &&
        data.jurisdiction !== row.jurisdiction &&
        (
          await db.query(
            `select id from enrolments where ${t === "learners" ? "learner_id" : "course_id"}=$1`,
            [row.id],
          )
        ).length
      )
        throw Error(
          "Enrolled jurisdiction requires a reviewed correction migration",
        );
      if (t === "enrolments" && row.status === "completed")
        throw Error(
          "Completed enrolments require a reviewed correction migration",
        );
      if (t === "results") {
        const e = (
          await db.query("select status from enrolments where id=$1", [
            row.enrolment_id,
          ])
        )[0];
        if (e.status === "completed")
          throw Error(
            "Completed results require a reviewed correction migration",
          );
      }
      return update(db, t, row.id, data);
    });
  } else if (cmd === "log") {
    out = await transaction(db, async () => {
      const e = await match(db, "enrolments", rest[0]);
      const data = JSON.parse(rest[1]);
      const note = await insert(db, "notes", { ...data, enrolment_id: e.id });
      if (
        note.happened_on >
        (await db.query("select current_date as today"))[0].today
      )
        throw Error("A contact cannot be future dated");
      await db.query(
        "update enrolments set last_contact_on=greatest(coalesce(last_contact_on,start_on),$1::date) where id=$2",
        [note.happened_on, e.id],
      );
      return note;
    });
  } else if (cmd === "complete-enrolment") {
    out = await transaction(db, async () => {
      const e = await match(db, "enrolments", rest[0]);
      if (e.status !== "active")
        throw Error("Only active enrolments can complete");
      await completionCheck(db, e);
      const data = JSON.parse(rest[1]);
      if (
        Object.keys(data).some(
          (k) => !["completed_on", "retention_until"].includes(k),
        ) ||
        !data.completed_on
      )
        throw Error("Provide completed_on and optional retention_until");
      const row = await update(db, "enrolments", e.id, {
        ...data,
        status: "completed",
      });
      const today = (await db.query("select current_date as today"))[0].today;
      if (row.completed_on > today)
        throw Error("Completion cannot be future dated");
      return row;
    });
  } else if (cmd === "record-credential") {
    out = await transaction(db, async () => {
      const e = await match(db, "enrolments", rest[0]);
      const c = await credentialCheck(db, e);
      const data = JSON.parse(rest[1]);
      const row = await insert(db, "credentials", {
        ...data,
        enrolment_id: e.id,
      });
      const dates = (
        await db.query(
          "select current_date as today,($1::date+interval '30 years')::date as floor",
          [row.issued_on],
        )
      )[0];
      if (row.issued_on < e.completed_on || row.issued_on > dates.today)
        throw Error(
          "Issuance must follow completion and cannot be in the future",
        );
      if (
        c.jurisdiction === "AU" &&
        (!row.retain_until || row.retain_until < dates.floor)
      )
        throw Error("Thirty-year credential retention required");
      if (c.jurisdiction === "NZ" && !row.permanent)
        throw Error("NZ academic records require permanent retention");
      return row;
    });
  } else if (cmd === "import") {
    if (rest[0] !== "wisenet") throw Error("Supported import: wisenet");
    out = await importWisenet(db, rest[1], preview);
  } else if (cmd === "export") {
    if (!rest[0]) throw Error("Provide a new output directory");
    const dir = path.resolve(rest[0]);
    if (fs.existsSync(dir)) throw Error("Export directory already exists");
    const snapshot = await transaction(db, async () => {
      const s = {};
      for (const t of [...Object.keys(fields), "audit_log"])
        s[t] = await db.query(`select * from ${t} order by id`);
      return s;
    });
    fs.mkdirSync(dir, { recursive: true });
    for (const [t, rows] of Object.entries(snapshot))
      fs.writeFileSync(
        path.join(dir, t + ".json"),
        JSON.stringify(rows, null, 2) + "\n",
      );
    out = {
      directory: dir,
      entities: Object.keys(snapshot),
      note: "Full JSON snapshot including audit; contains personal data. Not a Wisenet import bundle.",
    };
  } else if (cmd === "draft-progress" || cmd === "draft-fee-reminder") {
    const e = await match(db, "enrolments", rest[0]);
    const l = (
      await db.query("select name from learners where id=$1", [e.learner_id])
    )[0];
    const rows =
      cmd === "draft-progress"
        ? await db.query(
            "select unit,outcome,due_on from assessment_queue where enrolment=$1",
            [e.name],
          )
        : await db.query(
            "select name,currency,amount_cents-paid_cents as balance_cents,due_on from invoices where enrolment_id=$1 and amount_cents>paid_cents",
            [e.id],
          );
    const notes = await db.query(
      "select happened_on,body from notes where enrolment_id=$1 order by happened_on desc",
      [e.id],
    );
    const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, "drafts");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, cmd + "-" + e.id + "-" + randomUUID() + ".md");
    fs.writeFileSync(
      file,
      `# DRAFT: staff review required\n\nTo: ${l.name}\nEnrolment: ${e.name}\n\nPlease review the following recorded ${cmd === "draft-progress" ? "learning progress" : "outstanding fees"} with us.\n\n${JSON.stringify(rows, null, 2)}\n\n## Internal context (remove before sharing)\n${JSON.stringify(notes, null, 2)}\n`,
    );
    out = { draft: file, sent: false };
  } else throw Error("Unknown command: " + cmd);
  print(out);
} catch (e) {
  if (json) console.log(JSON.stringify({ error: e.message }));
  else console.error(e.message);
  process.exitCode = 1;
} finally {
  if (db) await db.close();
}
