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
// Also strip Content-Type for FormData so the browser sets it (with boundary)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type'];
  }
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
  getAllMembers:  (params) => api.get("/admin/members", { params }),
  createMember:  (data)   => api.post("/admin/members", data),
  getAllBookings: (params) => api.get("/admin/bookings", { params }),
  createTournament: (data) => api.post("/admin/tournaments", data),
  updateTournament: (id, d) => api.put(`/admin/tournaments/${id}`, d),
  deleteTournament: (id) => api.delete(`/admin/tournaments/${id}`),
  updateMemberRole: (id, d) => api.put(`/admin/members/${id}/role`, d),
  updateMember: (id, d) => api.patch(`/admin/members/${id}`, d),
  deleteMember: (id) => api.delete(`/admin/members/${id}`),
  makeCoach: (id, formData) => api.post(`/admin/members/${id}/make-coach`, formData),
  getCoachResume: (coachId) => `${api.defaults.baseURL}/admin/coaches/${coachId}/resume`,
  getMemberActivities: (id) => api.get(`/admin/members/${id}/activities`),
};

// ---------------------------------------------------------------------------
// Coaching
// ---------------------------------------------------------------------------
export const coachingAPI = {
  // Coach management (admin)
  getCoaches:       ()       => api.get('/coaching/coaches'),
  createCoach:      (data)   => api.post('/coaching/coaches', data),
  deleteCoach:      (id)     => api.delete(`/coaching/coaches/${id}`),
  deleteCoachByUserId: (uid) => api.delete(`/coaching/coaches/by-user/${uid}`),
  // Session management (admin)
  getSessions:      (params) => api.get('/coaching/sessions', { params }),
  createSession:    (data)   => api.post('/coaching/sessions', data),
  cancelSession:    (id)     => api.delete(`/coaching/sessions/${id}`),
  recordLeave:      (id)     => api.post(`/coaching/sessions/${id}/leave`),
  cancelRecurrence: (recId)  => api.delete(`/coaching/sessions/recurrence/${recId}`),
  // Student-facing
  getMySessions:       ()         => api.get('/coaching/my'),
  // Coach-facing
  getMyCoachSessions:  ()         => api.get('/coaching/my-coach-sessions'),
  // Admin pay period report
  getPaymentReport:    (from, to) => api.get('/coaching/payment-report', { params: { from, to } }),
  // Reschedule a single session to a new date (admin)
  rescheduleSession:   (id, date, start_time, end_time) => api.put(`/coaching/sessions/${id}/reschedule`, { date, ...(start_time && end_time ? { start_time, end_time } : {}) }),
  rescheduleBulk:      (updates)    => api.put('/coaching/sessions/reschedule-bulk', { updates }),
  // Group coaching (admin)
  createGroupSession:  (data)       => api.post('/coaching/sessions/group', data),
  getGroupSessions:    (params)     => api.get('/coaching/sessions/groups', { params }),
  cancelGroupSession:       (groupId)                           => api.delete(`/coaching/sessions/group/${groupId}`),
  addStudentToGroup:        (groupId, student_id, from_date)    => api.post(`/coaching/sessions/group/${groupId}/add-student`, { student_id, from_date }),
  removeStudentFromGroup:   (groupId, studentId, from_date)     => api.delete(`/coaching/sessions/group/${groupId}/remove-student/${studentId}`, { params: from_date ? { from_date } : {} }),
  rescheduleGroupSession:   (groupId, date, start_time, end_time) =>
    api.put(`/coaching/sessions/group/${groupId}/reschedule`, { date, ...(start_time && end_time ? { start_time, end_time } : {}) }),
  // Coaching balance
  getHoursBalance: (userId)       => api.get(`/coaching/hours/${userId}`),
  addHours:        (userId, data) => api.post(`/coaching/hours/${userId}`, data),
  // Session prices
  getPrices:       ()             => api.get('/coaching/prices'),
  updatePrices:    (data)         => api.put('/coaching/prices', data),
  // Coach reviews & student ratings
  getSessionReview: (sessionId) => api.get(`/coaching/reviews/session/${sessionId}`),
  submitReview:     (data)      => api.post('/coaching/reviews', data),
  updateReview:     (id, data)  => api.put(`/coaching/reviews/${id}`, data),
  getMyReviews:     ()          => api.get('/coaching/reviews/my'),
  submitStudentRating: (data)   => api.post('/coaching/reviews/student', data),
  getRecentReviews:    ()        => api.get('/coaching/reviews/recent'),
  getMyHistory:        ()          => api.get('/coaching/my-history'),
  getStudentPrices:    (userId)    => api.get(`/coaching/student-prices/${userId}`),
  updateStudentPrices: (userId, data) => api.put(`/coaching/student-prices/${userId}`, data),
  // Leave requests
  createLeaveRequest:  (data)     => api.post('/coaching/leave-requests', data),
  approveLeaveRequest: (id)       => api.post(`/coaching/leave-requests/${id}/approve`),
  rejectLeaveRequest:  (id)       => api.post(`/coaching/leave-requests/${id}/reject`),
  selectLeaveSlot:     (id, slot) => api.post(`/coaching/leave-requests/${id}/select-slot`, slot),
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
  adminAddMember:         (id, userId)       => api.post(`/social/${id}/participants`, { user_id: userId }),
  adminRemoveMember:      (id, userId)       => api.delete(`/social/${id}/participants/${userId}`),
  adminAddWalkin:         (id)               => api.post(`/social/${id}/walkin`),
  cancelRecurringSessions:(recurrenceId)     => api.delete(`/social/recurrence/${recurrenceId}`),
}

