import { Router, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt, { SignOptions } from "jsonwebtoken";
import prisma from "../db/index";
import { protect, AuthRequest } from "../middleware/auth";
import { notifyNewUserToAdmins } from "../services/notificationService";

const router = Router();

// ── Validation helpers ────────────────────────────────────
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Compare two secrets without leaking their contents through timing. `a !== b`
 * bails out at the first differing byte, so response time reveals how much of a
 * guess was correct. Hashing first gives both buffers the same length, which
 * `timingSafeEqual` requires.
 */
function secretsMatch(provided: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Accepts Nigerian formats: 08012345678, 8012345678, +2348012345678
function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[\s()-]/g, "");
  if (!/^\+?\d{10,15}$/.test(digits)) return null;
  return digits;
}

function generateToken(payload: { id: string; email: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  const options: SignOptions = {
    expiresIn: "7d",
  };
  return jwt.sign(payload, secret, options);
}

// ── REGISTER ──────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, email, phone, password, role, location } = req.body;

    if (!name || !email || !password || !role) {
      res.status(400).json({
        error: "Name, email, password and role are required"
      });
      return;
    }

    const validRoles = ["farmer", "buyer", "seller"];
    if (!validRoles.includes(role)) {
      res.status(400).json({ error: "Role must be farmer, buyer or seller" });
      return;
    }

    // ── Normalize so casing/spacing can't create duplicate accounts ──
    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanLocation = location ? String(location).trim() : null;

    if (!cleanName) {
      res.status(400).json({ error: "Name is required" });
      return;
    }

    if (!EMAIL_RE.test(cleanEmail)) {
      res.status(400).json({ error: "Please enter a valid email address" });
      return;
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    // Phone is optional, but if supplied it must be usable — users log in with it.
    let cleanPhone: string | null = null;
    if (phone !== undefined && phone !== null && String(phone).trim() !== "") {
      cleanPhone = normalizePhone(phone);
      if (!cleanPhone) {
        res.status(400).json({ error: "Please enter a valid phone number" });
        return;
      }
    }

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    if (cleanPhone) {
      const phoneTaken = await prisma.user.findUnique({ where: { phone: cleanPhone } });
      if (phoneTaken) {
        res.status(400).json({ error: "Phone number already registered" });
        return;
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // ── Create the user and its role profile atomically ──────────────
    // Previously these were separate writes, so a failure partway through
    // left an account with no profile (which is what scripts/ensure-profiles.js
    // was patching up after the fact).
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: cleanName,
          email: cleanEmail,
          phone: cleanPhone,
          location: cleanLocation,
          password: hashedPassword,
          role,
        },
      });

      if (role === "farmer") {
        await tx.farmer.create({
          data: {
            userId: created.id,
            location: cleanLocation || "",
          },
        });
        // Farmers also get a seller profile
        await tx.seller.create({
          data: { userId: created.id },
        });
      } else if (role === "buyer") {
        await tx.buyer.create({
          data: {
            userId: created.id,
            preferredLocation: cleanLocation,
          },
        });
      } else if (role === "seller") {
        await tx.seller.create({
          data: { userId: created.id },
        });
      }

      return created;
    });

    // ── NOTIFY ADMINS ABOUT NEW USER ─────────────────────────
    try {
      await notifyNewUserToAdmins(user.name, user.email, user.role);
      console.log(`🔔 Admin notification sent for new ${user.role}: ${user.name}`);
    } catch (notifyError) {
      console.error('Failed to send admin notification:', notifyError);
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      message: "Account created successfully",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        location: user.location,
        phone: user.phone,
      },
    });
  } catch (error: any) {
    console.error('Register error:', error?.code, error?.message);
    // Never echo DB/driver internals back to the client.
    res.status(500).json({ error: 'Something went wrong during registration' });
  }
});

