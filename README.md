# Body fat tracker

A small **self-hosted** web app to log weight, waist, and neck measurements, estimate **body fat %** (US Navy tape method or **BMI Deurenberg**), and view **trends** with goal lines. Data lives in a local **SQLite** file.

![Node](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)

## Features

- **Multi-user** — switch people from a dropdown; each user has their own entries, goals, height, formula, and date of birth.
- **Body fat formulas**
  - **Navy** — waist & neck (cm) + height from settings.
  - **BMI Deurenberg** — weight, height, and **date of birth** (age is computed per measurement date).
- **Charts** — body fat %, weight, waist & neck, with dashed **goal** lines.
- **CSV export** — per user; filename includes the user name.
- **Demo data** — optional sample rows to try the charts.
- Single **Express** server in dev: API + **Vite** HMR on one port (**5070**).

## Requirements

- [Node.js](https://nodejs.org/) **≥ 22.13** (uses `node:sqlite`).

## Quick start

```bash
git clone https://github.com/Samer-Ismael/BodyFat.git
cd BodyFat
npm install
npm run dev
```

Open **`http://127.0.0.1:5070`** (the app redirects `localhost` to this URL so bookmarks stay consistent).

The database file **`bodyfat.db`** is created next to the project on first run.

## Scripts

| Command        | Description                                      |
| -------------- | ------------------------------------------------ |
| `npm run dev`  | Dev server + Vite (watch with `tsx`).            |
| `npm run build`| Production client bundle + compile server TS.    |
| `npm start`    | Run compiled server from `dist/` (set `NODE_ENV=production` for static assets). |

After `npm run build`:

```bash
set NODE_ENV=production
npm start
```

(On Linux/macOS: `NODE_ENV=production npm start`.)

## Project layout

```
BodyFat/
├── client/src/     # React UI (Vite)
├── server/         # Express API, SQLite, Navy / BMI math
├── bodyfat.db      # SQLite (created locally; not in git)
└── dist/           # Production build output
```

## API notes

- Most routes expect header **`X-User-Id`** (the active user from the UI).
- **`GET /api/users`** and **`POST /api/users`** work without that header (bootstrap / add user).

## Disclaimer

Body fat **estimates** are not medical measurements. Use for tracking trends only, not clinical decisions.

## License

MIT
