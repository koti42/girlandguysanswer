import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaLock, FaEye, FaEyeSlash, FaMars, FaVenus } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const SignupPage = () => {
    const navigate = useNavigate();
    const { register, loading, error: authError, isAuthenticated } = useAuth();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        gender: '', // 'male' or 'female'
        agreeTerms: false
    });
    const [errors, setErrors] = useState({});

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    // Auth error'u form error'ları ile birleştirebiliriz veya ayrıca gösterebiliriz
    // Simdilik submit'te authError gelirse alert veya toast ile gösterebiliriz
    // Veya errors state'ine ekleyebiliriz

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

    // ... validateForm functions (unchanged) ...

    const validateForm = () => {
        const newErrors = {};

        if (!formData.username.trim()) {
            newErrors.username = 'Kullanıcı adı zorunludur';
        } else if (formData.username.length < 2) {
            newErrors.username = 'Kullanıcı adı en az 2 karakter olmalıdır';
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

        if (!formData.gender) {
            newErrors.gender = 'Cinsiyet seçimi zorunludur';
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

        // Register fonksiyonunu çağır
        const result = await register({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            gender: formData.gender
        });

        if (result.success) {
            navigate('/');
        } else {
            // API hatasını göster
            setErrors(prev => ({ ...prev, submit: result.error }));
        }
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
                        {/* Username */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Kullanıcı Adı
                            </label>
                            <div className="relative">
                                <FaUser className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                                <input
                                    type="text"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleInputChange}
                                    placeholder="ornek_kullanici"
                                    className={`w-full pl-10 pr-4 py-3 rounded-xl border ${errors.username ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                />
                            </div>
                            {errors.username && <span className="text-red-500 text-sm mt-1 block">{errors.username}</span>}
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

                        {/* Gender Selection */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                                Cinsiyet <span className="text-coral">*</span>
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                                <label className={`relative flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.gender === 'female'
                                    ? 'border-pink-400 bg-pink-50 dark:bg-pink-900/20'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-pink-300 dark:hover:border-pink-700'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="gender"
                                        value="female"
                                        checked={formData.gender === 'female'}
                                        onChange={handleInputChange}
                                        className="sr-only"
                                    />
                                    <FaVenus className={`text-2xl ${formData.gender === 'female' ? 'text-pink-500' : 'text-gray-400'}`} />
                                    <span className={`font-semibold ${formData.gender === 'female' ? 'text-pink-600 dark:text-pink-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                        Kadın
                                    </span>
                                </label>
                                <label className={`relative flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${formData.gender === 'male'
                                    ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
                                    : 'border-gray-300 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-700'
                                    }`}>
                                    <input
                                        type="radio"
                                        name="gender"
                                        value="male"
                                        checked={formData.gender === 'male'}
                                        onChange={handleInputChange}
                                        className="sr-only"
                                    />
                                    <FaMars className={`text-2xl ${formData.gender === 'male' ? 'text-blue-500' : 'text-gray-400'}`} />
                                    <span className={`font-semibold ${formData.gender === 'male' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                        Erkek
                                    </span>
                                </label>
                            </div>
                            {errors.gender && <span className="text-red-500 text-sm mt-1 block">{errors.gender}</span>}
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

                        {/* General Error Message */}
                        {errors.submit && (
                            <div className="p-3 bg-red-50 text-red-500 text-sm rounded-lg text-center">
                                {errors.submit}
                            </div>
                        )}

                        {/* Submit Button */}
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                        >
                            {loading ? 'Kayıt Oluşturuluyor...' : 'Kayıt Ol'}
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
