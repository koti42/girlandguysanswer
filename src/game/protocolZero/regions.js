/*
 * Dünya haritası modeli (saf; canvas bilmez): world-atlas TopoJSON'undan ülke özellikleri, her
 * merkezin (14 düğüm) bulunduğu "hub ülke", her ülkenin bağlı olduğu en yakın hub (bölge) ve
 * enfeksiyonun hub'dan uzaklaştıkça sönen ülke rengi. Spor noktaları (enfekte ülkelerdeki kızıl
 * parıltılar) için poligon içinde tohumlu örnekleme.
 *
 *   const world = buildWorld(topology);                 // { countries, byId, hubCountry, hubNodes, regionOf, ... }
 *   countryInfection(simNodes, world, countryId)        // 0-100
 *   samplePoints(feature, count, rng)                   // [[lon,lat], ...]
 */
import { geoBounds, geoCentroid, geoContains, geoDistance } from 'd3-geo';
import { feature as topoFeature } from 'topojson-client';
import { NODES } from './constants';

/** Hub'dan bu açısal uzaklıkta (radyan, ~0.9 rad ≈ 5700 km) etki en alta iner. */
export const REGION_FALLOFF_RAD = 0.9;
export const REGION_MIN_FACTOR = 0.2;

/** Dünya genelinde ülke ad çevirileri (yalnızca sık görülenler; kalanlar İngilizce kalır). */
const TR_NAMES = {
    'United States of America': 'ABD', 'United Kingdom': 'Birleşik Krallık', Germany: 'Almanya', France: 'Fransa', Spain: 'İspanya',
    Italy: 'İtalya', Turkey: 'Türkiye', Russia: 'Rusya', China: 'Çin', Japan: 'Japonya', 'South Korea': 'Güney Kore', 'North Korea': 'Kuzey Kore',
    India: 'Hindistan', Egypt: 'Mısır', Brazil: 'Brezilya', Australia: 'Avustralya', Iceland: 'İzlanda', Canada: 'Kanada', Mexico: 'Meksika',
    Argentina: 'Arjantin', 'Saudi Arabia': 'Suudi Arabistan', Iran: 'İran', Iraq: 'Irak', Greece: 'Yunanistan', Poland: 'Polonya',
    Ukraine: 'Ukrayna', Netherlands: 'Hollanda', Belgium: 'Belçika', Switzerland: 'İsviçre', Austria: 'Avusturya', Sweden: 'İsveç',
    Norway: 'Norveç', Finland: 'Finlandiya', Denmark: 'Danimarka', Ireland: 'İrlanda', Portugal: 'Portekiz', Morocco: 'Fas', Algeria: 'Cezayir',
    Libya: 'Libya', Nigeria: 'Nijerya', 'South Africa': 'Güney Afrika', Kenya: 'Kenya', Ethiopia: 'Etiyopya', Indonesia: 'Endonezya',
    Malaysia: 'Malezya', Thailand: 'Tayland', Vietnam: 'Vietnam', Philippines: 'Filipinler', Pakistan: 'Pakistan', Afghanistan: 'Afganistan',
    Kazakhstan: 'Kazakistan', Mongolia: 'Moğolistan', 'New Zealand': 'Yeni Zelanda', Chile: 'Şili', Colombia: 'Kolombiya', Peru: 'Peru',
    Venezuela: 'Venezuela', Cuba: 'Küba', Greenland: 'Grönland', Syria: 'Suriye', Israel: 'İsrail', Jordan: 'Ürdün', Azerbaijan: 'Azerbaycan',
    Georgia: 'Gürcistan', Armenia: 'Ermenistan', Bulgaria: 'Bulgaristan', Romania: 'Romanya', Hungary: 'Macaristan', 'Czech Republic': 'Çekya',
    Czechia: 'Çekya', Serbia: 'Sırbistan', Croatia: 'Hırvatistan', 'Bosnia and Herz.': 'Bosna-Hersek', Albania: 'Arnavutluk', Cyprus: 'Kıbrıs',
    Lebanon: 'Lübnan', Sudan: 'Sudan', Somalia: 'Somali', Tanzania: 'Tanzanya', Angola: 'Angola', Mozambique: 'Mozambik', Madagascar: 'Madagaskar',
    'Dem. Rep. Congo': 'Kongo DC', Uzbekistan: 'Özbekistan', Turkmenistan: 'Türkmenistan', Kyrgyzstan: 'Kırgızistan', Tajikistan: 'Tacikistan',
    Nepal: 'Nepal', Bangladesh: 'Bangladeş', Myanmar: 'Myanmar', Taiwan: 'Tayvan', 'Papua New Guinea': 'Papua Yeni Gine', Uruguay: 'Uruguay',
    Bolivia: 'Bolivya', Paraguay: 'Paraguay', Ecuador: 'Ekvador', Belarus: 'Belarus', Lithuania: 'Litvanya', Latvia: 'Letonya', Estonia: 'Estonya',
    Slovakia: 'Slovakya', Slovenia: 'Slovenya', 'North Macedonia': 'Kuzey Makedonya', Macedonia: 'Kuzey Makedonya', Kosovo: 'Kosova',
    Montenegro: 'Karadağ', Moldova: 'Moldova', Tunisia: 'Tunus', Senegal: 'Senegal', Mali: 'Mali', Niger: 'Nijer', Chad: 'Çad', Cameroon: 'Kamerun',
    Ghana: 'Gana', 'Ivory Coast': 'Fildişi Sahili', "Côte d'Ivoire": 'Fildişi Sahili', Zambia: 'Zambiya', Zimbabwe: 'Zimbabve', Namibia: 'Namibya',
    Botswana: 'Botsvana', Uganda: 'Uganda', Rwanda: 'Ruanda', 'S. Sudan': 'Güney Sudan', Eritrea: 'Eritre', Yemen: 'Yemen', Oman: 'Umman',
    'United Arab Emirates': 'BAE', Qatar: 'Katar', Kuwait: 'Kuveyt', Antarctica: 'Antarktika', 'W. Sahara': 'Batı Sahra', Fiji: 'Fiji',
    'Sri Lanka': 'Sri Lanka', Cambodia: 'Kamboçya', Laos: 'Laos', Bhutan: 'Butan', Haiti: 'Haiti', 'Dominican Rep.': 'Dominik Cum.',
    Jamaica: 'Jamaika', 'Puerto Rico': 'Porto Riko', Panama: 'Panama', 'Costa Rica': 'Kosta Rika', Nicaragua: 'Nikaragua', Honduras: 'Honduras',
    Guatemala: 'Guatemala', Belize: 'Belize', 'El Salvador': 'El Salvador', Guyana: 'Guyana', Suriname: 'Surinam', 'Falkland Is.': 'Falkland Ad.',
};

