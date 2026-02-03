import React, { useState } from 'react';
import { FaPoll, FaUndo } from 'react-icons/fa';
import { pollsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';

const PollWidget = ({ poll, onPollUpdate }) => {
    const { user: currentUser } = useAuth();
    const [selectedOptionId, setSelectedOptionId] = useState(null);
    const [selectedOptionIds, setSelectedOptionIds] = useState(poll?.user_voted_option_ids || []);
    const [submitting, setSubmitting] = useState(false);

    const hasVoted = (poll?.user_voted_option_ids?.length ?? 0) > 0;
    const canVote = currentUser && !poll?.is_ended && !hasVoted;
    const canChangeVote = currentUser && !poll?.is_ended && hasVoted;

    const handleVote = async () => {
        if (!poll || !currentUser || poll.is_ended) return;
        setSubmitting(true);
        try {
            const body = poll.allow_multiple
                ? { poll_option_ids: selectedOptionIds }
                : { poll_option_id: selectedOptionId };
            if (poll.allow_multiple && selectedOptionIds.length === 0) {
                setSubmitting(false);
                return;
            }
            if (!poll.allow_multiple && !selectedOptionId) {
                setSubmitting(false);
                return;
            }
            const response = await pollsAPI.vote(poll.id, body);
            if (response.data?.data?.poll) onPollUpdate?.(response.data.data.poll);
        } catch (err) {
            console.error('Vote error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleRemoveVote = async () => {
        if (!poll || !currentUser) return;
        setSubmitting(true);
        try {
            const response = await pollsAPI.removeVote(poll.id);
            if (response.data?.data?.poll) onPollUpdate?.(response.data.data.poll);
        } catch (err) {
            console.error('Remove vote error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const toggleMultiOption = (optionId) => {
        setSelectedOptionIds(prev =>
            prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
        );
    };

    if (!poll) return null;

    const showResults = hasVoted || poll.is_ended;
    const totalVotes = poll.total_votes ?? 0;

    return (
        <div className="mt-4 p-5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-200 dark:border-indigo-800">
            <div className="flex items-center gap-2 mb-4">
                <FaPoll className="text-indigo-600 dark:text-indigo-400" />
                <h3 className="font-bold text-gray-900 dark:text-white">
                    {poll.title || 'Anket'}
                </h3>
                {poll.is_ended && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300">
                        Bitti
                    </span>
                )}
            </div>
            {totalVotes > 0 && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                    Toplam {totalVotes} oy
                </p>
            )}

            <div className="space-y-3">
                {poll.options?.map((option) => {
                    const isSelected = poll.allow_multiple
                        ? selectedOptionIds.includes(option.id)
                        : selectedOptionId === option.id;
                    const pct = totalVotes > 0 ? (option.percentage ?? (option.votes_count / totalVotes) * 100) : 0;

                    return (
                        <div key={option.id}>
                            {showResults ? (
                                <div>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-800 dark:text-white font-medium truncate pr-2">{option.text}</span>
                                        <span className="shrink-0 text-gray-600 dark:text-gray-400">%{typeof pct === 'number' ? pct.toFixed(1) : pct} ({option.votes_count ?? 0})</span>
                                    </div>
                                    <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden">
                                        <div
                                            className="h-full bg-indigo-500 dark:bg-indigo-600 transition-all duration-500"
                                            style={{ width: `${Math.min(100, pct)}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <label className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                                    isSelected ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30' : 'border-gray-200 dark:border-gray-600 hover:border-indigo-300'
                                }`}>
                                    <input
                                        type={poll.allow_multiple ? 'checkbox' : 'radio'}
                                        name={`poll-${poll.id}`}
                                        checked={isSelected}
                                        onChange={() => poll.allow_multiple ? toggleMultiOption(option.id) : setSelectedOptionId(option.id)}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-gray-900 dark:text-white font-medium">{option.text}</span>
                                </label>
                            )}
                        </div>
                    );
                })}
            </div>

            {canVote && (
                <div className="mt-4 flex gap-2">
                    <button
                        type="button"
                        onClick={handleVote}
                        disabled={submitting || (poll.allow_multiple ? selectedOptionIds.length === 0 : !selectedOptionId)}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {submitting ? 'Kaydediliyor...' : 'Oy Ver'}
                    </button>
                </div>
            )}
            {canChangeVote && (
                <div className="mt-4">
                    <button
                        type="button"
                        onClick={handleRemoveVote}
                        disabled={submitting}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <FaUndo /> Oyunu kaldır
                    </button>
                </div>
            )}
        </div>
    );
};

export default PollWidget;
