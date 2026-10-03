/*
 * Birleştirilmiş geometri kurucu.
 *
 * Binalar, sokak eşyaları, engeller ve karakter parçaları onlarca küçük
 * kutu/silindirden oluşuyor; hepsini tek BufferGeometry'de (köşe renkli)
 * toplamak draw call sayısını düşük tutuyor. Yalnızca kurulumda çalışır;
 * render döngüsünde kullanılmaz.
 */
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// Kutu yüzleri: normal, u ekseni, v ekseni, genişlik/yükseklik boyut indeksi (x=0,y=1,z=2).
const BOX_FACES = [
    [[1, 0, 0], [0, 0, -1], [0, 1, 0], 2, 1],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0], 2, 1],
    [[0, 1, 0], [1, 0, 0], [0, 0, -1], 0, 2],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1], 0, 2],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0], 0, 1],
    [[0, 0, -1], [-1, 0, 0], [0, 1, 0], 0, 1],
];

export class GeoBuilder {
    constructor() {
        this.pos = [];
        this.nor = [];
        this.uv = [];
        this.col = [];
        this.idx = [];
    }

    get vertexCount() {
        return this.pos.length / 3;
    }

    /**
     * Eksen hizalı kutu. uv seçenekleri:
     *  - null / { fixed:[u,v] } -> tüm köşelerde sabit nokta (düz renk bölgesi),
     *  - { pitchU, pitchV, offU, offV } -> duvar yüzlerinde metre/aralık oranında
     *    tekrar eden UV (pencere dokusu), üst/alt yüzde sabit nokta,
     *  - { fullFace:true } -> her yüzde 0..1.
     */
    box(cx, cy, cz, sx, sy, sz, color, uv = null) {
        const hx = sx / 2;
        const hy = sy / 2;
        const hz = sz / 2;
        _c.set(color);
        const dims = [sx, sy, sz];
        for (let f = 0; f < 6; f++) {
            const [n, u, v, wi, hi] = BOX_FACES[f];
            const w = dims[wi];
            const h = dims[hi];
            const base = this.vertexCount;
            const isWall = n[1] === 0;
            for (let j = 0; j < 4; j++) {
                const su = j === 1 || j === 2 ? 1 : -1;
                const sv = j >= 2 ? 1 : -1;
                // merkez + normal*yarı boy + u*su*yarıU + v*sv*yarıV (u × v = normal, CCW)
                const halfU = w / 2;
                const halfV = h / 2;
                const x = cx + n[0] * hx + u[0] * su * halfU + v[0] * sv * halfV;
                const y = cy + n[1] * hy + u[1] * su * halfU + v[1] * sv * halfV;
                const z = cz + n[2] * hz + u[2] * su * halfU + v[2] * sv * halfV;
                this.pos.push(x, y, z);
                this.nor.push(n[0], n[1], n[2]);
                this.col.push(_c.r, _c.g, _c.b);
                if (uv && uv.pitchU && isWall) {
                    const uu = (su + 1) / 2;
                    const vv = (sv + 1) / 2;
                    this.uv.push((uv.offU || 0) + (uu * w) / uv.pitchU, (uv.offV || 0) + (vv * h) / uv.pitchV);
                } else if (uv && uv.fullFace) {
                    this.uv.push((su + 1) / 2, (sv + 1) / 2);
                } else {
                    const fixed = uv && uv.fixed ? uv.fixed : FIXED_UV;
                    this.uv.push(fixed[0], fixed[1]);
                }
            }
            this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        return this;
    }

    /**
     * Hazır bir three geometrisini dönüşümle ekler.
     * pos/rot/scale: [x,y,z]; uvFixed: tüm köşelere tek UV (dokulu malzemede düz renk bölgesi).
     */
    add(geo, color, pos = null, rot = null, scale = null, uvFixed = null) {
        _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
        _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
        _q.setFromEuler(_e);
        _s.set(scale ? scale[0] : 1, scale ? scale[1] : 1, scale ? scale[2] : 1);
        _m.compose(_p, _q, _s);
        return this.addMatrix(geo, color, _m, uvFixed);
    }

    addMatrix(geo, color, matrix, uvFixed = null) {
        _n.getNormalMatrix(matrix);
        _c.set(color);
        const p = geo.attributes.position;
        const nn = geo.attributes.normal;
        const uvA = geo.attributes.uv;
        const base = this.vertexCount;
        for (let i = 0; i < p.count; i++) {
            _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
            this.pos.push(_v.x, _v.y, _v.z);
            if (nn) {
                _v.fromBufferAttribute(nn, i).applyMatrix3(_n).normalize();
                this.nor.push(_v.x, _v.y, _v.z);
            } else {
                this.nor.push(0, 1, 0);
            }
            if (uvFixed) this.uv.push(uvFixed[0], uvFixed[1]);
            else if (uvA) this.uv.push(uvA.getX(i), uvA.getY(i));
            else this.uv.push(FIXED_UV[0], FIXED_UV[1]);
            this.col.push(_c.r, _c.g, _c.b);
        }
        if (geo.index) {
            const ix = geo.index;
            for (let i = 0; i < ix.count; i++) this.idx.push(base + ix.getX(i));
        } else {
            for (let i = 0; i < p.count; i++) this.idx.push(base + i);
        }
        return this;
    }

    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        const IndexArray = this.vertexCount > 65535 ? Uint32Array : Uint16Array;
        g.setIndex(new THREE.BufferAttribute(new IndexArray(this.idx), 1));
        g.computeBoundingSphere();
        g.computeBoundingBox();
        return g;
    }
}

// Dokulu malzemelerde "düz renk" bölgesine bakan UV (pencere dokusunda duvar payı).
export const FIXED_UV = [0.02, 0.02];

/** Kurulumda sık kullanılan, sonra atılan şablon geometriler. */
export function createTemplates() {
    const t = {
        sphere: new THREE.IcosahedronGeometry(1, 1),
        sphereSmooth: new THREE.SphereGeometry(1, 12, 8),
        cyl: new THREE.CylinderGeometry(1, 1, 1, 8, 1),
        cyl12: new THREE.CylinderGeometry(1, 1, 1, 12, 1),
        cone: new THREE.ConeGeometry(1, 1, 7, 1),
        ico: new THREE.IcosahedronGeometry(1, 0),
        capsule: new THREE.CapsuleGeometry(1, 1, 3, 8),
        torus: new THREE.TorusGeometry(1, 0.25, 6, 14),
        box: new THREE.BoxGeometry(1, 1, 1),
        plane: new THREE.PlaneGeometry(1, 1),
    };
    t.dispose = () => {
        for (const k of Object.keys(t)) {
            if (t[k] && typeof t[k].dispose === 'function' && k !== 'dispose') t[k].dispose();
        }
    };
    return t;
}
