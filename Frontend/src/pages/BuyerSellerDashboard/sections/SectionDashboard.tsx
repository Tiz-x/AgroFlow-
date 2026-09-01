
import { RiMoneyDollarCircleLine, RiStore3Line, RiTimeLine, RiCheckDoubleLine, RiLeafLine } from 'react-icons/ri'
import type { Listing } from '../../../services/marketService'

interface Props {
  listings:  Listing[]
  orders:    any[]
  requests:  any[]
  matches:   any[]
}

export function SectionDashboard({ listings, orders, requests, matches }: Props) {
  // ── Real calculations ──────────────────────────────────────
  const activeListings   = listings.filter(l => l.status === 'available').length
  const soldListings     = listings.filter(l => l.status === 'sold').length
  const pendingOrders    = orders.filter(o => o.status === 'placed').length
  const completedOrders  = orders.filter(o => o.status === 'completed').length
  const pendingRequests  = requests.filter(r => r.status === 'pending').length
  const totalMatches     = matches.length

  // Revenue — sum quantity * price from completed orders
  const revenue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum) => sum + 0, 0)

  const stats = [
    {
      label:   'Active Listings',
      value:   activeListings,
      icon:    <RiStore3Line size={20} />,
      color:   '#2d6a35',
      bg:      '#f2f9e4',
      sub:     `${soldListings} sold`,
    },
    {
      label:   'Pending Orders',
      value:   pendingOrders,
      icon:    <RiTimeLine size={20} />,
      color:   '#E07B1A',
      bg:      '#fff7ed',
      sub:     `${completedOrders} completed`,
    },
    {
      label:   'Total Matches',
      value:   totalMatches,
      icon:    <RiCheckDoubleLine size={20} />,
      color:   '#4A8C52',
      bg:      '#f0faf1',
      sub:     `${pendingRequests} requests pending`,
    },
    {
      label:   'Revenue',
      value:   revenue > 0 ? `₦${revenue.toLocaleString()}` : '₦0',
      icon:    <RiMoneyDollarCircleLine size={20} />,
      color:   '#2d6a35',
      bg:      '#f2f9e4',
      sub:     `from ${completedOrders} completed orders`,
    },
  ]

  // Recent activity
  const recentOrders = orders.slice(0, 3)

  const statusColor: Record<string, string> = {
    placed:             '#E07B1A',
    accepted:           '#4A8C52',
    preparing:          '#4A8C52',
    transport_assigned: '#4A8C52',
    in_transit:         '#2d6a35',
    delivered:          '#2d6a35',
    completed:          '#2d6a35',
    cancelled:          '#e05252',
  }

  return (
    <div style={{ padding: '16px 20px' }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#141f15', marginBottom: 4 }}>
        Dashboard
      </h2>
      <p style={{ fontSize: 13, color: '#9ead9f', marginBottom: 20 }}>
        Your store performance at a glance
      </p>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
        {stats.map(stat => (
          <div key={stat.label} style={{
            background: '#fff',
            border: '1.5px solid #eaeee8',
            borderRadius: 14,
            padding: 16,
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10,
              background: stat.bg, color: stat.color,
              display: 'flex', alignItems: 'center',
              justifyContent: 'center', marginBottom: 10,
            }}>
              {stat.icon}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#141f15', lineHeight: 1 }}>
              {stat.value}
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7f6e', marginTop: 4 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 11, color: '#c8d4c2', marginTop: 2 }}>
              {stat.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Recent orders */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141f15', marginBottom: 12 }}>
          Recent Orders
        </h3>
        {recentOrders.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#c8d4c2', fontSize: 13 }}>
            No orders yet — start listing your produce!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recentOrders.map(order => (
              <div key={order.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                background: '#fff', border: '1.5px solid #eaeee8',
                borderRadius: 12, padding: '12px 14px',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: '#f2f9e4', display: 'flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>
                  <RiLeafLine size={16} color="#2d6a35" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#141f15' }}>
                    {order.match?.cropType} — {order.match?.quantity}kg
                  </div>
                  <div style={{ fontSize: 11, color: '#9ead9f' }}>
                    {order.match?.buyer?.user?.name || 'Buyer'} · {new Date(order.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 100,
                  fontSize: 10, fontWeight: 600,
                  background: `${statusColor[order.status]}18`,
                  color: statusColor[order.status],
                }}>
                  {order.status.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top crops */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: '#141f15', marginBottom: 12 }}>
          Your Listings by Crop
        </h3>
        {listings.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: '#c8d4c2', fontSize: 13 }}>
            No listings yet
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['Maize','Cassava','Tomato','Pepper'].map(crop => {
              const count = listings.filter(l => l.cropType === crop).length
              const pct   = listings.length > 0 ? (count / listings.length) * 100 : 0
              if (count === 0) return null
              return (
                <div key={crop}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7f6e', marginBottom: 4 }}>
                    <span>{crop}</span>
                    <span>{count} listing{count > 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 3, background: '#eaeee8' }}>
                    <div style={{ height: 6, borderRadius: 3, background: '#a8d832', width: `${pct}%`, transition: 'width 0.4s ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}