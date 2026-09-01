import { useState, useEffect } from "react";
import { RiLeafFill, RiRobot2Fill, RiStore3Line, RiMicFill } from "react-icons/ri";
import { MdPlayCircle } from "react-icons/md";
import { BsArrowRight } from "react-icons/bs";
import styles from "./FarmerOnboarding.module.css";

// ── Key stored in sessionStorage — set by authService.saveSession() ────────
// and consumed (read once, cleared) by shouldShowOnboarding()
const JUST_LOGGED_IN_KEY = "agf_just_logged_in";

export function shouldShowOnboarding(): boolean {
  if (typeof window === "undefined") return false;

  // Dev override
  const params = new URLSearchParams(window.location.search);
  if (params.get("onboarding") === "1") return true;
  if (params.get("onboarding") === "0") return false;

  // Desktop never shows onboarding
  if (window.innerWidth >= 768) return false;

  // Mobile: only show if this is a fresh login
  // consumeJustLoggedIn reads the flag once then clears it
  const flag = sessionStorage.getItem(JUST_LOGGED_IN_KEY);
  if (flag) {
    sessionStorage.removeItem(JUST_LOGGED_IN_KEY);
    return true;
  }

  return false;
}

export function markOnboardingDone(): void {
  // no-op — gating is now handled by the sessionStorage flag
}

/** Call from devtools console to reset and re-test: resetOnboarding() */
export function resetOnboarding(): void {
  sessionStorage.setItem(JUST_LOGGED_IN_KEY, "1");
  console.log("✅ Onboarding flag set. Refresh on mobile to see it.");
}

if (typeof window !== "undefined") {
  (window as any).resetOnboarding = resetOnboarding;
}

interface FarmerOnboardingProps {
  onComplete: () => void;
}

const slides = [
  {
    id: 1,
    tag: "AI assistant",
    tagIcon: "ai" as const,
    headline: "Ask anything,\nanytime",
    body: "Type your questions about crop health, harvest timing, soil, or weather — in plain English or Pidgin.",
    accent: "#A8D832",
    image: "/farmer1.jpg",
    overlay: "chat" as const,
  },
  {
    id: 2,
    tag: "Voice mode",
    tagIcon: "voice" as const,
    headline: "Speak it,\nhear the answer",
    body: "Record a voice note. Our AI listens, understands, and replies back to you.",
    accent: "#4A8C52",
    image: "/farmer2.jpg",
    overlay: "voice" as const,
  },
  {
    id: 3,
    tag: "Seller mode",
    tagIcon: "sell" as const,
    headline: "Sell directly\nto buyers",
    body: "List your harvest, set your price, and connect with verified buyers — all from your farm.",
    accent: "#E07B1A",
    image: "/farmer3.jpg",
    overlay: "sell" as const,
  },
];

