import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import OpinionCard from '../components/OpinionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget, PopularQuestionsWidget } from '../components/Widgets';
import { opinionsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { FaPenFancy, FaSearch } from 'react-icons/fa';
import SEO from '../components/SEO';

const OpinionsPage = () => {
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialSearch = searchParams.get('search') || '';
    const [opinions, setOpinions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [searchQuery, setSearchQuery] = useState(initialSearch);
    const [page, setPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalPages, setTotalPages] = useState(1);
    const observerTarget = useRef(null);

    const fetchOpinions = useCallback(async (pageNum = 1, append = false) => {
        if (append) setLoadingMore(true);
        else setLoading(true);
        try {
            const response = await opinionsAPI.getAll({
                page: pageNum,
                per_page: 10,
                search: searchQuery || undefined,
            });
            const data = response.data?.data;
            const list = data?.opinions || [];
            const pagination = data?.pagination || {};
            if (append) {
                setOpinions(prev => [...prev, ...list]);
            } else {
                setOpinions(list);
            }
            setPage(pagination.current_page ?? pageNum);
            setTotalPages(pagination.total_pages ?? 1);
            setHasNextPage((pagination.current_page ?? pageNum) < (pagination.total_pages ?? 1));
        } catch (err) {
            console.error('Görüşler yüklenirken hata:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery]);

    useEffect(() => {
        const next = new URLSearchParams(searchParams);
        if (searchQuery) next.set('search', searchQuery);
        else next.delete('search');
        setSearchParams(next);
    }, [searchQuery]);

    useEffect(() => {
        setPage(1);
        fetchOpinions(1, false);
    }, [searchQuery, fetchOpinions]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0]?.isIntersecting && hasNextPage && !loadingMore && !loading) {
                    fetchOpinions(page + 1, true);
                }
            },
            { threshold: 0.1 }
        );
        const target = observerTarget.current;
        if (target) observer.observe(target);
        return () => { if (target) observer.unobserve(target); };
    }, [hasNextPage, loadingMore, loading, page, fetchOpinions]);

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
            <PopularQuestionsWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO
                title="Benceler - Herkesler Soruyor"
                description="Kullanıcıların konular hakkındaki görüşlerini okuyun, kendi yazınızı paylaşın."
            />
            <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white">Benceler</h1>
                        <p className="text-gray-500 dark:text-gray-400 mt-1">Konular hakkında yazılar, yorumlar ve beğeniler.</p>
                    </div>
                    {user && (
                        <Link
                            to="/opinions/yaz"
                            className="inline-flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                        >
                            <FaPenFancy /> Yazı Yaz
                        </Link>
                    )}
                </div>

                <div className="relative">
                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Bencelerde ara..."
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-coral focus:border-transparent"
                    />
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto" />
                        <p className="mt-4 text-gray-500">Yükleniyor...</p>
                    </div>
                ) : opinions.length > 0 ? (
                    <>
                        <div className="flex flex-col gap-4">
                            {opinions.map((op) => (
                                <OpinionCard key={op.id} opinion={op} />
                            ))}
                        </div>
                        <div ref={observerTarget} className="py-6">
                            {loadingMore && (
                                <div className="text-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral mx-auto" />
                                </div>
                            )}
                            {!hasNextPage && opinions.length > 0 && (
                                <p className="text-center text-gray-400 text-sm">Tüm yazılar gösterildi.</p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-12 text-center border border-gray-100 dark:border-gray-700">
                        <p className="text-gray-500 dark:text-gray-400 text-lg">Henüz görüş yok</p>
                        <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">Arama kriterini değiştirin veya ilk yazıyı siz paylaşın.</p>
                        {user && (
                            <Link to="/opinions/yaz" className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-coral text-white rounded-xl font-medium">
                                <FaPenFancy /> Yazı Yaz
                            </Link>
                        )}
                    </div>
                )}
            </div>
        </MainLayout>
    );
};

export default OpinionsPage;
