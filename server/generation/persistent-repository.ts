export const persistentRepository = `import json, os, sqlite3
from pathlib import Path
from contextlib import contextmanager

class Repository:
    def __init__(self, path=None):
        self.path = path or os.environ.get('APP_DATABASE_PATH', 'data/application.sqlite3')
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id))')
    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db: yield db
        finally: db.close()
    def list(self, collection='default'):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT payload FROM records WHERE collection=? ORDER BY rowid', (collection,))]
    def get(self, record_id, collection='default'):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM records WHERE collection=? AND id=?', (collection, record_id)).fetchone()
            return json.loads(row[0]) if row else None
    def save(self, collection, record=None):
        if record is None: record, collection = collection, 'default'
        payload = json.dumps(record)
        with self.connect() as db:
            db.execute('INSERT INTO records(collection,id,payload) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload', (collection, record['id'], payload))
        return record
    def delete(self, record_id, collection='default'):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM records WHERE collection=? AND id=?', (collection, record_id)).fetchone()
            db.execute('DELETE FROM records WHERE collection=? AND id=?', (collection, record_id))
            return json.loads(row[0]) if row else None
repository = Repository()
`;
