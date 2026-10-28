/*
 * PROTOCOL: ZERO — Three.js siber küre.
 *
 *   const globe = createGlobe(container, { labelsEl, onSelect, lowPower, reducedMotion });
 *   globe.update(snapshot);        // sim.snapshot(): düğüm renk/boyutları, hat renkleri, saldırı halkası
 *   globe.setSelected(id|null);    // seçili düğüm halkası
 *   globe.focusNode(id);           // kamerayı düğüme çevir
 *   globe.setPaused(bool);         // otomatik dönüş / paket akışı durur
 *   globe.dispose();
 *
 * Sahne: yıldız alanı, koyu lacivert küre + enlem/boylam ızgarası, atmosferik fresnel parlaması
 * (BackSide additive shader), 14 düğüm (çekirdek + hale + saldırı/seçim halkası), kıtalar arası
 * QuadraticBezierCurve3 fiber hatlar ve üstlerinde akan veri paketleri. Dokunmatik/fare: OrbitControls.
 * Seçim: sürüklemeden bırakılan işaretçi → raycaster (geniş görünmez vuruş küreleri; başparmakla kolay).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COLORS, LINKS, NODES } from './constants';
import { arcControlPoint, latLngToVector3 } from './geo';

const STATUS_COLOR = {
    safe: new THREE.Color(COLORS.safe),
    warn: new THREE.Color(COLORS.warn),
    lost: new THREE.Color(COLORS.lost),
    isolated: new THREE.Color(COLORS.isolated),
};
const LINK_SAFE = new THREE.Color(0x1dd3e0);
const LINK_HOT = new THREE.Color(COLORS.lost);
const LINK_OFF = new THREE.Color(0x475569);

const ATMOS_VERT = /* glsl */ `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const ATMOS_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uPower;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float rim = pow(max(0.0, 1.0 - abs(dot(vNormal, vView))), uPower);
  gl_FragColor = vec4(uColor, rim * uIntensity);
}`;

const tmpV = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

export function detectWebGL() {
    try {
        const c = document.createElement('canvas');
        return Boolean(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
    } catch {
        return false;
    }
}

function gridLines(radius, color) {
    const pts = [];
    const push = (a, b) => pts.push(a.x, a.y, a.z, b.x, b.y, b.z);
    for (let lat = -60; lat <= 60; lat += 30) {
        for (let lng = -180; lng < 180; lng += 5) {
            push(latLngToVector3(lat, lng, radius), latLngToVector3(lat, lng + 5, radius));
        }
    }
    for (let lng = -180; lng < 180; lng += 30) {
        for (let lat = -90; lat < 90; lat += 5) {
            push(latLngToVector3(lat, lng, radius), latLngToVector3(lat + 5, lng, radius));
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.16 });
    return new THREE.LineSegments(g, m);
}

function starField(count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const r = 18 + Math.random() * 22;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(2 * Math.random() - 1);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = r * Math.cos(ph);
        pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x9fd8ff, size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.8 });
    return new THREE.Points(g, m);
}

