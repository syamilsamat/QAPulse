import express, { type Express } from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import router from "./routes";
import { requestCache } from "./middleware/request-cache";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("etag", false);
app.set("trust proxy", 1);

// Dashboard/list endpoints return large, highly repetitive JSON (arrays of
// rows sharing the same keys), which gzips to roughly a tenth of its size.
// Registered before the routes so every JSON response is covered.
app.use(compression({ threshold: 1024 }));

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  message: { error: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

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

const allowedCorsOrigins = (process.env.CORS_ORIGIN ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  // Same-origin requests do not need CORS. Cross-origin browser access is
  // denied by default and must be explicitly allowlisted in production.
  origin(origin, callback) {
    callback(null, !origin || allowedCorsOrigins.includes(origin));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false,
  maxAge: 86400,
}));

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Establishes the per-request memo store the access helpers read from.
// Must wrap the API router, not sit beside it.
app.use("/api", requestCache);

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/refresh", authLimiter);
app.use("/api", apiLimiter);
app.use("/api", router);

export default app;
