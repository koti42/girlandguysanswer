/*
 * KEŞİF sim/city/interior — kilit/asansör testleri için ORTAK DÜZENEKLER (yalnız test dosyaları içe aktarır).
 *   chainInterior(n, o?)   n odalı doğrusal iç mekân (R0 giriş … R(n-1)); kapılar d0.. (R(i) ↔ R(i+1)); o.locks: {doorIndex: Lock}; o.props: PropSpec[]
 *   noteProp(slot, roomIndex, o?)   kod_notu PropSpec'i (oda merkezinde)
 */
export function chainInterior(n, o) {
  const op = o || {};
  const rooms = [];
  const doors = [{
    id: 'sokak', kind: 'street', x: 0, y: 64, z: 2, axis: 'x', w: 1, h: 3,
  }];
  const graph = [];
  for (let i = 0; i < n; i++) {
    rooms.push({
      id: 'R' + i, x0: i * 5, x1: i * 5 + 4, z0: 0, z1: 4, y0: 64, y1: 68, role: 'oda',
    });
    if (i < n - 1) {
      const d = {
        id: 'd' + i, kind: 'door', x: i * 5 + 4, y: 64, z: 2, axis: 'z', w: 1, h: 3,
      };
      if (op.locks && op.locks[i]) d.lock = op.locks[i];
      doors.push(d);
      graph.push(['R' + i, 'R' + (i + 1), d.id]);
    }
  }
  return {
    v: 1,
    kind: 'fixture',
    rooms,
    doors,
    graph,
    props: op.props || [],
    entry: { room: 'R0', door: 'sokak' },
    bounds: {
      x0: 0, x1: n * 5, z0: 0, z1: 4, y0: 64, y1: 68,
    },
  };
}

export function noteProp(slot, roomIndex, o) {
  const op = o || {};
  return Object.assign({
    kind: 'kod_notu', x: roomIndex * 5 + 2.5, y: 65, z: 0.5, yaw: 0, variant: 0, lotId: 1, slot,
  }, op);
}
