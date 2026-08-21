import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import RichTextEditor from '../components/RichTextEditor';
import { storiesAPI } from '../services/api';
import { FaArrowLeft, FaLightbulb, FaExclamationTriangle, FaCheckCircle, FaSave } from 'react-icons/fa';
import { notificationToast } from '../utils/notificationToast';
import SEO from '../components/SEO';
import { buildStoryPath } from '../utils/storyUrl';

const DRAFT_KEY = 'storyDraft';

const CreateStoryPage = () => {
    const navigate = useNavigate();
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [allowComments, setAllowComments] = useState(true);
    const [errors, setErrors] = useState({});
    const [isSubmitting, setIsSubmitting] = useState(false);
    const draftSaveTimerRef = useRef(null);

    useEffect(() => {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const draft = JSON.parse(raw);
            if (draft?.title) setTitle(draft.title);
            if (draft?.content) setContent(draft.content);
            if (typeof draft?.allowComments === 'boolean') setAllowComments(draft.allowComments);
        } catch {
            // ignore
        }
    }, []);

    useEffect(() => {
        if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        draftSaveTimerRef.current = setTimeout(() => {
            try {
                const hasAny = (title?.trim()?.length ?? 0) > 0 || (content?.trim()?.length ?? 0) > 0;
                if (!hasAny) {
                    localStorage.removeItem(DRAFT_KEY);
                    return;
                }
                localStorage.setItem(DRAFT_KEY, JSON.stringify({ title, content, allowComments, savedAt: Date.now() }));
            } catch {
                // ignore
            }
        }, 350);

        return () => {
            if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
        };
    }, [title, content, allowComments]);

    const validate = () => {
        const e = {};
        const t = title.trim();
        const c = content.replace(/<[^>]*>/g, '').trim();
        if (t.length < 3) e.title = 'Başlık en az 3 karakter olmalı';
        if (t.length > 255) e.title = 'Başlık en fazla 255 karakter olmalı';
        if (c.length < 20) e.content = 'Hikaye en az 20 karakter olmalı';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const response = await storiesAPI.create({
                title: title.trim(),
                content: content.trim() || '<p></p>',
                allow_comments: allowComments,
            });
            const op = response.data?.data?.story;
            if (op?.id) {
                notificationToast.success('Hikayen başarıyla yayınlandı!');
                localStorage.removeItem(DRAFT_KEY);
                navigate(buildStoryPath(op));
            } else {
                localStorage.removeItem(DRAFT_KEY);
                navigate('/stories');
            }
        } catch (err) {
            const msg = err.response?.data?.message || 'Yayınlama başarısız.';
            notificationToast.error(msg);
            if (err.response?.data?.errors) {
                setErrors(prev => ({ ...prev, ...err.response.data.errors }));
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const uploadEditorImage = async (file) => {
        const formData = new FormData();
        formData.append('file', file);

        const normalizeUrl = (u) => {
            if (!u) return u;
            const raw = String(u).trim().replace(/^['"]|['"]$/g, '');

            if (raw.startsWith('http://') || raw.startsWith('https://')) {
                try {
                    const parsed = new URL(raw);
                    const host = parsed.host;
                    if (parsed.pathname.startsWith(`/${host}/`)) {
                        parsed.pathname = parsed.pathname.replace(`/${host}`, '');
                        return parsed.toString();
                    }
                } catch {
                    // ignore
                }
                return raw;
            }

            if (raw.startsWith('//')) return `https:${raw}`;
            if (raw.startsWith('/')) return `${window.location.origin}${raw}`;
            // domain/path (no protocol) -> https://domain/path
            if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw)) return `https://${raw}`;
            return `${window.location.origin}/${raw}`;
        };

        try {
            const res = await storiesAPI.editorUpload(formData);
            if (res.data?.success === false) {
                throw new Error(res.data?.message || 'Görsel yüklenemedi.');
            }
            const url = res.data?.data?.url;
            if (!url) throw new Error('Görsel URL alınamadı.');
            return normalizeUrl(url);
        } catch (err) {
            const apiMessage =
                err?.response?.data?.errors?.file?.[0] ||
                err?.response?.data?.message ||
                err?.message ||
                'Görsel yüklenemedi.';
            notificationToast.error(apiMessage);
            return null;
        }
    };

    // Sidebar Widgets
    const TipsWidget = () => (
        <div className="relative bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-3xl shadow-xl p-6 border border-purple-100 dark:border-purple-800/30 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-400/20 to-indigo-400/20 dark:from-purple-600/10 dark:to-indigo-600/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2 text-gray-800 dark:text-white relative z-10">
                <div className="p-2 bg-gradient-to-r from-yellow-400 to-orange-400 rounded-xl">
                    <FaLightbulb className="text-white text-lg" />
                </div>
                Hikaye İpuçları
            </h3>
            <ul className="space-y-3 text-sm text-gray-700 dark:text-gray-300 relative z-10">
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">✍️</span>
                    <span>Okuyanı çeken bir başlık seçin</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">📝</span>
                    <span>Uzun metni paragraflara bölün, okumayı kolaylaştırın</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">📸</span>
                    <span>Görsel materyaller kullanın</span>
                </li>
                <li className="flex gap-3 items-start p-3 bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm rounded-xl border border-purple-100 dark:border-purple-800/30">
                    <span className="text-xl">@</span>
                    <span>Kullanıcı etiketlemek için @kullanıcıadı yazın</span>
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
                Yayın Kuralları
            </h3>
            <ul className="space-y-2 text-sm text-gray-700 dark:text-gray-300 relative z-10">
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Özgün içerik üretin</span>
                </li>
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Nefret söyleminden kaçının</span>
                </li>
                <li className="flex gap-2 items-center p-2">
                    <span className="text-green-500 text-lg">✓</span>
                    <span>Kaynak gösterin</span>
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
            <SEO title="Hikaye Yaz - Hikayeler | Herkesler Soruyor" />
            <div className="flex flex-col gap-6">
                {/* Header with animated gradient */}
                <div className="relative bg-gradient-to-r from-teal-600 via-emerald-600 to-cyan-700 rounded-3xl p-8 md:p-10 text-white shadow-2xl overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-black/10 animate-pulse"></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-4 mb-3">
                            <Link to="/stories" className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors">
                                <FaArrowLeft />
                            </Link>
                            <h1 className="text-3xl md:text-4xl font-bold drop-shadow-lg">Hikaye Yaz</h1>
                        </div>
                        <p className="text-white/95 text-lg pl-14">Uzun veya kısa, senin hikayeni toplulukla paylaş. Görsel ve @etiket ekleyebilirsin.</p>
                    </div>
                    {/* Decorative Blobs */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24 blur-3xl"></div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Main Form Card with glassmorphism */}
                    <div className="relative bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-2xl p-6 md:p-8 border border-gray-200/50 dark:border-gray-700/50">

                        {/* Title */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                Başlık <span className="text-coral">*</span>
                            </label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                maxLength={255}
                                placeholder="İlgi çekici bir başlık girin..."
                                className={`w-full px-4 py-3 rounded-xl border ${errors.title ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                                    } dark:bg-gray-700 dark:text-white focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all`}
                            />
                            {errors.title && <p className="text-red-500 text-sm mt-1">{errors.title}</p>}
                        </div>

                        {/* Content */}
                        <div className="mb-6">
                            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                İçerik <span className="text-coral">*</span>
                            </label>
                            <div className={`rounded-xl overflow-hidden border ${errors.content ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                <RichTextEditor
                                    value={content}
                                    onChange={setContent}
                                    placeholder="Hikayeni yaz; paragraflar, görseller ve  ekleyebilirsin..."
                                    uploadImage={uploadEditorImage}
                                />
                            </div>
                            {errors.content && <p className="text-red-500 text-sm mt-1">{errors.content}</p>}
                        </div>

                        {/* Settings */}
                        <div className="mb-8 p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                            <label className="flex items-center gap-3 cursor-pointer select-none group">
                                <div className="relative">
                                    <input
                                        type="checkbox"
                                        checked={allowComments}
                                        onChange={(e) => setAllowComments(e.target.checked)}
                                        className="sr-only peer"
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-coral/20 dark:peer-focus:ring-coral/30 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-coral"></div>
                                </div>
                                <span className="text-gray-700 dark:text-gray-300 font-medium group-hover:text-gray-900 dark:group-hover:text-white transition-colors">Bu hikayeye yorum yapılabilsin</span>
                            </label>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col md:flex-row gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="px-6 py-3 rounded-xl border-2 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-700 transition-all"
                            >
                                İptal
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-coral to-orange-400 text-white font-bold hover:shadow-xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {isSubmitting ? (
                                    <>
                                        <FaCheckCircle className="animate-spin" />
                                        Yayınlanıyor...
                                    </>
                                ) : (
                                    <>
                                        <FaSave />
                                        Yayınla
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </MainLayout>
    );
};

export default CreateStoryPage;
