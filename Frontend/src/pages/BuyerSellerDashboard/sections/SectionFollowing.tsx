import { useFavoritesStore } from '../../../store/favoritesStore'
import { RiUserUnfollowLine } from 'react-icons/ri'

interface Props {
  sellers: any[]
}

export function SectionFollowing({ sellers }: Props) {
  const { sellerIds, unfollowSeller } = useFavoritesStore()
  const following = sellers.filter(s => sellerIds.includes(s.id))

  if (following.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ead9f' }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>👨‍🌾</div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Not following anyone yet</div>
        <div style={{ fontSize: 13 }}>Follow sellers to get notified when they list new produce</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141f15', marginBottom: 16 }}>
        Following
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {following.map(seller => (
          <div key={seller.id} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            background: '#fff', border: '1.5px solid #eaeee8',
            borderRadius: 14, padding: '12px 16px',
          }}>
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: '#f2f9e4', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 16, color: '#2d6a35', flexShrink: 0,
            }}>
              {seller.user?.name?.charAt(0).toUpperCase() || 'S'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#141f15' }}>
                {seller.user?.name || 'Seller'}
              </div>
              <div style={{ fontSize: 12, color: '#9ead9f' }}>
                {seller.location || 'Nigeria'}
              </div>
            </div>
            <button
              onClick={() => unfollowSeller(seller.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '6px 12px', borderRadius: 8,
                border: '1.5px solid #eaeee8', background: '#f7f8f5',
                color: '#6b7f6e', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <RiUserUnfollowLine size={14} /> Unfollow
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}