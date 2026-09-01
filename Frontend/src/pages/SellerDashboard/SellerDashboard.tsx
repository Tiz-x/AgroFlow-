import { useState, useEffect} from "react";
import { useNavigate } from "react-router-dom";
import {
  RiLeafFill,
  RiChatCheckLine,
  RiUserLine,
  RiSettings4Line,
  RiLogoutBoxRLine,
  RiStore3Line,
  RiShoppingBagLine,
  RiCheckDoubleLine,
  RiAddCircleLine,
  RiBellLine,
  RiDashboardLine,
} from "react-icons/ri";
import { MdOutlineMenu, MdClose } from "react-icons/md";
import { FaStore } from "react-icons/fa";
import {
  marketService,
  type Listing,
  type Match,
  type Notification,
  type Request,
  type Order,
} from "../../services/marketService";
import { sellerService } from "../../services/sellerService";
import { authService } from "../../services/authService";
import { useToast } from "../../context/ToastContext";
import { ConfirmModal } from "../../components/ConfirmModal/ConfirmModal";
import { LoadingButton } from "../../components/LoadingButton/LoadingButton";
import PageLoader from "../../components/PageLoader/PageLoader";
import { VerificationModal } from "../../components/VerificationModal/VerificationModal";
import { SectionDashboard } from "../BuyerSellerDashboard/sections/SectionDashboard";
import { SectionMyStore } from "../BuyerSellerDashboard/sections/SectionMyStore";
import { SectionMatches } from "../BuyerSellerDashboard/sections/SectionMatches";
import { SectionRequests } from "../BuyerSellerDashboard/sections/SectionRequests";
import { SectionNotifications } from "../BuyerSellerDashboard/sections/SectionNotifications";
import { SectionSettings } from "../BuyerSellerDashboard/sections/SectionSettings";
import { SectionPostListing } from "../BuyerSellerDashboard/sections/SectionPostListing";
import { SectionOrders } from "../BuyerSellerDashboard/sections/SectionOrders";
import FloatingAI from "../../components/FloatingAI/FloatingAI";
import styles from "../BuyerSellerDashboard/BuyerSellerDashboard.module.css";

type Section =
  | "dashboard"
  | "myStore"
  | "sell"
  | "requests"
  | "matches"
  | "notifications"
  | "settings"
  | "orders";

const SECTION_STORAGE_KEY = "seller_section";

