import React, { createContext, useState, useEffect, useContext } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        const storedToken = localStorage.getItem('token');

        if (storedUser && storedToken) {
            try {
                setUser(JSON.parse(storedUser));
            } catch (e) {
                console.error("User parsing error", e);
                localStorage.removeItem('user');
                localStorage.removeItem('token');
            }
        }
        setLoading(false);
    }, []);

    const login = async (email, password) => {
        setLoading(true);
        setError(null);
        try {
            const response = await authAPI.login({ email, password });
            console.log("Login Response:", response.data); // Debug log

            // Handle potential variations in API response structure
            const token = response.data.data?.token || response.data.token || response.data.access_token;
            const user = response.data.data?.user || response.data.user || response.data.data;

            if (token && user) {
                localStorage.setItem('token', token);
                // Ensure user has a username, fallback if needed
                if (!user.username && user.name) user.username = user.name;
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
                return { success: true };
            } else {
                console.error("Login structure mismatch:", response.data);
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
            console.log("Register Response:", response.data);

            const token = response.data.data?.token || response.data.token || response.data.access_token;
            const user = response.data.data?.user || response.data.user || response.data.data;

            if (token && user) {
                localStorage.setItem('token', token);
                if (!user.username && user.name) user.username = user.name;
                localStorage.setItem('user', JSON.stringify(user));
                setUser(user);
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

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    const value = {
        user,
        loading,
        error,
        login,
        register,
        logout,
        isAuthenticated: !!user
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};
