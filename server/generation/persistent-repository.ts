export const persistentRepository = `import json, os, sqlite3
from pathlib import Path
from contextlib import contextmanager
from contextvars import ContextVar
from uuid import uuid4

class Repository:
    def __init__(self, path=None):
        self.path = path or os.environ.get('APP_DATABASE_PATH', 'data/application.sqlite3')
        self._active = ContextVar('repository_transaction', default=None)
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(collection,id))')
            db.execute('CREATE TABLE IF NOT EXISTS record_ids (id INTEGER PRIMARY KEY AUTOINCREMENT, collection TEXT NOT NULL)')
    @contextmanager
    def connect(self):
        active = self._active.get()
        if active is not None:
            yield active[0]
            return
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db: yield db
        finally: db.close()
    @contextmanager
    def transaction(self, write=True):
        if type(write) is not bool:
            raise ValueError('write must be a boolean')
        active = self._active.get()
        if active is not None:
            if write and not active[1]:
                raise ValueError('Cannot write in a read-only transaction')
            name = 'nested_' + uuid4().hex
            active[0].execute('SAVEPOINT ' + name)
            try:
                yield self
                active[0].execute('RELEASE SAVEPOINT ' + name)
            except BaseException:
                active[0].execute('ROLLBACK TO SAVEPOINT ' + name)
                active[0].execute('RELEASE SAVEPOINT ' + name)
                raise
            return
        with self.connect() as db:
            if not write:
                db.execute('PRAGMA query_only=ON')
            db.execute('BEGIN IMMEDIATE' if write else 'BEGIN')
            token = self._active.set((db, write))
            try:
                yield self
            finally:
                self._active.reset(token)
    def _require_write(self):
        active = self._active.get()
        if active is not None and not active[1]:
            raise ValueError('Cannot write in a read-only transaction')
    def next_id(self, collection='default'):
        self._require_write()
        with self.transaction(write=True):
            with self.connect() as db:
                while True:
                    value = db.execute('INSERT INTO record_ids(collection) VALUES(?)', (collection,)).lastrowid
                    if db.execute('SELECT 1 FROM records WHERE collection=? AND id=?', (collection, str(value))).fetchone() is None:
                        return value
    def list(self, collection='default'):
        with self.connect() as db:
            return [json.loads(row[0]) for row in db.execute('SELECT payload FROM records WHERE collection=? ORDER BY rowid', (collection,))]
    def get(self, record_id, collection='default'):
        with self.connect() as db:
            row = db.execute('SELECT payload FROM records WHERE collection=? AND id=?', (collection, record_id)).fetchone()
            return json.loads(row[0]) if row else None
    def save(self, collection, record=None):
        self._require_write()
        if record is None: record, collection = collection, 'default'
        payload = json.dumps(record)
        with self.connect() as db:
            db.execute('INSERT INTO records(collection,id,payload) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET payload=excluded.payload', (collection, record['id'], payload))
        return record
    def delete(self, record_id, collection='default'):
        self._require_write()
        with self.connect() as db:
            row = db.execute('SELECT payload FROM records WHERE collection=? AND id=?', (collection, record_id)).fetchone()
            db.execute('DELETE FROM records WHERE collection=? AND id=?', (collection, record_id))
            return json.loads(row[0]) if row else None
repository = Repository()
`;
