/*
 * Ada yerleşimi (saf; three'siz): duraklar, simge konumları, gölet, boşluklar.
 *
 * Koordinat: ada yerel uzayı, y yukarı. i. durağın simgesi azimut -i*adım'da
 * (azimut = atan2(x, z); +z kameraya bakan ön yüz). Ada Y ekseninde
 * θ = i*adım döndüğünde i. simge tam öne gelir (bkz. interaction.js).
 */
import { TAU } from './interaction.js';

export const ISLAND_RADIUS = 4.1;

/**
 * Aktif simge tam öne değil, hafif sola gelir (ön-sol): ortadaki karakter
 * simgenin arkasında kalmasın. Yalnızca görsel; durak/açı matematiğine girmez.
 */
export const FOCUS_OFFSET = -0.38;

/** Varsayılan duraklar (profil sekmeleriyle aynı sıra ve adlar). */
export const ISLAND_STOPS = [
    { key: 'hakkinda', label: 'Hakkında' },
    { key: 'sorular', label: 'Sorular' },
    { key: 'cevaplar', label: 'Cevaplar' },
    { key: 'rozetler', label: 'Rozetler' },
    { key: 'takip', label: 'Takip' },
];

/** Simge türü ve ada merkezinden uzaklığı (m). */
const KINDS = {
    hakkinda: { kind: 'signpost', radius: 2.95 },
    sorular: { kind: 'mailbox', radius: 2.85 },
    cevaplar: { kind: 'lighthouse', radius: 2.95 },
    rozetler: { kind: 'trophy', radius: 2.85 },
    takip: { kind: 'dock', radius: 1.3 },
};
const FALLBACK_KIND = { kind: 'signpost', radius: 2.9 };

export const POND_RADIUS = 1.05;
export const POND_CENTER_RADIUS = 2.6;
export const WATER_LEVEL = 0.03;
export const POND_FLOOR = 0.0;
export const HILL_RADIUS = 1.75;

/** Geçersiz/eksik giriş varsayılan duraklara düşer; en fazla 8 durak. */
export function sanitizeStops(stops) {
    if (!Array.isArray(stops) || stops.length === 0) return ISLAND_STOPS.slice();
    return stops
        .slice(0, 8)
        .map((s, i) => ({
            key: typeof s?.key === 'string' ? s.key : `durak${i}`,
            label: typeof s?.label === 'string' && s.label ? s.label : `Durak ${i + 1}`,
        }));
}

export function createLayout(stopsIn) {
    const stops = sanitizeStops(stopsIn);
    const n = stops.length;
    const step = TAU / n;
    const items = stops.map((s, i) => {
        const spec = KINDS[s.key] || FALLBACK_KIND;
        const azimuth = -i * step;
        return {
            index: i,
            key: s.key,
            label: s.label,
            kind: spec.kind,
            azimuth,
            radius: spec.radius,
            x: Math.sin(azimuth) * spec.radius,
            z: Math.cos(azimuth) * spec.radius,
        };
    });
    const dock = items.find((it) => it.kind === 'dock');
    let pond = null;
    if (dock) {
        pond = {
            x: Math.sin(dock.azimuth) * POND_CENTER_RADIUS,
            z: Math.cos(dock.azimuth) * POND_CENTER_RADIUS,
            r: POND_RADIUS,
            azimuth: dock.azimuth,
        };
    }
    // Komşu simgeler arası boşluklar (ev/ağaç kümeleri için).
    const gaps = items.map((it, i) => {
        const az = it.azimuth - step / 2;
        return { index: i, azimuth: az, x: Math.sin(az), z: Math.cos(az) };
    });
    // Zemini düzleştirilen yamalar: simge tabanları (gölet kendi çukurunu açar).
    const pads = items
        .filter((it) => it.kind !== 'dock')
        .map((it) => ({ x: it.x, z: it.z, r: 0.85 }));
    if (dock) {
        pads.push({ x: dock.x, z: dock.z, r: 0.55 });
    }
    return { stops, n, step, items, pond, gaps, pads };
}

/** Simgenin yerel uzayda önde mi olduğunu ölçen ağırlık için azimut. */
export function itemFrontWeight(item, islandAngle, step) {
    let d = item.azimuth + islandAngle;
    d = ((d + Math.PI) % TAU + TAU) % TAU - Math.PI;
    const w = 1 - Math.abs(d) / (step * 0.8);
    return w <= 0 ? 0 : w >= 1 ? 1 : w * w * (3 - 2 * w);
}
