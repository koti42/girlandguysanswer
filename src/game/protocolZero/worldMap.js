/*
 * PROTOCOL: ZERO — taktik dünya haritası (Canvas 2D, askeri komuta ekranı stili).
 *
 *   const map = createWorldMap(container, { world, onSelect, onPopBubble, onPacketArrive, lowPower, reducedMotion });
 *   map.update(snapshot);      // sim.snapshot(): ülke renkleri, sporlar, düğümler, hatlar, baloncuklar
 *   map.setSelected(id|null);  // seçili merkez + bölge vurgusu
 *   map.focusNode(id);         // görünümü düğüme yakınlaştır
 *   map.setPaused(bool);       // paket akışı durur
 *   map.dispose();
 *
 * Katmanlar: statik (okyanus, graticule, ülke dolguları + enfeksiyon kızılı, sınırlar; görünüm ya da
 * enfeksiyon değişince yeniden çizilir) → dinamik (sporlar, kesikli büyük daire rotaları, veri paketleri,
 * dalgalar) → ekran uzayı (düğüm işaretleri, etiketler, baloncuklar). Yakınlaştırma: tekerlek / iki parmak;
 * kaydırma: sürükleme. Dokunuş (sürüklemeden bırakma): baloncuk → düğüm → ülke sırasıyla vuruş testi.
 */
import { geoContains, geoGraticule10, geoInterpolate, geoNaturalEarth1, geoPath } from 'd3-geo';
import { COLORS, LINKS, NODES, NODE_BY_ID } from './constants';
import { countryInfection, resolveCities, samplePoints } from './regions';
import { CITIES } from './cities';
import { createRng } from './rng';

