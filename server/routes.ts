import type { Request, Response } from "express";
import { Router } from "express";
import { entryBodyFatPct } from "./bodyfat.js";
import { DEMO_ROWS } from "./demo.js";
import { db, initDb } from "./db.js";
import { entryRow, parseBfMethod, parseBirthDate, settingsRow, userRow } from "./normalize.js";

export const apiRouter = Router();

apiRouter.use((_req, _res, next) => {
  initDb();
  next();
});

const DEMO_DATES = DEMO_ROWS.map((r) => r[0]);

type StoredSettings = ReturnType<typeof settingsRow>;

function userIdFromReq(req: Request): number | null {
  const raw = req.headers["x-user-id"];
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

function requireUser(req: Request, res: Response): number | null {
  const id = userIdFromReq(req);
  if (id == null || db.prepare("SELECT 1 FROM users WHERE id = ?").get(id) == null) {
    res.status(400).json({ error: "Missing or invalid X-User-Id" });
    return null;
  }
  return id;
}

function loadSettings(userId: number): StoredSettings {
  const raw = db
    .prepare(
      `SELECT height_cm, goal_body_fat, goal_waist_cm, goal_weight_kg, bf_method, birth_date, plan_total_days, plan_start_date
       FROM user_settings WHERE user_id = ?`
    )
    .get(userId) as Record<string, unknown> | undefined;
  return settingsRow(raw);
}

function entryWithBf(raw: Record<string, unknown>, s: StoredSettings) {
  const r = entryRow(raw);
  return {
    ...r,
    body_fat_pct: entryBodyFatPct(s.bf_method, {
      waistCm: r.waist_cm,
      neckCm: r.neck_cm,
      heightCm: s.height_cm,
      weightKg: r.weight_kg,
      birthDateIso: s.birth_date,
      asOfDateIso: r.entry_date,
    }),
  };
}

apiRouter.get("/users", (_req, res) => {
  const rawRows = db.prepare("SELECT id, name FROM users ORDER BY name COLLATE NOCASE").all() as Record<
    string,
    unknown
  >[];
  res.json(rawRows.map((r) => userRow(r)).filter((u) => u.id > 0 && u.name.length > 0));
});

apiRouter.post("/users", (req, res) => {
  const name = String(req.body?.name ?? "")
    .trim()
    .slice(0, 64);
  if (name.length < 1) {
    res.status(400).json({ error: "Name required" });
    return;
  }
  try {
    db.prepare("INSERT INTO users (name) VALUES (?)").run(name);
    const lr = db.prepare("SELECT last_insert_rowid() AS x").get() as { x: number | bigint };
    const id = Number(lr.x);
    db.prepare(
      `INSERT INTO user_settings (user_id, height_cm, goal_body_fat, goal_waist_cm, goal_weight_kg, bf_method, birth_date, plan_total_days, plan_start_date)
       VALUES (?, 178, 12, 83, 82, 'navy', '1990-01-01', 0, NULL)`
    ).run(id);
    const raw = db.prepare("SELECT id, name FROM users WHERE id = ?").get(id) as Record<string, unknown>;
    res.json(userRow(raw));
  } catch {
    res.status(409).json({ error: "That name is already taken." });
  }
});

apiRouter.delete("/users/:id", (req, res) => {
  if (requireUser(req, res) == null) return;
  const uid = Number(req.params.id);
  if (!Number.isFinite(uid)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const n = (db.prepare("SELECT COUNT(*) AS c FROM users").get() as { c: number }).c;
  if (n <= 1) {
    res.status(400).json({ error: "Cannot delete the last user." });
    return;
  }
  const r = db.prepare("DELETE FROM users WHERE id = ?").run(uid);
  if (r.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post("/profile/reset", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  db.prepare("DELETE FROM entries WHERE user_id = ?").run(userId);
  db.prepare(
    `UPDATE user_settings SET height_cm = 178, goal_body_fat = 12, goal_waist_cm = 83, goal_weight_kg = 82,
     bf_method = 'navy', birth_date = '1990-01-01', plan_total_days = 0, plan_start_date = NULL
     WHERE user_id = ?`
  ).run(userId);
  res.json(loadSettings(userId));
});

apiRouter.get("/settings", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  res.json(loadSettings(userId));
});

apiRouter.put("/settings", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const height_cm = Number(req.body?.height_cm ?? 178);
  const goal_body_fat = Number(req.body?.goal_body_fat ?? 12);
  const goal_waist_cm = Number(req.body?.goal_waist_cm ?? 83);
  const goal_weight_kg = Number(req.body?.goal_weight_kg ?? 82);
  const bf_method = parseBfMethod(req.body?.bf_method);
  const birth_date = parseBirthDate(req.body?.birth_date);
  if (birth_date == null) {
    res.status(400).json({ error: "Invalid birth_date (YYYY-MM-DD)" });
    return;
  }
  const plan_total_days = Math.max(0, Math.min(3650, Math.floor(Number(req.body?.plan_total_days ?? 0))));
  const planStartRaw = req.body?.plan_start_date;
  const plan_start_date =
    planStartRaw == null || String(planStartRaw).trim() === ""
      ? null
      : parseBirthDate(planStartRaw);
  if (plan_total_days > 0 && plan_start_date == null) {
    res.status(400).json({ error: "Set plan start date when plan length is greater than 0." });
    return;
  }
  db.prepare(
    `UPDATE user_settings SET height_cm = ?, goal_body_fat = ?, goal_waist_cm = ?, goal_weight_kg = ?, bf_method = ?, birth_date = ?,
     plan_total_days = ?, plan_start_date = ?
     WHERE user_id = ?`
  ).run(
    height_cm,
    goal_body_fat,
    goal_waist_cm,
    goal_weight_kg,
    bf_method,
    birth_date,
    plan_total_days,
    plan_total_days > 0 ? plan_start_date : null,
    userId
  );
  res.json(loadSettings(userId));
});

apiRouter.get("/entries", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const s = loadSettings(userId);
  const rawRows = db
    .prepare(
      `SELECT id, entry_date, weight_kg, waist_cm, neck_cm FROM entries WHERE user_id = ? ORDER BY entry_date DESC`
    )
    .all(userId) as Record<string, unknown>[];
  res.json(
    rawRows.map((raw) => entryWithBf(raw, s)).filter((row) => row.id > 0 && row.entry_date.length > 0)
  );
});

apiRouter.post("/entries", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const s = loadSettings(userId);
  const entry_date = (req.body?.entry_date as string) ?? new Date().toISOString().slice(0, 10);
  const weight_kg = Number(req.body?.weight_kg);
  const waist_cm = Number(req.body?.waist_cm);
  const neck_cm = Number(req.body?.neck_cm);
  if ([weight_kg, waist_cm, neck_cm].some((n) => Number.isNaN(n))) {
    res.status(400).json({ error: "Invalid numbers" });
    return;
  }
  try {
    db.prepare(
      "INSERT INTO entries (user_id, entry_date, weight_kg, waist_cm, neck_cm) VALUES (?, ?, ?, ?, ?)"
    ).run(userId, entry_date, weight_kg, waist_cm, neck_cm);
  } catch {
    res.status(409).json({ error: "There is already an entry for that date." });
    return;
  }
  const raw = db
    .prepare(
      "SELECT id, entry_date, weight_kg, waist_cm, neck_cm FROM entries WHERE user_id = ? AND entry_date = ?"
    )
    .get(userId, entry_date) as Record<string, unknown> | undefined;
  if (!raw) {
    res.status(500).json({ error: "Could not read saved entry." });
    return;
  }
  res.json(entryWithBf(raw, s));
});

apiRouter.delete("/entries/:id", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const id = Number(req.params.id);
  const r = db.prepare("DELETE FROM entries WHERE id = ? AND user_id = ?").run(id, userId);
  if (r.changes === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json({ ok: true });
});

apiRouter.post("/seed-demo", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const ins = db.prepare(
    "INSERT OR IGNORE INTO entries (user_id, entry_date, weight_kg, waist_cm, neck_cm) VALUES (?, ?, ?, ?, ?)"
  );
  let inserted = 0;
  for (const row of DEMO_ROWS) {
    const r = ins.run(userId, ...row);
    if (r.changes > 0) inserted += 1;
  }
  res.json({ inserted, skipped: DEMO_ROWS.length - inserted });
});

apiRouter.post("/clear-demo", (req, res) => {
  const userId = requireUser(req, res);
  if (userId == null) return;
  const q = DEMO_DATES.map(() => "?").join(",");
  const r = db
    .prepare(`DELETE FROM entries WHERE user_id = ? AND entry_date IN (${q})`)
    .run(userId, ...DEMO_DATES);
  res.json({ deleted: r.changes });
});
