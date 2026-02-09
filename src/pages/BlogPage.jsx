import React from 'react';
import MainLayout from '../layouts/MainLayout';
import SEO from '../components/SEO';
import { FaNewspaper } from 'react-icons/fa';

const BlogPage = () => {
    return (
        <MainLayout>
            <SEO title="Blog - Herkesler Soruyor" description="Herkesler Soruyor blog ve güncel yazılar." />
            <div className="max-w-4xl mx-auto px-4 py-8">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full mb-4">
                            <FaNewspaper className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">Blog</h1>
                        <p className="text-gray-600 dark:text-gray-400">Yakında burada güncel yazılar ve duyurular yer alacak.</p>
                    </div>
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <p>İçerikler hazırlandıkça bu sayfa güncellenecektir.</p>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default BlogPage;
