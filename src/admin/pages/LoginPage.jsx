import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import { FaEnvelope, FaLock, FaSignInAlt, FaExclamationCircle } from 'react-icons/fa';

const LoginPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { login, isAuthenticated, error, clearError, loading } = useAdminAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [localError, setLocalError] = useState('');

    useEffect(() => {
        if (isAuthenticated && !loading) {
            navigate('/cpl-manage');
        }
    }, [isAuthenticated, loading, navigate]);

    useEffect(() => {
        const errorParam = searchParams.get('error');
        if (errorParam === 'forbidden') {
            setLocalError('Bu panele erişim yetkiniz bulunmamaktadır.');
        }
    }, [searchParams]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        clearError();
        setLocalError('');

        if (!email.trim() || !password.trim()) {
            setLocalError('E-posta ve şifre gereklidir.');
            return;
        }

        setIsSubmitting(true);
        const result = await login(email, password);
        setIsSubmitting(false);

        if (result.success) {
            navigate('/cpl-manage');
        }
    };

    const displayError = localError || error;

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
            {/* No-index meta */}
            <meta name="robots" content="noindex, nofollow" />

            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-coral/20 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
            </div>

            {/* Login Card */}
            <div className="relative w-full max-w-md">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-coral to-orange-500 mb-4">
                            <FaSignInAlt className="text-white text-2xl" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2">Admin Girişi</h1>
                        <p className="text-gray-400">Yönetim paneline hoş geldiniz</p>
                    </div>

                    {/* Error Alert */}
                    {displayError && (
                        <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center gap-3">
                            <FaExclamationCircle className="text-red-400 flex-shrink-0" />
                            <span className="text-red-300 text-sm">{displayError}</span>
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                E-posta Adresi
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="admin@example.com"
                                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/50 transition-all"
                                    autoComplete="email"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Şifre
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/50 transition-all"
                                    autoComplete="current-password"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <Link
                                to="/cpl-manage/forgot-password"
                                className="text-sm text-coral hover:text-orange-400 transition-colors"
                            >
                                Şifremi Unuttum
                            </Link>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 px-4 bg-gradient-to-r from-coral to-orange-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-coral/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center justify-center gap-2">
                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Giriş yapılıyor...
                                </span>
                            ) : (
                                'Giriş Yap'
                            )}
                        </button>
                    </form>

                    {/* Footer */}
                    <div className="mt-8 text-center">
                        <Link
                            to="/"
                            className="text-sm text-gray-400 hover:text-white transition-colors"
                        >
                            ← Ana Siteye Dön
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
