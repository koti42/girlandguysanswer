import React from 'react';

/** Oda listesi yüklenirken kart iskeletleri (CommunityCard ölçüsünde). */
const CommunitySkeletonGrid = ({ count = 4 }) => (
    <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <span className="sr-only">Odalar yükleniyor…</span>
        {Array.from({ length: count }, (_, i) => (
            <div
                key={i}
                data-testid="community-skeleton"
                aria-hidden="true"
                className="h-48 rounded-2xl bg-white dark:bg-gray-800 ring-1 ring-gray-900/5 dark:ring-white/10 p-5 flex flex-col justify-between motion-safe:animate-pulse"
            >
                <div className="flex justify-between">
                    <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
                    <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                </div>
                <div className="space-y-2">
                    <div className="h-5 w-3/4 rounded-lg bg-gray-200 dark:bg-gray-700" />
                    <div className="h-3.5 w-1/2 rounded-lg bg-gray-100 dark:bg-gray-700/70" />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-gray-700" />
                        <div className="h-3 w-20 rounded bg-gray-200 dark:bg-gray-700" />
                    </div>
                    <div className="h-7 w-12 rounded-lg bg-gray-200 dark:bg-gray-700" />
                </div>
            </div>
        ))}
    </div>
);

export default CommunitySkeletonGrid;
