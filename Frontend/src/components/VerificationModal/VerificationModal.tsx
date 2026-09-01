import { useState, useRef, useEffect } from "react";
import {
  RiCameraLine,
  RiSendPlaneLine,
  RiCloseLine,
  RiTimeLine,
  RiBellLine,
  RiLockLine,
  RiCheckboxCircleLine,
  RiErrorWarningLine,
  RiBuildingLine,
  RiCalendarLine,
} from "react-icons/ri";
import { LoadingButton } from "../LoadingButton/LoadingButton";
import { useToast } from "../../context/ToastContext";
import { sellerService } from "../../services/sellerService";
import styles from "./VerificationModal.module.css";

interface VerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onVerified: () => void;
  onGoToSettings: () => void;
}

export function VerificationModal({
  isOpen,
  onClose,
  onVerified,
  onGoToSettings,
}: VerificationModalProps) {
  const { addToast } = useToast();
  const [step, setStep] = useState<
    "prompt" | "form" | "submitted" | "rejected"
  >("prompt");
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string>("");
  const [farmName, setFarmName] = useState<string>("");
  const [yearsExperience, setYearsExperience] = useState<string>("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    status: string;
    note?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check verification status on mount
  useEffect(() => {
    if (isOpen) {
      checkStatus();
    }
  }, [isOpen]);

  const checkStatus = async () => {
    try {
      const result = await sellerService.getMyVerificationStatus();
      if (result.seller) {
        setStatus({
          status: result.seller.verificationStatus,
          note: result.seller.verificationNote,
        });

        if (result.seller.verificationStatus === "verified") {
          setStep("prompt");
          onVerified();
          onClose();
          return;
        } else if (result.seller.verificationStatus === "pending") {
          setStep("submitted");
          return;
        } else if (result.seller.verificationStatus === "rejected") {
          setStep("rejected");
          setStatus({
            status: "rejected",
            note: result.seller.verificationNote,
          });
          return;
        }
      }
      setStep("prompt");
    } catch (error) {
      console.error("Error checking status:", error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      addToast("Image too large. Please choose an image under 5MB.", "error");
      return;
    }

    setSelfieFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setSelfiePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  // ── Updated handleSubmit with File object ──────────────────────────
  const handleSubmit = async () => {
    if (!selfieFile) {
      addToast("Please upload a selfie photo", "error");
      return;
    }
    if (!farmName.trim()) {
      addToast("Please enter your farm name", "error");
      return;
    }
    if (!description.trim()) {
      addToast("Please tell us about your farm", "error");
      return;
    }

    setLoading(true);
    try {
      const result = await sellerService.submitVerification(
        selfieFile,
        description,
        farmName,
        yearsExperience,
      );
      if (result.success) {
        setStep("submitted");
        addToast("Verification submitted successfully!", "success");
        // Check if notification is enabled
        const notifEnabled =
          localStorage.getItem("agf_notifications_enabled") === "true";
        if (!notifEnabled) {
          addToast(
            "Please enable notifications in Settings to get updates.",
            "info",
          );
        }
      } else {
        addToast(result.error || "Failed to submit verification", "error");
      }
    } catch (error) {
      addToast("An error occurred. Please try again.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResubmit = () => {
    setStep("form");
    setSelfieFile(null);
    setSelfiePreview("");
    setFarmName("");
    setYearsExperience("");
    setDescription("");
    setStatus(null);
  };

  if (!isOpen) return null;

  // ── PROMPT STEP ────────────────────────────────────────────────
  if (step === "prompt") {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose}>
            <RiCloseLine size={24} />
          </button>

          <div className={styles.promptIcon}>
            <RiLockLine size={40} />
          </div>
          <h2 className={styles.promptTitle}>Verification Required</h2>
          <p className={styles.promptText}>
            You need to complete verification before you can post your produce
            for sale. This helps us ensure a safe marketplace for all users.
          </p>
          <div className={styles.promptActions}>
            <button
              className={styles.continueBtn}
              onClick={() => setStep("form")}
            >
              Continue to Verification
            </button>
            <button className={styles.skipBtn} onClick={onClose}>
              Skip for Now
            </button>
          </div>
          <p className={styles.promptNote}>
            You can always verify later from the sell page.
          </p>
        </div>
      </div>
    );
  }

  // ── FORM STEP ────────────────────────────────────────────────────
  if (step === "form") {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div
          className={styles.modal}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 500 }}
        >
          <button className={styles.closeBtn} onClick={onClose}>
            <RiCloseLine size={24} />
          </button>

          <h2 className={styles.formTitle}>Complete Verification</h2>
          <p className={styles.formSubtitle}>
            Tell us about yourself and your farm. This helps us build trust with
            buyers.
          </p>

          {/* Selfie Upload */}
          <div className={styles.formGroup}>
            <label className={styles.label}>
              A Clear Selfie Photo of Yourself{" "}
              <span className={styles.required}>*</span>
            </label>
            <div
              className={styles.uploadArea}
              onClick={() => fileInputRef.current?.click()}
            >
              {selfiePreview ? (
                <div className={styles.selfiePreview}>
                  <img src={selfiePreview} alt="Selfie" />
                  <button
                    type="button"
                    className={styles.removePhoto}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelfieFile(null);
                      setSelfiePreview("");
                    }}
                  >
                    ✕
                  </button>
                </div>
              ) : (
                <div className={styles.uploadPlaceholder}>
                  <RiCameraLine size={40} />
                  <p>Tap to take a selfie</p>
                  <span>Upload a clear photo of yourself</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              onChange={handleFileSelect}
              style={{ display: "none" }}
            />
            <p className={styles.helperText}>
              Max 5MB. Clear face photo preferred.
            </p>
          </div>

          {/* Farm Name - Now Required */}
          <div className={styles.formGroup}>
            <label className={styles.label}>
              Farm Name <span className={styles.required}>*</span>
            </label>
            <div className={styles.inputWrapper}>
              <RiBuildingLine className={styles.inputIcon} />
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. Okafor Farms, Green Valley Produce"
                value={farmName}
                onChange={(e) => setFarmName(e.target.value)}
                maxLength={50}
              />
            </div>
            <p className={styles.helperText}>
              Give your farm a name that buyers will recognize.
            </p>
          </div>

          {/* Years of Experience - Still Optional */}
          <div className={styles.formGroup}>
            <label className={styles.label}>Years of Farming Experience</label>
            <div className={styles.inputWrapper}>
              <RiCalendarLine className={styles.inputIcon} />
              <input
                type="number"
                className={styles.input}
                placeholder="e.g. 5"
                value={yearsExperience}
                onChange={(e) => setYearsExperience(e.target.value)}
                min={0}
                max={99}
              />
              <span className={styles.inputSuffix}>years</span>
            </div>
            <p className={styles.helperText}>
              Optional - Helps buyers trust your expertise.
            </p>
          </div>

          {/* Description - Now Required */}
          <div className={styles.formGroup}>
            <label className={styles.label}>
              About Your Farm <span className={styles.required}>*</span>
            </label>
            <textarea
              className={styles.textarea}
              placeholder="Tell us about your farm, what you grow, and why you want to sell on AgroFlow+..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {/* Notification Reminder */}
          <div className={styles.notificationReminder}>
            <RiBellLine size={18} />
            <span>
              Turn on notifications in <strong>Settings</strong> to get updates
              on your verification status.
            </span>
          </div>

          {/* Submit */}
          <LoadingButton
            loading={loading}
            className={styles.submitBtn}
            onClick={handleSubmit}
          >
            <RiSendPlaneLine size={18} />
            Submit Verification
          </LoadingButton>
        </div>
      </div>
    );
  }

  // ── SUBMITTED STEP ─────────────────────────────────────────────────────
  if (step === "submitted") {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose}>
            <RiCloseLine size={24} />
          </button>

          <div className={styles.successIcon}>
            <RiCheckboxCircleLine size={48} />
          </div>
          <h2 className={styles.successTitle}>Verification Submitted</h2>
          <p className={styles.successText}>
            Your verification is now pending review by our admin team. This
            usually takes 12-24 hours.
          </p>
          <div className={styles.successNote}>
            <RiTimeLine size={18} />
            <span>You will get a notification once approved or rejected.</span>
          </div>
          <div className={styles.successReminder}>
            <RiBellLine size={18} />
            <span>
              Make sure to <strong>turn on notifications</strong> in Settings to
              get updates.
            </span>
          </div>

          <button className={styles.doneBtn} onClick={onGoToSettings}>
            Turn On Notifications
          </button>
          <button
            className={styles.skipBtn}
            onClick={onClose}
            style={{ marginTop: 8 }}
          >
            Maybe later
          </button>
        </div>
      </div>
    );
  }

  // ── REJECTED STEP ─────────────────────────────────────────────────────
  if (step === "rejected" && status) {
    return (
      <div className={styles.overlay} onClick={onClose}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <button className={styles.closeBtn} onClick={onClose}>
            <RiCloseLine size={24} />
          </button>

          <div className={styles.rejectedIcon}>
            <RiErrorWarningLine size={48} />
          </div>
          <h2 className={styles.rejectedTitle}>Verification Rejected</h2>
          <p className={styles.rejectedText}>
            Your verification was rejected for the following reason:
          </p>
          <div className={styles.rejectionReason}>
            {status.note ||
              "Please provide a clearer selfie and more details about your farm."}
          </div>
          <button className={styles.resubmitBtn} onClick={handleResubmit}>
            Resubmit Verification
          </button>
        </div>
      </div>
    );
  }

  return null;
}