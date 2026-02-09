import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaListAlt, FaCheckCircle, FaTimesCircle } from 'react-icons/fa';

const KullanimKurallariPage = () => {
    const rules = [
        { title: 'Saygılı olun', desc: 'Tüm üyelere saygılı ve nazik davranın. Hakaret, küfür veya aşağılayıcı ifade kullanmayın.', type: 'must' },
        { title: 'Özgün içerik', desc: 'Kendi içeriğinizi paylaşın. Başkalarının içeriklerini izinsiz kopyalamayın.', type: 'must' },
        { title: 'Spam yasak', desc: 'Spam, tekrarlayan mesajlar veya izinsiz reklam paylaşımı yasaktır.', type: 'forbidden' },
        { title: 'Kişisel bilgi paylaşmayın', desc: 'Kendinizin veya başkalarının kişisel bilgilerini paylaşmayın.', type: 'forbidden' },
        { title: 'Nefret söylemi yasak', desc: 'Irk, din, cinsiyet veya diğer özelliklere dayalı nefret söylemi kesinlikle yasaktır.', type: 'forbidden' },
    ];

    return (
        <MainLayout>
            <SEO title="Kullanım Kuralları - Herkesler Soruyor" description="Platform kullanım kuralları ve topluluk standartları." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-coral to-orange-400 rounded-full mb-4">
                            <FaListAlt className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Kullanım Kuralları</h1>
                        <p className="text-gray-600 dark:text-gray-400">Topluluk standartları ve platform kuralları</p>
                    </div>
                    <div className="space-y-4">
                        {rules.map((r, i) => (
                            <div key={i} className={`p-4 rounded-xl flex gap-4 ${r.type === 'forbidden' ? 'bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30' : 'bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-600'}`}>
                                {r.type === 'must' ? <FaCheckCircle className="text-green-500 text-xl flex-shrink-0 mt-0.5" /> : <FaTimesCircle className="text-red-500 text-xl flex-shrink-0 mt-0.5" />}
                                <div>
                                    <h3 className="font-bold text-gray-900 dark:text-white">{r.title}</h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{r.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-8 text-sm text-gray-500 dark:text-gray-400">
                        Detaylı yayın ilkeleri için <Link to="/yayin-ilkeleri" className="text-coral hover:underline">Yayın İlkeleri</Link> sayfamızı inceleyebilirsiniz.
                    </p>
                </div>
            </div>
        </MainLayout>
    );
};

export default KullanimKurallariPage;
