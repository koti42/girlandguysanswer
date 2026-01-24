import React, { useState, useEffect } from 'react';
import { FaTimes, FaHeart } from 'react-icons/fa';
import UserAvatar from './UserAvatar';
import { Link } from 'react-router-dom';
import { questionsAPI } from '../services/api';
import FollowersList from './FollowersList'; // Re-using FollowersList logic for follow buttons if possible, or implementing custom list

const LikersModal = ({ isOpen, onClose, type, id }) => {
    const [likers, setLikers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);

    useEffect(() => {
        if (isOpen && id) {
            setLikers([]);
            setPage(1);
            setHasMore(true);
            fetchLikers(1);
        }
    }, [isOpen, id, type]);

    const fetchLikers = async (pageNum) => {
        setLoading(true);
        try {
            const response = await questionsAPI.getLikers({
                type,
                id,
                page: pageNum
            });

            const newLikers = response.data.data.likers || [];
            const pagination = response.data.data.pagination;

            setLikers(prev => pageNum === 1 ? newLikers : [...prev, ...newLikers]);
            setHasMore(pagination.current_page < pagination.last_page);
        } catch (error) {
            console.error('Error fetching likers:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadMore = () => {
        if (!loading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            fetchLikers(nextPage);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center bg-white dark:bg-gray-800 z-10">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                        <FaHeart className="text-red-500" />
                        Beğenenler
                    </h3>
                    <button
                        onClick={onClose}
                        className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* List Content */}
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                    {likers.length > 0 ? (
                        <>
                            {/* Re-using logic similar to FollowersList but simplified for modal */}
                            <FollowersList followers={likers} type="likers" />

                            {hasMore && (
                                <div className="text-center mt-4">
                                    <button
                                        onClick={loadMore}
                                        disabled={loading}
                                        className="text-sm text-coral hover:underline font-medium disabled:opacity-50"
                                    >
                                        {loading ? 'Yükleniyor...' : 'Daha fazla göster'}
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        !loading && (
                            <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                                Henüz kimse beğenmemiş.
                            </div>
                        )
                    )}

                    {loading && page === 1 && (
                        <div className="flex justify-center py-10">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-coral"></div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LikersModal;
