import React from 'react';
import Header from '../components/Header';

const MainLayout = ({ children, sidebar, onSearch }) => {
    return (
        <div className="min-h-screen bg-background dark:bg-gray-900 font-sans text-text-dark dark:text-gray-100 transition-colors">
            <Header onSearch={onSearch} />
            <main className="max-w-7xl mx-auto px-3 md:px-6 py-4 md:py-6 transition-all duration-300">
                <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
                    {/* Main Feed */}
                    <div className="w-full lg:w-[68%] flex flex-col gap-4 md:gap-6">
                        {children}
                    </div>

                    {/* Sidebar - Hidden on mobile */}
                    {sidebar && (
                        <aside className="hidden lg:flex lg:w-[32%] flex-col gap-6">
                            {sidebar}
                        </aside>
                </div>
            </main>

            <footer className="bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 py-12 mt-16">
                <div className="max-w-7xl mx-auto px-4 md:px-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <h4 className="font-bold text-white mb-4">Hakkımızda</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-coral transition-colors">Biz Kimiz?</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Kariyer</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Basın</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Topluluk</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-coral transition-colors">Kullanım Kuralları</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Yardım Merkezi</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Blog</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Yasal</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-coral transition-colors">Gizlilik Politikası</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Kullanım Şartları</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Çerez Politikası</a></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">İletişim</h4>
                            <ul className="space-y-2 text-sm">
                                <li><a href="#" className="hover:text-coral transition-colors">Bize Ulaşın</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Reklam</a></li>
                                <li><a href="#" className="hover:text-coral transition-colors">Ortaklık</a></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-6 text-center text-sm">
                        <p>© 2026 Kızilinkalarsoruyor. Tüm hakları saklıdır.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default MainLayout;
