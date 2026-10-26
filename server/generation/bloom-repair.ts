import { persistentRepository } from "./persistent-repository.ts";

export const bloomBackend: Record<string, string> = {
  "backend/app/repositories/application_repository.py": persistentRepository,
  "backend/requirements.txt": "fastapi==0.116.1\nuvicorn==0.35.0\npydantic[email]==2.11.7\nhttpx==0.28.1\npytest==8.4.1\n",
  "backend/app/main.py": `from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import FileResponse
from app.api.routes import router
app = FastAPI(title='Bloom & Brew')
app.include_router(router, prefix='/api/v1')
@app.get('/health')
def health(): return {'status': 'ok'}
@app.get('/')
def homepage(): return FileResponse(Path(__file__).resolve().parents[2] / 'frontend' / 'preview.html')
`,
  "backend/app/schemas/contracts.py": `from datetime import date as Date
from pydantic import BaseModel, EmailStr, Field, field_validator
class ReservationCreate(BaseModel):
    date: Date
    time: str
    party_size: int = Field(ge=1, le=8)
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    @field_validator('name')
    @classmethod
    def valid_name(cls, value):
        if not value.strip(): raise ValueError('Name is required')
        return value.strip()
class ContactCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    message: str = Field(min_length=1, max_length=2000)
`,
  "backend/app/security/access_control.py": `import hmac, os
from fastapi import Header, HTTPException
def require_staff(x_admin_token: str = Header(default='')):
    expected = os.environ.get('BLOOM_ADMIN_TOKEN', '')
    if not expected or not hmac.compare_digest(expected, x_admin_token):
        raise HTTPException(status_code=403, detail='Staff access required')
`,
  "backend/app/services/application_service.py": `import json, uuid
from datetime import date
from fastapi import HTTPException
from app.repositories.application_repository import repository
SLOTS = ['09:00', '10:00', '11:00']
CAPACITY = 8
class BloomService:
    @staticmethod
    def validate(day, size, time=None):
        if day < date.today() or not 1 <= size <= CAPACITY or (time is not None and time not in SLOTS):
            raise HTTPException(422, 'Invalid date, time or party size')
    @staticmethod
    def remaining(db, day, time):
        records = db.execute('SELECT payload FROM records WHERE collection=?', ('reservations',)).fetchall()
        used = sum(r['party_size'] for (raw,) in records if (r := json.loads(raw))['date'] == str(day) and r['time'] == time)
        return CAPACITY - used
    @staticmethod
    def check_availability(day, size, time=None):
        BloomService.validate(day, size, time)
        with repository.connect() as db:
            slots = [slot for slot in SLOTS if BloomService.remaining(db, day, slot) >= size]
        return {'available': time in slots if time else bool(slots), 'available_slots': slots}
    @staticmethod
    def create_booking(request):
        BloomService.validate(request.date, request.party_size, request.time)
        record = request.model_dump(mode='json')
        record.update(id=str(uuid.uuid4()), code='BB-' + uuid.uuid4().hex[:10].upper())
        with repository.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            if BloomService.remaining(db, request.date, request.time) < request.party_size:
                raise HTTPException(409, 'This slot is full; choose another time')
            db.execute('INSERT INTO records(collection,id,payload) VALUES(?,?,?)', ('reservations', record['id'], json.dumps(record)))
        return {'id': record['id'], 'code': record['code'], 'status': 'confirmed'}
    @staticmethod
    def save_inquiry(request):
        record = request.model_dump(mode='json')
        record['id'] = str(uuid.uuid4())
        repository.save('inquiries', record)
        return {'status': 'saved'}
`,
  "backend/app/api/routes.py": `from datetime import date as Date
from fastapi import APIRouter, Depends, Query
from app.schemas.contracts import ReservationCreate, ContactCreate
from app.services.application_service import BloomService
from app.repositories.application_repository import repository
from app.security.access_control import require_staff
router = APIRouter()
@router.get('/menu')
def menu(): return {'categories': ['Coffee', 'Tea', 'Brunch', 'Pastries'], 'items': repository.list('menu_items')}
@router.get('/reservations/availability')
def availability(date: Date, party_size: int = Query(ge=1, le=8), time: str | None = None):
    return BloomService.check_availability(date, party_size, time)
@router.post('/reservations', status_code=201)
def reserve(request: ReservationCreate): return BloomService.create_booking(request)
@router.post('/contact', status_code=201)
def contact(request: ContactCreate): return BloomService.save_inquiry(request)
@router.get('/staff/reservations', dependencies=[Depends(require_staff)])
def reservations(): return repository.list('reservations')
`,
};

export function repairBloomPreview(html: string): string {
  const adapter = `<script>
// Requests only work when served by the repaired backend, not ForgeWeb's offline sandbox.
async function bookingRequest(path, options) {
  const response = await fetch('/api/v1' + path, options);
  if (!response.ok) { const body = await response.json(); throw new Error(typeof body.detail === 'string' ? body.detail : 'Check your details and try again'); }
  return response.json();
}
document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['res-step-1','res-step-2'].includes(form.id)) return;
  event.preventDefault(); event.stopImmediatePropagation();
  if (!form.reportValidity()) return;
  const button = form.querySelector('button[type="submit"]');
  const label = button.textContent; button.disabled = true; button.textContent = 'Saving…';
  try {
    if (form.id === 'res-step-1') {
      const query = new URLSearchParams({date:resData.date,time:resData.time,party_size:String(resData.size)});
      const result = await bookingRequest('/reservations/availability?' + query);
      if (!result.available) throw new Error('This slot is full; choose another time');
      resStep=2; renderReservation();
    } else {
      const result = await bookingRequest('/reservations', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:resData.date,time:resData.time,party_size:Number(resData.size),name:document.getElementById('res-name').value,email:document.getElementById('res-email').value})});
      showToast('Reservation saved: ' + result.code); resStep=1; navigate('home');
    }
  } catch(error) { showToast('Not saved: ' + error.message + '. Open the backend-served site for real bookings.'); }
  finally { button.disabled=false; button.textContent=label; }
}, true);
</script>`;
  if (!html.includes('res-step-2') || !html.includes('let resData=')) throw new Error('Unexpected Bloom preview; refusing to modify another design');
  return html.replace('</body>', adapter + '</body>');
}
