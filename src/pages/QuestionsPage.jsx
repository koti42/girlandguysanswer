import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { FaMars, FaVenus, FaGlobe, FaRobot } from 'react-icons/fa';
import { questionsAPI, categoriesAPI } from '../services/api';

import { useSearchParams } from 'react-router-dom';

const QuestionsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tagFilter = searchParams.get('tag') || undefined;
    const initialQuery = searchParams.get('search') || '';
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [categories, setCategories] = useState([]);
    const [, setLoadingCategories] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState({ id: 0, title: 'Tümü' });
    const [genderFilter, setGenderFilter] = useState('all');
    const [aiFilter, setAiFilter] = useState(false);
    const [sortBy, setSortBy] = useState('popular');
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalPages, setTotalPages] = useState(1);

    const observerTarget = useRef(null);

    // handleModerationAction'ın referansı sabit kalsın diye güncel değerler
    // ref üzerinden okunuyor: state'e doğrudan bağımlı olsaydı callback her
    // sayfa yüklemesinde yeniden üretilir, QuestionCard'ın memo'su bozulurdu.
    const fetchQuestionsRef = useRef(null);
    const currentPageRef = useRef(1);

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
                ...(tagFilter ? { tag: tagFilter } : {}),
                ...(aiFilter ? { has_ai_answers: true } : {}),
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
        } catch {
            setError("Sorular yüklenirken bir sorun oluştu.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery, selectedCategory, genderFilter, sortBy, tagFilter, aiFilter]);

    // Ref tazeleme çizimde değil efektte: çizim sırasında ref yazmak React'in
    // önerdiği kullanım değil (bkz. react-hooks/refs).
    useEffect(() => {
        fetchQuestionsRef.current = fetchQuestions;
        currentPageRef.current = currentPage;
    });

    /**
     * Moderasyon sonrası liste tazeleme.
     *
     * Eskiden her kartın prop'una inline ok fonksiyonu olarak veriliyordu: her
     * çizimde yeni bir referans üretiyor, dolayısıyla QuestionCard'ı memo'lamak
     * hiçbir işe yaramıyordu. useCallback ile referans sabitlendi.
     *
     * fetchQuestions'a bağımlı olmamak için sayfa numarası ref üzerinden
     * okunuyor; yoksa her sayfa yüklemesinde referans yine değişirdi.
     */
    const handleModerationAction = useCallback((action, questionId) => {
        if (action === 'remove') {
            setQuestions(prev => prev.filter(item => item.id !== questionId));
        } else {
            fetchQuestionsRef.current(currentPageRef.current, false);
        }
    }, []);



    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        if (searchQuery) params.set('search', searchQuery);
        else params.delete('search');
        setSearchParams(params, { replace: true });
    }, [searchQuery, searchParams, setSearchParams]);

    useEffect(() => {
        setCurrentPage(1);
        setQuestions([]);
        fetchQuestions(1, false);
    }, [searchQuery, selectedCategory, genderFilter, sortBy, tagFilter, aiFilter]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasNextPage && !loadingMore && !loading) {
                    fetchQuestions(currentPage + 1, true);
                }
            },
            // rootMargin: sayfanın dibine varmadan ~600px önce yüklemeye başla.
            // Eskiden sentinel'in ekrana girmesi bekleniyordu, yani kullanıcı
            // listenin sonuna çarpıyor ve isteğin dönmesini bekliyordu; mobilde
            // bu "takıldı" gibi hissettiren asıl şeydi.
            { threshold: 0, rootMargin: '600px 0px' }
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
                                type="button"
                                onClick={() => setAiFilter((prev) => !prev)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-full font-semibold transition-all ${
                                    aiFilter
                                        ? 'bg-gradient-to-r from-indigo-500 to-sky-500 text-white shadow-lg'
                                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-gray-700'
                                }`}
                            >
                                <FaRobot className={aiFilter ? 'text-white' : 'text-indigo-500'} />
                                <span>AI Soruları</span>
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
                                            onModerationAction={handleModerationAction}
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
