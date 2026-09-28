import fs from "node:fs";
export const fields = JSON.parse(
  fs.readFileSync(new URL("./fields.json", import.meta.url), "utf8"),
);
export const reads = {
  learners:
    "select id,name,email,jurisdiction,birth_date from learners order by name",
  courses:
    "select id,name,code,jurisdiction,regulated from courses order by name",
  units:
    "select u.id,u.code,u.name,c.name as course from units u join courses c on c.id=u.course_id order by u.code",
  trainers:
    "select id,name,credential_ref,reviewed_on from trainers order by name",
  enrolments: "select * from enrolment_board order by name",
  results: "select * from assessment_queue order by enrolment,unit",
  sessions:
    "select s.id,s.name,s.session_on,s.minutes,s.venue,c.name as course,t.name as trainer from sessions s join courses c on c.id=s.course_id left join trainers t on t.id=s.trainer_id order by session_on",
  attendance: "select * from attendance_summary order by enrolment",
  invoices: "select * from fee_balances order by due_on",
  notes:
    "select name,enrolment_id,happened_on,author,body from notes order by happened_on desc",
  credentials:
    "select name,enrolment_id,issued_on,document_ref,authorised_by,retain_until,permanent from credentials order by issued_on",
  "assessment-chase":
    "select enrolment,learner,unit,outcome,due_on,days_overdue,trainer from assessment_queue where outcome in ('pending','not-yet-competent') order by due_on nulls last",
  "attendance-gaps":
    "select enrolment,learner,recorded_sessions,scheduled_sessions,absences from attendance_summary where absences>0 or recorded_sessions<scheduled_sessions order by enrolment",
  "fees-overdue":
    "select invoice,learner,currency,balance_cents,due_on,days_overdue from fee_balances where balance_cents>0 and due_on<current_date order by currency,due_on",
  "certificates-due":
    "select name as enrolment,learner,jurisdiction,completed_on,review_due_on,identity_recorded,requirements_confirmed,fees_confirmed from certificate_queue where credential is null order by review_due_on",
  "trainer-load":
    "select trainer,count(*) as active_learners,sum(overdue_results) as overdue_results,count(*) filter(where quiet_days>=14) as quiet_enrolments from enrolment_board where status='active' group by trainer order by trainer",
  attention:
    "select name as enrolment,learner,trainer,quiet_days,overdue_results,end_on from enrolment_board where status='active' and (quiet_days>=14 or overdue_results>0 or end_on<current_date) order by overdue_results desc,quiet_days desc",
  retention: "select * from retention_register order by enrolment",
  audit:
    "select entity,record_id,action,created_at from audit_log order by created_at desc,id",
};
export function entity(t) {
  if (!fields[t]) throw Error("Unknown entity: " + t);
  return t;
}
export async function match(db, t, q) {
  entity(t);
  if (!q) throw Error("A name or id is required");
  const all = await db.query(`select * from ${t} order by name`);
  let found = all.filter(
    (r) =>
      r.id === q ||
      r.name.toLowerCase() === q.toLowerCase() ||
      r.source_id === q,
  );
  if (!found.length)
    found = all.filter(
      (r) =>
        r.id.startsWith(q) || r.name.toLowerCase().includes(q.toLowerCase()),
    );
  if (found.length !== 1)
    throw Error(
      `${found.length ? "Ambiguous" : "No match"} ${t}: ${q}. Candidates: ${found.map((r) => r.id + " " + r.name).join("; ")}`,
    );
  return found[0];
}
export function validate(t, obj) {
  entity(t);
  if (
    !obj ||
    Array.isArray(obj) ||
    typeof obj !== "object" ||
    !Object.keys(obj).length
  )
    throw Error("Provide a nonempty JSON object");
  for (const [k, v] of Object.entries(obj)) {
    if (!fields[t].includes(k) && k !== "source_id")
      throw Error("Unknown field: " + k);
    if (v === null) continue;
    if (k.endsWith("_on") || k.endsWith("_until") || k === "birth_date") {
      if (
        typeof v !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        !Number.isFinite(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v
      )
        throw Error("Invalid calendar date: " + k);
    }
    if (k.endsWith("_cents") || k === "minutes") {
      if (!Number.isSafeInteger(v) || v < 0)
        throw Error("Expected nonnegative integer: " + k);
    }
    if (
      [
        "regulated",
        "requirements_confirmed",
        "fees_confirmed",
        "permanent",
      ].includes(k) &&
      typeof v !== "boolean"
    )
      throw Error("Expected boolean: " + k);
    if (typeof v === "string" && !v.trim()) throw Error("Blank field: " + k);
    if (k.endsWith("_id") && k !== "source_id" && !/^[0-9a-f-]{36}$/i.test(v))
      throw Error("Expected UUID: " + k);
  }
  return obj;
}
export async function transaction(db, fn, preview = false) {
  await db.exec("begin");
  try {
    const out = await fn();
    await db.exec(preview ? "rollback" : "commit");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
export async function insert(db, t, obj) {
  validate(t, obj);
  const keys = Object.keys(obj);
  return (
    await db.query(
      `insert into ${t} (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning *`,
      Object.values(obj),
    )
  )[0];
}
export async function update(db, t, id, obj) {
  validate(t, obj);
  const keys = Object.keys(obj);
  return (
    await db.query(
      `update ${t} set ${keys.map((k, i) => k + "=$" + (i + 1)).join(",")} where id=$${keys.length + 1} returning *`,
      [...Object.values(obj), id],
    )
  )[0];
}
export async function completionCheck(db, e) {
  const rows = await db.query(
    "select u.code,r.outcome from units u left join results r on r.unit_id=u.id and r.enrolment_id=$1 where u.course_id=$2 and (r.id is null or r.outcome not in ('competent','credit-transfer','rpl'))",
    [e.id, e.course_id],
  );
  const units = await db.query("select id from units where course_id=$1", [
    e.course_id,
  ]);
  if (!units.length || rows.length)
    throw Error("All required units must have evidenced passing results");
  if (!e.requirements_confirmed || !e.requirements_ref)
    throw Error(
      "A reviewer must confirm all training-product requirements with evidence",
    );
}
export async function credentialCheck(db, e) {
  await completionCheck(db, e);
  if (e.status !== "completed") throw Error("Complete the enrolment first");
  if (
    !e.fees_confirmed ||
    (
      await db.query(
        "select id from invoices where enrolment_id=$1 and paid_cents<amount_cents",
        [e.id],
      )
    ).length
  )
    throw Error("All agreed fees must be confirmed paid");
  const c = (
    await db.query("select * from courses where id=$1", [e.course_id])
  )[0];
  const l = (
    await db.query("select * from learners where id=$1", [e.learner_id])
  )[0];
  if (
    c.jurisdiction === "AU" &&
    c.regulated &&
    !l.usi_exemption &&
    !(l.usi?.length === 10 && l.usi_verified_on && l.usi_evidence)
  )
    throw Error("Record external USI verification evidence or an exemption");
  return c;
}
const ASQA =
  "https://www.asqa.gov.au/for-providers/standards-for-RTOs/practice-guides/compliance-standards-for-rtos/integrity-of-nationally-recognised-training-practice-guide";
const NZQA =
  "https://www2.nzqa.govt.nz/about-us/rules-fees-policies/nzqa-rules/pte-registration-rules/";
const NCVER =
  "https://www.ncver.edu.au/rto-hub/avetmiss-compliant-software-register";
export async function compliance(db) {
  const out = [];
  const add = (record, rule, finding, source) =>
    out.push({ record, rule, finding, source });
  for (const x of await db.query(
    `select e.*,l.name as learner,l.birth_date,l.address,l.citizenship,l.usi,l.usi_verified_on,l.usi_evidence,l.usi_exemption,c.jurisdiction,c.regulated from enrolments e join learners l on l.id=e.learner_id join courses c on c.id=e.course_id`,
  )) {
    if (x.jurisdiction === "AU" && x.regulated) {
      if (!x.birth_date)
        add(
          x.name,
          "AU-DATA",
          "Date of birth missing; review reporting data",
          NCVER,
        );
      if (
        !x.usi_exemption &&
        !(x.usi?.length === 10 && x.usi_verified_on && x.usi_evidence)
      )
        add(
          x.name,
          "AU-USI",
          "External USI verification evidence missing",
          "https://www.usi.gov.au/providers",
        );
    }
    if (
      x.jurisdiction === "NZ" &&
      (!x.address || !x.birth_date || !x.citizenship)
    )
      add(
        x.name,
        "NZ-ENROLMENT",
        "Address, date of birth or citizenship missing",
        NZQA,
      );
    if (x.status === "completed") {
      try {
        await completionCheck(db, x);
      } catch (e) {
        add(
          x.name,
          "ASSESSMENT-REVIEW",
          e.message,
          x.jurisdiction === "AU" ? ASQA : NZQA,
        );
      }
    }
  }
  for (const x of await db.query(
    "select * from certificate_queue where jurisdiction='AU' and credential is null and requirements_confirmed and fees_confirmed and review_due_on<current_date",
  ))
    add(
      x.name,
      "AU-ISSUE-30",
      "Certification review overdue; reconcile eligibility and fees",
      ASQA,
    );
  for (const x of await db.query(
    "select k.*,e.completed_on,c.jurisdiction,(k.issued_on+interval '30 years')::date as floor from credentials k join enrolments e on e.id=k.enrolment_id join courses c on c.id=e.course_id",
  )) {
    if (
      x.jurisdiction === "AU" &&
      (!x.retain_until || x.retain_until < x.floor)
    )
      add(
        x.name,
        "AU-CERT-30Y",
        "Credential retention below thirty-year floor",
        ASQA,
      );
    if (x.jurisdiction === "NZ" && !x.permanent)
      add(
        x.name,
        "NZ-ACADEMIC",
        "Academic awards must be marked permanent",
        NZQA,
      );
  }
  for (const x of await db.query(
    "select * from retention_register where jurisdiction='NZ' and completed_on is not null and (enrolment_retain_until is null or enrolment_retain_until<(completed_on+interval '2 years')::date)",
  ))
    add(
      x.enrolment,
      "NZ-ENROL-2Y",
      "Enrolment retention below two-year floor",
      NZQA,
    );
  for (const x of await db.query(
    "select r.name,r.retain_until,e.completed_on,c.jurisdiction,(e.completed_on+case when c.jurisdiction='AU' then interval '2 years' else interval '1 year' end)::date as floor from results r join enrolments e on e.id=r.enrolment_id join courses c on c.id=e.course_id where e.completed_on is not null",
  ))
    if (!x.retain_until || x.retain_until < x.floor)
      add(
        x.name,
        "ASSESSMENT-RETENTION",
        "Assessment-material retention date missing or too early",
        x.jurisdiction === "AU" ? ASQA : NZQA,
      );
  return out;
}
