import React, { memo, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import './kesif.css';
import BossBar from './BossBar.jsx';
import DeathScreen from './DeathScreen.jsx';
import Hotbar from './Hotbar.jsx';
import { AbilityBar, Crosshair, DamageVignette, FpsChip, HeldToast, HintLine, InfoChip, ParkourChip, StatusPills } from './KesifHudParts.jsx';
import KesifVitals from './KesifVitals.jsx';
import ManaBar from './ManaBar.jsx';
import CityHud, { PortalModeChip } from './city/CityHud.jsx';
import VehicleHud from './city/VehicleHud.jsx';
import MissionTracker from './city/MissionTracker.jsx';
import { LOADING_HINT_PREFIX } from '../../../game/kesif/sim/city/cityHudData.js';
import StatusEffects from './StatusEffects.jsx';
import Minimap from './Minimap.jsx';
import PauseMenu from './PauseMenu.jsx';
import QuestTracker from './QuestTracker.jsx';
import { EnergyChip, ScannerRadar, TechStrip } from './TechHud.jsx';
import TouchControls from './TouchControls.jsx';
import VictoryScreen from './VictoryScreen.jsx';
import ZoneBanner, { ToastStack } from './ZoneBanner.jsx';
import { createAnnouncer } from './kesifAnnouncer.js';
import { useDamageFlash, useHeldToast } from './kxHooks.js';
import { useAutoHideHint, useControlsToast } from './kxHintHooks.js';
import { controlsToastText } from './kxHintSeen.js';
import { isGameplayUi, itemIsRanged, itemLabel } from './kxHudUtils.js';

const LAYOUT_KEYS = ['leftHanded', 'joystickScale', 'crouchToggle'];

/**
 * KEŞİF oyun içi HUD: artı imleç, can/açlık/oksijen, eşya çubuğu, hedef blok, bölge/saat/koordinat çipi,
 * görev izleyici, boss barı, yetenekler, parkur sayacı, etkileşim ipucu, duyurular, mini harita, hasar vinyeti,
 * dokunmatik kontroller ve (isteğe bağlı) duraklat / yenilgi / zafer katmanları.
 *
 * Props:
 *  store        hudStore (createHudStore) — useSyncExternalStore ile okunur
 *  actions      oturumun verdiği eylemler (hepsi isteğe bağlı):
 *               { pause, resume, save, exit, respawn, continuePlaying, publishMap, reportMap(reason), changeSettings(patch),
 *                 openInventory, openCrafting, openMap, openJournal, toggleCamera, selectHotbar(i),
 *                 pressButton(name, down), getPuzzleHint() }
 *  touch        dokunmatik kontroller çizilsin mi
 *  inputRef     { current: createKesifInput(...) } — joystick görseli ve (actions.pressButton yoksa) düğmeler
 *  getMapInfo   api.getMapInfo (mini harita düşük sıklıkta okur); getPose (isteğe bağlı, ucuz { x, z, yaw })
 *  settings     { sensitivity, invertY, fov, viewDist, quality, muted, music, haptics, easy, leftHanded, gyro,
 *                 joystickScale, buttonOpacity, crouchToggle, accessibility }
 *  announcer    createAnnouncer() — motor olaylarını duyuru kuyruğuna alır (yoksa yalnız hud.banner gösterilir)
 *  info         { worldCode, lostCount, deathInfo, victoryStats, worldName, abilityStatus, gyroSupported }
 *  overlays     false → pause/dead/victory katmanlarını HUD çizmez (sayfa kendisi çizer)
 *  debug        FPS çipi ve düğmesi
 *  abilityButtons { grapple:'ability1', glide:'ability2', portalGun:'ability3' } — varsayılan eşlemeyi değiştirir
 *  topSlot      dokunmatikte üst-orta öbeğe (parkur/boss/tarayıcının altı, duyuruların üstü) eklenecek düğüm (ör. "telefonunu çevir" ipucu)
 *  driveApi     panel cephesi (kesifPanelApi): sürüş HUD'u (VehicleHud) mini harita/radyo için getDriveInfo, getTrafficDots, getRadioInfo… okur
 *  onHurt({lost,hp})  can azalınca (hasar vinyetiyle aynı anda) çağrılır
 */
const KesifHud = ({
  store,
  actions,
  touch = false,
  inputRef,
  getMapInfo,
  getPose,
  settings,
  announcer,
  info,
  overlays = true,
  debug = false,
  abilityButtons,
  onHurt,
  topSlot = null,
  driveApi = null,
}) => {
  const hud = useSyncExternalStore(store.subscribe, store.get, store.get);
  const act = actions || EMPTY_ACTIONS;
  const fallbackAnn = useMemo(() => createAnnouncer(), []);
  const ann = announcer || fallbackAnn;
  const toasts = useSyncExternalStore(ann.subscribe, ann.get, ann.get);
  const [showFps, setShowFps] = useState(false);

  const playing = isGameplayUi(hud.ui);
  const driving = Boolean(hud.vehicle) && hud.dim === 'neon';
  const selSlot = hud.hotbar[hud.selected];
  const heldKey = selSlot && selSlot.item ? selSlot.item : null;
  const ranged = itemIsRanged(heldKey);
  const heldEnch = Boolean(selSlot && selSlot.ench > 0);
  const heldName = hud.held ? (hud.held.indexOf(':') >= 0 ? itemLabel(hud.held) : hud.held) : '';
  const heldToast = useHeldToast(heldName);
  // Etkileşim ipucu birkaç sn görünür ve kendiliğinden gizlenir; durup beklemekle yeniden çıkmaz (canInteract ham ipucuyla çalışır).
  // "Boyut geçişi… %NN" ipucu satırı (systems/dimension.js) gizlenir: LoadingOverlay çubuk + aria-live verir; çift görsel ve %NN'in sürekli sesli okunması olmasın.
  const hintShown = useAutoHideHint(typeof hud.hint === 'string' && hud.hint.indexOf(LOADING_HINT_PREFIX) === 0 ? null : hud.hint);
  // Tek seferlik "Kontroller için Esc → Ayarlar → Nasıl Oynanır" bildirimi: dünya başlığı bittikten sonra (localStorage 'kesif.hintSeen.v1').
  const toastTouch = touch;
  useControlsToast({
    enabled: playing && hud.hp > 0,
    bannerUntil: hud.banner && hud.banner.until ? hud.banner.until : 0,
    show: () => Boolean(ann.push({ kind: 'hint', text: controlsToastText(toastTouch), sub: '' })),
  });
  const flash = useDamageFlash(hud.hp, hud.maxHp, onHurt);
  const showOxygen = hud.underwater || hud.oxygen < 15;
  const lowHp = hud.hp > 0 && hud.hp <= 6;
  const a11y = Boolean(settings && settings.accessibility);
  const info2 = info || EMPTY_INFO;

  const actRef = useRef(act);
  useEffect(() => {
    actRef.current = act;
  });
  const inputRefStable = inputRef;

  const selectSlot = useCallback(
    (i) => {
      const a = actRef.current;
      if (a.selectHotbar) a.selectHotbar(i);
      else if (a.pressButton) {
        a.pressButton('hotbar' + (i + 1), true);
        a.pressButton('hotbar' + (i + 1), false);
      } else if (inputRefStable && inputRefStable.current && inputRefStable.current.pressButton) inputRefStable.current.pressButton('hotbar' + (i + 1), true);
    },
    [inputRefStable]
  );

  const handleSettings = useCallback(
    async (patch) => {
      let p = patch;
      const inp = inputRefStable && inputRefStable.current;
      if (p.gyro === true && inp && typeof inp.enableGyro === 'function') {
        // iOS izin penceresi yalnız kullanıcı jesti içinde açılır: tıklama zinciri içinde çağrılır.
        let ok = false;
        try {
          ok = await inp.enableGyro(true);
        } catch {
          ok = false;
        }
        p = { ...p, gyro: Boolean(ok) };
      }
      if (inp && typeof inp.setSettings === 'function') {
        const layout = {};
        let any = false;
        for (let i = 0; i < LAYOUT_KEYS.length; i++) {
          if (Object.prototype.hasOwnProperty.call(p, LAYOUT_KEYS[i])) {
            layout[LAYOUT_KEYS[i]] = p[LAYOUT_KEYS[i]];
            any = true;
          }
        }
        if (any) inp.setSettings(layout);
      }
      if (actRef.current.changeSettings) actRef.current.changeSettings(p);
    },
    [inputRefStable]
  );

  const requestHint = useCallback(() => (actRef.current.getPuzzleHint ? actRef.current.getPuzzleHint() : null), []);
  const openMap = useCallback(() => {
    if (actRef.current.openMap) actRef.current.openMap();
  }, []);
  const toggleFps = useCallback(() => setShowFps((v) => !v), []);

  const canHint = Boolean(act.getPuzzleHint);

  return (
    <div className="kx-root" data-ui={hud.ui} data-touch={touch ? '1' : '0'} data-driving={driving ? '1' : '0'} data-a11y={a11y ? '1' : '0'} data-mode={hud.mode} data-cam={hud.cameraMode} data-boss={hud.boss ? '1' : '0'} data-left={settings && settings.leftHanded === true ? '1' : '0'}>
      <div className="kx-layer" inert={!playing}>
        <DamageVignette hurtKey={flash.hurtKey} amount={flash.amount} low={flash.low} />

        <div className="kx-hide-ui">
          <Crosshair target={hud.target} ranged={ranged} />
        </div>

        {/* Üst: sol öbek (dokunmatikte mini harita +) bilgi çipi + enerji + durum etkileri + görev izleyici; orta öbek: parkur, boss, tarayıcı,
            (dokunmatikte) ipucu ve duyurular. Dokunmatik dikeyde ikisi tek sütun akışıdır (üst üste binmez). */}
        <div className="kx-top">
          <div className="kx-tl kx-hide-ui">
            {touch && getMapInfo && !driving ? <Minimap getMapInfo={getMapInfo} getPose={getPose} size={76} radiusBlocks={38} paused={!playing} onOpen={act.openMap ? openMap : undefined} /> : null}
            <div className="kx-tl-col">
              {hud.dim === 'neon' ? (
                <CityHud hud={hud} />
              ) : (
                <InfoChip zone={hud.zone} biome={hud.biome} time={hud.time} weather={hud.weather} coords={hud.coords} depth={hud.depth} />
              )}
              <StatusPills mode={hud.mode} flying={hud.flying} />
              {!touch && <EnergyChip energy={hud.energy} />}
              {touch && (
                <div className="kx-fx-wrap">
                  <StatusEffects effects={hud.effects} calm={a11y || Boolean(settings && settings.reducedMotion)} />
                </div>
              )}
              {hud.dim === 'neon' ? (
                <MissionTracker hud={hud} api={driveApi} touch={touch} accessibility={a11y} reducedMotion={Boolean(settings && settings.reducedMotion)} />
              ) : (
                <QuestTracker quest={hud.quest} onHint={canHint ? requestHint : undefined} defaultCollapsed={touch} />
              )}
            </div>
          </div>

          <div className="kx-tcwrap">
            <div className="kx-tc kx-hide-ui">
              <ParkourChip parkour={hud.parkour} />
              <BossBar boss={hud.boss} />
              <ScannerRadar scanner={hud.scanner} calm={a11y || Boolean(settings && settings.reducedMotion)} />
              {touch ? topSlot : null}
            </div>
            {touch ? <ToastStack toasts={toasts} onDismiss={ann.dismiss} touch a11y={a11y} live /> : null}
          </div>
        </div>

        {/* Üst sağ: masaüstünde mini harita, hata ayıklamada FPS */}
        {!touch && (
          <div className="kx-tr kx-hide-ui">
            {getMapInfo && !driving ? <Minimap getMapInfo={getMapInfo} getPose={getPose} size={112} radiusBlocks={48} paused={!playing} /> : null}
            {debug && showFps && <FpsChip fps={hud.fps} />}
            {debug && (
              <button type="button" className="kx-fpsbtn" data-no-tap aria-pressed={showFps} onClick={toggleFps}>
                FPS
              </button>
            )}
          </div>
        )}
        {touch && debug && (
          <div className="kx-fps-touch kx-hide-ui">
            {showFps && <FpsChip fps={hud.fps} />}
            <button type="button" className="kx-fpsbtn" data-no-tap aria-pressed={showFps} onClick={toggleFps}>
              FPS
            </button>
          </div>
        )}

        {/* Durum etkileri (iksir/büyü): masaüstünde üst sağ, mini haritanın altı (dokunmatikte sol öbekte, akışta) */}
        {!touch && (
          <div className="kx-fx-wrap kx-hide-ui">
            <StatusEffects effects={hud.effects} calm={a11y || Boolean(settings && settings.reducedMotion)} />
          </div>
        )}

        {/* Orta alt: etkileşim ipucu (masaüstü). Dokunmatikte ipucu ölçerlerin en üstünde durur (aşağıda). */}
        {!touch && (
          <div className="kx-mid kx-hide-ui">
            <HintLine hint={hintShown} touch={touch} />
          </div>
        )}

        {/* Alt: yetenekler (masaüstü), can/açlık, eşya çubuğu */}
        <div className="kx-bottom kx-hide-panel">
          {/* Ölçerler: yatayda alt-orta bantta (joystick ile düğme yayı arasında), dikeyde sol sütunda (yayın üstünde) */}
          <div className="kx-gauges">
            {touch && (
              <div className="kx-mid kx-hide-ui">
                <HintLine hint={hintShown} touch={touch} />
              </div>
            )}
            <HeldToast text={heldToast.text} k={heldToast.key} ench={heldEnch} />
            {touch && <EnergyChip energy={hud.energy} />}
            {!touch && <AbilityBar abilities={hud.abilities} status={info2.abilityStatus} />}
            <TechStrip jetpack={hud.jetpack} charge={hud.charge} shield={hud.shield} portals={hud.portals} calm={a11y || Boolean(settings && settings.reducedMotion)} />
            {!touch && <PortalModeChip portals={hud.portals} dim={hud.dim} />}
            <ManaBar mana={hud.mana} spell={hud.spell} calm={a11y} />
          </div>
          <KesifVitals hp={hud.hp} maxHp={hud.maxHp} hunger={hud.hunger} oxygen={hud.oxygen} showOxygen={showOxygen} low={lowHp} />
          <Hotbar slots={hud.hotbar} selected={hud.selected} onSelect={selectSlot} showKeys={!touch} />
        </div>
        <p className="kx-sr" role="status">
          {lowHp ? 'Canın azaldı.' : ''}
        </p>

        {hud.dim === 'neon' && playing ? (
          <VehicleHud hud={hud} api={driveApi} inputRef={inputRefStable} actions={act} touch={touch} settings={settings} onSettings={handleSettings} />
        ) : null}

        {touch && playing && !driving && (
          <TouchControls
            inputRef={inputRef}
            actions={act}
            abilities={hud.abilities}
            abilityStatus={info2.abilityStatus}
            abilityButtons={abilityButtons}
            canInteract={Boolean(hud.hint)}
            flying={hud.flying}
            mode={hud.mode}
            cameraMode={hud.cameraMode}
            settings={settings}
            dimButton={hud.mode === 'macera' && hud.abilities.portalGun}
            dimMode={Boolean(hud.portals && hud.portals.mode === 'boyut')}
          />
        )}
      </div>

      <ZoneBanner banner={hud.banner} toasts={toasts} onDismiss={ann.dismiss} showToasts={!touch} />

      {overlays && hud.ui === 'pause' && (
        <PauseMenu
          settings={settings}
          onChange={handleSettings}
          onResume={act.resume}
          onSave={act.save}
          onExit={act.exit}
          onPublish={hud.mode === 'insa' ? act.publishMap : undefined}
          onReport={hud.mode === 'harita' ? act.reportMap : undefined}
          onMapTime={hud.mode === 'insa' ? act.setMapTime : undefined}
          mapTime={hud.time}
          worldCode={info2.worldCode}
          mode={hud.mode}
          touch={touch}
          gyroSupported={info2.gyroSupported !== false}
          missionApi={hud.dim === 'neon' ? driveApi : null}
        />
      )}
      {overlays && hud.ui === 'dead' && (
        <DeathScreen reason={info2.deathInfo} lostCount={info2.lostCount} easy={Boolean(settings && settings.easy)} onRespawn={act.respawn} onExit={act.exit} />
      )}
      {overlays && hud.ui === 'victory' && (
        <VictoryScreen stats={info2.victoryStats} worldName={info2.worldName} onContinue={act.continuePlaying || act.closeUi || act.resume} onExit={act.exit} />
      )}
    </div>
  );
};

const EMPTY_ACTIONS = Object.freeze({});
const EMPTY_INFO = Object.freeze({});

export default memo(KesifHud);
