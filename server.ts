/**
 * Development / static host for the React single-page app.
 *
 * All `/api/*` traffic is proxied to the PHP backend (php-backend/), which is
 * the single implementation of the platform's business logic. Nothing is faked
 * in Node anymore: in production Apache serves the PHP API and this server is
 * not used at all.
 *
 *   PHP_API_URL  base URL of the PHP dev server (default http://127.0.0.1:8090)
 *   PORT         port for this server (default 3000)
 */
import express from "express";
import dotenv from "dotenv";
import http from "node:http";
import path from "node:path";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const API_TARGET = process.env.PHP_API_URL || "http://127.0.0.1:8090";
const target = new URL(API_TARGET);

/**
 * Minimal streaming reverse proxy: keeps cookies, headers, status codes and
 * request bodies intact so the SPA behaves exactly as it will behind Apache.
 */
const apiProxy = (req: express.Request, res: express.Response) => {
  const headers: Record<string, string | string[]> = {};

  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    // Host must stay the original host so PHP's same-origin check passes.
    if (key === "host" || key === "connection" || key === "content-length") continue;
    headers[key] = value as string | string[];
  }
  headers["host"] = req.headers.host || `127.0.0.1:${PORT}`;
  headers["x-forwarded-host"] = req.headers.host || "";
  headers["x-forwarded-proto"] = req.protocol;

  const proxied = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port || 80,
      method: req.method,
      path: req.originalUrl,
      headers,
    },
    (upstream) => {
      res.status(upstream.statusCode || 502);
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (value === undefined) continue;
        res.setHeader(key, value as string | string[]);
      }
      upstream.pipe(res);
    }
  );

  proxied.on("error", (error) => {
    console.error("[api proxy]", error.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error:
          "The API server is not reachable. Start it with `npm run api:dev`, or run `npm run dev` which starts both.",
      });
    } else {
      res.end();
    }
  });

  req.pipe(proxied);
};

app.use("/api", apiProxy);

/**
 * The dynamic sitemap is served by PHP at /api/sitemap.xml in this dev server
 * (Apache rewrites /sitemap.xml there in production), so crawlers and local
 * checks can hit the same URL they will in production.
 */
app.get("/sitemap.xml", (req, _res, next) => {
  req.url = "/api/sitemap.xml";
  next();
}, apiProxy);

app.use(express.json({ limit: "25mb" }));

async function setupViteOrStatic() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        // The preview host is proxied by the platform, so allow it.
        allowedHosts: true,
      },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Goodlucks Homes app on http://localhost:${PORT} (API proxied to ${API_TARGET})`);
  });
}

setupViteOrStatic();