export const trName = (name) => TR_NAMES[name] || name || 'Bilinmeyen bölge';

/** Noktaya en yakın kıyı/sınır köşesi olan ülke (kıyı şehirleri 110m'de denize düşebilir: İstanbul, Singapur). */
function nearestCountry(countries, point) {
    let best = null;
    let bestD = Infinity;
    for (const c of countries) {
        if (c.rawName === 'Antarctica') continue;
        const g = c.feature.geometry;
        const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
        for (const poly of polys) {
            for (const ring of poly) {
                for (const v of ring) {
                    const d = geoDistance(v, point);
                    if (d < bestD) {
                        bestD = d;
                        best = c;
                    }
                }
            }
        }
    }
    return best;
}

/**
 * @param {object} topology  world-atlas countries-110m TopoJSON
 * @param {Array} nodes      NODES (test için enjekte edilebilir)
 */
export function buildWorld(topology, nodes = NODES) {
    const fc = topoFeature(topology, topology.objects.countries);
    const countries = fc.features
        .filter((f) => f.geometry)
        .map((f) => ({
            id: String(f.id),
            name: trName(f.properties?.name),
            rawName: f.properties?.name || '',
            feature: f,
            centroid: geoCentroid(f),
            bounds: geoBounds(f),
        }));
    // Antarktika hiçbir bölgeye bağlanmasın; haritada nötr kalır.
    const byId = Object.fromEntries(countries.map((c) => [c.id, c]));

    const hubCountry = {};
    const hubNodes = {};
    for (const n of nodes) {
        const p = [n.lng, n.lat];
        let c = countries.find((x) => geoContains(x.feature, p));
        if (!c) c = nearestCountry(countries, p);
        hubCountry[n.id] = c.id;
        (hubNodes[c.id] ||= []).push(n.id);
    }

    const regionOf = {};
    for (const c of countries) {
        if (c.rawName === 'Antarctica') continue;
        let best = null;
        for (const n of nodes) {
            const d = geoDistance(c.centroid, [n.lng, n.lat]);
            if (!best || d < best.dist) best = { nodeId: n.id, dist: d };
        }
        regionOf[c.id] = best;
    }

    return { fc, countries, byId, hubCountry, hubNodes, regionOf };
}

/** Hub ülkede hub düğümlerinin en yükseği; bölge ülkesinde uzaklığa göre sönen etki. 0-100. */
export function countryInfection(simNodes, world, countryId) {
    const hubs = world.hubNodes[countryId];
    if (hubs) {
        let max = 0;
        for (const id of hubs) max = Math.max(max, simNodes[id]?.infection || 0);
        return max;
    }
    const r = world.regionOf[countryId];
    if (!r) return 0;
    const n = simNodes[r.nodeId];
    if (!n || n.isolated) return 0;
    const f = Math.max(REGION_MIN_FACTOR, 1 - r.dist / REGION_FALLOFF_RAD);
    return (n.infection || 0) * f;
}

/** Şehirleri bulundukları ülkeye bağlar (denize düşen kıyı şehri: en yakın sınır köşesi). */
export function resolveCities(world, cities) {
    return cities.map((c) => {
        const p = [c.lng, c.lat];
        let country = null;
        for (const x of world.countries) {
            const [[x0, y0], [x1, y1]] = x.bounds;
            const inX = x1 < x0 ? p[0] >= x0 || p[0] <= x1 : p[0] >= x0 && p[0] <= x1;
            if (!inX || p[1] < y0 || p[1] > y1) continue;
            if (geoContains(x.feature, p)) {
                country = x;
                break;
            }
        }
        if (!country) country = nearestCountry(world.countries, p);
        return { ...c, countryId: country ? country.id : null };
    });
}

/** Bölgedeki ülke sayısı ve adları (bilgi barı için). */
export function regionCountries(world, nodeId) {
    return world.countries.filter((c) => world.regionOf[c.id]?.nodeId === nodeId).map((c) => c.id);
}

/** Poligon içinde `count` rastgele nokta ([lon,lat]); sınırlı deneme, az da dönebilir. */
export function samplePoints(country, count, rng) {
    const [[x0, y0], [x1, y1]] = country.bounds;
    const out = [];
    const wrap = x1 < x0; // antimeridyen geçen ülkeler (Rusya, Fiji, ABD)
    const spanX = wrap ? x1 + 360 - x0 : x1 - x0;
    let tries = 0;
    const maxTries = count * 40;
    while (out.length < count && tries++ < maxTries) {
        let lon = x0 + rng() * spanX;
        if (lon > 180) lon -= 360;
        const lat = y0 + rng() * (y1 - y0);
        if (geoContains(country.feature, [lon, lat])) out.push([lon, lat]);
    }
    return out;
}
