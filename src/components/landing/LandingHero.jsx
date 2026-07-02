import React from 'react';
import { Link } from 'react-router-dom';
import { FaSearch, FaChevronRight } from 'react-icons/fa';

const LandingHero = ({ user }) => {
    return (
        <section
            className="relative overflow-hidden"
            style={{
                background: 'linear-gradient(110deg, #FFE8DC 0%, #FDF6F0 35%, #F2F9FD 65%, #E8F4FC 100%)',
            }}
        >
            <h1 className="sr-only">Herkesler Soruyor</h1>
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-b from-transparent to-background dark:to-gray-900 pointer-events-none z-10" />

            <div className="relative w-full">
                <picture className="block w-full">
                    <source srcSet="/images/landing-hero-community.webp" type="image/webp" />
                    <img
                        src="/images/landing-hero-community.png"
                        alt="Herkesler Soruyor topluluğu - farklı yaş ve kültürlerden insanlar"
                        width="1536"
                        height="1024"
                        loading="eager"
                        fetchpriority="high"
                        className="w-full h-auto min-h-[240px] sm:min-h-[320px] md:min-h-[420px] object-cover object-center block select-none pointer-events-none"
                        draggable={false}
                    />
                </picture>

                <div className="hidden sm:flex absolute inset-0 flex-col items-center justify-center text-center z-20 pb-6 px-4">
                    <picture className="block mb-3 md:mb-4">
                        <source srcSet="/images/landing-brand.webp" type="image/webp" />
                        <img
                            src="/images/landing-brand.png"
                            alt="Herkesler Soruyor"
                            width="1024"
                            height="1024"
                            className="w-[220px] sm:w-[280px] md:w-[340px] h-auto object-contain drop-shadow-sm select-none pointer-events-none"
                            draggable={false}
                        />
                    </picture>

                    <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full shadow-soft border border-white mb-4">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                        <span className="text-xs md:text-sm text-gray-600 font-medium">Topluluk aktif</span>
                    </div>

                    <p className="bg-white/85 backdrop-blur-sm rounded-2xl shadow-soft px-5 py-3 text-sm md:text-lg text-gray-700 max-w-md md:max-w-xl leading-relaxed">
                        Merak ettiğin her şeyi sor, <span className="text-pink-500 font-semibold">kadın</span> ve{' '}
                        <span className="text-blue-500 font-semibold">erkek</span> bakış açılarından cevaplar al.
                    </p>

                    <div className="flex flex-row gap-3 md:gap-4 justify-center items-center mt-6">
                        <Link
                            to="/questions"
                            className="bg-gradient-to-r from-orange-500 to-red-400 text-white font-bold py-3 px-6 md:py-3.5 md:px-8 rounded-full shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all text-sm md:text-base flex items-center gap-2"
                        >
                            <FaSearch className="text-xs md:text-sm" /> Soruları Keşfet
                        </Link>
                        <Link
                            to={user ? '/ask' : '/signup'}
                            className="bg-white text-gray-800 border border-red-200 font-bold py-3 px-6 md:py-3.5 md:px-8 rounded-full shadow-lg hover:shadow-xl hover:border-coral hover:text-coral hover:scale-105 active:scale-95 transition-all text-sm md:text-base flex items-center gap-2"
                        >
                            Soru Sor <FaChevronRight className="text-xs" />
                        </Link>
                    </div>
                </div>
            </div>

            <div className="sm:hidden flex flex-col items-center text-center pb-10 -mt-2 relative z-20 px-4">
                <picture className="block mb-3">
                    <source srcSet="/images/landing-brand.webp" type="image/webp" />
                    <img
                        src="/images/landing-brand.png"
                        alt="Herkesler Soruyor"
                        width="1024"
                        height="1024"
                        className="w-[200px] h-auto object-contain drop-shadow-sm select-none pointer-events-none"
                        draggable={false}
                    />
                </picture>

                <div className="inline-flex items-center gap-2 bg-white/90 px-4 py-1.5 rounded-full shadow-soft border border-white mb-3">
                    <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                    <span className="text-xs text-gray-600 font-medium">Topluluk aktif</span>
                </div>

                <p className="bg-white/85 dark:bg-gray-800/85 rounded-2xl shadow-soft px-4 py-3 text-sm text-gray-700 dark:text-gray-200 max-w-xs leading-relaxed">
                    Merak ettiğin her şeyi sor, <span className="text-pink-500 font-semibold">kadın</span> ve{' '}
                    <span className="text-blue-500 font-semibold">erkek</span> bakış açılarından cevaplar al.
                </p>

                <div className="flex flex-col gap-3 w-full px-6 mt-5">
                    <Link
                        to="/questions"
                        className="w-full bg-gradient-to-r from-orange-500 to-red-400 text-white font-bold py-3.5 rounded-full shadow-xl active:scale-95 transition-all text-base flex items-center justify-center gap-2"
                    >
                        <FaSearch className="text-sm" /> Soruları Keşfet
                    </Link>
                    <Link
                        to={user ? '/ask' : '/signup'}
                        className="w-full bg-white dark:bg-gray-800 text-gray-800 dark:text-white border border-red-200 dark:border-gray-600 font-bold py-3.5 rounded-full shadow-lg active:scale-95 transition-all text-base flex items-center justify-center gap-2"
                    >
                        Soru Sor <FaChevronRight className="text-xs" />
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default LandingHero;
