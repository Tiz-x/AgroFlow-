import { useState } from 'react';
import { RiMapPinLine, RiUserLine, RiCalendarLine, RiArrowLeftLine } from 'react-icons/ri';
import { GiFarmer, GiCorn, GiTomato, GiChiliPepper, GiPlantRoots } from 'react-icons/gi';
import { MdAddShoppingCart, MdFavorite, MdFavoriteBorder } from 'react-icons/md';
import { useToast } from '../../context/ToastContext';
import { useCartStore } from '../../store/cartStore';
import { useFavoritesStore } from '../../store/favoritesStore';
import type { Listing, CropType } from '../../services/marketService';
import styles from './ListingDetailModal.module.css';

const CROP_ICON: Record<CropType, React.ReactElement> = {
  Maize: <GiCorn size={28} />,
  Cassava: <GiPlantRoots size={28} />,
  Tomato: <GiTomato size={28} />,
  Pepper: <GiChiliPepper size={28} />,
};

// ── Image Carousel Component ──────────────────────────────────────────────
function ImageCarousel({ photos, alt }: { photos: string[]; alt: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [touchStartX, setTouchStartX] = useState<number>(0);

  const goTo = (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    setActiveIndex(index);
  };

  const goNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev + 1) % photos.length);
  };

  const goPrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0].clientX);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX - touchEndX;
    const threshold = 40;

    if (diff > threshold) {
      setActiveIndex((prev) => (prev + 1) % photos.length);
    } else if (diff < -threshold) {
      setActiveIndex((prev) => (prev - 1 + photos.length) % photos.length);
    }
  };

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <img
        src={photos[activeIndex]}
        alt={alt}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />

      {photos.length > 1 && (
        <>
          {/* Left tap zone */}
          <div
            onClick={goPrev}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '35%',
              height: '100%',
              cursor: 'pointer',
              zIndex: 2,
            }}
          />
          {/* Right tap zone */}
          <div
            onClick={goNext}
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: '35%',
              height: '100%',
              cursor: 'pointer',
              zIndex: 2,
            }}
          />

          {/* Dots */}
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 6,
              zIndex: 3,
            }}
          >
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => goTo(e, i)}
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.5)',
                  boxShadow: '0 0 3px rgba(0,0,0,0.3)',
                  transition: 'background 0.2s',
                }}
                aria-label={`View photo ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface ListingDetailModalProps {
  listing: Listing | null;
  isOpen: boolean;
  onClose: () => void;
  onRequestToBuy?: (listing: Listing) => Promise<void> | void;
}

export function ListingDetailModal({ listing, isOpen, onClose, onRequestToBuy }: ListingDetailModalProps) {
  const { addToast } = useToast();
  const [requestQty, setRequestQty] = useState('');
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Cart Store ──────────────────────────────────────────────────────────
  const addItem = useCartStore(s => s.addItem);
  const cartItems = useCartStore(s => s.items);
  const inCart = cartItems.some(i => i.listing.id === listing?.id);

  // ── Favorites Store ──────────────────────────────────────────────────────
  const { toggleListing, isLiked, isFollowing, followSeller, unfollowSeller } = useFavoritesStore();
  const liked = isLiked(listing?.id || '');
  const following = isFollowing(listing?.sellerId || '');

  if (!isOpen || !listing) return null;

  const handleRequestToBuy = async () => {
    const qty = Number(requestQty);
    
    if (!requestQty) {
      addToast('Please enter a quantity', 'error');
      return;
    }
    
    if (qty <= 0) {
      addToast('Quantity must be greater than 0', 'error');
      return;
    }
    
    if (qty > listing.remainingQty) {
      addToast(`Only ${listing.remainingQty}kg available. Please enter a smaller quantity.`, 'error');
      return;
    }
    
    if (!onRequestToBuy) {
      addToast('Unable to process request. Please try again.', 'error');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      await onRequestToBuy(listing);
      addToast('Request sent successfully!', 'success');
      onClose();
    } catch (err: any) {
      addToast(err.message || 'Failed to send request. Please try again.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return '#2d6a35';
      case 'partial': return '#e8a020';
      case 'sold': return '#e05252';
      default: return '#9ead9f';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'available': return 'Available';
      case 'partial': return 'Partially Sold';
      case 'sold': return 'Sold Out';
      default: return status;
    }
  };

  return (
    <div className={styles.fullscreenOverlay} onClick={onClose}>
      <div className={styles.fullscreenModal} onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
        {/* Back Button */}
        <button className={styles.backBtn} onClick={onClose}>
          <RiArrowLeftLine size={24} />
          <span>Back</span>
        </button>

        {/* Heart — top right */}
        <button
          onClick={() => {
            toggleListing(listing.id);
            addToast(liked ? 'Removed from favorites' : 'Saved!', 'success');
          }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: 'rgba(255,255,255,0.9)',
            border: 'none',
            borderRadius: '50%',
            width: 38,
            height: 38,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}
        >
          {liked ? <MdFavorite size={20} color="#e05252" /> : <MdFavoriteBorder size={20} color="#9ead9f" />}
        </button>

        {/* ── IMAGE SECTION WITH CAROUSEL ────────────────────────────────────── */}
        <div className={styles.imageSection}>
          {listing.photoUrls && listing.photoUrls.length > 0 ? (
            <ImageCarousel photos={listing.photoUrls} alt={listing.cropType} />
          ) : (
            <div className={styles.imagePlaceholder}>
              <div className={styles.placeholderIcon}>
                {CROP_ICON[listing.cropType]}
              </div>
              <span>No image available</span>
            </div>
          )}
          <div className={styles.statusBadge} style={{ backgroundColor: getStatusColor(listing.status) }}>
            {getStatusText(listing.status)}
          </div>
        </div>

        {/* Content Section - Scrollable */}
        <div className={styles.scrollContent}>
          <div className={styles.contentSection}>
            {/* Crop Type Header */}
            <div className={styles.cropHeader}>
              <div className={styles.cropIcon}>{CROP_ICON[listing.cropType]}</div>
              <h2 className={styles.cropName}>{listing.cropType}</h2>
            </div>

            {/* Seller Info - Updated with Follow button */}
            <div className={styles.infoCard}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div className={styles.infoRow} style={{ margin: 0 }}>
                  <div className={styles.infoIcon}><GiFarmer size={18} /></div>
                  <div className={styles.infoContent}>
                    <div className={styles.infoLabel}>Seller</div>
                    <div className={styles.infoValue}>{listing.sellerName}</div>
                  </div>
                </div>
                {/* Follow button */}
                <button
                  onClick={() => {
                    if (following) {
                      unfollowSeller(listing.sellerId);
                      addToast('Unfollowed seller', 'info');
                    } else {
                      followSeller(listing.sellerId);
                      addToast('Following seller!', 'success');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '6px 14px',
                    borderRadius: 100,
                    border: `1.5px solid ${following ? '#a8d832' : '#eaeee8'}`,
                    background: following ? '#f2f9e4' : 'transparent',
                    color: following ? '#2d6a35' : '#9ead9f',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {following ? '✓ Following' : '+ Follow'}
                </button>
              </div>

              {listing.sellerPhone && (
                <div className={styles.infoRow}>
                  <div className={styles.infoIcon}><RiUserLine size={18} /></div>
                  <div className={styles.infoContent}>
                    <div className={styles.infoLabel}>Contact</div>
                    <div className={styles.infoValue}>{listing.sellerPhone}</div>
                  </div>
                </div>
              )}
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}><RiMapPinLine size={18} /></div>
                <div className={styles.infoContent}>
                  <div className={styles.infoLabel}>Location</div>
                  <div className={styles.infoValue}>{listing.location}, Akure</div>
                  {listing.distance && (
                    <div className={styles.infoSub}>{listing.distance}km away</div>
                  )}
                </div>
              </div>
              <div className={styles.infoRow}>
                <div className={styles.infoIcon}><RiCalendarLine size={18} /></div>
                <div className={styles.infoContent}>
                  <div className={styles.infoLabel}>Listed On</div>
                  <div className={styles.infoValue}>{formatDate(listing.createdAt)}</div>
                </div>
              </div>
            </div>

            {/* Quantity Stats */}
            <div className={styles.statsCard}>
              <div className={styles.statBox}>
                <div className={styles.statValue}>{listing.quantity}kg</div>
                <div className={styles.statLabel}>Total Quantity</div>
              </div>
              <div className={styles.statDivider}></div>
              <div className={styles.statBox}>
                <div className={styles.statValue}>{listing.remainingQty}kg</div>
                <div className={styles.statLabel}>Remaining</div>
              </div>
            </div>

            {/* Description */}
            {listing.description && (
              <div className={styles.descriptionCard}>
                <div className={styles.descriptionTitle}>Description</div>
                <p className={styles.descriptionText}>{listing.description}</p>
              </div>
            )}

            {/* Action Buttons - Updated with Cart and Request to Buy */}
            {listing.status !== 'sold' && (
              <div className={styles.actionSection}>
                {!showRequestForm ? (
                  <div style={{ display: 'flex', gap: 10 }}>
                    {/* Add to Cart */}
                    <button
                      onClick={() => {
                        addItem(listing, 1);
                        addToast('Added to cart!', 'success');
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '12px 16px',
                        borderRadius: 10,
                        border: `1.5px solid ${inCart ? '#a8d832' : '#eaeee8'}`,
                        background: inCart ? '#f2f9e4' : '#f7f8f5',
                        color: inCart ? '#2d6a35' : '#6b7f6e',
                        fontWeight: 600,
                        fontSize: 13,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <MdAddShoppingCart size={18} />
                      {inCart ? 'In Cart' : 'Cart'}
                    </button>

                    {/* Request to Buy */}
                    <button
                      className={styles.requestBtn}
                      onClick={() => setShowRequestForm(true)}
                      style={{ flex: 1 }}
                    >
                      Request to Buy
                    </button>
                  </div>
                ) : (
                  <div className={styles.requestForm}>
                    <div className={styles.requestFormTitle}>How many kg do you need?</div>
                    
                    <div className={styles.quantityHint}>
                      Available: {listing.remainingQty}kg
                    </div>
                    
                    <input
                      type="number"
                      className={styles.quantityInput}
                      value={requestQty}
                      onChange={(e) => setRequestQty(e.target.value)}
                      placeholder={`Max ${listing.remainingQty}kg`}
                      min={1}
                      max={listing.remainingQty}
                      autoFocus
                    />
                    
                    <div className={styles.requestFormActions}>
                      <button 
                        className={styles.cancelBtn}
                        onClick={() => {
                          setRequestQty('');
                          setShowRequestForm(false);
                        }}
                      >
                        Cancel
                      </button>
                      <button 
                        className={styles.submitBtn}
                        onClick={handleRequestToBuy}
                        disabled={isSubmitting || !requestQty || Number(requestQty) <= 0}
                      >
                        {isSubmitting ? 'Sending...' : 'Send Request'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}