// ---------------------------------------------------------------------------
// Check-In
// ---------------------------------------------------------------------------
export const checkinAPI = {
  // Member self-check-in (booking and social only — coaching is admin-only)
  checkInBooking:  (groupId)   => api.post(`/checkin/booking/${groupId}`),
  checkInSocial:   (sessionId) => api.post(`/checkin/social/${sessionId}`),
  // Member: today's check-in statuses
  getToday: () => api.get('/checkin/today'),
  // Admin: all check-ins for a date, and admin-initiated check-in (pass user_id in body)
  getByDate:          (date)              => api.get('/checkin/admin', { params: { date } }),
  adminCheckInBooking:  (groupId, userId) => api.post(`/checkin/booking/${groupId}`, { user_id: userId }),
  adminCheckInCoaching: (sessionId, userId) => api.post(`/checkin/coaching/${sessionId}`, { user_id: userId }),
  adminNoShowCoaching:  (sessionId)         => api.post(`/checkin/coaching/${sessionId}/no-show`),
  adminCheckInSocial:   (sessionId, userId) => api.post(`/checkin/social/${sessionId}`, { user_id: userId }),
  getTodaySummary:      (params)             => api.get('/checkin/today-summary', { params }),
  cancelCheckIn:        (type, refId, userId) => api.delete(`/checkin/${type}/${refId}/${userId}`),
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

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
export const analyticsAPI = {
  getOverview: () => api.get('/analytics/overview'),
}

// ---------------------------------------------------------------------------
// Homepage Cards
// ---------------------------------------------------------------------------
export const homepageAPI = {
  getStats:      ()           => api.get('/homepage/stats'),
  getCards:      ()           => api.get('/homepage/cards'),
  getImageUrl:   (id)         => `${api.defaults.baseURL}/homepage/cards/${id}/image`,
  uploadImage:   (id, formData) => api.post(`/homepage/admin/cards/${id}/image`, formData, { headers: { 'Content-Type': undefined } }),
  deleteImage:   (id)         => api.delete(`/homepage/admin/cards/${id}/image`),
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Pages CMS
// ---------------------------------------------------------------------------
export const pagesAPI = {
  getContent:    ()              => api.get('/pages/content'),
  updateContent: (id, content)   => api.put(`/pages/content/${id}`, { content }),
  getImageUrl:   (id)            => `${api.defaults.baseURL}/pages/images/${id}`,
  getImageIds:   (prefix)        => api.get('/pages/image-ids', { params: prefix ? { prefix } : {} }),
  uploadImage:   (id, formData)  => api.post(`/pages/images/${id}`, formData, { headers: { 'Content-Type': undefined } }),
  deleteImage:   (id)            => api.delete(`/pages/images/${id}`),
}

// ---------------------------------------------------------------------------
// Payments
// ---------------------------------------------------------------------------
export const paymentsAPI = {
  getConfig:      ()     => api.get('/payments/config'),
  createIntent:   (data) => api.post('/payments/create-intent', data),
  confirm:        (paymentIntentId) => api.post('/payments/confirm', { paymentIntentId }),
  shopIntent:     (items) => api.post('/payments/shop-intent', { items }),
}

export const messagesAPI = {
  getUnreadCount: ()             => api.get('/messages/unread-count'),
  getInbox:       ()             => api.get('/messages/inbox'),
  getAdmins:      ()             => api.get('/messages/admins'),
  getThread:      (userId)       => api.get(`/messages/thread/${userId}`),
  send:           (data)         => api.post('/messages', data),
  markRead:       (id)           => api.post(`/messages/${id}/read`),
  deleteThread:   (userId)       => api.delete(`/messages/thread/${userId}`),
  editMessage:    (id, body)     => api.put(`/messages/${id}`, { body }),
  deleteMessage:  (id)           => api.delete(`/messages/${id}`),
  reactMessage:   (id, emoji)    => api.post(`/messages/${id}/react`, { emoji }),
}

// ---------------------------------------------------------------------------
// Shop
// ---------------------------------------------------------------------------
export const shopAPI = {
  getProducts:      (category) => api.get('/shop/products', { params: category ? { category } : {} }),
  getProduct:       (id)       => api.get(`/shop/products/${id}`),
  getAdminProducts: ()         => api.get('/shop/products/admin'),
  createProduct:    (data)     => api.post('/shop/products', data),
  updateProduct:    (id, data) => api.patch(`/shop/products/${id}`, data),
  deleteProduct:    (id)       => api.delete(`/shop/products/${id}`),
  uploadImage:      (id, formData) => api.post(`/shop/products/${id}/images`, formData, { headers: { 'Content-Type': undefined } }),
  deleteImage:      (productId, imageId) => api.delete(`/shop/products/${productId}/images/${imageId}`),
  imageUrl:         (filename) => `${api.defaults.baseURL}/shop/images/${filename}`,
}

// ---------------------------------------------------------------------------
// Venue check-in / check-out
// ---------------------------------------------------------------------------
export const venueAPI = {
  getStatus:    ()        => api.get('/venue/status'),
  checkIn:      (token)   => api.post('/venue/checkin',  { token }),
  checkOut:     (token)   => api.post('/venue/checkout', { token }),
  getToday:     (date)    => api.get('/venue/today', { params: date ? { date } : {} }),
  getQR:        ()        => api.get('/venue/qr'),
  regenerateQR: ()        => api.post('/venue/qr/regenerate'),
}

// ---------------------------------------------------------------------------
// Club (multi-tenancy)
// ---------------------------------------------------------------------------
export const clubAPI = {
  getCurrent: ()       => api.get('/clubs/current'),
  update:     (data)   => api.patch('/clubs/current', data),
}

export default api;
