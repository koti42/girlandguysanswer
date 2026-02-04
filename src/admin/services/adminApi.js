import axios from 'axios';

//const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://herkeslersoruyor.panalix.com.tr/api';
const API_BASE_URL = 'https://herkeslersoruyor.panalix.com.tr/api';

const adminApi = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Request interceptor - attach admin token
adminApi.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('admin_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor - handle 401/403
adminApi.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_user');
            window.location.href = '/cpl-manage/login';
        }
        if (error.response?.status === 403) {
            // Not admin - redirect to login
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_user');
            window.location.href = '/cpl-manage/login?error=forbidden';
        }
        return Promise.reject(error);
    }
);

// Auth API
export const authAPI = {
    login: (credentials) => adminApi.post('/auth/login', credentials),
    logout: () => adminApi.post('/auth/logout'),
    me: () => adminApi.get('/auth/me'),
    forgotPassword: (email) => adminApi.post('/auth/password/forgot', { email }),
    resetPassword: (data) => adminApi.post('/auth/password/reset', data),
};

// Stats API
export const statsAPI = {
    getOverview: () => adminApi.get('/admin/stats/overview'),
};

// Users API
export const usersAPI = {
    getAll: (params) => adminApi.get('/admin/users', { params }),
    getById: (id) => adminApi.get(`/admin/users/${id}`),
    update: (id, data) => adminApi.put(`/admin/users/${id}`, data),
    updateRoles: (id, roleSlugs) => adminApi.put(`/admin/users/${id}/roles`, { role_slugs: roleSlugs }),
};

// Roles API
export const rolesAPI = {
    getAll: () => adminApi.get('/admin/roles'),
    create: (data) => adminApi.post('/admin/roles', data),
    update: (id, data) => adminApi.put(`/admin/roles/${id}`, data),
    delete: (id) => adminApi.delete(`/admin/roles/${id}`),
};

// Complaints API
export const complaintsAPI = {
    getAll: (params) => adminApi.get('/admin/complaints', { params }),
    getById: (id) => adminApi.get(`/admin/complaints/${id}`),
    resolve: (id, data) => adminApi.post(`/admin/complaints/${id}/resolve`, data),
};

// Content APIs
export const questionsAPI = {
    getAll: (params) => adminApi.get('/admin/questions', { params }),
    update: (id, data) => adminApi.put(`/admin/questions/${id}`, data),
    delete: (id) => adminApi.delete(`/admin/questions/${id}`),
};

export const opinionsAPI = {
    getAll: (params) => adminApi.get('/admin/opinions', { params }),
    update: (id, data) => adminApi.put(`/admin/opinions/${id}`, data),
    delete: (id) => adminApi.delete(`/admin/opinions/${id}`),
};

export const answersAPI = {
    getAll: (params) => adminApi.get('/admin/answers', { params }),
    update: (id, data) => adminApi.put(`/admin/answers/${id}`, data),
    delete: (id) => adminApi.delete(`/admin/answers/${id}`),
};

export const commentsAPI = {
    getAll: (params) => adminApi.get('/admin/comments', { params }),
    update: (id, data) => adminApi.put(`/admin/comments/${id}`, data),
    delete: (id) => adminApi.delete(`/admin/comments/${id}`),
};

// Question moderation API (uses same endpoints as public moderation, admin token ile)
export const adminModerationAPI = {
    hideQuestion: (questionId, data) => adminApi.post(`/questions/${questionId}/hide`, data),
    unhideQuestion: (questionId) => adminApi.post(`/questions/${questionId}/unhide`),
    removeQuestion: (questionId, data) => adminApi.post(`/questions/${questionId}/remove`, data),
};

// Messages API (admin-only message inspection)
export const adminMessagesAPI = {
    // Kullanıcının tüm konuşmalarını getirir
    getUserConversations: (userId, params) =>
        adminApi.get(`/admin/users/${userId}/conversations`, { params }),

    // Belirli bir konuşmanın mesajlarını getirir
    getConversationMessages: (conversationId, params) =>
        adminApi.get(`/admin/conversations/${conversationId}/messages`, { params }),
};

export default adminApi;
