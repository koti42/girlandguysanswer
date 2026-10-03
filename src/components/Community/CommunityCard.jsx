import React from 'react';
import { FaMicrophone, FaKeyboard, FaUserFriends, FaLock, FaHourglassHalf } from 'react-icons/fa';
import { normalizeAvatarUrl } from '../../utils/avatarUrl';
import { hoursUntilClose } from '../../utils/communityClosing';

const CommunityCard = ({ community, onClick }) => {
    const isVoice = community.type === 'voice';
    const bgGradient = isVoice
        ? 'from-violet-600 via-purple-600 to-indigo-600'
        : 'from-blue-500 via-cyan-500 to-teal-500';
    // Sahibi "Açık bırak" deyip ayrılan yazılı oda: kapanmasına kalan saat
    const closingInHours = hoursUntilClose(community.closes_at);

    return (
        <div
            onClick={() => onClick(community)}
            className="group relative h-48 overflow-hidden rounded-2xl cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-[1.02]"
        >
            {/* Background Layer */}
            <div className={`absolute inset-0 bg-gradient-to-br ${bgGradient} transition-transform duration-500 group-hover:scale-110`}>
                {community.image_url && (
                    <div className="absolute inset-0">
                        <img
                            src={community.image_url}
                            alt=""
                            className="w-full h-full object-cover opacity-30 mix-blend-overlay"
                        />
                        <div className={`absolute inset-0 bg-gradient-to-t ${isVoice ? 'from-purple-900/90' : 'from-blue-900/90'} to-transparent`} />
                    </div>
                )}
                {/* Decorative Shapes */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-black/10 rounded-full blur-xl -ml-5 -mb-5 pointer-events-none" />
            </div>

            {/* Content Layer */}
            <div className="relative h-full p-5 flex flex-col justify-between text-white">

                {/* Header */}
                <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/20 backdrop-blur-md border border-white/10 shadow-sm">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                            <span className="text-[10px] font-bold tracking-wider">CANLI</span>
                        </div>
                        {community.privacy === 'private' && (
                            <div className="p-1.5 rounded-full bg-black/20 backdrop-blur-md">
                                <FaLock size={10} />
                            </div>
                        )}
                        {closingInHours !== null && (
                            <div
                                data-testid="community-closing-badge"
                                className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-400 text-amber-950 shadow-sm text-[10px] font-bold leading-none whitespace-nowrap"
                            >
                                <FaHourglassHalf size={9} aria-hidden="true" />
                                <span>Sahip ayrıldı · {closingInHours} sa içinde kapanır</span>
                            </div>
                        )}
                    </div>

                    <div className="shrink-0 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-inner">
                        {isVoice ? <FaMicrophone size={14} /> : <FaKeyboard size={14} />}
                    </div>
                </div>

                {/* Main Content */}
                <div>
                    <h3 className="text-xl font-bold mb-1 leading-tight drop-shadow-md line-clamp-2">
                        {community.title}
                    </h3>
                    <p className="text-white/80 text-sm line-clamp-1 font-medium">
                        {community.description || 'Topluluk sohbetine katıl!'}
                    </p>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            {community.owner?.avatar ? (
                                <img
                                    src={normalizeAvatarUrl(community.owner.avatar)}
                                    alt={community.owner.username}
                                    className="w-8 h-8 rounded-full border-2 border-white/80 shadow-sm"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/30 flex items-center justify-center text-xs font-bold">
                                    {community.owner?.username?.[0]?.toUpperCase()}
                                </div>
                            )}
                            <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                                <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                            </div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] text-white/60 uppercase tracking-wide font-bold">Yayıncı</span>
                            <span className="text-xs font-semibold">{community.owner?.username}</span>
                        </div>
                    </div>

                    <div className="flex items-center px-3 py-1.5 rounded-lg bg-white/15 backdrop-blur-sm border border-white/10 group-hover:bg-white/25 transition-colors">
                        <FaUserFriends className="mr-1.5 text-white/90" size={14} />
                        <span className="font-bold text-sm">{community.participants_count || 0}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CommunityCard;
