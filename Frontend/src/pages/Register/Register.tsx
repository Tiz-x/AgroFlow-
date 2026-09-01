import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { RiLeafFill } from "react-icons/ri";
import { GiWheat, GiShoppingCart } from "react-icons/gi";
import {
  BsArrowRight,
  BsEye,
  BsEyeSlash,
  BsEnvelope,
  BsPhone,
  BsPerson,
  BsExclamationCircle,
  BsGeoAlt,
} from "react-icons/bs";
import { authService, getContentImages } from "../../services/authService";
import type { RegisterPayload, UserRole } from "../../types/auth";
import { CustomSelect } from "../../components/CustomSelect/CustomSelect";
import styles from "../../styles/auth.module.css";

// Akure areas for location dropdown
const AKURE_AREAS = [
  "Oba-Ile",
  "Ijapo Estate",
  "Oke-Aro",
  "Arakale",
  "Isolo",
  "Oda",
  "Oke-Ogba",
  "Ijomu",
  "Ayedun",
  "Alagbaka",
];

type Tab = "farmer" | "buyer";

function getPasswordStrength(pwd: string): {
  score: number;
  label: string;
  color: string;
} {
  const has6 = pwd.length >= 6;
  const has10 = pwd.length >= 10;
  const hasNum = /[0-9]/.test(pwd);

  if (has6 && hasNum && has10)
    return { score: 4, label: "Strong", color: "#2d6a35" };
  if (has6 && hasNum) return { score: 3, label: "Good", color: "#7db83a" };
  if (has6 || hasNum) return { score: 2, label: "Fair", color: "#e0b452" };
  if (pwd.length >= 3) return { score: 1, label: "Weak", color: "#e07c52" };
  return { score: 0, label: "Too weak", color: "#e05252" };
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email);
}

function isValidPhone(phone: string): boolean {
  const cleaned = phone.replace(/[\s\-().]/g, "");
  const nigerianLocal = /^0[7-9][01]\d{8}$/.test(cleaned);
  const nigerianIntlPlus = /^\+234[7-9][01]\d{8}$/.test(cleaned);
  const nigerianIntlNoPlus = /^234[7-9][01]\d{8}$/.test(cleaned);
  const genericIntl = /^\+\d{7,15}$/.test(cleaned);
  return nigerianLocal || nigerianIntlPlus || nigerianIntlNoPlus || genericIntl;
}

