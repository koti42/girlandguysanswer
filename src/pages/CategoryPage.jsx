import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questionsAPI, categoriesAPI } from '../services/api';
import { getCategoryIcon, getCategoryColor } from '../utils/categoryIcons';
import { FaArrowLeft, FaGoogle, FaFacebook, FaInstagram, FaTwitter, FaDownload } from 'react-icons/fa';
import SEO from '../components/SEO';

const CategoryPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();

    const [category, setCategory] = useState(null);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('popular'); // popular, newest, unanswered
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);

    const observerTarget = useRef(null);

    useEffect(() => {
        const fetchCategory = async () => {
            try {
                const response = await categoriesAPI.getBySlug(slug);
                setCategory(response.data.data.category);
            } catch (err) {
                console.error('Kategori yüklenirken hata:', err);
            }
        };

        fetchCategory();
    }, [slug]);

    // Soruları getir
    const fetchQuestions = useCallback(async (pageNum = 1, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            let params = {
                category: slug,
                limit: 10,
                page: pageNum,
            };

            // Aktif tab'a göre sıralama
            if (activeTab === 'newest') {
                params.sort = 'newest';
            } else if (activeTab === 'unanswered') {
                // Cevapsız sorular - bunu backend'deki endpoint'ten kontrol etmen lazım
                // Eğer answers_count parametresi yoksa, ekle
                params.hasAnswers = false;
            } else {
                params.sort = 'popular';
            }

            const response = await questionsAPI.getAll(params);
            const newQuestions = response.data.data.questions;
            const pagination = response.data.data.pagination;

            if (append) {
                setQuestions(prev => [...prev, ...newQuestions]);
            } else {
                setQuestions(newQuestions);
            }

            setPage(pagination.currentPage);
            setHasMore(pagination.hasNextPage);
        } catch (err) {
            console.error('Sorular yüklenirken hata:', err);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [slug, activeTab]);

    useEffect(() => {
        setPage(1);
        setQuestions([]);
        fetchQuestions(1, false);
    }, [activeTab, fetchQuestions]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
                    fetchQuestions(page + 1, true);
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => observer.disconnect();
    }, [hasMore, loadingMore, loading, page, fetchQuestions]);

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    const categoryName = category?.name || slug;
    const hexColor = category?.color || '#6B7280';
    const IconComponent = getCategoryIcon(categoryName);

    return (
        <MainLayout sidebar={SidebarContent}>
            <SEO
                title={`${categoryName} Soruları - Herkesler Soruyor`}
                description={`${categoryName} kategorisinde sorulan sorular, cevaplar ve tartışmalar.`}
            />

            <div className="flex flex-col gap-6">
                {/* Kategori Header */}
                <div 
                    style={{ backgroundColor: hexColor }}
                    className="rounded-3xl p-8 md:p-12 text-white shadow-lg"
                >
                    <div className="flex items-center gap-4 mb-4">
                        <button
                            onClick={() => navigate('/questions')}
                            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            <FaArrowLeft className="text-2xl" />
                        </button>
                        <IconComponent className="text-5xl opacity-90" />
                    </div>
                    
                    <h1 className="text-4xl md:text-5xl font-bold mb-2">{categoryName}</h1>
                    <p className="text-white/90 text-lg mb-6">{category?.description || 'Bu kategori hakkında sorular sorun ve cevap alın.'}</p>

                    {/* Menü Butonları - Google Play, Sosyal Medya */}
                    <div className="flex flex-wrap gap-3 items-center">
                        <a
                            href="https://play.google.com/store/apps/details?id=com.herkeslersoruyor.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 bg-white text-gray-900 font-semibold px-6 py-3 rounded-xl hover:shadow-xl transition-all transform hover:scale-105"
                        >
                            <FaDownload /> Google Play'den İndir
                        </a>

                        <div className="flex gap-2">
                            <a href="https://instagram.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                                <FaInstagram className="text-2xl" />
                            </a>
                            <a href="https://facebook.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                                <FaFacebook className="text-2xl" />
                            </a>
                            <a href="https://twitter.com/herkeslersoruyor" target="_blank" rel="noopener noreferrer" className="p-3 bg-white/20 hover:bg-white/30 rounded-xl transition-colors">
                                <FaTwitter className="text-2xl" />
                            </a>
                        </div>
                    </div>
                </div>

                {/* Sekmeler */}
                <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('popular')}
                        className={`px-4 py-3 font-semibold whitespace-nowrap border-b-2 transition-colors ${
                            activeTab === 'popular'
                                ? 'border-coral text-coral'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Keşfet (Popüler)
                    </button>
                    <button
                        onClick={() => setActiveTab('newest')}
                        className={`px-4 py-3 font-semibold whitespace-nowrap border-b-2 transition-colors ${
                            activeTab === 'newest'
                                ? 'border-coral text-coral'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        En Yeniler
                    </button>
                    <button
                        onClick={() => setActiveTab('unanswered')}
                        className={`px-4 py-3 font-semibold whitespace-nowrap border-b-2 transition-colors ${
                            activeTab === 'unanswered'
                                ? 'border-coral text-coral'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Cevapsız Sorular
                    </button>
                </div>

                {/* Sorular Listesi */}
                <div className="space-y-4">
                    {loading ? (
                        <div className="flex justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                        </div>
                    ) : questions.length > 0 ? (
                        <>
                            {questions.map(question => (
                                <QuestionCard key={question.id} question={question} />
                            ))}
                            <div ref={observerTarget} className="py-8 text-center">
                                {loadingMore && (
                                    <div className="flex justify-center items-center gap-2">
                                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-coral border-t-transparent"></div>
                                        <span className="text-gray-500">Daha fazla soru yükleniyor...</span>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-12 text-gray-500">
                            <p className="text-lg">Bu kategoride henüz soru yok.</p>
                            <p className="text-sm mt-2">İlk soru seni olabilir!</p>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default CategoryPage;
