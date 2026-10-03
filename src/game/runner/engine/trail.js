/*
 * Koşu izi (avatar "trail"): kalp, yıldız tozu, neon şerit, gökkuşağı.
 *
 * Avatarın trailAnchor'ından üretilir; koşu motorunda ve karakter
 * önizlemesinde (viewer) aynı modül kullanılır. Konumlar "dünya z"sinde
 * (ileri = +z, metre) tutulur ve her kare referans z'ye göre göreli yazılır
 * (render z = -(dünyaZ - refZ)): böylece iz oyuncunun arkasında yerinde
 * kalır, oyuncu ilerledikçe geride uzar. Önizlemede sanal bir ileri hız
 * verilir; iz yine karakterin arkasına akar.
 *
 * İki parça, en fazla 2 draw call:
 *  - sprite partikülleri (kalp/yıldız/parıltı atlası; tek Points),
 *  - şerit (neon/gökkuşağı; yatay bant, geçmiş noktalarından tek mesh).
 * Render döngüsünde allocation yok. Düşük kalitede (lite) partikül ve
 * şerit noktası yarıya iner.
 */
import * as THREE from 'three';

export const TRAIL_KINDS = ['none', 'kalp', 'yildiz', 'neon', 'gokkusagi'];

const MAX_SPRITES = 90;
const RIBBON_POINTS = 30;
const LITE_RIBBON_POINTS = 14;
const SAMPLE_S = 1 / 50;

// Sprite atlas hücreleri
const CELL_HEART = 0;
const CELL_STAR = 1;
const CELL_SPARK = 2;

/*
 * Tür ayarları: emit = saniyede sprite, ribbon = şerit sütun renkleri
 * (her bant 2 sütun: keskin renk sınırı), width = şerit genişliği (m).
 */
const KINDS = {
    none: null,
    kalp: { emit: 14, follow: 0.78, cells: [CELL_HEART, CELL_HEART, CELL_SPARK], colors: [0xff4f8b, 0xff86b4, 0xffc2d8, 0xff2e63], size: [0.16, 0.26], life: [0.7, 1.0], rise: 0.55, ribbon: null },
    yildiz: { emit: 24, follow: 0.7, cells: [CELL_STAR, CELL_STAR, CELL_SPARK], colors: [0xffe066, 0xfff4c2, 0xffffff, 0xffc93c], size: [0.1, 0.2], life: [0.5, 0.8], rise: -0.15, ribbon: null },
    neon: { emit: 8, follow: 0.4, cells: [CELL_SPARK], colors: [0x7ff6ff, 0xff4fd8], size: [0.08, 0.14], life: [0.35, 0.55], rise: 0.1, width: 0.34, ribbon: [[0xff2fd0, 0x9ffaff], [0x9ffaff, 0xff2fd0]] },
    gokkusagi: { emit: 10, follow: 0.4, cells: [CELL_SPARK, CELL_STAR], colors: [0xffffff, 0xfff4c2], size: [0.08, 0.15], life: [0.4, 0.6], rise: 0.05, width: 0.5, ribbon: [[0xff3b4a, 0xff3b4a], [0xff9a2e, 0xff9a2e], [0xffe14d, 0xffe14d], [0x3ddc84, 0x3ddc84], [0x3aa0ff, 0x3aa0ff], [0x9b5cff, 0x9b5cff]] },
};

const _c = new THREE.Color();

/** Kalp / yıldız / dört köşeli parıltı: beyaz şekiller (renk köşeden gelir). */
function createAtlasTexture() {
    const S = 64;
    const c = document.createElement('canvas');
    c.width = S * 3;
    c.height = S;
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 8;
    // Kalp
    g.save();
    g.translate(S / 2, S / 2 + 3);
    g.beginPath();
    g.moveTo(0, 16);
    g.bezierCurveTo(-26, -2, -16, -24, 0, -10);
    g.bezierCurveTo(16, -24, 26, -2, 0, 16);
    g.fill();
    g.restore();
    // Yıldız (5 köşe)
    g.save();
    g.translate(S + S / 2, S / 2 + 2);
    g.beginPath();
    for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 9 : 22;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
    // Parıltı (dört köşe + yumuşak merkez)
    g.save();
    g.translate(2 * S + S / 2, S / 2);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 14);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-16, -16, 32, 32);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 4 : 24;
        const a = (i * Math.PI) / 4;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
}

