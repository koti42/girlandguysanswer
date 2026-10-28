import React from 'react';
import { LuBrain, LuCpu, LuGlobe, LuShieldCheck, LuSiren, LuZap } from 'react-icons/lu';

const STEPS = [
    { icon: LuGlobe, title: 'Küreyi döndür, düğüme dokun', text: '14 veri merkezi gerçek konumlarında. Turkuaz güvenli, turuncu sızma var, kızıl ele geçirilmiş, gri izole.' },
    { icon: LuShieldCheck, title: 'Firewall güçlendir, temizle, izole et', text: 'Güvenlik duvarı sızmayı yavaşlatır (₵). Anti-YZ temizliği enfeksiyonu %25 düşürür. Kablo kesmek YZ geçişini durdurur ama paniği ve gelir kaybını büyütür.' },
    { icon: LuCpu, title: 'Bütçe (₵) temiz düğümlerden gelir', text: 'İzole olmayan, enfeksiyonu düşük her düğüm saniyede işlem gücü kadar ₵ kazandırır. Ele geçirilen düğüm hiç kazandırmaz.' },
    { icon: LuBrain, title: 'Savunma ağacını aç', text: 'Siber Savunma, Kuantum Şifre Çözümü ve Kriz Yönetimi: 9 geliştirme. Deşifre hızlandırıcıları zaferin anahtarı.' },
    { icon: LuSiren, title: 'Sıfırıncı gün saldırısında müdahale et', text: 'Alarm çaldığında 12 saniyelik veri matrisi mini oyunu: kızıl bozuk düğümleri yakala, mavilere dokunma. Başarı düğümü tamamen temizler (+150₵).' },
    { icon: LuZap, title: 'İki zafer yolu, iki yenilgi', text: 'Çekirdek deşifre %100 ya da 30. günden sonra tam temizlik = zafer. YZ hakimiyeti %100 ya da panik %100 = yenilgi.' },
];

/** Lobideki "Nasıl oynanır" bölümü. */
const PzHowTo = () => (
    <section className="game-card rounded-3xl p-4 sm:p-5" aria-labelledby="pz-howto-title">
        <h2 id="pz-howto-title" className="mb-3 font-extrabold">Nasıl oynanır?</h2>
        <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="flex gap-3 rounded-2xl bg-slate-50 p-3 dark:bg-white/5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-fuchsia-500 text-white" aria-hidden="true">
                        <Icon />
                    </span>
                    <span>
                        <span className="block text-sm font-extrabold">
                            {i + 1}. {title}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-600 dark:text-slate-300">{text}</span>
                    </span>
                </li>
            ))}
        </ol>
    </section>
);

export default PzHowTo;
