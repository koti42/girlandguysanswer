import { describe, expect, it } from 'vitest';
import { geoContains } from 'd3-geo';
import topology from 'world-atlas/countries-110m.json';
import { buildWorld, countryInfection, regionCountries, resolveCities, samplePoints, trName } from './regions';
import { NODES } from './constants';
import { CITIES } from './cities';
import { createRng } from './rng';

const world = buildWorld(topology);

describe('buildWorld', () => {
    it('177 ülke, her düğümün bir hub ülkesi var', () => {
        expect(world.countries.length).toBeGreaterThan(150);
        for (const n of NODES) expect(world.byId[world.hubCountry[n.id]]).toBeDefined();
    });

    it('hub ülkeler beklenen ülkelerdir (Singapur 110m haritada yok → en yakın: Malezya)', () => {
        const name = (id) => world.byId[world.hubCountry[id]].rawName;
        expect(name('ist')).toBe('Turkey');
        expect(name('fra')).toBe('Germany');
        expect(name('vir')).toBe('United States of America');
        expect(name('svl')).toBe('United States of America');
        expect(name('lon')).toBe('United Kingdom');
        expect(name('tyo')).toBe('Japan');
        expect(name('syd')).toBe('Australia');
        expect(name('sao')).toBe('Brazil');
        expect(name('cai')).toBe('Egypt');
        expect(name('mum')).toBe('India');
        expect(name('seo')).toBe('South Korea');
        expect(name('rek')).toBe('Iceland');
        expect(name('mos')).toBe('Russia');
        expect(name('sgp')).toBe('Malaysia');
        expect(world.hubNodes[world.hubCountry['vir']]).toEqual(expect.arrayContaining(['vir', 'svl']));
    });

    it('her ülke (Antarktika hariç) bir bölgeye bağlı; bölgeler toplamı ülke sayısı', () => {
        let total = 0;
        for (const n of NODES) total += regionCountries(world, n.id).length;
        const ant = world.countries.find((c) => c.rawName === 'Antarctica');
        expect(total).toBe(world.countries.length - (ant ? 1 : 0));
        expect(world.regionOf[ant.id]).toBeUndefined();
        // Fransa Frankfurt/Londra bölgesinde, Kanada Virginia bölgesinde
        const fr = world.countries.find((c) => c.rawName === 'France');
        expect(['fra', 'lon']).toContain(world.regionOf[fr.id].nodeId);
        const ca = world.countries.find((c) => c.rawName === 'Canada');
        expect(['vir', 'rek', 'svl']).toContain(world.regionOf[ca.id].nodeId);
    });

    it('Türkçe adlar', () => {
        expect(trName('Turkey')).toBe('Türkiye');
        expect(trName('Nowhere')).toBe('Nowhere');
        expect(trName(undefined)).toBe('Bilinmeyen bölge');
    });
});

describe('countryInfection', () => {
    const nodes = Object.fromEntries(NODES.map((n) => [n.id, { infection: 0, isolated: false }]));

    it('hub ülke hub düğümlerinin en yükseğini alır; bölge ülkesi uzaklıkla söner', () => {
        const sim = { ...nodes, vir: { infection: 40, isolated: false }, svl: { infection: 80, isolated: false } };
        expect(countryInfection(sim, world, world.hubCountry['vir'])).toBe(80);
        const ca = world.countries.find((c) => c.rawName === 'Canada');
        const r = world.regionOf[ca.id];
        const hubInf = sim[r.nodeId].infection;
        const v = countryInfection(sim, world, ca.id);
        expect(v).toBeGreaterThan(0);
        expect(v).toBeLessThanOrEqual(hubInf);
    });

    it('izole hub bölgeye yaymaz; temiz dünya sıfır', () => {
        const fr = world.countries.find((c) => c.rawName === 'France');
        const hub = world.regionOf[fr.id].nodeId;
        const sim = { ...nodes, [hub]: { infection: 90, isolated: true } };
        expect(countryInfection(sim, world, fr.id)).toBe(0);
        expect(countryInfection(nodes, world, fr.id)).toBe(0);
    });
});

describe('resolveCities', () => {
    it('her şehir bir ülkeye bağlanır; başkentler doğru ülkede', () => {
        const resolved = resolveCities(world, CITIES);
        expect(resolved.every((c) => c.countryId)).toBe(true);
        const name = (n) => world.byId[resolved.find((c) => c.name === n).countryId].rawName;
        expect(name('Ankara')).toBe('Turkey');
        expect(name('Washington')).toBe('United States of America');
        expect(name('Tokyo')).toBe('Japan');
        expect(name('Singapur')).toBe('Malaysia'); // 110m haritada Singapur yok
        expect(name('Canberra')).toBe('Australia');
        expect(resolved.filter((c) => c.capital).length).toBeGreaterThan(40);
    });
});

describe('samplePoints', () => {
    it('noktalar ülke poligonunun içinde (Türkiye, Rusya, ABD)', () => {
        const rng = createRng(1);
        for (const raw of ['Turkey', 'Russia', 'United States of America', 'Brazil']) {
            const c = world.countries.find((x) => x.rawName === raw);
            const pts = samplePoints(c, 30, rng);
            expect(pts.length).toBeGreaterThan(10);
            for (const p of pts) expect(geoContains(c.feature, p)).toBe(true);
        }
    });
});