export default function Register() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("farmer");
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sideImage, setSideImage] = useState(
    "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=900&q=90",
  );
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    password: "",
    location: "",
  });

  useEffect(() => {
    getContentImages().then((imgs) => {
      if (imgs["register_side"]) setSideImage(imgs["register_side"]);
    });
  }, []);

  const set = (k: keyof typeof form, v: string) =>
    setForm((p) => ({ ...p, [k]: v }));

  const validate = (): boolean => {
    const e: Record<string, string> = {};

    if (!form.fullName.trim()) {
      e.fullName = "Full name is required";
    } else if (form.fullName.trim().split(" ").length < 2) {
      e.fullName = "Enter your first and last name";
    }

    if (!form.email.trim()) {
      e.email = "Email is required";
    } else if (!isValidEmail(form.email.trim())) {
      e.email = "Enter a valid email address (e.g. you@example.com)";
    }

    if (!form.phone.trim()) {
      e.phone = "Phone number is required";
    } else if (!isValidPhone(form.phone.trim())) {
      e.phone =
        "Enter a valid phone number (e.g. 08012345678 or +2348012345678)";
    }

    const pwd = form.password;
    if (!pwd) {
      e.password = "Password is required";
    } else if (pwd.length < 8) {
      // The API rejects anything under 8 (MIN_PASSWORD_LENGTH). Accepting 6
      // here meant a 6- or 7-character password passed client validation and
      // then failed at the server with a duplicate-looking error.
      e.password = "Password must be at least 8 characters";
    } else if (!/[0-9]/.test(pwd)) {
      e.password = "Password must include at least one number";
    }

    if (!form.location) {
      e.location = "Please select your location in Akure";
    }

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError("");

    if (!validate()) {
      return;
    }

    setLoading(true);

    try {
      const role = tab;
      const payload: RegisterPayload = {
        fullName: form.fullName,
        email: form.email,
        phone: form.phone,
        password: form.password,
        role,
        location: form.location,
      };

      const res = await authService.register(payload);

      authService.saveSession(res);
      const userRole = res.user.role as UserRole;

      // Redirect based on role with replace: true
      if (userRole === "farmer") {
        navigate("/farmer/dashboard", { replace: true });
      } else if (userRole === "buyer") {
        navigate("/buyer/dashboard", { replace: true });
      } else if (userRole === "seller") {
        navigate("/seller/dashboard", { replace: true });
      } else {
        navigate("/farmer/dashboard", { replace: true });
      }
    } catch (err: unknown) {
      console.error('Registration error:', err);
      setApiError(
        err instanceof Error
          ? err.message
          : "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  const err = (k: string) =>
    errors[k] ? (
      <div className={styles.fieldErrMsg}>
        <BsExclamationCircle size={11} />
        {errors[k]}
      </div>
    ) : null;

  const pwdStrength = form.password ? getPasswordStrength(form.password) : null;

  return (
    <div className={styles.shell}>
      <div className={styles.left}>
        <div
          className={styles.leftBg}
          style={{ backgroundImage: `url('${sideImage}')` }}
        />
        <div className={styles.leftOverlay} />
        <div className={styles.leftLogo}>
          <div className={styles.leftLogoMark}>
            <RiLeafFill size={17} />
          </div>
          <span className={styles.leftLogoText}>
            AgroFlow<span>+</span>
          </span>
        </div>
        <div className={styles.leftCaption}>
          <div className={styles.leftCaptionTag}>
            <div className={styles.leftCaptionDot} />
            <span className={styles.leftCaptionTagText}>Join the Movement</span>
          </div>
          <div className={styles.leftCaptionTitle}>
            Grow Smarter.
            <br />
            <em>Earn More.</em>
          </div>
          <div className={styles.leftCaptionSub}>
            Connect with buyers, schedule harvests, and let AI handle the rest
            of your supply chain.
          </div>
        </div>
      </div>

      <div className={styles.right}>
        <div className={styles.rightTopBar}>
          <div className={styles.mobileLogo}>
            <div className={styles.mobileLogoMark}>
              <RiLeafFill size={15} />
            </div>
            <span className={styles.mobileLogoText}>
              AgroFlow<span>+</span>
            </span>
          </div>
          <div className={styles.topBarRight}>
            <span className={styles.topBarText}>Already have an account?</span>
            <button
              className={styles.topBarBtn}
              onClick={() => navigate("/login")}
            >
              Sign In
            </button>
          </div>
        </div>

        <div className={styles.formWrap}>
          <h1 className={styles.formTitle}>Create Account</h1>
          <p className={styles.formSubtitle}>Choose your role to get started</p>

          <div className={styles.roleTabs}>
            <button
              type="button"
              className={`${styles.roleTab} ${tab === "farmer" ? styles.roleTabActive : ""}`}
              onClick={() => {
                setTab("farmer");
                setErrors({});
              }}
            >
              <span className={styles.roleTabIcon}>
                <GiWheat size={17} />
              </span>
              <div className={styles.roleTabContent}>
                <span className={styles.roleTabLabel}>Farmer</span>
                <span className={styles.roleTabDesc}>
                  Sell produce + AI crop advice
                </span>
              </div>
            </button>
            <button
              type="button"
              className={`${styles.roleTab} ${tab === "buyer" ? styles.roleTabActive : ""}`}
              onClick={() => {
                setTab("buyer");
                setErrors({});
              }}
            >
              <span className={styles.roleTabIcon}>
                <GiShoppingCart size={17} />
              </span>
              <div className={styles.roleTabContent}>
                <span className={styles.roleTabLabel}>Buyer</span>
                <span className={styles.roleTabDesc}>
                  Buy fresh produce from farmers
                </span>
              </div>
            </button>
          </div>

          {apiError && (
            <div className={styles.errorBanner}>
              <BsExclamationCircle size={15} color="#e05252" />
              <span className={styles.errorBannerText}>{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.fields}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Full Name</label>
                <div className={styles.fieldInputWrap}>
                  <span className={styles.fieldInputIcon}>
                    <BsPerson size={15} />
                  </span>
                  <input
                    className={`${styles.fieldInput} ${errors["fullName"] ? styles.fieldError : ""}`}
                    type="text"
                    placeholder="e.g. Adewale Okafor"
                    value={form.fullName}
                    onChange={(e) => set("fullName", e.target.value)}
                    autoComplete="name"
                  />
                </div>
                {err("fullName")}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email Address</label>
                <div className={styles.fieldInputWrap}>
                  <span className={styles.fieldInputIcon}>
                    <BsEnvelope size={14} />
                  </span>
                  <input
                    className={`${styles.fieldInput} ${errors["email"] ? styles.fieldError : ""}`}
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={(e) => set("email", e.target.value)}
                    autoComplete="email"
                  />
                </div>
                {err("email")}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Phone Number</label>
                <div className={styles.fieldInputWrap}>
                  <span className={styles.fieldInputIcon}>
                    <BsPhone size={14} />
                  </span>
                  <input
                    className={`${styles.fieldInput} ${errors["phone"] ? styles.fieldError : ""}`}
                    type="tel"
                    placeholder="+234 800 000 0000"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                    autoComplete="tel"
                  />
                </div>
                {err("phone")}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Location in Akure</label>
                <div className={styles.fieldInputWrap}>
                  <span className={styles.fieldInputIcon}>
                    <BsGeoAlt size={14} />
                  </span>
                  <CustomSelect
                    options={AKURE_AREAS.map((area) => ({
                      value: area,
                      label: area,
                    }))}
                    value={form.location}
                    onChange={(value) => set("location", value)}
                    placeholder="Select your area"
                  />
                </div>
                {err("location")}
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Password</label>
                <div className={styles.fieldInputWrap}>
                  <span className={styles.fieldInputIcon}>
                    <BsPerson size={14} />
                  </span>
                  <input
                    className={`${styles.fieldInput} ${errors["password"] ? styles.fieldError : ""}`}
                    type={showPwd ? "text" : "password"}
                    placeholder="Min 6 chars + at least one number"
                    value={form.password}
                    onChange={(e) => set("password", e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className={styles.fieldPasswordToggle}
                    onClick={() => setShowPwd((p) => !p)}
                    tabIndex={-1}
                  >
                    {showPwd ? <BsEyeSlash size={15} /> : <BsEye size={15} />}
                  </button>
                </div>

                {pwdStrength && (
                  <div className={styles.pwdStrength}>
                    <div className={styles.pwdBars}>
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={styles.pwdBar}
                          style={{
                            background:
                              i < pwdStrength.score
                                ? pwdStrength.color
                                : "#e0e0e0",
                          }}
                        />
                      ))}
                    </div>
                    <span
                      className={styles.pwdLabel}
                      style={{ color: pwdStrength.color }}
                    >
                      {pwdStrength.label}
                    </span>
                    <div className={styles.pwdReqs}>
                      {[
                        {
                          label: "At least 6 characters",
                          pass: form.password.length >= 6,
                        },
                        {
                          label: "At least one number (0–9)",
                          pass: /[0-9]/.test(form.password),
                        },
                      ].map((req) => (
                        <span
                          key={req.label}
                          className={styles.pwdReq}
                          style={{ color: req.pass ? "#2d6a35" : "#999" }}
                        >
                          <span>{req.pass ? "✓" : "○"}</span>
                          {req.label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {err("password")}
              </div>

              <button
                type="submit"
                className={styles.submitBtn}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <div className={styles.spinner} /> Creating account...
                  </>
                ) : (
                  <>
                    Create Account
                    <div className={styles.submitBtnCircle}>
                      <BsArrowRight size={13} />
                    </div>
                  </>
                )}
              </button>
            </div>
          </form>

          <p className={styles.termsText}>
            By creating an account you agree to our{" "}
            <span className={styles.termsLink}>Terms of Service</span> and{" "}
            <span className={styles.termsLink}>Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}