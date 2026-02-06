import React from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';

import SEO from '../components/SEO';

const LandingPage = () => {
    return (
        <MainLayout fullWidth={true} showMobileFooter={true}>
            <div className="min-h-screen bg-background dark:bg-gray-900">
                <SEO
                    title="Herkesler Soruyor - Anonim Soru Cevap Platformu"
                    description="Topluluğa katıl, anonim sorular sor ve cevapla. En samimi soru cevap platformu."
                />
                <HeroSection />
                <HowItWorks />
            </div>
        </MainLayout>
    );
};

export default LandingPage;
