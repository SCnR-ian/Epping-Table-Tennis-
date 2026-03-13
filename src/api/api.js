import axios from "axios";

// ---------------------------------------------------------------------------
// Axios Instance
// All requests go through here so we can centralise auth headers, base URL,
// and error handling in one place.
// ---------------------------------------------------------------------------
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000/api",
  headers: { "Content-Type": "application/json" },
  timeout: 10_000,
});

// Attach JWT on every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Global response error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000/api";

export const authAPI = {
  login: (credentials) => api.post("/auth/login", credentials),
  register: (userData) => api.post("/auth/register", userData),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  // OAuth – full-page redirects handled by the browser
  googleRedirect: () => {
    window.location.href = `${BASE}/auth/google`;
  },
};

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------
export const membersAPI = {
  getById: (id) => api.get(`/members/${id}`),
  getStats: (id) => api.get(`/members/${id}/stats`),
};

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
export const profileAPI = {
  get: () => api.get("/profile"),
  update: (data) => api.put("/profile", data),
  changePassword: (data) => api.post("/profile/password", data),
};

// ---------------------------------------------------------------------------
// Bookings
// ---------------------------------------------------------------------------
export const bookingsAPI = {
  getMyBookings: () => api.get("/bookings/my"),
  getById: (id) => api.get(`/bookings/${id}`),
  create: (data) => api.post("/bookings", data),
  cancel: (id) => api.delete(`/bookings/${id}`),
  cancelGroup: (groupId) => api.delete(`/bookings/group/${groupId}`),
  extendGroup: (groupId, extraMins) =>
    api.post(`/bookings/group/${groupId}/extend`, { extra_minutes: extraMins }),
  getAvailable: (date) => api.get("/bookings/available", { params: { date } }),
};

// ---------------------------------------------------------------------------
// Courts
// ---------------------------------------------------------------------------
export const courtsAPI = {
  getAll: () => api.get("/courts"),
  getById: (id) => api.get(`/courts/${id}`),
};

// ---------------------------------------------------------------------------
// Tournaments
// ---------------------------------------------------------------------------
export const tournamentsAPI = {
  getAll: (params) => api.get("/tournaments", { params }),
  getById: (id) => api.get(`/tournaments/${id}`),
  register: (id) => api.post(`/tournaments/${id}/register`),
  withdraw: (id) => api.delete(`/tournaments/${id}/register`),
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------
export const adminAPI = {
  getDashboardStats: () => api.get("/admin/stats"),
  getAllMembers: (params) => api.get("/admin/members", { params }),
  getAllBookings: (params) => api.get("/admin/bookings", { params }),
  createTournament: (data) => api.post("/admin/tournaments", data),
  updateTournament: (id, d) => api.put(`/admin/tournaments/${id}`, d),
  deleteTournament: (id) => api.delete(`/admin/tournaments/${id}`),
  updateMemberRole: (id, d) => api.put(`/admin/members/${id}/role`, d),
  deleteMember: (id) => api.delete(`/admin/members/${id}`),
  makeCoach: (id, formData) => api.post(`/admin/members/${id}/make-coach`, formData),
  getCoachResume: (coachId) => `${api.defaults.baseURL}/admin/coaches/${coachId}/resume`,
};

// ---------------------------------------------------------------------------
// Coaching
// ---------------------------------------------------------------------------
export const coachingAPI = {
  // Coach management (admin)
  getCoaches:       ()       => api.get('/coaching/coaches'),
  createCoach:      (data)   => api.post('/coaching/coaches', data),
  deleteCoach:      (id)     => api.delete(`/coaching/coaches/${id}`),
  // Session management (admin)
  getSessions:      (params) => api.get('/coaching/sessions', { params }),
  createSession:    (data)   => api.post('/coaching/sessions', data),
  cancelSession:    (id)     => api.delete(`/coaching/sessions/${id}`),
  cancelRecurrence: (recId)  => api.delete(`/coaching/sessions/recurrence/${recId}`),
  // Student-facing
  getMySessions:       ()       => api.get('/coaching/my'),
  getMyPackage:        ()       => api.get('/coaching/my-package'),
  // Coach-facing
  getMyCoachSessions:  ()       => api.get('/coaching/my-coach-sessions'),
  // Admin pay period report
  getPaymentReport: (from, to) => api.get('/coaching/payment-report', { params: { from, to } }),
  // Package management (admin)
  assignPackage:    (data)     => api.post('/coaching/packages', data),
  getMemberPackage: (userId)   => api.get(`/coaching/packages/${userId}`),
  deletePackage:    (id)       => api.delete(`/coaching/packages/${id}`),
}

// ---------------------------------------------------------------------------
// Social Play
// ---------------------------------------------------------------------------
export const socialAPI = {
  getSessions:      ()         => api.get('/social'),
  getAdminSessions: (params)   => api.get('/social/admin', { params }),
  createSession:    (data)     => api.post('/social', data),
  updateSession:    (id, data) => api.patch(`/social/${id}`, data),
  cancelSession:    (id)       => api.delete(`/social/${id}`),
  join:             (id)       => api.post(`/social/${id}/join`),
  leave:            (id)       => api.delete(`/social/${id}/join`),
}

// ---------------------------------------------------------------------------
// Check-In
// ---------------------------------------------------------------------------
export const checkinAPI = {
  // Member self-check-in
  checkInBooking:  (groupId)   => api.post(`/checkin/booking/${groupId}`),
  checkInSocial:   (sessionId) => api.post(`/checkin/social/${sessionId}`),
  checkInCoaching: (sessionId) => api.post(`/checkin/coaching/${sessionId}`),
  // Member: today's check-in statuses
  getToday: () => api.get('/checkin/today'),
  // Admin: all check-ins for a date, and admin-initiated check-in (pass user_id in body)
  getByDate:          (date)              => api.get('/checkin/admin', { params: { date } }),
  adminCheckInBooking:  (groupId, userId) => api.post(`/checkin/booking/${groupId}`, { user_id: userId }),
  adminCheckInCoaching: (sessionId, userId) => api.post(`/checkin/coaching/${sessionId}`, { user_id: userId }),
  adminCheckInSocial:   (sessionId, userId) => api.post(`/checkin/social/${sessionId}`, { user_id: userId }),
}

// ---------------------------------------------------------------------------
// Schedule / Announcements
// ---------------------------------------------------------------------------
export const scheduleAPI = {
  getAll: () => api.get("/schedule"),
};

export const announcementsAPI = {
  getAll: () => api.get("/announcements"),
  getLatest: () => api.get("/announcements?limit=3"),
};

export default api;