export function FarmerOnboarding({ onComplete }: FarmerOnboardingProps) {
  const [current, setCurrent] = useState(0);
  const [phase, setPhase] = useState<"idle" | "exit-left" | "exit-right">("idle");

  let touchStartX = 0;

  // ── PRELOAD ALL IMAGES ──────────────────────────────────────────
  useEffect(() => {
    let loadedCount = 0;
    const totalImages = slides.length;

    slides.forEach((slide) => {
      const img = new Image();
      img.src = slide.image;
      img.onload = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          console.log("✅ All onboarding images preloaded");
        }
      };
      img.onerror = () => {
        loadedCount++;
        if (loadedCount === totalImages) {
          console.warn("⚠️ Some onboarding images failed to load");
        }
      };
    });
  }, []);

  const transition = (next: number) => {
    if (phase !== "idle") return;
    const dir = next > current ? "exit-left" : "exit-right";
    setPhase(dir);
    setTimeout(() => {
      setCurrent(next);
      setPhase("idle");
    }, 280);
  };

  const next = () => {
    if (current < slides.length - 1) transition(current + 1);
    else finish();
  };

  const finish = () => {
    markOnboardingDone();
    onComplete();
  };

  const onTouchStart = (e: React.TouchEvent) => { touchStartX = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (dx < -50 && current < slides.length - 1) transition(current + 1);
    if (dx > 50 && current > 0) transition(current - 1);
  };

  const slide = slides[current];
  const isLast = current === slides.length - 1;

  const photoClass = [
    styles.photoLayer,
    phase === "idle" ? styles.photoEnter : "",
    phase === "exit-left" ? styles.photoExitLeft : "",
    phase === "exit-right" ? styles.photoExitRight : "",
  ].join(" ");

  const textClass = [
    styles.textLayer,
    phase === "idle" ? styles.textEnter : "",
    phase === "exit-left" ? styles.textExitLeft : "",
    phase === "exit-right" ? styles.textExitRight : "",
  ].join(" ");

  return (
    <div className={styles.wrapper} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>

      {/* Full-bleed photo — fills the entire screen */}
      <div className={photoClass}>
        <img
          src={slide.image}
          alt={slide.tag}
          className={styles.photo}
          loading="eager"
        />
      </div>

      {/* Gradient overlay for text legibility, top and bottom */}
      <div className={styles.gradientTop} />
      <div className={styles.gradientBottom} />

      {/* Logo */}
      <div className={styles.logo}>
        <RiLeafFill size={16} />
        <span>AgroFlow<b>+</b></span>
      </div>

      {/* Skip */}
      <button className={styles.skip} onClick={finish}>Skip</button>

      {/* Feature overlay UI — floats directly on the photo */}
      <div className={textClass}>
        {slide.overlay === "chat" && (
          <div className={styles.chatOverlay}>
            <div className={styles.chatBubbleUser}>How is my maize doing?</div>
            <div className={styles.chatBubbleAI}>
              <span className={styles.aiTag}>AI</span>
              Looking healthy! Water in 2 days.
            </div>
          </div>
        )}

        {slide.overlay === "voice" && (
          <div className={styles.voiceOverlay}>
            <div className={styles.voicePulseRing} />
            <div className={styles.voicePulseCore}>
              <RiMicFill size={20} />
            </div>
            <div className={styles.voiceBars}>
              {[14, 22, 10, 26, 16, 24, 12, 20].map((h, i) => (
                <span key={i} className={styles.voiceBar} style={{ height: h, animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          </div>
        )}

        {slide.overlay === "sell" && (
          <div className={styles.sellOverlay}>
            <div className={styles.sellCard}>
              <div className={styles.sellIcon}><MdPlayCircle size={0} /><RiStore3Line size={14} /></div>
              <div className={styles.sellInfo}>
                <span className={styles.sellTitle}>Tomatoes</span>
                <span className={styles.sellPrice}>₦1,200 / basket</span>
              </div>
              <span className={styles.sellBadge}>Order ✓</span>
            </div>
          </div>
        )}

        {/* Tag + headline + body — floats over photo bottom */}
        <div className={styles.textBlock}>
          <span className={styles.tag} style={{ "--accent": slide.accent } as React.CSSProperties}>
            {slide.tagIcon === "ai" && <RiRobot2Fill size={12} />}
            {slide.tagIcon === "voice" && <RiMicFill size={12} />}
            {slide.tagIcon === "sell" && <RiStore3Line size={12} />}
            {slide.tag}
          </span>
          <h2 className={styles.headline}>{slide.headline}</h2>
          <p className={styles.body}>{slide.body}</p>
        </div>
      </div>

      {/* Dots */}
      <div className={styles.dots}>
        {slides.map((_, i) => (
          <button
            key={i}
            className={`${styles.dot} ${i === current ? styles.dotActive : ""}`}
            onClick={() => i !== current && transition(i)}
            aria-label={`Go to slide ${i + 1}`}
          />
        ))}
      </div>

      {/* CTA */}
      <div className={styles.cta}>
        <button className={styles.ctaBtn} onClick={next}>
          {isLast ? "Get started" : "Next"}
          <BsArrowRight size={16} className={styles.arrow} />
        </button>
      </div>
    </div>
  );
}