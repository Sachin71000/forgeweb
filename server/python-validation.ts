import { execFile } from "node:child_process";
import type { GeneratedFile, ValidationCheck } from "./domain.ts";
import { id } from "./lib.ts";

// compile() checks syntax but never imports or executes generated code. Input is
// passed through stdin, not interpolated into a command or written to the host.
const CHECK = `import json,sys
errors=[]
for item in json.load(sys.stdin):
 try: compile(item['content'], item['path'], 'exec')
 except (SyntaxError, ValueError) as e: errors.append(item['path'] + ':' + str(getattr(e,'lineno',0)) + ': invalid Python syntax')
print(json.dumps(errors))`;

export async function validatePythonSyntax(files: GeneratedFile[], executable = process.env.FORGEWEB_PYTHON_EXECUTABLE ?? "python"): Promise<ValidationCheck> {
  const python = files.filter((file) => file.path.endsWith(".py")).map(({ path, content }) => ({ path, content }));
  const result = (passed: boolean, evidence: string): ValidationCheck => ({ id: id("check"), name: "Python syntax", status: passed ? "passed" : "failed", evidence });
  if (!python.length) return result(true, "No Python source files in this project.");
  return new Promise((resolve) => {
    const child = execFile(executable, ["-I", "-S", "-c", CHECK], { timeout: 10_000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout) => {
      if (error) { resolve(result(false, "Python syntax checker unavailable or timed out. Install Python 3 or set FORGEWEB_PYTHON_EXECUTABLE; export remains blocked.")); return; }
      try {
        const errors: unknown = JSON.parse(stdout);
        if (!Array.isArray(errors) || !errors.every((item) => typeof item === "string")) throw new Error("Invalid checker response");
        resolve(result(errors.length === 0, errors.length ? errors.join("; ") : `${python.length} Python files compiled for syntax without execution. Runtime behavior is not verified.`));
      } catch { resolve(result(false, "Python syntax checker returned an invalid result; export remains blocked.")); }
    });
    child.stdin?.on("error", () => { /* execFile callback reports process failure. */ });
    child.stdin?.end(JSON.stringify(python));
  });
}
