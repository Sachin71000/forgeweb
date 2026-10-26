import assert from "node:assert/strict";
import test from "node:test";
import { execFile } from "node:child_process";
import { bloomBackend, repairBloomPreview } from "../generation/bloom-repair.ts";

test("repaired backend saves bookings, rejects invalid/conflicting requests, protects staff and survives restart", async () => {
  const result = await new Promise<string>((resolve, reject) => {
    const child = execFile("python", ["-c", `import json, os, pathlib, sys, tempfile, subprocess
from datetime import date, timedelta
with tempfile.TemporaryDirectory() as directory:
 root = pathlib.Path(directory)
 for name, content in json.load(sys.stdin).items():
  target = root / name
  target.parent.mkdir(parents=True, exist_ok=True)
  target.write_text(content, encoding='utf-8')
  if name.endswith('.py'): compile(content, name, 'exec')
 os.environ['APP_DATABASE_PATH'] = str(root / 'bookings.sqlite3')
 os.environ['BLOOM_ADMIN_TOKEN'] = 'test-admin-token'
 sys.path.insert(0, str(root / 'backend'))
 from fastapi.testclient import TestClient
 from app.main import app
 client = TestClient(app)
 day = str(date.today() + timedelta(days=1))
 request = dict(date=day, time='10:00', party_size=8, name='Test Guest', email='guest@example.com')
 assert client.get('/api/v1/reservations/availability', params=dict(date=day,time='10:00',party_size=8)).json()['available']
 response = client.post('/api/v1/reservations', json=request)
 assert response.status_code == 201, response.text
 assert response.json()['code'].startswith('BB-')
 assert client.post('/api/v1/reservations', json=request).status_code == 409
 assert not client.get('/api/v1/reservations/availability', params=dict(date=day,time='10:00',party_size=1)).json()['available']
 for update in [dict(party_size=0),dict(party_size=9),dict(email='invalid'),dict(date='2020-01-01'),dict(time='25:00'),dict(name=' ')]:
  assert client.post('/api/v1/reservations', json={**request, **update}).status_code == 422
 assert client.get('/api/v1/staff/reservations').status_code == 403
 records = client.get('/api/v1/staff/reservations', headers={'x-admin-token':'test-admin-token'}).json()
 assert len(records) == 1
 assert client.post('/api/v1/contact', json=dict(name='Guest',email='guest@example.com',message='Hello')).status_code == 201
 code = "from app.repositories.application_repository import repository; assert len(repository.list('reservations')) == 1; assert len(repository.list('inquiries')) == 1; print('restart persistence passed')"
 env = dict(os.environ, PYTHONPATH=str(root / 'backend'))
 completed = subprocess.run([sys.executable,'-c',code], env=env, capture_output=True,text=True)
 assert completed.returncode == 0, completed.stderr
 print('booking, validation, conflict, staff protection and restart persistence passed')
`], { timeout: 30_000, windowsHide: true }, (error, stdout, stderr) => error ? reject(new Error(stderr || error.message)) : resolve(stdout));
    child.stdin?.end(JSON.stringify(bloomBackend));
  });
  assert.match(result, /restart persistence passed/);
});

test("preview uses backend response rather than a random confirmation and keeps source design", () => {
  const html = '<body><script>let resData={}; const x="res-step-2";</script></body>';
  const repaired = repairBloomPreview(html);
  assert.ok(repaired.startsWith(html.slice(0, -7)));
  assert.match(repaired, /await bookingRequest\('\/reservations'/);
  assert.match(repaired, /Not saved:/);
  assert.throws(() => repairBloomPreview("another project"), /refusing/);
});
