import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PanelShell from './PanelShell.jsx';
import PanelTabs from './PanelTabs.jsx';
import PanelItemIcon from './PanelItemIcon.jsx';
import PanelWorkTabs from './PanelWorkTabs.jsx';
import { itemByKey } from '../../../game/kesif/sim/items.js';
import {
    CRAFT_TABS, STATION_LABELS, filterRecipes, fuelStatus, itemName, recipeView, toggleInList, tooltipModel, whereToFind,
} from './panelUtils.js';
import {
    PIN_KEY, STATION_HELP, craftGuide, craftableFirstSnapshot, craftableSnapshot, craftedMessage, mergeOrder, missingLine, orderViews, stationChips,
} from './panelCraftUtils.js';
import { readList, writeList } from './panelStorage.js';
import { useApiSnapshot, useLiveMessage, useRovingGrid } from './panelHooks.js';
import { touchText } from './kxHudUtils.js';
import './panelsCraft.css';

const PAGE = 48;

function narrowScreen() {
    try {
        return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(max-width: 760px)').matches;
    } catch (_e) {
        return false;
    }
}

/* Malzeme rozeti: simge + sahip olunan/gereken (renk + işaret: renk körlüğü için ✓/✗). */
const Ingredient = ({ p }) => (
    <span className={`kp-ing ${p.ok ? 'is-ok' : 'is-miss'}`} title={p.name} aria-label={`${p.name}: ${p.have} / ${p.count}, ${p.ok ? 'yeterli' : 'eksik'}`}>
        <PanelItemIcon item={p.item} size={32} />
        <span className="kp-ing-n" aria-hidden="true">
            {p.ok ? '✓' : '✗'} {p.have}/{p.count}
        </span>
    </span>
);

/*
 * Üret sekmesi (Envanter ile aynı çalışma alanı): sıradaki adım rehberi (altbilgi), istasyon göstergeleri (yakında / yok + nasıl yapılır),
 * kategori sekmeleri, arama, "yapılabilirler" süzgeci + "yapılabilir önce" sırası, sabitleme (★ şeridi), tarif kartları (eksik malzeme
 * satırı + nereden bulunur), ayrıntı çekmecesi (ocak ısı/yakıt göstergesi dahil) ve ×1 / ×5 / Maks (Shift+Üret = Maks) üretim;
 * başarıda tost + simge sıçraması.
 *
 * YER SABİTLİĞİ: bir tarifin satırı ASLA kendi kendine yer değiştirmez. Sıra kalıcıdır (sekme sırası + motorun sabit sırası; bkz.
 * panelCraftUtils.mergeOrder/orderViews); envanter, istasyon yakınlığı, yeni tarif, sabitleme ve yenileme sırayı etkilemez. Yapılamayan
 * tarifler yerinde soluk kalır ("Eksik: …"). "Yapılabilirler" ve "Yapılabilir önce" yalnız düğmeye basılan anın görüntüsünü uygular.
 * Düzen sabit yükseklikli (satırlar, altbilgi, ayrıntı alt çubuğu); rehber/ısı/tost altbilgide, ayrıntıda ya da örtüde olduğundan
 * liste alanını itmez.
 * Props: api (getRecipes, getStations, getInventorySnapshot, craft), onClose, onSwitch(name) (Envanter sekmesi), version,
 *        accessibility, reducedMotion.
 */
