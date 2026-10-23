/*
 * Yaşam belirtileri: kanat çırpan kuşlar, süzülen sıcak hava balonu ve
 * ara sıra geçen küçük uçak. Hepsi prosedürel; ortak geometri/malzeme.
 */
import * as THREE from 'three';
import { createMeshBuilder, blob, box, boxC, cone, cylinder, plate } from './geo.js';

const BIRD_ORBITS = [
    { cx: 0.5, cz: -0.5, a: 6.6, b: 3.6, y: 2.4, w: 0.2, p: 0.4, dir: 1, flap: 7.5 },
    { cx: -0.4, cz: -1.0, a: 7.6, b: 3.0, y: 2.9, w: 0.16, p: 2.6, dir: -1, flap: 6.6 },
    { cx: 0.0, cz: -2.0, a: 5.6, b: 2.4, y: 1.9, w: 0.23, p: 4.1, dir: 1, flap: 8.2 },
];

function buildBird() {
    const body = createMeshBuilder();
    body.add(blob(0.5, 0), { s: [0.1, 0.085, 0.24], lo: '#e9dccb', hi: '#fffaf0', ao: 0.3, seed: 201 });
    body.add(cone(0.05, 0.1, 4), { p: [0, 0.0, 0.13], r: [Math.PI / 2, 0, 0], c: '#ffb14a', vary: 0, seed: 202 }); // gaga
    body.add(plate([[0, 0], [0.05, 0.1], [-0.05, 0.1]], 0.012), { p: [0, 0.0, -0.2], r: [Math.PI / 2, 0, 0], c: '#cfc3b2', vary: 0, seed: 203 }); // kuyruk
    const wing = createMeshBuilder();
    wing.add(plate([[0, 0.06], [0.36, 0.0], [0.1, -0.1], [0, -0.07]], 0.01), {
        r: [Math.PI / 2, 0, 0],
        lo: '#d8ccbb',
        hi: '#fffaf0',
        vary: 0.03,
        seed: 204,
    });
    return { body: body.build(), wing: wing.build(), triangles: body.triangles + wing.triangles * 2 };
}

