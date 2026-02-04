import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authAPI } from '../services/adminApi';

const AdminAuthContext = createContext(null);

export const useAdminAuth = () => {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error('useAdminAuth must be used within AdminAuthProvider');
    }
    return context;
};

export const AdminAuthProvider = ({ children }) => {
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Check if user is admin
    const isAdmin = useCallback((user) => {
        if (!user?.roles) return false;
        return user.roles.some(r => ['admin', 'super_admin'].includes(r.slug));
    }, []);

    // Initialize auth state
    useEffect(() => {
        const initAuth = async () => {
            const token = localStorage.getItem('admin_token');
            const storedUser = localStorage.getItem('admin_user');

            if (token && storedUser) {
                try {
                    const user = JSON.parse(storedUser);
                    if (isAdmin(user)) {
                        setAdmin(user);
                    } else {
                        // Not admin, clear storage
                        localStorage.removeItem('admin_token');
                        localStorage.removeItem('admin_user');
                    }
                } catch {
                    localStorage.removeItem('admin_token');
                    localStorage.removeItem('admin_user');
                }
            }
            setLoading(false);
        };
        initAuth();
    }, [isAdmin]);

    // Login
    const login = async (email, password) => {
        setError(null);
        try {
            const response = await authAPI.login({ email, password });
            const { token, user } = response.data.data;

            if (!isAdmin(user)) {
                throw new Error('Bu panele erişim yetkiniz bulunmamaktadır.');
            }

            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_user', JSON.stringify(user));
            setAdmin(user);
            return { success: true };
        } catch (err) {
            const message = err.response?.data?.message || err.message || 'Giriş başarısız.';
            setError(message);
            return { success: false, error: message };
        }
    };

    // Logout
    const logout = async () => {
        try {
            await authAPI.logout();
        } catch {
            // Ignore logout errors
        } finally {
            localStorage.removeItem('admin_token');
            localStorage.removeItem('admin_user');
            setAdmin(null);
        }
    };

    // Refresh user data
    const refreshUser = async () => {
        try {
            const response = await authAPI.me();
            const user = response.data.data.user;
            if (isAdmin(user)) {
                localStorage.setItem('admin_user', JSON.stringify(user));
                setAdmin(user);
            } else {
                await logout();
            }
        } catch {
            await logout();
        }
    };

    const value = {
        admin,
        loading,
        error,
        isAuthenticated: !!admin,
        login,
        logout,
        refreshUser,
        clearError: () => setError(null),
    };

    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export default AdminAuthContext;
