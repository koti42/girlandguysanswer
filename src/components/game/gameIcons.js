/*
 * Sunucu kategori ve rozet ikonlarını Lucide adlarıyla gönderiyor
 * ("landmark", "footprints" ...). Tüm Lucide setini paketlememek için
 * yalnızca makul adaylar açıkça eşleniyor; bilinmeyen ad yedeğe düşer.
 */
import {
    LuAtom, LuAward, LuBadgeCheck, LuBike, LuBookOpen, LuBrain, LuBriefcase, LuBuilding2,
    LuCalculator, LuCalendar, LuCalendarCheck, LuCamera, LuCar, LuCat, LuCircleCheck, LuClapperboard,
    LuClock, LuCoffee, LuCpu, LuCrown, LuCrosshair, LuDices, LuDog, LuDumbbell, LuEarth, LuFeather,
    LuFilm, LuFlag, LuFlame, LuFlaskConical, LuFootprints, LuGamepad2, LuGem, LuGlobe, LuGraduationCap,
    LuGuitar, LuHandshake, LuHeart, LuHeartPulse, LuHistory, LuHourglass, LuLandmark, LuLanguages,
    LuLaptop, LuLeaf, LuLightbulb, LuMap, LuMedal, LuMic, LuMicroscope, LuMountain, LuMusic, LuPalette,
    LuPawPrint, LuPizza, LuPlane, LuPuzzle, LuRocket, LuScale, LuShield, LuShirt, LuShuffle, LuSmile,
    LuSparkles, LuStar, LuStethoscope, LuSun, LuSwords, LuTarget, LuTimer, LuTrendingUp, LuTrophy,
    LuTv, LuUsers, LuUtensils, LuVolleyball, LuZap,
    LuActivity, LuCoins, LuGauge, LuInfinity, LuMagnet, LuMilestone, LuPersonStanding, LuRoute,
    LuShieldCheck, LuWind,
} from 'react-icons/lu';

const ICONS = {
    atom: LuAtom, award: LuAward, 'badge-check': LuBadgeCheck, bike: LuBike, book: LuBookOpen,
    'book-open': LuBookOpen, brain: LuBrain, briefcase: LuBriefcase, building: LuBuilding2,
    calculator: LuCalculator, calendar: LuCalendar, 'calendar-check': LuCalendarCheck, camera: LuCamera,
    car: LuCar, cat: LuCat, check: LuCircleCheck, 'circle-check': LuCircleCheck, clapperboard: LuClapperboard,
    clock: LuClock, coffee: LuCoffee, cpu: LuCpu, crown: LuCrown, crosshair: LuCrosshair, dice: LuDices,
    dices: LuDices, dog: LuDog, dumbbell: LuDumbbell, earth: LuEarth, feather: LuFeather, film: LuFilm,
    flag: LuFlag, flame: LuFlame, fire: LuFlame, flask: LuFlaskConical, 'flask-conical': LuFlaskConical,
    footprints: LuFootprints, gamepad: LuGamepad2, 'gamepad-2': LuGamepad2, gem: LuGem, diamond: LuGem,
    globe: LuGlobe, 'graduation-cap': LuGraduationCap, guitar: LuGuitar, handshake: LuHandshake,
    heart: LuHeart, 'heart-pulse': LuHeartPulse, history: LuHistory, hourglass: LuHourglass,
    landmark: LuLandmark, languages: LuLanguages, laptop: LuLaptop, leaf: LuLeaf, lightbulb: LuLightbulb,
    map: LuMap, medal: LuMedal, mic: LuMic, microscope: LuMicroscope, mountain: LuMountain, music: LuMusic,
    palette: LuPalette, 'paw-print': LuPawPrint, pizza: LuPizza, plane: LuPlane, puzzle: LuPuzzle,
    rocket: LuRocket, scale: LuScale, shield: LuShield, shirt: LuShirt, shuffle: LuShuffle, smile: LuSmile,
    sparkles: LuSparkles, star: LuStar, stethoscope: LuStethoscope, sun: LuSun, swords: LuSwords,
    target: LuTarget, timer: LuTimer, 'trending-up': LuTrendingUp, trophy: LuTrophy, tv: LuTv,
    users: LuUsers, utensils: LuUtensils, volleyball: LuVolleyball, zap: LuZap,
    // Herkesler Koşuyor rozetleri (footprints, rocket, brain, zap yukarıda)
    route: LuRoute, milestone: LuMilestone, gauge: LuGauge, activity: LuActivity, coins: LuCoins,
    magnet: LuMagnet, 'shield-check': LuShieldCheck, wind: LuWind, infinity: LuInfinity,
    'person-standing': LuPersonStanding, runner: LuPersonStanding,
};

/*
 * Yalnızca tablonun kendi anahtarları: "constructor" / "toString" gibi bir ad
 * prototipten fonksiyon döndürüp bileşen diye çizilmesin.
 */
function lookup(name, fallback) {
    const key = String(name || '').trim().toLowerCase();
    return Object.prototype.hasOwnProperty.call(ICONS, key) ? ICONS[key] : fallback;
}

export function categoryIcon(name) {
    return lookup(name, LuSparkles);
}

export function badgeIcon(name) {
    return lookup(name, LuAward);
}

export { LuShuffle as MixedIcon };
