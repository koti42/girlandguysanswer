import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { FaMars, FaVenus, FaGlobe } from 'react-icons/fa';
import { questionsAPI } from '../services/api';

const QuestionsPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState({ id: 0, title: 'Tümü' });
    const [genderFilter, setGenderFilter] = useState('all'); // 'all', 'female', 'male'
    const [sortBy, setSortBy] = useState('popular'); // 'popular', 'newest', 'forYou'

    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalPages, setTotalPages] = useState(1);

    const observerTarget = useRef(null);

    const fetchQuestions = useCallback(async (page = 1, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            // API'ye gönderilecek parametreler
            const params = {
                search: searchQuery || undefined,
                category: selectedCategory.id !== 0 ? selectedCategory.title : undefined,
                gender: genderFilter !== 'all' ? genderFilter : undefined,
                sort: sortBy,
                page: page,
                limit: 10
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
    }, [searchQuery, selectedCategory, genderFilter, sortBy]);

    useEffect(() => {
        setCurrentPage(1);
        setQuestions([]);
        fetchQuestions(1, false);
    }, [searchQuery, selectedCategory, genderFilter, sortBy]);

    // Intersection Obsrver for infinite scroll
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
            <div className="flex flex-col gap-8">
                <HeroSection />

                <div className="flex flex-col gap-6">
                    {/* CategoryNav - selectedCategory ve onSelectCategory prop'larını almalı (CategoryNav güncellemesi gerekebilir) */}
                    <CategoryNav selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />

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
                                        <QuestionCard key={q.id} question={q} />
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
