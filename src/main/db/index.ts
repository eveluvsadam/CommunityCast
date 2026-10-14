import Database from 'better-sqlite3'
import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

let db: Database.Database | null = null

/**
 * Resolves the on-disk path for the SQLite file. Using Electron's userData
 * directory means the database (and therefore the whole app's state) survives
 * relaunches and app updates without any extra work on our part.
 */
export function getDbPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'communitycast.db')
}

function runMigrations(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name        TEXT PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  // In dev (electron-vite), this file lives under src/main/db/migrations.
  // In a packaged build, main is bundled to out/main, so migrations are
  // copied alongside it — see electron-builder "extraResources" note in README
  // once packaging is set up. For now both paths are checked.
  const candidates = [
    join(__dirname, 'migrations'),
    join(__dirname, '../../src/main/db/migrations')
  ]
  const migrationsDir = candidates.find((p) => existsSync(p))
  if (!migrationsDir) {
    throw new Error(`Could not locate migrations directory. Checked: ${candidates.join(', ')}`)
  }

  const applied = new Set(
    database.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name)
  )

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort() // filenames are prefixed 001_, 002_, ... so lexical sort == order

  const insertMigration = database.prepare('INSERT INTO _migrations (name) VALUES (?)')

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = readFileSync(join(migrationsDir, file), 'utf-8')
    const runMigration = database.transaction(() => {
      database.exec(sql)
      insertMigration.run(file)
    })
    runMigration()
    console.log(`[db] applied migration ${file}`)
  }
}

/** Opens (or returns the already-open) singleton database connection. */
export function getDb(): Database.Database {
  if (db) return db

  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL') // safer for a long-lived, frequently-writing 24/7 process
  db.pragma('foreign_keys = ON')

  runMigrations(db)

  return db
}

export function closeDb(): void {
  db?.close()
  db = null
}
