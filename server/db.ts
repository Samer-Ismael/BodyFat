import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { parseBfMethod, parseBirthDate } from "./normalize.js";
import { projectRoot } from "./paths.js";

const dbPathRaw = process.env.BODYFAT_DB_PATH?.trim();
const dbPath = dbPathRaw
  ? path.resolve(dbPathRaw)
  : path.join(projectRoot(), "bodyfat.db");
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}
export const db = new DatabaseSync(dbPath);

function tableExists(name: string): boolean {
  const row = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name) as { 1: number } | undefined;
  return row != null;
}

function migrateLegacyToMultiUser(): void {
  const raw = db.prepare("SELECT * FROM settings WHERE id = 1").get() as Record<string, unknown> | undefined;
  const height_cm = Number(raw?.height_cm ?? 178);
  const goal_body_fat = Number(raw?.goal_body_fat ?? 12);
  const goal_waist_cm = Number(raw?.goal_waist_cm ?? 83);
  const goal_weight_kg = Number(raw?.goal_weight_kg ?? 82);
  const bf_method = parseBfMethod(raw?.bf_method);
  let birth_date = parseBirthDate(raw?.birth_date) ?? "1990-01-01";
  if (birth_date === "1990-01-01" && raw?.age_years != null) {
    const age = Math.round(Number(raw.age_years));
    if (Number.isFinite(age) && age >= 16 && age <= 100) {
      const d = db.prepare("SELECT date('now', '-' || ? || ' years') AS d").get(String(age)) as { d: string } | undefined;
      if (d?.d) birth_date = d.d;
    }
  }

  db.exec("BEGIN");
  try {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE COLLATE NOCASE);
      INSERT INTO users (name) VALUES ('Me');
    `);
    const userId = (db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number }).id;

    db.exec(`
      CREATE TABLE entries_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entry_date TEXT NOT NULL,
        weight_kg REAL NOT NULL,
        waist_cm REAL NOT NULL,
        neck_cm REAL NOT NULL,
        UNIQUE(user_id, entry_date)
      );
    `);
    db.prepare(
      `INSERT INTO entries_new (id, user_id, entry_date, weight_kg, waist_cm, neck_cm)
       SELECT id, ?, entry_date, weight_kg, waist_cm, neck_cm FROM entries`
    ).run(userId);
    db.exec("DROP TABLE entries");
    db.exec("ALTER TABLE entries_new RENAME TO entries");

    db.exec(`
      CREATE TABLE user_settings (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        height_cm REAL NOT NULL DEFAULT 178,
        goal_body_fat REAL NOT NULL DEFAULT 12,
        goal_waist_cm REAL NOT NULL DEFAULT 83,
        goal_weight_kg REAL NOT NULL DEFAULT 82,
        bf_method TEXT NOT NULL DEFAULT 'navy',
        birth_date TEXT NOT NULL DEFAULT '1990-01-01',
        plan_total_days INTEGER NOT NULL DEFAULT 0,
        plan_start_date TEXT
      );
    `);
    db.prepare(
      `INSERT INTO user_settings (user_id, height_cm, goal_body_fat, goal_waist_cm, goal_weight_kg, bf_method, birth_date, plan_total_days, plan_start_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, NULL)`
    ).run(userId, height_cm, goal_body_fat, goal_waist_cm, goal_weight_kg, bf_method, birth_date);

    db.exec("DROP TABLE settings");
    db.exec("COMMIT");
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw e;
  }
}

function createFreshMultiUserSchema(): void {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE
    );
    CREATE TABLE user_settings (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      height_cm REAL NOT NULL DEFAULT 178,
      goal_body_fat REAL NOT NULL DEFAULT 12,
      goal_waist_cm REAL NOT NULL DEFAULT 83,
      goal_weight_kg REAL NOT NULL DEFAULT 82,
      bf_method TEXT NOT NULL DEFAULT 'navy',
      birth_date TEXT NOT NULL DEFAULT '1990-01-01',
      plan_total_days INTEGER NOT NULL DEFAULT 0,
      plan_start_date TEXT
    );
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_date TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      waist_cm REAL NOT NULL,
      neck_cm REAL NOT NULL,
      UNIQUE(user_id, entry_date)
    );
  `);
  db.prepare("INSERT INTO users (name) VALUES ('Me')").run();
  const uid = (db.prepare("SELECT id FROM users LIMIT 1").get() as { id: number }).id;
  db.prepare(
    `INSERT INTO user_settings (user_id, height_cm, goal_body_fat, goal_waist_cm, goal_weight_kg, bf_method, birth_date, plan_total_days, plan_start_date)
     VALUES (?, 178, 12, 83, 82, 'navy', '1990-01-01', 0, NULL)`
  ).run(uid);
}

function migrateUserSettingsPlanColumns(): void {
  try {
    db.exec("ALTER TABLE user_settings ADD COLUMN plan_total_days INTEGER NOT NULL DEFAULT 0");
  } catch {
    /* exists */
  }
  try {
    db.exec("ALTER TABLE user_settings ADD COLUMN plan_start_date TEXT");
  } catch {
    /* exists */
  }
}

export function initDb(): void {
  db.exec("PRAGMA foreign_keys = ON");

  if (tableExists("users")) {
    migrateUserSettingsPlanColumns();
    return;
  }

  if (tableExists("settings")) {
    migrateLegacyToMultiUser();
    return;
  }

  createFreshMultiUserSchema();
}
