import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
    MAX_DIST,
    MIN_SLAB_CAM_DIST,
    PLAY_AZ,
    PLAY_EL,
    SWEEP_NDC_FIT,
    fitDistance,
    playCameraPose,
    playDistance,
    playPitch,
    projectNdc,
    slabSweepStats,
} from './cameraMath.js';

const VFOV = 44;
// Telefon dikey (Galaxy/iPhone, WebView), tablet, kare pencere, masaüstü, ultra geniş
const ASPECTS = [360 / 800, 390 / 844, 0.5, 0.6, 0.75, 0.9, 1, 1.2, 4 / 3, 1.6, 16 / 9, 2.2, 21 / 9, 3];

describe('kule kadrajı: hareketli kat', () => {
    it('projectNdc three\'nin kamerasıyla aynı sonucu verir', () => {
        for (const a of [0.46, 1, 1.78]) {
            const cam = new THREE.PerspectiveCamera(VFOV, a, 0.1, 1400);
            const pose = playCameraPose({ x: 0.4, y: 3.2, z: -0.3 }, 20, PLAY_AZ + 0.1, PLAY_EL, playPitch(a, VFOV, PLAY_EL));
            cam.position.set(pose.cam.x, pose.cam.y, pose.cam.z);
            cam.lookAt(pose.look.x, pose.look.y, pose.look.z);
            cam.updateMatrixWorld();
            for (const p of [
                { x: 4.5, y: 3, z: 1.5 },
                { x: -6, y: 2.5, z: -1.5 },
                { x: 0, y: 3.5, z: 6 },
            ]) {
                const v = new THREE.Vector3(p.x, p.y, p.z).project(cam);
                const n = projectNdc(p, pose.cam, pose.look, a, VFOV);
                expect(n.x).toBeCloseTo(v.x, 6);
                expect(n.y).toBeCloseTo(v.y, 6);
            }
        }
    });

    it('tüm en-boy oranlarında kat salınımın tamamında ekranda ve kameradan uzak', () => {
        for (const a of ASPECTS) {
            const d = playDistance(a, VFOV);
            const s = slabSweepStats(a, VFOV, d);
            expect(s.maxNdcX, `aspect ${a}`).toBeLessThanOrEqual(SWEEP_NDC_FIT + 1e-6);
            expect(s.maxNdcY, `aspect ${a}`).toBeLessThanOrEqual(SWEEP_NDC_FIT + 1e-6);
            expect(s.minDist, `aspect ${a}`).toBeGreaterThanOrEqual(MIN_SLAB_CAM_DIST - 1e-6);
            expect(d).toBeLessThanOrEqual(MAX_DIST);
            // Kat kameraya kule tepesinin uzaklığının üçte ikisinden fazla yaklaşmaz
            // (eskiden yatayda %57: ekranda iki katına büyüyordu).
            expect(s.minDist / d, `aspect ${a}`).toBeGreaterThan(0.6);
        }
    });

    it('eski kadraj hatayı gösteriyordu (regresyon kanıtı)', () => {
        // Masaüstü 16:9: kat 7,1 m'ye kadar yaklaşıyordu.
        const oldLand = fitDistance(16 / 9, VFOV, 9.6, 10);
        expect(slabSweepStats(16 / 9, VFOV, oldLand).minDist).toBeLessThan(MIN_SLAB_CAM_DIST);
        // Telefon dikey: dönüş noktasında katın bir kısmı ekran dışında.
        const oldPortrait = fitDistance(390 / 844, VFOV, 9.6, 10);
        expect(slabSweepStats(390 / 844, VFOV, oldPortrait).maxNdcX).toBeGreaterThan(1.1);
    });

    it('çok dar ekranda en uzak mesafede kalır; aynı en-boyda sonuç sabit (önbellek)', () => {
        expect(playDistance(0.2, VFOV)).toBe(MAX_DIST);
        const a = playDistance(1.5, VFOV);
        playDistance(0.7, VFOV);
        expect(playDistance(1.5, VFOV)).toBe(a);
        expect(playDistance(NaN, VFOV)).toBe(playDistance(1, VFOV));
    });
});
