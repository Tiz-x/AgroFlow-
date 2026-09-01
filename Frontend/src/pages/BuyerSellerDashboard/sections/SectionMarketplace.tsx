import { useState, useMemo } from "react";
import {
  RiSeedlingLine,
  RiSearchLine,
  RiFilterLine,
  RiCloseLine,
} from "react-icons/ri";
import { ListingCard } from "../components/ListingCard";
import { CROPS, CROP_ICON } from "../constants";
import styles from "../BuyerSellerDashboard.module.css";
import type { Listing, CropType } from "../../../services/marketService";

interface SectionMarketplaceProps {
  listings: Listing[];
  cropFilter: CropType | "All";
  setCropFilter: (c: CropType | "All") => void;
  intent: "buy" | "sell";
  onRequestToBuy: (l: Listing) => void;
  onListingClick?: (l: Listing) => void;
}

export function SectionMarketplace({
  listings,
  cropFilter,
  setCropFilter,
  intent,
  onRequestToBuy,
  onListingClick,
}: SectionMarketplaceProps) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [minQty, setMinQty] = useState("");
  const [maxQty, setMaxQty] = useState("");
  const [location, setLocation] = useState("");

  const filtered = useMemo(() => {
    return listings.filter((l) => {
      // Search — crop type, location, description
      if (search) {
        const s = search.toLowerCase();
        const matches =
          l.cropType.toLowerCase().includes(s) ||
          l.location.toLowerCase().includes(s) ||
          (l.description?.toLowerCase().includes(s) ?? false);
        if (!matches) return false;
      }

      // Crop filter tab
      if (cropFilter !== "All" && l.cropType !== cropFilter) return false;

      // Location filter
      if (
        location &&
        !l.location.toLowerCase().includes(location.toLowerCase())
      )
        return false;

      // Quantity filter
      if (minQty && l.quantity < Number(minQty)) return false;
      if (maxQty && l.quantity > Number(maxQty)) return false;

      return true;
    });
  }, [listings, search, cropFilter, location, minQty, maxQty]);

  const hasActiveFilters = location || minQty || maxQty;

  const clearFilters = () => {
    setLocation("");
    setMinQty("");
    setMaxQty("");
    setSearch("");
    setCropFilter("All");
  };

  return (
    <>
      <div className={styles.pageHeader}>
        <div className={styles.pageTitle}>Fresh Produce Marketplace</div>
        <div className={styles.pageSubtitle}>
          {filtered.length} of {listings.length} listings · Browse what farmers
          have harvested
        </div>
      </div>

      {/* Search bar */}
      <div style={{ padding: "0 16px 12px", display: "flex", gap: 8 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            background: "#f7f8f5",
            border: "1.5px solid #eaeee8",
            borderRadius: 12,
            padding: "0 12px",
            height: 44,
          }}
        >
          <RiSearchLine size={16} color="#9ead9f" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search crop, location..."
            style={{
              flex: 1,
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 14,
              color: "#141f15",
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#9ead9f",
              }}
            >
              <RiCloseLine size={16} />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowFilters((f) => !f)}
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            border: "none",
            background: hasActiveFilters ? "#a8d832" : "#f7f8f5",
            color: hasActiveFilters ? "#141f15" : "#6b7f6e",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <RiFilterLine size={18} />
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div
          style={{
            margin: "0 16px 12px",
            background: "#f7f8f5",
            border: "1.5px solid #eaeee8",
            borderRadius: 14,
            padding: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: 12,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: "#141f15" }}>
              Filters
            </span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{
                  fontSize: 12,
                  color: "#e05252",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Clear all
              </button>
            )}
          </div>

          {/* Location */}
          <div style={{ marginBottom: 12 }}>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7f6e",
                display: "block",
                marginBottom: 6,
              }}
            >
              Location
            </label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g. Lagos, Ibadan..."
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 8,
                border: "1.5px solid #eaeee8",
                background: "#fff",
                fontSize: 13,
                color: "#141f15",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Quantity range */}
          <div>
            <label
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "#6b7f6e",
                display: "block",
                marginBottom: 6,
              }}
            >
              Quantity (kg)
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={minQty}
                onChange={(e) => setMinQty(e.target.value)}
                placeholder="Min"
                type="number"
                style={{
                  flex: 1,
                  minWidth: 0,
                  boxSizing: 'border-box',
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #eaeee8",
                  background: "#fff",
                  fontSize: 13,
                  color: "#141f15",
                  outline: "none",
                }}
              />
              <input
                value={maxQty}
                onChange={(e) => setMaxQty(e.target.value)}
                placeholder="Max"
                type="number"
                style={{
                  flex: 1,
                  minWidth: 0,         
                  boxSizing: 'border-box',
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1.5px solid #eaeee8",
                  background: "#fff",
                  fontSize: 13,
                  color: "#141f15",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Crop tabs */}
      <div className={styles.cropTabs}>
        {(["All", ...CROPS] as (CropType | "All")[]).map((c) => (
          <button
            key={c}
            className={`${styles.cropTab} ${cropFilter === c ? styles.cropTabActive : ""}`}
            onClick={() => setCropFilter(c)}
          >
            {c !== "All" && CROP_ICON[c as CropType]} {c}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <RiSeedlingLine size={48} />
          </div>
          <div className={styles.emptyTitle}>
            {listings.length === 0
              ? "No produce listed yet"
              : "No results found"}
          </div>
          <div className={styles.emptyText}>
            {listings.length === 0
              ? "Check back later for fresh produce from local farmers."
              : "Try adjusting your search or filters."}
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                marginTop: 12,
                padding: "8px 20px",
                borderRadius: 10,
                background: "#a8d832",
                color: "#141f15",
                border: "none",
                fontWeight: 600,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className={styles.marketplaceGrid}>
          {filtered.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              intent={intent}
              onRequestToBuy={onRequestToBuy}
              onClick={onListingClick}
            />
          ))}
        </div>
      )}
    </>
  );
}
