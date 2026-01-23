import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import MainLayout from '../layouts/MainLayout';
import { TrendsWidget, TopUsersWidget, AnnouncementsWidget } from '../components/Widgets';
import { questionsAPI } from '../services/api';
import SingleQuestionView from '../components/SingleQuestionView';

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
            try {
                const response = await questionsAPI.getById(slug);
                const initialQuestion = response.data.data.question;

                setQuestions([initialQuestion]);

            } catch (err) {
                setError("Soru bulunamadı veya yüklenirken bir hata oluştu.");
            } finally {
                setLoading(false);
            }
        };

        if (slug && questions.length === 0) {
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

    if (error) {
        return (
            <MainLayout>
                <div className="p-8 text-center text-red-500">{error}</div>
            </MainLayout>
        );
    }

    return (
        <MainLayout sidebar={SidebarContent}>
            <div className="flex flex-col gap-8">
                {questions.map((q, index) => (
                    <div key={q.id} data-question-slug={q.slug}>
                        <SingleQuestionView
                            initialQuestion={q}
                            slug={q.slug}
                        />
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
