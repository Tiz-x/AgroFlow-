import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import farmerRoutes from "./routes/farmers";
import fieldRoutes from "./routes/fields";
import alertRoutes from "./routes/alerts";
import userRoutes from "./routes/users";
import contentRoutes from "./routes/content";
import listingRoutes from "./routes/listings";
import aiRoutes from "./routes/ai";
import chatRoutes from "./routes/chat";
import buyerRoutes from "./routes/buyers";
import roleRoutes from "./routes/role";
import voiceRoutes from "./routes/voice";
import ordersRouter from "./routes/orders";
import reviewsRouter from "./routes/reviews";
import adminRouter from './routes/admin'
import sellerRoutes from './routes/sellers'
import pushRouter from './routes/push'
import prisma from "./db/index";

if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

// ── Fail fast on missing critical config ───────────────────────────
// Without this the server booted happily and then rejected every single
// login with a confusing "invalid token" error instead of telling anyone
// the secret was never set.
const REQUIRED_ENV = ["JWT_SECRET", "DATABASE_URL"] as const;
const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  console.error(
    `❌ Missing required environment variables: ${missingEnv.join(", ")}`,
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS: Allow specific origins from environment ──────────────────
// Entries are trimmed because "a.com, b.com" (with a space after the comma)
// silently failed to match the second origin.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// localhost is only trusted outside production. Set ALLOW_LOCALHOST_CORS=true
// if you need to point a local frontend at the deployed API.
const allowLocalhost = !isProduction || process.env.ALLOW_LOCALHOST_CORS === "true";

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowLocalhost && /^http:\/\/localhost:\d+$/.test(origin)) {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  }),
);

app.get("/health", (_req, res) => {
  res.json({ status: "AgroFlow+ backend is running", timestamp: new Date() });
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));

app.use("/api/auth", authRoutes);
app.use("/api/farmers", farmerRoutes);
app.use("/api/fields", fieldRoutes);
app.use("/api/alerts", alertRoutes);
app.use("/api/users", userRoutes);
app.use("/api/content", contentRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/listings", listingRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/buyers", buyerRoutes);
app.use("/api/role", roleRoutes);
app.use("/api/voice", voiceRoutes);
app.use("/api/orders", ordersRouter);
app.use('/api/sellers', sellerRoutes)
app.use("/api/reviews", reviewsRouter);
app.use('/api/push', pushRouter)
app.use('/api/admin', adminRouter)

app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err.stack);
    // Internal messages (stack traces, DB errors, driver details) must not
    // reach the client in production.
    res.status(500).json({
      error: "Something went wrong",
      ...(isProduction ? {} : { message: err.message }),
    });
  },
);

app.listen(PORT, () => {
  console.log(`🌱 AgroFlow+ backend running on http://localhost:${PORT}`);
});

// Test database connection on startup
prisma
  .$connect()
  .then(() => console.log("✅ Database connected"))
  .catch((e) => console.error("❌ Database connection failed:", e.message));

// ── Global Error Handlers ──────────────────────────────────
// An uncaught exception leaves the process in an undefined state, so log it
// and let the platform restart us. Swallowing it (plus `process.stdin.resume()`
// to force the process to stay alive) kept a half-broken server serving
// traffic, which is much harder to diagnose than a clean restart.
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception — shutting down:", err);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// ── KEEP RENDER ALIVE ──────────────────────────────────────────────
// Render free tier spins down after 15 minutes of inactivity.
// This self-ping keeps the service awake by hitting the /health endpoint every 14 minutes.
if (isProduction) {
  console.log('🏓 Production mode detected — starting self-ping service');
  
  // Initial ping after 30 seconds to ensure server is fully started
  setTimeout(async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://ai-farmer-platform-backend-code.onrender.com';
      await fetch(`${baseUrl}/health`);
      console.log('🏓 Initial self-ping sent successfully');
    } catch (err) {
      console.error('❌ Initial self-ping failed:', err);
    }
  }, 30000); // 30 seconds

  // Set up recurring ping every 14 minutes
  setInterval(async () => {
    try {
      const baseUrl = process.env.RENDER_EXTERNAL_URL || 'https://ai-farmer-platform-backend-code.onrender.com';
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) {
        console.log(`🏓 Self-ping sent at ${new Date().toISOString()} - Status: ${response.status}`);
      } else {
        console.warn(`⚠️ Self-ping returned status: ${response.status}`);
      }
    } catch (err) {
      console.error('❌ Self-ping failed:', err);
    }
  }, 14 * 60 * 1000); // 14 minutes
}

export default app;