import { useState } from "react";
import { useToast } from "../../../context/ToastContext";
import { NotificationToggle } from "../../../components/NotificationToggle/NotificationToggle";
import styles from "../BuyerSellerDashboard.module.css";

interface SectionSettingsProps {
  user: any;
  onUpdate: (updatedUser: any) => void;
}

export function SectionSettings({ user, onUpdate }: SectionSettingsProps) {
  const [profileForm, setProfileForm] = useState({
    fullName: user.name || "",
    email: user.email || "",
    phone: user.phone || "",
    location: user.location || "Ijapo Estate, Akure",
    bio: user.bio || "Agricultural entrepreneur passionate about fresh produce",
  });
  const [saving, setSaving] = useState(false);
  const { addToast } = useToast();

  const handleProfileUpdate = async () => {
    setSaving(true);
    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 800));
      onUpdate({ ...user, ...profileForm });
      addToast("Profile updated successfully!", "success");
    } catch (error) {
      addToast("Failed to update profile", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.settingsContainer}>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>Settings</div>
        <div className={styles.pageSubtitle}>Manage your account preferences</div>
      </div>

      {/* Personal Information Card */}
      <div className={styles.settingsCard}>
        <div className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Personal Information</h3>
          <div className={styles.formFields}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Full Name</label>
              <input
                type="text"
                className={styles.fieldInput}
                value={profileForm.fullName}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, fullName: e.target.value })
                }
                placeholder="Enter your full name"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Email Address</label>
              <input
                type="email"
                className={styles.fieldInput}
                value={profileForm.email}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, email: e.target.value })
                }
                placeholder="Enter your email address"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Phone Number</label>
              <input
                type="tel"
                className={styles.fieldInput}
                value={profileForm.phone}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, phone: e.target.value })
                }
                placeholder="Enter your phone number"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Location</label>
              <input
                type="text"
                className={styles.fieldInput}
                value={profileForm.location}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, location: e.target.value })
                }
                placeholder="Enter your location"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Bio</label>
              <textarea
                className={styles.fieldTextarea}
                rows={3}
                value={profileForm.bio}
                onChange={(e) =>
                  setProfileForm({ ...profileForm, bio: e.target.value })
                }
                placeholder="Tell buyers a little about yourself..."
              />
            </div>
            <button
              className={styles.saveBtn}
              onClick={handleProfileUpdate}
              disabled={saving}
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>

      {/* Notifications Card - Moved to the very bottom */}
      <div className={styles.settingsCard} style={{ marginTop: 16 }}>
        <div className={styles.settingsSection}>
          <h3 className={styles.settingsSectionTitle}>Notifications</h3>
          <div style={{ marginTop: 8 }}>
            <NotificationToggle />
          </div>
        </div>
      </div>
    </div>
  );
}