import React from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';

const MainLayout = ({ children, sidebar, onSearch, noMobilePadding = false, fullWidth = false, showMobileFooter = false }) => {
    return (
        <div className="min-h-screen bg-background dark:bg-gray-900 font-sans text-text-dark dark:text-gray-100 transition-colors">
            <Header onSearch={onSearch} />
            <main className={`${fullWidth ? '' : 'max-w-7xl mx-auto md:px-6 md:py-6'} ${noMobilePadding || fullWidth ? 'px-0 py-0' : 'px-3 py-4'} transition-all duration-300`}>
                {fullWidth ? (
                    children
                ) : (
                    <div className="flex flex-col lg:flex-row gap-4 md:gap-8">
                        {/* Main Feed */}
                        <div className={`w-full ${sidebar ? 'lg:w-[68%]' : ''} flex flex-col gap-4 md:gap-6`}>
                            {children}
                        </div>

                        {/* Sidebar - Hidden on mobile */}
                        {sidebar && (
                            <aside className="hidden lg:block lg:w-[32%] space-y-6">
                                {sidebar}
                            </aside>
                        )}
                    </div>
                )}
            </main>

            <footer className={`${showMobileFooter ? 'block' : 'hidden md:block'} bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 py-12 mt-16`}>
                <div className="max-w-7xl mx-auto px-4 md:px-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
                        <div>
                            <h4 className="font-bold text-white mb-4">Hakkımızda</h4>
                            <ul className="space-y-2 text-sm">
                                <li><Link to="/questions" className="hover:text-coral transition-colors">Ana Sayfa</Link></li>
                                <li><Link to="/leaderboard" className="hover:text-coral transition-colors">Liderlik Tablosu</Link></li>
                                <li><Link to="/etiketler" className="hover:text-coral transition-colors">Etiketler</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Topluluk</h4>
                            <ul className="space-y-2 text-sm">
                                <li><Link to="/kullanim-kurallari" className="hover:text-coral transition-colors">Kullanım Kuralları</Link></li>
                                <li><Link to="/yardim-merkezi" className="hover:text-coral transition-colors">Yardım Merkezi</Link></li>
                                <li><Link to="/blog" className="hover:text-coral transition-colors">Blog</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">Yasal</h4>
                            <ul className="space-y-2 text-sm">
                                <li><Link to="/gizlilik-politikasi" className="hover:text-coral transition-colors">Gizlilik Politikası</Link></li>
                                <li><Link to="/site-sozlesmesi" className="hover:text-coral transition-colors">Kullanım Şartları</Link></li>
                                <li><Link to="/cerez-politikasi" className="hover:text-coral transition-colors">Çerez Politikası</Link></li>
                            </ul>
                        </div>
                        <div>
                            <h4 className="font-bold text-white mb-4">İletişim</h4>
                            <ul className="space-y-2 text-sm">
                                <li><Link to="/iletisim" className="hover:text-coral transition-colors">Bize Ulaşın</Link></li>
                                <li><Link to="/reklam" className="hover:text-coral transition-colors">Reklam</Link></li>
                                <li><Link to="/ortaklik" className="hover:text-coral transition-colors">Ortaklık</Link></li>
                            </ul>
                        </div>
                    </div>
                    <div className="border-t border-gray-700 pt-6 text-center text-sm">
                        <p>© 2026 Herkesler Soruyor. Tüm hakları saklıdır.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default MainLayout;
