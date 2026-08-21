import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import StoryCard from '../components/StoryCard';
import { getViewerPrefs } from '../utils/userColor';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget, PopularQuestionsWidget } from '../components/Widgets';
import { storiesAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaBookOpen, FaSearch, FaEye } from 'react-icons/fa';
import SEO from '../components/SEO';

const ADULT_PREF_KEY = 'storiesIncludeAdult';

const StoriesPage = () => {
    const { user } = useAuth();
    const viewerPrefs = getViewerPrefs(user);
    const [searchParams, setSearchParams] = useSearchParams();
    const initialSearch = searchParams.get('search') || '';
    const initialCategory = searchParams.get('category') || '';
    const [stories, setStories] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [categorySlug, setCategorySlug] = useState(initialCategory);
    const [includeAdult, setIncludeAdult] = useState(() => {
        try {
            return localStorage.getItem(ADULT_PREF_KEY) === '1';
        } catch {
            return false;
        }
    });
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const observerTarget = useRef(null);

    useEffect(() => {
        storiesAPI.getCategories()
            .then((res) => setCategories(res.data?.data?.categories || []))
            .catch(() => setCategories([]));
    }, []);

    const fetchStories = useCallback(async (pageNum = 1, append = false) => {
        if (append) setLoadingMore(true);
        else setLoading(true);
        try {
            const response = await storiesAPI.getAll({
                page: pageNum,
                per_page: 10,
                search: searchQuery || undefined,
                category: categorySlug || undefined,
                include_adult: includeAdult || undefined,
            });
            const data = response.data?.data;
            const list = data?.stories || [];
            const pagination = data?.pagination || {};
            if (append) {
                setStories(prev => [...prev, ...list]);
            } else {
                setStories(list);
            }
            setPage(pagination.current_page ?? pageNum);
            setHasNextPage((pagination.current_page ?? pageNum) < (pagination.total_pages ?? 1));
        } catch (err) {
            console.error('Hikayeler yüklenirken hata:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery, categorySlug, includeAdult]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        if (searchQuery) next.set('search', searchQuery);
        else next.delete('search');
        if (categorySlug) next.set('category', categorySlug);
        else next.delete('category');
        setSearchParams(next);
    }, [searchQuery, categorySlug]);

    useEffect(() => {
        try {
            localStorage.setItem(ADULT_PREF_KEY, includeAdult ? '1' : '0');
        } catch {
            // ignore
        }
    }, [includeAdult]);

    useEffect(() => {
        setPage(1);
        fetchStories(1, false);
    }, [searchQuery, categorySlug, includeAdult, fetchStories]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0]?.isIntersecting && hasNextPage && !loadingMore && !loading) {
                    fetchStories(page + 1, true);
                }
            },
            { threshold: 0.1 }
        );
        const target = observerTarget.current;
        if (target) observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [hasNextPage, loadingMore, loading, page, fetchStories]);

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
            <PopularQuestionsWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO
                title="Hikayeler - Herkesler Soruyor"
                description="Uzun hikayeler oku ve paylaş; yorumla, beğen, toplulukla etkileşime geç."
            />
            <div className="flex flex-col gap-6">
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-teal-600 via-emerald-600 to-cyan-700 p-6 md:p-8 text-white shadow-xl">
                    <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-12 -left-8 h-36 w-36 rounded-full bg-black/10 blur-2xl" />
                    <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Hikayeler</h1>
                            <p className="text-white/85 mt-1 max-w-xl">
                                Kısa yazılardan daha uzun, akıcı anlatılar. Okuyun, yazın, yorumlayın.
                            </p>
                        </div>
                        {user && (
                            <Link
                                to="/stories/yaz"
                                className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-emerald-700 font-semibold rounded-xl hover:bg-white/90 transition-all shadow-md"
                            >
                                <FaBookOpen /> Hikaye Yaz
                            </Link>
                        )}
                    </div>
                </div>

                <div className="relative">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Hikayelerde ara..."
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                </div>

                <div className="flex flex-col gap-3">
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        <button
                            type="button"
                            onClick={() => setCategorySlug('')}
                            className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                !categorySlug
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-emerald-400'
                            }`}
                        >
                            Tümü
                        </button>
                        {categories.map((cat) => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => setCategorySlug(cat.slug === categorySlug ? '' : cat.slug)}
                                className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-all ${
                                    categorySlug === cat.slug
                                        ? 'text-white border-transparent'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:border-emerald-400'
                                }`}
                                style={categorySlug === cat.slug ? { backgroundColor: cat.color || '#059669' } : undefined}
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>

                    <label className="inline-flex items-center gap-2 self-start cursor-pointer select-none text-sm text-gray-600 dark:text-gray-300">
                        <input
                            type="checkbox"
                            checked={includeAdult}
                            onChange={(e) => setIncludeAdult(e.target.checked)}
                            className="rounded border-gray-300 text-rose-500 focus:ring-rose-400"
                        />
                        <FaEye className="text-rose-500" />
                        <span>+18 içerikleri de göster</span>
                    </label>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500 mx-auto" />
                        <p className="mt-4 text-gray-500">Yükleniyor...</p>
                    </div>
                ) : stories.length > 0 ? (
                    <>
                        <div className="flex flex-col gap-4">
                            {stories.map((story) => (
                                <StoryCard key={story.id} story={story} viewerPrefs={viewerPrefs} />
                            ))}
                        </div>
                        <div ref={observerTarget} className="py-6">
                            {loadingMore && (
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500 mx-auto" />
                                </div>
                            )}
                            {!hasNextPage && stories.length > 0 && (
                                <p className="text-center text-gray-400 text-sm">Tüm hikayeler gösterildi.</p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
                        <p className="text-gray-500 dark:text-gray-400 text-lg">Bu filtrelere uygun hikaye yok</p>
                        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Kategoriyi değiştirin veya ilk hikayeyi siz yazın.</p>
                        {user && (
                            <Link to="/stories/yaz" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-emerald-600 text-white rounded-xl font-medium">
                                <FaBookOpen /> Hikaye Yaz
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default StoriesPage;
