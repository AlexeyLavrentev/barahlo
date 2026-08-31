import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const sqlite = new Database(process.env.DATABASE_PATH ?? './data/app.db')
sqlite.pragma('journal_mode = WAL') // persistent per-DB file; README-recommended
sqlite.pragma('foreign_keys = ON') // SQLite default is OFF — per connection!
sqlite.pragma('busy_timeout = 5000') // host-side migrate can briefly overlap a running container

export const db = drizzle(sqlite)
