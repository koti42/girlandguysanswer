import React from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaUsers, FaComments, FaRocket } from 'react-icons/fa';

const HeroSection = () => {
    return (
        <section className="min-h-screen flex items-center justify-center bg-gradient-to-br from-coral/10 via-background to-gold/10 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900 px-4 py-20">
            <div className="max-w-6xl mx-auto text-center">
                {/* Main Heading */}
                <div className="mb-8">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 mb-6">
                        <span className="font-script text-4xl sm:text-6xl md:text-8xl text-coral font-bold break-words px-2">
                            Kızilinkalarsoruyor
                        </span>
                        <div className="relative">
                            <FaHeart className="text-gold text-4xl sm:text-5xl md:text-7xl" />
                            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold text-xl sm:text-2xl md:text-3xl">?</span>
                        </div>
                    </div>
                    <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold text-gray-800 dark:text-white mb-3 md:mb-4 px-4">
                        Kadınlar ve Erkekler Bir Arada!
                    </h2>
                    <p className="text-base sm:text-xl md:text-2xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto px-4">
                        Sorularını sor, farklı bakış açılarından cevaplar al. Kadın ve erkek perspektiflerini keşfet!
                    </p>
                </div>

                {/* CTA Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
                    <Link to="/questions">
                        <button className="bg-gradient-to-r from-coral to-orange-400 text-white font-bold py-4 px-8 rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all text-lg">
                            Soruları Keşfet 🚀
                        </button>
                    </Link>
                    <Link to="/ask">
                        <button className="bg-white dark:bg-gray-800 text-gray-800 dark:text-white border-2 border-coral font-bold py-4 px-8 rounded-2xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-lg">
                            Soru Sor 💬
                        </button>
                    </Link>
                </div>

                {/* Features Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-20">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-soft hover:shadow-lg transition-all">
                        <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-pink-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaUsers className="text-3xl text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-3">Farklı Perspektifler</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Kadın ve erkek bakış açılarını bir arada gör, daha dengeli kararlar al
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-soft hover:shadow-lg transition-all">
                        <div className="w-16 h-16 bg-gradient-to-br from-cyan-500 to-cyan-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaComments className="text-3xl text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-3">Aktif Topluluk</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Binlerce kullanıcı anlık olarak sorularına cevap arıyor ve veriyor
                        </p>
                    </div>

                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-soft hover:shadow-lg transition-all">
                        <div className="w-16 h-16 bg-gradient-to-br from-gold to-orange-400 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FaRocket className="text-3xl text-white" />
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 dark:text-white mb-3">Kolay Kullanım</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Hızlıca soru sor, cevapla ve puanla. Basit ve kullanıcı dostu arayüz
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HeroSection;
