/*
 * Kulenin tepesindeki mini karakter.
 *
 * Her zaman oturmuş en üst katın ortasında durur (kuleyi oyuncu diker,
 * karakter hareketli katla kaymaz). Hareketli kat ayaklarına gelince onun
 * üstüne küçük bir zıplamayla çıkar, kat geçince geri iner (ip atlama);
 * kat oturunca yeni kata tırmanır, mükemmelde ve doğru cevapta kutlama
 * yapar, ıskada olduğu yerde sendeler ve üzülür. Kameraya döner.
 *
 * Boy ≈ 1,3 m (AVATAR_SCALE). 0,85'i geçmesin: en üst kat birkaç on cm'ye
 * kadar daralabilir, daha büyük karakter kenarlardan taşar.
 *
 * Karakter avatar sisteminden (src/game/avatar/build3d.js → buildAvatar);
 * kurulumda hata olursa primitiflerden basit bir yer tutucu çizilir (oyun
 * karaktersiz kalmasın). Poz geçişleri yumuşak: poz önce bir hedefe yazılır,
 * rig hedefe üstel sönümle yaklaşır (build3d.blendPose).
 */
import * as THREE from 'three';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES, normalizeAvatar } from '../../avatar/catalog.js';
import { buildAvatar, blendPose, createPoseTarget, poseCheer, poseFall, poseIdle, poseJump } from '../../avatar/build3d.js';
import { clamp, damp, easeOutCubic } from '../../runner/engine/mathUtils.js';

export const AVATAR_SCALE = 0.8;
const HOP_S = 0.34;
const HOP_H = 0.9;
const CHEER_S = 1.1;

/** Primitiflerden mini karakter (build3d yoksa). */
function buildPlaceholder(config) {
    const root = new THREE.Group();
    const disposables = [];
    const mat = (hex) => {
        const m = new THREE.MeshLambertMaterial({ color: hex });
        disposables.push(m);
        return m;
    };
    const skin = mat(SKIN_TONES[config.skin]);
    const top = mat(CLOTH_COLORS[config.top.color]);
    const bottom = mat(CLOTH_COLORS[config.bottom.color]);
    const hair = mat(HAIR_COLORS[config.hair.color]);
    const shoes = mat(CLOTH_COLORS[config.shoes.color]);
    const cap = new THREE.CapsuleGeometry(0.17, 0.32, 4, 10);
    const limb = new THREE.CapsuleGeometry(0.06, 0.34, 3, 8);
    const head = new THREE.SphereGeometry(0.17, 16, 12);
    const hairGeo = new THREE.SphereGeometry(0.18, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
    disposables.push(cap, limb, head, hairGeo);
    const body = new THREE.Mesh(cap, top);
    body.position.y = 0.95;
    root.add(body);
    const h = new THREE.Mesh(head, skin);
    h.position.y = 1.42;
    root.add(h);
    const hr = new THREE.Mesh(hairGeo, hair);
    hr.position.y = 1.45;
    root.add(hr);
    const legs = [];
    for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(limb, bottom);
        leg.position.set(0.09 * s, 0.42, 0);
        root.add(leg);
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.07, 0.2), shoes);
        disposables.push(foot.geometry);
        foot.position.set(0.09 * s, 0.04, -0.03);
        root.add(foot);
        legs.push(leg);
    }
    const arms = [];
    for (const s of [-1, 1]) {
        const pivot = new THREE.Object3D();
        pivot.position.set(0.24 * s, 1.18, 0);
        const arm = new THREE.Mesh(limb, top);
        arm.position.y = -0.2;
        pivot.add(arm);
        root.add(pivot);
        arms.push(pivot);
    }
    return {
        root,
        placeholder: true,
        pose(kind, t) {
            const a = kind === 'cheer' ? 2.6 + Math.sin(t * 14) * 0.25 : kind === 'jump' ? 1.8 : kind === 'sad' ? 0.15 : 0.12 + Math.sin(t * 2) * 0.05;
            arms[0].rotation.z = -a;
            arms[1].rotation.z = a;
            body.rotation.x = kind === 'sad' ? 0.25 : 0;
        },
        dispose() {
            for (const d of disposables) d.dispose();
        },
    };
}