// ── LOGIN ──────────────────────────────────────────────────
router.post("/login", async (req: Request, res: Response) => {
  try {
    const { phone, email, identifier, password } = req.body;

    // ── Accept phone OR email so accounts registered without a
    //    phone number aren't permanently locked out ──────────────
    const rawIdentifier = identifier ?? phone ?? email;

    if (!rawIdentifier || !password) {
      res.status(400).json({
        error: "Phone number (or email) and password are required",
      });
      return;
    }

    const asString = String(rawIdentifier).trim();
    const asPhone = normalizePhone(asString);
    const asEmail = asString.toLowerCase();

    const lookups = [
      ...(asPhone ? [{ phone: asPhone }] : []),
      ...(EMAIL_RE.test(asEmail) ? [{ email: asEmail }] : []),
    ];

    // Never hand an empty OR list to Prisma. It currently resolves to "no
    // rows", but that is an implementation detail — if it ever flipped to
    // "match everything", `findFirst` would return an arbitrary account and
    // this would become a full authentication bypass.
    if (lookups.length === 0) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const user = await prisma.user.findFirst({
      where: { OR: lookups },
    });

    if (!user) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    if (user.status === "suspended") {
      res.status(403).json({
        error: "Your account has been suspended. Contact support."
      });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        location: user.location,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Something went wrong during login" });
  }
});

// ── GET CURRENT USER ──────────────────────────────────────
// Uses the shared `protect` middleware instead of re-implementing
// token parsing, so auth rules stay in one place.
router.get("/me", protect, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        status: true,
        location: true,
        phone: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // A token stays valid for 7 days, so re-check suspension here —
    // otherwise a suspended user keeps full access until it expires.
    if (user.status === "suspended") {
      res.status(403).json({
        error: "Your account has been suspended. Contact support.",
      });
      return;
    }

    res.json({ user });
  } catch (error) {
    console.error("Get user error:", error);
    res.status(500).json({ error: "Failed to load account" });
  }
});

// ── CREATE FIRST ADMIN ────────────────────────────────────
router.post("/create-admin", async (req: Request, res: Response) => {
  try {
    const { name, email, password, secretKey } = req.body;

    const configuredKey = process.env.ADMIN_SECRET_KEY;

    // If the env var is missing, `secretKey !== undefined` used to be false
    // for a request that simply omitted the field — which let anyone create
    // an admin. Require the key to be configured AND to match.
    if (!configuredKey) {
      console.error("create-admin blocked: ADMIN_SECRET_KEY is not configured");
      res.status(503).json({ error: "Admin creation is not enabled" });
      return;
    }

    if (typeof secretKey !== "string" || !secretsMatch(secretKey, configuredKey)) {
      res.status(403).json({ error: "Invalid secret key" });
      return;
    }

    // This route is the bootstrap for the very first admin, but nothing closed
    // it afterwards: anyone who ever learned the key — from a shared .env, a
    // deploy log, a screenshot — could keep minting admin accounts for the life
    // of the deployment. Once an admin exists, promote through the admin UI.
    const adminExists = await prisma.user.findFirst({
      where:  { role: "admin" },
      select: { id: true },
    });

    if (adminExists) {
      res.status(409).json({
        error: "An admin account already exists. Create further admins from the admin dashboard.",
      });
      return;
    }

    if (!name || !email || !password) {
      res.status(400).json({ error: "Name, email and password are required" });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail)) {
      res.status(400).json({ error: "Please enter a valid email address" });
      return;
    }

    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({
        error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
      });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existing) {
      res.status(400).json({ error: "Email already registered" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await prisma.user.create({
      data: {
        name: String(name).trim(),
        email: cleanEmail,
        password: hashedPassword,
        role: "admin",
        status: "active",
      },
    });

    res.status(201).json({
      message: "Admin account created",
      user: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (error) {
    console.error("Create admin error:", error);
    res.status(500).json({ error: "Something went wrong" });
  }
});

export default router;