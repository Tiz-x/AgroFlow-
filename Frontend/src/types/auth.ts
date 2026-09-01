export type UserRole = 'farmer' | 'buyer' | 'seller'

export interface RegisterPayload {
  fullName: string
  email:    string
  phone:    string
  password: string
  role:     'farmer' | 'buyer' | 'seller'
  location?: string 
  intent?:  'buy' | 'sell'
}

export interface LoginPayload {
  identifier: string
  password:   string
}

export interface AuthResponse {
  token: string
  user: {
    id:       string
    name:     string
    email:    string
    role:     UserRole
    location?: string  
    phone?:   string
  }
}

export interface ApiError {
  message: string
  field?:  string
}