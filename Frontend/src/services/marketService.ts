import { BASE_URL, getStoredToken, handleUnauthorized } from "./apiConfig";

export type CropType = "Maize" | "Tomato" | "Cassava" | "Pepper";

export const AKURE_AREAS = [
  "Oba-Ile",
  "Ijapo Estate",
  "Oke-Aro",
  "Arakale",
  "Isolo",
  "Oda",
  "Oke-Ogba",
  "Ijomu",
  "Ayedun",
  "Alagbaka",
];

export const AKURE_COORDS: Record<string, { lat: number; lng: number }> = {
  "Oba-Ile": { lat: 7.2986, lng: 5.1413 },
  "Ijapo Estate": { lat: 7.2558, lng: 5.1947 },
  "Oke-Aro": { lat: 7.2621, lng: 5.1823 },
  Arakale: { lat: 7.2533, lng: 5.1942 },
  Isolo: { lat: 7.2467, lng: 5.2011 },
  Oda: { lat: 7.2389, lng: 5.2134 },
  "Oke-Ogba": { lat: 7.2701, lng: 5.1756 },
  Ijomu: { lat: 7.2612, lng: 5.1889 },
  Ayedun: { lat: 7.2445, lng: 5.2089 },
  Alagbaka: { lat: 7.2578, lng: 5.1934 },
};

export interface Listing {
  id: string;
  sellerId: string;
  sellerName: string;
  // Null for anonymous visitors — the API only returns seller contact
  // details to signed-in callers.
  sellerEmail: string | null;
  sellerPhone?: string | null;
  cropType: CropType;
  quantity: number;
  remainingQty: number;
  location: string;
  description: string;
  photoUrls: string[]; // ── NEW: Multiple photo URLs
  status: "available" | "partial" | "sold";
  createdAt: string;
  distance?: number;
  coordinates?: { lat: number; lng: number } | null;
  requests?: Request[];
}

export interface Demand {
  id: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  cropType: CropType;
  quantity: number;
  location: string;
  status: "pending" | "matched" | "expired";
  createdAt: string;
}

export interface Request {
  id: string;
  listingId: string;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  requestedQty: number;
  message: string;
  status: "pending" | "accepted" | "rejected" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface Match {
  id: string;
  listingId: string;
  demandId?: string;
  requestId?: string;
  cropType: CropType;
  buyerId: string;
  buyerName: string;
  buyerEmail: string;
  buyerLoc: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  sellerLoc: string;
  quantity: number;
  distance: number;
  status: "pending" | "confirmed" | "declined";
  matchedAt: string;
  aiScore?: number;
  matchReasons?: string[];
  aiConfidence?: number;
  isAIGenerated?: boolean;
  order?: Order;
}

export interface Order {
  id: string;
  matchId: string;
  buyerId: string;
  sellerId: string;
  status:
    | "placed"
    | "accepted"
    | "preparing"
    | "transport_assigned"
    | "in_transit"
    | "delivered"
    | "completed"
    | "cancelled";
  statusHistory: Array<{ status: string; timestamp: string; note?: string }>;
  notes: string;
  riderName?: string; // Rider's name
  riderPhone?: string; // Rider's phone number
  createdAt: string;
  updatedAt: string;
}

export interface AIRecommendation {
  listingId: string;
  sellerId: string;
  sellerName: string;
  cropType: CropType;
  quantity: number;
  location: string;
  distance: number;
  score: number;
  reasons: string[];
}

export interface Notification {
  id: string;
  userId: string;
  type: "request" | "match" | "delivery" | "waitlist";
  title: string;
  message: string;
  read: boolean;
  data?: any;
  createdAt: string;
}

// `agroflow_token` was checked first but is never written anywhere — the real
// key is `agf_token`, which authService.saveSession sets.
function getToken(): string {
  return getStoredToken();
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

// ── API FETCH WITH TIMEOUT ──────────────────────────────────────────
async function apiFetch(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000); // 30 second max

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeout);

