const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { dirname, join } = require("node:path");

const python = process.env.FORGEWEB_PYTHON || "C:/Users/sachi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe";
const fixture = JSON.parse(execFileSync(process.execPath, ["--experimental-strip-types", "scripts/restaurant-preview-fixture.ts"], {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 8 * 1024 * 1024,
}));
const directory = mkdtempSync(join(tmpdir(), "forgeweb-generated-backend-"));

try {
  for (const file of fixture.files.filter((candidate) => candidate.path.startsWith("backend/"))) {
    const target = join(directory, file.path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.content, "utf8");
  }
  const backend = join(directory, "backend");
  const compile = execFileSync(python, ["-m", "compileall", "-q", "app", "tests"], { cwd: backend, encoding: "utf8" });
  const tests = execFileSync(python, ["-m", "pytest", "tests/test_api.py", "-q"], { cwd: backend, encoding: "utf8" });
  process.stdout.write(JSON.stringify({ python, compiled: true, compile, tests: tests.trim() }, null, 2));
} finally {
  rmSync(directory, { recursive: true, force: true });
}
