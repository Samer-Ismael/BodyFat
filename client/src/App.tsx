import { useCallback, useEffect, useMemo, useState } from "react";
import { api, setApiUserId } from "./api";
import { TrendCharts } from "./components/TrendCharts";
import type { BfMethod, Entry, Settings, User } from "./types";

const LS_USER = "bf_tracker_uid";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function sortAsc(rows: Entry[]) {
  return [...rows].sort((a, b) => a.entry_date.localeCompare(b.entry_date));
}

function fmt1(n: number) {
  return Number.isFinite(n) ? n.toFixed(1) : "—";
}

function bfMethodShort(m: BfMethod): string {
  if (m === "navy") return "Navy";
  if (m === "bmi_male") return "BMI · male";
  return "BMI · female";
}

function fileSlug(name: string) {
  const s = name.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return s.length > 0 ? s : "bodyfat";
}

function toCsv(rows: Entry[], s: Settings) {
  const lines = [
    [
      "date",
      "weight_kg",
      "waist_cm",
      "neck_cm",
      "body_fat_pct",
      "height_cm",
      "goal_body_fat_pct",
      "goal_waist_cm",
      "goal_weight_kg",
      "plan_total_days",
      "plan_start_date",
    ].join(","),
    ...sortAsc(rows).map((e) =>
      [
        e.entry_date,
        e.weight_kg,
        e.waist_cm,
        e.neck_cm,
        e.body_fat_pct ?? "",
        s.height_cm,
        s.goal_body_fat,
        s.goal_waist_cm,
        s.goal_weight_kg,
        s.plan_total_days,
        s.plan_start_date ?? "",
      ].join(",")
    ),
  ];
  return lines.join("\r\n");
}

