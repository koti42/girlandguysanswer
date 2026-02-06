import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaTimes, FaPlus, FaCheckCircle, FaLightbulb, FaExclamationTriangle, FaSave, FaUserSecret, FaImage, FaPoll, FaArrowUp, FaArrowDown, FaMinus, FaChevronDown } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import RichTextEditor from '../components/RichTextEditor';
import Toast from '../components/Toast';
import GifPickerModal from '../components/GifPickerModal';
import { questionsAPI, categoriesAPI, tagsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import XPToast from '../components/Gamification/XPToast';
import LevelUpModal from '../components/Gamification/LevelUpModal';
import SEO from '../components/SEO';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

const AskQuestionPage = () => {
    const navigate = useNavigate();
    const { user: currentUser } = useAuth();
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
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

    const [addPoll, setAddPoll] = useState(false);
    const [pollTitle, setPollTitle] = useState('');
    const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
    const [pollEndsAt, setPollEndsAt] = useState('');
    const [pollOptions, setPollOptions] = useState([{ text: '', sort_order: 0 }, { text: '', sort_order: 1 }]);

    const [popularTags, setPopularTags] = useState([]);
    const [loadingPopularTags, setLoadingPopularTags] = useState(false);

    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setLoadingCategories(true);
                const response = await categoriesAPI.getAll();
                setCategories(response.data.data.categories || []);
            } catch (error) {
                console.error('Kategoriler yüklenirken hata:', error);
                // Hata durumunda taslakları dene
            } finally {
                setLoadingCategories(false);
            }
        };

        fetchCategories();
    }, []);

    useEffect(() => {
        const fetchPopularTags = async () => {
            try {
                setLoadingPopularTags(true);
                const response = await tagsAPI.getPopular({ limit: 6, period_days: 14 });
                const data = response.data?.data;
                setPopularTags(data?.tags || []);
            } catch (err) {
                console.error('Popüler etiketler yüklenirken hata:', err);
            } finally {
                setLoadingPopularTags(false);
            }
        };
        fetchPopularTags();
    }, []);

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

    const handleAddPopularTag = (tagName) => {
        const normalized = tagName.startsWith('#') ? tagName : `#${tagName}`;
        if (formData.tags.length >= 5 || formData.tags.includes(normalized)) return;
        setFormData(prev => ({ ...prev, tags: [...prev.tags, normalized] }));
    };

    const showToast = (type, message) => {
        setToast({ type, message });
    };

    const uploadImage = async (file) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await questionsAPI.editorUpload(formData);
            return response.data.data.url;
        } catch (error) {
            console.error('Resim yüklenirken hata:', error);
            showToast('error', 'Resim yüklenirken bir hata oluştu');
            return null;
        }
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
        if (addPoll) {
            const filledOptions = pollOptions.filter(o => o.text.trim());
            if (filledOptions.length < 2) {
                newErrors.poll = 'Anket için en az 2 seçenek girin';
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const addPollOption = () => {
        if (pollOptions.length >= 10) return;
        setPollOptions(prev => [...prev, { text: '', sort_order: prev.length }]);
    };

    const removePollOption = (index) => {
        if (pollOptions.length <= 2) return;
        setPollOptions(prev => prev.filter((_, i) => i !== index).map((o, i) => ({ ...o, sort_order: i })));
    };

    const updatePollOption = (index, text) => {
        setPollOptions(prev => prev.map((o, i) => i === index ? { ...o, text } : o));
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

            if (addPoll) {
                const filledOptions = pollOptions.filter(o => o.text.trim()).map((o, i) => ({ text: o.text.trim(), sort_order: i }));
                if (filledOptions.length >= 2) {
                    payload.poll = {
                        title: pollTitle.trim() || null,
                        allow_multiple: pollAllowMultiple,
                        options: filledOptions
                    };
                    if (pollEndsAt.trim()) {
                        const endDate = new Date(pollEndsAt);
                        if (!isNaN(endDate.getTime())) payload.poll.ends_at = endDate.toISOString();
                    }
                }
            }

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
            <SEO
                title="Soru Sor - Herkesler Soruyor"
                description="Topluluğa yeni bir soru sor, fikir al ve tartışma başlat."
            />
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
                            <div className="relative">
                                <select
                                    name="category"
                                    value={formData.category}
                                    onChange={handleInputChange}
                                    disabled={loadingCategories}
                                    className={`w-full px-4 py-3 pr-10 rounded-xl border appearance-none bg-white dark:bg-gray-700 ${errors.category ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                        } dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all disabled:opacity-50`}
                                >
                                    <option value="">{loadingCategories ? 'Kategoriler yükleniyor...' : 'Kategori seçin...'}</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-gray-500 dark:text-gray-400">
                                    <FaChevronDown className="text-sm" />
                                </div>
                            </div>
                            {errors.category && <span className="text-red-500 text-sm mt-2 block">{errors.category}</span>}
                        </div>

                        {/* Tags */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Etiketler <span className="text-gray-400 font-normal">(En fazla 5)</span>
                            </label>
                            {popularTags.length > 0 && (
                                <div className="mb-3">
                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Trendler — tıklayarak ekle</p>
                                    <div className="flex flex-wrap gap-2">
                                        {popularTags.map((item, idx) => {
                                            const tagWithHash = item.tag.startsWith('#') ? item.tag : `#${item.tag}`;
                                            const isAdded = formData.tags.includes(tagWithHash);
                                            const canAdd = formData.tags.length < 5 && !isAdded;
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => canAdd && handleAddPopularTag(item.tag)}
                                                    disabled={!canAdd}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${canAdd ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-coral/20 hover:text-coral dark:hover:bg-coral/20 dark:hover:text-coral' : 'bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-default'}`}
                                                >
                                                    <span>#{item.tag}</span>
                                                    {item.trend === 'up' && <FaArrowUp className="text-green-500 text-xs" title="Yükseliş" />}
                                                    {item.trend === 'down' && <FaArrowDown className="text-red-500 text-xs" title="Düşüş" />}
                                                    {item.trend === 'same' && <FaMinus className="text-gray-400 text-xs" title="Değişmedi" />}
                                                    <span className="text-gray-400 dark:text-gray-500 text-xs">({item.count})</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                            {loadingPopularTags && (
                                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Trend etiketler yükleniyor...</p>
                            )}
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
                                uploadImage={uploadImage}
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

                        {/* Anket (Poll) - Opsiyonel */}
                        <div className="mb-6">
                            <button
                                type="button"
                                onClick={() => setAddPoll(!addPoll)}
                                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-semibold transition-all ${addPoll ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-2 border-indigo-300' : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
                            >
                                <FaPoll />
                                {addPoll ? 'Anketi kaldır' : 'Anket ekle'}
                            </button>
                            {addPoll && (
                                <div className="mt-4 p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800 space-y-4">
                                    <input
                                        type="text"
                                        value={pollTitle}
                                        onChange={(e) => setPollTitle(e.target.value)}
                                        placeholder="Anket başlığı (opsiyonel)"
                                        maxLength={255}
                                        className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={pollAllowMultiple}
                                            onChange={(e) => setPollAllowMultiple(e.target.checked)}
                                            className="rounded text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Çoklu seçim izni ver</span>
                                    </label>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Bitiş tarihi (opsiyonel)</label>
                                        <input
                                            type="datetime-local"
                                            value={pollEndsAt}
                                            onChange={(e) => setPollEndsAt(e.target.value)}
                                            min={new Date().toISOString().slice(0, 16)}
                                            className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Seçenekler (en az 2, en fazla 10)</span>
                                            <button type="button" onClick={addPollOption} disabled={pollOptions.length >= 10} className="text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:underline disabled:opacity-50">+ Ekle</button>
                                        </div>
                                        {pollOptions.map((opt, index) => (
                                            <div key={index} className="flex gap-2 mb-2">
                                                <input
                                                    type="text"
                                                    value={opt.text}
                                                    onChange={(e) => updatePollOption(index, e.target.value)}
                                                    placeholder={`Seçenek ${index + 1}`}
                                                    maxLength={255}
                                                    className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                />
                                                <button type="button" onClick={() => removePollOption(index)} disabled={pollOptions.length <= 2} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-50">
                                                    <FaTimes />
                                                </button>
                                            </div>
                                        ))}
                                        {errors.poll && <span className="text-red-500 text-sm">{errors.poll}</span>}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Anonymous Toggle */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-0 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-700/30">
                            <button
                                type="button"
                                onClick={() => setIsAnonymous(!isAnonymous)}
                                disabled={isSubmitting}
                                className={`w-full sm:w-auto flex items-center justify-center sm:justify-start gap-3 px-5 py-3 rounded-xl font-semibold transition-all ${isAnonymous
                                    ? 'bg-gradient-to-r from-purple-500 to-purple-700 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-2 border-purple-300 dark:border-purple-600 hover:border-purple-400'
                                    }`}
                            >
                                <FaUserSecret className="text-xl" />
                                <span>{isAnonymous ? 'Gizli soru' : 'Gizli Üye olarak sor'}</span>
                            </button>
                            <p className="text-sm text-purple-700 dark:text-purple-300 text-center sm:text-right">
                                {isAnonymous ? '🎭 Kimliğiniz gizli kalacak' : '👤 Herkese açık olarak sorulacak'}
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-4">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="w-full sm:w-auto px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            >
                                İptal
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-coral text-coral font-semibold hover:bg-coral/10 dark:hover:bg-coral/20 transition-all"
                            >
                                <FaSave />
                                Taslak Kaydet
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="w-full sm:flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
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
