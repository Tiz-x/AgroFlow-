import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface FavoritesStore {
  listingIds:    string[]
  sellerIds:     string[]
  addListing:    (id: string) => void
  removeListing: (id: string) => void
  toggleListing: (id: string) => void
  isLiked:       (id: string) => boolean
  followSeller:   (id: string) => void
  unfollowSeller: (id: string) => void
  isFollowing:    (id: string) => boolean
}

export const useFavoritesStore = create<FavoritesStore>()(
  persist(
    (set, get) => ({
      listingIds: [],
      sellerIds:  [],

      addListing:    (id) => set({ listingIds: [...get().listingIds, id] }),
      removeListing: (id) => set({ listingIds: get().listingIds.filter(i => i !== id) }),
      toggleListing: (id) => {
        get().isLiked(id) ? get().removeListing(id) : get().addListing(id)
      },
      isLiked: (id) => get().listingIds.includes(id),

      followSeller:   (id) => set({ sellerIds: [...get().sellerIds, id] }),
      unfollowSeller: (id) => set({ sellerIds: get().sellerIds.filter(i => i !== id) }),
      isFollowing:    (id) => get().sellerIds.includes(id),
    }),
    { name: 'agroflow-favorites' }
  )
)