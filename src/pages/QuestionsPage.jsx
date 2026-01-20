import React, { useState } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questions } from '../data/mockData';
import { FaMars, FaVenus, FaGlobe } from 'react-icons/fa';

const QuestionsPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [genderFilter, setGenderFilter] = useState('all'); // 'all', 'female', 'male'

    // Filter questions based on search and gender
    const filteredQuestions = questions.filter(q => {
        // Search filter
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchesSearch = (
                q.title.toLowerCase().includes(query) ||
                q.category.toLowerCase().includes(query) ||
                q.user.name.toLowerCase().includes(query) ||
                q.tags.some(tag => tag.toLowerCase().includes(query))
            );
            if (!matchesSearch) return false;
        }

        // Gender filter
        if (genderFilter === 'all') return true;
        return q.user.gender === genderFilter;
    });

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
                    <CategoryNav />

                    <div className="flex flex-col gap-4">
                        <FeedTabs />

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
                                <span className="text-xs opacity-75">({questions.length})</span>
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
                                <span className="text-xs opacity-75">({questions.filter(q => q.user.gender === 'female').length})</span>
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
                                <span className="text-xs opacity-75">({questions.filter(q => q.user.gender === 'male').length})</span>
                            </button>
                        </div>

                        {searchQuery && (
                            <div className="bg-blue-50 border-l-4 border-coral p-4 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <span className="font-semibold">{filteredQuestions.length}</span> sonuç bulundu: "{searchQuery}"
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            {filteredQuestions.length > 0 ? (
                                filteredQuestions.map((q) => (
                                    <QuestionCard key={q.id} question={q} />
                                ))
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center">
                                    <p className="text-gray-400 text-lg">Arama sonucu bulunamadı</p>
                                    <p className="text-gray-500 text-sm mt-2">Farklı kelimeler deneyin</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
}

export default QuestionsPage;
