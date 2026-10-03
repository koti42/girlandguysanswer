import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { FaBalanceScale, FaChartBar, FaQuestionCircle, FaTags } from 'react-icons/fa';
import { PageHeader, Tabs } from '../../panel/ui';
import GameOverview from './game/GameOverview';
import GameQuestions from './game/GameQuestions';
import GameCategories from './game/GameCategories';
import GameDilemmas from './game/GameDilemmas';

const TABS = [
    { key: 'overview', label: 'Genel bakış', icon: FaChartBar, Component: GameOverview },
    { key: 'questions', label: 'Sorular', icon: FaQuestionCircle, Component: GameQuestions },
    { key: 'categories', label: 'Kategoriler', icon: FaTags, Component: GameCategories },
    { key: 'dilemmas', label: 'İkilemler', icon: FaBalanceScale, Component: GameDilemmas },
];

/**
 * Oyun Merkezi yönetimi (/cpl-manage/game/:tab). Sekme URL'de durur:
 * menüden ve komut paletinden doğrudan açılabilir, yenilemede kaybolmaz.
 */
export default function Game() {
    const { tab = 'overview' } = useParams();
    const navigate = useNavigate();
    const active = TABS.find((t) => t.key === tab);
    if (!active) return <Navigate to="/cpl-manage/game" replace />;
    const { Component } = active;

    return (
        <div>
            <PageHeader title="Oyun Merkezi" description="Bilgi Arenası, Günün Sorusu, Düello, İkilem ve Herkesler Koşuyor içerikleri. Puanlama sunucuda yapılır; buradaki değişiklikler yeni oyunlara uygulanır.">
                <Tabs items={TABS.map(({ key, label, icon }) => ({ key, label, icon }))} value={tab} onChange={(k) => navigate(k === 'overview' ? '/cpl-manage/game' : `/cpl-manage/game/${k}`)} />
            </PageHeader>
            <Component key={tab} />
        </div>
    );
}