/**
 * parent: izin ekleneceği nesne (sahne ya da önizlemede karakterle dönen grup).
 * Dönen API: setKind, setLite, setPixelScale, update, clear, dispose.
 */
export function createTrail(parent, { kind = 'none', lite = false } = {}) {
    const atlas = createAtlasTexture();

    // --- Sprite partikülleri ---
    const P = MAX_SPRITES;
    const px = new Float32Array(P);
    const py = new Float32Array(P);
    const pz = new Float64Array(P); // dünya z
    const vx = new Float32Array(P);
    const vy = new Float32Array(P);
    const vz = new Float32Array(P); // ileri sürüklenme (m/s): iz karakterin yakınında biraz oyalansın
    const life = new Float32Array(P);
    const maxLife = new Float32Array(P);
    const size0 = new Float32Array(P);
    const twinkle = new Float32Array(P);
    const cr = new Float32Array(P);
    const cg = new Float32Array(P);
    const cb = new Float32Array(P);
    const cell = new Float32Array(P);
    let alive = 0;

    const gPos = new Float32Array(P * 3);
    const gCol = new Float32Array(P * 4);
    const gSize = new Float32Array(P);
    const pgeo = new THREE.BufferGeometry();
    const aPos = new THREE.BufferAttribute(gPos, 3).setUsage(THREE.DynamicDrawUsage);
    const aCol = new THREE.BufferAttribute(gCol, 4).setUsage(THREE.DynamicDrawUsage);
    const aSize = new THREE.BufferAttribute(gSize, 1).setUsage(THREE.DynamicDrawUsage);
    const aCell = new THREE.BufferAttribute(cell, 1).setUsage(THREE.DynamicDrawUsage);
    pgeo.setAttribute('position', aPos);
    pgeo.setAttribute('pcolor', aCol);
    pgeo.setAttribute('psize', aSize);
    pgeo.setAttribute('pcell', aCell);
    pgeo.setDrawRange(0, 0);
    const pmat = new THREE.ShaderMaterial({
        uniforms: { map: { value: atlas }, uScale: { value: 500 } },
        vertexShader: `
            attribute vec4 pcolor;
            attribute float psize;
            attribute float pcell;
            uniform float uScale;
            varying vec4 vColor;
            varying float vCell;
            void main() {
                vColor = pcolor;
                vCell = pcell;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = clamp(psize * uScale / max(0.1, -mv.z), 0.0, 72.0);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            uniform sampler2D map;
            varying vec4 vColor;
            varying float vCell;
            void main() {
                vec2 uv = vec2((gl_PointCoord.x + vCell) / 3.0, 1.0 - gl_PointCoord.y);
                float a = texture2D(map, uv).a * vColor.a;
                if (a < 0.01) discard;
                gl_FragColor = vec4(vColor.rgb, a);
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
    });
    const points = new THREE.Points(pgeo, pmat);
    points.frustumCulled = false;
    points.renderOrder = 3;
    points.visible = false;
    parent.add(points);

    // --- Şerit ---
    const MAX_COLS = 12;
    const hx = new Float32Array(RIBBON_POINTS);
    const hy = new Float32Array(RIBBON_POINTS);
    const hz = new Float64Array(RIBBON_POINTS);
    let hCount = 0;
    let sampleAcc = 0;
    const rPos = new Float32Array(RIBBON_POINTS * MAX_COLS * 3);
    const rCol = new Float32Array(RIBBON_POINTS * MAX_COLS * 4);
    const rgeo = new THREE.BufferGeometry();
    const rPosA = new THREE.BufferAttribute(rPos, 3).setUsage(THREE.DynamicDrawUsage);
    const rColA = new THREE.BufferAttribute(rCol, 4).setUsage(THREE.DynamicDrawUsage);
    rgeo.setAttribute('position', rPosA);
    rgeo.setAttribute('rcolor', rColA);
    const rmat = new THREE.ShaderMaterial({
        vertexShader: `
            attribute vec4 rcolor;
            varying vec4 vColor;
            void main() {
                vColor = rcolor;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }`,
        fragmentShader: `
            varying vec4 vColor;
            void main() {
                gl_FragColor = vColor;
                #include <colorspace_fragment>
            }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const ribbon = new THREE.Mesh(rgeo, rmat);
    ribbon.frustumCulled = false;
    ribbon.renderOrder = 2;
    ribbon.visible = false;
    parent.add(ribbon);

    let cfg = null;
    let cols = 0;
    let colX = new Float32Array(MAX_COLS);
    const colRGB = new Float32Array(MAX_COLS * 3);
    let isLite = Boolean(lite);
    let emitAcc = 0;
    let fadeOut = 0;

    function setupRibbon() {
        cols = 0;
        if (!cfg || !cfg.ribbon) {
            rgeo.setIndex(null);
            return;
        }
        const bands = cfg.ribbon.length;
        cols = bands * 2;
        const w = cfg.width;
        for (let b = 0; b < bands; b++) {
            for (let s = 0; s < 2; s++) {
                const ci = b * 2 + s;
                colX[ci] = -w / 2 + ((b + s) / bands) * w;
                _c.setHex(cfg.ribbon[b][s]);
                colRGB[ci * 3] = _c.r;
                colRGB[ci * 3 + 1] = _c.g;
                colRGB[ci * 3 + 2] = _c.b;
            }
        }
        // Yalnızca bant içi dörtgenler (bant sınırında renk keskin kalsın).
        const idx = [];
        for (let i = 0; i < RIBBON_POINTS - 1; i++) {
            for (let b = 0; b < bands; b++) {
                const a0 = i * cols + b * 2;
                const a1 = a0 + 1;
                const b0 = a0 + cols;
                const b1 = b0 + 1;
                idx.push(a0, b0, a1, a1, b0, b1);
            }
        }
        rgeo.setIndex(idx);
    }

    function setKind(k) {
        cfg = KINDS[k] || null;
        alive = 0;
        hCount = 0;
        points.visible = false;
        ribbon.visible = false;
        setupRibbon();
    }
    setKind(kind);

    function spawn(x, y, zW, speed) {
        if (!cfg) return;
        const i = alive < P ? alive++ : Math.floor(Math.random() * P);
        px[i] = x + (Math.random() - 0.5) * 0.25;
        py[i] = y + (Math.random() - 0.5) * 0.18;
        pz[i] = zW - Math.random() * 0.2;
        vx[i] = (Math.random() - 0.5) * 0.5;
        vy[i] = cfg.rise * (0.6 + Math.random() * 0.8);
        vz[i] = speed * cfg.follow * (0.85 + Math.random() * 0.3);
        maxLife[i] = cfg.life[0] + Math.random() * (cfg.life[1] - cfg.life[0]);
        life[i] = maxLife[i];
        size0[i] = cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]);
        twinkle[i] = Math.random() * 6.28;
        _c.setHex(cfg.colors[Math.floor(Math.random() * cfg.colors.length)]);
        cr[i] = _c.r;
        cg[i] = _c.g;
        cb[i] = _c.b;
        cell[i] = cfg.cells[Math.floor(Math.random() * cfg.cells.length)];
    }

    return {
        get kind() {
            return cfg ? kind : 'none';
        },
        setKind(k) {
            kind = k;
            setKind(k);
        },
        setLite(on) {
            isLite = Boolean(on);
        },
        /** Partikül boyutu: dünya birimi -> piksel. */
        setPixelScale(heightPx, fovDeg) {
            pmat.uniforms.uScale.value = heightPx / (2 * Math.tan((fovDeg * Math.PI) / 360));
        },
        clear() {
            alive = 0;
            hCount = 0;
            points.visible = false;
            ribbon.visible = false;
        },

        /**
         * ax, ay, azR: çapanın parent uzayındaki konumu (render metre);
         * refZ: referansın dünya z'si (m); emitting: iz üretilsin mi (koşuyor);
         * speed: ileri hız (m/s; partiküller bunun bir kısmıyla sürüklenir).
         */
        update(dt, ax, ay, azR, refZ, emitting, speed = 0) {
            if (!cfg) return;
            const zW = refZ - azR;
            // --- Sprite üretimi ---
            const rate = cfg.emit * (isLite ? 0.5 : 1);
            if (emitting) {
                emitAcc += dt * rate;
                let n = Math.min(4, Math.floor(emitAcc));
                emitAcc -= n;
                while (n-- > 0) spawn(ax, ay, zW, speed);
            } else {
                emitAcc = 0;
            }
            let i = 0;
            while (i < alive) {
                life[i] -= dt;
                if (life[i] <= 0) {
                    const j = alive - 1;
                    px[i] = px[j]; py[i] = py[j]; pz[i] = pz[j];
                    vx[i] = vx[j]; vy[i] = vy[j]; vz[i] = vz[j];
                    life[i] = life[j]; maxLife[i] = maxLife[j]; size0[i] = size0[j]; twinkle[i] = twinkle[j];
                    cr[i] = cr[j]; cg[i] = cg[j]; cb[i] = cb[j]; cell[i] = cell[j];
                    alive--;
                    continue;
                }
                px[i] += vx[i] * dt;
                py[i] += vy[i] * dt;
                pz[i] += vz[i] * dt;
                const t = life[i] / maxLife[i];
                gPos[i * 3] = px[i];
                gPos[i * 3 + 1] = py[i];
                gPos[i * 3 + 2] = -(pz[i] - refZ);
                gCol[i * 4] = cr[i];
                gCol[i * 4 + 1] = cg[i];
                gCol[i * 4 + 2] = cb[i];
                gCol[i * 4 + 3] = t < 0.4 ? t / 0.4 : 1;
                const tw = cell[i] === CELL_HEART ? 1 : 0.75 + 0.25 * Math.sin(twinkle[i] + life[i] * 18);
                gSize[i] = size0[i] * (0.55 + 0.45 * Math.min(1, (1 - t) * 6)) * tw;
                i++;
            }
            pgeo.setDrawRange(0, alive);
            points.visible = alive > 0;
            if (alive > 0) {
                aPos.needsUpdate = true;
                aCol.needsUpdate = true;
                aSize.needsUpdate = true;
                aCell.needsUpdate = true;
            }

            // --- Şerit ---
            if (!cols) return;
            const maxPts = isLite ? LITE_RIBBON_POINTS : RIBBON_POINTS;
            sampleAcc += dt;
            if (emitting) {
                fadeOut = 1;
                if (sampleAcc >= SAMPLE_S || hCount === 0) {
                    sampleAcc = 0;
                    // Yeni nokta başa; eskiler kayar (en fazla maxPts).
                    const n = Math.min(hCount, maxPts - 1);
                    for (let k = n; k > 0; k--) {
                        hx[k] = hx[k - 1];
                        hy[k] = hy[k - 1];
                        hz[k] = hz[k - 1];
                    }
                    hCount = n + 1;
                }
                hx[0] = ax;
                hy[0] = ay;
                hz[0] = zW;
            } else if (hCount > 0) {
                // Koşmuyorken iz geriden toplanır ve söner.
                fadeOut = Math.max(0, fadeOut - dt * 2.5);
                if (sampleAcc >= SAMPLE_S) {
                    sampleAcc = 0;
                    hCount--;
                }
                if (fadeOut <= 0) hCount = 0;
            }
            if (hCount < 2) {
                ribbon.visible = false;
                return;
            }
            ribbon.visible = true;
            for (let k = 0; k < hCount; k++) {
                const a = (1 - k / (hCount - 1)) * fadeOut;
                const alpha = a * a * 0.95;
                const rz = -(hz[k] - refZ);
                // Uca doğru incelir.
                const wk = 0.55 + 0.45 * (1 - k / (hCount - 1));
                for (let c = 0; c < cols; c++) {
                    const v = k * cols + c;
                    rPos[v * 3] = hx[k] + colX[c] * wk;
                    rPos[v * 3 + 1] = hy[k];
                    rPos[v * 3 + 2] = rz;
                    rCol[v * 4] = colRGB[c * 3];
                    rCol[v * 4 + 1] = colRGB[c * 3 + 1];
                    rCol[v * 4 + 2] = colRGB[c * 3 + 2];
                    rCol[v * 4 + 3] = alpha;
                }
            }
            const bands = cols / 2;
            rgeo.setDrawRange(0, (hCount - 1) * bands * 6);
            rPosA.needsUpdate = true;
            rColA.needsUpdate = true;
        },

        dispose() {
            parent.remove(points, ribbon);
            pgeo.dispose();
            pmat.dispose();
            rgeo.dispose();
            rmat.dispose();
            atlas.dispose();
            colX = null;
        },
    };
}
