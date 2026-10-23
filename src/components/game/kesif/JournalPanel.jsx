import React, { useCallback, useMemo, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelTabs from './PanelTabs.jsx';
import { JOURNAL_TABS, abilityRows, discoveryRows, pct, questState, statRows } from './panelJournal.js';
import { useApiSnapshot } from './panelHooks.js';
import { touchText } from './kxHudUtils.js';

const Progress = ({ value, label, tone = 'accent' }) => (
    <span
        className={`kp-bar kp-bar-${tone}`}
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
    >
        <span style={{ width: `${value}%` }} />
    </span>
);

/*
 * Günlük: Görevler / Başarımlar / Keşifler / İstatistik / Yetenekler sekmeleri; ilerleme çubukları (role=progressbar),
 * durum rozetleri hem renk hem metinle (renk körlüğü). Props: api (getJournal), onClose, version, initialTab,
 * accessibility, reducedMotion.
 */
const JournalPanel = ({ api, onClose, version = 0, initialTab = 'gorev', accessibility = false, reducedMotion = false }) => {
    const read = useCallback(() => api.getJournal(), [api]);
    const [j] = useApiSnapshot(read, version);
    const [tab, setTab] = useState(JOURNAL_TABS.some((t) => t.key === initialTab) ? initialTab : 'gorev');

    const quests = useMemo(() => (j && Array.isArray(j.quests) ? j.quests : []), [j]);
    const achievements = useMemo(() => (j && Array.isArray(j.achievements) ? j.achievements : []), [j]);
    const stats = useMemo(() => statRows(j && j.stats), [j]);
    const discoveries = useMemo(() => discoveryRows(j && j.discovered), [j]);
    const abilities = useMemo(() => abilityRows(j && j.abilities), [j]);

    const doneQuests = quests.filter((q) => questState(q).key === 'done').length;
    const doneAch = achievements.filter((a) => a && a.done).length;
    const city = j && j.city && typeof j.city === 'object' ? j.city : null;
    const tabs = JOURNAL_TABS.map((t) => ({ ...t })).concat(city ? [{ key: 'sehir', name: 'Şehir' }] : []);
    // aktif görevler önde
    const orderedQuests = quests
        .map((q, i) => ({ q, i, s: questState(q).key }))
        .sort((a, b) => ({ active: 0, locked: 1, done: 2 }[a.s] - { active: 0, locked: 1, done: 2 }[b.s]) || a.i - b.i);

    return (
        <PanelShell
            title="Günlük"
            subtitle="Görevlerin, başarımların ve keşiflerin"
            onClose={onClose}
            testId="journal-panel"
            className="kp-journal"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
        >
            <PanelTabs tabs={tabs} value={tab} onChange={setTab} label="Günlük bölümleri" idPrefix="journal" />
            <div role="tabpanel" id="journal-panel" aria-labelledby={`journal-tab-${tab}`} className="kp-journal-body" tabIndex={0}>
                {!j ? <p className="kp-empty">Günlük okunamadı.</p> : null}

                {j && tab === 'gorev' ? (
                    <section aria-label="Görevler">
                        <p className="kp-summary" data-testid="quest-summary">{doneQuests} / {quests.length} görev tamamlandı</p>
                        {quests.length === 0 ? <p className="kp-empty">Şimdilik görev yok. Dünyayı keşfetmeye devam et.</p> : null}
                        <ul className="kp-cards">
                            {orderedQuests.map(({ q }) => {
                                const st = questState(q);
                                const p = st.key === 'done' ? 100 : pct(q.progress, q.goal);
                                return (
                                    <li key={q.id || q.title} className={`kp-card is-${st.key}`} data-testid={`quest-${q.id}`}>
                                        <div className="kp-card-head">
                                            <h3 className="kp-card-title">{q.title}</h3>
                                            <span className={`kp-state kp-state-${st.key}`}>{st.key === 'done' ? '✓ ' : st.key === 'locked' ? '✕ ' : '▶ '}{st.label}</span>
                                        </div>
                                        {q.desc ? <p className="kp-card-desc">{touchText(q.desc)}</p> : null}
                                        {Number(q.goal) > 0 ? (
                                            <div className="kp-progress-row">
                                                <Progress value={p} label={`${q.title} ilerlemesi`} tone={st.key === 'done' ? 'good' : 'accent'} />
                                                <span className="kp-progress-n">{Math.min(Number(q.progress) || 0, Number(q.goal))} / {q.goal}</span>
                                            </div>
                                        ) : null}
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ) : null}

                {j && tab === 'basarim' ? (
                    <section aria-label="Başarımlar">
                        <p className="kp-summary" data-testid="ach-summary">{doneAch} / {achievements.length} başarım kazanıldı</p>
                        <Progress value={pct(doneAch, achievements.length)} label="Başarım ilerlemesi" tone="good" />
                        {achievements.length === 0 ? <p className="kp-empty">Henüz başarım listesi yok.</p> : null}
                        <ul className="kp-cards kp-cards-grid">
                            {achievements.map((a) => (
                                <li key={a.id || a.title} className={`kp-card${a.done ? ' is-done' : ' is-locked'}`} data-testid={`ach-${a.id}`}>
                                    <div className="kp-card-head">
                                        <h3 className="kp-card-title"><span aria-hidden="true">{a.done ? '★' : '☆'}</span> {a.title}</h3>
                                        <span className={`kp-state kp-state-${a.done ? 'done' : 'locked'}`}>{a.done ? 'Kazanıldı' : 'Kilitli'}</span>
                                    </div>
                                    {a.desc ? <p className="kp-card-desc">{a.desc}</p> : null}
                                    {a.progressText ? <p className="kp-card-prog">{a.progressText}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {j && tab === 'kesif' ? (
                    <section aria-label="Keşifler">
                        <ul className="kp-cards">
                            {discoveries.map((d) => (
                                <li key={d.key} className="kp-card" data-testid={`disc-${d.key}`}>
                                    <div className="kp-card-head">
                                        <h3 className="kp-card-title">{d.label}</h3>
                                        <span className="kp-progress-n">{d.max ? `${d.value} / ${d.max}` : d.value}</span>
                                    </div>
                                    {d.max ? <Progress value={pct(d.value, d.max)} label={`${d.label} keşfi`} /> : (
                                        <p className="kp-card-desc">Tapınaklar, kuleler ve harabeler keşfettikçe artar.</p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}

                {j && tab === 'istatistik' ? (
                    <section aria-label="İstatistik">
                        {stats.length === 0 ? <p className="kp-empty">Henüz istatistik yok.</p> : null}
                        <dl className="kp-stats">
                            {stats.map((s) => (
                                <div key={s.key} className="kp-stat">
                                    <dt>{s.label}</dt>
                                    <dd data-testid={`stat-${s.key}`}>{s.value}</dd>
                                </div>
                            ))}
                        </dl>
                    </section>
                ) : null}

                {j && tab === 'sehir' && city ? (
                    <section aria-label="Şehir günlüğü" data-testid="journal-city">
                        <ul className="kp-cards">
                            <li className="kp-card" data-testid="city-chips">
                                <div className="kp-card-head"><h3 className="kp-card-title">Veri çipleri</h3><span className="kp-progress-n">{(city.chips || []).length} / 240</span></div>
                                <Progress value={pct((city.chips || []).length, 240)} label="Veri çipi keşfi" />
                                {(city.chips || []).length > 0 ? <p className="kp-card-desc">{(city.chips || []).slice(-8).map((c) => c.name + (c.dist ? ' (' + c.dist + ')' : '')).join(' · ')}</p> : <p className="kp-card-desc">Sokaklarda, çatılarda ve kanalizasyonda parlayan çipleri topla.</p>}
                            </li>
                            <li className="kp-card" data-testid="city-graffiti">
                                <div className="kp-card-head"><h3 className="kp-card-title">Grafitiler</h3><span className="kp-progress-n">{(city.graffiti || []).length} / 90</span></div>
                                <Progress value={pct((city.graffiti || []).length, 90)} label="Grafiti keşfi" />
                                {(city.graffiti || []).length > 0 ? <p className="kp-card-desc">{(city.graffiti || []).slice(-8).map((g) => g.design + ' ' + g.color.toLowerCase()).join(' · ')}</p> : <p className="kp-card-desc">Boş duvarlara yaklaş ve etkileşime geç.</p>}
                            </li>
                            <li className="kp-card" data-testid="city-rooms">
                                <div className="kp-card-head"><h3 className="kp-card-title">Gizli odalar</h3><span className="kp-progress-n">{(city.rooms || []).length} / 30</span></div>
                                <Progress value={pct((city.rooms || []).length, 30)} label="Gizli oda keşfi" />
                                {(city.rooms || []).length > 0 ? <p className="kp-card-desc">{(city.rooms || []).map((r) => r.name).join(' · ')}</p> : <p className="kp-card-desc">Kanalizasyonun duvarlarında saklı kapılar var. Tarayıcı yardımcı olur.</p>}
                            </li>
                            <li className="kp-card" data-testid="city-races">
                                <div className="kp-card-head"><h3 className="kp-card-title">Yarışlar</h3></div>
                                <p className="kp-card-desc">{(city.races || []).map((r) => r.name + ': ' + (r.best || '—')).join(' · ')}</p>
                            </li>
                            <li className="kp-card" data-testid="city-jobs">
                                <div className="kp-card-head"><h3 className="kp-card-title">İşler</h3><span className="kp-progress-n">{city.jobs ? city.jobs.done : 0} teslimat</span></div>
                                <p className="kp-card-desc">İşlerden kazanılan toplam: {city.jobs ? city.jobs.earned : 0} Kredi.</p>
                            </li>
                        </ul>
                        {(city.story || []).length > 0 ? (
                            <>
                                <h3 className="kp-summary">Meridyen Günlüğü</h3>
                                <ul className="kp-cards">
                                    {(city.story || []).map((s) => <li key={s.id} className="kp-card"><p className="kp-card-desc">{s.id + 1}. {s.text}</p></li>)}
                                </ul>
                            </>
                        ) : null}
                    </section>
                ) : null}

                {j && tab === 'yetenek' ? (
                    <section aria-label="Yetenekler">
                        <ul className="kp-cards kp-cards-grid">
                            {abilities.map((a) => (
                                <li key={a.key} className={`kp-card${a.unlocked ? ' is-done' : ' is-locked'}`} data-testid={`ability-${a.key}`}>
                                    <div className="kp-card-head">
                                        <h3 className="kp-card-title"><span aria-hidden="true">{a.glyph}</span> {a.name}</h3>
                                        <span className={`kp-state kp-state-${a.unlocked ? 'done' : 'locked'}`}>{a.unlocked ? '✓ Açıldı' : '✕ Kilitli'}</span>
                                    </div>
                                    <p className="kp-card-desc">{a.desc}</p>
                                    {a.source ? <p className="kp-card-prog">{a.unlocked ? 'Kazanıldığı yer: ' : 'Nasıl açılır: '}{a.source}</p> : null}
                                </li>
                            ))}
                        </ul>
                    </section>
                ) : null}
            </div>
        </PanelShell>
    );
};

export default JournalPanel;
