import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEnvelope, FaArrowLeft, FaCheckCircle, FaExclamationCircle } from 'react-icons/fa';
import { authAPI } from '../services/api';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successData, setSuccessData] = useState(null);
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
            const res = await authAPI.forgotPassword(email.trim());
            const data = res.data?.data || {};
            setSuccessData({
                email: data.email || email.trim(),
                token: data.reset_token || '',
            });
        } catch (err) {
            const message = err.response?.data?.message || 'Bir hata oluştu. Lütfen tekrar deneyin.';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetLink = successData?.token && successData.email
        ? `/reset-password?token=${encodeURIComponent(successData.token)}&email=${encodeURIComponent(successData.email)}`
        : null;

    return (
        <MainLayout>
            <SEO title="Şifremi Unuttum - Herkesler Soruyor" description="Şifrenizi sıfırlamak için e-posta adresinizi girin." />
            <div className="max-w-lg mx-auto px-4 py-10">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-8 border border-gray-100 dark:border-gray-700">
                    {successData ? (
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                                <FaCheckCircle className="text-green-500 text-3xl" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Talep Alındı</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                                Eğer <span className="font-semibold">{successData.email}</span> adresi ile kayıtlı bir hesabın varsa,
                                şifre sıfırlama bağlantısı e-posta kutuna gönderildi.
                            </p>
                            <Link
                                to="/login"
                                className="inline-flex items-center gap-2 text-coral hover:text-orange-500 transition-colors text-sm"
                            >
                                <FaArrowLeft />
                                Giriş sayfasına dön
                            </Link>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-coral to-orange-400 mb-4">
                                    <FaEnvelope className="text-white text-2xl" />
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Şifremi Unuttum</h1>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    E-posta adresinizi girin, size şifre sıfırlama talimatları gönderelim.
                                </p>
                            </div>

                            {error && (
                                <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 flex items-center gap-3">
                                    <FaExclamationCircle className="text-red-500 dark:text-red-400 flex-shrink-0" />
                                    <span className="text-red-700 dark:text-red-200 text-sm">{error}</span>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-5">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        E-posta Adresi
                                    </label>
                                    <div className="relative">
                                        <FaEnvelope className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                        <input
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="ornek@mail.com"
                                            className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent transition-all"
                                            autoComplete="email"
                                        />
                                    </div>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Gönderiliyor...' : 'Sıfırlama Bağlantısı Gönder'}
                                </button>

                                <div className="mt-4 text-center">
                                    <Link
                                        to="/login"
                                        className="inline-flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 hover:text-coral dark:hover:text-coral transition-colors"
                                    >
                                        <FaArrowLeft />
                                        Giriş sayfasına dön
                                    </Link>
                                </div>
                            </form>
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default ForgotPasswordPage;

