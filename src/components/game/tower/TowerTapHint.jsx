import React from 'react';
import { LuHand } from 'react-icons/lu';

/** İlk birkaç kulede: "Dokun, katı bırak" ipucu (ilk yerleşimle kalkar). */
const TowerTapHint = ({ touch }) => (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.5rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-4" role="note">
        <p className="flex items-center gap-2.5 rounded-full bg-slate-950/65 px-4 py-2.5 text-sm font-bold text-white shadow-lg ring-1 ring-white/15 backdrop-blur-sm game-fade-up">
            <LuHand className="tower-tap text-xl text-gold" aria-hidden="true" />
            {touch ? 'Kat tam üstteyken ekrana dokun!' : 'Kat tam üstteyken tıkla ya da Boşluk / Enter!'}
        </p>
    </div>
);

export default TowerTapHint;
