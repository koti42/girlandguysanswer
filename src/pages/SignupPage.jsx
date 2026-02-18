import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaUser, FaEnvelope, FaLock, FaEye, FaEyeSlash, FaMars, FaVenus, FaTimes, FaFileContract, FaShieldAlt } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';

const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY || import.meta.env.VITE_RECAPTCHA_SITE_KEY_V3 || '';

const SignupPage = () => {
    const navigate = useNavigate();
    const { register, loading, error: authError, isAuthenticated } = useAuth();
    const [formData, setFormData] = useState({
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        gender: '', // 'male' or 'female'
        agreeTerms: false,
        isHuman: false,
    });
    const [errors, setErrors] = useState({});
    const [showTermsModal, setShowTermsModal] = useState(false);
    const [showPrivacyModal, setShowPrivacyModal] = useState(false);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    useEffect(() => {
        if (!RECAPTCHA_SITE_KEY) return;

        if (window.grecaptcha) {
            return;
        }

        const script = document.createElement('script');
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.async = true;
        document.head.appendChild(script);
    }, []);



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

        if (!formData.isHuman) {
            newErrors.isHuman = 'Lütfen robot olmadığınızı onaylayın';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) return;

        // reCAPTCHA v3 token al
        let recaptchaToken = null;
        if (RECAPTCHA_SITE_KEY && window.grecaptcha) {
            try {
                recaptchaToken = await new Promise((resolve, reject) => {
                    window.grecaptcha.ready(() => {
                        window.grecaptcha
                            .execute(RECAPTCHA_SITE_KEY, { action: 'signup' })
                            .then(resolve)
                            .catch(reject);
                    });
                });
            } catch (err) {
                console.error('reCAPTCHA hatası:', err);
            }
        }

        // Register fonksiyonunu çağır
        const result = await register({
            username: formData.username,
            email: formData.email,
            password: formData.password,
            gender: formData.gender,
            terms_accepted: formData.agreeTerms,
            recaptcha_token: recaptchaToken,
            recaptcha_action: 'signup',
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
                        <span className="font-script text-5xl text-coral font-bold">Herkesler Soruyor</span>
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
                        <div className="space-y-3">
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
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setShowTermsModal(true);
                                            }}
                                            className="text-coral hover:underline"
                                        >
                                            Kullanım Şartları
                                        </button>
                                        {' '}ve{' '}
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setShowPrivacyModal(true);
                                            }}
                                            className="text-coral hover:underline"
                                        >
                                            Gizlilik Politikası
                                        </button>
                                        'nı okudum ve kabul ediyorum
                                    </span>
                                </label>
                                {errors.agreeTerms && <span className="text-red-500 text-sm mt-1 block">{errors.agreeTerms}</span>}
                            </div>

                            {/* Simple anti-bot check */}
                            <div>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        name="isHuman"
                                        checked={formData.isHuman}
                                        onChange={handleInputChange}
                                        className={`w-4 h-4 text-coral border-gray-300 rounded focus:ring-coral ${errors.isHuman ? 'border-red-500' : ''
                                            }`}
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        Ben bir <span className="font-semibold">robot değilim</span>.
                                    </span>
                                </label>
                                {errors.isHuman && <span className="text-red-500 text-sm mt-1 block">{errors.isHuman}</span>}
                            </div>
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

            {/* Terms Modal */}
            {showTermsModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                    <FaFileContract className="text-purple-600 dark:text-purple-400 text-xl" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Site Sözleşmesi</h2>
                            </div>
                            <button
                                onClick={() => setShowTermsModal(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <FaTimes className="text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 px-6 py-6">
                            <TermsModalContent />
                        </div>
                        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800">
                            <button
                                onClick={() => setShowTermsModal(false)}
                                className="w-full bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all"
                            >
                                Anladım
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Privacy Modal */}
            {showPrivacyModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                        <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex items-center justify-between z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                    <FaShieldAlt className="text-indigo-600 dark:text-indigo-400 text-xl" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">KVKK Aydınlatma Metni</h2>
                            </div>
                            <button
                                onClick={() => setShowPrivacyModal(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                <FaTimes className="text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-1 px-6 py-6">
                            <PrivacyModalContent />
                        </div>
                        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 bg-gray-50 dark:bg-gray-800">
                            <button
                                onClick={() => setShowPrivacyModal(false)}
                                className="w-full bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all"
                            >
                                Anladım
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Terms Modal Content Component
const TermsModalContent = () => {
    const sections = [
        {
            title: '1. Kullanım Şartları',
            content: 'Bu platforma erişim ve kullanım, aşağıdaki şartları kabul ettiğiniz anlamına gelir. Platformu kullanmaya devam ederek bu şartları kabul etmiş sayılırsınız.',
            icon: FaFileContract
        },
        {
            title: '2. Hesap Sorumluluğu',
            content: 'Hesabınızın güvenliğinden siz sorumlusunuz. Şifrenizi kimseyle paylaşmayın ve güçlü bir şifre kullanın. Hesabınız üzerinden yapılan tüm işlemlerden siz sorumlusunuz.',
            icon: FaShieldAlt
        },
        {
            title: '3. İçerik Politikası',
            content: 'Paylaştığınız içeriklerin telif hakkına sahip olduğunuzdan veya paylaşım izni aldığınızdan emin olun. Yasadışı, zararlı veya uygunsuz içerik paylaşımı yasaktır.',
            icon: FaShieldAlt
        },
        {
            title: '4. Gizlilik',
            content: 'Kişisel bilgileriniz gizlilik politikamız kapsamında korunmaktadır. Detaylı bilgi için KVKK Aydınlatma Metni\'ni inceleyebilirsiniz.',
            icon: FaShieldAlt
        },
        {
            title: '5. Hizmet Değişiklikleri',
            content: 'Platform özelliklerini, hizmetlerini veya şartlarını önceden haber vermeksizin değiştirme hakkını saklı tutar. Değişiklikler platform üzerinden duyurulur.',
            icon: FaFileContract
        },
        {
            title: '6. Hesap Askıya Alma',
            content: 'Kurallara uymayan kullanıcıların hesapları geçici veya kalıcı olarak askıya alınabilir. Bu durumda platforma erişim hakkınız kaybolur.',
            icon: FaShieldAlt
        },
        {
            title: '7. Fikri Mülkiyet',
            content: 'Platform üzerindeki tüm içerikler, tasarımlar ve yazılımlar telif hakkı ile korunmaktadır. İzinsiz kullanım yasal işlem gerektirir.',
            icon: FaShieldAlt
        },
        {
            title: '8. Sorumluluk Reddi',
            content: 'Platform, kullanıcıların paylaştığı içeriklerden sorumlu değildir. Kullanıcılar kendi içeriklerinden sorumludur ve platform bu içeriklerden kaynaklanan zararlardan sorumlu tutulamaz.',
            icon: FaShieldAlt
        }
    ];

    return (
        <div className="space-y-4">
            {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                    <div
                        key={index}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                <Icon className="text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                                    {section.title}
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    {section.content}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// Privacy Modal Content Component
const PrivacyModalContent = () => {
    const sections = [
        {
            title: 'Kişisel Verilerin İşlenmesi',
            content: 'Kişisel verileriniz, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) kapsamında işlenmektedir. Verileriniz, hizmetlerimizi sunmak, geliştirmek ve yasal yükümlülüklerimizi yerine getirmek amacıyla işlenir.',
            icon: FaShieldAlt
        },
        {
            title: 'Toplanan Veriler',
            content: 'Platformumuzda toplanan kişisel veriler şunlardır: Ad-soyad, e-posta adresi, kullanıcı adı, profil fotoğrafı, paylaştığınız içerikler, IP adresi, çerez bilgileri ve kullanım verileri.',
            icon: FaShieldAlt
        },
        {
            title: 'Verilerin Kullanım Amacı',
            content: 'Kişisel verileriniz; hesap yönetimi, içerik paylaşımı, platform güvenliği, kullanıcı deneyimini iyileştirme, yasal yükümlülüklerin yerine getirilmesi ve iletişim amaçlarıyla kullanılmaktadır.',
            icon: FaShieldAlt
        },
        {
            title: 'Verilerin Paylaşımı',
            content: 'Kişisel verileriniz, yasal yükümlülükler dışında üçüncü taraflarla paylaşılmaz. Sadece hizmet sağlayıcılarımız (hosting, analitik vb.) ile güvenli bir şekilde paylaşılır.',
            icon: FaShieldAlt
        },
        {
            title: 'Veri Güvenliği',
            content: 'Kişisel verilerinizin güvenliği için teknik ve idari tedbirler alınmaktadır. Verileriniz şifrelenmiş bağlantılar üzerinden iletilir ve güvenli sunucularda saklanır.',
            icon: FaShieldAlt
        },
        {
            title: 'Haklarınız',
            content: 'KVKK kapsamında, kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme, eksik veya yanlış işlenmişse düzeltilmesini isteme, silinmesini veya yok edilmesini isteme haklarına sahipsiniz.',
            icon: FaShieldAlt
        }
    ];

    return (
        <div className="space-y-4">
            {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                    <div
                        key={index}
                        className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-600"
                    >
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/40 rounded-lg">
                                <Icon className="text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-base font-bold text-gray-900 dark:text-white mb-1">
                                    {section.title}
                                </h3>
                                <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                    {section.content}
                                </p>
                            </div>
                        </div>
                    </div>
                );
            })}
            <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
                <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-sm">
                    Veri Sorumlusu
                </h3>
                <p className="text-xs text-gray-700 dark:text-gray-300 mb-1">
                    <strong>Veri Sorumlusu:</strong> Herkesler Soruyor Platformu
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300">
                    <strong>E-posta:</strong> kvkk@herkeslersoruyor.com
                </p>
            </div>
        </div>
    );
};

export default SignupPage;

