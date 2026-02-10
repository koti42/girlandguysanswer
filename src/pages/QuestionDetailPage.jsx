import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { FaQuestionCircle, FaHome, FaArrowLeft } from 'react-icons/fa';
import DOMPurify from 'dompurify';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget, PopularQuestionsWidget } from '../components/Widgets';
import { questionsAPI } from '../services/api';
import SingleQuestionView from '../components/SingleQuestionView';
import SEO from '../components/SEO';

const stripHtml = (html) => (html ? DOMPurify.sanitize(html, { ALLOWED_TAGS: [] }) : '');

const QuestionDetailPage = () => {
    const { slug } = useParams();
    const navigate = useNavigate();

    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        const fetchInitialQuestion = async () => {
            setLoading(true);
            setQuestions([]); // Reset questions on slug change
            setPage(1); // Reset page
            try {
                const response = await questionsAPI.getById(slug);
                const initialQuestion = response.data.data.question;

                // Important: We set the state with the NEW question only.
                // Infinite scroll will add more later.
                setQuestions([initialQuestion]);

            } catch (err) {
                if (err.response?.status === 404) {
                    setError("not_found");
                } else {
                    setError("Soru yüklenirken bir hata oluştu.");
                }
            } finally {
                setLoading(false);
            }
        };

        if (slug) {
            fetchInitialQuestion();
        }
    }, [slug]);

    const fetchNextQuestion = useCallback(async () => {
        if (loadingMore) return;
        setLoadingMore(true);

        try {

            const nextPage = page + 1;
            const listResponse = await questionsAPI.getAll({
                page: nextPage,
                limit: 1, // Fetch 1 at a time for smooth infinite scroll
                sort: 'newest' // Or popular
            });

            const nextQuestionPreview = listResponse.data.data.questions[0];

            if (nextQuestionPreview) {
                try {
                    const detailResponse = await questionsAPI.getById(nextQuestionPreview.slug);
                    const fullQuestionData = detailResponse.data.data.question;

                    setQuestions(prev => {
                        if (prev.find(q => q.id === fullQuestionData.id)) return prev;
                        return [...prev, fullQuestionData];
                    });
                    setPage(nextPage);
                } catch (detailErr) {
                    console.error("Could not fetch details for next question", detailErr);
                }
            }
        } catch (err) {
            console.error("Next question could not be loaded", err);
        } finally {
            setLoadingMore(false);
        }
    }, [page, loadingMore]);

    const observerTarget = useRef(null);
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && !loadingMore && !loading) {
                    fetchNextQuestion();
                }
            },
            { threshold: 0.1 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [fetchNextQuestion, loadingMore, loading]);

    useEffect(() => {
        const handleScroll = () => {
            const questionElements = document.querySelectorAll('[data-question-slug]');
            let visibleSlug = null;
            let maxVisibility = 0;

            questionElements.forEach(el => {
                const rect = el.getBoundingClientRect();
                const viewHeight = window.innerHeight;

                const visibleHeight = Math.max(0, Math.min(rect.bottom, viewHeight) - Math.max(rect.top, 0));
                const visibility = visibleHeight / viewHeight;

                if (visibility > maxVisibility && visibility > 0.1) { // Threshold for considering it "active"
                    maxVisibility = visibility;
                    visibleSlug = el.getAttribute('data-question-slug');
                }
            });

            if (visibleSlug && visibleSlug !== slug) {
                window.history.replaceState(null, '', `/question/${visibleSlug}`);
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, [slug, questions]);

    const SidebarContent = (
        <>
            <TrendsWidget />
            <TopUsersWidget />
            <AnnouncementsWidget />
            <PopularQuestionsWidget />
        </>
    );

    if (loading) {
        return (
            <MainLayout>
                <div className="flex justify-center items-center h-64">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral"></div>
                </div>
            </MainLayout>
        );
    }

    if (error === "not_found") {
        return (
            <MainLayout sidebar={SidebarContent}>
                <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
                    <div className="max-w-md w-full text-center">
                        <div className="mb-6 flex justify-center">
                            <div className="w-24 h-24 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                                <FaQuestionCircle className="text-5xl text-gray-400 dark:text-gray-600" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                            Soru Bulunamadı
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                            Bu soru kaldırılmış, gizlenmiş veya mevcut değil olabilir.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link
                                to="/"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                            >
                                <FaHome />
                                Ana Sayfaya Dön
                            </Link>
                            <button
                                onClick={() => navigate(-1)}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaArrowLeft />
                                Geri Git
                            </button>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    if (error) {
        return (
            <MainLayout sidebar={SidebarContent}>
                <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
                    <div className="max-w-md w-full text-center">
                        <div className="mb-6 flex justify-center">
                            <div className="w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full flex items-center justify-center">
                                <FaQuestionCircle className="text-5xl text-red-500 dark:text-red-400" />
                            </div>
                        </div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                            Bir Hata Oluştu
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mb-8 text-lg">
                            {error}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <button
                                onClick={() => window.location.reload()}
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-coral to-orange-400 text-white font-semibold rounded-xl hover:shadow-lg transition-all"
                            >
                                Sayfayı Yenile
                            </button>
                            <Link
                                to="/"
                                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                            >
                                <FaHome />
                                Ana Sayfa
                            </Link>
                        </div>
                    </div>
                </div>
            </MainLayout>
        );
    }

    const currentQuestion = questions.find(q => q.slug === slug) || questions[0];

    return (
        <MainLayout sidebar={SidebarContent}>
            {currentQuestion && (
                <SEO
                    title={`${currentQuestion.title} - Herkesler Soruyor`}
                    description={stripHtml(currentQuestion.description) || currentQuestion.title}
                    jsonLd={[
                        {
                            "@context": "https://schema.org",
                            "@type": "QAPage",
                            "mainEntity": {
                                "@type": "Question",
                                "name": currentQuestion.title,
                                "text": stripHtml(currentQuestion.description) || currentQuestion.title,
                                "answerCount": currentQuestion.answer_count || 0,
                                "upvoteCount": currentQuestion.likes_count || 0,
                                "author": {
                                    "@type": "Person",
                                    "name": currentQuestion.is_anonymous ? "Gizli Kullanıcı" : (currentQuestion.user?.username || "Kullanıcı")
                                }
                            }
                        },
                        {
                            "@context": "https://schema.org",
                            "@type": "BreadcrumbList",
                            "itemListElement": [
                                {
                                    "@type": "ListItem",
                                    "position": 1,
                                    "name": "Ana Sayfa",
                                    "item": window.location.origin
                                },
                                {
                                    "@type": "ListItem",
                                    "position": 2,
                                    "name": "Sorular",
                                    "item": `${window.location.origin}/questions`
                                },
                                {
                                    "@type": "ListItem",
                                    "position": 3,
                                    "name": currentQuestion.title,
                                    "item": window.location.href
                                }
                            ]
                        }
                    ]}
                />
            )}
            <div className="flex flex-col gap-8">
                {questions.map((q, index) => (
                    <div key={q.id} data-question-slug={q.slug}>
                        <SingleQuestionView
                            initialQuestion={q}
                            slug={q.slug}
                        />
                        
                        {/* Separator between questions */}
                        {index < questions.length - 1 && (
                            <div className="my-8 flex items-center gap-4">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"></div>
                                <div className="px-4 py-2 bg-gradient-to-r from-coral to-orange-400 text-white rounded-full text-xs font-bold uppercase tracking-widest whitespace-nowrap">
                                    Sonraki Soru
                                </div>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 dark:via-gray-600 to-transparent"></div>
                            </div>
                        )}
                    </div>
                ))}

                {/* Loader / Sentinel / Ad Placeholder */}
                <div ref={observerTarget} className="py-8 text-center scroll-mt-20">
                    {/* Ad Placeholder before loading next question */}
                    {!loading && !error && (
                        <div className="mx-auto w-full max-w-2xl min-h-[120px] bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700/50 flex flex-col items-center justify-center mb-8 p-6 text-gray-400 dark:text-gray-500">
                            <span className="text-xs uppercase tracking-widest font-semibold mb-2">Sponsorlu İçerik</span>
                            <div className="w-1/2 h-2 bg-gray-200 dark:bg-gray-700/50 rounded-full mb-2"></div>
                            <div className="w-1/3 h-2 bg-gray-200 dark:bg-gray-700/50 rounded-full"></div>
                        </div>
                    )}

                    {loadingMore && (
                        <div className="flex flex-col items-center gap-2 text-gray-500 dark:text-gray-400 animate-pulse">
                            <div className="h-8 w-8 border-2 border-coral border-t-transparent rounded-full animate-spin"></div>
                            <span className="font-medium">Sıradaki soruya geçiliyor...</span>
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
};

export default QuestionDetailPage;
