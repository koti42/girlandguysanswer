import React from 'react';

/*
 * İlk katlarda erken/geç dokunuş uyarısı: motor katı bırakmadı (oyun
 * bitmedi), oyuncuya ne zaman basacağını söyler. key ile her uyarıda
 * animasyon baştan oynar.
 */
const TEXT = {
    early: { title: 'Erken!', body: 'Kat kulenin üstüne gelsin, sonra bas.' },
    late: { title: 'Geç kaldın!', body: 'Kat geri dönüyor, kulenin üstüne gelince bas.' },
};

const TowerNudge = ({ nudge }) => {
    if (!nudge) return null;
    const t = TEXT[nudge.kind] || TEXT.early;
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-30 flex justify-center px-4" aria-hidden="true">
            <p key={nudge.id} className="rounded-2xl bg-amber-400/95 px-4 py-2.5 text-center text-slate-950 shadow-xl game-shake" data-testid="tower-nudge">
                <span className="block text-lg font-black">{t.title}</span>
                <span className="block text-sm font-bold">{t.body}</span>
            </p>
        </div>
    );
};

export default TowerNudge;
