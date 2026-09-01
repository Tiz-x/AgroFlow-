import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  RiLeafFill,
  RiCheckboxCircleLine,
  RiUserLine,
  RiSettings4Line,
  RiLogoutBoxRLine,
  RiStore3Line,
  RiTimeLine,
  RiCheckDoubleLine,
  RiBellLine,
  RiShoppingCartLine,
  RiSendPlaneLine,
  RiMailSendLine,
  RiHomeSmileLine,
  RiRobot2Fill,
  RiShoppingBagLine,
} from "react-icons/ri";
import { MdOutlineMenu, MdClose, MdFavorite } from "react-icons/md";
import { FaSeedling } from "react-icons/fa";
import {
  marketService,
  type Listing,
  type Demand,
  type Match,
  type Notification,
  type CropType,
  type Order,
} from "../../services/marketService";
import { authService } from "../../services/authService";
import { useToast } from "../../context/ToastContext";
import { ConfirmModal } from "../../components/ConfirmModal/ConfirmModal";
import { ListingDetailModal } from "../../components/ListingDetailModal/ListingDetailModal";
import { SectionMarketplace } from "../BuyerSellerDashboard/sections/SectionMarketplace";
import { SectionMatches } from "../BuyerSellerDashboard/sections/SectionMatches";
import { SectionWaitlist } from "../BuyerSellerDashboard/sections/SectionWaitlist";
import { SectionNotifications } from "../BuyerSellerDashboard/sections/SectionNotifications";
import { SectionSettings } from "../BuyerSellerDashboard/sections/SectionSettings";
import { SectionPostDemand } from "../BuyerSellerDashboard/sections/SectionPostDemand";
import { SectionOrders } from "../BuyerSellerDashboard/sections/SectionOrders";
import { SectionCart } from "../BuyerSellerDashboard/sections/SectionCart";
import { SectionFavorites } from "../BuyerSellerDashboard/sections/SectionFavorites";
import { SectionFollowing } from "../BuyerSellerDashboard/sections/SectionFollowing";
import { ListingCard } from "../BuyerSellerDashboard/components/ListingCard";
import { CROP_ICON } from "../BuyerSellerDashboard/constants";
import { useCartStore } from "../../store/cartStore";
import { useFavoritesStore } from "../../store/favoritesStore";
import { LoadingButton } from "../../components/LoadingButton/LoadingButton";
import PageLoader from "../../components/PageLoader/PageLoader";
import styles from "./BuyerSellerDashboard.module.css";

type Section =
  | "marketplace"
  | "buy"
  | "matches"
  | "waitlist"
  | "notifications"
  | "settings"
  | "orders"
  | "cart"
  | "saved"
  | "following";

const SECTION_STORAGE_KEY = "buyer_section";

