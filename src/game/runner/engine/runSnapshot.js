/*
 * Koşunun anlık bitiş yükü (oyunu bitirmeden): o ana kadarki girdi kaydı ve
 * tick, sunucunun kabul ettiği geçerli bir finish gövdesi. three'ye dokunmaz;
 * motor hem snapshot() hem finish() için bunu kullanır, testler doğrudan sim
 * ile çağırır. Sim'i değiştirmez (encodeInputs yalnızca okur).
 *
 * correct: kapı index -> true/false/null (sunucudan gelen kapı sonuçları);
 * localScore yalnızca denetim içindir, asıl skoru sunucu replay ile hesaplar.
 */
import { computeScore } from '../sim/index.js';

export function runSnapshot(sim, correct = []) {
    const st = sim.state;
    return {
        endTick: st.tick,
        inputs: sim.encodeInputs(),
        localScore: computeScore({ segMm: st.segMm, coins: st.coins, gates: st.gates, correct }).score,
    };
}
