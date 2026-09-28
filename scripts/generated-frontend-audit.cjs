const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");

const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "scripts/restaurant-preview-fixture.ts"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
}));
const directory = mkdtempSync(join(process.cwd(), ".forgeweb-frontend-audit-"));

try {
  for (const file of fixture.files.filter((candidate) => !candidate.path.startsWith("backend/"))) {
    const target = join(directory, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
  }
  const tsc = join(process.cwd(), "node_modules", "typescript", "bin", "tsc");
  const vite = join(process.cwd(), "node_modules", "vite", "bin", "vite.js");
  execFileSync(process.execPath, [tsc, "--noEmit"], { cwd: directory, encoding: "utf8", stdio: "pipe" });
  const build = execFileSync(process.execPath, [vite, "build"], { cwd: directory, encoding: "utf8" });
  process.stdout.write(JSON.stringify({ typecheck: "passed", build: build.trim().split(/\r?\n/).at(-1), project: fixture.proposal.specification.productName }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
