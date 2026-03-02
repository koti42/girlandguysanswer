import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { FaLock, FaArrowLeft, FaExclamationCircle, FaCheckCircle } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { authAPI } from '../services/api';

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const initialEmail = searchParams.get('email') || '';
    const token = searchParams.get('token') || '';

    const [email, setEmail] = useState(initialEmail);
    const [password, setPassword] = useState('');
    const [passwordConfirmation, setPasswordConfirmation] = useState('');
    const [error, setError] = useState('');
    const [success, setSuccess] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!token) {
            setError('Geçersiz veya eksik şifre sıfırlama bağlantısı.');
        }
    }, [token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (!token) {
            setError('Geçersiz veya eksik şifre sıfırlama bağlantısı.');
            return;
        }
        if (!email.trim()) {
            setError('E-posta adresi zorunludur.');
            return;
        }
        if (!password || password.length < 8) {
            setError('Şifre en az 8 karakter olmalıdır.');
            return;
        }
        if (password !== passwordConfirmation) {
            setError('Şifreler eşleşmiyor.');
            return;
        }

        setIsSubmitting(true);
        try {
            await authAPI.resetPassword({
                token,
                email: email.trim(),
                password,
                password_confirmation: passwordConfirmation,
            });
            setSuccess(true);
        } catch (err) {
            const message = err.response?.data?.message
                || err.response?.data?.errors?.password?.[0]
                || 'Şifre sıfırlanırken bir hata oluştu.';
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <MainLayout>
            <SEO title="Şifre Sıfırla - Herkesler Soruyor" description="Yeni şifrenizi belirleyin." />
            <div className="max-w-lg mx-auto px-4 py-10">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-8 border border-gray-100 dark:border-gray-700">
                    {success ? (
                        <div className="text-center">
                            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 mb-6">
                                <FaCheckCircle className="text-green-500 text-3xl" />
                            </div>
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Şifre Güncellendi</h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6 text-sm">
                                Şifreniz başarıyla değiştirildi. Yeni şifrenizle giriş yapabilirsiniz.
                            </p>
                            <button
                                type="button"
                                onClick={() => navigate('/login')}
                                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                            >
                                Giriş Yap
                            </button>
                        </div>
                    ) : (
                        <>
                            <div className="text-center mb-8">
                                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-coral to-orange-400 mb-4">
                                    <FaLock className="text-white text-2xl" />
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Yeni Şifre Belirle</h1>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    Aşağıya yeni şifrenizi girin. Güçlü bir şifre kullanmanızı öneririz.
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
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent transition-all"
                                        placeholder="ornek@mail.com"
                                        autoComplete="email"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Yeni Şifre
                                    </label>
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent transition-all"
                                        placeholder="En az 8 karakter"
                                        autoComplete="new-password"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Yeni Şifre (Tekrar)
                                    </label>
                                    <input
                                        type="password"
                                        value={passwordConfirmation}
                                        onChange={(e) => setPasswordConfirmation(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral focus:border-transparent transition-all"
                                        placeholder="Yeni şifrenizi tekrar girin"
                                        autoComplete="new-password"
                                    />
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full py-3 px-4 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Kaydediliyor...' : 'Şifreyi Güncelle'}
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

export default ResetPasswordPage;

