import axios from 'axios'

// ---------------------------------------------------------------------------
// Axios Instance
// All requests go through here so we can centralise auth headers, base URL,
// and error handling in one place.
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 10_000,
})

// Attach JWT on every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Global response error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'

export const authAPI = {
  login:    (credentials) => api.post('/auth/login', credentials),
  register: (userData)    => api.post('/auth/register', userData),
  logout:   ()            => api.post('/auth/logout'),
  me:       ()            => api.get('/auth/me'),
  refresh:  ()            => api.post('/auth/refresh'),
  // OAuth – full-page redirects handled by the browser
  googleRedirect:   () => { window.location.href = `${BASE}/auth/google` },
  facebookRedirect: () => { window.location.href = `${BASE}/auth/facebook` },
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export const membersAPI = {
  getAll:    (params)       => api.get('/members', { params }),
  getById:   (id)           => api.get(`/members/${id}`),
  update:    (id, data)     => api.put(`/members/${id}`, data),
  delete:    (id)           => api.delete(`/members/${id}`),
  getStats:  (id)           => api.get(`/members/${id}/stats`),
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export const profileAPI = {
  get:           ()       => api.get('/profile'),
  update:        (data)   => api.put('/profile', data),
  updateAvatar:  (file)   => {
    const form = new FormData()
    form.append('avatar', file)
    return api.post('/profile/avatar', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
  changePassword: (data)  => api.post('/profile/password', data),
}

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
export const bookingsAPI = {
  getAll:        (params)  => api.get('/bookings', { params }),
  getMyBookings: ()        => api.get('/bookings/my'),
  getById:       (id)      => api.get(`/bookings/${id}`),
  create:        (data)    => api.post('/bookings', data),
  cancel:        (id)      => api.delete(`/bookings/${id}`),
  cancelGroup:   (groupId)              => api.delete(`/bookings/group/${groupId}`),
  extendGroup:   (groupId, extraMins)   => api.post(`/bookings/group/${groupId}/extend`, { extra_minutes: extraMins }),
  update:        (id, d)   => api.put(`/bookings/${id}`, d),
  getAvailable:  (date)    => api.get('/bookings/available', { params: { date } }),
}

// ---------------------------------------------------------------------------
// Courts
// ---------------------------------------------------------------------------
export const courtsAPI = {
  getAll:  ()   => api.get('/courts'),
  getById: (id) => api.get(`/courts/${id}`),
}

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------
export const tournamentsAPI = {
  getAll:   (params) => api.get('/tournaments', { params }),
  getById:  (id)     => api.get(`/tournaments/${id}`),
  register: (id)     => api.post(`/tournaments/${id}/register`),
  withdraw: (id)     => api.delete(`/tournaments/${id}/register`),
  getResults:(id)    => api.get(`/tournaments/${id}/results`),
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminAPI = {
  getDashboardStats: ()       => api.get('/admin/stats'),
  getAllMembers:      (params) => api.get('/admin/members', { params }),
  getAllBookings:     (params) => api.get('/admin/bookings', { params }),
  getAllTournaments:  (params) => api.get('/admin/tournaments', { params }),
  createTournament:  (data)   => api.post('/admin/tournaments', data),
  updateTournament:  (id, d)  => api.put(`/admin/tournaments/${id}`, d),
  deleteTournament:  (id)     => api.delete(`/admin/tournaments/${id}`),
  updateMemberRole:  (id, d)  => api.put(`/admin/members/${id}/role`, d),
  deleteMember:      (id)     => api.delete(`/admin/members/${id}`),
}

// ---------------------------------------------------------------------------
// Schedule / Announcements
// ---------------------------------------------------------------------------
export const scheduleAPI = {
  getUpcoming: () => api.get('/schedule/upcoming'),
  getAll:      () => api.get('/schedule'),
}

export const announcementsAPI = {
  getAll:   () => api.get('/announcements'),
  getLatest:() => api.get('/announcements?limit=3'),
}

export default api
