import React from 'react';
import { FaHeart, FaComment, FaEye, FaEllipsisV, FaMars, FaVenus } from 'react-icons/fa';

const QuestionCard = ({ question }) => {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-soft hover:shadow-soft-hover transition-all duration-300 border border-gray-50 flex flex-col gap-4">
            {/* Header */}
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <img
                        src={question.user.avatar}
                        alt={question.user.name}
                        className="w-12 h-12 rounded-full border border-gray-100"
                    />
                    <div>
                        <div className="flex items-center gap-1">
                            <span className="font-bold text-gray-800">{question.user.name}</span>
                            {question.user.gender === 'female' ? (
                                <FaVenus className="text-pink-500" />
                            ) : (
                                <FaMars className="text-blue-500" />
                            )}
                        </div>
                        <span className="text-xs text-gray-500">{question.category}</span>
                    </div>
                </div>
                <button className="text-gray-400 hover:text-gray-600">
                    <FaEllipsisV />
                </button>
            </div>

            {/* Content */}
            <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3 leading-snug">
                    {question.title}
                </h3>

                <div className="flex flex-wrap gap-2 mb-4">
                    {question.tags.map((tag, idx) => (
                        <span key={idx} className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium hover:bg-gray-200 transition-colors">
                            {tag}
                        </span>
                    ))}
                </div>

                {question.image && (
                    <div className="rounded-xl overflow-hidden mb-4 shadow-sm">
                        <img src={question.image} alt="Question" className="w-full h-64 object-cover hover:scale-105 transition-transform duration-500" />
                    </div>
                )}
            </div>

            {/* Footer / Stats */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-50 text-gray-500 text-sm">
                <div className="flex gap-6">
                    <button className="flex items-center gap-2 hover:text-coral transition-colors">
                        <FaHeart /> <span>{question.stats.likes}</span>
                    </button>
                    <button className="flex items-center gap-2 hover:text-blue-500 transition-colors">
                        <FaComment /> <span>{question.stats.comments}</span>
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    <FaEye /> <span>{question.stats.views}</span>
                </div>
            </div>
        </div>
    );
};

export default QuestionCard;
