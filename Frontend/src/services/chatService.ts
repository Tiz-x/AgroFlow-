import { authService } from './authService'
import { BASE_URL } from './apiConfig'

export interface ChatMessage {
  id: string
  role: 'user' | 'ai'
  content: string
  createdAt: string
  isVoice?: boolean
  voiceText?: string
  language?: string
}

export interface ChatSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: ChatMessage[]
}

async function request(endpoint: string, options?: RequestInit) {
  const token = authService.getToken()
  if (!token) throw new Error('Not authenticated')
  
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000) // 15 second timeout

  try {
    const res = await fetch(`${BASE_URL}/chat${endpoint}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        ...options?.headers
      }
    })
    clearTimeout(timeout)
    
    if (!res.ok) {
      const error = await res.json()
      throw new Error(error.error || 'Something went wrong')
    }
    return res.json()
  } catch (error: any) {
    clearTimeout(timeout)
    
    // Handle timeout
    if (error.name === 'AbortError') {
      throw new Error('Something went wrong. Please try again.')
    }
    
    // Handle network errors
    if (!navigator.onLine || error.message === 'Failed to fetch' || error.message === 'NetworkError') {
      throw new Error('No internet connection. Please check your network and try again.')
    }
    
    // Handle authentication errors
    if (error.message === 'Not authenticated') {
      throw new Error('Your session has expired. Please log in again.')
    }
    
    // Re-throw if already user-friendly
    if (error.message && !error.message.includes('fetch')) {
      throw error
    }
    
    throw new Error('Something went wrong. Please try again.')
  }
}

export const chatService = {
  // Get all sessions
  async getSessions(): Promise<{ sessions: ChatSession[] }> {
    return request('/sessions')
  },
  
  // Create new session
  async createSession(title?: string): Promise<{ session: ChatSession }> {
    return request('/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: title || 'New Chat' })
    })
  },
  
  // Save message to session
  async saveMessage(
    sessionId: string,
    role: string,
    content: string,
    meta?: { isVoice?: boolean; voiceText?: string; language?: string }
  ): Promise<{ message: ChatMessage }> {
    return request(`/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        role,
        content,
        isVoice:   meta?.isVoice   ?? false,
        voiceText: meta?.voiceText ?? null,
        language:  meta?.language  ?? null,
      }),
    })
  },
  
  // Delete session
  async deleteSession(sessionId: string): Promise<{ message: string }> {
    return request(`/sessions/${sessionId}`, { method: 'DELETE' })
  }
}