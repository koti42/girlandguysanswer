import React from 'react';
import { Link } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaAd, FaBullhorn } from 'react-icons/fa';

const ReklamPage = () => {
    return (
        <MainLayout>
            <SEO title="Reklam - Herkesler Soruyor" description="Reklam ve iş birlikleri hakkında bilgi." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-full mb-4">
                            <FaAd className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Reklam</h1>
                        <p className="text-gray-600 dark:text-gray-400">Markanızı Herkesler Soruyor topluluğuna taşıyın</p>
                    </div>
                    <div className="space-y-4 text-gray-600 dark:text-gray-400">
                        <p>Reklam ve sponsorlu içerik talepleriniz için bizimle iletişime geçebilirsiniz. Hedef kitle, format ve bütçe için özel teklifler sunuyoruz.</p>
                        <p className="flex items-center gap-2 text-coral font-medium">
                            <FaBullhorn />
                            Reklam ve iş birliği: <a href="mailto:reklam@herkeslersoruyor.com" className="hover:underline">reklam@herkeslersoruyor.com</a>
                        </p>
                    </div>
                    <div className="mt-8">
                        <Link to="/iletisim" className="inline-flex items-center gap-2 text-coral font-semibold hover:underline">
                            İletişim sayfasına git →
                        </Link>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default ReklamPage;
