import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import DashboardPage from './pages/DashboardPage';
import ComplaintsPage from './pages/ComplaintsPage';
import UsersPage from './pages/UsersPage';
import RolesPage from './pages/RolesPage';
import QuestionsPage from './pages/QuestionsPage';
import OpinionsPage from './pages/OpinionsPage';
import AnswersPage from './pages/AnswersPage';
import CommentsPage from './pages/CommentsPage';

// Protected Route Wrapper
const AdminProtectedRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                </div>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <Navigate to="/cpl-manage/login" replace />;
    }

    return children;
};

// Public Route Wrapper (redirect if already logged in)
const AdminPublicRoute = ({ children }) => {
    const { isAuthenticated, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full border-4 border-coral/20 border-t-coral animate-spin" />
                </div>
            </div>
        );
    }

    if (isAuthenticated) {
        return <Navigate to="/cpl-manage" replace />;
    }

    return children;
};

// Main Admin App Component
const AdminAppContent = () => {
    return (
        <Routes>
            {/* Public Routes */}
            <Route
                path="/login"
                element={
                    <AdminPublicRoute>
                        <LoginPage />
                    </AdminPublicRoute>
                }
            />
            <Route
                path="/forgot-password"
                element={
                    <AdminPublicRoute>
                        <ForgotPasswordPage />
                    </AdminPublicRoute>
                }
            />

            {/* Protected Routes */}
            <Route
                element={
                    <AdminProtectedRoute>
                        <AdminLayout />
                    </AdminProtectedRoute>
                }
            >
                <Route index element={<DashboardPage />} />
                <Route path="/complaints" element={<ComplaintsPage />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/roles" element={<RolesPage />} />
                <Route path="/questions" element={<QuestionsPage />} />
                <Route path="/opinions" element={<OpinionsPage />} />
                <Route path="/answers" element={<AnswersPage />} />
                <Route path="/comments" element={<CommentsPage />} />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/cpl-manage" replace />} />
        </Routes>
    );
};

// Wrap with Provider
const AdminApp = () => {
    return (
        <AdminAuthProvider>
            <AdminAppContent />
        </AdminAuthProvider>
    );
};

export default AdminApp;
