import { useState } from "react";
import { RiMapPinLine } from "react-icons/ri";
import {
  MdAddShoppingCart,
  MdFavorite,
  MdFavoriteBorder,
} from "react-icons/md";
import { CROP_ICON } from "../constants";
import styles from "../BuyerSellerDashboard.module.css";
import type { Listing, CropType } from "../../../services/marketService";
import { useCartStore } from "../../../store/cartStore";
import { useFavoritesStore } from "../../../store/favoritesStore";
import { useToast } from "../../../context/ToastContext";

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
        className={styles.cardImage}
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
              bottom: 6,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: 5,
              zIndex: 3,
            }}
          >
            {photos.map((_, i) => (
              <button
                key={i}
                onClick={(e) => goTo(e, i)}
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  background: i === activeIndex ? '#fff' : 'rgba(255,255,255,0.5)',
                  boxShadow: '0 0 2px rgba(0,0,0,0.4)',
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

// ── Listing Card Component ──────────────────────────────────────────────
interface ListingCardProps {
  listing: Listing;
  intent: "buy" | "sell";
  onRequestToBuy: (listing: Listing) => void;
  onClick?: (listing: Listing) => void;
  matchScore?: number;
  matchReasons?: string[];
}

export function ListingCard({
  listing,
  intent,
  onClick,
  matchScore,
  matchReasons = [],
}: ListingCardProps) {
  const [showReasons, setShowReasons] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const addItem = useCartStore((s) => s.addItem);
  const removeItem = useCartStore((s) => s.removeItem);
  const cartItems = useCartStore((s) => s.items);
  const inCart = cartItems.some((i) => i.listing.id === listing.id);

  const { toggleListing, isLiked } = useFavoritesStore();
  const liked = isLiked(listing.id);
  const { addToast } = useToast();

  const handleCardClick = () => {
    if (onClick) onClick(listing);
  };

  const handleAddToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isAddingToCart) return;

    if (inCart) {
      removeItem(listing.id);
      addToast("Removed from cart", "info");
      return;
    }

    setIsAddingToCart(true);
    try {
      addItem(listing, 1);
      addToast("Added to cart!", "success");
    } finally {
      setIsAddingToCart(false);
    }
  };

  return (
    <div
      className={styles.marketplaceCard}
      onClick={handleCardClick}
      style={{ cursor: onClick ? "pointer" : "default", position: "relative" }}
    >
      {/* ── IMAGE AREA ── */}
      <div className={styles.cardImageArea}>
        {listing.photoUrls && listing.photoUrls.length > 0 ? (
          <ImageCarousel photos={listing.photoUrls} alt={listing.cropType} />
        ) : (
          <div
            className={styles.cardImagePlaceholder}
            style={{
              background: "linear-gradient(135deg, #f2f9e4, #e8f5d0)",
              fontSize: 48,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              minHeight: 140,
            }}
          >
            {CROP_ICON[listing.cropType as CropType] || "🌾"}
          </div>
        )}

        {/* Crop badge — top left */}
        <div className={styles.cropBadge}>
          {CROP_ICON[listing.cropType as CropType]} {listing.cropType}
        </div>

        {/* Heart — top right (buyer only) */}
        {intent === "buy" && (
          <button
            className={styles.heartBtn}
            onClick={(e) => {
              e.stopPropagation();
              toggleListing(listing.id);
              addToast(
                liked ? "Removed from favorites" : "Added to favorites",
                "success",
              );
            }}
            aria-label={liked ? "Remove from favorites" : "Add to favorites"}
          >
            {liked ? (
              <MdFavorite size={16} color="#e05252" />
            ) : (
              <MdFavoriteBorder size={16} color="#9ead9f" />
            )}
          </button>
        )}

        {/* Cart button — bottom right of image (buyer only) */}
        {intent === "buy" && listing.status !== "sold" && (
          <button
            onClick={handleAddToCart}
            style={{
              position: "absolute",
              bottom: matchScore ? 32 : 8,
              right: 8,
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: inCart ? "#a8d832" : "rgba(255,255,255,0.95)",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
              zIndex: 2,
              transition: "all 0.15s",
            }}
            aria-label={inCart ? "In cart" : "Add to cart"}
          >
            <MdAddShoppingCart
              size={16}
              color={inCart ? "#141f15" : "#6b7f6e"}
            />
          </button>
        )}

        {/* Match bar */}
        {matchScore && (
          <div className={styles.matchBar}>
            <span className={styles.matchBadge}>{matchScore}% Match</span>
            <button
              className={styles.whyBtn}
              onClick={(e) => {
                e.stopPropagation();
                setShowReasons((r) => !r);
              }}
            >
              {showReasons ? "Close ✕" : "Why? →"}
            </button>
            {showReasons && matchReasons.length > 0 && (
              <div className={styles.reasonsOverlay}>
                {matchReasons.map((r, i) => (
                  <span key={i} className={styles.reasonItem}>
                    ✓ {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Sold overlay */}
        {listing.status === "sold" && (
          <div className={styles.statusOverlay}>
            <span>Sold Out</span>
          </div>
        )}
      </div>

      {/* ── MINIMAL INFO BELOW IMAGE ── */}
      <div style={{ padding: "10px 10px 12px" }}>
        {/* Seller + distance */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            marginBottom: 6,
          }}
        >
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #a8d832, #2d6a35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 9,
              fontWeight: 700,
              color: "#141f15",
              flexShrink: 0,
            }}
          >
            {listing.sellerName?.charAt(0).toUpperCase() || "S"}
          </div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: "#141f15",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {listing.sellerName}
          </span>
          <span
            style={{
              fontSize: 10,
              color: "#9ead9f",
              display: "flex",
              alignItems: "center",
              gap: 2,
              flexShrink: 0,
            }}
          >
            <RiMapPinLine size={9} /> {listing.distance || "nearby"}
          </span>
        </div>

        {/* Quantity — prominent */}
        <div style={{ fontSize: 17, fontWeight: 800, color: '#2d6a35' }}>
          {listing.remainingQty}kg
          <span style={{ fontSize: 10, color: '#9ead9f', marginLeft: 4 }}>
            / {listing.quantity}kg
          </span>
        </div>

        {/* Description — 1 line only */}
        {listing.description && (
          <div
            style={{
              fontSize: 10,
              color: "#9ead9f",
              marginTop: 3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {listing.description}
          </div>
        )}
      </div>
    </div>
  );
}