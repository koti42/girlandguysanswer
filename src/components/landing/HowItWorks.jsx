import React from 'react';
import { FaMars, FaVenus, FaQuestionCircle, FaHeart } from 'react-icons/fa';

const HowItWorks = () => {
    return (
        <section className="py-20 bg-white dark:bg-gray-800 px-4">
            <div className="max-w-6xl mx-auto">
                <h2 className="text-4xl font-bold text-center text-gray-800 dark:text-white mb-4">
                    Nasıl Çalışır?
                </h2>
                <p className="text-center text-gray-600 dark:text-gray-300 mb-16 text-lg">
                    Çok basit! Sadece 3 adımda sorularına cevap bul
                </p>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* Step 1 */}
                    <div className="text-center">
                        <div className="relative inline-block mb-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-coral to-orange-400 rounded-full flex items-center justify-center">
                                <FaQuestionCircle className="text-5xl text-white" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-10 h-10 bg-gold text-white rounded-full flex items-center justify-center font-bold">
                                1
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Soru Sor</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Merak ettiğin konuyu paylaş, sorunuzu detaylıca anlat
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="text-center">
                        <div className="relative inline-block mb-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-pink-500 to-cyan-500 rounded-full flex items-center justify-center">
                                <div className="flex gap-2">
                                    <FaVenus className="text-3xl text-white" />
                                    <FaMars className="text-3xl text-white" />
                                </div>
                            </div>
                            <div className="absolute -top-2 -right-2 w-10 h-10 bg-gold text-white rounded-full flex items-center justify-center font-bold">
                                2
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Cevapları Al</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Kadın ve erkek kullanıcılardan farklı bakış açılarıyla cevaplar gel
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="text-center">
                        <div className="relative inline-block mb-6">
                            <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
                                <FaHeart className="text-5xl text-white" />
                            </div>
                            <div className="absolute -top-2 -right-2 w-10 h-10 bg-gold text-white rounded-full flex items-center justify-center font-bold">
                                3
                            </div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-800 dark:text-white mb-3">Değerlendir</h3>
                        <p className="text-gray-600 dark:text-gray-300">
                            Kaliteli cevapları beğen, tartışmalara katıl, yanıtla
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default HowItWorks;