export function createGlobe(container, { labelsEl = null, onSelect = null, lowPower = false, reducedMotion = false } = {}) {
    const disposables = [];
    const track = (o) => (disposables.push(o), o);

    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
    camera.position.set(0.4, 0.9, 3.0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.55;
    controls.minDistance = 1.55;
    controls.maxDistance = 4.6;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.45;

    scene.add(new THREE.AmbientLight(0x6fa8ff, 0.9));
    const key = new THREE.DirectionalLight(0xbfe9ff, 1.1);
    key.position.set(5, 3, 4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff2d6b, 0.35);
    rim.position.set(-4, -2, -3);
    scene.add(rim);

    const world = new THREE.Group();
    scene.add(world);

    const stars = starField(lowPower ? 500 : 1200);
    track(stars.geometry);
    track(stars.material);
    scene.add(stars);

    const globeGeo = track(new THREE.SphereGeometry(1, lowPower ? 40 : 64, lowPower ? 28 : 48));
    const globeMat = track(new THREE.MeshPhongMaterial({ color: 0x071634, emissive: 0x030b1f, shininess: 18, specular: 0x1b3a6a, transparent: true, opacity: 0.97 }));
    world.add(new THREE.Mesh(globeGeo, globeMat));

    const grid = gridLines(1.004, 0x00f0ff);
    track(grid.geometry);
    track(grid.material);
    world.add(grid);

    const atmosGeo = track(new THREE.SphereGeometry(1.14, 48, 32));
    const atmosMat = track(
        new THREE.ShaderMaterial({
            vertexShader: ATMOS_VERT,
            fragmentShader: ATMOS_FRAG,
            uniforms: { uColor: { value: new THREE.Color(0x3fd8ff) }, uPower: { value: 3.2 }, uIntensity: { value: 1.25 } },
            side: THREE.BackSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    scene.add(new THREE.Mesh(atmosGeo, atmosMat));

    const innerGlowMat = track(
        new THREE.ShaderMaterial({
            vertexShader: ATMOS_VERT,
            fragmentShader: ATMOS_FRAG,
            uniforms: { uColor: { value: new THREE.Color(0x19b4d8) }, uPower: { value: 2.2 }, uIntensity: { value: 0.55 } },
            side: THREE.FrontSide,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
        })
    );
    world.add(new THREE.Mesh(track(new THREE.SphereGeometry(1.012, 48, 32)), innerGlowMat));

    /* ------------------------------ düğümler ------------------------------ */
    const coreGeo = track(new THREE.SphereGeometry(0.028, 16, 16));
    const haloGeo = track(new THREE.SphereGeometry(0.06, 16, 16));
    const hitGeo = track(new THREE.SphereGeometry(0.11, 8, 8));
    const ringGeo = track(new THREE.RingGeometry(0.075, 0.095, 40));
    // Görünmez ama ışın testine açık geniş vuruş küresi (başparmakla kolay seçim).
    const hitMat = track(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));

    const nodeObjs = {};
    const hitMeshes = [];
    const labelEls = {};
    for (const def of NODES) {
        const p = latLngToVector3(def.lat, def.lng, 1.015);
        const pos = new THREE.Vector3(p.x, p.y, p.z);
        const g = new THREE.Group();
        g.position.copy(pos);
        g.lookAt(0, 0, 0);
        const coreMat = track(new THREE.MeshBasicMaterial({ color: STATUS_COLOR.safe }));
        const haloMat = track(new THREE.MeshBasicMaterial({ color: STATUS_COLOR.safe, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
        const ringMat = track(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
        const core = new THREE.Mesh(coreGeo, coreMat);
        const halo = new THREE.Mesh(haloGeo, haloMat);
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.z = -0.005; // lookAt(0,0,0) sonrası -Z dışa bakar
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.userData.nodeId = def.id;
        g.add(core, halo, ring, hit);
        world.add(g);
        hitMeshes.push(hit);
        nodeObjs[def.id] = { def, group: g, pos, core, coreMat, halo, haloMat, ring, ringMat, status: 'safe', infection: 0, scale: 1, breach: false, selected: false };

        if (labelsEl) {
            const el = document.createElement('div');
            el.className = 'pz-label';
            el.textContent = def.name;
            el.dataset.status = 'safe';
            labelsEl.appendChild(el);
            labelEls[def.id] = el;
        }
    }

    /* -------------------------------- hatlar -------------------------------- */
    const packetGeo = track(new THREE.SphereGeometry(0.011, 8, 8));
    const links = LINKS.map(([a, b]) => {
        const pa = nodeObjs[a].pos;
        const pb = nodeObjs[b].pos;
        const c = arcControlPoint(pa, pb, 1.015);
        const curve = new THREE.QuadraticBezierCurve3(pa, new THREE.Vector3(c.x, c.y, c.z), pb);
        const pts = curve.getPoints(lowPower ? 28 : 44);
        const geo = track(new THREE.BufferGeometry().setFromPoints(pts));
        const mat = track(new THREE.LineBasicMaterial({ color: LINK_SAFE, transparent: true, opacity: 0.38 }));
        const line = new THREE.Line(geo, mat);
        world.add(line);
        const packets = [];
        const count = lowPower ? 1 : 2;
        for (let i = 0; i < count; i++) {
            const pm = track(new THREE.MeshBasicMaterial({ color: LINK_SAFE, transparent: true, opacity: 0.9 }));
            const m = new THREE.Mesh(packetGeo, pm);
            world.add(m);
            packets.push({ mesh: m, mat: pm, t: (i + Math.random()) / count, dir: i % 2 === 0 ? 1 : -1, speed: 0.12 + Math.random() * 0.08 });
        }
        return { a, b, curve, line, mat, packets, hot: false, off: false };
    });

    /* ------------------------------- etkileşim ------------------------------- */
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = null;
    const el = renderer.domElement;
    const onDown = (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
    };
    const onUp = (e) => {
        if (!downAt) return;
        const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
        const dt = performance.now() - downAt.t;
        downAt = null;
        if (moved > 8 || dt > 700) return;
        const r = el.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(hitMeshes, false);
        // Kürenin arkasında kalan düğüm seçilmesin: vuruş noktası kameraya dönük olmalı.
        for (const h of hits) {
            const id = h.object.userData.nodeId;
            const n = nodeObjs[id];
            tmpDir.copy(camera.position).sub(n.pos).normalize();
            if (n.pos.dot(tmpDir) > 0.05) {
                onSelect?.(id);
                return;
            }
        }
        onSelect?.(null);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', () => (downAt = null));

    /* ------------------------------- durum ------------------------------- */
    let paused = false;
    let selectedId = null;
    let breachId = null;
    let focusTarget = null; // Vector3 (kamera hedef konumu)
    let disposed = false;

    function applyNode(n, snap) {
        const color = STATUS_COLOR[snap.status] || STATUS_COLOR.safe;
        n.status = snap.status;
        n.infection = snap.infection;
        n.coreMat.color.copy(color);
        n.haloMat.color.copy(color);
        n.scale = 0.85 + snap.computePower / 500 + snap.infection / 350;
        n.breach = breachId === snap.id;
        if (labelEls[snap.id]) {
            const l = labelEls[snap.id];
            if (l.dataset.status !== snap.status) l.dataset.status = snap.status;
            const txt = snap.isolated ? `${n.def.name} · izole` : snap.infection > 0 ? `${n.def.name} · %${Math.round(snap.infection)}` : n.def.name;
            if (l.textContent !== txt) l.textContent = txt;
        }
    }

    function update(snapshot) {
        if (disposed || !snapshot) return;
        breachId = snapshot.breach?.nodeId || null;
        const byId = {};
        for (const s of snapshot.nodes) {
            byId[s.id] = s;
            applyNode(nodeObjs[s.id], s);
        }
        for (const l of links) {
            const a = byId[l.a];
            const b = byId[l.b];
            if (!a || !b) continue;
            l.off = a.isolated || b.isolated;
            const spreading = (a.infection > 20 && b.infection < 100) || (b.infection > 20 && a.infection < 100);
            l.hot = !l.off && (spreading || (a.infection >= 100 && b.infection >= 100));
            const c = l.off ? LINK_OFF : l.hot ? LINK_HOT : LINK_SAFE;
            l.mat.color.copy(c);
            l.mat.opacity = l.off ? 0.12 : l.hot ? 0.75 : 0.38;
            for (const p of l.packets) {
                p.mat.color.copy(c);
                p.mesh.visible = !l.off;
                if (l.hot) {
                    // Paketler enfekte kaynaktan hedefe doğru akar.
                    p.dir = a.infection >= b.infection ? 1 : -1;
                }
            }
        }
    }

    function setSelected(id) {
        selectedId = id || null;
    }

    function focusNode(id) {
        const n = nodeObjs[id];
        if (!n) return;
        const dist = camera.position.length();
        focusTarget = n.pos.clone().normalize().multiplyScalar(dist);
        controls.autoRotate = false;
    }

    function setPaused(p) {
        paused = Boolean(p);
    }

    /* -------------------------------- döngü -------------------------------- */
    const clock = new THREE.Clock();
    let raf = 0;
    let idle = 0;
    const onInteract = () => {
        idle = 0;
        focusTarget = null;
        controls.autoRotate = false;
    };
    controls.addEventListener('start', onInteract);

    function projectLabels() {
        if (!labelsEl) return;
        const w = el.clientWidth;
        const h = el.clientHeight;
        for (const id in nodeObjs) {
            const n = nodeObjs[id];
            const l = labelEls[id];
            if (!l) continue;
            tmpDir.copy(camera.position).sub(n.pos).normalize();
            const facing = n.pos.dot(tmpDir);
            if (facing < 0.12) {
                if (l.style.opacity !== '0') l.style.opacity = '0';
                continue;
            }
            tmpV.copy(n.pos).project(camera);
            const x = (tmpV.x * 0.5 + 0.5) * w;
            const y = (-tmpV.y * 0.5 + 0.5) * h;
            l.style.opacity = String(Math.min(1, (facing - 0.12) * 4));
            l.style.transform = `translate(-50%, 0) translate(${x.toFixed(1)}px, ${(y + 10).toFixed(1)}px)`;
        }
    }

    function frame() {
        if (disposed) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(clock.getDelta(), 0.1);
        const t = clock.elapsedTime;

        if (focusTarget) {
            camera.position.lerp(focusTarget, 1 - Math.pow(0.001, dt));
            if (camera.position.distanceTo(focusTarget) < 0.01) focusTarget = null;
        } else if (!reducedMotion) {
            idle += dt;
            if (idle > 6 && !paused) controls.autoRotate = true;
        }
        controls.update();

        const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);
        const fast = 0.5 + 0.5 * Math.sin(t * 9);
        for (const id in nodeObjs) {
            const n = nodeObjs[id];
            const s = n.scale * (n.status === 'warn' || n.status === 'lost' ? 1 + 0.18 * pulse : 1);
            n.core.scale.setScalar(s);
            n.halo.scale.setScalar(s * (1.1 + 0.35 * pulse * (n.infection / 100 + 0.2)));
            n.haloMat.opacity = n.status === 'isolated' ? 0.12 : 0.22 + 0.2 * pulse * (n.infection / 100);
            const isSel = selectedId === id;
            if (n.breach) {
                n.ringMat.color.copy(STATUS_COLOR.lost);
                n.ringMat.opacity = 0.5 + 0.5 * fast;
                n.ring.scale.setScalar(1.3 + 0.8 * fast);
            } else if (isSel) {
                n.ringMat.color.set(0xffffff);
                n.ringMat.opacity = 0.85;
                n.ring.scale.setScalar(1.15 + 0.1 * pulse);
            } else if (n.ringMat.opacity !== 0) {
                n.ringMat.opacity = 0;
            }
        }

        if (!paused && !reducedMotion) {
            for (const l of links) {
                const speedMul = l.hot ? 2.2 : 1;
                for (const p of l.packets) {
                    p.t += dt * p.speed * speedMul * p.dir;
                    if (p.t > 1) p.t -= 1;
                    if (p.t < 0) p.t += 1;
                    l.curve.getPointAt(p.t, p.mesh.position);
                }
            }
        }

        atmosMat.uniforms.uIntensity.value = 1.15 + 0.1 * pulse;
        renderer.render(scene, camera);
        projectLabels();
    }

    /* -------------------------------- boyut -------------------------------- */
    function resize() {
        const w = Math.max(1, container.clientWidth);
        const h = Math.max(1, container.clientHeight);
        camera.aspect = w / h;
        // Dar ekranda küre tamamen görünsün.
        camera.fov = w < h ? 56 : 42;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        el.style.width = '100%';
        el.style.height = '100%';
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    ro?.observe(container);
    resize();
    frame();

    function dispose() {
        if (disposed) return;
        disposed = true;
        cancelAnimationFrame(raf);
        ro?.disconnect();
        controls.removeEventListener('start', onInteract);
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointerup', onUp);
        controls.dispose();
        for (const d of disposables) d.dispose?.();
        for (const id in labelEls) labelEls[id].remove();
        renderer.dispose();
        renderer.forceContextLoss?.();
        el.remove();
    }

    return { update, setSelected, focusNode, setPaused, resize, dispose, renderer, camera };
}
