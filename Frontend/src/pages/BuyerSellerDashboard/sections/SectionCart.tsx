import { useState } from 'react';
import { useCartStore } from '../../../store/cartStore';
import { marketService } from '../../../services/marketService';
import { useToast } from '../../../context/ToastContext';
import { LoadingButton } from '../../../components/LoadingButton/LoadingButton';
import { 
  RiShoppingCartLine, 
  RiCloseLine, 
  RiSubtractLine, 
  RiAddLine,
  RiErrorWarningLine,
  RiLeafLine
} from 'react-icons/ri';

interface Props {
  onOrderPlaced: () => void;
}

export function SectionCart({ onOrderPlaced }: Props) {
  const { items, removeItem, updateQty, clearCart } = useCartStore();
  const { addToast } = useToast();
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const totalQuantity = items.reduce((s, i) => s + i.quantity, 0);

  const handleCheckout = async () => {
    if (items.length === 0) {
      addToast('Your cart is empty', 'error');
      return;
    }

    // ── VALIDATE REMAINING QUANTITY BEFORE CHECKOUT ──────────────────
    for (const item of items) {
      if (item.quantity > item.listing.remainingQty) {
        addToast(
          `Only ${item.listing.remainingQty}kg available for ${item.listing.cropType}. Please reduce your quantity.`,
          'error'
        );
        return;
      }
    }

    setIsCheckingOut(true);
    try {
      // Submit each item as a request
      const results = await Promise.all(
        items.map(async (item) => {
          const result = await marketService.createRequest(
            item.listing.id,
            item.quantity,
            `Order from cart: ${item.quantity}kg of ${item.listing.cropType}`,
            item.listing.location
          );
          return result;
        })
      );

      const failed = results.filter((r) => !r.success);
      if (failed.length > 0) {
        console.error('Failed order results:', failed);
        addToast(failed[0].error || `${failed.length} items failed to order`, 'error');
      } else {
        addToast('All orders placed successfully!', 'success');
        clearCart();
        onOrderPlaced();
      }
    } catch (error) {
      console.error('Checkout error:', error);
      addToast('Failed to place orders. Please try again.', 'error');
    } finally {
      setIsCheckingOut(false);
    }
  };

  if (items.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ead9f' }}>
        <div style={{ fontSize: 48, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <RiShoppingCartLine size={48} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Your cart is empty</div>
        <div style={{ fontSize: 13 }}>Browse the marketplace and add items you want to buy</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141f15' }}>Your Cart</h2>
        <button
          onClick={clearCart}
          disabled={isCheckingOut}
          style={{
            fontSize: 12,
            color: '#e05252',
            background: 'none',
            border: 'none',
            cursor: isCheckingOut ? 'not-allowed' : 'pointer',
            fontWeight: 600,
            opacity: isCheckingOut ? 0.5 : 1,
          }}
        >
          Clear All
        </button>
      </div>

      {items.map((item) => {
        // Check if quantity exceeds available
        const exceedsAvailable = item.quantity > item.listing.remainingQty;
        
        return (
          <div
            key={item.listing.id}
            style={{
              background: '#fff',
              border: exceedsAvailable ? '2px solid #e05252' : '1.5px solid #eaeee8',
              borderRadius: 16,
              padding: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: isCheckingOut ? 0.7 : 1,
              position: 'relative',
            }}
          >
            {/* Warning indicator if quantity exceeds available */}
            {exceedsAvailable && (
              <div
                style={{
                  position: 'absolute',
                  top: -8,
                  right: 12,
                  background: '#e05252',
                  color: '#fff',
                  fontSize: 9,
                  fontWeight: 700,
                  padding: '2px 10px',
                  borderRadius: 100,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <RiErrorWarningLine size={10} />
                Only {item.listing.remainingQty}kg left
              </div>
            )}

            {/* Photo */}
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 10,
                background: '#f2f9e4',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                flexShrink: 0,
              }}
            >
              {item.listing.photoUrls && item.listing.photoUrls.length > 0 ? (
  <img
    src={item.listing.photoUrls[0]}
    alt={item.listing.cropType}
    style={{ width: 60, height: 60, borderRadius: 10, objectFit: 'cover' }}
  />
) : (
  <RiLeafLine size={28} color="#2d6a35" />
)}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#141f15' }}>
                {item.listing.cropType}
                {exceedsAvailable && (
                  <span style={{ 
                    marginLeft: 6, 
                    fontSize: 11, 
                    color: '#e05252',
                    fontWeight: 600 
                  }}>
                    (Adjust quantity)
                  </span>
                )}
              </div>
              <div style={{ fontSize: 12, color: '#9ead9f' }}>
                {item.listing.location}
              </div>
              <div style={{ fontSize: 12, color: '#9ead9f', marginTop: 2 }}>
                Seller: {item.listing.sellerName}
              </div>
              <div style={{ fontSize: 11, color: '#6b7f6e', marginTop: 2 }}>
                Available: {item.listing.remainingQty}kg
              </div>
            </div>

            {/* Quantity controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => updateQty(item.listing.id, item.quantity - 1)}
                disabled={isCheckingOut || item.quantity <= 1}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: '1.5px solid #eaeee8',
                  background: 'transparent',
                  cursor: (isCheckingOut || item.quantity <= 1) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  opacity: (isCheckingOut || item.quantity <= 1) ? 0.5 : 1,
                }}
              >
                <RiSubtractLine size={14} />
              </button>
              <span 
                style={{ 
                  fontWeight: 600, 
                  fontSize: 14, 
                  minWidth: 24, 
                  textAlign: 'center',
                  color: exceedsAvailable ? '#e05252' : '#141f15',
                }}
              >
                {item.quantity}
              </span>
              <button
                onClick={() => updateQty(item.listing.id, item.quantity + 1)}
                disabled={isCheckingOut || item.quantity >= item.listing.remainingQty}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  border: '1.5px solid #eaeee8',
                  background: 'transparent',
                  cursor: (isCheckingOut || item.quantity >= item.listing.remainingQty) ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 14,
                  opacity: (isCheckingOut || item.quantity >= item.listing.remainingQty) ? 0.5 : 1,
                }}
              >
                <RiAddLine size={14} />
              </button>
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeItem(item.listing.id)}
              disabled={isCheckingOut}
              style={{
                background: 'none',
                border: 'none',
                color: '#9ead9f',
                cursor: isCheckingOut ? 'not-allowed' : 'pointer',
                fontSize: 18,
                padding: 4,
                opacity: isCheckingOut ? 0.5 : 1,
              }}
            >
              <RiCloseLine size={18} />
            </button>
          </div>
        );
      })}

      {/* Summary */}
      <div
        style={{
          background: '#f7f8f5',
          borderRadius: 16,
          padding: 16,
          marginTop: 8,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#6b7f6e' }}>
          <span>Total quantity</span>
          <span>{totalQuantity}kg</span>
        </div>
      </div>

      {/* Checkout button */}
      <LoadingButton
        loading={isCheckingOut}
        className="w-full"
        onClick={handleCheckout}
        style={{
          padding: '14px',
          borderRadius: 12,
          background: '#a8d832',
          color: '#141f15',
          border: 'none',
          fontWeight: 700,
          fontSize: 16,
          cursor: isCheckingOut ? 'not-allowed' : 'pointer',
          marginTop: 8,
          width: '100%',
        }}
      >
        Place Order ({items.length} items)
      </LoadingButton>
    </div>
  );
}