const STATUS_COLOR = { safe: COLORS.safe, warn: COLORS.warn, lost: COLORS.lost, isolated: COLORS.isolated };
const LINK_SAFE = 'rgba(125, 211, 252, 0.7)';
const LINK_SAFE_GLOW = 'rgba(56, 189, 248, 0.14)';
const LINK_HOT = '#ff2d55';
const LINK_HOT_GLOW = 'rgba(255, 0, 60, 0.18)';
const LINK_OFF = 'rgba(100, 116, 139, 0.25)';
const OCEAN = '#030a18';
const LAND = '#0b1628';
const LAND_SELECTED = '#102040';
const BORDER = 'rgba(56, 189, 248, 0.18)';
const MAX_K = 7;
/** HUD altında kalan alanlar (etiket çizilmez): üst şerit, sol menü, alt panel. */
const HUD_INSETS = (w) => (w >= 768 ? { top: 58, left: 96, right: 12, bottom: 118 } : { top: 50, left: 0, right: 0, bottom: 215 });
const LINK_SAMPLES = 40;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function createWorldMap(container, { world, onSelect, onPopBubble, onPacketArrive, lowPower = false, reducedMotion = false }) {
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab;';
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    const stat = document.createElement('canvas');
    const sctx = stat.getContext('2d');
    const rng = createRng(1337);

    let w = 1;
    let h = 1;
    let dpr = 1;
    const view = { k: 1, x: 0, y: 0 };
    const projection = geoNaturalEarth1();
    let pathStr = geoPath(projection);
    let spherePath = null;
    let gratPath = null;
    const countryPaths = {}; // id -> Path2D
    const nodePos = {}; // id -> [x,y] (taban koordinat)
    let links = []; // { a, b, pts, segs, packets, hot, off }
    const spores = {}; // countryId -> [[x,y],...] taban
    const cities = resolveCities(world, CITIES); // { name, capital, critical, countryId, p }
    const ripples = [];
    let snap = null;
    let selectedId = null;
    let paused = false;
    let staticDirty = true;
    let lastStatic = 0;
    let focusTween = null;
    let disposed = false;
    const sporeMax = lowPower ? 18 : 36;
    const packetsPerLink = lowPower ? 1 : 2;
    let minK = 1;
    let keyboardEnabled = true;

    // Parıltı sprite'ları (gölge bulanıklığı yerine; mobilde ucuz)
    function glowSprite(color, size) {
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
        grad.addColorStop(0, color);
        grad.addColorStop(0.35, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, size, size);
        return c;
    }
    const sporeSprite = glowSprite('rgba(255, 40, 70, 0.9)', 32);
    const packetSpriteRed = glowSprite('rgba(255, 60, 100, 0.95)', 24);
    const packetSpriteCyan = glowSprite('rgba(103, 232, 249, 0.95)', 24);

    /* ------------------------------ yerleşim ------------------------------ */
    function layout() {
        const ins = HUD_INSETS(w);
        if (w < 640) {
            // Telefon: harita görünür alandan ~2,2× büyük kurulur; başlangıçta Avrupa/Orta Doğu ortalanır, uzaklaşılabilir.
            projection.fitExtent([[0, 0], [w * 2.2, h * 2.2]], { type: 'Sphere' });
            minK = 0.45;
        } else {
            projection.fitExtent([[ins.left + 8, ins.top + 8], [w - ins.right - 8, h - ins.bottom - 8]], { type: 'Sphere' });
            minK = 1;
        }
        pathStr = geoPath(projection);
        spherePath = new Path2D(pathStr({ type: 'Sphere' }));
        gratPath = new Path2D(pathStr(geoGraticule10()));
        for (const c of world.countries) countryPaths[c.id] = new Path2D(pathStr(c.feature) || '');
        for (const n of NODES) nodePos[n.id] = projection([n.lng, n.lat]);
        for (const c of cities) c.p = projection([c.lng, c.lat]);
        for (const id in spores) delete spores[id];
        const prev = Object.fromEntries(links.map((l) => [`${l.a}-${l.b}`, l]));
        links = LINKS.map(([a, b]) => {
            const interp = geoInterpolate([NODE_BY_ID[a].lng, NODE_BY_ID[a].lat], [NODE_BY_ID[b].lng, NODE_BY_ID[b].lat]);
            const pts = [];
            for (let i = 0; i <= LINK_SAMPLES; i++) pts.push(projection(interp(i / LINK_SAMPLES)));
            // Antimeridyen geçişi: ardışık noktalar arasında büyük sıçrama → ayrı parça.
            const segs = [];
            let start = 0;
            for (let i = 1; i <= LINK_SAMPLES; i++) {
                if (Math.abs(pts[i][0] - pts[i - 1][0]) > w * 0.4) {
                    segs.push([start, i - 1]);
                    start = i;
                }
            }
            segs.push([start, LINK_SAMPLES]);
            const old = prev[`${a}-${b}`];
            const packets = old
                ? old.packets
                : Array.from({ length: packetsPerLink }, (_, i) => ({ t: (i + rng() * 0.8) / packetsPerLink, dir: i % 2 === 0 ? 1 : -1, speed: 0.07 + rng() * 0.05 }));
            return { a, b, pts, segs, packets, hot: false, off: false, hotDir: 1 };
        });
        staticDirty = true;
    }

    let firstLayout = true;
    function resize() {
        w = Math.max(1, container.clientWidth);
        h = Math.max(1, container.clientHeight);
        dpr = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        stat.width = canvas.width;
        stat.height = canvas.height;
        layout();
        if (firstLayout && w < 640) {
            const p = projection([22, 34]);
            view.k = 1;
            view.x = w / 2 - p[0];
            view.y = h / 2 - p[1];
        }
        firstLayout = false;
        clampView();
    }

    // Kenarlardan %45 taşma payı: 1× yakınlıkta bile harita elle kaydırılabilir.
    function clampView() {
        view.k = clamp(view.k, minK, MAX_K);
        const bw = (w < 640 ? w * 2.2 : w) * view.k; // taban harita genişliği (ekran px)
        const bh = (w < 640 ? h * 2.2 : h) * view.k;
        const mx = w * 0.45;
        const my = h * 0.45;
        view.x = clamp(view.x, w - bw - mx, mx);
        view.y = clamp(view.y, h - bh - my, my);
    }

    function panBy(dx, dy) {
        view.x += dx;
        view.y += dy;
        clampView();
        staticDirty = true;
        focusTween = null;
    }

    const toScreen = (p) => [p[0] * view.k + view.x, p[1] * view.k + view.y];
    const toBase = (sx, sy) => [(sx - view.x) / view.k, (sy - view.y) / view.k];

    /* ------------------------------ statik katman ------------------------------ */
    function drawStatic() {
        const c = sctx;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.clearRect(0, 0, stat.width, stat.height);
        const g = c.createLinearGradient(0, 0, 0, stat.height);
        g.addColorStop(0, '#040b1f');
        g.addColorStop(1, '#06061a');
        c.fillStyle = g;
        c.fillRect(0, 0, stat.width, stat.height);
        c.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
        // Okyanus (küre alanı)
        c.fillStyle = OCEAN;
        c.fill(spherePath);
        c.strokeStyle = 'rgba(0, 240, 255, 0.22)';
        c.lineWidth = 1.5 / view.k;
        c.stroke(spherePath);
        c.strokeStyle = 'rgba(0, 240, 255, 0.05)';
        c.lineWidth = 0.6 / view.k;
        c.stroke(gratPath);
        // Ülkeler
        const nodes = snap ? Object.fromEntries(snap.nodes.map((n) => [n.id, n])) : {};
        c.lineJoin = 'round';
        for (const country of world.countries) {
            const p = countryPaths[country.id];
            const inRegion = selectedId && world.regionOf[country.id]?.nodeId === selectedId;
            c.fillStyle = inRegion ? LAND_SELECTED : LAND;
            c.fill(p);
            const inf = snap ? countryInfection(nodes, world, country.id) : 0;
            if (inf > 0.5) {
                c.fillStyle = `rgba(140, 10, 34, ${(0.18 + (inf / 100) * 0.55).toFixed(3)})`;
                c.fill(p);
            }
            if (inf > 30) {
                c.save();
                c.shadowColor = 'rgba(255, 40, 70, 0.9)';
                c.shadowBlur = 6;
                c.strokeStyle = 'rgba(255, 60, 90, 0.65)';
                c.lineWidth = 0.9 / view.k;
                c.stroke(p);
                c.restore();
            } else {
                c.strokeStyle = inRegion ? 'rgba(0, 240, 255, 0.4)' : BORDER;
                c.lineWidth = 0.7 / view.k;
                c.stroke(p);
            }
        }
        c.setTransform(1, 0, 0, 1, 0, 0);
        staticDirty = false;
        lastStatic = performance.now();
    }

    function sporesOf(countryId) {
        if (!spores[countryId]) {
            const country = world.byId[countryId];
            spores[countryId] = country ? samplePoints(country, sporeMax, rng).map((ll) => projection(ll)) : [];
        }
        return spores[countryId];
    }

    /* ------------------------------ dinamik katman ------------------------------ */
    function drawFrame(now, dt) {
        if (staticDirty || now - lastStatic > 450) drawStatic();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(stat, 0, 0);
        if (!snap) return;
        const nodes = Object.fromEntries(snap.nodes.map((n) => [n.id, n]));
        const pulse = 0.5 + 0.5 * Math.sin(now / 320);
        const t = now / 1000;

        ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);

        // Sporlar: enfeksiyonla orantılı sayıda kızıl parıltı
        for (const country of world.countries) {
            const inf = countryInfection(nodes, world, country.id);
            if (inf < 2) continue;
            const pts = sporesOf(country.id);
            const count = Math.min(pts.length, Math.ceil((pts.length * inf) / 100));
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < count; i++) {
                const p = pts[i];
                const r = (3.5 + ((i * 7) % 5) * 0.6 + 1.6 * pulse) / Math.sqrt(view.k);
                ctx.drawImage(sporeSprite, p[0] - r, p[1] - r, r * 2, r * 2);
            }
            ctx.globalCompositeOperation = 'source-over';
        }

        // Rotalar
        ctx.lineCap = 'round';
        for (const l of links) {
            const a = nodes[l.a];
            const b = nodes[l.b];
            l.off = a.isolated || b.isolated;
            const aHot = a.infection > 20 && !a.isolated;
            const bHot = b.infection > 20 && !b.isolated;
            l.hot = !l.off && (aHot || bHot);
            l.hotDir = aHot && !bHot ? 1 : bHot && !aHot ? -1 : a.infection >= b.infection ? 1 : -1;
            const strokeSegs = () => {
                for (const [s, e] of l.segs) {
                    ctx.beginPath();
                    ctx.moveTo(l.pts[s][0], l.pts[s][1]);
                    for (let i = s + 1; i <= e; i++) ctx.lineTo(l.pts[i][0], l.pts[i][1]);
                    ctx.stroke();
                }
            };
            if (!l.off) {
                // Parıltı altlığı
                ctx.setLineDash([]);
                ctx.strokeStyle = l.hot ? LINK_HOT_GLOW : LINK_SAFE_GLOW;
                ctx.lineWidth = (l.hot ? 4 : 3) / view.k;
                strokeSegs();
            }
            ctx.strokeStyle = l.off ? LINK_OFF : l.hot ? LINK_HOT : LINK_SAFE;
            ctx.lineWidth = (l.hot ? 1.3 : 1) / view.k;
            ctx.setLineDash(l.off ? [3 / view.k, 5 / view.k] : [2.5 / view.k, 4.5 / view.k]);
            ctx.lineDashOffset = reducedMotion || paused ? 0 : (-t * 14 * (l.hot ? 2 : 1)) / view.k;
            strokeSegs();
        }
        ctx.setLineDash([]);

        // Paketler
        for (const l of links) {
            if (l.off) continue;
            for (const p of l.packets) {
                if (!paused && !reducedMotion) {
                    p.t += dt * p.speed * (l.hot ? 1.8 : 1) * p.dir;
                    if (p.t >= 1 || p.t <= 0) {
                        const from = p.dir === 1 ? l.a : l.b;
                        const to = p.dir === 1 ? l.b : l.a;
                        const fromHot = nodes[from].infection > 20 && !nodes[from].isolated;
                        if (fromHot && onPacketArrive?.(from, to)) ripples.push({ p: nodePos[to], age: 0 });
                        p.t = p.dir === 1 ? 0 : 1;
                    }
                }
                const idx = clamp(p.t, 0, 1) * LINK_SAMPLES;
                const i0 = Math.floor(idx);
                const i1 = Math.min(LINK_SAMPLES, i0 + 1);
                const f = idx - i0;
                const q0 = l.pts[i0];
                const q1 = l.pts[i1];
                if (Math.abs(q1[0] - q0[0]) > w * 0.4) continue; // kenar sıçraması: paket görünmez
                const x = q0[0] + (q1[0] - q0[0]) * f;
                const y = q0[1] + (q1[1] - q0[1]) * f;
                const ang = Math.atan2(q1[1] - q0[1], q1[0] - q0[0]) + (p.dir === 1 ? 0 : Math.PI);
                const from = p.dir === 1 ? l.a : l.b;
                const red = nodes[from].infection > 20 && !nodes[from].isolated;
                const s = 4.2 / Math.sqrt(view.k);
                const gs = s * 4;
                ctx.globalCompositeOperation = 'lighter';
                ctx.drawImage(red ? packetSpriteRed : packetSpriteCyan, x - gs / 2, y - gs / 2, gs, gs);
                ctx.globalCompositeOperation = 'source-over';
                ctx.save();
                ctx.translate(x, y);
                ctx.rotate(ang);
                ctx.beginPath();
                ctx.moveTo(s * 1.4, 0);
                ctx.lineTo(-s, s * 0.8);
                ctx.lineTo(-s * 0.4, 0);
                ctx.lineTo(-s, -s * 0.8);
                ctx.closePath();
                ctx.fillStyle = red ? '#ff3b63' : '#e0fbff';
                ctx.fill();
                ctx.restore();
            }
        }

        // Dalgalar (kızıl paket varışı)
        for (let i = ripples.length - 1; i >= 0; i--) {
            const r = ripples[i];
            r.age += dt;
            if (r.age > 1.4) {
                ripples.splice(i, 1);
                continue;
            }
            const rad = (6 + r.age * 34) / view.k;
            ctx.beginPath();
            ctx.arc(r.p[0], r.p[1], rad, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 0, 60, ${(1 - r.age / 1.4) * 0.8})`;
            ctx.lineWidth = 2 / view.k;
            ctx.stroke();
        }

        // Şehirler: başkentler ve kritik metropoller (bölge enfeksiyonuna göre kızıl/turkuaz)
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = '600 10px Inter, ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const labelK = w < 640 ? 2.4 : 1.6;
        for (const c of cities) {
            const [x, y] = toScreen(c.p);
            if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
            const inf = c.countryId ? countryInfection(nodes, world, c.countryId) : 0;
            const hot = inf > 5;
            const r = c.critical ? 2.6 : c.capital ? 2.1 : 1.5;
            if (hot) {
                ctx.beginPath();
                ctx.arc(x, y, r + 3 + 2 * pulse, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255, 0, 60, ${(0.12 + (inf / 100) * 0.25).toFixed(3)})`;
                ctx.fill();
            }
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = hot ? (inf > 60 ? '#ff003c' : '#ff7a90') : c.critical ? '#9be8ff' : 'rgba(186, 230, 253, 0.75)';
            ctx.fill();
            if (c.critical) {
                ctx.beginPath();
                ctx.arc(x, y, r + 2.2, 0, Math.PI * 2);
                ctx.strokeStyle = hot ? 'rgba(255, 90, 120, 0.8)' : 'rgba(0, 240, 255, 0.55)';
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            const showLabel = view.k >= labelK || (c.critical && view.k >= labelK * 0.8);
            if (showLabel && (c.capital || c.critical)) {
                ctx.fillStyle = hot ? '#ffd1dc' : 'rgba(207, 250, 255, 0.9)';
                ctx.fillText((c.capital ? '★ ' : '') + c.name, x + r + 4, y);
            }
        }

        // Ekran uzayı: düğümler (halka rozeti + iki satırlı pil etiket), baloncuklar
        const ins = HUD_INSETS(w);
        const placed = []; // çizilen etiket dikdörtgenleri (çakışma önleme)
        const overlaps = (r) => placed.some((q) => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
        const nameFont = '600 12px Rajdhani, Inter, ui-sans-serif, system-ui, sans-serif';
        const valFont = '700 11px Rajdhani, Inter, ui-sans-serif, system-ui, sans-serif';
        for (const n of snap.nodes) {
            const [x, y] = toScreen(nodePos[n.id]);
            if (x < -40 || y < -40 || x > w + 40 || y > h + 40) continue;
            const color = STATUS_COLOR[n.status];
            const R = 11 + (n.computePower / 200) * 2;
            const isSel = selectedId === n.id;
            const isBreach = snap.breach?.nodeId === n.id;
            if (isBreach) {
                const fast = 0.5 + 0.5 * Math.sin(now / 110);
                ctx.beginPath();
                ctx.arc(x, y, R + 8 + fast * 10, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(255, 0, 60, ${0.35 + 0.5 * fast})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            if (isSel) {
                ctx.beginPath();
                ctx.arc(x, y, R + 6 + pulse * 2, 0, Math.PI * 2);
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 2;
                ctx.stroke();
            }
            // hale
            ctx.globalCompositeOperation = 'lighter';
            const hs = R * (3.2 + 0.6 * pulse * (n.infection / 100 + 0.3));
            ctx.globalAlpha = n.status === 'isolated' ? 0.25 : 0.55;
            ctx.drawImage(n.status === 'safe' || n.status === 'isolated' ? packetSpriteCyan : packetSpriteRed, x - hs / 2, y - hs / 2, hs, hs);
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
            // halka rozeti: koyu disk + sızma yayı
            ctx.beginPath();
            ctx.arc(x, y, R, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(4, 10, 24, 0.92)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = hexA(color, 0.3);
            ctx.stroke();
            if (n.isolated) ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.arc(x, y, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (n.isolated ? 1 : Math.max(0.03, n.infection / 100)));
            ctx.strokeStyle = color;
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.arc(x, y, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            // pil etiket (sağda; çakışırsa solda / üstte; HUD altındaysa gizle)
            ctx.font = nameFont;
            const nameW = ctx.measureText(n.name).width;
            ctx.font = valFont;
            const val = n.isolated ? 'İZOLE' : `%${Math.round(n.infection)}`;
            const valW = ctx.measureText(val).width;
            const pw = Math.max(nameW, valW) + 20;
            const ph = 30;
            const cands = [
                { x: x + R + 4, y: y - ph / 2 },
                { x: x - R - 4 - pw, y: y - ph / 2 },
                { x: x - pw / 2, y: y - R - 6 - ph },
                { x: x - pw / 2, y: y + R + 6 },
            ];
            let rect = null;
            for (const c of cands) {
                const r = { x: c.x, y: c.y, w: pw, h: ph };
                const inHud = r.y < ins.top || r.y + r.h > h - ins.bottom || r.x < ins.left || r.x + r.w > w - ins.right;
                if (!inHud && !overlaps(r)) {
                    rect = r;
                    break;
                }
            }
            const hidden = !rect;
            if (hidden) rect = { x: cands[0].x, y: cands[0].y, w: pw, h: ph };
            placed.push(rect);
            if (!hidden || isSel) {
                ctx.fillStyle = 'rgba(6, 12, 28, 0.84)';
                roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 15);
                ctx.fill();
                ctx.strokeStyle = hexA(color, 0.45);
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.textAlign = 'left';
                ctx.textBaseline = 'middle';
                ctx.font = nameFont;
                ctx.fillStyle = '#fff';
                ctx.fillText(n.name, rect.x + 10, rect.y + 9.5);
                ctx.font = valFont;
                ctx.fillStyle = n.status === 'lost' ? '#ff6b86' : n.status === 'warn' ? '#ffd166' : n.status === 'isolated' ? '#cbd5e1' : '#67e8f9';
                ctx.fillText(val, rect.x + 10, rect.y + 21.5);
            }
        }
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '700 11px Inter, ui-sans-serif, system-ui, sans-serif';

        // Baloncuklar
        for (const b of snap.bubbles || []) {
            const base = nodePos[b.nodeId];
            if (!base) continue;
            const [nx, ny] = toScreen(base);
            const x = nx + b.offset[0] * 30;
            const y = ny - 26 + b.offset[1] * 18;
            const grow = Math.min(1, b.age / 0.35);
            const r = (b.kind === 'data' ? 16 : 18) * grow * (1 + 0.08 * Math.sin(now / 160 + b.id));
            const frac = clamp(b.remaining / b.ttl, 0, 1);
            const isData = b.kind === 'data';
            const col = isData ? '#38bdf8' : '#ff003c';
            ctx.beginPath();
            ctx.arc(x, y, r + 6, 0, Math.PI * 2);
            ctx.fillStyle = hexA(col, 0.18 + 0.12 * pulse);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
            grad.addColorStop(0, isData ? '#e0f2fe' : '#ffd1dc');
            grad.addColorStop(0.5, col);
            grad.addColorStop(1, isData ? '#0369a1' : '#7f0022');
            ctx.fillStyle = grad;
            ctx.shadowColor = col;
            ctx.shadowBlur = 14;
            ctx.fill();
            ctx.shadowBlur = 0;
            // kalan süre halkası
            ctx.beginPath();
            ctx.arc(x, y, r + 2.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `800 ${Math.max(9, r * 0.95)}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.fillText(isData ? '₵' : '☣', x, y + 0.5);
            ctx.font = '700 11px Inter, ui-sans-serif, system-ui, sans-serif';
            b.screen = [x, y, r + 8];
        }
    }

    function hexA(hex, a) {
        const n = parseInt(hex.slice(1), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${clamp(a, 0, 1).toFixed(3)})`;
    }

    function roundRect(c, x, y, rw, rh, r) {
        c.beginPath();
        c.moveTo(x + r, y);
        c.arcTo(x + rw, y, x + rw, y + rh, r);
        c.arcTo(x + rw, y + rh, x, y + rh, r);
        c.arcTo(x, y + rh, x, y, r);
        c.arcTo(x, y, x + rw, y, r);
        c.closePath();
    }

    /* ------------------------------ etkileşim ------------------------------ */
    const pointers = new Map();
    let drag = null; // { sx, sy, vx, vy, moved }
    let pinch = null; // { d0, k0, cx, cy }

    function zoomAt(factor, cx, cy) {
        const k0 = view.k;
        const k1 = clamp(k0 * factor, minK, MAX_K);
        view.x = cx - ((cx - view.x) * k1) / k0;
        view.y = cy - ((cy - view.y) * k1) / k0;
        view.k = k1;
        clampView();
        staticDirty = true;
        focusTween = null;
    }

    function localXY(e) {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    }

    function hitTest(sx, sy) {
        // Baloncuklar
        for (const b of snap?.bubbles || []) {
            if (b.screen && Math.hypot(sx - b.screen[0], sy - b.screen[1]) <= b.screen[2] + 6) return { bubble: b.id };
        }
        // Düğümler
        let best = null;
        for (const n of NODES) {
            const d = dist(toScreen(nodePos[n.id]), [sx, sy]);
            if (d <= 20 && (!best || d < best.d)) best = { nodeId: n.id, d };
        }
        if (best) return { nodeId: best.nodeId, countryId: world.hubCountry[best.nodeId] };
        // Ülkeler
        const ll = projection.invert(toBase(sx, sy));
        if (!ll || Number.isNaN(ll[0])) return {};
        for (const c of world.countries) {
            const [[x0, y0], [x1, y1]] = c.bounds;
            const inX = x1 < x0 ? ll[0] >= x0 || ll[0] <= x1 : ll[0] >= x0 && ll[0] <= x1;
            if (!inX || ll[1] < y0 || ll[1] > y1) continue;
            if (geoContains(c.feature, ll)) return { nodeId: world.regionOf[c.id]?.nodeId || null, countryId: c.id };
        }
        return {};
    }

    const onDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        canvas.setPointerCapture?.(e.pointerId);
        const [x, y] = localXY(e);
        pointers.set(e.pointerId, [x, y]);
        if (pointers.size === 2) {
            const [p1, p2] = [...pointers.values()];
            pinch = { d0: dist(p1, p2), k0: view.k, cx: (p1[0] + p2[0]) / 2, cy: (p1[1] + p2[1]) / 2 };
            drag = null;
        } else {
            drag = { sx: x, sy: y, vx: view.x, vy: view.y, moved: false, t: performance.now() };
        }
        canvas.style.cursor = 'grabbing';
    };
    const onMove = (e) => {
        if (!pointers.has(e.pointerId)) return;
        const [x, y] = localXY(e);
        pointers.set(e.pointerId, [x, y]);
        if (pinch && pointers.size >= 2) {
            const [p1, p2] = [...pointers.values()];
            const d = dist(p1, p2);
            const factor = (pinch.k0 * (d / (pinch.d0 || 1))) / view.k;
            zoomAt(factor, pinch.cx, pinch.cy);
            return;
        }
        if (drag) {
            const dx = x - drag.sx;
            const dy = y - drag.sy;
            if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
            if (drag.moved) {
                view.x = drag.vx + dx;
                view.y = drag.vy + dy;
                clampView();
                staticDirty = true;
                focusTween = null;
            }
        }
    };
    const onUp = (e) => {
        const [x, y] = localXY(e);
        pointers.delete(e.pointerId);
        canvas.style.cursor = 'grab';
        if (pinch) {
            if (pointers.size < 2) pinch = null;
            drag = null;
            return;
        }
        if (!drag) return;
        const d = drag;
        drag = null;
        if (d.moved || performance.now() - d.t > 800) return;
        const hit = hitTest(x, y);
        if (hit.bubble != null) {
            onPopBubble?.(hit.bubble);
            return;
        }
        onSelect?.(hit.nodeId || null, hit.countryId || null);
    };
    const onCancel = (e) => {
        pointers.delete(e.pointerId);
        drag = null;
        if (pointers.size < 2) pinch = null;
        canvas.style.cursor = 'grab';
    };
    const onWheel = (e) => {
        e.preventDefault();
        const [x, y] = localXY(e);
        zoomAt(Math.exp(-e.deltaY * 0.0016), x, y);
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Klavye: ok tuşları kaydırır, + / - yakınlaştırır (yazı alanlarında devre dışı; harf kısayolları oyun ekranında).
    const onKey = (e) => {
        if (!keyboardEnabled) return;
        if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
        if (document.querySelector('.pz-modal-backdrop')) return;
        const step = 60;
        switch (e.key) {
            case 'ArrowLeft': panBy(step, 0); break;
            case 'ArrowRight': panBy(-step, 0); break;
            case 'ArrowUp': panBy(0, step); break;
            case 'ArrowDown': panBy(0, -step); break;
            case '+': case '=': zoomAt(1.25, w / 2, h / 2); break;
            case '-': case '_': zoomAt(1 / 1.25, w / 2, h / 2); break;
            default: return;
        }
        e.preventDefault();
    };
    window.addEventListener('keydown', onKey);

    /* ------------------------------ dış API ------------------------------ */
    function update(s) {
        if (disposed) return;
        snap = s;
    }

    function setSelected(id) {
        if (selectedId === (id || null)) return;
        selectedId = id || null;
        staticDirty = true;
    }

    function focusNode(id) {
        const p = nodePos[id];
        if (!p) return;
        const k = Math.max(view.k, 2.2);
        focusTween = { k, x: w / 2 - p[0] * k, y: h / 2 - p[1] * k };
    }

    function setPaused(p) {
        paused = Boolean(p);
    }

    let raf = 0;
    let last = performance.now();
    function frame(now) {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (focusTween) {
            const a = 1 - Math.pow(0.002, dt);
            view.k += (focusTween.k - view.k) * a;
            view.x += (focusTween.x - view.x) * a;
            view.y += (focusTween.y - view.y) * a;
            clampView();
            staticDirty = true;
            if (Math.abs(view.k - focusTween.k) < 0.01 && Math.hypot(view.x - focusTween.x, view.y - focusTween.y) < 0.5) focusTween = null;
        }
        drawFrame(now, dt);
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    ro?.observe(container);
    resize();
    raf = requestAnimationFrame(frame);

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        ro?.disconnect();
        canvas.removeEventListener('pointerdown', onDown);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('pointerup', onUp);
        canvas.removeEventListener('pointercancel', onCancel);
        canvas.removeEventListener('wheel', onWheel);
        window.removeEventListener('keydown', onKey);
        canvas.remove();
    }

    function resetView() {
        if (w < 640) {
            const p = projection([22, 34]);
            focusTween = { k: 1, x: w / 2 - p[0], y: h / 2 - p[1] };
        } else focusTween = { k: 1, x: 0, y: 0 };
    }

    return {
        update,
        setSelected,
        focusNode,
        setPaused,
        resize,
        dispose,
        panBy,
        resetView,
        setKeyboardEnabled: (v) => {
            keyboardEnabled = Boolean(v);
        },
        zoomIn: () => zoomAt(1.4, w / 2, h / 2),
        zoomOut: () => zoomAt(1 / 1.4, w / 2, h / 2),
    };
}
