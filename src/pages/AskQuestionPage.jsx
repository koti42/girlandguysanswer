import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTimes, FaPlus, FaCheckCircle, FaLightbulb, FaExclamationTriangle, FaSave, FaUserSecret, FaImage } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import RichTextEditor from '../components/RichTextEditor';
import Toast from '../components/Toast';
import GifPickerModal from '../components/GifPickerModal';
import { categories } from '../data/mockData';
import { questionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import XPToast from '../components/Gamification/XPToast';
import LevelUpModal from '../components/Gamification/LevelUpModal';

const AskQuestionPage = () => {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [formData, setFormData] = useState({
        title: '',
        category: '',
        description: '',
        tags: []
    });
    const [tagInput, setTagInput] = useState('');
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toast, setToast] = useState(null);
    const [isAnonymous, setIsAnonymous] = useState(currentUser?.last_action_is_anonymous || false);
    const [gifUrl, setGifUrl] = useState(null);
    const [showGifPicker, setShowGifPicker] = useState(false);
    const [gamificationFeedback, setGamificationFeedback] = useState(null);
    const [showLevelUp, setShowLevelUp] = useState(null);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: '' }));
        }
    };

    const handleAddTag = () => {
        if (tagInput.trim() && formData.tags.length < 5) {
            const newTag = tagInput.trim().startsWith('#') ? tagInput.trim() : `#${tagInput.trim()}`;
            if (!formData.tags.includes(newTag)) {
                setFormData(prev => ({
                    ...prev,
                    tags: [...prev.tags, newTag]
                }));
            }
            setTagInput('');
        }
    };

    const handleRemoveTag = (tagToRemove) => {
        setFormData(prev => ({
            ...prev,
            tags: prev.tags.filter(tag => tag !== tagToRemove)
        }));
    };

    const showToast = (type, message) => {
        setToast({ type, message });
    };

    const handleSaveDraft = () => {
        if (!formData.title.trim()) {
            showToast('warning', 'Taslağı kaydetmek için en azından bir başlık girin');
            return;
        }
        localStorage.setItem('questionDraft', JSON.stringify(formData));
        showToast('success', 'Taslak başarıyla kaydedildi!');
    };

    const validateForm = () => {
        const newErrors = {};
        if (!formData.title.trim()) {
            newErrors.title = 'Soru başlığı zorunludur';
        } else if (formData.title.length < 10) {
            newErrors.title = 'Soru başlığı en az 10 karakter olmalıdır';
        }
        if (!formData.category) {
            newErrors.category = 'Kategori seçimi zorunludur';
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validateForm()) {
            showToast('error', 'Lütfen tüm zorunlu alanları doldurun');
            return;
        }

        setIsSubmitting(true);

        try {
            const payload = {
                title: formData.title,
                category: formData.category,
                description: formData.description || null,
                tags: formData.tags,
                is_anonymous: isAnonymous,
                gif_url: gifUrl || null
            };



            const response = await questionsAPI.create(payload);

            // Gamification Feedback
            const gamification = response.data.data?.gamification;
            let delay = 1000;

            if (gamification) {
                if (gamification.points_added > 0) {
                    setGamificationFeedback({
                        points: gamification.points_added,
                        reason: 'Soru Sorma'
                    });
                    delay = 2500; // Wait longer to show toast
                }

                if (gamification.leveled_up) {
                    setShowLevelUp(gamification.new_level);
                    delay = 3000; // Wait longer for modal
                }
            }

            showToast('success', 'Sorunuz başarıyla yayınlandı!');
            localStorage.removeItem('questionDraft');

            setTimeout(() => {
                navigate('/questions');
            }, delay);
        } catch (error) {
            showToast('error', error.response?.data?.message || 'Soru yayınlanırken bir hata oluştu');
        } finally {
            setIsSubmitting(false);
        }
    };

    const TipsWidget = () => (
        <div className="relative bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-3xl shadow-xl p-6 border border-purple-100 dark:border-purple-800/30 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-indigo-400/20 dark:from-purple-600/10 dark:to-indigo-600/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-white relative z-10">
                <div className="p-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl">
                    <FaLightbulb className="text-white text-lg" />
                </div>
                İpuçları
            </h3>
            <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300 relative z-10">
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">💡</span>
                    <span>Başlığınızı açık ve net yazın</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">🎯</span>
                    <span>Doğru kategori seçimi önemli</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">🏷️</span>
                    <span>Etiketler sorunuzun bulunmasını kolaylaştırır</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">🖼️</span>
                    <span>Görsel eklemek daha fazla ilgi çeker</span>
                </li>
            </ul>
        </div>
    );

    const RulesWidget = () => (
        <div className="relative bg-gradient-to-br from-coral-50 to-orange-50 dark:from-coral-900/20 dark:to-orange-900/20 rounded-3xl shadow-xl p-6 border border-coral-100 dark:border-coral-800/30 overflow-hidden">
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-coral-400/20 to-orange-400/20 dark:from-coral-600/10 dark:to-orange-600/10 rounded-full -ml-16 -mb-16 blur-2xl"></div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-white relative z-10">
                <div className="p-2 bg-gradient-to-r from-orange-400 to-red-400 rounded-xl">
                    <FaExclamationTriangle className="text-white text-lg" />
                </div>
                Topluluk Kuralları
            </h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 relative z-10">
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Saygılı ve nazik olun</span>
                </li>
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Spam yapmayın</span>
                </li>
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Kişisel bilgi paylaşmayın</span>
                </li>
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Açık ve dürüst olun</span>
                </li>
            </ul>
        </div>
    );

    const SidebarContent = (
        <>
            <TipsWidget />
            <RulesWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-6">
                {/* Header with animated gradient */}
                <div className="relative bg-gradient-to-r from-coral via-orange-400 to-pink-400 rounded-3xl p-8 md:p-10 text-white shadow-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 via-transparent to-blue-600/20 animate-pulse"></div>
                    <div className="relative z-10">
                        <h1 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-lg">Soru Sor 💡</h1>
                        <p className="text-white/95 text-lg">Topluluğa sormak istediğin soruyu detaylı bir şekilde anlat</p>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Main Form Card with glassmorphism */}
                    <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-200/50 dark:border-gray-700/50">
                        {/* Title */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Soru Başlığı <span className="text-coral">*</span>
                            </label>
                            <input
                                type="text"
                                name="title"
                                value={formData.title}
                                onChange={handleInputChange}
                                placeholder="Örn: Yaz düğünü için hangi renk abiye önerirsiniz?"
                                className={`w-full px-4 py-3 rounded-xl border ${errors.title ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                    } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                                maxLength={200}
                            />
                            <div className="flex justify-between mt-2">
                                {errors.title && <span className="text-red-500 text-sm">{errors.title}</span>}
                                <span className="text-gray-400 dark:text-gray-500 text-sm ml-auto">{formData.title.length}/200</span>
                            </div>
                        </div>

                        {/* Category */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Kategori <span className="text-coral">*</span>
                            </label>
                            <select
                                name="category"
                                value={formData.category}
                                onChange={handleInputChange}
                                className={`w-full px-4 py-3 rounded-xl border ${errors.category ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                    } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                            >
                                <option value="">Kategori seçin...</option>
                                {categories.map(cat => (
                                    <option key={cat.id} value={cat.title}>{cat.title}</option>
                                ))}
                            </select>
                            {errors.category && <span className="text-red-500 text-sm mt-2 block">{errors.category}</span>}
                        </div>

                        {/* Tags */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Etiketler <span className="text-gray-400 font-normal">(En fazla 5)</span>
                            </label>
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="text"
                                    value={tagInput}
                                    onChange={(e) => setTagInput(e.target.value)}
                                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                    placeholder="Etiket ekle..."
                                    className="flex-1 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all"
                                    disabled={formData.tags.length >= 5}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddTag}
                                    disabled={formData.tags.length >= 5 || !tagInput.trim()}
                                    className="px-4 py-2 bg-coral text-white rounded-xl hover:bg-coral/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <FaPlus /> Ekle
                                </button>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {formData.tags.map((tag, idx) => (
                                    <span key={idx} className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-full text-sm flex items-center gap-2">
                                        {tag}
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveTag(tag)}
                                            className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <FaTimes />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Açıklama <span className="text-gray-400 font-normal">(Opsiyonel)</span>
                            </label>
                            <RichTextEditor
                                value={formData.description}
                                onChange={(value) => setFormData(prev => ({ ...prev, description: value }))}
                                placeholder="Sorunuzla ilgili daha fazla detay paylaşabilirsiniz..."
                            />
                            <span className="text-gray-400 dark:text-gray-500 text-sm block mt-2">Metin editörü ile zengin içerik oluşturabilirsiniz</span>
                        </div>

                        {/* GIF */}
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">GIF (isteğe bağlı)</span>
                                <button
                                    type="button"
                                    onClick={() => setShowGifPicker(true)}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-all text-sm font-medium"
                                >
                                    <FaImage /> GIF Seç
                                </button>
                            </div>

                            {gifUrl && (
                                <div className="relative inline-block">
                                    <img src={gifUrl} alt="GIF" className="max-w-xs rounded-xl shadow-sm" />
                                    <button
                                        type="button"
                                        onClick={() => setGifUrl(null)}
                                        className="absolute top-2 right-2 bg-black/60 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
                                    >
                                        <FaTimes className="text-xs" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Anonymous Toggle */}
                        <div className="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-700/30">
                            <button
                                type="button"
                                onClick={() => setIsAnonymous(!isAnonymous)}
                                disabled={isSubmitting}
                                className={`flex items-center gap-3 px-5 py-3 rounded-xl font-semibold transition-all ${isAnonymous
                                    ? 'bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-purple-300 dark:border-purple-600 hover:border-purple-400'
                                    }`}
                            >
                                <FaUserSecret className="text-xl" />
                                <span>{isAnonymous ? 'Gizli soru' : 'Gizli Üye olarak sor'}</span>
                            </button>
                            <p className="text-sm text-purple-700 dark:text-purple-300">
                                {isAnonymous ? '🎭 Kimliğiniz gizli kalacak' : '👤 Herkese açık olarak sorulacak'}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                className="flex items-center gap-2 px-6 py-3 rounded-xl border-2 border-coral text-coral font-semibold hover:bg-coral/10 dark:hover:bg-coral/20 transition-all"
                            >
                                <FaSave />
                                Taslak Kaydet
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                            >
                                {isSubmitting ? (
                                    <span className="flex items-center gap-2 justify-center">
                                        <FaCheckCircle className="animate-spin" />
                                        Yayınlanıyor...
                                    </span>
                                ) : (
                                    'Yayınla'
                                )}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Toast Notification */}
                {toast && (
                    <Toast
                        type={toast.type}
                        message={toast.message}
                        onClose={() => setToast(null)}
                    />
                )}

                <GifPickerModal
                    isOpen={showGifPicker}
                    onClose={() => setShowGifPicker(false)}
                    onSelect={(url) => {
                        setGifUrl(url);
                        setShowGifPicker(false);
                    }}
                    title="Soru için GIF seç"
                />

                {/* Gamification Feedback */}
                {gamificationFeedback && (
                    <XPToast points={gamificationFeedback.points} reason={gamificationFeedback.reason} />
                )}

                {showLevelUp && (
                    <LevelUpModal
                        newLevel={showLevelUp}
                        onClose={() => {
                            setShowLevelUp(null);
                            navigate('/questions');
                        }}
                    />
                )}
            </div>
        </MainLayout>
    );
};

export default AskQuestionPage;
