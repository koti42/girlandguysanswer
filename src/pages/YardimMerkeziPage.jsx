import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaQuestionCircle, FaBook, FaEnvelope } from 'react-icons/fa';

const YardimMerkeziPage = () => {
    const topics = [
        { title: 'Hesap ve giriş', desc: 'Kayıt, giriş, şifre sıfırlama ve profil ayarları.', link: '/signup', linkText: 'Kayıt ol' },
        { title: 'Soru ve cevap', desc: 'Soru nasıl sorulur, cevap nasıl verilir, en iyi cevap seçimi.', link: '/ask', linkText: 'Soru sor' },
        { title: 'Gizlilik ve güvenlik', desc: 'Anonim kullanım, gizlilik ayarları ve veri güvenliği.', link: '/gizlilik-politikasi', linkText: 'Gizlilik' },
        { title: 'İletişim', desc: 'Teknik destek ve genel sorularınız için bize ulaşın.', link: '/iletisim', linkText: 'İletişim' },
    ];

    return (
        <MainLayout>
            <SEO title="Yardım Merkezi - Herkesler Soruyor" description="Sık sorulan sorular ve yardım konuları." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-full mb-4">
                            <FaQuestionCircle className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Yardım Merkezi</h1>
                        <p className="text-gray-600 dark:text-gray-400">Sık sorulan sorular ve rehberler</p>
                    </div>
                    <div className="grid gap-4">
                        {topics.map((t, i) => (
                            <Link key={i} to={t.link} className="flex items-start gap-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 hover:border-coral transition-colors">
                                <FaBook className="text-coral text-xl flex-shrink-0 mt-0.5" />
                                <div className="flex-1">
                                    <h3 className="font-bold text-gray-900 dark:text-white">{t.title}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t.desc}</p>
                                    <span className="text-coral text-sm font-medium mt-2 inline-block">{t.linkText} →</span>
                                </div>
                            </Link>
                        ))}
                    </div>
                    <div className="mt-8 p-4 bg-coral/10 rounded-xl border border-coral/20">
                        <p className="text-gray-700 dark:text-gray-300 text-sm flex items-center gap-2">
                            <FaEnvelope className="text-coral" />
                            Özel bir sorunuz mu var? <Link to="/iletisim" className="text-coral font-semibold hover:underline">İletişim</Link> sayfasından bize yazın.
                        </p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default YardimMerkeziPage;
