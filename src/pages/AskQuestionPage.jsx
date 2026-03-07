import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FaTimes, FaPlus, FaCheckCircle, FaLightbulb, FaExclamationTriangle, FaSave, FaUserSecret, FaImage, FaPoll, FaArrowUp, FaArrowDown, FaMinus, FaChevronDown, FaArrowLeft, FaClock, FaFolderOpen, FaEdit, FaPaperPlane } from 'react-icons/fa';
import MainLayout from '../layouts/MainLayout';
import RichTextEditor from '../components/RichTextEditor';
import Toast from '../components/Toast';
import GifPickerModal from '../components/GifPickerModal';
import { questionsAPI, categoriesAPI, tagsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import XPToast from '../components/Gamification/XPToast';
import LevelUpModal from '../components/Gamification/LevelUpModal';
import SEO from '../components/SEO';
import { getCategoryIcon, getCategoryColor, getCategoryHexColor } from '../utils/categoryIcons';
import UserAvatar from '../components/UserAvatar';
import DOMPurify from 'dompurify';

const AskQuestionPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user: currentUser } = useAuth();
    const prefill = location.state?.prefill || {};
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [formData, setFormData] = useState({
        title: prefill.title || '',
        category: prefill.category || '',
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
    const [showPreview, setShowPreview] = useState(false);

    const [addPoll, setAddPoll] = useState(false);
    const [expiresInHours, setExpiresInHours] = useState(null);
    const [pollTitle, setPollTitle] = useState('');
    const [pollAllowMultiple, setPollAllowMultiple] = useState(false);
    const [pollEndsAt, setPollEndsAt] = useState('');
    const [pollOptions, setPollOptions] = useState([{ text: '', sort_order: 0 }, { text: '', sort_order: 1 }]);

    const [popularTags, setPopularTags] = useState([]);
    const [loadingPopularTags, setLoadingPopularTags] = useState(false);

    const [drafts, setDrafts] = useState([]);
    const [loadingDrafts, setLoadingDrafts] = useState(false);
    const [showDraftsModal, setShowDraftsModal] = useState(false);
    const [editingDraftId, setEditingDraftId] = useState(null);
    const [publishingDraftId, setPublishingDraftId] = useState(null);

    const loadDrafts = async () => {
        try {
            setLoadingDrafts(true);
            const res = await questionsAPI.getDrafts();
            setDrafts(res.data?.data?.drafts || []);
        } catch (err) {
            console.error('Taslaklar yüklenemedi:', err);
        } finally {
            setLoadingDrafts(false);
        }
    };

    useEffect(() => {
        loadDrafts();
    }, []);

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

    const handleSaveDraft = async () => {
        if (!formData.title.trim()) {
            showToast('warning', 'Taslağı kaydetmek için en azından bir başlık girin');
            return;
        }
        try {
            setIsSubmitting(true);
            const payload = {
                title: formData.title.trim(),
                category: formData.category || undefined,
                description: formData.description || null,
                tags: formData.tags,
                is_anonymous: isAnonymous,
                gif_url: gifUrl || null,
                is_draft: true,
            };
            if (editingDraftId) {
                await questionsAPI.updateDraft(editingDraftId, payload);
                showToast('success', 'Taslak güncellendi.');
                setEditingDraftId(null);
            } else {
                await questionsAPI.create(payload);
                showToast('success', 'Taslak kaydedildi.');
            }
            await loadDrafts();
        } catch (err) {
            showToast('error', err.response?.data?.message || 'Taslak kaydedilemedi.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const loadDraftIntoForm = (draft) => {
        setFormData({
            title: draft.title || '',
            category: draft.category?.name || draft.category || '',
            description: draft.description || '',
            tags: Array.isArray(draft.tags) ? draft.tags : [],
        });
        setIsAnonymous(!!draft.is_anonymous);
        setGifUrl(draft.gif_url || null);
        setShowDraftsModal(false);
        setEditingDraftId(draft.id);
    };

    const handlePublishDraft = async (draft) => {
        try {
            setPublishingDraftId(draft.id);
            const response = await questionsAPI.publishDraft(draft.id);
            const questionResponse = response.data.data?.question || response.data.data;
            const slug = questionResponse?.slug || questionResponse?.id;
            const gamification = response.data?.gamification || response.data.data?.gamification;
            setShowDraftsModal(false);
            setDrafts(prev => prev.filter(d => d.id !== draft.id));
            navigate('/question-submitted', {
                state: {
                    question: {
                        title: questionResponse?.title || draft.title,
                        category: questionResponse?.category?.name || draft.category?.name || draft.category,
                        tags: questionResponse?.tags || draft.tags || [],
                        is_anonymous: questionResponse?.is_anonymous ?? draft.is_anonymous,
                    },
                    gamification: gamification || null,
                    slug: slug,
                },
                replace: true,
            });
        } catch (err) {
            showToast('error', err.response?.data?.message || 'Soru yayınlanamadı.');
        } finally {
            setPublishingDraftId(null);
        }
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

    const doSubmit = async () => {
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
            if (expiresInHours) {
                payload.expires_in_hours = expiresInHours;
            }

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

            const gamification = response.data.data?.gamification;

            setEditingDraftId(null);

            const questionResponse = response.data.data?.question || response.data.data;
            const slug = questionResponse?.slug || questionResponse?.id;

            navigate('/question-submitted', {
                state: {
                    question: {
                        title: formData.title,
                        category: formData.category,
                        tags: formData.tags,
                        is_anonymous: isAnonymous,
                    },
                    gamification: gamification || null,
                    slug: slug,
                },
                replace: true,
            });
        } catch (error) {
            showToast('error', error.response?.data?.message || 'Soru yayınlanırken bir hata oluştu');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!validateForm()) {
            showToast('error', 'Lütfen tüm zorunlu alanları doldurun');
            return;
        }
        setShowPreview(true);
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

    const categoryForPreview = categories.find(c => c.name === formData.category);
    const previewCategoryColor = categoryForPreview?.color ? getCategoryColor(categoryForPreview) : getCategoryHexColor(formData.category);
    const PreviewCard = () => (
        <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-200/50 dark:border-gray-700/50">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-4">Soru önizlemesi — Sorulduğunda böyle görünecek</p>
            <div className="rounded-2xl border border-gray-200 dark:border-gray-600 overflow-hidden bg-white dark:bg-gray-800 shadow-lg">
                <div className="p-4 md:p-6 space-y-4">
                    <div className="flex items-center gap-3">
                        <UserAvatar
                            user={isAnonymous ? { username: 'anonim', name: 'Gizli Üye' } : currentUser}
                            size="md"
                            className="ring-2 ring-white dark:ring-gray-700"
                        />
                        <div>
                            <p className="font-bold text-gray-900 dark:text-white">
                                {isAnonymous ? 'Gizli Üye' : (currentUser?.username || 'Kullanıcı')}
                            </p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                {formData.category && (
                                    <span
                                        style={{ backgroundColor: previewCategoryColor }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold"
                                    >
                                        {React.createElement(getCategoryIcon(formData.category), { className: 'text-sm' })}
                                        {formData.category}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-gray-800 dark:text-gray-100 leading-snug">
                        {formData.title}
                    </h2>
                    {formData.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {formData.tags.map((tag, idx) => (
                                <span key={idx} className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                                    {tag.startsWith('#') ? tag : `#${tag}`}
                                </span>
                            ))}
                        </div>
                    )}
                    {formData.description && (
                        <div
                            className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
                            dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(formData.description, {
                                    ALLOWED_TAGS: ['div', 'p', 'br', 'b', 'strong', 'i', 'em', 'u', 'ul', 'ol', 'li', 'a', 'span', 'img'],
                                    ALLOWED_ATTR: ['href', 'target', 'src', 'alt', 'class', 'style']
                                })
                            }}
                        />
                    )}
                    {gifUrl && (
                        <div className="rounded-xl overflow-hidden">
                            <img src={gifUrl} alt="GIF" className="w-full max-w-sm h-auto object-contain rounded-xl" />
                        </div>
                    )}
                    {addPoll && (() => {
                        const filled = pollOptions.filter(o => o.text.trim());
                        if (filled.length < 2) return null;
                        return (
                            <div className="pt-2 border-t border-gray-100 dark:border-gray-600">
                                <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mb-2 flex items-center gap-1.5">
                                    <FaPoll /> Anket {pollTitle.trim() && `— ${pollTitle.trim()}`}
                                </p>
                                <ul className="space-y-1.5">
                                    {filled.map((opt, i) => (
                                        <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                            <span className="w-5 h-5 rounded border border-gray-300 dark:border-gray-500 flex items-center justify-center text-xs">{i + 1}</span>
                                            {opt.text.trim()}
                                        </li>
                                    ))}
                                </ul>
                                {pollEndsAt && (
                                    <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                                        Bitiş: {new Date(pollEndsAt).toLocaleString('tr-TR')}
                                    </p>
                                )}
                            </div>
                        );
                    })()}
                    {expiresInHours && (
                        <div className="pt-2 border-t border-gray-100 dark:border-gray-600 mt-2">
                            <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                                <FaClock /> Süreli soru: {expiresInHours < 24 ? `${expiresInHours} saat` : `${Math.floor(expiresInHours / 24)} gün`} sonra siteden kaldırılacak
                            </p>
                        </div>
                    )}
                </div>
                <div className="px-4 md:px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-100 dark:border-gray-600 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">0 beğeni · 0 cevap</span>
                </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
                <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    disabled={isSubmitting}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all disabled:opacity-50"
                >
                    <FaArrowLeft />
                    Geri Düzenle
                </button>
                <button
                    type="button"
                    onClick={doSubmit}
                    disabled={isSubmitting}
                    className="w-full sm:flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-semibold hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                >
                    {isSubmitting ? (
                        <>
                            <FaCheckCircle className="animate-spin" />
                            Yayınlanıyor...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle />
                            Soruyu Gönder
                        </>
                    )}
                </button>
            </div>
        </div>
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
                        <h1 className="text-3xl md:text-4xl font-bold mb-3 drop-shadow-lg">
                            {showPreview ? 'Soru önizlemesi' : 'Soru Sor 💡'}
                        </h1>
                        <p className="text-white/95 text-lg">
                            {showPreview ? 'Onaylıyorsan soruyu gönder, değiştirmek için geri dön' : 'Topluluğa sormak istediğin soruyu detaylı bir şekilde anlat'}
                        </p>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>
                </div>

                {showPreview ? (
                    <PreviewCard />
                ) : (
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
                                                    <span>{item.tag.startsWith('#') ? item.tag : `#${item.tag}`}</span>
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
                            <span className="text-gray-400 dark:text-gray-500 text-sm block mt-2">Metin editörü ile zengin içerik oluşturabilirsiniz. Kullanıcı etiketlemek için @kullanıcıadı yazın.</span>
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

                        {/* Süreli soru */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                <FaClock className="inline mr-2" /> Süreli soru (opsiyonel)
                            </label>
                            <select
                                value={expiresInHours ?? ''}
                                onChange={(e) => setExpiresInHours(e.target.value ? parseInt(e.target.value, 10) : null)}
                                className="w-full px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20"
                            >
                                <option value="">Süre yok</option>
                                <option value="1">1 saat</option>
                                <option value="3">3 saat</option>
                                <option value="6">6 saat</option>
                                <option value="12">12 saat</option>
                                <option value="24">24 saat (1 gün)</option>
                                <option value="72">3 gün</option>
                                <option value="168">7 gün</option>
                            </select>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Süre dolunca soru siteden kaldırılır</p>
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
                            {drafts.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setShowDraftsModal(true)}
                                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-indigo-300 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-all"
                                >
                                    <FaFolderOpen />
                                    Kayıtlı taslaklar ({drafts.length})
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleSaveDraft}
                                disabled={isSubmitting}
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl border-2 border-coral text-coral font-semibold hover:bg-coral/10 dark:hover:bg-coral/20 transition-all disabled:opacity-50"
                            >
                                <FaSave />
                                {editingDraftId ? 'Taslağı Güncelle' : 'Taslak Kaydet'}
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
                )}

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

                {showDraftsModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowDraftsModal(false)}>
                        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700" onClick={e => e.stopPropagation()}>
                            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                    <FaFolderOpen className="text-indigo-500" />
                                    Kayıtlı taslaklar
                                </h2>
                                <button type="button" onClick={() => setShowDraftsModal(false)} className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    <FaTimes />
                                </button>
                            </div>
                            <div className="p-6 overflow-y-auto flex-1">
                                {loadingDrafts ? (
                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">Yükleniyor...</p>
                                ) : drafts.length === 0 ? (
                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">Kayıtlı taslak yok.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {drafts.map((draft) => {
                                            const categoryName = draft.category?.name || draft.category || '';
                                            const categoryColor = categoryName && categories.find(c => c.name === categoryName) ? getCategoryHexColor(categoryName) : '#6B7280';
                                            return (
                                                <div
                                                    key={draft.id}
                                                    className="rounded-2xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 p-4 hover:border-indigo-300 dark:hover:border-indigo-500 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="min-w-0 flex-1">
                                                            <h3 className="font-bold text-gray-900 dark:text-white truncate">{draft.title}</h3>
                                                            {categoryName && (
                                                                <span
                                                                    className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                                                    style={{ backgroundColor: categoryColor }}
                                                                >
                                                                    {categoryName}
                                                                </span>
                                                            )}
                                                            {draft.updated_at && (
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                                    Son düzenleme: {new Date(draft.updated_at).toLocaleDateString('tr-TR')}
                                                                </p>
                                                            )}
                                                            {draft.description && (
                                                                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                                                                    {DOMPurify.sanitize(String(draft.description), { ALLOWED_TAGS: [] }).slice(0, 120)}
                                                                    {String(draft.description).length > 120 ? '…' : ''}
                                                                </p>
                                                            )}
                                                        </div>
                                                        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
                                                            <button
                                                                type="button"
                                                                onClick={() => loadDraftIntoForm(draft)}
                                                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
                                                            >
                                                                <FaEdit /> Düzenle
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => handlePublishDraft(draft)}
                                                                disabled={publishingDraftId === draft.id || (draft.title?.length || 0) < 10 || !(draft.category || draft.category_id)}
                                                                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white text-sm font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {publishingDraftId === draft.id ? (
                                                                    <FaCheckCircle className="animate-spin" />
                                                                ) : (
                                                                    <FaPaperPlane />
                                                                )}
                                                                Bu soruyu sor
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

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
