import React, { useState, useEffect } from 'react';
import MainLayout from '../layouts/MainLayout';
import { FaHashtag, FaSearch, FaFire, FaChartLine } from 'react-icons/fa';
import { Link, useSearchParams } from 'react-router-dom';
import { tagsAPI } from '../services/api';

const TagsPage = () => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchParams] = useSearchParams();
    const selectedTag = searchParams.get('tag');

    const [popularTags, setPopularTags] = useState([]);
    const [allTags, setAllTags] = useState([]);
    const [loadingTags, setLoadingTags] = useState(false);

    useEffect(() => {
        const fetchTags = async () => {
            try {
                setLoadingTags(true);
                const [popularRes, allRes] = await Promise.all([
                    tagsAPI.getPopular({ limit: 12, period_days: 14 }),
                    tagsAPI.getAll({ limit: 200 }),
                ]);

                setPopularTags(popularRes.data?.data?.tags || []);
                setAllTags(allRes.data?.data?.tags || []);
            } catch (err) {
                console.error('Etiketler yüklenemedi:', err);
            } finally {
                setLoadingTags(false);
            }
        };

        fetchTags();
    }, []);

    const filteredTags = allTags.filter((t) =>
        (t.tag || '').toLowerCase().includes(searchQuery.toLowerCase())
    );

    const trendingTags = popularTags;
    const trendingTagSet = new Set(trendingTags.map((t) => t.tag));

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
                                        key={tag.tag}
                                        to={`/questions?tag=${tag.tag}`}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-400 to-red-500 text-white rounded-full font-semibold hover:shadow-lg transition-all"
                                    >
                                        <FaHashtag />
                                        {tag.tag}
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
                        {loadingTags ? (
                            <div className="text-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral mx-auto" />
                                <p className="text-gray-500 dark:text-gray-400 mt-3">Etiketler yükleniyor...</p>
                            </div>
                        ) : filteredTags.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {filteredTags.map((tag) => (
                                    <Link
                                        key={tag.tag}
                                        to={`/questions?tag=${tag.tag}`}
                                        className={`p-4 rounded-xl border-2 transition-all ${
                                            selectedTag === tag.tag
                                                ? 'border-coral bg-coral/10'
                                                : 'border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700/50 hover:border-coral/50'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <FaHashtag className="text-coral" />
                                                <span className="font-semibold text-gray-900 dark:text-white">
                                                    {tag.tag}
                                                </span>
                                            </div>
                                            {trendingTagSet.has(tag.tag) && (
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
