import React, { useState, useEffect } from 'react';
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
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchQuestions = async () => {
            setLoading(true);
            try {
                // API'ye gönderilecek parametreler
                const params = {
                    search: searchQuery || undefined,
                    category: selectedCategory.id !== 0 ? selectedCategory.title : undefined,
                    gender: genderFilter !== 'all' ? genderFilter : undefined,
                    sort: sortBy
                };

                const response = await questionsAPI.getAll(params);
                setQuestions(response.data.data.questions);
                // Pagination verilerini de alabiliriz: response.data.data.pagination
            } catch (err) {
                setError("Sorular yüklenirken bir sorun oluştu.");
            } finally {
                setLoading(false);
            }
        };

        fetchQuestions();
    }, [searchQuery, selectedCategory, genderFilter, sortBy]);

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
                                questions.map((q) => (
                                    <QuestionCard key={q.id} question={q} />
                                ))
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
