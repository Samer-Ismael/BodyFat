import express from "express";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { initDb } from "./db.js";
import { projectRoot } from "./paths.js";
import { apiRouter } from "./routes.js";

const root = projectRoot();
const isProd = process.env.NODE_ENV === "production";
const clientRoot = path.join(root, "client");
const port = Number(process.env.PORT) || 5070;

async function main() {
  initDb();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  /* One browser origin: localhost → 127.0.0.1 (GET/HEAD only; /api unchanged). */
  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    const h = (req.get("host") ?? "").toLowerCase();
    if (h.startsWith("localhost")) {
      return res.redirect(302, `http://127.0.0.1:${port}${req.originalUrl}`);
    }
    next();
  });

  app.use("/api", apiRouter);

  app.use((req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    next();
  });

  const httpServer = http.createServer(app);

  if (!isProd) {
    const vite = await createViteServer({
      root: clientRoot,
      server: {
        middlewareMode: true,
        hmr: { server: httpServer },
        allowedHosts: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const staticDir = path.join(root, "dist", "client");
    if (!fs.existsSync(staticDir)) {
      console.error("Missing dist/client. Run: npm run build");
      process.exit(1);
    }
    app.use(express.static(staticDir, { index: false, maxAge: 0 }));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(staticDir, "index.html"));
    });
  }

  httpServer.listen(port, "0.0.0.0", () => {
    console.log(`\n  → Open ONLY:  http://127.0.0.1:${port}`);
    console.log(`     (localhost redirects here so you always use one URL)\n`);
    console.log(`Project root: ${root}`);
    if (!isProd) console.log("Dev: Express + Vite (HMR attached to HTTP server).");
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
