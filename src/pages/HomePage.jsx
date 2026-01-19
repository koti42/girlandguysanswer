import React, { useState } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questions } from '../data/mockData';

function HomePage() {
    const [searchQuery, setSearchQuery] = useState('');

    // Filter questions based on search
    const filteredQuestions = questions.filter(q => {
        if (!searchQuery) return true;
        const query = searchQuery.toLowerCase();
        return (
            q.title.toLowerCase().includes(query) ||
            q.category.toLowerCase().includes(query) ||
            q.user.name.toLowerCase().includes(query) ||
            q.tags.some(tag => tag.toLowerCase().includes(query))
        );
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

export default HomePage;
