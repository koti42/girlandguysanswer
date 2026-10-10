import React, { useState, useEffect, useRef, useCallback } from 'react';
import MainLayout from '../layouts/MainLayout';
import HeroSection from '../components/HeroSection';
import CategoryNav from '../components/CategoryNav';
import FeedTabs from '../components/FeedTabs';
import QuestionCard from '../components/QuestionCard';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget, UnansweredWidget } from '../components/Widgets';
import InterestPicker, { INTERESTS_PROMPT_KEY } from '../components/InterestPicker';
import { FaMars, FaVenus, FaGlobe, FaRobot, FaCommentDots, FaPen, FaTimes } from 'react-icons/fa';
import { questionsAPI, categoriesAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

import { Link, useSearchParams } from 'react-router-dom';

const QuestionsPage = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const tagFilter = searchParams.get('tag') || undefined;
    const initialQuery = searchParams.get('search') || '';
    const [searchQuery, setSearchQuery] = useState(initialQuery);
    const [categories, setCategories] = useState([]);
    const [, setLoadingCategories] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState({ id: 0, title: 'Tümü' });
    const [genderFilter, setGenderFilter] = useState('all');
    const [aiFilter, setAiFilter] = useState(false);
    const [unansweredFilter, setUnansweredFilter] = useState(searchParams.get('unanswered') === '1');
    const [sortBy, setSortBy] = useState('popular');
    const { isAuthenticated, user } = useAuth();
    // İlgi alanı penceresi: giriş yapmış, ilgi alanı seçmemiş ve daha önce kapatmamış kullanıcıya bir kez.
    const [interestOpen, setInterestOpen] = useState(false);
    useEffect(() => {
        if (!isAuthenticated) return;
        let dismissed = false;
        try { dismissed = localStorage.getItem(INTERESTS_PROMPT_KEY) === '1'; } catch { dismissed = true; }
        if (dismissed) return;
        usersAPI.getInterests().then((r) => {
            if ((r.data?.data?.interests || []).length === 0) setInterestOpen(true);
        }).catch(() => {});
    }, [isAuthenticated]);
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [hasNextPage, setHasNextPage] = useState(false);
    const [totalPages, setTotalPages] = useState(1);

    const observerTarget = useRef(null);

    // handleModerationAction'ın referansı sabit kalsın diye güncel değerler
    // ref üzerinden okunuyor: state'e doğrudan bağımlı olsaydı callback her
    // sayfa yüklemesinde yeniden üretilir, QuestionCard'ın memo'su bozulurdu.
    const fetchQuestionsRef = useRef(null);
    const currentPageRef = useRef(1);

    // Kategorileri API'den çek
    useEffect(() => {
        const fetchCategories = async () => {
            try {
                setLoadingCategories(true);
                const response = await categoriesAPI.getAll();
                setCategories(response.data.data.categories || []);
            } catch (error) {
                console.error('Kategoriler yüklenirken hata:', error);
            } finally {
                setLoadingCategories(false);
            }
        };

        fetchCategories();
    }, []);

    const fetchQuestions = useCallback(async (page = 1, append = false) => {
        if (append) {
            setLoadingMore(true);
        } else {
            setLoading(true);
        }

        try {
            // "Takip ettiklerim" sekmesi: following=true + en yeni sırası.
            const params = {
                search: searchQuery || undefined,
                category: selectedCategory.id !== 0 ? selectedCategory.name : undefined,
                gender: genderFilter !== 'all' ? genderFilter : undefined,
                sort: sortBy === 'following' ? 'newest' : sortBy,
                page: page,
                limit: 10,
                ...(sortBy === 'following' ? { following: 'true' } : {}),
                ...(tagFilter ? { tag: tagFilter } : {}),
                ...(aiFilter ? { has_ai_answers: true } : {}),
                ...(unansweredFilter ? { no_answers: 1 } : {}),
            };

            const response = await questionsAPI.getAll(params);
            const newQuestions = response.data.data.questions;
            const pagination = response.data.data.pagination;

            if (append) {
                setQuestions(prev => [...prev, ...newQuestions]);
            } else {
                setQuestions(newQuestions);
            }

            setCurrentPage(pagination.currentPage);
            setHasNextPage(pagination.hasNextPage);
            setTotalPages(pagination.totalPages);
        } catch {
            setError("Sorular yüklenirken bir sorun oluştu.");
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, [searchQuery, selectedCategory, genderFilter, sortBy, tagFilter, aiFilter, unansweredFilter]);

    // Ref tazeleme çizimde değil efektte: çizim sırasında ref yazmak React'in
    // önerdiği kullanım değil (bkz. react-hooks/refs).
    useEffect(() => {
        fetchQuestionsRef.current = fetchQuestions;
        currentPageRef.current = currentPage;
    });

    /**
     * Moderasyon sonrası liste tazeleme.
     *
     * Eskiden her kartın prop'una inline ok fonksiyonu olarak veriliyordu: her
     * çizimde yeni bir referans üretiyor, dolayısıyla QuestionCard'ı memo'lamak
     * hiçbir işe yaramıyordu. useCallback ile referans sabitlendi.
     *
     * fetchQuestions'a bağımlı olmamak için sayfa numarası ref üzerinden
     * okunuyor; yoksa her sayfa yüklemesinde referans yine değişirdi.
     */
    const handleModerationAction = useCallback((action, questionId) => {
        if (action === 'remove') {
            setQuestions(prev => prev.filter(item => item.id !== questionId));
        } else {
            fetchQuestionsRef.current(currentPageRef.current, false);
        }
    }, []);



    useEffect(() => {
        const params = new URLSearchParams(searchParams);
        if (searchQuery) params.set('search', searchQuery);
        else params.delete('search');
        setSearchParams(params, { replace: true });
    }, [searchQuery, searchParams, setSearchParams]);

    useEffect(() => {
        setCurrentPage(1);
        setQuestions([]);
        fetchQuestions(1, false);
    }, [searchQuery, selectedCategory, genderFilter, sortBy, tagFilter, aiFilter, unansweredFilter]);

    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasNextPage && !loadingMore && !loading) {
                    fetchQuestions(currentPage + 1, true);
                }
            },
            // rootMargin: sayfanın dibine varmadan ~600px önce yüklemeye başla.
            // Eskiden sentinel'in ekrana girmesi bekleniyordu, yani kullanıcı
            // listenin sonuna çarpıyor ve isteğin dönmesini bekliyordu; mobilde
            // bu "takıldı" gibi hissettiren asıl şeydi.
            { threshold: 0, rootMargin: '600px 0px' }
        );

        const currentTarget = observerTarget.current;
        if (currentTarget) {
            observer.observe(currentTarget);
        }

        return () => {
            if (currentTarget) {
                observer.unobserve(currentTarget);
            }
        };
    }, [hasNextPage, loadingMore, loading, currentPage, fetchQuestions]);

    const SidebarContent = (
        <>
            <UnansweredWidget />
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
        </>
    );

    return (
        <MainLayout sidebar={SidebarContent} onSearch={setSearchQuery}>
            <div className="flex flex-col gap-8">
                <HeroSection />

                <InterestPicker isOpen={interestOpen} onClose={() => setInterestOpen(false)} onSaved={() => setSortBy('forYou')} />

                {/* Soru sorma çağrısı: ilk etkileşimi kolaylaştır */}
                <Link to="/ask" className="group flex items-center gap-4 rounded-[20px] bg-white dark:bg-gray-800 border border-line dark:border-gray-700 shadow-card hover:shadow-card-hover transition-shadow p-4 sm:p-5">
                    <span className="shrink-0 w-11 h-11 rounded-2xl bg-pink-soft text-brand-pink flex items-center justify-center"><FaCommentDots className="text-lg" /></span>
                    <span className="flex-1 min-w-0">
                        <span className="block font-bold text-ink dark:text-white">Aklında bir soru mu var{user?.username ? `, ${user.username}` : ''}?</span>
                        <span className="block text-sm text-ink-muted dark:text-gray-400 truncate">Toplulukla paylaş, farklı bakış açılarını keşfet. Cevap yazan herkes puan kazanır.</span>
                    </span>
                    <span className="shrink-0 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-pink text-white text-sm font-semibold group-hover:bg-[#D63C8A] transition-colors"><FaPen className="text-xs" /> Soru sor</span>
                </Link>

                <div className="flex flex-col gap-4">
                    {/* Kategori rayı: kompakt chip'ler */}
                    <CategoryNav categories={categories} selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />

                    <div className="flex flex-col gap-3">
                        <FeedTabs activeTab={sortBy} onTabChange={setSortBy} showFollowing={isAuthenticated} />

                        {/* Hızlı filtreler: kim soruyor + tür */}
                        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1" role="group" aria-label="Filtreler">
                            {[
                                { key: 'all', label: 'Herkes', icon: FaGlobe, color: '#202B3C' },
                                { key: 'female', label: 'Kadınlar', icon: FaVenus, color: '#E74798' },
                                { key: 'male', label: 'Erkekler', icon: FaMars, color: '#3978E8' },
                            ].map((g) => {
                                const active = genderFilter === g.key;
                                return (
                                    <button key={g.key} type="button" onClick={() => setGenderFilter(g.key)} aria-pressed={active}
                                        style={active ? { backgroundColor: g.color, borderColor: g.color } : { color: g.color }}
                                        className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${active ? 'text-white' : 'bg-white dark:bg-gray-800 border-line dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                                        <g.icon className="text-xs" /> {g.label}
                                    </button>
                                );
                            })}
                            <span className="shrink-0 w-px h-6 self-center bg-line dark:bg-gray-700 mx-1" aria-hidden="true" />
                            <button type="button" onClick={() => setUnansweredFilter((p) => !p)} aria-pressed={unansweredFilter}
                                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${unansweredFilter ? 'bg-amber-500 border-amber-500 text-white' : 'bg-white dark:bg-gray-800 border-line dark:border-gray-700 text-amber-600 hover:bg-amber-50 dark:hover:bg-gray-700'}`}>
                                <FaCommentDots className="text-xs" /> Cevapsız
                            </button>
                            <button type="button" onClick={() => setAiFilter((prev) => !prev)} aria-pressed={aiFilter}
                                className={`shrink-0 inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-semibold border transition-colors motion-reduce:transition-none focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue ${aiFilter ? 'bg-indigo-500 border-indigo-500 text-white' : 'bg-white dark:bg-gray-800 border-line dark:border-gray-700 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-gray-700'}`}>
                                <FaRobot className="text-xs" /> AI Soruları
                            </button>
                            {(genderFilter !== 'all' || aiFilter || unansweredFilter || selectedCategory.id !== 0) && (
                                <button type="button" onClick={() => { setGenderFilter('all'); setAiFilter(false); setUnansweredFilter(false); setSelectedCategory({ id: 0, name: 'Tümü' }); }}
                                    className="shrink-0 inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-[13px] font-semibold bg-gray-100 dark:bg-gray-700 text-ink-muted hover:text-ink dark:hover:text-white">
                                    <FaTimes className="text-xs" /> Temizle
                                </button>
                            )}
                        </div>

                        {searchQuery && (
                            <div className="bg-blue-50 border-l-4 border-coral p-4 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <span className="font-semibold">{questions.length}</span> sonuç bulundu: "{searchQuery}"
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-6">
                            {loading ? (
                                <div className="text-center py-10">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto"></div>
                                    <p className="mt-4 text-gray-500">Sorular yükleniyor...</p>
                                </div>
                            ) : error ? (
                                <div className="text-center py-10 text-red-500">
                                    {error}
                                </div>
                            ) : questions.length > 0 ? (
                                <>
                                    {questions.map((q) => (
                                        <QuestionCard
                                            key={q.id}
                                            question={q}
                                            onModerationAction={handleModerationAction}
                                        />
                                    ))}

                                    {/* Intersection Observer Target */}
                                    <div ref={observerTarget} className="py-4">
                                        {loadingMore && (
                                            <div className="text-center">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral mx-auto"></div>
                                                <p className="mt-2 text-sm text-gray-500">Daha fazla yükleniyor...</p>
                                            </div>
                                        )}
                                        {!hasNextPage && questions.length > 0 && (
                                            <p className="text-center text-gray-400 text-sm">
                                                Tüm sorular gösterildi ({currentPage}/{totalPages} sayfa)
                                            </p>
                                        )}
                                    </div>
                                </>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-[20px] border border-line dark:border-gray-700 p-12 text-center">
                                    <p className="text-ink dark:text-white text-lg font-semibold">
                                        {sortBy === 'following' ? 'Takip ettiklerinden henüz soru yok' : sortBy === 'forYou' ? 'Sana Özel akış için ilgi alanı seç' : 'Bu kriterlere uygun soru bulunamadı'}
                                    </p>
                                    <p className="text-ink-muted text-sm mt-2">
                                        {sortBy === 'following' ? 'Yeni üyeleri takip et; soruları burada görünsün.' : sortBy === 'forYou' ? 'Ayarlar › İlgi alanları bölümünden 3–5 konu seçebilirsin.' : 'Filtreleri değiştirmeyi deneyin'}
                                    </p>
                                    {sortBy === 'forYou' && isAuthenticated && (
                                        <button type="button" onClick={() => setInterestOpen(true)} className="mt-4 h-10 px-5 rounded-xl bg-brand-blue text-white text-sm font-semibold">İlgi alanlarımı seç</button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </MainLayout>
    );
};

export default QuestionsPage;
