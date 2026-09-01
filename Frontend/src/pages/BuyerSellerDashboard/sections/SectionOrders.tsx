import { useState } from 'react';
import { marketService } from '../../../services/marketService';
import { useToast } from '../../../context/ToastContext';
import { LoadingButton } from '../../../components/LoadingButton/LoadingButton';
import {
  RiCheckLine,
  RiCheckboxCircleLine,
  RiCloseCircleLine,
  RiTruckLine,
  RiStore3Line,
  RiHomeLine,
  RiLeafLine,
  RiShoppingBagLine,
  RiTimeLine,
  RiArrowRightLine,
  RiStarLine,
  RiStarFill,
  RiBox3Line,
  RiChat3Line,
} from 'react-icons/ri';
// import styles from '../BuyerSellerDashboard.module.css'

const STATUS_STEPS = ['placed','accepted','preparing','transport_assigned','in_transit','delivered','completed'];
const STATUS_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  placed: {
    label: 'Order Placed',
    icon: <RiShoppingBagLine size={14} />,
  },
  accepted: {
    label: 'Seller Accepted',
    icon: <RiCheckLine size={14} />,
  },
  preparing: {
    label: 'Preparing Produce',
    icon: <RiLeafLine size={14} />,
  },
  transport_assigned: {
    label: 'Transport Assigned',
    icon: <RiTruckLine size={14} />,
  },
  in_transit: {
    label: 'In Transit',
    icon: <RiTimeLine size={14} />,
  },
  delivered: {
    label: 'Delivered',
    icon: <RiHomeLine size={14} />,
  },
  completed: {
    label: 'Completed',
    icon: <RiCheckboxCircleLine size={14} />,
  },
  cancelled: {
    label: 'Cancelled',
    icon: <RiCloseCircleLine size={14} />,
  },
};

const SELLER_ACTIONS: Record<string, string> = {
  placed:             'accepted',
  accepted:           'preparing',
  preparing:          'transport_assigned',
  transport_assigned: 'in_transit',
  in_transit:         'delivered',
};

const BUYER_ACTIONS: Record<string, string> = {
  delivered: 'completed',
};

// statusHistory arrives from the API as an array, but rows written before the
// Json column was used correctly still come back as a JSON string. A bare
// JSON.parse in render meant one malformed row white-screened the dashboard.
function parseHistory(raw: unknown): Array<{ status: string; timestamp: string; note?: string }> {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Strip the formatting characters a person naturally types so "0801 234 5678"
// and "08012345678" are treated as the same number.
function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}

// Matches what the API accepts: 08012345678, 8012345678, +2348012345678
function isValidPhone(value: string): boolean {
  return /^\+?\d{10,15}$/.test(normalizePhone(value));
}

interface Props {
  orders:   any[];
  role:     'seller' | 'buyer';
  onUpdate: () => void;
}