/** Calendar days remaining in a fixed-length plan (day 1 = start date). */
function planDaysRemaining(totalDays: number, startISO: string | null, todayISO: string): number | null {
  if (totalDays < 1 || !startISO || !/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return null;
  const utc = (s: string) => {
    const [y, m, d] = s.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const st = utc(startISO);
  const t = utc(todayISO);
  if (t < st) return totalDays;
  const elapsedDays = Math.floor((t - st) / 86400000) + 1;
  return Math.max(0, totalDays - elapsedDays);
}

export function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<number | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [settingsErr, setSettingsErr] = useState<string | null>(null);
  const [demoMsg, setDemoMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [newUserName, setNewUserName] = useState("");
  const [removeUserId, setRemoveUserId] = useState("");

  const [entryDate, setEntryDate] = useState(todayISO);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [neck, setNeck] = useState("");

  const [hCm, setHCm] = useState("");
  const [goalBf, setGoalBf] = useState("");
  const [goalWaist, setGoalWaist] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [bfMethod, setBfMethod] = useState<BfMethod>("navy");
  const [birthDate, setBirthDate] = useState("");
  const [planTotalDays, setPlanTotalDays] = useState("0");
  const [planStartDate, setPlanStartDate] = useState("");

  const applySettings = useCallback((s: Settings) => {
    setHCm(String(s.height_cm));
    setGoalBf(String(s.goal_body_fat));
    setGoalWaist(String(s.goal_waist_cm));
    setGoalWeight(String(s.goal_weight_kg));
    setBfMethod(s.bf_method);
    setBirthDate(s.birth_date);
    setPlanTotalDays(String(s.plan_total_days));
    setPlanStartDate(s.plan_start_date ?? "");
  }, []);

  const refreshData = useCallback(async () => {
    const [s, list] = await Promise.all([api<Settings>("/settings"), api<Entry[]>("/entries")]);
    setSettings(s);
    setEntries(list);
    applySettings(s);
  }, [applySettings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadError(null);
        const list = await api<User[]>("/users");
        if (cancelled) return;
        if (list.length === 0) {
          setLoadError("No users");
          return;
        }
        setUsers(list);
        const saved = localStorage.getItem(LS_USER);
        const want = saved ? Number(saved) : NaN;
        const pick = list.find((u) => u.id === want)?.id ?? list[0].id;
        setApiUserId(pick);
        setCurrentUserId(pick);
        localStorage.setItem(LS_USER, String(pick));
        await refreshData();
        if (cancelled) return;
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshData]);

  const rowsAsc = useMemo(() => sortAsc(entries), [entries]);

  const currentUserName = useMemo(
    () => users.find((u) => u.id === currentUserId)?.name ?? "",
    [users, currentUserId]
  );

  const stats = useMemo(() => {
    if (!settings || entries.length === 0) return null;
    const latest = entries[0];
    const bfN = latest.body_fat_pct != null && Number.isFinite(latest.body_fat_pct) ? latest.body_fat_pct : null;
    const toGoal = bfN != null ? bfN - settings.goal_body_fat : null;
    return { latest, bf: bfN, toGoal: toGoal != null && Number.isFinite(toGoal) ? toGoal : null };
  }, [entries, settings]);

  const planDaysLeft = useMemo(() => {
    if (!settings) return null;
    return planDaysRemaining(settings.plan_total_days, settings.plan_start_date, todayISO());
  }, [settings]);

  async function onSelectUser(id: number) {
    setDemoMsg(null);
    setFormErr(null);
    setSettingsErr(null);
    setApiUserId(id);
    setCurrentUserId(id);
    localStorage.setItem(LS_USER, String(id));
    await refreshData();
  }

  async function onAddUser(e: React.FormEvent) {
    e.preventDefault();
    const name = newUserName.trim().slice(0, 64);
    if (name.length < 1) return;
    setDemoMsg(null);
    try {
      const u = await api<User>("/users", { method: "POST", body: JSON.stringify({ name }) });
      const list = await api<User[]>("/users");
      setUsers(list);
      setApiUserId(u.id);
      setCurrentUserId(u.id);
      localStorage.setItem(LS_USER, String(u.id));
      await refreshData();
      setNewUserName("");
    } catch (err) {
      setDemoMsg({ text: err instanceof Error ? err.message : "Error", ok: false });
    }
  }

  async function onRemoveUser() {
    const id = Number(removeUserId);
    if (!Number.isFinite(id) || id < 1) return;
    const victim = users.find((u) => u.id === id);
    if (!victim) return;
    const warn =
      `You are about to PERMANENTLY delete user "${victim.name}" and ALL their measurements.\n\nThis cannot be undone. Continue?`;
    if (!window.confirm(warn)) return;
    const typed = window.prompt(`Type this user's name exactly to confirm deletion:\n\n${victim.name}`);
    if (typed == null) {
      setSettingsErr("Cancelled.");
      return;
    }
    if (typed.trim() !== victim.name) {
      setSettingsErr("Name did not match. Nothing was deleted.");
      return;
    }
    setSettingsErr(null);
    try {
      await api(`/users/${id}`, { method: "DELETE" });
      const list = await api<User[]>("/users");
      setUsers(list);
      setRemoveUserId("");
      if (currentUserId === id) {
        const next = list[0]?.id;
        if (next) {
          setApiUserId(next);
          setCurrentUserId(next);
          localStorage.setItem(LS_USER, String(next));
          await refreshData();
        }
      } else {
        await refreshData();
      }
    } catch (err) {
      setSettingsErr(err instanceof Error ? err.message : "Error");
    }
  }

  async function onResetProfile() {
    const warn =
      `This will DELETE every measurement for "${currentUserName}" and reset ALL settings (goals, height, formula, birth date, plan) to defaults.\n\nYour user name will stay. This cannot be undone. Continue?`;
    if (!window.confirm(warn)) return;
    const typed = window.prompt("Type RESET in capitals to confirm:");
    if (typed == null) {
      setSettingsErr("Cancelled.");
      return;
    }
    if (typed !== "RESET") {
      setSettingsErr('You must type exactly: RESET');
      return;
    }
    setSettingsErr(null);
    try {
      await api<Settings>("/profile/reset", { method: "POST" });
      await refreshData();
    } catch (err) {
      setSettingsErr(err instanceof Error ? err.message : "Error");
    }
  }

  async function onSaveEntry(e: React.FormEvent) {
    e.preventDefault();
    setFormErr(null);
    try {
      await api("/entries", {
        method: "POST",
        body: JSON.stringify({
          entry_date: entryDate,
          weight_kg: parseFloat(weight),
          waist_cm: parseFloat(waist),
          neck_cm: parseFloat(neck),
        }),
      });
      setWeight("");
      setWaist("");
      setNeck("");
      setEntryDate(todayISO());
      await refreshData();
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : "Error");
    }
  }

  async function onSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsErr(null);
    try {
      const pDays = Math.max(0, Math.min(3650, Math.floor(parseFloat(planTotalDays) || 0)));
      if (pDays > 0 && !planStartDate.trim()) {
        setSettingsErr("Set plan start date when plan length is greater than 0.");
        return;
      }
      await api("/settings", {
        method: "PUT",
        body: JSON.stringify({
          height_cm: parseFloat(hCm),
          goal_body_fat: parseFloat(goalBf),
          goal_waist_cm: parseFloat(goalWaist),
          goal_weight_kg: parseFloat(goalWeight),
          bf_method: bfMethod,
          birth_date: birthDate,
          plan_total_days: pDays,
          plan_start_date: pDays > 0 ? planStartDate : "",
        }),
      });
      await refreshData();
    } catch (err) {
      setSettingsErr(err instanceof Error ? err.message : "Error");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this entry?")) return;
    await api(`/entries/${id}`, { method: "DELETE" });
    await refreshData();
  }

  async function onSeedDemo() {
    setDemoMsg(null);
    try {
      const r = await api<{ inserted: number; skipped: number }>("/seed-demo", { method: "POST" });
      await refreshData();
      setDemoMsg({
        text: r.inserted > 0 ? `+${r.inserted}` : "already there",
        ok: true,
      });
    } catch (e) {
      setDemoMsg({ text: e instanceof Error ? e.message : "Error", ok: false });
    }
  }

  async function onClearDemo() {
    setDemoMsg(null);
    try {
      const r = await api<{ deleted: number }>("/clear-demo", { method: "POST" });
      await refreshData();
      setDemoMsg({ text: r.deleted ? `−${r.deleted}` : "none", ok: true });
    } catch (e) {
      setDemoMsg({ text: e instanceof Error ? e.message : "Error", ok: false });
    }
  }

  function onExportCsv() {
    if (!settings || entries.length === 0) return;
    const blob = new Blob([toCsv(entries, settings)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${fileSlug(currentUserName)}-bodyfat.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (loadError) {
    return (
      <main>
        <p className="err">Could not load: {loadError}</p>
      </main>
    );
  }

  if (!settings || currentUserId == null) {
    return (
      <main>
        <p className="sub">Loading…</p>
      </main>
    );
  }

  return (
    <main>
      <header className="page-header">
        <div className="header-main">
          <div>
            <h1>Body fat tracker</h1>
            <p className="tagline">
              Navy (waist · neck) or BMI Deurenberg (weight · height · date of birth) — Settings.
            </p>
          </div>
          <div className="user-toolbar">
            <label className="user-toolbar-label" htmlFor="user-sel">
              User
            </label>
            <select
              id="user-sel"
              className="user-select"
              value={currentUserId}
              onChange={(e) => onSelectUser(Number(e.target.value))}
            >
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <form className="add-user-form" onSubmit={onAddUser}>
              <input
                type="text"
                placeholder="New user"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                maxLength={64}
                aria-label="New user name"
              />
              <button type="submit" className="ghost ghost--sm">
                Add
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="stats" aria-live="polite">
        <div className={`stat${!stats ? " stat--muted" : ""}`}>
          <div className="stat-label">Body fat</div>
          <div className="stat-value">{stats?.bf == null ? "—" : `${stats.bf.toFixed(2)} %`}</div>
          {stats && (
            <>
              <div className="stat-hint">{bfMethodShort(settings.bf_method)}</div>
              {stats.toGoal != null && Number.isFinite(stats.toGoal) && (
                <div className={`stat-hint ${stats.toGoal <= 0 ? "pos" : "neg"}`}>
                  {stats.toGoal <= 0 ? `${Math.abs(stats.toGoal).toFixed(1)} % vs goal` : `+${stats.toGoal.toFixed(1)} % vs goal`}
                </div>
              )}
            </>
          )}
          {!stats && <div className="stat-hint">Add an entry</div>}
        </div>
        <div className={`stat${!stats ? " stat--muted" : ""}`}>
          <div className="stat-label">Weight</div>
          <div className="stat-value">
            {stats ? (
              <>
                {fmt1(stats.latest.weight_kg)}
                <span className="stat-unit">kg</span>
              </>
            ) : (
              "—"
            )}
          </div>
          {stats && <div className="stat-hint">Goal {settings.goal_weight_kg} kg</div>}
        </div>
        <div className={`stat${!stats ? " stat--muted" : ""}`}>
          <div className="stat-label">Waist</div>
          <div className="stat-value">
            {stats ? (
              <>
                {fmt1(stats.latest.waist_cm)}
                <span className="stat-unit">cm</span>
              </>
            ) : (
              "—"
            )}
          </div>
          {stats && <div className="stat-hint">Goal {settings.goal_waist_cm} cm</div>}
        </div>
        <div className="stat">
          <div className="stat-label">Log</div>
          <div className="stat-value">{entries.length}</div>
          <div className="stat-hint">{stats ? stats.latest.entry_date : "No entries yet"}</div>
          {planDaysLeft != null && (
            <div className={`stat-hint ${planDaysLeft === 0 ? "neg" : ""}`}>
              {planDaysLeft} day{planDaysLeft === 1 ? "" : "s"} left in plan
            </div>
          )}
        </div>
      </div>

      <div className="goals-bar">
        <span>
          <span className="goals-bar-k">Height</span> <strong>{settings.height_cm}</strong> cm
        </span>
        <span>
          <span className="goals-bar-k">BF goal</span> <strong>{settings.goal_body_fat}</strong> %
        </span>
        <span>
          <span className="goals-bar-k">Waist goal</span> <strong>{settings.goal_waist_cm}</strong> cm
        </span>
        <span>
          <span className="goals-bar-k">Weight goal</span> <strong>{settings.goal_weight_kg}</strong> kg
        </span>
      </div>

      <section className="panel">
        <h2>New entry</h2>
        <form onSubmit={onSaveEntry}>
          <div className="row">
            <div>
              <label htmlFor="d">Date</label>
              <input id="d" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="w">Weight (kg)</label>
              <input id="w" type="number" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="wa">Waist (cm)</label>
              <input id="wa" type="number" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="n">Neck (cm)</label>
              <input id="n" type="number" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="primary">
            Save
          </button>
          {formErr && <div className="err">{formErr}</div>}
        </form>
      </section>

      <section className="panel">
        <div className="section-head section-head--tight">
          <h2>Trends</h2>
          <div className="inline-actions">
            <button type="button" className="ghost ghost--sm" onClick={onSeedDemo}>
              Demo
            </button>
            <button type="button" className="ghost ghost--sm" onClick={onClearDemo}>
              Clear demo
            </button>
          </div>
        </div>
        {demoMsg && <p className={`demo-msg ${demoMsg.ok ? "ok" : "err"}`}>{demoMsg.text}</p>}
        <TrendCharts rowsAsc={rowsAsc} settings={settings} />
      </section>

      <details className="settings-details">
        <summary>Settings</summary>
        <section className="panel panel--nested">
          <form onSubmit={onSaveSettings}>
            <div className="row">
              <div>
                <label htmlFor="hc">Height (cm)</label>
                <input id="hc" type="number" step="0.1" value={hCm} onChange={(e) => setHCm(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="bfm">Body fat formula</label>
                <select
                  id="bfm"
                  value={bfMethod}
                  onChange={(e) => setBfMethod(e.target.value as BfMethod)}
                >
                  <option value="navy">Navy — waist &amp; neck</option>
                  <option value="bmi_male">BMI Deurenberg — male</option>
                  <option value="bmi_female">BMI Deurenberg — female</option>
                </select>
              </div>
              <div>
                <label htmlFor="bd">Date of birth</label>
                <input id="bd" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="gbf">BF goal (%)</label>
                <input id="gbf" type="number" step="0.1" value={goalBf} onChange={(e) => setGoalBf(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="gw">Waist goal (cm)</label>
                <input id="gw" type="number" step="0.1" value={goalWaist} onChange={(e) => setGoalWaist(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="gwt">Weight goal (kg)</label>
                <input id="gwt" type="number" step="0.1" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} required />
              </div>
              <div>
                <label htmlFor="pl">Plan length (days)</label>
                <input
                  id="pl"
                  type="number"
                  step="1"
                  min={0}
                  max={3650}
                  value={planTotalDays}
                  onChange={(e) => setPlanTotalDays(e.target.value)}
                  required
                />
              </div>
              <div>
                <label htmlFor="psd">Plan start date</label>
                <input
                  id="psd"
                  type="date"
                  value={planStartDate}
                  onChange={(e) => setPlanStartDate(e.target.value)}
                  disabled={Math.max(0, parseInt(planTotalDays, 10) || 0) < 1}
                />
              </div>
            </div>
            <p className="settings-hint">Set plan length to 0 to hide the countdown. If length &gt; 0, pick the first day of the plan.</p>
            <button type="submit" className="ghost">
              Save settings
            </button>
            {settingsErr && <div className="err">{settingsErr}</div>}
          </form>

          <div className="danger-zone">
            <h3 className="danger-zone-title">Danger zone</h3>
            <p className="danger-zone-text">
              Reset removes all measurements and default-settings this profile (name unchanged). Delete user removes that person entirely (not allowed for the last user).
            </p>
            <div className="danger-zone-actions">
              <button type="button" className="danger" onClick={onResetProfile}>
                Reset this profile
              </button>
              {users.length > 1 && (
                <div className="danger-delete-row">
                  <select
                    className="danger-select"
                    value={removeUserId}
                    onChange={(e) => setRemoveUserId(e.target.value)}
                    aria-label="User to delete"
                  >
                    <option value="">Delete user…</option>
                    {users.map((u) => (
                      <option key={u.id} value={String(u.id)}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="danger" disabled={!removeUserId} onClick={onRemoveUser}>
                    Delete user
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      </details>

      <section className="panel">
        <div className="section-head section-head--tight">
          <h2>History</h2>
          <button type="button" className="ghost ghost--sm" onClick={onExportCsv} disabled={entries.length === 0}>
            CSV
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="sub sub--inline">—</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Weight</th>
                <th className="num">Waist</th>
                <th className="num">Neck</th>
                <th className="num">BF %</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td>{e.entry_date}</td>
                  <td className="num">{e.weight_kg}</td>
                  <td className="num">{e.waist_cm}</td>
                  <td className="num">{e.neck_cm}</td>
                  <td className="num">{e.body_fat_pct == null ? "—" : e.body_fat_pct.toFixed(2)}</td>
                  <td>
                    <button type="button" className="danger" onClick={() => onDelete(e.id)}>
                      Del
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