export default function BuyerDashboard() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [user, setUser] = useState(
    authService.getUser() ?? {
      id: "mock-001",
      name: "Buyer User",
      email: "buyer@test.com",
      role: "buyer",
      phone: "+234 801 234 5678",
      location: "Ijapo Estate, Akure",
      avatar: null,
    },
  );

  const initials =
    user.name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase() ?? "BU";
  
  // ── Save section to sessionStorage and restore on mount ──────────────
  const [section, setSection] = useState<Section>(() => {
    const saved = sessionStorage.getItem(SECTION_STORAGE_KEY);
    if (saved && ["marketplace", "buy", "matches", "waitlist", "notifications", "settings", "orders", "cart", "saved", "following"].includes(saved)) {
      return saved as Section;
    }
    return "marketplace";
  });

  // ── Wrapped setSection that persists to sessionStorage ──────────────
  const handleSetSection = (s: Section) => {
    sessionStorage.setItem(SECTION_STORAGE_KEY, s);
    setSection(s);
  };

  const [sidebarOpen, setSidebar] = useState(false);
  const [cropFilter, setCropFilter] = useState<CropType | "All">("All");
  const [listings, setListings] = useState<Listing[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [waitlist, setWaitlist] = useState<Demand[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [followedSellers, setFollowedSellers] = useState<any[]>([]);
  const [selectedListing, setSelectedListing] = useState<Listing | null>(null);
  const [showRequestModal, setShowRequestModal] = useState<{
    listing: Listing;
  } | null>(null);
  const [requestQty, setRequestQty] = useState("");
  const [requestMsg, setRequestMsg] = useState("");
  const [modal, setModal] = useState<null | {
    type: "match" | "waitlist" | "requestSent";
    data: any;
  }>(null);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: "delete" | "accept" | "reject";
    data?: any;
  }>({ show: false, type: "delete" });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newListingsCount, setNewListingsCount] = useState(0);

  // AI Recommendations State
  const [aiRecommendations, setAIRecommendations] = useState<any[]>([]);
  const [showAIRecommendations, setShowAIRecommendations] = useState(true);
  const [showAllRecommendations, setShowAllRecommendations] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // ── Scroll to top ──────────────────────────────────────────────
  const [showScrollTop, setShowScrollTop] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Cart Store
  const cartCount = useCartStore((s) => s.totalItems());

  // Favorites Store
  const { listingIds, sellerIds } = useFavoritesStore();

  // ── Prevent back button from closing the app ──────────────────────────
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch followed sellers whenever sellerIds or listings change
  useEffect(() => {
    fetchFollowedSellers();
  }, [sellerIds, listings]);

  useEffect(() => {
    const check = (): void => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── FIXED: Detect scroll for scroll-to-top button ──────────────────────────
  useEffect(() => {
    let scrollTimeout: ReturnType<typeof setTimeout>;
    let isMounted = true;

    const setupScrollListener = () => {
      const el = contentRef.current;
      if (!el) {
        // Retry if ref isn't ready yet
        scrollTimeout = setTimeout(setupScrollListener, 100);
        return;
      }

      const onScroll = () => {
        if (!isMounted) return;
        const scrollTop = el.scrollTop;
        setShowScrollTop(scrollTop > 300);
      };

      // Check initial position
      onScroll();

      el.addEventListener("scroll", onScroll);
      
      // Cleanup function for this listener
      return () => {
        el.removeEventListener("scroll", onScroll);
      };
    };

    const cleanup = setupScrollListener();

    return () => {
      isMounted = false;
      clearTimeout(scrollTimeout);
      if (typeof cleanup === 'function') {
        cleanup();
      }
    };
  }, []);

  const scrollToTop = () => {
    contentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ── INITIAL LOAD ──────────────────────────────────────────────
  async function initialLoad() {
    setLoading(true);
    try {
      const [listingsData, matchesData, waitlistData, ordersData] = await Promise.allSettled([
        marketService.getListings(user.location),
        marketService.getMatches(),
        marketService.getWaitlist(),
        marketService.getOrders(),
      ]);
      if (listingsData.status === 'fulfilled') setListings(listingsData.value);
      if (matchesData.status === 'fulfilled') setMatches(matchesData.value);
      if (waitlistData.status === 'fulfilled') setWaitlist(waitlistData.value);
      if (ordersData.status === 'fulfilled') setOrders(ordersData.value);
      setNotifs(marketService.getNotifications(user.id));
    } finally {
      setLoading(false);
    }
  }

  // ── SILENT BACKGROUND REFRESH ────────────────────────────────
  async function refresh() {
    try {
      const [listingsData, matchesData, waitlistData, ordersData] = await Promise.allSettled([
        marketService.getListings(user.location),
        marketService.getMatches(),
        marketService.getWaitlist(),
        marketService.getOrders(),
      ]);

      if (listingsData.status === 'fulfilled') {
        const newData = listingsData.value;
        setListings(prev => {
          if (newData.length > prev.length) {
            setNewListingsCount(newData.length - prev.length);
            setTimeout(() => setNewListingsCount(0), 4000);
          }
          return newData;
        });
      }
      if (matchesData.status === 'fulfilled') setMatches(matchesData.value);
      if (waitlistData.status === 'fulfilled') setWaitlist(waitlistData.value);
      if (ordersData.status === 'fulfilled') setOrders(ordersData.value);
      setNotifs(marketService.getNotifications(user.id));
    } catch (err) {
      console.error("Silent refresh error:", err);
    }
  }

  const loadAIRecommendations = async () => {
    try {
      const recommendations = await marketService.getAIRecommendations();
      if (recommendations && recommendations.length > 0) {
        setAIRecommendations(recommendations);
      }
    } catch (error) {
      console.error("Error loading recommendations:", error);
    }
  };

  // Fetch followed sellers from listings with proper names
  const fetchFollowedSellers = () => {
    const uniqueSellers = listings.reduce((acc: any[], listing: any) => {
      if (listing.sellerId && !acc.find((s) => s.id === listing.sellerId)) {
        acc.push({
          id: listing.sellerId,
          location: listing.location || "Nigeria",
          name: listing.sellerName || "Unknown Seller",
          user: {
            name: listing.sellerName || "Unknown Seller",
            email: listing.sellerEmail || "",
            phone: listing.sellerPhone || "",
          },
        });
      }
      return acc;
    }, []);

    const followed = uniqueSellers.filter((s) => sellerIds.includes(s.id));
    setFollowedSellers(followed);
  };

  const unread = notifs.filter((n) => !n.read).length;

  const handleRequestToBuy = (listing: Listing) => {
    setShowRequestModal({ listing });
    setRequestQty("");
    setRequestMsg("");
  };

  const handleListingClick = (listing: Listing) => {
    setSelectedListing(listing);
  };

  const submitRequest = async () => {
    setSubmittingRequest(true);
    try {
      const qty = Number(requestQty);
      if (!showRequestModal) return;
      if (qty <= 0 || qty > showRequestModal.listing.remainingQty) {
        addToast(
          `Please enter a valid quantity (max ${showRequestModal.listing.remainingQty}kg)`,
          "error",
        );
        return;
      }
      const result = await marketService.createRequest(
        showRequestModal.listing.id,
        qty,
        requestMsg ||
          `I would like to buy ${qty}kg of your ${showRequestModal.listing.cropType}`,
        user.location || "Ijapo Estate",
      );
      if (!result.success) {
        addToast(result.error || "Failed to send request", "error");
        return;
      }
      setShowRequestModal(null);
      setModal({ type: "requestSent", data: result.request });
      refresh();
      addToast("Request sent successfully!", "success");
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  const confirmLogout = () => {
    authService.clearSession();
    navigate("/login");
    addToast("Logged out successfully", "success");
  };

  const filteredListings = listings.filter(
    (l) =>
      (cropFilter === "All" || l.cropType === cropFilter) &&
      l.status !== "sold",
  );

  // Convert AI recommendations to Listing format for ListingCard
const aiListings: Listing[] = aiRecommendations.map((rec) => ({
  id: rec.listingId,
  sellerId: rec.sellerId,
  sellerName: rec.sellerName,
  sellerEmail: "",
  sellerPhone: "",
  cropType: rec.cropType,
  quantity: rec.quantity,
  remainingQty: rec.quantity,
  location: rec.location,
  description: "",
  photoUrls: rec.photoUrls || (rec.photoUrl ? [rec.photoUrl] : []),
  status: "available",
  createdAt: new Date().toISOString(),
  distance: rec.distance,
}));


  const initialCount: number = isMobile ? 2 : 3;

  const sidebarNavItems: {
    id: Section;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "marketplace",
      label: "Marketplace",
      icon: <RiStore3Line size={17} />,
    },
    { id: "buy", label: "Post Demand", icon: <FaSeedling size={15} /> },
    {
      id: "matches",
      label: "My Matches",
      icon: <RiCheckDoubleLine size={16} />,
      badge: matches.length,
    },
    {
      id: "waitlist",
      label: "Waitlist",
      icon: <RiTimeLine size={15} />,
      badge: waitlist.length,
    },
    {
      id: "orders",
      label: "Orders",
      icon: <RiShoppingBagLine size={15} />,
      badge: orders.filter((o) => o.status === "placed").length,
    },
    {
      id: "cart",
      label: "Cart",
      icon: <RiShoppingCartLine size={15} />,
      badge: cartCount,
    },
    {
      id: "saved",
      label: "Saved",
      icon: <MdFavorite size={15} />,
      badge: listingIds.length,
    },
    {
      id: "following",
      label: "Following",
      icon: <RiUserLine size={15} />,
      badge: followedSellers.length,
    },
    {
      id: "notifications",
      label: "Notifications",
      icon: <RiBellLine size={15} />,
      badge: unread,
    },
    { id: "settings", label: "Settings", icon: <RiSettings4Line size={17} /> },
  ];

  const bottomNavItems = [
    { id: "marketplace", label: "Home", icon: <RiHomeSmileLine size={22} /> },
    {
      id: "cart",
      label: "Cart",
      icon: <RiShoppingCartLine size={20} />,
      badge: cartCount,
    },
    {
      id: "orders",
      label: "Orders",
      icon: <RiShoppingBagLine size={20} />,
      badge: orders.filter((o) => o.status === "placed").length,
    },
    {
      id: "saved",
      label: "Saved",
      icon: <MdFavorite size={20} />,
      badge: listingIds.length,
    },
  ];

  const visibleRecommendations = showAllRecommendations
    ? aiListings
    : aiListings.slice(0, initialCount);

  // ── Initial load + polling ──────────────────────────────────────
  useEffect(() => {
    initialLoad();
    loadAIRecommendations();

    const interval = setInterval(() => {
      refresh();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (loading) return <PageLoader />;

  return (
    <div className={styles.shell}>
      <ConfirmModal
        isOpen={confirmModal.show}
        title="Confirm"
        message="Are you sure?"
        onConfirm={() => {
          setConfirmModal({ show: false, type: "delete" });
          refresh();
        }}
        onCancel={() => setConfirmModal({ show: false, type: "delete" })}
      />

      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="Logout"
        message="Are you sure you want to log out?"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />

      <div
        className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ""}`}
        onClick={() => setSidebar(false)}
      />

      {/* Request Modal */}
      {showRequestModal && (
        <div
          className={styles.modalOverlay}
          onClick={() => setShowRequestModal(null)}
        >
          <div
            className={styles.modal}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <div className={styles.modalIcon} style={{ background: "#f2f9e4" }}>
              <RiSendPlaneLine size={32} color="#2d6a35" />
            </div>
            <div className={styles.modalTitle}>Request to Buy</div>
            <div style={{ marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  marginBottom: 16,
                  padding: 12,
                  background: "#f7f8f5",
                  borderRadius: 12,
                }}
              >
                {showRequestModal.listing.photoUrls ? (
                  <img
                    src={showRequestModal.listing.photoUrls[0]}
                    alt=""
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      objectFit: "cover",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 8,
                      background: "#e2e8df",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {CROP_ICON[showRequestModal.listing.cropType]}
                  </div>
                )}
                <div>
                  <div style={{ fontWeight: 800, marginBottom: 4 }}>
                    {showRequestModal.listing.cropType}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7f6e" }}>
                    Seller: {showRequestModal.listing.sellerName}
                  </div>
                  <div style={{ fontSize: 12, color: "#6b7f6e" }}>
                    Available: {showRequestModal.listing.remainingQty}kg
                  </div>
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Quantity Needed (kg) *
                </label>
                <input
                  type="number"
                  className={styles.fieldInput}
                  value={requestQty}
                  onChange={(e) => setRequestQty(e.target.value)}
                  min={1}
                  max={showRequestModal.listing.remainingQty}
                  placeholder={`Max ${showRequestModal.listing.remainingQty}kg`}
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  Message to Seller (Optional)
                </label>
                <textarea
                  className={styles.fieldTextarea}
                  rows={3}
                  value={requestMsg}
                  onChange={(e) => setRequestMsg(e.target.value)}
                  placeholder="e.g., When can I pick up? Do you deliver?"
                />
              </div>
            </div>
            <div className={styles.modalBtns}>
              <LoadingButton
                loading={submittingRequest}
                className={styles.modalBtnPrimary}
                onClick={submitRequest}
              >
                <RiMailSendLine size={16} /> Send Request
              </LoadingButton>
              <button
                className={styles.modalBtnOutline}
                onClick={() => setShowRequestModal(null)}
                disabled={submittingRequest}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Result Modal */}
      {modal && (
        <div
          className={styles.modalOverlay}
          onClick={() => {
            setModal(null);
            refresh();
          }}
        >
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div
              className={`${styles.modalIcon} ${modal.type === "match" || modal.type === "requestSent" ? styles.modalIconSuccess : styles.modalIconWait}`}
            >
              {modal.type === "requestSent" ? (
                <RiMailSendLine size={32} />
              ) : modal.type === "match" ? (
                <RiCheckboxCircleLine size={32} />
              ) : (
                <RiTimeLine size={32} />
              )}
            </div>
            <div className={styles.modalTitle}>
              {modal.type === "requestSent"
                ? "Request Sent!"
                : modal.type === "match"
                  ? "Match Found!"
                  : "Added to Waitlist"}
            </div>
            <div className={styles.modalText}>
              {modal.type === "requestSent"
                ? `Your request has been sent to the seller.`
                : modal.type === "match"
                  ? `Great news! We found matches for your demand.`
                  : `No sellers available right now. We'll notify you when someone lists matching produce.`}
            </div>
            <div className={styles.modalBtns}>
              <button
                className={styles.modalBtnPrimary}
                onClick={() => {
                  setModal(null);
                  refresh();
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Listing Detail Modal */}
      {selectedListing && (
        <ListingDetailModal
          listing={selectedListing}
          isOpen={!!selectedListing}
          onClose={() => setSelectedListing(null)}
          onRequestToBuy={handleRequestToBuy}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}
      >
        <div className={styles.sidebarTop}>
          <div className={styles.logoRow}>
            <div className={styles.logoMark}>
              <RiLeafFill size={16} />
            </div>
            <span className={styles.logoText}>
              AgroFlow<span>+</span>
            </span>
          </div>
          <div className={styles.profileRow}>
            <div className={styles.profileAvatar}>{initials}</div>
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{user.name}</div>
              <div className={styles.profileRole}>
                <RiShoppingCartLine size={10} /> Buyer
              </div>
            </div>
          </div>
        </div>
        <nav className={styles.sidebarNav}>
          <div className={styles.navLabel}>NAVIGATION</div>
          {sidebarNavItems.map((item) => (
            <button
              key={item.id}
              className={`${styles.navItem} ${section === item.id ? styles.navItemActive : ""}`}
              onClick={() => {
                handleSetSection(item.id);
                setSidebar(false);
              }}
            >
              <div className={styles.navIcon}>{item.icon}</div>
              <span className={styles.navText}>{item.label}</span>
              {item.badge && item.badge > 0 && (
                <span className={styles.navBadgeGreen}>{item.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div className={styles.sidebarBottom}>
          <button
            className={`${styles.sidebarBtn} ${styles.sidebarBtnDanger}`}
            onClick={handleLogout}
          >
            <RiLogoutBoxRLine size={15} /> Log Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button
              className={styles.menuBtn}
              onClick={() => setSidebar((p) => !p)}
            >
              {sidebarOpen ? (
                <MdClose size={17} />
              ) : (
                <MdOutlineMenu size={17} />
              )}
            </button>
            <div className={styles.roleBadge}>
              <span className={styles.buyerBadge}>Buyer Mode</span>
            </div>
          </div>
          <div style={{ width: 40 }}></div>
          <div className={styles.topbarRight}>
            <button
              className={styles.topbarIconBtn}
              onClick={() => handleSetSection("notifications")}
            >
              <RiBellLine size={15} />
              {unread > 0 && <div className={styles.notifBadge} />}
            </button>
            <div className={styles.topbarIconBtn}>
              <RiUserLine size={15} />
            </div>
          </div>
        </div>

        <div
          ref={contentRef}
          className={styles.content}
          style={{ 
            overflowY: "auto", 
            height: "calc(100vh - 140px)",
            paddingBottom: isMobile ? "140px" : "120px",
            position: "relative"
          }}
        >
          {section === "marketplace" && (
            <>
              {/* ── New Listings Notification ────────────────────────────────── */}
              {newListingsCount > 0 && (
                <div style={{
                  position: 'fixed',
                  top: 70,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: '#2d6a35',
                  color: '#fff',
                  padding: '8px 18px',
                  borderRadius: 100,
                  fontSize: 12,
                  fontWeight: 700,
                  zIndex: 100,
                  boxShadow: '0 2px 12px rgba(0,0,0,0.2)',
                  animation: 'fadeIn 0.3s ease',
                  whiteSpace: 'nowrap',
                }}>
                  🌾 {newListingsCount} new listing{newListingsCount > 1 ? 's' : ''} available
                </div>
              )}

              {/* ── Show AI Recommendations pill ────────────────── */}
              {!showAIRecommendations && aiListings.length > 0 && (
                <button
                  onClick={() => setShowAIRecommendations(true)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    margin: "0 16px 12px",
                    padding: "8px 14px",
                    borderRadius: 100,
                    background: "#f2f9e4",
                    border: "1.5px solid #a8d832",
                    color: "#2d6a35",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  <RiRobot2Fill size={14} />
                  Show AI Recommendations
                </button>
              )}

              {/* AI RECOMMENDATIONS SECTION */}
              {showAIRecommendations && aiListings.length > 0 && (
                <div className={styles.aiRecommendationsSection}>
                  <div className={styles.aiSectionHeader}>
                    <div className={styles.aiHeaderLeft}>
                      <div className={styles.aiIcon}>
                        <RiRobot2Fill size={28} color="#2d6a35" />
                      </div>
                      <div>
                        <h3 className={styles.aiTitle}>
                          AI-Powered Recommendations
                        </h3>
                        <p className={styles.aiSubtitle}>
                          {aiRecommendations.length > 0 &&
                          aiRecommendations[0]?.isNewUserRecommendation
                            ? `Based on your location in ${user.location || "Akure"}`
                            : `Based on your purchase history and preferences`}
                        </p>
                      </div>
                    </div>
                    <button
                      className={styles.aiDismissBtn}
                      onClick={() => setShowAIRecommendations(false)}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Cards - Direct ListingCard with match data */}
                  <div className={styles.marketplaceGrid}>
                    {visibleRecommendations.map((listing, index) => {
                      const rec = aiRecommendations[index];
                      return (
                        <ListingCard
                          key={listing.id}
                          listing={listing}
                          intent="buy"
                          onRequestToBuy={handleRequestToBuy}
                          onClick={handleListingClick}
                          matchScore={rec?.score}
                          matchReasons={rec?.reasons?.slice(0, 2)}
                        />
                      );
                    })}
                  </div>

                  {/* Show More / Show Less */}
                  {aiListings.length > initialCount && (
                    <div className={styles.showMoreContainer}>
                      <button
                        className={styles.showMoreBtn}
                        onClick={() =>
                          setShowAllRecommendations(!showAllRecommendations)
                        }
                      >
                        {showAllRecommendations
                          ? "Show Less ↑"
                          : `Show More (${aiListings.length - initialCount} more) ↓`}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Regular Marketplace */}
              <SectionMarketplace
                listings={filteredListings}
                cropFilter={cropFilter}
                setCropFilter={setCropFilter}
                intent="buy"
                onRequestToBuy={handleRequestToBuy}
                onListingClick={handleListingClick}
              />
            </>
          )}

          {section === "buy" && (
            <SectionPostDemand
              user={user}
              onResult={(r) => {
                refresh();
                setModal({ type: r.matched ? "match" : "waitlist", data: r });
              }}
            />
          )}

          {section === "matches" && (
            <SectionMatches matches={matches} userId={user.id} />
          )}

          {section === "waitlist" && <SectionWaitlist waitlist={waitlist} />}

          {section === "orders" && (
            <SectionOrders orders={orders} role="buyer" onUpdate={refresh} />
          )}

          {section === "cart" && (
            <SectionCart onOrderPlaced={() => handleSetSection("orders")} />
          )}

          {section === "saved" && (
            <SectionFavorites
              listings={listings}
              onRequestToBuy={handleRequestToBuy}
              onListingClick={setSelectedListing}
            />
          )}

          {section === "following" && (
            <SectionFollowing sellers={followedSellers} />
          )}

          {section === "notifications" && (
            <SectionNotifications
              notifs={notifs}
              onMarkAll={() => {
                marketService.markAllRead(user.id);
                refresh();
                addToast("All notifications marked as read", "info");
              }}
            />
          )}

          {section === "settings" && (
            <>
              <SectionSettings
                user={user}
                onUpdate={(updatedUser) => {
                  setUser(updatedUser);
                  refresh();
                  addToast("Profile updated successfully!", "success");
                }}
              />
            </>
          )}

          {/* ── FIXED: Scroll to top button ─────────────── */}
          {showScrollTop && (
            <button
              onClick={scrollToTop}
              style={{
                position: "fixed",
                bottom: 100,
                right: 20,
                width: 48,
                height: 48,
                borderRadius: "50%",
                background: "#2d6a35",
                color: "#fff",
                border: "none",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 4px 16px rgba(45, 106, 53, 0.4)",
                zIndex: 9999,
                fontSize: 22,
                transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.1)";
                e.currentTarget.style.boxShadow = "0 6px 24px rgba(45, 106, 53, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 4px 16px rgba(45, 106, 53, 0.4)";
              }}
              aria-label="Scroll to top"
            >
              ↑
            </button>
          )}
        </div>

        <div className={styles.bottomNav}>
          <div className={styles.bottomNavItems}>
            {bottomNavItems.map((item) => (
              <button
                key={item.id}
                className={`${styles.bottomNavItem} ${section === item.id ? styles.bottomNavItemActive : ""}`}
                onClick={() => handleSetSection(item.id as Section)}
              >
                <div className={styles.bottomNavIcon}>
                  {item.icon}
                  {item.badge && item.badge > 0 && (
                    <span className={styles.bottomNavBadge}>
                      {item.badge > 99 ? "99+" : item.badge}
                    </span>
                  )}
                </div>
                <span className={styles.bottomNavLabel}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}