import React, { useEffect, useState } from 'react';
import { perfectWord } from './towerUtils';

/*
 * Mükemmel yerleşimde ekranın ortasında yükselip sönen yazı: "Mükemmel!",
 * kombo büyüdükçe "Harika!", "Efsane!"... Katın büyüdüğü yerleşimde
 * "Kat büyüdü!" alt yazısı. Her yeni yerleşim (fx.id) animasyonu baştan
 * oynatır; süre sonunda kendini kaldırır (azaltılmış harekette de).
 * Yazı koyu yarı saydam bir hapın içinde: her gökyüzü renginde okunur.
 */
const TowerPerfectPop = ({ fx }) => {
    const [goneId, setGoneId] = useState(null);
    useEffect(() => {
        if (!fx) return undefined;
        const t = setTimeout(() => setGoneId(fx.id), 1150);
        return () => clearTimeout(t);
    }, [fx]);
    if (!fx || goneId === fx.id) return null;
    const multi = fx.combo >= 2 || fx.grew;
    return (
        <div className="pointer-events-none absolute inset-x-0 top-[34%] z-20" aria-hidden="true">
            <div key={fx.id} className="tower-perfect absolute left-1/2 flex flex-col items-center whitespace-nowrap">
                {/* Koyu yarı saydam hap: açık gökyüzünde de okunur (bkz. tower.css). */}
                <div className="tower-perfect-pill" data-testid="tower-perfect-pill" data-lines={multi ? 'multi' : 'single'}>
                    <span className="tower-perfect-word text-4xl sm:text-5xl font-black italic tracking-tight">{perfectWord(fx.combo)}</span>
                    {fx.combo >= 2 && <span className="tower-perfect-combo mt-0.5 text-lg font-black">x{fx.combo} kombo</span>}
                    {fx.grew && <span className="tower-perfect-grew mt-0.5 text-xs font-extrabold uppercase tracking-widest">Kat büyüdü!</span>}
                </div>
            </div>
        </div>
    );
};

export default TowerPerfectPop;
