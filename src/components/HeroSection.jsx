import React from 'react';
import heroBg from '../assets/hero-bg.png';

const HeroSection = () => {
    return (
        <div className="relative w-full h-[400px] rounded-3xl overflow-hidden shadow-soft group">
            {/* Background Image */}
            <img
                src={heroBg}
                alt="Community"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />

            {/* Overlay Gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/30 to-transparent"></div>

            {/* Content */}
            <div className="absolute top-1/2 -translate-y-1/2 left-8 md:left-12 max-w-lg text-white">
                <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
                    Merak Etme, <br />
                    Sadece Sor!
                </h1>
                <button className="bg-gold text-white font-semibold py-3 px-8 rounded-full shadow-lg hover:bg-yellow-500 hover:scale-105 transition-all text-lg">
                    Hemen Başla
                </button>
            </div>
        </div>
    );
};

export default HeroSection;
