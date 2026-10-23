import api from './api';
import { createKesifApi } from './kesifApiFactory';

/*
 * Herkesler Keşfediyor istemcisi (site oturumu: services/api.js).
 *
 * Mobil gömme (embed) `createKesifApi(http)` ile kendi jetonlu axios'unu
 * verir; fabrika api.js'ten bağımsızdır (kesifApiFactory.js).
 */

export { createKesifApi, freshKey, cleanParams } from './kesifApiFactory';

export const kesifApi = createKesifApi(api);

export default kesifApi;
