import React from 'react';
import Header from '../components/Header';

const MainLayout = ({ children, sidebar }) => {
    return (
        <div className="min-h-screen bg-background font-sans text-text-dark">
            <Header />
            <main className="max-w-7xl mx-auto px-4 md:px-6 py-6 transition-all duration-300">
                <div className="flex flex-col lg:flex-row gap-8">
                    {/* Main Feed */}
                    <div className="w-full lg:w-[68%] flex flex-col gap-6">
                        {children}
                    </div>

                    {/* Sidebar */}
                    <aside className="w-full lg:w-[32%] flex flex-col gap-6">
                        {sidebar}
                    </aside>
                </div>
            </main>

            <footer className="bg-[#1a1a1a] text-gray-400 py-12 mt-12 text-center text-sm">
                <p>© 2026 Kızilinkalarsoruyor. Tüm hakları saklıdır.</p>
            </footer>
        </div>
    );
};

export default MainLayout;
