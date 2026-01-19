import React from 'react';
import MainLayout from './layouts/MainLayout';
import HeroSection from './components/HeroSection';
import CategoryNav from './components/CategoryNav';
import FeedTabs from './components/FeedTabs';
import QuestionCard from './components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from './components/Widgets';
import { questions } from './data/mockData';

function App() {
  const SidebarContent = (
    <>
      <TrendsWidget />
      <TopUsersWidget />
      <AnnouncementsWidget />
    </>
  );

  return (
    <MainLayout sidebar={SidebarContent}>
      <div className="flex flex-col gap-8">
        {/* Helper Wrapper for spacing */}
        <HeroSection />

        <div className="flex flex-col gap-6">
          <CategoryNav />

          <div className="flex flex-col gap-4">
            <FeedTabs />

            <div className="flex flex-col gap-6">
              {questions.map((q) => (
                <QuestionCard key={q.id} question={q} />
              ))}

              {/* Duplicate for visual fullness */}
              {questions.map((q) => (
                <QuestionCard key={`${q.id}-dup`} question={{ ...q, id: `${q.id}-dup` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}

export default App;
