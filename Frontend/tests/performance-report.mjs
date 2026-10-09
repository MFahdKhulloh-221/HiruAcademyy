import { readFileSync } from "node:fs";

for (const path of process.argv.slice(2)) {
  const report = JSON.parse(readFileSync(path, "utf8"));
  console.log(path, JSON.stringify(report.stats));
  const groups = new Map();
  function visit(suite) {
    for (const spec of suite.specs ?? []) for (const test of spec.tests) for (const result of test.results) for (const output of result.stdout ?? []) {
      const match = output.text?.match(/^(?:DASHBOARD_PERF|PERF) (.*)/);
      if (!match) continue;
      const row = JSON.parse(match[1]);
      const key = `${row.membership ?? row.userId} ${row.label}`;
      const rows = groups.get(key) ?? [];
      rows.push(row); groups.set(key, rows);
    }
    for (const child of suite.suites ?? []) visit(child);
  }
  for (const suite of report.suites) visit(suite);
  for (const [key, rows] of groups) {
    const times = rows.map(row => row.readyMs).sort((a, b) => a - b);
    console.log(JSON.stringify({ key, readyMs: rows.map(row => row.readyMs), medianMs: Number(((times[Math.floor((times.length - 1) / 2)] + times[Math.floor(times.length / 2)]) / 2).toFixed(2)), apiCounts: rows.map(row => row.apiCount), slowest: rows.map(row => ({ path: row.slowest?.path, durationMs: Number(((row.slowest?.endMs ?? 0) - (row.slowest?.startMs ?? 0)).toFixed(2)) })) }));
  }
}
