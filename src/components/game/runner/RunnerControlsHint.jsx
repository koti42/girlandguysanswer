import React from 'react';
import { controlsHintText } from './runnerUtils';

/*
 * Oyun içi kontrol ipucu: geri sayımda ve koşunun ilk saniyelerinde altta
 * tek satır. Kontroller lobideki "Nasıl oynanır?" kartında da var ama
 * mobilde o kart ilk ekranın çok altında kalıyor; ilk kez oynayan ilk
 * engelde (~7 sn) ölmesin. Soru paneli üstte, bu yüzden ipucu altta.
 * Ekran okuyucu için oyun alanının aria-label'ı zaten kontrolleri anlatıyor.
 */
const RunnerControlsHint = ({ touch = false }) => (
    <div
        className="pointer-events-none absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-[max(0.75rem,env(safe-area-inset-left))]"
        aria-hidden="true"
        data-testid="runner-controls-hint"
    >
        <p className="max-w-full rounded-full bg-slate-950/60 px-3 py-1.5 text-center text-xs font-semibold text-white ring-1 ring-white/15 backdrop-blur-sm game-fade-up sm:text-sm">
            {controlsHintText(touch)}
        </p>
    </div>
);

export default RunnerControlsHint;