/** build3d karakterini ortak arayüze sarar; pozlar hedefe yazılıp yumuşakça uygulanır. */
function wrapAvatar(built) {
    const { rig } = built;
    const target = createPoseTarget(rig);
    return {
        root: built.root,
        placeholder: false,
        setConfig: built.setConfig,
        pose(kind, t, x, dt) {
            if (kind === 'cheer') poseCheer(target, t);
            else if (kind === 'jump') poseJump(target, x ?? 0.5);
            else if (kind === 'sad') poseFall(target);
            else poseIdle(target, t);
            blendPose(rig, target, dt > 0 ? 1 - Math.exp(-14 * dt) : 1);
        },
        dispose() {
            built.dispose();
        },
    };
}

export function createAvatarTop(scene, { avatar, gender, detail = 'low' } = {}) {
    const holder = new THREE.Group();
    holder.scale.setScalar(AVATAR_SCALE);
    holder.visible = false;
    scene.add(holder);
    let fig = null;
    let config = normalizeAvatar(avatar, gender);

    // Konum ve zıplama durumu
    const pos = new THREE.Vector3(0, 0, 0);
    const hopFrom = new THREE.Vector3();
    let hopT = -1;
    let hopDur = HOP_S;
    let hopH = HOP_H;
    let cheerT = 0;
    let sad = false;
    let yaw = 0;

    function attach(f) {
        fig = f;
        holder.add(f.root);
        holder.visible = true;
    }

    try {
        attach(wrapAvatar(buildAvatar(config, { detail })));
    } catch (err) {
        console.error('[tower] karakter kurulamadı, yer tutucu çiziliyor', err);
        attach(buildPlaceholder(config));
    }

    return {
        /** Anında konumlan (oyun başı). */
        snapTo(x, y, z) {
            pos.set(x, y, z);
            hopT = -1;
            holder.position.copy(pos);
        },
        /** Hedefe zıpla; hedef her karede update'e verilir (hareketli kat). */
        hop(duration = HOP_S, height = HOP_H) {
            hopFrom.copy(pos);
            hopT = 0;
            hopDur = duration;
            hopH = height;
        },
        cheer() {
            cheerT = CHEER_S;
            sad = false;
        },
        setSad(v) {
            sad = Boolean(v);
            if (sad) cheerT = 0;
        },
        setConfig(next) {
            config = normalizeAvatar(next, gender);
            if (fig && typeof fig.setConfig === 'function') {
                try {
                    fig.setConfig(config);
                } catch {
                    // görünüm güncellenemedi: eski karakter kalır
                }
            }
        },
        /**
         * tx/ty/tz: ayakların hedefi (kat üstü ortası), faceYaw: kameraya dönüş
         * açısı (radyan).
         */
        update(dt, time, tx, ty, tz, faceYaw) {
            if (hopT >= 0) {
                hopT += dt;
                const p = clamp(hopT / hopDur, 0, 1);
                const e = easeOutCubic(p);
                pos.set(hopFrom.x + (tx - hopFrom.x) * e, hopFrom.y + (ty - hopFrom.y) * e + Math.sin(p * Math.PI) * hopH, hopFrom.z + (tz - hopFrom.z) * e);
                if (p >= 1) hopT = -1;
            } else {
                pos.x = tx;
                pos.z = tz;
                pos.y = damp(pos.y, ty, 30, dt);
            }
            holder.position.copy(pos);
            yaw = damp(yaw, faceYaw, 6, dt);
            holder.rotation.y = yaw;
            if (cheerT > 0) cheerT -= dt;
            if (!fig) return;
            // Zıplamada vy01: +1 kalkış .. -1 iniş
            if (hopT >= 0) fig.pose('jump', time, 1 - 2 * clamp(hopT / hopDur, 0, 1), dt);
            else if (cheerT > 0) fig.pose('cheer', time, 0, dt);
            else if (sad) fig.pose('sad', time, 0, dt);
            else fig.pose('idle', time, 0, dt);
        },
        dispose() {
            if (fig) {
                holder.remove(fig.root);
                fig.dispose();
                fig = null;
            }
            scene.remove(holder);
        },
    };
}