const CraftingPanel = ({
    api, onClose, onSwitch, version = 0, accessibility = false, reducedMotion = false,
}) => {
    const readRecipes = useCallback(() => api.getRecipes({}), [api]);
    const readStations = useCallback(() => api.getStations(), [api]);
    const readInv = useCallback(() => api.getInventorySnapshot(), [api]);
    const [rawRecipes, bumpR] = useApiSnapshot(readRecipes, version);
    const [rawStations, bumpS] = useApiSnapshot(readStations, version);
    const [inv, bumpI] = useApiSnapshot(readInv, version);
    const [msg, announce] = useLiveMessage();

    const [tab, setTab] = useState('tumu');
    const [query, setQuery] = useState('');
    // anlık görüntüler: yalnız kullanıcı düğmeye bastığı anda alınır (envanter değişince liste yeniden dizilmez ya da daralmaz)
    const [onlyIds, setOnlyIds] = useState(null);
    const [firstOrder, setFirstOrder] = useState(null);
    const [guideSeen, setGuideSeen] = useState(false);
    const [selectedId, setSelectedId] = useState(null);
    const [drawer, setDrawer] = useState(false);
    const [limit, setLimit] = useState(PAGE);
    const [flash, setFlash] = useState(null);
    const [toast, setToast] = useState(null);
    const [pins, setPins] = useState(() => readList(PIN_KEY));
    // bir istasyon bloğuna sağ tıklanarak açıldıysa (ocak, örs, taş kesici, dokuma) o istasyonun tarifleri süzülür; tezgah her şeyi açar
    const [stationFilter, setStationFilter] = useState(() => {
        try {
            const k = typeof api.getStationFocus === 'function' ? api.getStationFocus() : null;
            return k && k !== 'tezgah' ? k : null;
        } catch (_e) {
            return null;
        }
    });
    const seq = useRef(0);
    const [seen, setSeen] = useState([]);

    const stations = useMemo(() => (Array.isArray(rawStations) ? rawStations : []), [rawStations]);
    const fuel = useMemo(() => fuelStatus(inv), [inv]);
    const allViews = useMemo(
        () => (Array.isArray(rawRecipes) ? rawRecipes : []).map((r) => recipeView(r, stations, fuel)),
        [rawRecipes, stations, fuel],
    );
    // kalıcı sıra: tüm tariflerin ilk görüldüğü sıra (sonradan gelenler sona eklenir, kimse kaymaz)
    const order = useMemo(() => mergeOrder(seen, allViews), [seen, allViews]);
    if (order !== seen) setSeen(order); // türetilmiş durum: yeni kimlikler sona eklenip kalıcılaşır
    const views = useMemo(() => (stationFilter ? allViews.filter((v) => v.station === stationFilter) : allViews), [allViews, stationFilter]);
    const chips = useMemo(() => stationChips(stations), [stations]);
    const guide = useMemo(() => craftGuide(inv, stations), [inv, stations]);
    const pinnedViews = useMemo(() => orderViews(allViews.filter((v) => pins.indexOf(v.id) >= 0), pins, null), [allViews, pins]);
    const list = useMemo(
        () => orderViews(filterRecipes(views, { tab, query, onlyIds }), order, firstOrder),
        [views, tab, query, onlyIds, order, firstOrder],
    );
    const craftableTotal = useMemo(() => views.filter((v) => v.craftable).length, [views]);
    const tabs = useMemo(() => CRAFT_TABS.map((t) => ({
        key: t.key,
        name: t.name,
        count: views.filter((v) => v.craftable && (t.key === 'tumu' || v.tab === t.key)).length,
    })), [views]);
    // seçili tarif yoksa listenin ilki (geniş ekranda sağ panel boş kalmasın); dar ekranda çekmece yalnızca dokununca açılır
    const selected = allViews.find((v) => v.id === selectedId) || (list.length ? list[0] : null);
    const shown = list.slice(0, limit);
    const nav = useRovingGrid(1, shown.length ? shown[0].id : '');
    const showHeat = stations.indexOf('ocak') >= 0 || tab === 'ocak' || stationFilter === 'ocak' || (selected && selected.station === 'ocak');
    const selectedPinned = !!selected && pins.indexOf(selected.id) >= 0;
    const noCraftable = craftableTotal === 0;

    // sıradaki adım altbilgide yaşar; bir kez göründüyse yeri ayrılı kalır (kaybolup gelince liste alanı oynamasın)
    if (guide && !guideSeen) setGuideSeen(true);

    useEffect(() => {
        if (!toast) return undefined;
        const t = setTimeout(() => setToast(null), 1900);
        return () => clearTimeout(t);
    }, [toast]);

    const refresh = () => {
        bumpR();
        bumpS();
        bumpI();
    };

    // üretim her zaman tarif KİMLİĞİ ile yapılır (satır yeniden çizilse de aynı tarif hedeflenir)
    const doCraft = (v, times) => {
        let made = 0;
        try {
            if (api.craft(v.id, { times })) {
                made = times;
            } else if (times > 1) {
                for (let i = 0; i < times; i++) {
                    if (!api.craft(v.id, { times: 1 })) break;
                    made++;
                }
            }
        } catch (_e) {
            made = 0;
        }
        refresh();
        seq.current += 1;
        const n = seq.current;
        setFlash({ id: v.id, ok: made > 0, n });
        if (made > 0) {
            announce(`${v.outName} üretildi: ${made * v.out.count} adet.`);
            setToast({ ok: true, item: v.out.item, text: craftedMessage(v, made), n });
        } else {
            announce(`${v.outName} üretilemedi. ${v.reason || 'Envanterde yer olmayabilir.'}`);
            setToast({ ok: false, item: v.out.item, text: `${v.outName} üretilemedi`, n });
        }
    };

    const pick = (id) => {
        setSelectedId(id);
        setDrawer(true);
    };

    const togglePin = (v) => {
        const next = toggleInList(pins, v.id);
        setPins(next);
        writeList(PIN_KEY, next);
        announce(next.indexOf(v.id) >= 0 ? `${v.outName} sabitlendi.` : `${v.outName} sabitlemesi kaldırıldı.`);
    };

    // anlık görüntü düğmeleri: basıldığı anın durumunu alır, sonrası kıpırdamaz; tekrar basınca kalkar
    const toggleOnly = () => {
        setOnlyIds((cur) => (cur ? null : craftableSnapshot(views)));
        setLimit(PAGE);
    };
    const toggleFirst = () => {
        setFirstOrder((cur) => (cur ? null : craftableFirstSnapshot(allViews, order)));
    };

    const showGuideRecipe = () => {
        if (!guide || !guide.recipeId) return;
        setTab('tumu');
        setQuery('');
        setOnlyIds(null);
        setSelectedId(guide.recipeId);
        setDrawer(true);
        announce('Tarif seçildi.');
    };

    const onKeyDown = (e) => {
        if (e.key === 'Escape' && drawer && narrowScreen()) {
            e.preventDefault();
            setDrawer(false);
        }
    };

    const outInfo = selected ? tooltipModel({ item: selected.out.item, count: selected.out.count }) : null;
    const outItem = selected ? itemByKey(selected.out.item) : null;
    const selMissing = selected ? selected.in.filter((p) => !p.ok) : [];

    const guideBar = guide || guideSeen ? (
        <div className="kp-guide-slot">
            {guide ? (
                <div className="kp-guide" role="note" data-testid="craft-guide">
                    <span className="kp-guide-icon" aria-hidden="true">🧭</span>
                    <div className="kp-guide-body">
                        <p className="kp-guide-title">Sıradaki adım</p>
                        <p className="kp-guide-text">{touchText(guide.text)}</p>
                    </div>
                    {guide.recipeId ? (
                        <button type="button" className="kp-btn" onClick={showGuideRecipe}>Tarifi göster</button>
                    ) : null}
                </div>
            ) : null}
        </div>
    ) : null;

    return (
        <PanelShell
            title="Üretim"
            subtitle={stationFilter && STATION_HELP[stationFilter]
                ? `${STATION_HELP[stationFilter].block}: ${views.length} tarif`
                : 'Malzemelerini birleştirip yeni eşyalar yap'}
            onClose={onClose}
            testId="crafting-panel"
            className="kp-craft"
            accessibility={accessibility}
            reducedMotion={reducedMotion}
            headerExtra={<PanelWorkTabs current="crafting" onSwitch={onSwitch} craftable={0} />}
            footer={guideBar}
        >
            <div className="kp-craft-top" onKeyDown={onKeyDown}>
                <div className="kp-chiprow">
                    <ul className="kp-stations" aria-label="Yakındaki istasyonlar">
                        {chips.map((c) => (
                            <li key={c.key} className={`kp-station${c.on ? ' is-on' : ''}${stationFilter === c.key ? ' is-filter' : ''}`} data-testid={`station-${c.key}`} title={c.help}>
                                <button
                                    type="button"
                                    className="kp-station-btn"
                                    aria-pressed={stationFilter === c.key}
                                    aria-label={`${c.text}. ${stationFilter === c.key ? 'Süzgeci kaldır' : c.label + ' tariflerini göster'}`}
                                    onClick={() => {
                                        setStationFilter((cur) => (cur === c.key ? null : c.key));
                                        setLimit(PAGE);
                                        setSelectedId(null);
                                    }}
                                >
                                    <span aria-hidden="true">{c.on ? '●' : '○'}</span> {c.label}
                                    <span className="kp-sr">{c.on ? ' yakınında' : ' yok'}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                    <div className="kp-pinstrip" role="group" aria-label="Sabitlenen tarifler" data-testid="pin-strip">
                        <span className="kp-pinstrip-star" aria-hidden="true">★</span>
                        {pinnedViews.length === 0 ? (
                            <span className="kp-pinstrip-empty">Sabit tarif yok</span>
                        ) : pinnedViews.map((v) => (
                            <button
                                key={v.id}
                                type="button"
                                className={`kp-pinchip${v.craftable ? ' is-craftable' : ''}${selected && selected.id === v.id ? ' is-sel' : ''}`}
                                data-testid={`pin-${v.id}`}
                                title={`${v.outName} (sabit tarif)`}
                                aria-label={`${v.outName}, sabit tarif, ${v.craftable ? 'yapılabilir' : 'yapılamaz'}`}
                                onClick={() => pick(v.id)}
                            >
                                <PanelItemIcon item={v.out.item} size={32} />
                            </button>
                        ))}
                    </div>
                </div>
                <div className="kp-search-row">
                    <input
                        type="search"
                        className="kp-search"
                        placeholder="Tarif veya malzeme ara"
                        aria-label="Tarif ara"
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setLimit(PAGE);
                        }}
                    />
                    <button
                        type="button"
                        className={`kp-chip${onlyIds ? ' is-on' : ''}`}
                        aria-pressed={!!onlyIds}
                        title="Düğmeye bastığın andaki yapılabilir tarifleri gösterir; liste sonradan oynamaz"
                        onClick={toggleOnly}
                    >
                        Yapılabilirler
                    </button>
                    <button
                        type="button"
                        className={`kp-chip${firstOrder ? ' is-on' : ''}`}
                        aria-pressed={!!firstOrder}
                        title="Düğmeye bastığın anda yapılabilir olanları başa alır; sonra yer değiştirmez"
                        onClick={toggleFirst}
                    >
                        Yapılabilir önce
                    </button>
                </div>
                <PanelTabs
                    tabs={tabs}
                    value={tab}
                    onChange={(k) => {
                        setTab(k);
                        setLimit(PAGE);
                    }}
                    label="Tarif kategorileri"
                    idPrefix="craft"
                    reserveCount
                />
            </div>

            <div className="kp-craft-layout">
                <div className="kp-craft-listwrap" role="tabpanel" id="craft-panel" aria-labelledby={`craft-tab-${tab}`}>
                    {list.length === 0 ? (
                        <p className="kp-empty" data-testid="craft-empty">
                            Eşleşen tarif yok.
                            {noCraftable && !query ? ' Malzeme topladıkça yapılabilen tarifler burada renkli görünür.' : ''}
                        </p>
                    ) : (
                        <ul className="kp-recipes" onKeyDown={nav.onKeyDown} aria-label="Tarifler" data-station-filter={stationFilter || undefined}>
                            {shown.map((v) => {
                                const np = nav.itemProps(v.id);
                                const isSel = selected && selected.id === v.id;
                                const fl = flash && flash.id === v.id ? (flash.ok ? ' kp-flash-ok' : ' kp-flash-bad') : '';
                                const isPin = pins.indexOf(v.id) >= 0;
                                const miss = missingLine(v);
                                const pop = !!(flash && flash.id === v.id && flash.ok);
                                return (
                                    <li key={v.id} className={`kp-recipe-row${v.craftable ? ' is-craftable' : ''}${isSel ? ' is-sel' : ''}${isPin ? ' is-pinned' : ''}${fl}`} data-testid={`recipe-${v.id}`}>
                                        <button
                                            type="button"
                                            className="kp-recipe"
                                            aria-pressed={!!isSel}
                                            aria-label={`${v.outName}${v.out.count > 1 ? ' ×' + v.out.count : ''}, ${v.craftable ? 'yapılabilir' : miss || v.reason}`}
                                            tabIndex={np.tabIndex}
                                            data-grid-item=""
                                            onFocus={np.onFocus}
                                            onClick={() => pick(v.id)}
                                        >
                                            <span key={pop ? flash.n : 'x'} className={`kp-recipe-out${pop ? ' is-pop' : ''}`}>
                                                <PanelItemIcon item={v.out.item} size={48} />
                                                {v.out.count > 1 ? <span className="kp-count">{v.out.count}</span> : null}
                                            </span>
                                            <span className="kp-recipe-body">
                                                <span className="kp-recipe-name" title={v.outName}>
                                                    {v.outName}
                                                    {isPin ? <span className="kp-pin-mark" aria-hidden="true">★</span> : null}
                                                </span>
                                                <span className="kp-ings">
                                                    {v.in.map((p) => (<Ingredient key={p.item} p={p} />))}
                                                </span>
                                                <span className="kp-missing" title={miss} aria-hidden={miss ? undefined : 'true'}>{miss}</span>
                                            </span>
                                            {v.station !== 'el' ? (
                                                <span className={`kp-badge${v.stationOk ? ' is-ok' : ' is-miss'}`}>
                                                    {STATION_LABELS[v.station] || v.station}
                                                </span>
                                            ) : null}
                                        </button>
                                        <button
                                            type="button"
                                            className="kp-btn kp-btn-good kp-craft1"
                                            disabled={!v.craftable}
                                            aria-label={`${v.outName} üret`}
                                            title={v.craftable ? 'Bir kez üret (Shift: en çok)' : v.reason}
                                            onClick={(e) => doCraft(v, e.shiftKey && v.maxTimes > 1 ? v.maxTimes : 1)}
                                        >
                                            Üret
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {list.length > shown.length ? (
                        <button type="button" className="kp-btn kp-more" onClick={() => setLimit((n) => n + PAGE)}>
                            Daha fazla göster ({list.length - shown.length})
                        </button>
                    ) : null}
                </div>

                <aside
                    className={`kp-detail${drawer && selected ? ' is-open' : ''}`}
                    aria-label="Tarif ayrıntısı"
                    data-testid="recipe-detail"
                >
                    {selected ? (
                        <>
                            <div className="kp-detail-scroll">
                                <div className="kp-detail-head">
                                    <span className="kp-detail-icon"><PanelItemIcon item={selected.out.item} size={64} /></span>
                                    <div>
                                        <h3 className="kp-detail-name" style={{ color: outInfo ? outInfo.color : undefined }}>
                                            {selected.outName}{selected.out.count > 1 ? ` ×${selected.out.count}` : ''}
                                        </h3>
                                        <p className="kp-info-meta">{outInfo ? outInfo.kindLabel : ''}</p>
                                    </div>
                                    <button type="button" className="kp-detail-close kp-btn" onClick={() => setDrawer(false)} aria-label="Ayrıntıyı kapat">✕</button>
                                </div>
                                {outItem && outItem.desc ? <p className="kp-info-desc">{outItem.desc}</p> : null}
                                {outInfo && outInfo.lines.length ? (
                                    <dl className="kp-info-lines">
                                        {outInfo.lines.map((l) => (
                                            <div key={l.label}><dt>{l.label}</dt><dd>{l.value}</dd></div>
                                        ))}
                                    </dl>
                                ) : null}
                                <p className={`kp-station-need${selected.stationOk ? ' is-ok' : ' is-miss'}`}>
                                    {selected.station === 'el'
                                        ? 'Elle üretilir'
                                        : selected.stationOk
                                            ? `${STATION_LABELS[selected.station]} yakınında ✓`
                                            : `${STATION_LABELS[selected.station]} yakınında olmalısın ✗`}
                                </p>
                                {!selected.stationOk && STATION_HELP[selected.station] ? (
                                    <p className="kp-station-hint">
                                        {touchText(`${STATION_HELP[selected.station].block}: ${STATION_HELP[selected.station].how}. Yere koyduktan sonra 4 blok içinde dur ya da bloğa sağ tıkla.`)}
                                    </p>
                                ) : null}
                                {selected.heat ? <p className="kp-info-desc">Her üretim {selected.heat} ısı harcar (kömür, odun kömürü, kütük yakıt olur).</p> : null}
                                <h4 className="kp-h4">Malzemeler</h4>
                                <ul className="kp-need-list">
                                    {selected.in.map((p) => (
                                        <li key={p.item} className={p.ok ? 'is-ok' : 'is-miss'}>
                                            <PanelItemIcon item={p.item} size={32} />
                                            <span className="kp-need-name">{p.name}</span>
                                            <span className="kp-need-n">{p.ok ? '✓' : '✗'} {p.have}/{p.count}</span>
                                            {!p.ok ? (
                                                <span className="kp-where">
                                                    {whereToFind(p.item).map((h) => (<span key={h}>{h}</span>))}
                                                </span>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                                {!selected.craftable ? (
                                    <p className="kp-reason" role="note">
                                        {selected.reason}
                                        {selMissing.length ? `: ${selMissing.map((p) => `${p.count - p.have} ${p.name}`).join(', ')}` : ''}
                                    </p>
                                ) : null}
                                <button type="button" className="kp-btn kp-pin-btn" aria-pressed={selectedPinned} onClick={() => togglePin(selected)}>
                                    {selectedPinned ? '★ Sabitlemeyi kaldır' : '☆ Tarifi sabitle'}
                                </button>
                                {showHeat ? (
                                    <div className="kp-heat" data-testid="heat">
                                        <div className="kp-heat-row">
                                            <span>Ocak ısısı: <strong>{Math.round(fuel.total)}</strong> · {fuel.smelts} eritme</span>
                                            <span
                                                className="kp-bar kp-bar-heat"
                                                role="progressbar"
                                                aria-label="Ocak ısısı"
                                                aria-valuemin={0}
                                                aria-valuemax={100}
                                                aria-valuenow={Math.min(100, Math.round(fuel.total / 3))}
                                            >
                                                <span style={{ width: `${Math.min(100, Math.round(fuel.total / 3))}%` }} />
                                            </span>
                                        </div>
                                        <p className="kp-heat-fuel">
                                            {fuel.fuels.length
                                                ? 'Yakıt: ' + fuel.fuels.slice(0, 4).map((f) => `${itemName(f.item)} ×${f.count}`).join(', ')
                                                : 'Yakıtın yok. Kömür, odun kömürü veya kütük topla.'}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                            <div className="kp-craft-actions" role="group" aria-label="Üretim miktarı">
                                <button type="button" className="kp-btn kp-btn-good" disabled={!selected.craftable} onClick={() => doCraft(selected, 1)}>×1</button>
                                <button type="button" className="kp-btn kp-btn-good" disabled={!selected.craftable || selected.maxTimes < 5} onClick={() => doCraft(selected, 5)}>×5</button>
                                <button type="button" className="kp-btn kp-btn-good" disabled={!selected.craftable || selected.maxTimes < 2} onClick={() => doCraft(selected, selected.maxTimes)}>
                                    Maks{selected.maxTimes > 0 ? ` (${selected.maxTimes})` : ''}
                                </button>
                            </div>
                        </>
                    ) : (
                        <p className="kp-empty">Ayrıntı görmek için bir tarif seç.</p>
                    )}
                </aside>
            </div>
            {toast ? (
                <div className={`kp-toast${toast.ok ? '' : ' is-bad'}`} data-testid="craft-toast" aria-hidden="true">
                    <PanelItemIcon item={toast.item} size={28} />
                    <span>{toast.ok ? '✓ ' : ''}{toast.text}</span>
                </div>
            ) : null}
            <div className="kp-live" role="status" aria-live="polite" data-testid="live">{msg}</div>
        </PanelShell>
    );
};

export default CraftingPanel;