export function SectionOrders({ orders, role, onUpdate }: Props) {
  const { addToast } = useToast();
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [reviewingOrder, setReviewingOrder] = useState<any>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // ── Rider Modal State ──────────────────────────────────────────────
  const [riderModalOrder, setRiderModalOrder] = useState<any>(null);
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [riderPhoneConfirm, setRiderPhoneConfirm] = useState('');
  const [riderSubmitting, setRiderSubmitting] = useState(false);

  // Compare normalized digits, not raw text — the two fields are the same
  // number typed twice, so "0801 234 5678" must match "08012345678" instead of
  // reporting a mismatch the seller cannot see.
  const riderPhoneMismatch =
    riderPhoneConfirm.trim() !== '' &&
    normalizePhone(riderPhone.trim()) !== normalizePhone(riderPhoneConfirm.trim());

  const advance = async (orderId: string, newStatus: string) => {
    // ── Intercept transport_assigned to show rider modal ──────────────
    if (newStatus === 'transport_assigned') {
      const order = orders.find(o => o.id === orderId);
      // Without this guard a stale list silently did nothing on click.
      if (!order) {
        addToast('That order is no longer available. Refreshing…', 'error');
        onUpdate();
        return;
      }
      setRiderModalOrder(order);
      return;
    }

    setProcessingId(orderId);
    try {
      const result = await marketService.updateOrderStatus(orderId, newStatus);
      if (result.success) {
        addToast(`Order updated to: ${STATUS_LABELS[newStatus]?.label || newStatus}`, 'success');
        onUpdate();
      } else {
        addToast(result.error || 'Failed to update order', 'error');
      }
    } catch (error) {
      console.error('Update order error:', error);
      addToast('Failed to update order. Please try again.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // ── Submit Rider Assignment ──────────────────────────────────────────
  const submitRiderAssignment = async () => {
    if (!riderModalOrder) return;

    const cleanName = riderName.trim();
    const cleanPhone = riderPhone.trim();
    const cleanConfirm = riderPhoneConfirm.trim();

    if (cleanName.length < 2) {
      addToast('Please enter the rider\'s full name', 'error');
      return;
    }
    if (!cleanPhone) {
      addToast('Please enter the rider\'s phone number', 'error');
      return;
    }
    // Catch a bad number here instead of round-tripping to the API — this
    // number is the buyer's only way to reach the rider.
    if (!isValidPhone(cleanPhone)) {
      addToast('Please enter a valid phone number, e.g. 08012345678', 'error');
      return;
    }
    if (normalizePhone(cleanPhone) !== normalizePhone(cleanConfirm)) {
      addToast('Phone numbers do not match. Please check and try again.', 'error');
      return;
    }

    setRiderSubmitting(true);
    try {
      const result = await marketService.updateOrderStatus(
        riderModalOrder.id,
        'transport_assigned',
        undefined,
        cleanName,
        // Send the normalized number so the stored value is what the buyer can
        // actually dial, regardless of how the seller spaced it out.
        normalizePhone(cleanPhone)
      );
      if (result.success) {
        addToast('Rider assigned successfully!', 'success');
        setRiderModalOrder(null);
        setRiderName('');
        setRiderPhone('');
        setRiderPhoneConfirm('');
        onUpdate();
      } else {
        addToast(result.error || 'Failed to assign rider', 'error');
      }
    } catch (error) {
      console.error('Assign rider error:', error);
      addToast('Failed to assign rider. Please try again.', 'error');
    } finally {
      setRiderSubmitting(false);
    }
  };

  const submitReview = async () => {
    if (!reviewingOrder) return;
    setSubmitting(true);
    try {
      const result = await marketService.submitReview(reviewingOrder.id, rating, comment);
      if (result.success) {
        addToast('Review submitted! Thank you.', 'success');
        setReviewingOrder(null);
        setRating(5);
        setComment('');
        onUpdate();
      } else {
        addToast(result.error || 'Failed to submit review', 'error');
      }
    } catch (error) {
      console.error('Submit review error:', error);
      addToast('Failed to submit review. Please try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (orders.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ead9f' }}>
        <div style={{ fontSize: 48, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <RiBox3Line size={48} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No orders yet</div>
        <div style={{ fontSize: 13 }}>
          {role === 'seller'
            ? 'Orders will appear here when buyers purchase your produce'
            : 'Orders will appear here once you buy produce from a seller'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141f15', marginBottom: 4 }}>
        {role === 'seller' ? 'Incoming Orders' : 'My Orders'}
      </h2>

      {orders.map(order => {
        const currentStep = STATUS_STEPS.indexOf(order.status);
        const history = parseHistory(order.statusHistory);

        // A farmer holds both a buyer and a seller profile, so the account-level
        // `role` prop is wrong for orders where they are the other party. The
        // API now says which side the viewer is on for each order.
        const viewerRole: 'seller' | 'buyer' = order.viewerRole === 'seller'
          ? 'seller'
          : order.viewerRole === 'buyer'
            ? 'buyer'
            : role;

        const nextStatus = viewerRole === 'seller'
          ? SELLER_ACTIONS[order.status]
          : BUYER_ACTIONS[order.status];

        // Buyer/seller are included at the order level, not inside `match`,
        // so the old `order.match?.seller?.user?.name` path always fell
        // through to the placeholder.
        const sellerName = order.seller?.user?.name || order.match?.seller?.user?.name || 'Seller';
        const buyerName = order.buyer?.user?.name || order.match?.buyer?.user?.name || 'Buyer';

        const statusInfo = STATUS_LABELS[order.status] || { label: order.status, icon: null };
        const isProcessing = processingId === order.id;

        return (
          <div key={order.id} style={{
            background: '#fff',
            border: '1.5px solid #eaeee8',
            borderRadius: 16,
            padding: 20,
            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
            opacity: isProcessing ? 0.7 : 1,
            transition: 'opacity 0.2s ease',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15, color: '#141f15' }}>
                  {order.match?.cropType} — {order.match?.quantity}kg
                </div>
                <div style={{ fontSize: 12, color: '#9ead9f', marginTop: 2 }}>
                  Order #{String(order.id || '').slice(-6).toUpperCase()}
                </div>
              </div>
              <span style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 12px',
                borderRadius: 100,
                fontSize: 11,
                fontWeight: 600,
                background: order.status === 'completed' ? '#e7f3d2' : order.status === 'cancelled' ? '#fef2f2' : '#f2f9e4',
                color: order.status === 'completed' ? '#2d6a35' : order.status === 'cancelled' ? '#e05252' : '#2d6a35',
              }}>
                {statusInfo.icon}
                {statusInfo.label}
              </span>
            </div>

            {/* Parties */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 12, color: '#6b7f6e' }}>
              <span><RiStore3Line size={12} style={{ verticalAlign: 'middle' }} /> {sellerName}</span>
              <RiArrowRightLine size={12} style={{ color: '#c8d4c2' }} />
              <span><RiShoppingBagLine size={12} style={{ verticalAlign: 'middle' }} /> {buyerName}</span>
              {order.match?.distance != null && (
                <span style={{ color: '#c8d4c2' }}>· {order.match.distance}km</span>
              )}
            </div>

            {/* ── RIDER INFO BLOCK ────────────────────────────────────────── */}
            {order.riderName && order.riderPhone && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: '#f2f9e4',
                border: '1px solid rgba(168,216,50,0.3)',
                borderRadius: 10,
                marginBottom: 16,
              }}>
                <RiTruckLine size={16} style={{ color: '#2d6a35', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e3d22' }}>
                    Rider: {order.riderName}
                  </div>
                  <div style={{ fontSize: 11, color: '#2d6a35' }}>{order.riderPhone}</div>
                </div>
                <a
                  href={`tel:${order.riderPhone}`}
                  style={{
                    padding: '6px 14px',
                    borderRadius: 100,
                    background: '#a8d832',
                    color: '#141f15',
                    fontSize: 12,
                    fontWeight: 700,
                    textDecoration: 'none',
                    flexShrink: 0,
                  }}
                >
                  Call
                </a>
              </div>
            )}

            {/* Progress bar */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {STATUS_STEPS.map((step, i) => (
                  <div key={step} style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    background: i <= currentStep ? '#a8d832' : '#eaeee8',
                  }} />
                ))}
              </div>
              <div style={{ fontSize: 11, color: '#9ead9f' }}>
                {currentStep >= 0
                  ? `Step ${currentStep + 1} of ${STATUS_STEPS.length}`
                  : statusInfo.label}
              </div>
            </div>

            {/* Status history */}
            <div style={{ marginBottom: 16 }}>
              {history.slice(-3).map((h: any, i: number) => {
                const hStatusInfo = STATUS_LABELS[h?.status] || { label: h?.status || 'Updated', icon: null };
                const stamp = h?.timestamp ? new Date(h.timestamp) : null;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#6b7f6e', marginBottom: 4 }}>
                    <span style={{ color: '#a8d832' }}><RiCheckLine size={12} /></span>
                    <span>{hStatusInfo.icon}</span>
                    <span>{hStatusInfo.label}</span>
                    <span style={{ color: '#c8d4c2', marginLeft: 'auto' }}>
                      {stamp && !isNaN(stamp.getTime()) ? stamp.toLocaleDateString() : ''}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Action button */}
            {nextStatus && order.status !== 'cancelled' && (
              <LoadingButton
                loading={isProcessing}
                onClick={() => advance(order.id, nextStatus)}
                disabled={isProcessing}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: 10,
                  background: '#a8d832',
                  color: '#141f15',
                  border: 'none',
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                Mark as: {STATUS_LABELS[nextStatus]?.icon} {STATUS_LABELS[nextStatus]?.label}
              </LoadingButton>
            )}

            {order.status === 'completed' && (
              <div>
                <div style={{ textAlign: 'center', color: '#2d6a35', fontWeight: 600, fontSize: 13 }}>
                  <RiCheckboxCircleLine size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Order completed successfully!
                </div>
                
                {/* Review Button - Only show for buyers if no review exists */}
                {viewerRole === 'buyer' && !order.review && (
                  <button
                    onClick={() => setReviewingOrder(order)}
                    style={{
                      marginTop: 8,
                      width: '100%',
                      padding: 10,
                      borderRadius: 10,
                      border: '1.5px solid #a8d832',
                      background: 'transparent',
                      color: '#2d6a35',
                      fontWeight: 600,
                      fontSize: 13,
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f2f9e4';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    <RiStarLine size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                    Leave a Review
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── Rider Assignment Modal ────────────────────────────────────── */}
      {riderModalOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{ background: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 420 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RiTruckLine size={20} />
              Assign Rider
            </h3>
            <p style={{ fontSize: 12, color: '#9ead9f', marginBottom: 16 }}>
              Enter the rider's details. The buyer will see this to coordinate delivery.
            </p>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3a4f3d', display: 'block', marginBottom: 6 }}>
                Rider's Full Name
              </label>
              <input
                type="text"
                value={riderName}
                onChange={e => setRiderName(e.target.value)}
                placeholder="e.g. John Adebayo"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #eaeee8',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3a4f3d', display: 'block', marginBottom: 6 }}>
                Rider's Phone Number
              </label>
              <input
                type="tel"
                value={riderPhone}
                onChange={e => setRiderPhone(e.target.value)}
                placeholder="08012345678"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1.5px solid #eaeee8',
                  fontSize: 14,
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#3a4f3d', display: 'block', marginBottom: 6 }}>
                Confirm Phone Number
              </label>
              <input
                type="tel"
                value={riderPhoneConfirm}
                onChange={e => setRiderPhoneConfirm(e.target.value)}
                placeholder="Re-enter the phone number"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${riderPhoneMismatch ? '#e05252' : '#eaeee8'}`,
                  fontSize: 14,
                  boxSizing: 'border-box',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              {riderPhoneMismatch && (
                <div style={{ fontSize: 11, color: '#e05252', marginTop: 4, fontWeight: 600 }}>
                  Phone numbers do not match
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                disabled={riderSubmitting}
                onClick={() => {
                  setRiderModalOrder(null);
                  setRiderName('');
                  setRiderPhone('');
                  setRiderPhoneConfirm('');
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: '1.5px solid #eaeee8',
                  background: '#f7f8f5',
                  color: '#6b7f6e',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <LoadingButton
                loading={riderSubmitting}
                onClick={submitRiderAssignment}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#a8d832',
                  color: '#141f15',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm & Assign
              </LoadingButton>
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ────────────────────────────────────────────── */}
      {reviewingOrder && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}>
          <div style={{
            background: '#fff',
            borderRadius: 20,
            padding: 24,
            width: '100%',
            maxWidth: 400,
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <RiChat3Line size={20} />
              Rate your experience
            </h3>

            {/* Star rating */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, justifyContent: 'center' }}>
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  style={{
                    fontSize: 32,
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    opacity: star <= rating ? 1 : 0.3,
                    transition: 'transform 0.2s ease',
                    color: '#f59e0b',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.2)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)';
                  }}
                >
                  {star <= rating ? <RiStarFill size={32} /> : <RiStarLine size={32} />}
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Share your experience (optional)..."
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 10,
                border: '1.5px solid #eaeee8',
                fontSize: 13,
                resize: 'none',
                height: 80,
                boxSizing: 'border-box',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                disabled={submitting}
                onClick={() => {
                  setReviewingOrder(null);
                  setRating(5);
                  setComment('');
                }}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: '1.5px solid #eaeee8',
                  background: '#f7f8f5',
                  color: '#6b7f6e',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <LoadingButton
                loading={submitting}
                onClick={submitReview}
                style={{
                  flex: 1,
                  padding: 12,
                  borderRadius: 10,
                  border: 'none',
                  background: '#a8d832',
                  color: '#141f15',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Submit Review
              </LoadingButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}