import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { JsonStore } from "../server/store.ts";
import { bloomBackend, repairBloomPreview } from "../server/generation/bloom-repair.ts";
import { digest, id, now } from "../server/lib.ts";
import { validatePythonSyntax } from "../server/python-validation.ts";
import { createProjectZip } from "../server/zip.ts";

// Run only while ForgeWeb is stopped so its in-memory store cannot overwrite this version.
const store = new JsonStore(resolve('.forgeweb-data'));
await store.initialize();
const db = store.read();
const project = Object.values(db.projects).filter((p) => p.name === 'Bloom & Brew' && p.currentVersionId).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))[0];
if (!project?.currentVersionId || !project.currentBuildId) throw new Error('No saved Bloom & Brew version found');
const files = structuredClone(db.versionFiles[project.currentVersionId]);
const preview = files.find((file) => file.path === 'frontend/preview.html');
if (!preview) throw new Error('Missing preview');
const updates = { ...bloomBackend, 'frontend/preview.html': repairBloomPreview(preview.content), 'BOOKING_SETUP.md': `# Real local bookings

The ForgeWeb embedded preview is offline and cannot persist reservations. Use the backend-served page for real bookings:

1. From this exported project directory: python -m venv .venv
2. .\\.venv\\Scripts\\python -m pip install -r backend/requirements.txt
3. Set a private staff token in PowerShell: $env:BLOOM_ADMIN_TOKEN = 'replace-with-a-long-random-secret'
4. .\\.venv\\Scripts\\python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
5. Open http://127.0.0.1:8000 (not the ForgeWeb embedded preview).

Data is stored in data/application.sqlite3 relative to the server working directory. Override with APP_DATABASE_PATH if needed. Back up this file while the backend is stopped. Never commit it or expose customer information publicly.

Staff listing: GET /api/v1/staff/reservations with X-Admin-Token matching BLOOM_ADMIN_TOKEN. Without the token, access is denied. No staff dashboard is provided by this repair.

Local-demo assumptions: slots 09:00, 10:00, 11:00, eight total seats per slot. A transaction prevents overbooking. Configure real opening hours/table capacities before deployment. No email/SMS/payment integration is enabled. Menu data is separate from reservation storage.

This repairs the booking flow and preserves the visual design. Production requires HTTPS, real staff identity, rate limits, retention policy and backups. Use PostgreSQL for multi-instance hosting. React development frontend needs a same-origin /api/v1 proxy; the backend-served standalone page works without one.
` };
for (const [path, content] of Object.entries(updates)) {
  const existing = files.find((file) => file.path === path);
  if (existing) { existing.content = content; existing.digest = digest(content); }
  else files.push({ path, content, digest: digest(content), requirementIds: [] });
}
const syntax = await validatePythonSyntax(files);
if (syntax.status !== 'passed') throw new Error(syntax.evidence);
const versionId = id('version');
const versionNumber = Math.max(...Object.values(db.versions).filter((v) => v.projectId === project.id).map((v) => v.versionNumber)) + 1;
await store.mutate((state) => {
  state.versions[versionId] = { id: versionId, projectId: project.id, buildId: project.currentBuildId!, versionNumber, label: 'Persistent reservation repair', editPrompt: 'Repair SQLite persistence, backend contracts and real reservation submission without changing design.', modifiedFiles: Object.keys(updates), sourceVersionId: project.currentVersionId, validationStatus: 'pending', validationChecks: [syntax], createdAt: now() };
  state.versionFiles[versionId] = files;
  const saved = state.projects[project.id];
  saved.currentVersionId = versionId; saved.currentVersionNumber = versionNumber; saved.updatedAt = now();
  state.files[project.currentBuildId!] = files;
  state.builds[project.currentBuildId!].filePaths = files.map((file) => file.path);
});
await writeFile('Bloom_Brew_Repaired.zip', createProjectZip(files));
console.log('Saved repair as a new version; previous version preserved. Export: Bloom_Brew_Repaired.zip');
