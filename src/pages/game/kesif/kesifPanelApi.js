/*
 * Panellerin (envanter, üretim, harita...) gördüğü sabit motor cephesi: yöntem adı -> motor yokken dönen değer.
 * Cephe nesnesi oturum boyunca aynı kalır; çağrılar o anki motora (ref) yönlenir.
 */
export const FACADE_DEFAULTS = {
    getInventorySnapshot: null,
    moveStack: false,
    dropSlot: undefined,
    equipArmor: false,
    unequipArmor: false,
    selectHotbar: undefined,
    useSlot: false,
    getStations: [],
    getStationFocus: null,
    getRecipes: [],
    craft: false,
    getBuildPalette: [],
    setCreativeSlot: undefined,
    clearSlot: undefined,
    getChest: null,
    getMapInfo: null,
    getJournal: null,
    closeUi: undefined,
    openUi: undefined,
    respawn: undefined,
    getPuzzleHint: null,
    resetNearestPuzzle: false,
    getWorldCode: '',
    // büyü ve simya (systems/magic): Büyü Masası / Simya Kazanı panelleri
    getEnchantInfo: null,
    enchant: { ok: false, reason: 'yok', message: 'Büyü şu an yapılamıyor.' },
    rerollEnchant: { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' },
    getBrewInfo: null,
    startBrew: { ok: false, reason: 'yok', message: 'Şu an demlenemiyor.' },
    collectBrew: { ok: false, reason: 'yok', message: 'Şu an alınamıyor.' },
    getMagicInfo: null,
    getMagicUi: null,
    getSpellList: [],
    useManaCrystal: { ok: false, reason: 'yok' },
    drinkPotion: { ok: false, reason: 'yok' },
    // teknoloji (systems/tech): Makine paneli
    getMachineInfo: null,
    getMachineUi: null,
    setMachineConfig: { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' },
    machineAction: { ok: false, reason: 'yok', message: 'Şu an yapılamıyor.' },
    getTechHud: null,
    // şehir kilitleri (systems/cityLocks): kod / kart / çözme / asansör paneli
    getLockPanel: null,
    lockInput: { ok: false, result: 'panel-yok' },
    closeLockPanel: false,
    // araçlar (systems/vehicles, vehicleAudio, vehicleUi): garaj paneli, mini harita, radyo çipi
    getGarage: null,
    setGarage: false,
    buyVehicle: { ok: false, reason: 'yok' },
    summonVehicle: { ok: false, reason: 'yok' },
    rentVehicle: { ok: false, reason: 'yok' },
    getVehicleState: null,
    getVehicleRadio: null,
    selectRadioStation: '',
    nextRadioStation: '',
    prevRadioStation: '',
    getDriveInfo: null,
    getTrafficDots: null,
    getDriveMarker: null,
    // NPC diyaloğu ve satıcı (systems/cityNpc): DialogueSheet / VendorPanel
    getDialogue: null,
    chooseDialogue: { ok: false, ended: true, reason: 'yok', view: null },
    closeDialogue: false,
    talkTo: { ok: false, reason: 'yok' },
    getVendor: null,
    openVendor: { ok: false, reason: 'yok' },
    vendorBuy: { ok: false, reason: 'yok', message: 'Şu an alışveriş yapılamıyor.' },
    vendorSell: { ok: false, reason: 'yok', message: 'Şu an alışveriş yapılamıyor.' },
    closeVendor: false,
    // görevler, işler, yarışlar, keşifler (systems/cityMissions, cityDiscovery, cityApi): izleyici, pano, grafiti seçici, duraklatma «Görevler» sayfası
    getMissionInfo: null,
    getMissionTracker: null,
    getBoard: null,
    acceptJob: { ok: false, reason: 'yok', message: 'Şu an iş alınamıyor.' },
    closeBoard: false,
    startRace: { ok: false, reason: 'yok', message: 'Şu an yarış başlatılamıyor.' },
    abandonMission: { ok: false, reason: 'yok' },
    getCityJournal: null,
    getGraffitiPicker: null,
    graffitiAct: { ok: false, reason: 'yok' },
    getDiscoveryInfo: null,
    getCityRewards: null,
    setCityRewardsEnabled: false,
    // foto modu, şehir haritası, hızlı seyahat (systems/cityPhoto): PhotoOverlay / CityMap / duraklatma menüsü
    getPhotoState: null,
    photoOpen: { ok: false, reason: 'yok', message: 'Foto modu şu an açılamıyor.' },
    photoClose: false,
    photoSet: null,
    photoOrbit: false,
    photoZoom: 0,
    photoCapture: { ok: false, reason: 'yok', message: 'Kare yakalanamadı.' },
    photoSave: { ok: false, via: 'yok', message: 'Kaydedilemedi; tekrar dene.' },
    photoShare: { ok: false, via: 'yok', message: 'Paylaşılamadı.' },
    photoDiscard: false,
    getPhotoAlbum: null,
    getFastTravel: null,
    fastTravel: { ok: false, reason: 'yok', message: 'Hızlı seyahat şu an kullanılamıyor.' },
    getMapRoute: null,
    openCityMap: { ok: false, reason: 'yok', message: 'Harita şu an açılamıyor.' },
};

/** getGame: () => o anki motor | null. */
export function createPanelApi(getGame) {
    const f = {};
    Object.keys(FACADE_DEFAULTS).forEach((name) => {
        f[name] = (...args) => {
            const g = getGame();
            const fn = g && g[name];
            return typeof fn === 'function' ? fn.apply(g, args) : FACADE_DEFAULTS[name];
        };
    });
    return f;
}
