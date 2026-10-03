/*
 * Herkesler Yükseliyor 3D motoru — dış API (şartname §E.5).
 *
 * Yalnızca oyun ekranı açılınca dinamik import ile yüklenir (three ayrı
 * parçada); lobi ve site paketine girmez.
 */
export { createTowerGame } from './game.js';
export { isWebGLAvailable } from '../../runner/engine/webgl.js';
