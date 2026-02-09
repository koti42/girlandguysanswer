import React from 'react';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaCookie, FaCog, FaChartLine } from 'react-icons/fa';

const CerezPolitikasiPage = () => {
    const sections = [
        { title: 'Çerez nedir?', content: 'Çerezler, web sitelerinin cihazınızda küçük metin dosyaları saklamasıdır. Oturum bilgisi, tercihler ve kullanım istatistikleri gibi verileri tutarak size daha iyi bir deneyim sunmamıza yardımcı olur.', icon: FaCookie },
        { title: 'Kullandığımız çerezler', content: 'Zorunlu çerezler: Site çalışması ve güvenli giriş için gereklidir. Tercih çerezleri: Dil ve tema gibi ayarlarınızı hatırlar. Analitik çerezler: Anonim kullanım istatistikleri toplar.', icon: FaCog },
        { title: 'Yönetim', content: 'Tarayıcı ayarlarınızdan çerezleri silebilir veya engelleyebilirsiniz. Bazı çerezleri kapatmanız site işlevlerinin bir kısmının çalışmamasına neden olabilir.', icon: FaChartLine },
    ];

    return (
        <MainLayout>
            <SEO title="Çerez Politikası - Herkesler Soruyor" description="Çerez kullanımı ve yönetimi hakkında bilgi." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 rounded-full mb-4">
                            <FaCookie className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Çerez Politikası</h1>
                        <p className="text-gray-600 dark:text-gray-400">Çerez kullanımı ve tercihleriniz</p>
                    </div>
                    <div className="space-y-6">
                        {sections.map((s, i) => {
                            const Icon = s.icon;
                            return (
                                <div key={i} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600 flex gap-4">
                                    <Icon className="text-amber-500 text-xl flex-shrink-0 mt-0.5" />
                                    <div>
                                        <h3 className="font-bold text-gray-900 dark:text-white">{s.title}</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{s.content}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default CerezPolitikasiPage;
