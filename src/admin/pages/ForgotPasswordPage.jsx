import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/adminApi';
import { FaEnvelope, FaArrowLeft, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!email.trim()) {
            setError('E-posta adresi gereklidir.');
            return;
        }

        setIsSubmitting(true);

        try {
            await authAPI.forgotPassword(email);
            setSuccess(true);
        } catch (err) {
            const message = err.response?.data?.message || 'Bir hata oluştu. Lütfen tekrar deneyin.';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
            {/* No-index meta */}
            <meta name="robots" content="noindex, nofollow" />

            {/* Background Effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/3 left-1/3 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
                <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-purple-500/20 rounded-full blur-3xl" />
            </div>

            {/* Card */}
            <div className="relative w-full max-w-md">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl shadow-2xl p-8 border border-white/10">
                    {success ? (
                        /* Success State */
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-6">
                                <FaCheckCircle className="text-green-400 text-3xl" />
                            </div>
                            <h2 className="text-2xl font-bold text-white mb-3">E-posta Gönderildi!</h2>
                            <p className="text-gray-400 mb-6">
                                Şifre sıfırlama bağlantısı e-posta adresinize gönderildi.
                                Lütfen gelen kutunuzu kontrol edin.
                            </p>
                            <Link
                                to="/cpl-manage/login"
                                className="inline-flex items-center gap-2 text-coral hover:text-orange-400 transition-colors"
                            >
                                <FaArrowLeft />
                                Giriş sayfasına dön
                            </Link>
                        </div>
                    ) : (
                        /* Form State */
                        <>
                            {/* Header */}
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-500 mb-4">
                                    <FaEnvelope className="text-white text-2xl" />
                                </div>
                                <h1 className="text-2xl font-bold text-white mb-2">Şifremi Unuttum</h1>
                                <p className="text-gray-400">
                                    E-posta adresinizi girin, size şifre sıfırlama bağlantısı gönderelim.
                                </p>
                            </div>

                            {/* Error Alert */}
                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-500/20 border border-red-500/30 flex items-center gap-3">
                                    <FaExclamationCircle className="text-red-400 flex-shrink-0" />
                                    <span className="text-red-300 text-sm">{error}</span>
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
                                            className="w-full pl-11 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-all"
                                            autoComplete="email"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-blue-500 to-purple-500 text-white font-semibold rounded-xl hover:shadow-lg hover:shadow-blue-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            Gönderiliyor...
                                        </span>
                                    ) : (
                                        'Sıfırlama Bağlantısı Gönder'
                                    )}
                                </button>
                            </form>

                            {/* Footer */}
                            <div className="mt-8 text-center">
                                <Link
                                    to="/cpl-manage/login"
                                    className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
                                >
                                    <FaArrowLeft />
                                    Giriş sayfasına dön
                                </Link>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
