import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaHeart, FaComment, FaEye, FaMars, FaVenus, FaPaperPlane } from 'react-icons/fa';
import QuestionActionsMenu from './QuestionActionsMenu';

const QuestionCard = ({ question }) => {
    const [showReplyBox, setShowReplyBox] = useState(false);
    const [replyText, setReplyText] = useState('');

    const handleSubmitReply = (e) => {
        e.preventDefault();
        if (replyText.trim()) {
            console.log('Hızlı cevap gönderildi:', replyText);
            setReplyText('');
            setShowReplyBox(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl p-6 shadow-soft hover:shadow-soft-hover transition-all duration-300 border border-gray-50 flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <Link to={`/profile/${question.user.name}`}>
                        <img
                            src={question.user.avatar}
                            alt={question.user.name}
                            className="w-12 h-12 rounded-full border border-gray-100 hover:border-coral transition-colors cursor-pointer"
                        />
                    </Link>
                    <div>
                        <div className="flex items-center gap-1">
                            <Link to={`/profile/${question.user.name}`} className="font-bold text-gray-800 hover:underline">
                                {question.user.name}
                            </Link>
                            {question.user.gender === 'female' ? (
                                <FaVenus className="text-pink-500" />
                            ) : (
                                <FaMars className="text-blue-500" />
                            )}
                        </div>
                        <span className="text-xs text-gray-500">{question.category}</span>
                    </div>
                </div>
                <QuestionActionsMenu />
            </div>

            {/* Content */}
            <div>
                <Link to={`/question/${question.id}`}>
                    <h3 className="text-lg font-bold text-gray-800 mb-3 leading-snug hover:text-coral transition-colors cursor-pointer">
                        {question.title}
                    </h3>
                </Link>

                <div className="flex flex-wrap gap-2 mb-4">
                    {question.tags.map((tag, idx) => (
                        <span key={idx} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 transition-colors">
                            {tag}
                        </span>
                    ))}
                </div>

                {question.image && (
                    <Link to={`/question/${question.id}`}>
                        <div className="rounded-xl overflow-hidden mb-4 shadow-sm cursor-pointer">
                            <img src={question.image} alt="Question" className="w-full h-64 object-cover hover:scale-105 transition-transform duration-500" />
                        </div>
                    </Link>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-50 text-gray-500 text-sm">
                <div className="flex gap-6">
                    <button className="flex items-center gap-2 hover:text-coral transition-colors">
                        <FaHeart /> <span>{question.stats.likes}</span>
                    </button>
                    <button
                        onClick={() => setShowReplyBox(!showReplyBox)}
                        className="flex items-center gap-2 hover:text-blue-500 transition-colors"
                    >
                        <FaComment /> <span>{question.stats.comments}</span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <FaEye /> <span>{question.stats.views}</span>
                </div>
            </div>

            {/* Quick Reply Box */}
            {showReplyBox && (
                <form onSubmit={handleSubmitReply} className="mt-2 pt-4 border-t border-gray-100">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Hızlı cevap yaz..."
                            className="flex-1 px-4 py-2 rounded-xl border border-gray-300 focus:outline-none focus:border-coral focus:ring-1 focus:ring-coral/20 transition-all text-sm"
                            autoFocus
                        />
                        <button
                            type="submit"
                            disabled={!replyText.trim()}
                            className="bg-gradient-to-r from-coral to-orange-400 text-white p-2.5 rounded-xl hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <FaPaperPlane />
                        </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">Detaylı cevap için soruya tıklayın</p>
                </form>
            )}
        </div>
    );
};

export default QuestionCard;
