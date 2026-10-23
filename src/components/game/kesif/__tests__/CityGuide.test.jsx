// @vitest-environment jsdom
/*
 * Neon Meridyen rehberi (CityGuide + kxCityGuide.js): içerik DOĞRULUĞU (her sayı gerçek oyun kaynağıyla karşılaştırılır), güvenlik taraması,
 * erişilebilirlik yapısı ve yerleşim (Duraklat > Nasıl Oynanır > Neon Meridyen ile lobi kartı). Rehber veri dosyası bağımsızdır (içe aktarma yok);
 * kurallar değişirse bu dosya kırılır ve rehber güncellenir.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import CityGuide from '../CityGuide.jsx';
import HowTo from '../HowTo.jsx';
import PauseHowTo from '../PauseHowTo.jsx';
import {
  CITY_FACTS as F, CITY_GUIDE, CITY_GUIDE_IDS, CITY_GUIDE_VERSION,
} from '../kxCityGuide.js';
import { isSafeText } from '../../../../game/kesif/sim/city/citySafeData.js';
import { GATE_RULES } from '../../../../game/kesif/sim/dim/travel.js';
import { PORTAL_GUN, TECH_RECIPES } from '../../../../game/kesif/sim/techData.js';
import { RECIPES, itemByKey, recipesProducing } from '../../../../game/kesif/sim/items.js';
import { TRANSITION_TIMING } from '../../../../game/kesif/gameTransition.js';
import { START_KREDI } from '../../../../game/kesif/sim/city/ped/npcSave.js';
import { SELL_RATE, STOCK_SIZE } from '../../../../game/kesif/sim/city/ped/vendorData.js';
import { FAST_TRAVEL } from '../../../../game/kesif/sim/city/map/fastTravel.js';
import { COUNTS, KREDI } from '../../../../game/kesif/sim/city/mission/missionData.js';
import { PHOTO_KREDI, PHOTO_SUBJECTS } from '../../../../game/kesif/sim/city/map/photoTargets.js';
import { PHOTO_FRAMES, PHOTO_LIMITS } from '../../../../game/kesif/sim/city/map/photoMath.js';
import { DISTRICT_NAMES } from '../../../../game/kesif/sim/city/cityBrands.js';
import { PHOTO_FILTERS, RACE_NAMES, RADIO_STATIONS } from '../../../../game/kesif/sim/city/cityNames.js';
import { NEON_AMOUNTS } from '../../../../game/kesif/sim/city/cityEvents.js';
import { VEHICLE_CLASSES, VEHICLE_DEFS, RENTAL_SECONDS, RENTAL_WARN_SECONDS } from '../../../../game/kesif/sim/city/vehicle/vehicleData.js';
import { MAX_OWNED } from '../../../../game/kesif/sim/city/vehicle/vehicleSave.js';
import { ENTER_R, SUMMON_R } from '../../../../game/kesif/sim/city/vehicle/vehicleProps.js';
import { COOLDOWN_SEC, CARD_NAMES } from '../../../../game/kesif/sim/city/interior/locks.js';
import { HACK_INFO } from '../../../../game/kesif/sim/city/hack/index.js';
import { INTERIOR_KINDS } from '../../../../game/kesif/sim/city/interior/registry.js';
import { TIERS } from '../../../../game/kesif/sim/city/mission/jobs.js';
import { JOB_LIMITS } from '../../../../game/kesif/sim/city/mission/missionData.js';
import { QUEST_CHAIN_NEON } from '../../../../game/kesif/sim/city/cityNames.js';
import { HELD_ACTION_CODES, PRESS_ACTION_CODES } from '../../../../game/kesif/inputMath.js';
import { RADIO_PRESETS, driveKeyAction, radioIndexForCode } from '../../../../game/kesif/inputVehicleMath.js';
import { MAX_EXIT_SPEED } from '../../../../game/kesif/systems/vehicles.js';
import { PHOTO_KEY } from '../../../../game/kesif/systems/cityPhoto.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../../game/kesif');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

afterEach(() => cleanup());

const textOf = (v) => (typeof v === 'string' ? v : Array.isArray(v) ? v.map(textOf).join(' ') : v && typeof v === 'object' ? Object.keys(v).map((k) => textOf(v[k])).join(' ') : '');
const allText = () => textOf(CITY_GUIDE);

describe('CityGuide: içerik doğruluğu (CITY_FACTS ↔ gerçek oyun kaynakları)', () => {
  it('boyut kapısı sayıları travel.js, techData ve gameTransition ile aynı', () => {
    expect(F.gate.cost).toBe(GATE_RULES.cost);
    expect(F.gate.ttl).toBe(GATE_RULES.ttl);
    expect(F.gate.w).toBe(GATE_RULES.w);
    expect(F.gate.h).toBe(GATE_RULES.h);
    expect(F.gate.openCooldown).toBe(GATE_RULES.openCooldown);
    expect(F.gate.hopCooldown).toBe(GATE_RULES.hopCooldown);
    expect(F.gate.calibrateSecs).toBe(GATE_RULES.calibrateSecs);
    expect(F.gate.transitionTimeout).toBe(TRANSITION_TIMING.timeout);
    expect(F.gun.chargeMax).toBe(PORTAL_GUN.max);
    expect(F.gun.cellCharges).toBe(PORTAL_GUN.cellCharges);
    expect(PORTAL_GUN.start).toBe(1); // "yeni tabanca dolu gelir"
    // erişilebilirlik modu kapı ömrünü iki katına çıkarır (dimGate.js)
    expect(F.gate.ttlAccessible).toBe(GATE_RULES.ttl * 2);
    expect(src('systems/dimGate.js')).toMatch(/GATE_RULES\.ttl \* \(G\.accessibility \? 2 : 1\)/);
    // terminal onay penceresi (propBehaviors ARM_SEC)
    expect(src('sim/props/propBehaviors.js')).toMatch(new RegExp('const ARM_SEC = ' + F.gate.terminalConfirm + ';'));
  });

  it('eşya adları ve tarifler (laboratuvar, tezgah, örs) gerçek tariflerle aynı', () => {
    Object.keys(F.names).forEach((key) => {
      if (key.indexOf('blok:') === 0) return; // blok eşyaları aşağıda
      const it = itemByKey(key);
      expect(it, key).toBeTruthy();
      expect(it.name, key).toBe(F.names[key]);
    });
    expect(itemByKey('blok:cam').name).toBe(F.names['blok:cam']);
    expect(itemByKey('blok:teknoloji_laboratuvarı').name).toBe(F.names['blok:teknoloji_laboratuvarı']);
    Object.keys(F.recipes).forEach((id) => {
      const [out, count, station, ins] = F.recipes[id];
      const real = recipesProducing(out).filter((r) => r.station === station && r.out.count === count);
      expect(real.length, id + ' tarifi bulunamadı').toBeGreaterThan(0);
      const want = JSON.stringify(ins.map(([k, n]) => [k, n]).sort());
      const ok = real.some((r) => JSON.stringify(r.in.map((p) => [p.item, p.count]).sort()) === want);
      expect(ok, id + ' girdileri uyuşmuyor').toBe(true);
    });
    // Portal Tabancası tarifi yalnızca laboratuvarda
    expect(TECH_RECIPES.some((r) => r[1] === 'item:portal_tabancası' && r[4] === 'laboratuvar')).toBe(true);
    expect(RECIPES.filter((r) => r.out.item === 'item:portal_tabancası')).toHaveLength(1);
  });

  it('Kredi, jeton ve ödül sayıları sim kaynaklarıyla aynı', () => {
    expect(F.kredi.start).toBe(START_KREDI);
    expect(F.kredi.sellRate).toBe(SELL_RATE);
    expect(F.kredi.stockSize).toBe(STOCK_SIZE);
    expect(F.kredi.fastTravelCost).toBe(FAST_TRAVEL.cost);
    expect(F.kredi.fastTravelCooldown).toBe(FAST_TRAVEL.cooldown);
    expect(F.kredi.fastTravelBlackout).toBe(FAST_TRAVEL.blackout);
    ['chip', 'chipStory', 'graffiti', 'room', 'roof', 'terminal', 'set', 'easter', 'quest'].forEach((k) => expect(F.kredi[k], k).toBe(KREDI[k]));
    expect(F.kredi.race).toEqual({ bronze: KREDI.race[1], silver: KREDI.race[2], gold: KREDI.race[3] });
    expect(F.kredi.photoSubject).toBe(PHOTO_KREDI.subject);
    expect(F.kredi.photoAlbum).toBe(PHOTO_KREDI.album);
    expect(F.kredi.photoAssignment).toBe(PHOTO_KREDI.assignment);
    expect(F.jeton).toEqual(NEON_AMOUNTS);
  });

  it('araç tablosu: ad, fiyat, kira, açılış km, koltuk; garaj sınırları', () => {
    expect(F.vehicles.map((v) => v[0]).sort()).toEqual(VEHICLE_CLASSES.slice().sort());
    F.vehicles.forEach(([cls, name, price, rent, km, seats]) => {
      const d = VEHICLE_DEFS[cls];
      expect([cls, d.name, d.price, d.rent, d.unlock.minKm, d.seats]).toEqual([cls, name, price, rent, km, seats]);
    });
    expect(F.garage.maxOwned).toBe(MAX_OWNED);
    expect(F.garage.rentalMinutes * 60).toBe(RENTAL_SECONDS);
    expect(F.garage.rentalWarnSeconds).toBe(RENTAL_WARN_SECONDS);
    expect(F.garage.summonRadius).toBe(SUMMON_R);
    expect(F.garage.enterRadius).toBe(ENTER_R);
    expect(F.garage.maxExitSpeed).toBe(MAX_EXIT_SPEED);
    expect(F.garage.radioPresets).toBe(RADIO_PRESETS);
    expect(F.radio).toEqual(RADIO_STATIONS.map((s) => s.name));
  });

  it('keşif sayıları, işler, kilitler, foto, bölgeler ve yarışlar gerçek tablolarla aynı', () => {
    expect(F.counts.chips).toBe(COUNTS.chips);
    expect(F.counts.graffiti).toBe(COUNTS.graffiti);
    expect(F.counts.rooms).toBe(COUNTS.rooms);
    expect(F.counts.terminals).toBe(COUNTS.terminals);
    expect(F.counts.races).toBe(COUNTS.races);
    expect(F.counts.roofRoutes).toBe(COUNTS.roofRoutes);
    expect(F.counts.questChain).toBe(QUEST_CHAIN_NEON.length);
    expect(F.counts.interiors).toBe(INTERIOR_KINDS.length);
    expect(F.jobs.offers).toBe(JOB_LIMITS.offers);
    expect(F.jobs.tiers).toEqual(TIERS.map((t) => [t.name, t.min, t.max]));
    expect(F.locks.cooldown).toBe(COOLDOWN_SEC);
    expect(F.locks.cards).toEqual(CARD_NAMES.slice());
    expect(F.locks.games).toEqual(['simon', 'levers', 'dice'].map((g) => HACK_INFO[g].name));
    expect(F.photo.fovMin).toBe(PHOTO_LIMITS.fovMin);
    expect(F.photo.fovMax).toBe(PHOTO_LIMITS.fovMax);
    expect(F.photo.distMax).toBe(PHOTO_LIMITS.distMax);
    expect(F.photo.captureMax).toBe(PHOTO_LIMITS.captureMax);
    expect(F.photo.filters).toEqual(PHOTO_FILTERS.map((f) => f.name));
    expect(F.photo.frames).toEqual(PHOTO_FRAMES.map((f) => f.name));
    expect(F.photo.albumSubjects).toBe(PHOTO_SUBJECTS.length);
    expect(F.districts).toEqual(['merkez', 'gece_pazari', 'konteyner', 'liman', 'teknoloji', 'tepe'].map((k) => DISTRICT_NAMES[k]));
    expect(F.races).toEqual(RACE_NAMES.slice());
  });

  it('Tarayıcı görüş yarıçapları ve erişilebilirlik çarpanları kaynakta aynı', () => {
    const disc = src('systems/cityDiscovery.js');
    expect(disc).toMatch(new RegExp('SEE_R_PLAIN = ' + F.scan.plain + ';'));
    expect(disc).toMatch(new RegExp('SEE_R_SCAN = ' + F.scan.scanner + ';'));
    const run = src('systems/cityMissionsRun.js');
    expect(run).toMatch(/radiusScale: acc \? 2 : 1, timeScale: acc \? 2 : 1/); // işler: yarıçap ve süre ×2
    expect(run).toMatch(/radiusScale: acc \? 2 : 1 \}\);/); // yarış: yalnız yarıçap ×2
    expect(src('systems/cityLocksDoors.js')).toMatch(/const k = deps\.accessibility\(\) \? 2 : 1;/);
  });

  it('kontroller: T boyut kipi, F etkileş, M/Tab harita, V foto, araç tuşları gerçek eşlemelerle aynı', () => {
    const codes = Object.assign({}, HELD_ACTION_CODES, PRESS_ACTION_CODES);
    expect(codes.KeyT).toBe('portalMode');
    expect(codes.KeyF).toBe('interact');
    expect(codes.KeyM).toBe('map');
    expect(codes.Tab).toBe('map');
    expect(codes.KeyE).toBe('inventory');
    expect(codes.KeyR).toBe('craft');
    expect(codes.Escape).toBe('pause');
    expect(codes.KeyP).toBe('pause');
    expect(PHOTO_KEY).toBe('KeyV');
    expect(driveKeyAction('KeyC')).toBe('camera');
    expect(driveKeyAction('KeyH')).toBe('horn');
    expect(driveKeyAction('KeyR')).toBe('reset');
    expect(radioIndexForCode('Digit1')).toBe(0);
    expect(radioIndexForCode('Digit' + F.garage.radioPresets)).toBe(F.garage.radioPresets - 1);
    const keysRows = CITY_GUIDE.find((s) => s.id === 'kontrol').blocks.filter((b) => b.t === 'keys').reduce((a, b) => a.concat(b.rows), []);
    const rowOf = (what) => keysRows.find((r) => r.what.indexOf(what) === 0);
    expect(rowOf('Boyut kipi').keys).toEqual(['T']);
    expect(rowOf('Foto modu').keys).toEqual(['V']);
    expect(rowOf('Harita').keys).toEqual(['M', 'Tab']);
    expect(rowOf('Aracı yola yerleştir').keys).toEqual(['R']);
    expect(rowOf('Kamera / korna').keys).toEqual(['C', 'H']);
  });

  it('metinler sayıları şablondan taşır: kapı maliyeti, süre, alan, kredi ve jeton toplamı', () => {
    const t = allText();
    expect(t).toContain(GATE_RULES.cost + ' portal şarjı');
    expect(t).toContain(GATE_RULES.ttl + ' saniye');
    expect(t).toContain(GATE_RULES.w + '×' + GATE_RULES.h);
    expect(t).toContain('6 saniye');
    expect(t).toContain(START_KREDI + ' Kredi ile başlarsın');
    expect(t).toContain('toplam ' + Object.keys(NEON_AMOUNTS).reduce((a, k) => a + NEON_AMOUNTS[k], 0) + ')');
    expect(t).toContain('iki Kuantum Çekirdeği');
    expect(t).toContain('Kredi hiçbir oranda jetona çevrilmez');
  });
});

describe('CityGuide: güvenlik ve yapı', () => {
  it('tüm metinler yasak liste + marka taramasından temiz', () => {
    const strings = [];
    const walk = (v) => {
      if (typeof v === 'string') strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') Object.keys(v).forEach((k) => walk(v[k]));
    };
    walk(CITY_GUIDE);
    expect(strings.length).toBeGreaterThan(100);
    expect(strings.filter((s) => !isSafeText(s))).toEqual([]);
  });

  it('bölümler: 14 benzersiz kimlik, başlık, giriş ve en az bir blok; veri donuk', () => {
    expect(CITY_GUIDE_VERSION).toBe(1);
    expect(CITY_GUIDE_IDS).toEqual(['portal', 'kapi', 'maliyet', 'terminal', 'arac', 'ic', 'gorev', 'kesif', 'foto', 'harita', 'kredi', 'kontrol', 'erisim', 'guvenlik']);
    expect(new Set(CITY_GUIDE.map((s) => s.title)).size).toBe(CITY_GUIDE.length);
    CITY_GUIDE.forEach((s) => {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.lead.length).toBeGreaterThan(20);
      expect(s.blocks.length).toBeGreaterThan(0);
    });
    expect(Object.isFrozen(CITY_GUIDE)).toBe(true);
    expect(Object.isFrozen(F)).toBe(true);
  });

  it('kullanıcıya görünen metinde "undefined", "NaN", "[object" ya da şablon artığı yok', () => {
    const t = allText();
    ['undefined', 'NaN', '[object', '${', 'null'].forEach((bad) => expect(t.indexOf(bad), bad).toBe(-1));
  });

  it('veri dosyası bağımsız: içe aktarma yok (lobi paketine sim kodu sürüklenmez); satır sınırı', () => {
    const body = fs.readFileSync(path.resolve(HERE, '../kxCityGuide.js'), 'utf8');
    expect(body).not.toMatch(/^\s*import\s/m);
    expect(body.split('\n').length).toBeLessThanOrEqual(900);
    expect(fs.readFileSync(path.resolve(HERE, '../CityGuide.jsx'), 'utf8').split('\n').length).toBeLessThanOrEqual(900);
  });
});

describe('CityGuide: erişilebilir yapı', () => {
  it('başlık + 14 açılır bölüm (details/summary); yalnızca ilki açık; kimlikler benzersiz', () => {
    render(<CityGuide />);
    expect(screen.getByRole('heading', { name: 'Neon Meridyen rehberi' })).toBeInTheDocument();
    const secs = document.querySelectorAll('details.kx-cg-sec');
    expect(secs).toHaveLength(14);
    expect(Array.from(secs).filter((d) => d.open).map((d) => d.dataset.section)).toEqual(['portal']);
    const ids = Array.from(document.querySelectorAll('[id]')).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    secs.forEach((d) => expect(d.querySelector('summary').textContent.trim().length).toBeGreaterThan(3));
  });

  it('özet satırına tıklamak (aç/kapat) bölümü açar; klavyeyle erişilebilir yerel öğe', () => {
    render(<CityGuide openId={null} />);
    const sec = document.querySelector('details[data-section="kapi"]');
    expect(sec.open).toBe(false);
    sec.open = true;
    expect(within(sec).getByText(/Boyut kapısı kuralları/)).toBeInTheDocument();
    expect(sec.querySelector('summary').tabIndex).toBeGreaterThanOrEqual(0);
  });

  it('tablolar: başlık (caption), sütun ve satır başlıkları (scope); kaydırılabilir bölge odaklanabilir', () => {
    render(<CityGuide />);
    const tables = document.querySelectorAll('table.kx-cg-table');
    expect(tables.length).toBeGreaterThanOrEqual(4);
    tables.forEach((tb) => {
      expect(tb.querySelector('caption').textContent.length).toBeGreaterThan(3);
      tb.querySelectorAll('thead th').forEach((th) => expect(th.getAttribute('scope')).toBe('col'));
      tb.querySelectorAll('tbody th').forEach((th) => expect(th.getAttribute('scope')).toBe('row'));
      expect(tb.parentElement.getAttribute('role')).toBe('region');
      expect(tb.parentElement.tabIndex).toBe(0);
      const cols = tb.querySelectorAll('thead th').length;
      tb.querySelectorAll('tbody tr').forEach((tr) => expect(tr.children.length).toBe(cols));
    });
  });

  it('adım listeleri sıralı liste (ol) ve adlandırılmış; klavye listeleri adlandırılmış', () => {
    render(<CityGuide />);
    expect(screen.getByRole('list', { name: 'Portal Tabancasını üret adımları' }).tagName).toBe('OL');
    expect(screen.getByRole('list', { name: 'Şehirde yürürken (klavye ve fare)' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Araçtayken' })).toBeInTheDocument();
    document.querySelectorAll('ol.kx-cg-ol').forEach((ol) => expect(ol.getAttribute('aria-label')).toBeTruthy());
  });

  it('tanıtım ve not metinleri ekran okuyucu için doğru rolde (note)', () => {
    render(<CityGuide />);
    expect(document.querySelectorAll('[role="note"]').length).toBeGreaterThanOrEqual(3);
  });

  it('başlıksız kullanımda bölge adı verilir (aria-label)', () => {
    render(<CityGuide heading={false} />);
    expect(screen.getByRole('region', { name: 'Neon Meridyen rehberi' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Neon Meridyen rehberi' })).toBeNull();
  });
});

describe('CityGuide: yerleşim', () => {
  it('Duraklat > Nasıl Oynanır > Neon Meridyen sekmesinde mevcut bölümlerin altında görünür; diğer sekmelerde yok', () => {
    render(<PauseHowTo />);
    expect(screen.queryByTestId('kx-city-guide')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Neon Meridyen' }));
    expect(screen.getByTestId('kx-city-guide')).toBeInTheDocument();
    // mevcut sekme içeriği yerinde
    expect(screen.getByRole('list', { name: 'Neon Meridyen yolculuk adımları' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Neon Meridyen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'İpuçları' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Klavye ve fare' }));
    expect(screen.queryByTestId('kx-city-guide')).toBeNull();
  });

  it('lobi: rehber kartı kapalı gelir ve içerik açılana dek çizilmez; açınca 14 bölüm', () => {
    render(<HowTo />);
    const card = screen.getByTestId('kesif-city-guide-card');
    expect(card.open).toBe(false);
    expect(screen.queryByTestId('kx-city-guide')).toBeNull();
    card.open = true;
    fireEvent(card, new Event('toggle'));
    expect(screen.getByTestId('kx-city-guide')).toBeInTheDocument();
    expect(document.querySelectorAll('details.kx-cg-sec')).toHaveLength(14);
    // lobinin mevcut içeriği duruyor
    expect(screen.getByRole('heading', { name: 'Nasıl oynanır?' })).toBeInTheDocument();
    card.open = false;
    fireEvent(card, new Event('toggle'));
    expect(screen.queryByTestId('kx-city-guide')).toBeNull();
  });
});
