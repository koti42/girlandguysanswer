import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { FaTimes, FaUserSecret, FaChevronRight, FaPaperPlane, FaLightbulb, FaRobot } from 'react-icons/fa';
import { questionsAPI, categoriesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';

const QuickAskModal = ({ onClose }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const textareaRef = useRef(null);

    const [title, setTitle] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isAnonymous, setIsAnonymous] = useState(user?.last_action_is_anonymous || false);
    const [noAiAnswer, setNoAiAnswer] = useState(false);
    const [answerGenderRestriction, setAnswerGenderRestriction] = useState('');
    const [categories, setCategories] = useState([]);
    const [loadingCats, setLoadingCats] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [step, setStep] = useState(1); // 1: title, 2: category

    useEffect(() => {
        const fetchCats = async () => {
            try {
                const res = await categoriesAPI.getAll();
                setCategories(res.data.data.categories || []);
            } catch {
                // ignore
            } finally {
                setLoadingCats(false);
            }
        };
        fetchCats();
    }, []);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleTitleNext = () => {
        if (!title.trim()) { setError('Soru başlığını yazın'); return; }
        if (title.trim().length < 10) { setError('En az 10 karakter gerekli'); return; }
        setError('');
        setStep(2);
    };

    const handleCategorySelect = (cat) => {
        setSelectedCategory(cat);
        setError('');
    };

    const handleGoToDetail = () => {
        onClose();
        navigate('/ask', {
            state: {
                prefill: {
                    title: title.trim(),
                    category: selectedCategory?.name || '',
                    answer_gender_restriction: answerGenderRestriction || null,
                }
            }
        });
    };

    const handleSubmit = async () => {
        if (!selectedCategory) { setError('Bir kategori seçin'); return; }
        setIsSubmitting(true);
        setError('');
        try {
            const response = await questionsAPI.create({
                title: title.trim(),
                category: selectedCategory.name,
                is_anonymous: isAnonymous,
                allow_ai_answer: !noAiAnswer,
                answer_gender_restriction: answerGenderRestriction || null,
            });
            const questionResponse = response.data.data?.question || response.data.data;
            const slug = questionResponse?.slug || questionResponse?.id;
            const gamification = response.data?.gamification || response.data.data?.gamification;
            onClose();
            navigate('/question-submitted', {
                state: {
                    question: {
                        title: title.trim(),
                        category: selectedCategory.name,
                        tags: [],
                        is_anonymous: isAnonymous,
                        answer_gender_restriction: answerGenderRestriction || null,
                    },
                    gamification: gamification || null,
                    slug,
                },
                replace: true,
            });
        } catch (err) {
            setError(err.response?.data?.message || 'Bir hata oluştu, tekrar deneyin');
        } finally {
            setIsSubmitting(false);
        }
    };

    const titleLen = title.trim().length;
    const isTitleValid = titleLen >= 10;

    return createPortal(
        <div
            className="fixed inset-0 z-[999] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

            {/* Card */}
            <div className="relative w-full max-w-lg bg-white dark:bg-gray-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="relative bg-gradient-to-r from-coral to-orange-400 px-6 pt-5 pb-10">
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 transition-colors flex items-center justify-center text-white"
                    >
                        <FaTimes className="text-sm" />
                    </button>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <FaLightbulb className="text-white text-lg" />
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-lg leading-tight">Hızlı Soru Sor</h2>
                            <p className="text-white/70 text-xs mt-0.5">
                                {step === 1 ? 'Sorunuzu yazın' : 'Kategori seçin'}
                            </p>
                        </div>
                    </div>
                    {/* Step indicator */}
                    <div className="absolute bottom-4 left-6 flex items-center gap-2">
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? 'w-8 bg-white' : 'w-4 bg-white/40'}`} />
                        <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? 'w-8 bg-white' : 'w-4 bg-white/40'}`} />
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 pt-5 pb-6 flex flex-col gap-4 -mt-4">
                    {/* White card floating over header */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 p-4">
                        {step === 1 ? (
                            <div className="space-y-3">
                                <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Sorunuz</label>
                                <textarea
                                    ref={textareaRef}
                                    value={title}
                                    onChange={(e) => { setTitle(e.target.value); if (error) setError(''); }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleTitleNext(); }
                                    }}
                                    placeholder="Aklınızdaki soruyu yazın..."
                                    rows={3}
                                    maxLength={300}
                                    className="w-full resize-none bg-transparent text-gray-800 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-base focus:outline-none leading-relaxed"
                                />
                                <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <span className={`text-xs ${titleLen < 10 ? 'text-orange-400' : 'text-green-500'}`}>
                                        {titleLen}/300 karakter {titleLen < 10 && titleLen > 0 && `(${10 - titleLen} karakter daha)`}
                                    </span>
                                    {/* Anonymous toggle */}
                                    <button
                                        type="button"
                                        onClick={() => setIsAnonymous(p => !p)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                            isAnonymous
                                                ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 ring-1 ring-purple-300'
                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200'
                                        }`}
                                    >
                                        <FaUserSecret className="text-[11px]" />
                                        <span>{isAnonymous ? 'Gizli' : 'Anonim Değil'}</span>
                                    </button>
                                </div>
                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">Yapay zeka cevabı</span>
                                    <button
                                        type="button"
                                        onClick={() => setNoAiAnswer((p) => !p)}
                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                                            noAiAnswer
                                                ? 'bg-slate-200 dark:bg-slate-600 text-slate-800 dark:text-slate-100 ring-1 ring-slate-400'
                                                : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 ring-1 ring-sky-300/50'
                                        }`}
                                    >
                                        <FaRobot className="text-[11px]" />
                                        <span>{noAiAnswer ? 'Kapalı' : 'Açık'}</span>
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                    <button
                                        type="button"
                                        onClick={() => setAnswerGenderRestriction('')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${answerGenderRestriction === '' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                    >
                                        Herkes cevaplasın
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAnswerGenderRestriction('female')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${answerGenderRestriction === 'female' ? 'bg-pink-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                    >
                                        Sadece kadınlar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setAnswerGenderRestriction('male')}
                                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all ${answerGenderRestriction === 'male' ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}
                                    >
                                        Sadece erkekler
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kategori</label>
                                    <button
                                        onClick={() => { setStep(1); setSelectedCategory(null); }}
                                        className="text-xs text-coral hover:underline"
                                    >
                                        ← Geri
                                    </button>
                                </div>
                                {/* Question title preview */}
                                <p className="text-sm text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2 leading-snug line-clamp-2">
                                    "{title}"
                                </p>
                                {/* Selected category banner */}
                                {selectedCategory && (() => {
                                    const Icon = getCategoryIcon(selectedCategory);
                                    const color = getCategoryColor(selectedCategory);
                                    return (
                                        <div
                                            className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-sm font-semibold shadow-sm"
                                            style={{ backgroundColor: color }}
                                        >
                                            <Icon className="flex-shrink-0 text-base" />
                                            <span className="flex-1 truncate">{selectedCategory.name}</span>
                                            <span className="text-white/70 text-xs">seçildi ✓</span>
                                        </div>
                                    );
                                })()}
                                {loadingCats ? (
                                    <div className="grid grid-cols-3 gap-2 pt-1">
                                        {[...Array(9)].map((_, i) => (
                                            <div key={i} className="h-9 rounded-xl bg-gray-100 dark:bg-gray-700 animate-pulse" />
                                        ))}
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto pt-1 pr-0.5 styled-scrollbar">
                                        {categories.map(cat => {
                                            const Icon = getCategoryIcon(cat);
                                            const color = getCategoryColor(cat);
                                            const isSelected = selectedCategory?.name === cat.name;
                                            return (
                                                <button
                                                    key={cat.id || cat.name}
                                                    onClick={() => handleCategorySelect(cat)}
                                                    className={`flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs font-medium transition-all border text-left truncate ${
                                                        isSelected
                                                            ? 'text-white shadow-md scale-[1.03]'
                                                            : 'bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:scale-[1.02] hover:shadow-sm'
                                                    }`}
                                                    style={isSelected ? { backgroundColor: color, borderColor: color } : {}}
                                                >
                                                    <Icon className="flex-shrink-0 text-[11px]" style={{ color: isSelected ? 'white' : color }} />
                                                    <span className="truncate">{cat.name}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Error */}
                    {error && (
                        <p className="text-xs text-red-500 text-center font-medium -mt-1">{error}</p>
                    )}

                    {/* Actions */}
                    {step === 1 ? (
                        <div className="flex gap-3">
                            <button
                                onClick={handleGoToDetail}
                                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                            >
                                Detay Ekle
                                <FaChevronRight className="text-[11px]" />
                            </button>
                            <button
                                onClick={handleTitleNext}
                                disabled={!isTitleValid}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold text-sm hover:shadow-lg hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all"
                            >
                                Devam Et
                                <FaChevronRight className="text-[11px]" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={handleGoToDetail}
                                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-2xl border-2 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-all"
                            >
                                Detay Ekle
                                <FaChevronRight className="text-[11px]" />
                            </button>
                            <button
                                onClick={handleSubmit}
                                disabled={!selectedCategory || isSubmitting}
                                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold text-sm hover:shadow-lg hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none transition-all"
                            >
                                {isSubmitting ? (
                                    <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                                ) : (
                                    <>
                                        <FaPaperPlane className="text-xs" />
                                        Soruyu Sor!
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default QuickAskModal;
