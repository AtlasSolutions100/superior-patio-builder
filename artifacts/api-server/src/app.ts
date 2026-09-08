import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

/**
 * Single-service mode: when WEB_DIST points at the built front end, this
 * server also serves it, so the whole app is one process on one port (no
 * CORS, no reverse proxy, no routing rules). Used by the Docker image and
 * any container host.
 *
 * On Replit the web app is a separate static artifact and WEB_DIST is unset,
 * so nothing here runs and that setup is unchanged.
 */
const webDist = process.env.WEB_DIST;
if (webDist) {
  const dir = path.resolve(webDist);
  const indexHtml = path.join(dir, "index.html");
  if (!fs.existsSync(indexHtml)) {
    logger.error({ dir }, "WEB_DIST is set but has no index.html — not serving the web app");
  } else {
    // Hashed assets are immutable; index.html must never be cached or users
    // keep booting an old bundle after a deploy.
    app.use(
      express.static(dir, {
        index: false,
        setHeaders(res, filePath) {
          res.setHeader(
            "Cache-Control",
            filePath.endsWith("index.html")
              ? "no-cache"
              : "public, max-age=31536000, immutable",
          );
        },
      }),
    );
    // SPA fallback: anything not matched above and not an API call renders the
    // app, so deep links like /board survive a refresh.
    app.get(/.*/, (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(indexHtml);
    });
    logger.info({ dir }, "Serving the web app from this server");
  }
}

export default app;