export default function SellerDashboard() {
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [user, setUser] = useState(
    authService.getUser() ?? {
      id: "mock-001",
      name: "Seller User",
      email: "seller@test.com",
      role: "seller",
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
      .toUpperCase() ?? "SE";
  
  // ── Save section to sessionStorage and restore on mount ──────────────
  const [section, setSection] = useState<Section>(() => {
    const saved = sessionStorage.getItem(SECTION_STORAGE_KEY);
    if (saved && ["dashboard", "myStore", "sell", "requests", "matches", "notifications", "settings", "orders"].includes(saved)) {
      return saved as Section;
    }
    return "dashboard";
  });

  // ── Wrapped setSection that persists to sessionStorage ──────────────
  const handleSetSection = (s: Section) => {
    sessionStorage.setItem(SECTION_STORAGE_KEY, s);
    setSection(s);
  };

  const [sidebarOpen, setSidebar] = useState(false);
  const [loading, setLoading] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [myListings, setMyListings] = useState<Listing[]>([]);
  const [myRequests, setMyRequests] = useState<Request[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [confirmModal, setConfirmModal] = useState<{
    show: boolean;
    type: "delete" | "accept" | "reject";
    data?: any;
  }>({ show: false, type: "delete" });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // ── Verification State ──────────────────────────────────────────────
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  // ── Prevent back button from closing the app ──────────────────────────
  useEffect(() => {
    window.history.pushState(null, '', window.location.href);
    
    const handlePopState = () => {
      window.history.pushState(null, '', window.location.href);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // ── Check verification status on load ──────────────────────────────
  useEffect(() => {
    const checkVerification = async () => {
      try {
        const status = await sellerService.getMyVerificationStatus();
        if (status.seller?.verificationStatus === 'verified') {
          setIsVerified(true);
        }
      } catch (error) {
        console.error('Error checking verification:', error);
      }
    };
    checkVerification();
  }, []);

  // ── Check verification and navigate ──────────────────────────────────
  const checkVerificationAndNavigate = async (targetSection: Section) => {
    // If it's not the sell section, just navigate
    if (targetSection !== 'sell' && targetSection !== 'myStore') {
      handleSetSection(targetSection);
      return;
    }

    // If already verified, navigate
    if (isVerified) {
      handleSetSection(targetSection);
      return;
    }

    try {
      const status = await sellerService.getMyVerificationStatus();
      
      if (status.seller?.verificationStatus === 'verified') {
        setIsVerified(true);
        handleSetSection(targetSection);
      } else if (status.seller?.verificationStatus === 'pending') {
        setShowVerificationModal(true);
      } else if (status.seller?.verificationStatus === 'rejected') {
        setShowVerificationModal(true);
      } else {
        // Unverified - show prompt
        setShowVerificationModal(true);
      }
    } catch (error) {
      console.error('Error checking verification:', error);
      // If error, still allow navigation (fallback)
      handleSetSection(targetSection);
    }
  };

  // ── Navigation handler ──────────────────────────────────────────────
  const handleNavClick = (section: Section) => {
    checkVerificationAndNavigate(section);
  };

  // ── INITIAL LOAD ──────────────────────────────────────────────
  async function initialLoad() {
    setLoading(true);
    try {
      const [matchesData, myListingsData, ordersData] = await Promise.all([
        marketService.getMatches(),
        marketService.getListingsBySeller(),
        marketService.getOrders(),
      ]);
      setMatches(matchesData);
      setMyListings(myListingsData);
      setOrders(ordersData);
      setNotifs(marketService.getNotifications(user.id));
      setMyRequests([]);
    } catch (err) {
      console.error("Initial load error:", err);
      addToast("Failed to load data", "error");
    } finally {
      setLoading(false);
    }
  }

  // ── SILENT BACKGROUND REFRESH ────────────────────────────────
  async function refresh() {
    try {
      const [matchesData, myListingsData, ordersData] = await Promise.all([
        marketService.getMatches(),
        marketService.getListingsBySeller(),
        marketService.getOrders(),
      ]);
      setMatches(matchesData);
      setMyListings(myListingsData);
      setOrders(ordersData);
      setNotifs(marketService.getNotifications(user.id));
      setMyRequests([]);
    } catch (err) {
      console.error("Refresh error:", err);
      addToast("Failed to refresh data", "error");
    }
  }

  // ── Initial load + polling ──────────────────────────────────────
  useEffect(() => {
    initialLoad();

    const interval = setInterval(() => {
      refresh(); // silent — no loader
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const unread = notifs.filter((n) => !n.read).length;

  const handleAcceptRequest = async (request: Request) => {
    setConfirmModal({ show: true, type: "accept", data: request });
  };

  const handleRejectRequest = async (request: Request) => {
    setConfirmModal({ show: true, type: "reject", data: request });
  };

  const handleLogout = () => setShowLogoutConfirm(true);
  
  const confirmLogout = async () => {
    setIsLoggingOut(true);
    try {
      authService.clearSession();
      navigate("/login");
      addToast("Logged out successfully", "success");
    } catch (error) {
      addToast("Failed to log out", "error");
      setIsLoggingOut(false);
    }
  };

  const sidebarNavItems: {
    id: Section;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }[] = [
    {
      id: "dashboard",
      label: "Dashboard",
      icon: <RiDashboardLine size={15} />,
    },
    {
      id: "myStore",
      label: "My Store",
      icon: <FaStore size={15} />,
      badge: myListings.length,
    },
    {
      id: "sell",
      label: "List Produce",
      icon: <RiShoppingBagLine size={15} />,
    },
    {
      id: "requests",
      label: "Requests",
      icon: <RiChatCheckLine size={15} />,
      badge: myRequests.filter((r) => r.status === "pending").length,
    },
    {
      id: "matches",
      label: "My Matches",
      icon: <RiCheckDoubleLine size={16} />,
      badge: matches.length,
    },
    {
      id: "orders",
      label: "Orders",
      icon: <RiShoppingBagLine size={15} />,
      badge: orders.filter((o) => o.status === "placed").length,
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
    {
      id: "dashboard",
      label: "Home",
      icon: <RiDashboardLine size={20} />,
    },
    {
      id: "myStore",
      label: "Store",
      icon: <FaStore size={20} />,
      badge: myListings.length,
    },
    { id: "sell", label: "Sell", icon: <RiAddCircleLine size={20} /> },
    {
      id: "requests",
      label: "Requests",
      icon: <RiChatCheckLine size={20} />,
      badge: myRequests.filter((r) => r.status === "pending").length,
    },
    {
      id: "orders",
      label: "Orders",
      icon: <RiShoppingBagLine size={20} />,
      badge: orders.filter((o) => o.status === "placed").length,
    },
  ];

  if (loading) return <PageLoader />;

  return (
    <>
      <div className={styles.shell}>
        <ConfirmModal
          isOpen={confirmModal.show}
          title={
            confirmModal.type === "accept" ? "Accept Request" : "Reject Request"
          }
          message={
            confirmModal.type === "accept"
              ? "Are you sure you want to accept this request?"
              : "Are you sure you want to reject this request?"
          }
          onConfirm={async () => {
            if (confirmModal.type === "accept" && confirmModal.data) {
              const result = await marketService.acceptRequest(
                confirmModal.data.id,
                user.location,
              );
              if (result.success) {
                addToast("Request accepted successfully!", "success");
                refresh();
              } else {
                addToast(result.error || "Failed to accept request", "error");
              }
            } else if (confirmModal.type === "reject" && confirmModal.data) {
              await marketService.rejectRequest(confirmModal.data.id);
              addToast("Request rejected", "info");
              refresh();
            }
            setConfirmModal({ show: false, type: "delete" });
          }}
          onCancel={() => setConfirmModal({ show: false, type: "delete" })}
        />

        <ConfirmModal
          isOpen={showLogoutConfirm}
          title="Logout"
          message="Are you sure you want to log out? You will need to login again to access your account."
          onConfirm={confirmLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />

        <div
          className={`${styles.overlay} ${sidebarOpen ? styles.overlayVisible : ""}`}
          onClick={() => setSidebar(false)}
        />

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
                  <RiStore3Line size={10} /> Seller
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
                  handleNavClick(item.id);
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
            <LoadingButton
              loading={isLoggingOut}
              className={`${styles.sidebarBtn} ${styles.sidebarBtnDanger}`}
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              <RiLogoutBoxRLine size={15} /> Log Out
            </LoadingButton>
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
                <span className={styles.sellerBadge}> Seller Mode</span>
              </div>
            </div>
            <div style={{ width: 40 }}></div>

            <div
              style={{
                flex: 1,
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <FloatingAI navbarMode={true} />
            </div>

            <div className={styles.topbarRight}>
              <button
                className={styles.topbarIconBtn}
                onClick={() => handleNavClick("notifications")}
              >
                <RiBellLine size={15} />
                {unread > 0 && <div className={styles.notifBadge} />}
              </button>
              <div className={styles.topbarIconBtn}>
                <RiUserLine size={15} />
              </div>
            </div>
          </div>

          <div className={styles.content}>
            {section === "dashboard" && (
              <SectionDashboard
                listings={myListings}
                orders={orders}
                requests={myRequests}
                matches={matches}
              />
            )}
            {section === "myStore" && (
              <SectionMyStore listings={myListings} onRefresh={refresh} />
            )}
            {section === "sell" && (
              <SectionPostListing
                user={user}
                onSuccess={() => {
                  refresh();
                  handleSetSection("myStore");
                  addToast("Listing posted successfully!", "success");
                }}
              />
            )}
            {section === "requests" && (
              <SectionRequests
                requests={myRequests}
                onAccept={handleAcceptRequest}
                onReject={handleRejectRequest}
              />
            )}
            {section === "matches" && (
              <SectionMatches matches={matches} userId={user.id} />
            )}
            {section === "orders" && (
              <SectionOrders orders={orders} role="seller" onUpdate={refresh} />
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
              <SectionSettings
                user={user}
                onUpdate={(updatedUser) => {
                  setUser(updatedUser);
                  refresh();
                  addToast("Profile updated successfully!", "success");
                }}
              />
            )}
          </div>

          <div className={styles.bottomNav}>
            <div className={styles.bottomNavItems}>
              {bottomNavItems.map((item) => (
                <button
                  key={item.id}
                  className={`${styles.bottomNavItem} ${section === item.id ? styles.bottomNavItemActive : ""}`}
                  onClick={() => handleNavClick(item.id as Section)}
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

      {/* ── Verification Modal ────────────────────────────────────────── */}
      <VerificationModal
        isOpen={showVerificationModal}
        onClose={() => {
          setShowVerificationModal(false);
        }}
        onVerified={() => {
          setIsVerified(true);
          handleSetSection('sell');
          addToast('Verification complete! You can now post listings.', 'success');
        }}
        onGoToSettings={() => {
          setShowVerificationModal(false);
          handleSetSection('settings');
        }}
      />

      <FloatingAI />
    </>
  );
}