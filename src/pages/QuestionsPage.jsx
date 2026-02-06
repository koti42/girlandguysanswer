import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { FaMars, FaVenus, FaGlobe, FaCommentSlash, FaPoll } from 'react-icons/fa';
import { questionsAPI, categoriesAPI } from '../services/api';
import SEO from '../components/SEO';

import { useSearchParams } from 'react-router-dom';

const QuestionsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const initialQuery = searchParams.get('search') || '';
    const initialHasPoll = searchParams.get('has_poll') === '1' || searchParams.get('has_poll') === 'true';
    const initialNoComments = searchParams.get('no_comments') === '1' || searchParams.get('no_comments') === 'true';
    const allowedSorts = new Set(['popular', 'newest', 'forYou']);
    const initialSortRaw = searchParams.get('sort');
    const initialSort = allowedSorts.has(initialSortRaw) ? initialSortRaw : 'popular';
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState({ id: 0, title: 'Tümü' });
    const [genderFilter, setGenderFilter] = useState('all');
    const [sortBy, setSortBy] = useState(initialSort);
    const [noCommentsFilter, setNoCommentsFilter] = useState(initialNoComments);
    const [hasPollFilter, setHasPollFilter] = useState(initialHasPoll);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalPages, setTotalPages] = useState(1);

    const observerTarget = useRef(null);

    // Kategorileri API'den çek
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setLoadingCategories(true);
                const response = await categoriesAPI.getAll();
                setCategories(response.data.data.categories || []);
            } catch (error) {
                console.error('Kategoriler yüklenirken hata:', error);
            } finally {
                setLoadingCategories(false);
            }
        };

        fetchCategories();
    }, []);

    const fetchQuestions = useCallback(async (page = 1, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            const params = {
                search: searchQuery || undefined,
                category: selectedCategory.id !== 0 ? selectedCategory.name : undefined,
                gender: genderFilter !== 'all' ? genderFilter : undefined,
                sort: sortBy,
                page: page,
                limit: 10,
                ...(noCommentsFilter ? { no_comments: 1 } : {}),
                ...(hasPollFilter ? { has_poll: 1 } : {})
            };

            const response = await questionsAPI.getAll(params);
            const newQuestions = response.data.data.questions;
            const pagination = response.data.data.pagination;

            if (append) {
                setQuestions(prev => [...prev, ...newQuestions]);
            } else {
                setQuestions(newQuestions);
            }

            setCurrentPage(pagination.currentPage);
            setHasNextPage(pagination.hasNextPage);
            setTotalPages(pagination.totalPages);
        } catch (err) {
            setError("Sorular yüklenirken bir sorun oluştu.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery, selectedCategory, genderFilter, sortBy, noCommentsFilter, hasPollFilter]);



    useEffect(() => {
        const next = new URLSearchParams(searchParams);

        if (searchQuery) next.set('search', searchQuery);
        else next.delete('search');

        if (hasPollFilter) next.set('has_poll', '1');
        else next.delete('has_poll');

        if (noCommentsFilter) next.set('no_comments', '1');
        else next.delete('no_comments');

        if (sortBy && sortBy !== 'popular') next.set('sort', sortBy);
        else next.delete('sort');

        setSearchParams(next);
    }, [searchQuery, hasPollFilter, noCommentsFilter, sortBy]);

    useEffect(() => {
        setCurrentPage(1);
        setQuestions([]);
        fetchQuestions(1, false);
    }, [searchQuery, selectedCategory, genderFilter, sortBy, noCommentsFilter, hasPollFilter]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasNextPage && !loadingMore && !loading) {
                    fetchQuestions(currentPage + 1, true);
                }
            },
            { threshold: 0.1 }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasNextPage, loadingMore, loading, currentPage, fetchQuestions]);

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent} onSearch={setSearchQuery}>
            <SEO
                title="Sorular - Herkesler Soruyor"
                description="Sorulara göz atın, cevap verin, anketli soruları keşfedin."
            />
            <div className="flex flex-col gap-8">
                <HeroSection />

                <div className="flex flex-col gap-6">
                    {/* CategoryNav - API'den gelen kategorileri göster */}
                    <CategoryNav categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />

                    <div className="flex flex-col gap-4">
                        <FeedTabs activeTab={sortBy} onTabChange={setSortBy} />

                        {/* Gender Filter Buttons */}
                        <div className="flex gap-2 flex-wrap">
                            <button
                                onClick={() => setGenderFilter('all')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${genderFilter === 'all'
                                    ? 'bg-gradient-to-r from-coral to-orange-400 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <FaGlobe />
                                <span>Tüm Sorular</span>
                            </button>
                            <button
                                onClick={() => setGenderFilter('female')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${genderFilter === 'female'
                                    ? 'bg-gradient-to-r from-pink-400 to-pink-500 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-pink-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <FaVenus className="text-pink-500" />
                                <span>Kadınlar Soruyor</span>
                            </button>
                            <button
                                onClick={() => setGenderFilter('male')}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${genderFilter === 'male'
                                    ? 'bg-gradient-to-r from-blue-400 to-blue-500 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <FaMars className="text-blue-500" />
                                <span>Erkekler Soruyor</span>
                            </button>
                            <button
                                onClick={() => setNoCommentsFilter(prev => !prev)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${noCommentsFilter
                                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <FaCommentSlash />
                                <span>Hiç yorum almamış</span>
                            </button>
                            <button
                                onClick={() => setHasPollFilter(prev => !prev)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${hasPollFilter
                                    ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                            >
                                <FaPoll />
                                <span>Sadece anketli sorular</span>
                            </button>
                        </div>

                        {searchQuery && (
                            <div className="bg-blue-50 border-l-4 border-coral p-4 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <span className="font-semibold">{questions.length}</span> sonuç bulundu: "{searchQuery}"
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            {loading ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto"></div>
                                    <p className="mt-4 text-gray-500">Sorular yükleniyor...</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-10 text-red-500">
                                    {error}
                                </div>
                            ) : questions.length > 0 ? (
                                <>
                                    {questions.map((q) => (
                                        <QuestionCard 
                                            key={q.id} 
                                            question={q}
                                            onModerationAction={(action, questionId) => {
                                                // Moderasyon işleminden sonra soruyu listeden kaldır veya güncelle
                                                if (action === 'remove') {
                                                    setQuestions(prev => prev.filter(q => q.id !== questionId));
                                                } else {
                                                    // Hide/unhide durumunda soruyu yeniden yükle
                                                    fetchQuestions(currentPage, false);
                                                }
                                            }}
                                        />
                                    ))}

                                    {/* Intersection Observer Target */}
                                    <div ref={observerTarget} className="py-4">
                                        {loadingMore && (
                                            <div className="text-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral mx-auto"></div>
                                                <p className="mt-2 text-sm text-gray-500">Daha fazla yükleniyor...</p>
                                            </div>
                                        )}
                                        {!hasNextPage && questions.length > 0 && (
                                            <p className="text-center text-gray-400 text-sm">
                                                Tüm sorular gösterildi ({currentPage}/{totalPages} sayfa)
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                                    <p className="text-gray-400 text-lg">Bu kriterlere uygun soru bulunamadı</p>
                                    <p className="text-gray-500 text-sm mt-2">Filtreleri değiştirmeyi deneyin</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default QuestionsPage;
