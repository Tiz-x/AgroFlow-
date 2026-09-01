import { useFavoritesStore } from '../../../store/favoritesStore'
import { ListingCard } from '../components/ListingCard'
import { RiHeartLine } from 'react-icons/ri'
import type { Listing } from '../../../services/marketService'

interface Props {
  listings:       Listing[]
  onRequestToBuy: (l: Listing) => void
  onListingClick?: (l: Listing) => void
}

export function SectionFavorites({ listings, onRequestToBuy, onListingClick }: Props) {
  const { listingIds } = useFavoritesStore()
  const favorites = listings.filter(l => listingIds.includes(l.id))

  if (favorites.length === 0) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#9ead9f' }}>
        <div style={{ fontSize: 48, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
          <RiHeartLine size={48} />
        </div>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>No favorites yet</div>
        <div style={{ fontSize: 13 }}>
          Tap the heart icon on any listing to save it here
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141f15', marginBottom: 4 }}>
        Saved Listings
      </h2>
      <p style={{ fontSize: 13, color: '#9ead9f', marginBottom: 16 }}>
        {favorites.length} saved item{favorites.length > 1 ? 's' : ''}
      </p>
      <div className="marketplaceGrid">
        {favorites.map(listing => (
          <ListingCard
            key={listing.id}
            listing={listing}
            intent="buy"
            onRequestToBuy={onRequestToBuy}
            onClick={onListingClick}
          />
        ))}
      </div>
    </div>
  )
}