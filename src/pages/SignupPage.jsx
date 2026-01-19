import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaLock, FaCheckCircle } from 'react-icons/fa';

const SignupPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        agreeTerms: false
    });
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const validateForm = () => {
        const newErrors = {};

        if (!formData.name.trim()) {
            newErrors.name = 'İsim zorunludur';
        } else if (formData.name.length < 2) {
            newErrors.name = 'İsim en az 2 karakter olmalıdır';
        }

        if (!formData.email.trim()) {
            newErrors.email = 'E-posta adresi zorunludur';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Geçerli bir e-posta adresi girin';
        }

        if (!formData.password) {
            newErrors.password = 'Şifre zorunludur';
        } else if (formData.password.length < 6) {
            newErrors.password = 'Şifre en az 6 karakter olmalıdır';
        }

        if (!formData.confirmPassword) {
            newErrors.confirmPassword = 'Şifre tekrarı zorunludur';
        } else if (formData.password !== formData.confirmPassword) {
            newErrors.confirmPassword = 'Şifreler eşleşmiyor';
        }

        if (!formData.agreeTerms) {
            newErrors.agreeTerms = 'Kullanım şartlarını kabul etmelisiniz';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsSubmitting(true);

        // Simulate API call
        setTimeout(() => {
            setIsSubmitting(false);
            navigate('/');
        }, 1500);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-coral/10 via-background to-gold/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 flex items-center justify-center p-4 py-12">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2 mb-4">
                        <span className="font-script text-5xl text-coral font-bold">Kızilinkalarsoruyor</span>
                    </Link>
                    <p className="text-gray-600 dark:text-gray-400">Topluluğa katıl, sorularını sor!</p>
                </div>

                {/* Signup Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-8">
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-6">Kayıt Ol</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Name */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                İsim Soyisim
                            </label>
                            <div className="relative">
                                <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    placeholder="Adınız Soyadınız"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.name && <span className="text-red-500 text-sm mt-1 block">{errors.name}</span>}
                        </div>

                        {/* Email */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                E-posta Adresi
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="ornek@email.com"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.email && <span className="text-red-500 text-sm mt-1 block">{errors.email}</span>}
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Şifre
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="En az 6 karakter"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.password && <span className="text-red-500 text-sm mt-1 block">{errors.password}</span>}
                        </div>

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Şifre Tekrar
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="password"
                                    name="confirmPassword"
                                    value={formData.confirmPassword}
                                    onChange={handleInputChange}
                                    placeholder="Şifrenizi tekrar girin"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.confirmPassword && <span className="text-red-500 text-sm mt-1 block">{errors.confirmPassword}</span>}
                        </div>

                        {/* Terms Agreement */}
                        <div>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="agreeTerms"
                                    checked={formData.agreeTerms}
                                    onChange={handleInputChange}
                                    className={`w-4 h-4 mt-1 text-coral border-gray-300 rounded focus:ring-coral ${errors.agreeTerms ? 'border-red-500' : ''
                                        }`}
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-400">
                                    <Link to="/terms" className="text-coral hover:underline">Kullanım Şartları</Link> ve{' '}
                                    <Link to="/privacy" className="text-coral hover:underline">Gizlilik Politikası</Link>'nı okudum ve kabul ediyorum
                                </span>
                            </label>
                            {errors.agreeTerms && <span className="text-red-500 text-sm mt-1 block">{errors.agreeTerms}</span>}
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {isSubmitting ? 'Kayıt Oluşturuluyor...' : 'Kayıt Ol'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200 dark:border-gray-700"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400">veya</span>
                        </div>
                    </div>

                    {/* Login Link */}
                    <div className="text-center">
                        <p className="text-gray-600 dark:text-gray-400">
                            Zaten üye misin?{' '}
                            <Link to="/login" className="text-coral font-semibold hover:underline">
                                Giriş Yap
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SignupPage;
