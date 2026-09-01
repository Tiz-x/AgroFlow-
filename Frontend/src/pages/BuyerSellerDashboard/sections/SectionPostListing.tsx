import { useState, useRef } from "react";
import { RiImageAddLine } from "react-icons/ri";
import { MdCameraAlt } from "react-icons/md";
import { BsArrowRight } from "react-icons/bs";
import { useToast } from "../../../context/ToastContext";
import { CustomSelect } from "../../../components/CustomSelect/CustomSelect";
import { LoadingButton } from "../../../components/LoadingButton/LoadingButton";
import { marketService, AKURE_AREAS, type CropType } from "../../../services/marketService";
import { CROPS } from "../constants";
import styles from "../BuyerSellerDashboard.module.css";

interface SectionPostListingProps {
  user: any;
  onSuccess: () => void;
}

export function SectionPostListing({ onSuccess }: SectionPostListingProps) {
  const [form, setForm] = useState({
    cropType: "Maize" as CropType,
    quantity: "",
    location: AKURE_AREAS[0],
    description: "",
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addToast } = useToast();

  const setF = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const resetForm = () => {
    setForm({
      cropType: "Maize" as CropType,
      quantity: "",
      location: AKURE_AREAS[0],
      description: "",
    });
    setPhotoFiles([]);
    setPhotoPreviews([]);
    setErrors({});
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const remainingSlots = 4 - photoFiles.length;
    const filesToAdd = files.slice(0, remainingSlots);

    for (const file of filesToAdd) {
      if (file.size > 5 * 1024 * 1024) {
        addToast(`${file.name} is too large. Max 5MB per image.`, "error");
        continue;
      }
      setPhotoFiles(prev => [...prev, file]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreviews(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }

    // Reset input value so same file can be selected again
    e.target.value = '';
  };

  const removePhoto = (index: number) => {
    setPhotoFiles(prev => prev.filter((_, i) => i !== index));
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const takePhoto = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.capture = "environment";
    input.multiple = true;
    input.onchange = (e) => {
      const files = Array.from((e.target as HTMLInputElement).files || []);
      if (files.length === 0) return;

      const remainingSlots = 4 - photoFiles.length;
      const filesToAdd = files.slice(0, remainingSlots);

      for (const file of filesToAdd) {
        if (file.size > 5 * 1024 * 1024) {
          addToast(`${file.name} is too large. Max 5MB per image.`, "error");
          continue;
        }
        setPhotoFiles(prev => [...prev, file]);
        const reader = new FileReader();
        reader.onloadend = () => {
          setPhotoPreviews(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.quantity || Number(form.quantity) <= 0)
      e.quantity = "Enter a valid quantity";
    if (!form.description.trim()) e.description = "Add a short description";
    if (photoFiles.length < 3) e.photos = "Please upload at least 3 photos showing different views";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    
    setLoading(true);
    
    addToast('Posting your listing...', 'info');
    
    try {
      const result = await marketService.postListing({
        cropType: form.cropType,
        quantity: Number(form.quantity),
        location: form.location,
        description: form.description,
        photos: photoFiles,
      });

      if (!result.success) {
        addToast(result.error || "Failed to post listing", "error");
        setLoading(false);
        return;
      }
      
      addToast('Listing posted successfully!', 'success');
      resetForm();
      onSuccess();
    } catch (error) {
      addToast('Failed to post. Please try again.', 'error');
      console.error('Post listing error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.formCard}>
      <div className={styles.formTitle}>List Your Produce</div>
      <div className={styles.formSubtitle}>
        Post what you have available. Buyers in Akure will see it instantly.
      </div>
      <form onSubmit={handleSubmit} noValidate>
        <div className={styles.formFields}>
          <div className={styles.fieldRow}>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Crop Type</label>
              <CustomSelect
                options={CROPS.map((crop) => ({ value: crop, label: crop }))}
                value={form.cropType}
                onChange={(value) => setF("cropType", value)}
                placeholder="Select crop type"
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Location (Akure)</label>
              <CustomSelect
                options={AKURE_AREAS.map((area) => ({ value: area, label: area }))}
                value={form.location}
                onChange={(value) => setF("location", value)}
                placeholder="Select location"
              />
            </div>
          </div>
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Available Quantity (kg)</label>
            <input
              className={styles.fieldInput}
              type="number"
              placeholder="e.g. 500"
              min={1}
              value={form.quantity}
              onChange={(e) => setF("quantity", e.target.value)}
            />
            {errors.quantity && (
              <span className={styles.fieldErrMsg}>{errors.quantity}</span>
            )}
          </div>

          {/* ── MULTI-PHOTO UPLOAD ── */}
          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>
              Product Photos <span style={{ color: '#9ead9f', fontWeight: 400 }}>(3-4 photos, different angles)</span>
            </label>
            <div className={styles.photoUploadArea}>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 12 }}>
                <button
                  type="button"
                  className={styles.photoUploadBtn}
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photoFiles.length >= 4}
                >
                  <RiImageAddLine size={20} /> Add Photos ({photoFiles.length}/4)
                </button>
                <button 
                  type="button" 
                  className={styles.photoUploadBtn} 
                  onClick={takePhoto}
                  disabled={photoFiles.length >= 4}
                >
                  <MdCameraAlt size={18} /> Take Photo
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleImageSelect}
              />
              <div style={{ fontSize: 12, color: "#9ead9f", textAlign: "center" }}>
                Show the produce from different angles — buyers trust listings with more photos
              </div>
              {errors.photos && (
                <div style={{ fontSize: 12, color: '#e05252', textAlign: 'center', marginTop: 8, fontWeight: 600 }}>
                  {errors.photos}
                </div>
              )}
              {photoPreviews.length > 0 && (
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 12, justifyContent: 'center' }}>
                  {photoPreviews.map((preview, i) => (
                    <div key={i} style={{ position: 'relative' }}>
                      <img
                        src={preview}
                        alt={`Preview ${i + 1}`}
                        style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8, border: '1.5px solid #eaeee8' }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(i)}
                        style={{
                          position: 'absolute', top: -6, right: -6, width: 22, height: 22,
                          borderRadius: '50%', background: '#e05252', color: '#fff',
                          border: '2px solid #fff', fontSize: 11, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Description</label>
            <textarea
              className={styles.fieldTextarea}
              placeholder="Describe your produce — quality, harvest date, packaging..."
              value={form.description}
              onChange={(e) => setF("description", e.target.value)}
            />
            {errors.description && (
              <span className={styles.fieldErrMsg}>{errors.description}</span>
            )}
          </div>
          <LoadingButton
            loading={loading}
            className={`${styles.formSubmitBtn} w-full`}
            onClick={handleSubmit}
            type="submit"
          >
            {loading ? 'Posting...' : 'Post Listing'}
            {!loading && <BsArrowRight size={14} />}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}