    // Every caller below swallows errors and returns an empty list, so an
    // expired token silently looked like "you have no data". Send the user
    // back to sign in instead.
    if (res.status === 401) {
      handleUnauthorized();
    }

    return res;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error("Something went wrong. Please try again.");
    }
    if (!navigator.onLine || err.message === "Failed to fetch") {
      throw new Error(
        "No internet connection. Please check your network and try again.",
      );
    }
    throw new Error("Something went wrong. Please try again.");
  }
}

// ── In-memory notification store (frontend only) ──────────────
let _notifications: Notification[] = [];

export const marketService = {
  // Keep for backwards compat — no-op now
  init() {},

  // ── LISTINGS ──────────────────────────────────────────────
  async getListings(userLocation?: string): Promise<Listing[]> {
    try {
      const params = new URLSearchParams();
      if (userLocation) params.set("userLocation", userLocation);

      const res = await apiFetch(`${BASE_URL}/listings?${params}`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return data.listings || [];
    } catch {
      return [];
    }
  },

  async getListingsBySeller(): Promise<Listing[]> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/my/listings`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return data.listings || [];
    } catch {
      return [];
    }
  },

  // ── POST LISTING WITH MULTIPLE PHOTOS ──────────────────────
  async postListing(data: {
    cropType: CropType;
    quantity: number;
    location: string;
    description: string;
    photos: File[];
  }): Promise<{ success: boolean; listing?: any; error?: string }> {
    try {
      const formData = new FormData();
      formData.append("cropType", data.cropType);
      formData.append("quantity", String(data.quantity));
      formData.append("location", data.location);
      formData.append("description", data.description);

      // Append each photo
      data.photos.forEach((file) => formData.append("photos", file));

      const res = await apiFetch(`${BASE_URL}/listings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${getToken()}`,
          // Don't set Content-Type - browser sets it with boundary for FormData
        },
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error };
      return { success: true, listing: json.listing };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // ── DELETE LISTING ──────────────────────────────────────────
  async deleteListing(
    listingId: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const token = getToken();
      if (!token) throw new Error("Not authenticated");

      const res = await apiFetch(`${BASE_URL}/listings/${listingId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete listing");

      return { success: true };
    } catch (error: any) {
      console.error("Delete listing error:", error);
      return { success: false, error: error.message };
    }
  },

  // ── AI RECOMMENDATIONS ──────────────────────────────────────
  async getAIRecommendations(): Promise<AIRecommendation[]> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/ai-recommendations`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return data.matches || [];
    } catch (error) {
      console.error("Get AI recommendations error:", error);
      return [];
    }
  },

  // ── DEMAND / WAITLIST ─────────────────────────────────────
  async postDemand(data: {
    cropType: CropType;
    quantity: number;
    location: string;
  }): Promise<{ matched: boolean; match?: Match; demand?: Demand }> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/demand`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(data),
      });
      const json = await res.json();
      return json;
    } catch {
      return { matched: false };
    }
  },

  async getWaitlist(): Promise<Demand[]> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/my/waitlist`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return data.demands || [];
    } catch {
      return [];
    }
  },

  // ── REQUESTS ─────────────────────────────────────────────
  async createRequest(
    listingId: string,
    quantity: number,
    message: string,
    buyerLocation: string,
  ): Promise<{ success: boolean; request?: any; error?: string }> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/${listingId}/request`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ quantity, message, buyerLocation }),
      });
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error };
      return { success: true, request: json.request };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async acceptRequest(
    requestId: string,
    buyerLocation: string = "Ijapo Estate",
  ): Promise<{ success: boolean; match?: Match; error?: string }> {
    try {
      const res = await apiFetch(
        `${BASE_URL}/listings/requests/${requestId}/accept`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify({ buyerLocation }),
        },
      );
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error };
      return { success: true, match: json.match };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async rejectRequest(requestId: string): Promise<void> {
    try {
      await apiFetch(`${BASE_URL}/listings/requests/${requestId}/decline`, {
        method: "PATCH",
        headers: authHeaders(),
      });
    } catch {}
  },

  // ── MATCHES (WITH AI SCORES) ──────────────────────────────
  async getMatches(): Promise<Match[]> {
    try {
      const res = await apiFetch(`${BASE_URL}/listings/my/matches`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      // Normalize backend match shape to frontend Match interface with AI fields
      return (data.matches || []).map((m: any) => ({
        id: m.id,
        listingId: m.listingId,
        demandId: m.demandId,
        requestId: m.requestId,
        cropType: m.cropType,
        buyerId: m.buyerId,
        buyerName: m.buyer?.user?.name || "",
        buyerEmail: m.buyer?.user?.email || "",
        buyerLoc: m.buyerLocation,
        sellerId: m.sellerId,
        sellerName: m.seller?.user?.name || "",
        sellerEmail: m.seller?.user?.email || "",
        sellerLoc: m.sellerLocation,
        quantity: m.quantity,
        distance: m.distance,
        status: m.status,
        matchedAt: m.createdAt,
        aiScore: m.aiScore || 0,
        matchReasons: m.matchReasons || [],
        aiConfidence: m.aiConfidence || 0,
        isAIGenerated: m.isAIGenerated || false,
        order: m.order || undefined,
      }));
    } catch {
      return [];
    }
  },

  // ── GET MATCHES WITH AI SCORES (sorted) ─────────────────────
  async getMatchesWithAIScores(): Promise<Match[]> {
    const matches = await this.getMatches();
    return matches.sort((a, b) => (b.aiScore || 0) - (a.aiScore || 0));
  },

  // ── ORDERS ──────────────────────────────────────────────────
  async getOrders(): Promise<Order[]> {
    try {
      const res = await apiFetch(`${BASE_URL}/orders`, {
        headers: authHeaders(),
      });
      const data = await res.json();
      return data.orders || [];
    } catch {
      return [];
    }
  },

  // ── UPDATE ORDER STATUS WITH RIDER INFO ──────────────────────
  async updateOrderStatus(
    orderId: string,
    status: string,
    note?: string,
    riderName?: string,
    riderPhone?: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await apiFetch(`${BASE_URL}/orders/${orderId}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status, note, riderName, riderPhone }),
      });
      const json = await res.json();
      if (!res.ok) return { success: false, error: json.error };
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  // ── REVIEWS ──────────────────────────────────────────────────
  async submitReview(orderId: string, rating: number, comment?: string) {
    try {
      const res = await apiFetch(`${BASE_URL}/reviews`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ orderId, rating, comment }),
      });
      const data = await res.json();
      return { success: res.ok, data, error: data.error };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  },

  async getSellerReviews(sellerId: string) {
    try {
      const res = await apiFetch(`${BASE_URL}/reviews/seller/${sellerId}`);
      const data = await res.json();
      return data;
    } catch {
      return { reviews: [], averageRating: 0, total: 0 };
    }
  },

  // ── NOTIFICATIONS (frontend in-memory) ───────────────────
  getNotifications(userId: string): Notification[] {
    return _notifications
      .filter((n) => n.userId === userId)
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  },

  addNotification(notif: Omit<Notification, "id" | "read" | "createdAt">) {
    _notifications.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      read: false,
      createdAt: new Date().toISOString(),
      ...notif,
    });
  },

  markNotifRead(notifId: string) {
    const n = _notifications.find((n) => n.id === notifId);
    if (n) n.read = true;
  },

  markAllRead(userId: string) {
    _notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
  },

  // Legacy sync methods — kept so existing UI code doesn't break
  getListingsSync(): Listing[] {
    return [];
  },
  getMatchesByUser(_id: string): Match[] {
    return [];
  },
  getWaitlistByUser(_id: string): Demand[] {
    return [];
  },
  getRequestsByBuyer(_id: string): Request[] {
    return [];
  },
  getListingsBySeller_sync(_: string): Listing[] {
    return [];
  },
};

export { apiFetch };
