import React from 'react';
import HeroSection from '../components/landing/HeroSection';
import HowItWorks from '../components/landing/HowItWorks';

const LandingPage = () => {
    return (
        <div className="min-h-screen">
            <HeroSection />
            <HowItWorks />
        </div>
    );
};

export default LandingPage;
