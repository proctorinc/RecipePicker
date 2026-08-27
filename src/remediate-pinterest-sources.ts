import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import {
  applyPinterestSourceRemediation,
  planPinterestSourceRemediation,
  type PinterestSourceRemediationReport,
} from "@/lib/server/pinterest-source-remediation";
import { runScriptWithLogging } from "@/lib/server/logger";

function valueAfter(args: string[], flag: string) {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1] ?? null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const confirmed = args.includes("--confirm");
  const sqlitePath = valueAfter(args, "--sqlite-path") ?? undefined;
  const reportPath = valueAfter(args, "--report");
  const reviewedReportPath = valueAfter(args, "--reviewed-report");
  if (!reportPath) throw new Error("A --report <path> is required.");
  if (apply && (!confirmed || !reviewedReportPath)) {
    throw new Error("Applying requires --apply --confirm --reviewed-report <reviewed-dry-run.json>.");
  }

  const report = await planPinterestSourceRemediation(sqlitePath);
  if (apply) {
    const reviewed = JSON.parse(fs.readFileSync(path.resolve(reviewedReportPath!), "utf8")) as PinterestSourceRemediationReport;
    const result = await applyPinterestSourceRemediation({ reviewedReport: reviewed, sqlitePath });
    fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify({ ...report, appliedAt: new Date().toISOString(), result }, null, 2)}\n`);
    process.stdout.write(`Applied ${result.appliedGroups} Pinterest source-URL remediation groups and backfilled ${result.backfilledPins} source keys.\n`);
    return;
  }

  fs.writeFileSync(path.resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`Dry run found ${report.groups.length} Pinterest source-URL remediation groups (${report.blockingGroups.length} blocked) and ${report.sourceUrlKeyBackfills.length} source-key backfills.\n`);
}

runScriptWithLogging({ scriptName: "script.remediate_pinterest_sources", fn: main }).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
