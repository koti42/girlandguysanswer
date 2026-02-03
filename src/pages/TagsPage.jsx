import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaHashtag, FaSearch, FaFire, FaChartLine } from 'react-icons/fa';
import { Link } from 'react-router-dom';

const TagsPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTag, setSelectedTag] = useState(null);

    // Örnek etiketler - gerçek uygulamada API'den gelecek
    const [tags] = useState([
        { id: 1, name: 'aşk', count: 1250, trending: true },
        { id: 2, name: 'ilişkiler', count: 980, trending: true },
        { id: 3, name: 'moda', count: 750, trending: false },
        { id: 4, name: 'güzellik', count: 650, trending: false },
        { id: 5, name: 'teknoloji', count: 540, trending: true },
        { id: 6, name: 'sağlık', count: 480, trending: false },
        { id: 7, name: 'eğitim', count: 420, trending: false },
        { id: 8, name: 'yemek', count: 380, trending: false },
        { id: 9, name: 'seyahat', count: 320, trending: false },
        { id: 10, name: 'spor', count: 290, trending: false },
        { id: 11, name: 'müzik', count: 250, trending: false },
        { id: 12, name: 'film', count: 220, trending: false },
        { id: 13, name: 'kitap', count: 180, trending: false },
        { id: 14, name: 'oyun', count: 150, trending: false },
        { id: 15, name: 'hobi', count: 120, trending: false },
    ]);

    const filteredTags = tags.filter(tag =>
        tag.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const trendingTags = tags.filter(tag => tag.trending);

    return (
        <MainLayout>
            <div className="max-w-4xl mx-auto">
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8 md:p-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-pink-500 to-rose-500 rounded-full mb-4">
                            <FaHashtag className="text-2xl text-white" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-white mb-3">
                            Etiketler
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400">
                            Popüler etiketleri keşfedin ve ilginizi çeken konulara göz atın
                        </p>
                    </div>

                    {/* Arama */}
                    <div className="mb-8">
                        <div className="relative">
                            <FaSearch className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Etiket ara..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-coral"
                            />
                        </div>
                    </div>

                    {/* Trend Olanlar */}
                    {trendingTags.length > 0 && (
                        <div className="mb-8">
                            <div className="flex items-center gap-2 mb-4">
                                <FaFire className="text-orange-500" />
                                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Trend Olanlar
                                </h2>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {trendingTags.map((tag) => (
                                    <Link
                                        key={tag.id}
                                        to={`/questions?tag=${tag.name}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-400 to-red-500 text-white rounded-full font-semibold hover:shadow-lg transition-all"
                                    >
                                        <FaHashtag />
                                        {tag.name}
                                        <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full">
                                            {tag.count}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Tüm Etiketler */}
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <FaChartLine className="text-gray-600 dark:text-gray-400" />
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                                Tüm Etiketler
                            </h2>
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                ({filteredTags.length})
                            </span>
                        </div>
                        {filteredTags.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredTags.map((tag) => (
                                    <Link
                                        key={tag.id}
                                        to={`/questions?tag=${tag.name}`}
                                        className={`p-4 rounded-xl border-2 transition-all ${
                                            selectedTag === tag.id
                                                ? 'border-coral bg-coral/10'
                                                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:border-coral/50'
                                        }`}
                                        onClick={() => setSelectedTag(tag.id)}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <FaHashtag className="text-coral" />
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {tag.name}
                                                </span>
                                            </div>
                                            {tag.trending && (
                                                <FaFire className="text-orange-500 text-xs" />
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                            {tag.count} soru
                                        </p>
                                    </Link>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-12">
                                <FaHashtag className="text-4xl text-gray-400 mx-auto mb-4" />
                                <p className="text-gray-600 dark:text-gray-400">
                                    "{searchQuery}" için etiket bulunamadı
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default TagsPage;
