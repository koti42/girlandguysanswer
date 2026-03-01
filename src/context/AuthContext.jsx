import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [permissions, setPermissions] = useState({
        can_moderate: false,
        is_admin: false,
        is_super_admin: false,
        is_moderator: false,
        is_fenomen: false,
        roles: []
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const getCurrentUser = async () => {
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const response = await authAPI.getCurrentUser();
            const data = response.data.data || response.data;
            const userData = data.user || response.data.user || response.data.data;
            const perms = extractPermissions(data);
            const accountStatus = data.accountStatus || response.data.accountStatus || null;
            const levelProgress = data.level_progress || null;

            if (userData) {
                if (!userData.username && userData.name) userData.username = userData.name;
                userData.accountStatus = accountStatus;
                userData.levelProgress = levelProgress;
                localStorage.setItem('user', JSON.stringify(userData));
                localStorage.setItem('permissions', JSON.stringify(perms));
                setUser(userData);
                setPermissions(perms);
            }
        } catch (err) {
            console.error('getCurrentUser error:', err);
            if (err.response?.status === 401) {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
                localStorage.removeItem('permissions');
                setUser(null);
                setPermissions({
                    can_moderate: false,
                    is_admin: false,
                    is_super_admin: false,
                    is_moderator: false,
                    is_fenomen: false,
                    roles: []
                });
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        const storedToken = localStorage.getItem('token');
        const storedPermissions = localStorage.getItem('permissions');

        if (storedUser && storedToken) {
            try {
                setUser(JSON.parse(storedUser));
                if (storedPermissions) {
                    setPermissions(JSON.parse(storedPermissions));
                }
            } catch (e) {
                localStorage.removeItem('user');
                localStorage.removeItem('token');
                localStorage.removeItem('permissions');
            }
            setLoading(false);
            getCurrentUser();
        } else {
            setLoading(false);
        }
    }, []);

    const extractPermissions = (responseData) => {
        const perms = responseData.permissions || {};
        return {
            can_moderate: perms.can_moderate || false,
            is_admin: perms.is_admin || false,
            is_super_admin: perms.is_super_admin || false,
            is_moderator: perms.is_moderator || false,
            is_fenomen: perms.is_fenomen || false,
            roles: perms.roles || []
        };
    };

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authAPI.login({ email, password });

            const token = response.data.data?.token || response.data.token || response.data.access_token;
            const userData = response.data.data?.user || response.data.user || response.data.data;
            const perms = extractPermissions(response.data.data || response.data);

            if (token && userData) {
                localStorage.setItem('token', token);
                if (!userData.username && userData.name) userData.username = userData.name;
                localStorage.setItem('user', JSON.stringify(userData));
                localStorage.setItem('permissions', JSON.stringify(perms));
                setUser(userData);
                setPermissions(perms);
                return { success: true };
            } else {
                throw new Error("Giriş verileri alınamadı");
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || 'Giriş yapılırken bir hata oluştu';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    const register = async (userData) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authAPI.register(userData);

            const token = response.data.data?.token || response.data.token || response.data.access_token;
            const user = response.data.data?.user || response.data.user || response.data.data;
            const perms = extractPermissions(response.data.data || response.data);

            if (token && user) {
                localStorage.setItem('token', token);
                if (!user.username && user.name) user.username = user.name;
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('permissions', JSON.stringify(perms));
                setUser(user);
                setPermissions(perms);
                return { success: true };
            } else {
                throw new Error("Kayıt verileri alınamadı");
            }
        } catch (err) {
            const errorMessage = err.response?.data?.message || err.response?.data?.errors?.username || 'Kayıt olurken bir hata oluştu';
            setError(errorMessage);
            return { success: false, error: errorMessage };
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        const token = localStorage.getItem('token');
        try {
            if (token) {
                await authAPI.logout();
            }
        } catch (e) {
            // Token zaten düşmüş/expire olmuş olabilir
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('permissions');
            setUser(null);
            setPermissions({
                can_moderate: false,
                is_admin: false,
                is_super_admin: false,
                is_moderator: false,
                is_fenomen: false,
                roles: []
            });
        }
    };

    const updateUser = (updatedUserData) => {
        const newUser = { ...user, ...updatedUserData };
        localStorage.setItem('user', JSON.stringify(newUser));
        setUser(newUser);
    };

    const updatePermissions = (newPermissions) => {
        const updated = { ...permissions, ...newPermissions };
        localStorage.setItem('permissions', JSON.stringify(updated));
        setPermissions(updated);
    };

    const markWelcomeGuideSeen = async () => {
        localStorage.setItem('has_seen_welcome_guide', '1');
        updateUser({ has_seen_welcome_guide: true });
        try {
            await authAPI.markWelcomeGuideSeen();
        } catch (_) {}
    };

    const value = {
        user,
        permissions,
        loading,
        error,
        login,
        register,
        logout,
        updateUser,
        updatePermissions,
        getCurrentUser,
        markWelcomeGuideSeen,
        isAuthenticated: !!user,
        canModerate: permissions.can_moderate
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
