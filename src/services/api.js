import axios from 'axios';

const API_URL = 'http://127.0.0.1:8003/api';

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
    getProfile: (username) => api.get(`/users/${username}`),
    updateProfile: (data) => api.put('/user/me', data),
    getFollowers: (userId) => api.get(`/users/${userId}/followers`),
    getFollowing: (userId) => api.get(`/users/${userId}/following`),
    follow: (username) => api.post(`/users/${username}/follow`),
    unfollow: (username) => api.delete(`/users/${username}/follow`),
    block: (username) => api.post(`/users/${username}/block`),
    unblock: (username) => api.delete(`/users/${username}/unblock`),
    getFollowRequests: () => api.get('/user/me/follow-requests'),
    acceptFollowRequest: (username, requestId) => api.post(`/users/${username}/follow-requests/${requestId}/accept`),
    rejectFollowRequest: (username, requestId) => api.delete(`/users/${username}/follow-requests/${requestId}/reject`),
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

export default api;
