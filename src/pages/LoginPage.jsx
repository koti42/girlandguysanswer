import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaEnvelope, FaLock, FaCheckCircle } from 'react-icons/fa';

const LoginPage = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        remember: false
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
        if (!formData.email.trim()) {
            newErrors.email = 'E-posta adresi zorunludur';
        } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
            newErrors.email = 'Geçerli bir e-posta adresi girin';
        }
        if (!formData.password) {
            newErrors.password = 'Şifre zorunludur';
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
        <div className="min-h-screen bg-gradient-to-br from-coral/10 via-background to-gold/10 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <Link to="/" className="inline-flex items-center gap-2 mb-4">
                        <span className="font-script text-5xl text-coral font-bold">Kızilinkalarsoruyor</span>
                    </Link>
                    <p className="text-gray-600">Topluluğa hoş geldin!</p>
                </div>

                {/* Login Card */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-soft p-8">
                    <h2 className="text-2xl font-bold text-gray-800 mb-6">Giriş Yap</h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                E-posta Adresi
                            </label>
                            <div className="relative">
                                <FaEnvelope className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleInputChange}
                                    placeholder="ornek@email.com"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.email ? 'border-red-500' : 'border-gray-300'
                                        } focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.email && <span className="text-red-500 text-sm mt-1 block">{errors.email}</span>}
                        </div>

                        {/* Password */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                Şifre
                            </label>
                            <div className="relative">
                                <FaLock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleInputChange}
                                    placeholder="••••••••"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.password ? 'border-red-500' : 'border-gray-300'
                                        } focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.password && <span className="text-red-500 text-sm mt-1 block">{errors.password}</span>}
                        </div>

                        {/* Remember & Forgot */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    name="remember"
                                    checked={formData.remember}
                                    onChange={handleInputChange}
                                    className="w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral"
                                />
                                <span className="text-sm text-gray-600">Beni Hatırla</span>
                            </label>
                            <Link to="/forgot-password" className="text-sm text-coral hover:underline">
                                Şifremi Unuttum
                            </Link>
                        </div>

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                        </button>
                    </form>

                    {/* Divider */}
                    <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-gray-200"></div>
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="px-4 bg-white text-gray-500">veya</span>
                        </div>
                    </div>

                    {/* Signup Link */}
                    <div className="text-center">
                        <p className="text-gray-600">
                            Hesabın yok mu?{' '}
                            <Link to="/signup" className="text-coral font-semibold hover:underline">
                                Kayıt Ol
                            </Link>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
