/*
 * KEŞİF — sürüş girdisi okuyucusu (vehicles sistemi yardımcısı). vehicle_ui paketinin `G.inputState.vehicle` nesnesi varsa onu, yoksa standart girdiden türetir.
 *
 *   readDriveInput(G, st, out) → out {steer, throttle, brake, handbrake, nitro, hop, steerDirect, cameraPressed, hornPressed, exitPressed}
 *      G.inputState.vehicle = {steer −1..1 (+ sağ), throttle 0..1, brake 0..1, handbrake, nitro, hop?, steerDirect?, cameraPressed?, hornPressed?}  (vehicle_ui)
 *      yedek eşleme: steer = moveX · throttle = max(0, moveZ) · brake = max(0, −moveZ) · handbrake = jump (Space) · nitro = sprint (Shift) · hop = jumpPressed
 *      kamera = crouch (C) yükselen kenarı · korna = H (eylem 'vehicleHorn' olayı ayrı) · iniş = interactPressed (F)
 *   st: kalıcı durum {prevCrouch} (kenar algılama).
 * Sonlu olmayan değerler 0 sayılır.
 */
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function createDriveInputState() {
  return { prevCrouch: false, prevHorn: false };
}

export function readDriveInput(G, st, out) {
  const s = G.inputState || {};
  const ve = s.vehicle && typeof s.vehicle === 'object' ? s.vehicle : null;
  if (ve) {
    out.steer = clamp(num(ve.steer), -1, 1);
    out.throttle = clamp(num(ve.throttle), 0, 1);
    out.brake = clamp(num(ve.brake), 0, 1);
    out.handbrake = ve.handbrake === true;
    out.nitro = ve.nitro === true;
    out.hop = ve.hop === true || !!s.jump;
    out.steerDirect = ve.steerDirect === true;
    out.cameraPressed = ve.cameraPressed === true;
    out.hornPressed = ve.hornPressed === true;
    out.resetPressed = ve.resetPressed === true; // R: yola yerleştir (tek okumalık kenar; vehicle_ui)
  } else {
    out.steer = clamp(num(s.moveX), -1, 1);
    const mz = clamp(num(s.moveZ), -1, 1);
    out.throttle = mz > 0 ? mz : 0;
    out.brake = mz < 0 ? -mz : 0;
    out.handbrake = !!s.jump;
    out.nitro = !!s.sprint;
    out.hop = !!s.jump;
    out.steerDirect = false;
    const crouch = !!s.crouch;
    out.cameraPressed = crouch && !st.prevCrouch;
    st.prevCrouch = crouch;
    out.hornPressed = false;
    out.resetPressed = false;
  }
  out.exitPressed = !!s.interactPressed;
  if (ve) st.prevCrouch = !!s.crouch;
  return out;
}
