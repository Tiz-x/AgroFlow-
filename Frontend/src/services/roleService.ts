
import { authService } from './authService'
import { BASE_URL } from './apiConfig'

async function request(endpoint: string, options?: RequestInit) {
  const token = authService.getToken()
  if (!token) throw new Error('Not authenticated')
  
  const res = await fetch(`${BASE_URL}/role${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options?.headers
    }
  })
  
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || 'Request failed')
  }
  return res.json()
}

export const roleService = {
  async switchToFarmer(): Promise<{ success: boolean; role: string; user: any }> {
    return request('/switch-to-farmer', { method: 'POST' })
  },
  
  async switchToSeller(): Promise<{ success: boolean; role: string; user: any }> {
    return request('/switch-to-seller', { method: 'POST' })
  },
  
  async switchToBuyer(): Promise<{ success: boolean; role: string; user: any }> {
    return request('/switch-to-buyer', { method: 'POST' })
  },
  
  async getCurrentRole(): Promise<{ role: string; hasFarmer: boolean; hasSeller: boolean; hasBuyer: boolean }> {
    return request('/current-role')
  }
}