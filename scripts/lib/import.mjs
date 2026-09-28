import fs from "node:fs";
import path from "node:path";
import { parseCsv } from "./csv.mjs";
import { fields, insert, transaction } from "./domain.mjs";
const aliases = {
  source_id: ["Source ID", "Learner ID", "Course Enrolment ID", "Record ID"],
  name: ["Name", "Learner Name", "Course Enrolment Name"],
  birth_date: ["Date of Birth"],
  start_on: ["Start Date"],
  end_on: ["End Date"],
  learner_id: ["Learner Reference"],
  course_id: ["Course Reference"],
  trainer_id: ["Trainer Reference"],
  unit_id: ["Unit Reference"],
  enrolment_id: ["Enrolment Reference"],
  session_id: ["Session Reference"],
};
const refs = {
  learner_id: "learners",
  course_id: "courses",
  trainer_id: "trainers",
  unit_id: "units",
  enrolment_id: "enrolments",
  session_id: "sessions",
};
export async function importWisenet(db, dir, preview = false) {
  if (!dir || !fs.statSync(dir).isDirectory())
    throw Error("Import needs a directory");
  const mappingFile = path.join(dir, "mapping.json");
  const mapping = fs.existsSync(mappingFile)
    ? JSON.parse(fs.readFileSync(mappingFile, "utf8"))
    : {};
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".csv"));
  if (!files.length) throw Error("No CSV exports found");
  for (const f of files)
    if (!fields[f.slice(0, -4)]) throw Error("Unknown CSV file " + f);
  return transaction(
    db,
    async () => {
      const counts = [];
      for (const t of Object.keys(fields)) {
        const file = path.join(dir, t + ".csv");
        if (!fs.existsSync(file)) continue;
        let added = 0,
          skipped = 0;
        for (const row of parseCsv(fs.readFileSync(file, "utf8"))) {
          const data = {};
          for (const [header, value] of Object.entries(row)) {
            if (
              Object.hasOwn(mapping[t] || {}, header) &&
              mapping[t][header] === null
            )
              continue;
            const key =
              mapping[t]?.[header] ??
              [...fields[t], "source_id"].find(
                (k) =>
                  k.toLowerCase() === header.toLowerCase() ||
                  (aliases[k] || []).some(
                    (a) => a.toLowerCase() === header.toLowerCase(),
                  ),
              );
            if (key === null) continue;
            if (!key)
              throw Error(
                `${t}: unmapped column "${header}". Supply mapping.json or explicitly map it to null.`,
              );
            if (Object.hasOwn(data, key))
              throw Error("Two columns map to " + key);
            data[key] = value === "" ? null : value;
          }
          if (!data.source_id)
            throw Error(t + ": a stable Source ID is required");
          for (const [k, v] of Object.entries(data)) {
            if (v === null) continue;
            if (refs[k]) {
              const found = await db.query(
                `select id from ${refs[k]} where source_id=$1 or id::text=$1`,
                [v],
              );
              if (found.length !== 1)
                throw Error("Unresolved reference " + k + ": " + v);
              data[k] = found[0].id;
            } else if (k.endsWith("_cents") || k === "minutes") {
              if (!/^\d+$/.test(v))
                throw Error("Expected integer cents/minutes: " + k);
              data[k] = Number(v);
            } else if (
              [
                "regulated",
                "requirements_confirmed",
                "fees_confirmed",
                "permanent",
              ].includes(k)
            ) {
              if (!/^(true|false)$/i.test(v))
                throw Error("Expected true or false: " + k);
              data[k] = v.toLowerCase() === "true";
            }
          }
          const prior = (
            await db.query(`select * from ${t} where source_id=$1`, [
              data.source_id,
            ])
          )[0];
          if (prior) {
            if (Object.entries(data).some(([k, v]) => prior[k] !== v))
              throw Error(
                `${t}: changed source ${data.source_id}; reconcile before importing`,
              );
            skipped++;
            continue;
          }
          await insert(db, t, data);
          added++;
        }
        counts.push({ entity: t, added, skipped, preview });
      }
      return counts;
    },
    preview,
  );
}
