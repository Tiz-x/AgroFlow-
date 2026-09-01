import React, { useState } from 'react';
import { RiLeafFill } from 'react-icons/ri';
import { GiCorn, GiTomato, GiChiliPepper, GiPlantRoots } from 'react-icons/gi';
import { MdCheckCircle } from 'react-icons/md';
import { useToast } from '../../context/ToastContext';
import { BASE_URL } from '../../services/apiConfig';
import styles from './Onboarding.module.css';

type CropType = 'Maize' | 'Cassava' | 'Tomato' | 'Pepper';

const CROP_ICONS: Record<CropType, React.ReactElement> = {
  Maize: <GiCorn size={24} />,
  Cassava: <GiPlantRoots size={24} />,
  Tomato: <GiTomato size={24} />,
  Pepper: <GiChiliPepper size={24} />,
};

const SOIL_TYPES = [
  { value: 'loamy', label: 'Loamy (Best for most crops)' },
  { value: 'sandy', label: 'Sandy (Good drainage, needs fertilizer)' },
  { value: 'clay', label: 'Clay (Holds water, needs amendment)' },
  { value: 'silty', label: 'Silty (Fertile, good for vegetables)' },
];

const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: '🌱 Beginner (Less than 1 year)' },
  { value: 'intermediate', label: '🌿 Intermediate (1-5 years)' },
  { value: 'expert', label: '🌳 Expert (5+ years)' },
];

interface FarmerOnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function FarmerOnboardingModal({ isOpen, onComplete }: FarmerOnboardingModalProps) {
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    farmSize: '',
    mainCrops: [] as CropType[],
    soilType: '',
    hasIrrigation: false,
    experience: '',
  });

  const toggleCrop = (crop: CropType) => {
    setFormData(prev => ({
      ...prev,
      mainCrops: prev.mainCrops.includes(crop)
        ? prev.mainCrops.filter(c => c !== crop)
        : [...prev.mainCrops, crop]
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('agf_token');
      const res = await fetch(`${BASE_URL}/farmers/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(formData),
      });
      
      if (!res.ok) throw new Error('Failed to save');
      
      addToast('Farm profile completed! 🎉', 'success');
      onComplete();
    } catch (error) {
      addToast('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isValid = () => {
    if (step === 1) return formData.farmSize && formData.soilType;
    if (step === 2) return formData.mainCrops.length > 0;
    if (step === 3) return formData.experience;
    return true;
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <RiLeafFill size={28} color="#2d6a35" />
          </div>
          <h2 className={styles.title}>Welcome Farmer! 🌾</h2>
          <p className={styles.subtitle}>Help us personalize your experience</p>
          <div className={styles.steps}>
            <div className={`${styles.step} ${step >= 1 ? styles.active : ''}`}>
              <span>1</span> Farm Details
            </div>
            <div className={`${styles.step} ${step >= 2 ? styles.active : ''}`}>
              <span>2</span> Your Crops
            </div>
            <div className={`${styles.step} ${step >= 3 ? styles.active : ''}`}>
              <span>3</span> Experience
            </div>
          </div>
        </div>

        <div className={styles.body}>
          {step === 1 && (
            <div className={styles.stepContent}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Farm Size (in hectares)</label>
                <input
                  type="number"
                  className={styles.input}
                  placeholder="e.g., 5"
                  value={formData.farmSize}
                  onChange={(e) => setFormData({ ...formData, farmSize: e.target.value })}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.label}>Soil Type</label>
                <select
                  className={styles.select}
                  value={formData.soilType}
                  onChange={(e) => setFormData({ ...formData, soilType: e.target.value })}
                >
                  <option value="">Select soil type</option>
                  {SOIL_TYPES.map(soil => (
                    <option key={soil.value} value={soil.value}>{soil.label}</option>
                  ))}
                </select>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={formData.hasIrrigation}
                    onChange={(e) => setFormData({ ...formData, hasIrrigation: e.target.checked })}
                  />
                  I have irrigation system on my farm
                </label>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepContent}>
              <label className={styles.label}>What crops do you grow? (Select all that apply)</label>
              <div className={styles.cropGrid}>
                {(['Maize', 'Cassava', 'Tomato', 'Pepper'] as CropType[]).map(crop => (
                  <button
                    key={crop}
                    type="button"
                    className={`${styles.cropCard} ${formData.mainCrops.includes(crop) ? styles.selected : ''}`}
                    onClick={() => toggleCrop(crop)}
                  >
                    {CROP_ICONS[crop]}
                    <span>{crop}</span>
                    {formData.mainCrops.includes(crop) && <MdCheckCircle className={styles.checkIcon} />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.stepContent}>
              <label className={styles.label}>Farming Experience</label>
              <div className={styles.experienceOptions}>
                {EXPERIENCE_LEVELS.map(exp => (
                  <button
                    key={exp.value}
                    type="button"
                    className={`${styles.experienceCard} ${formData.experience === exp.value ? styles.selected : ''}`}
                    onClick={() => setFormData({ ...formData, experience: exp.value })}
                  >
                    {exp.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          {step > 1 && (
            <button className={styles.backBtn} onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button
              className={styles.nextBtn}
              onClick={() => setStep(step + 1)}
              disabled={!isValid()}
            >
              Continue →
            </button>
          ) : (
            <button
              className={styles.completeBtn}
              onClick={handleSubmit}
              disabled={!isValid() || loading}
            >
              {loading ? 'Saving...' : 'Complete Setup 🎉'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}