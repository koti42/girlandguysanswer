import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';

const api = axios.create({
    baseURL: API_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');

        }
        return Promise.reject(error);
    }
);

export const authAPI = {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    getCurrentUser: () => api.get('/user/me'),
};

export const questionsAPI = {
    getAll: (params) => api.get('/questions', { params }),
    getById: (id) => api.get(`/questions/${id}`),
    create: (data) => api.post('/questions', data),
    createAnswer: (questionId, data) => api.post(`/questions/${questionId}/answers`, data),
    getMyQuestions: () => api.get('/user/me/questions'),
};

export const usersAPI = {
    getMe: () => api.get('/user/me'),
    getProfile: (username) => api.get(`/users/${username}`),
    updateProfile: (data) => api.put('/user/me', data),
    getFollowers: (username) => api.get(`/users/${username}/followers`),
    getFollowing: (username) => api.get(`/users/${username}/following`),
    getUserAnswers: (username) => api.get(`/users/${username}/answers`),
    follow: (username) => api.post(`/users/${username}/follow`),
    unfollow: (username) => api.delete(`/users/${username}/follow`),
    block: (username) => api.post(`/users/${username}/block`),
    unblock: (username) => api.delete(`/users/${username}/unblock`),
    getFollowRequests: () => api.get('/user/me/follow-requests'),
    acceptFollowRequest: (requestId) => api.post(`/user/me/follow-requests/${requestId}/accept`),
    rejectFollowRequest: (requestId) => api.delete(`/user/me/follow-requests/${requestId}/reject`),
    updatePrivacy: (isPrivate) => api.post('/user/me/settings/privacy', { is_private: isPrivate }),
    updateMessaging: (settings) => api.post('/user/me/settings/messaging', settings),
    updateFollowing: (allowFollowing) => api.post('/user/me/settings/following', { allow_following: allowFollowing }),
};

export const uploadAPI = {
    upload: (formData) => api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export const commentsAPI = {
    create: (data) => api.post('/comments', data),
};

export const messagesAPI = {
    getConversations: () => api.get('/messages/conversations'),
    getMessages: (conversationId) => api.get(`/messages/conversations/${conversationId}`),
    sendMessage: (data) => api.post('/messages/send', data),
    sendFile: (formData) => api.post('/messages/send', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    markAsRead: (conversationId) => api.post(`/messages/conversations/${conversationId}/read`)
};

export const notificationsAPI = {
    getAll: (params) => api.get('/notifications', { params }),
    markAsRead: (id) => api.post(`/notifications/${id}/read`),
    markAllAsRead: () => api.post('/notifications/read-all'),
    delete: (id) => api.delete(`/notifications/${id}`),
    deleteAll: () => api.delete('/notifications'),
};

export default api;
