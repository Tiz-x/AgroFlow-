import React, { useState } from 'react';
import { RiLeafFill } from 'react-icons/ri';
import { GiCorn, GiTomato, GiChiliPepper, GiPlantRoots } from 'react-icons/gi';
import { useToast } from '../../context/ToastContext';
import { CustomSelect } from '../CustomSelect/CustomSelect';
import { AKURE_AREAS } from '../../services/marketService';
import { BASE_URL } from '../../services/apiConfig';
import styles from './Onboarding.module.css';

type CropType = 'Maize' | 'Cassava' | 'Tomato' | 'Pepper';

const CROP_ICONS: Record<CropType, React.ReactElement> = {
  Maize: <GiCorn size={22} />,
  Cassava: <GiPlantRoots size={22} />,
  Tomato: <GiTomato size={22} />,
  Pepper: <GiChiliPepper size={22} />,
};

const FREQUENCY_OPTIONS = [
  { value: 'once', label: 'Just this once' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'occasional', label: 'Occasionally' },
];

interface BuyerOnboardingModalProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function BuyerOnboardingModal({ isOpen, onComplete }: BuyerOnboardingModalProps) {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    interestedCrops: [] as CropType[],
    location: '',
    frequency: '',
  });

  const toggleCrop = (crop: CropType) => {
    setFormData(prev => ({
      ...prev,
      interestedCrops: prev.interestedCrops.includes(crop)
        ? prev.interestedCrops.filter(c => c !== crop)
        : [...prev.interestedCrops, crop]
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('agf_token');
      const res = await fetch(`${BASE_URL}/buyers/onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferredCrops: formData.interestedCrops,
          preferredLocation: formData.location,
          purchaseFrequency: formData.frequency,
        }),
      });

      // The response used to be ignored, so a failed save still showed
      // "Preferences saved!" and the user never knew to retry.
      if (!res.ok) throw new Error('Failed to save preferences');

      localStorage.setItem('agroflow_buyer_preferences', JSON.stringify(formData));
      addToast('Preferences saved! We\'ll personalize your marketplace.', 'success');
      onComplete();
    } catch (error) {
      addToast('Something went wrong. You can update preferences later.', 'error');
      onComplete();
    } finally {
      setLoading(false);
    }
  };

  const isValid = () => {
    return formData.interestedCrops.length > 0 && formData.location;
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.iconWrapper}>
            <RiLeafFill size={28} color="#2d6a35" />
          </div>
          <h2 className={styles.title}>Welcome Buyer! 🛍️</h2>
          <p className={styles.subtitle}>
            Tell us a little about what you're looking for
          </p>
        </div>

        <div className={styles.body}>
          {/* Question 1: What crops? */}
          <div className={styles.questionGroup}>
            <label className={styles.questionLabel}>
              What are you looking for? <span className={styles.optional}>(Select all that apply)</span>
            </label>
            <div className={styles.cropGrid}>
              {(['Maize', 'Cassava', 'Tomato', 'Pepper'] as CropType[]).map(crop => (
                <button
                  key={crop}
                  type="button"
                  className={`${styles.cropCard} ${formData.interestedCrops.includes(crop) ? styles.selected : ''}`}
                  onClick={() => toggleCrop(crop)}
                >
                  {CROP_ICONS[crop]}
                  <span>{crop}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Question 2: Location - Using CustomSelect */}
          <div className={styles.questionGroup}>
            <label className={styles.questionLabel}>
              Where are you located? <span className={styles.optional}>(For nearby matches)</span>
            </label>
            <CustomSelect
              options={AKURE_AREAS.map(area => ({ value: area, label: area }))}
              value={formData.location}
              onChange={(value) => setFormData({ ...formData, location: value })}
              placeholder="Select your area in Akure"
            />
          </div>

          {/* Question 3: Frequency (Optional) */}
          <div className={styles.questionGroup}>
            <label className={styles.questionLabel}>
              How often do you buy? <span className={styles.optional}>(Optional)</span>
            </label>
            <div className={styles.frequencyGrid}>
              {FREQUENCY_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  className={`${styles.frequencyBtn} ${formData.frequency === opt.value ? styles.selected : ''}`}
                  onClick={() => setFormData({ ...formData, frequency: opt.value })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.skipBtn} onClick={onComplete}>
            Skip for now
          </button>
          <button
            className={styles.completeBtn}
            onClick={handleSubmit}
            disabled={!isValid() || loading}
          >
            {loading ? 'Saving...' : 'Save & Continue →'}
          </button>
        </div>
      </div>
    </div>
  );
}