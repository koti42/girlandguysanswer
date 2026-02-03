import React from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaEnvelope, FaPhone, FaMapMarkerAlt, FaClock, FaPaperPlane } from 'react-icons/fa';

const ContactPage = () => {
    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-coral to-orange-400 rounded-full mb-4">
                            <FaEnvelope className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            İletişim
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Sorularınız, önerileriniz veya şikayetleriniz için bizimle iletişime geçebilirsiniz.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="p-3 bg-coral/10 rounded-lg">
                                    <FaEnvelope className="text-coral text-xl" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">E-posta</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Bize yazın</p>
                                </div>
                            </div>
                            <a href="mailto:destek@herkeslersoruyor.com" className="text-coral hover:underline">
                                destek@herkeslersoruyor.com
                            </a>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="p-3 bg-blue-500/10 rounded-lg">
                                    <FaPhone className="text-blue-500 text-xl" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Telefon</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Bizi arayın</p>
                                </div>
                            </div>
                            <a href="tel:+905551234567" className="text-blue-500 hover:underline">
                                +90 (555) 123 45 67
                            </a>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="p-3 bg-green-500/10 rounded-lg">
                                    <FaMapMarkerAlt className="text-green-500 text-xl" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Adres</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Ofisimiz</p>
                                </div>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300">
                                İstanbul, Türkiye
                            </p>
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-6">
                            <div className="flex items-center gap-4 mb-3">
                                <div className="p-3 bg-purple-500/10 rounded-lg">
                                    <FaClock className="text-purple-500 text-xl" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 dark:text-white">Çalışma Saatleri</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">Hafta içi</p>
                                </div>
                            </div>
                            <p className="text-gray-700 dark:text-gray-300">
                                Pazartesi - Cuma: 09:00 - 18:00
                            </p>
                        </div>
                    </div>

                    <div className="bg-gradient-to-r from-coral/10 to-orange-400/10 rounded-xl p-6 border border-coral/20">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <FaPaperPlane className="text-coral" />
                            Mesaj Gönderin
                        </h2>
                        <form className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Adınız Soyadınız
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral"
                                    placeholder="Adınızı girin"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    E-posta Adresiniz
                                </label>
                                <input
                                    type="email"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral"
                                    placeholder="ornek@email.com"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Konu
                                </label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral"
                                    placeholder="Mesaj konusu"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Mesajınız
                                </label>
                                <textarea
                                    rows="5"
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral resize-none"
                                    placeholder="Mesajınızı buraya yazın..."
                                ></textarea>
                            </div>
                            <button
                                type="submit"
                                className="w-full bg-gradient-to-r from-coral to-orange-400 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                <FaPaperPlane />
                                Mesaj Gönder
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default ContactPage;
