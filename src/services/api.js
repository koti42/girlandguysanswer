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
            localStorage.removeItem('permissions');
        }

        // 403 hatası ve frozen/banned durumu kontrolü
        if (error.response?.status === 403) {
            const errorData = error.response?.data;
            if (errorData?.type === 'frozen' || errorData?.type === 'banned') {
                // Kullanıcı profil sayfasında değilse yönlendir
                const currentPath = window.location.pathname;
                if (!currentPath.includes('/profile/')) {
                    const user = JSON.parse(localStorage.getItem('user') || '{}');
                    if (user?.username) {
                        window.location.href = `/profile/${user.username}`;
                    }
                }
            }
        }

        return Promise.reject(error);
    }
);

export const authAPI = {
    login: (credentials) => api.post('/auth/login', credentials),
    register: (userData) => api.post('/auth/register', userData),
    logout: () => api.post('/auth/logout'),
    getCurrentUser: () => api.get('/user/me'),
    getGoogleAuthUrl: (redirect_uri) => api.get('/auth/google', { params: { redirect_uri } }),
};

export const categoriesAPI = {
    getAll: () => api.get('/categories'),
    getBySlug: (slug) => api.get(`/categories/${slug}`)
};

export const questionsAPI = {
    getAll: (params) => api.get('/questions', { params }),
    getById: (id) => api.get(`/questions/${id}`),
    create: (data) => api.post('/questions', data),
    createAnswer: (questionId, data) => api.post(`/questions/${questionId}/answers`, data),
    getMyQuestions: () => api.get('/user/me/questions'),
    getQuestionComments: (questionId, params) => api.get(`/questions/${questionId}/comments`, { params }),
    getAnswerComments: (answerId, params) => api.get(`/answers/${answerId}/comments`, { params }),
    toggleLike: (data) => api.post('/likes', data),
    getLikers: (params) => api.get('/likes', { params })
};

export const answersAPI = {
    selectBestAnswer: (answerId) => api.post(`/answers/${answerId}/best`)
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
    uploadAvatar: (formData) => api.post('/user/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    uploadCoverImage: (formData) => api.post('/user/me/cover-image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    deleteAvatar: () => api.delete('/user/me/avatar'),
    deleteCoverImage: () => api.delete('/user/me/cover-image'),
    requestAccountDeletion: (password) => api.post('/user/me/delete', { password }),
};

export const gifsAPI = {
    list: (params) => api.get('/gifs', { params }),
};

export const gamificationAPI = {
    getLeaderboard: (params) => api.get('/leaderboard', { params }),
};

export const uploadAPI = {
    upload: (formData) => api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
};

export const commentsAPI = {
    create: (data) => api.post('/comments', data),
    getCommentReplies: (commentId, params) => api.get(`/comments/${commentId}/replies`, { params })
};

export const messagesAPI = {
    getConversations: () => api.get('/messages/conversations'),
    getMessages: (conversationId) => api.get(`/messages/conversations/${conversationId}`),
    sendMessage: (data) => api.post('/messages/send', data),
    sendFile: (formData) => api.post('/messages/send', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
    }),
    markAsRead: (conversationId) => api.post(`/messages/conversations/${conversationId}/read`),
    deleteConversation: (conversationId) => api.delete(`/messages/conversations/${conversationId}`)
};

export const notificationsAPI = {
    getAll: (params) => api.get('/notifications', { params }),
    markAsRead: (id) => api.post(`/notifications/${id}/read`),
    markAllAsRead: () => api.post('/notifications/read-all'),
    delete: (id) => api.delete(`/notifications/${id}`),
    deleteAll: () => api.delete('/notifications'),
};

export const reportsAPI = {
    create: (data) => api.post('/reports', data),
};

export const moderationAPI = {
    // User moderation
    banUser: (userId, data) => api.post(`/users/${userId}/ban`, data),
    unbanUser: (userId) => api.post(`/users/${userId}/unban`),
    freezeUser: (userId, data) => api.post(`/users/${userId}/freeze`, data),
    unfreezeUser: (userId) => api.post(`/users/${userId}/unfreeze`),
    // Question moderation
    hideQuestion: (questionId, data) => api.post(`/questions/${questionId}/hide`, data),
    unhideQuestion: (questionId) => api.post(`/questions/${questionId}/unhide`),
    removeQuestion: (questionId, data) => api.post(`/questions/${questionId}/remove`, data),
};

export const communityAPI = {
    getAll: (page = 1) => api.get('/communities', { params: { page } }),
    getById: (id) => api.get(`/communities/${id}`), // Keeping for reference, but likely 404
    getMyStatus: (id) => api.get(`/communities/${id}/my-status`),
    create: (data) => api.post('/communities', data),
    join: (id) => api.post(`/communities/${id}/join`),
    leave: (id) => api.post(`/communities/${id}/leave`),
    getMessages: (id, page = 1) => api.get(`/communities/${id}/messages`, { params: { page } }),
    sendMessage: (id, data) => api.post(`/communities/${id}/messages`, data),
    raiseHand: (id) => api.post(`/communities/${id}/hand-raise`),
    updateRole: (id, userId, role) => api.post(`/communities/${id}/participants/${userId}/role`, { role }),
    kickUser: (id, userId) => api.delete(`/communities/${id}/participants/${userId}`),
    inviteUser: (id, userId) => api.post(`/communities/${id}/invite`, { user_id: userId }),
    getInvitations: () => api.get('/communities/invitations'),
    respondToInvitation: (invitationId, status) => api.post(`/communities/invitations/${invitationId}/respond`, { status }),
};

export default api;