function buildBalloon() {
    const b = createMeshBuilder();
    const prof = [[0.001, 0], [0.12, 0.03], [0.3, 0.16], [0.4, 0.38], [0.37, 0.6], [0.22, 0.8], [0.001, 0.92]];
    const n = 8;
    const cols = [['#ef5a4f', '#ff8a72'], ['#fff1d4', '#ffffff'], ['#f2b84a', '#ffd877'], ['#fff1d4', '#ffffff']];
    for (let i = 0; i < n; i++) {
        const g = new THREE.LatheGeometry(prof.map((p) => new THREE.Vector2(p[0], p[1])), 1, (i / n) * Math.PI * 2, (Math.PI * 2) / n);
        const c = cols[i % cols.length];
        b.add(g, { p: [0, 0.28, 0], lo: c[0], hi: c[1], vary: 0.03, seed: 210 + i });
    }
    b.add(box(0.15, 0.1, 0.15), { p: [0, 0, 0], lo: '#7a5232', hi: '#b98655', ao: 0.3, seed: 220 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        b.add(cylinder(0.004, 0.004, 0.3, 3), { p: [sx * 0.06, 0.1, sz * 0.06], r: [sz * 0.18, 0, -sx * 0.18], c: '#5a4636', vary: 0, seed: 221 });
    }
    return { geometry: b.build(), triangles: b.triangles };
}

function buildPlane() {
    const b = createMeshBuilder();
    b.add(blob(0.5, 0), { s: [0.17, 0.15, 0.62], lo: '#c93b3a', hi: '#ee5a4e', ao: 0.2, seed: 230 });
    b.add(box(0.8, 0.02, 0.2), { p: [0, 0.07, 0.05], c: '#fff1d4', vary: 0.03, seed: 231 });
    b.add(box(0.8, 0.02, 0.2), { p: [0, -0.1, 0.05], c: '#fff1d4', vary: 0.03, seed: 232 });
    b.add(box(0.04, 0.17, 0.04), { p: [0.3, -0.09, 0.05], c: '#8a7468', vary: 0, seed: 233 });
    b.add(box(0.04, 0.17, 0.04), { p: [-0.3, -0.09, 0.05], c: '#8a7468', vary: 0, seed: 234 });
    b.add(box(0.3, 0.015, 0.1), { p: [0, 0.0, -0.3], c: '#fff1d4', vary: 0, seed: 235 });
    b.add(box(0.016, 0.14, 0.12), { p: [0, 0.0, -0.3], c: '#c93b3a', vary: 0, seed: 236 });
    const prop = createMeshBuilder();
    prop.add(boxC(0.03, 0.34, 0.012), { c: '#5a4636', vary: 0, seed: 237 });
    prop.add(boxC(0.34, 0.03, 0.012), { c: '#5a4636', vary: 0, seed: 238 });
    return { geometry: b.build(), prop: prop.build(), triangles: b.triangles + prop.triangles };
}

export function createCreatures() {
    const group = new THREE.Group();
    group.name = 'creatures';
    const bird = buildBird();
    const balloon = buildBalloon();
    const plane = buildPlane();
    const birdMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const solidMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    const flatMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

    const birds = BIRD_ORBITS.map((o) => {
        const g = new THREE.Group();
        const bodyMesh = new THREE.Mesh(bird.body, birdMat);
        const wl = new THREE.Mesh(bird.wing, birdMat);
        const wr = new THREE.Mesh(bird.wing, birdMat);
        wr.scale.x = -1;
        g.add(bodyMesh, wl, wr);
        group.add(g);
        return { o, g, wl, wr };
    });

    const balloonMesh = new THREE.Mesh(balloon.geometry, solidMat);
    balloonMesh.scale.setScalar(1.15);
    group.add(balloonMesh);

    const planeGroup = new THREE.Group();
    const planeMesh = new THREE.Mesh(plane.geometry, flatMat);
    const propMesh = new THREE.Mesh(plane.prop, solidMat);
    propMesh.position.set(0, 0, 0.33);
    planeGroup.add(planeMesh, propMesh);
    group.add(planeGroup);

    function placeBird(b, t, animate) {
        const o = b.o;
        const phi = o.p + t * o.w * o.dir;
        const x = o.cx + Math.cos(phi) * o.a;
        const z = o.cz + Math.sin(phi) * o.b;
        const y = o.y + Math.sin(phi * 2.3 + o.p) * 0.35;
        b.g.position.set(x, y, z);
        const vx = -Math.sin(phi) * o.a * o.dir;
        const vz = Math.cos(phi) * o.b * o.dir;
        b.g.rotation.y = Math.atan2(vx, vz);
        b.g.rotation.z = -0.25 * o.dir * (Math.cos(phi) > 0 ? 1 : 0.6);
        const f = animate ? Math.sin(t * o.flap + o.p * 3) : 0.25;
        b.wl.rotation.z = 0.15 + f * 0.7;
        b.wr.rotation.z = -(0.15 + f * 0.7);
    }

    /**
     * t: saniye; animate=false (hareketi azalt) => sabit poz. detail: 0..3
     * (3: yalnızca bir kuş, balon/uçak yok).
     */
    function update(t, animate = true, detail = 0) {
        const nBirds = detail >= 3 ? 1 : detail >= 1 ? 2 : 3;
        birds.forEach((b, i) => {
            b.g.visible = i < nBirds;
            if (b.g.visible) placeBird(b, animate ? t : 0, animate);
        });
        // Balon: arkada, yavaşça sağa süzülür
        balloonMesh.visible = detail < 3;
        const tb = animate ? t : 0;
        const span = 26;
        const bx = (((-7.5 + tb * 0.28 + 13) % span) + span) % span - 13;
        const bFade = 1 - Math.min(1, Math.max(0, (Math.abs(bx) - 10) / 3));
        balloonMesh.position.set(animate ? bx : 5.2, -0.2 + Math.sin(tb * 0.5) * 0.18, -7.5);
        balloonMesh.rotation.y = tb * 0.12;
        balloonMesh.scale.setScalar(1.15 * (animate ? Math.max(0.001, bFade) : 1));
        // Uçak: sağdan sola ara sıra
        planeGroup.visible = detail < 2;
        const cycle = 52;
        const tp = animate ? (t % cycle) / cycle : 0.34;
        const px = 15 - tp * 36;
        planeGroup.position.set(px, 1.0 + Math.sin(tp * 12) * 0.2, -11);
        planeGroup.rotation.set(0.05 * Math.sin(tp * 30), -Math.PI / 2, 0.12 * Math.sin(tp * 20));
        propMesh.rotation.z = animate ? t * 40 : 0.6;
    }
    update(0, false, 0);

    return {
        group,
        update,
        triangles: bird.triangles * BIRD_ORBITS.length + balloon.triangles + plane.triangles,
        dispose() {
            bird.body.dispose();
            bird.wing.dispose();
            balloon.geometry.dispose();
            plane.geometry.dispose();
            plane.prop.dispose();
            birdMat.dispose();
            solidMat.dispose();
            flatMat.dispose();
            group.removeFromParent();
        },
    };
}

