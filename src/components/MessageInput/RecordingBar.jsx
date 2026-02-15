import React from 'react';
import { FaMicrophone, FaTimes, FaStop } from 'react-icons/fa';

function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function RecordingBar({
    volumeWave,
    recordingTime,
    onCancel,
    onStop,
}) {
    return (
        <div className="mb-2 px-3 py-2 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
                <div className="flex-shrink-0 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-coral/10 dark:bg-coral/20 flex items-center justify-center ring-2 ring-coral/30 dark:ring-coral/40">
                    <FaMicrophone className="text-coral text-sm sm:text-base animate-pulse" />
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-0.5 sm:gap-1.5 overflow-hidden min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-200 truncate">Ses kaydediliyor</p>
                    <div className="flex items-end justify-start gap-[2px] h-4 sm:h-6 min-h-[16px] sm:min-h-[24px] overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: 'touch' }}>
                        {volumeWave.length === 0 ? (
                            <div className="flex items-end gap-[2px]">
                                {Array.from({ length: 20 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="w-0.5 rounded-full bg-coral/40 dark:bg-coral/50"
                                        style={{ height: `${3 + (i % 3) * 3}px` }}
                                    />
                                ))}
                            </div>
                        ) : (
                            volumeWave.map((level, i) => (
                                <div
                                    key={i}
                                    className="w-[2px] min-w-[2px] sm:w-[3px] sm:min-w-[3px] rounded-full bg-coral/80 dark:bg-coral transition-[height] duration-75 ease-out flex-shrink-0"
                                    style={{ height: `${Math.max(2, 3 + level * 12)}px` }}
                                />
                            ))
                        )}
                    </div>
                    <p className="text-sm sm:text-base font-mono font-semibold text-gray-600 dark:text-gray-400 tabular-nums">{formatTime(recordingTime)}</p>
                </div>
            </div>
            <div className="flex items-center justify-end gap-2 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 pt-2 sm:border-0 sm:pt-0">
                <button
                    type="button"
                    onClick={onCancel}
                    className="px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors flex items-center gap-1.5"
                >
                    <FaTimes className="text-[10px]" />
                    İptal
                </button>
                <button
                    type="button"
                    onClick={onStop}
                    className="px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-coral hover:bg-coral/90 text-white text-xs font-semibold shadow-sm hover:shadow transition-all flex items-center gap-1.5"
                >
                    <FaStop className="text-[10px]" />
                    Gönder
                </button>
            </div>
        </div>
    );
}
