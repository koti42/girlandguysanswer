import React from 'react';
import Header from '../components/Header';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';

import SEO from '../components/SEO';

const LandingPage = () => {
    return (
        <div className="min-h-screen bg-background dark:bg-gray-900">
            <SEO
                title="Herkesler Soruyor - Anonim Soru Cevap Platformu"
                description="Topluluğa katıl, anonim sorular sor ve cevapla. En samimi soru cevap platformu."
            />
            <Header />
            <HeroSection />
            <HowItWorks />

            {/* Footer */}
            <footer className="bg-gradient-to-r from-gray-900 to-gray-800 text-gray-300 py-12 mt-16">
                <div className="max-w-7xl mx-auto px-4 md:px-6">
                    <div className="border-t border-gray-700 pt-6 text-center text-sm">
                        <p>© 2026 Herkesler Soruyor. Tüm hakları saklıdır.</p>
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
