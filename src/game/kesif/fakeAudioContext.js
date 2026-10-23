/*
 * Test desteği: gerçek WebAudio'nun sıkı kurallarını (geçersiz değerde fırlatma, bağlantı denetimi,
 * start/stop sırası) taklit eden sahte AudioContext. Yalnızca testlerde kullanılır.
 */

function checkFinite(v, what) {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new TypeError(`${what}: sonlu sayı bekleniyor (${v})`);
}

export class FakeParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(v, t) {
    checkFinite(v, 'setValueAtTime.value');
    checkFinite(t, 'setValueAtTime.time');
    this.events.push(['set', v, t]);
    return this;
  }

  linearRampToValueAtTime(v, t) {
    checkFinite(v, 'linearRamp.value');
    checkFinite(t, 'linearRamp.time');
    this.events.push(['lin', v, t]);
    return this;
  }

  exponentialRampToValueAtTime(v, t) {
    checkFinite(v, 'exponentialRamp.value');
    checkFinite(t, 'exponentialRamp.time');
    if (v <= 0) throw new RangeError('exponentialRampToValueAtTime: değer > 0 olmalı');
    this.events.push(['exp', v, t]);
    return this;
  }

  setTargetAtTime(v, t, tc) {
    checkFinite(v, 'setTarget.value');
    checkFinite(t, 'setTarget.time');
    checkFinite(tc, 'setTarget.timeConstant');
    this.events.push(['target', v, t, tc]);
    return this;
  }

  setValueCurveAtTime(curve, t, d) {
    if (!curve || !(curve.length >= 2)) throw new RangeError('setValueCurveAtTime: en az 2 değer');
    checkFinite(t, 'curve.time');
    if (!(d > 0)) throw new RangeError('setValueCurveAtTime: süre > 0');
    this.events.push(['curve', curve.length, t, d]);
    return this;
  }

  cancelScheduledValues(t) {
    checkFinite(t, 'cancel.time');
    this.events.push(['cancel', t]);
    return this;
  }
}

class FakeNode {
  constructor(ctx, kind) {
    this.context = ctx;
    this.kind = kind;
    this.outputs = [];
    this.connected = true;
    ctx.nodes.push(this);
  }

  connect(dest) {
    if (!(dest instanceof FakeNode) && !(dest instanceof FakeParam)) throw new TypeError('connect: AudioNode ya da AudioParam bekleniyor');
    this.outputs.push(dest);
    return dest;
  }

  disconnect() {
    this.outputs = [];
    this.connected = false;
  }
}

class FakeSource extends FakeNode {
  start(t = 0) {
    checkFinite(t, 'start.time');
    if (this.startedAt !== undefined) throw new Error('start iki kez çağrıldı');
    this.startedAt = t;
  }

  stop(t = 0) {
    checkFinite(t, 'stop.time');
    if (this.startedAt === undefined) throw new Error('stop, start öncesi çağrıldı');
    this.stoppedAt = t;
  }
}

export function createFakeAudioContextClass({ initialState = 'suspended', sampleRate = 44100 } = {}) {
  const instances = [];
  class FakeAudioContext {
    constructor(options) {
      this.options = options;
      this.nodes = [];
      this.state = initialState;
      this.sampleRate = sampleRate;
      this.currentTime = 1;
      this.destination = new FakeNode(this, 'destination');
      this.listener = {
        positionX: new FakeParam(),
        positionY: new FakeParam(),
        positionZ: new FakeParam(),
        forwardX: new FakeParam(0),
        forwardY: new FakeParam(0),
        forwardZ: new FakeParam(-1),
        upX: new FakeParam(0),
        upY: new FakeParam(1),
        upZ: new FakeParam(0),
      };
      this.resumeCalls = 0;
      this.suspendCalls = 0;
      instances.push(this);
    }

    /** Zamanı ilerletir; durma zamanı gelen kaynakların onended geri çağrısı tetiklenir (gerçek davranış gibi). */
    advance(dt) {
      this.currentTime += dt;
      for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        if (n.stoppedAt !== undefined && !n.ended && n.stoppedAt <= this.currentTime) {
          n.ended = true;
          if (typeof n.onended === 'function') n.onended();
        }
      }
    }

    resume() {
      this.resumeCalls++;
      if (this.state !== 'closed') this.state = 'running';
      return Promise.resolve();
    }

    suspend() {
      this.suspendCalls++;
      if (this.state !== 'closed') this.state = 'suspended';
      return Promise.resolve();
    }

    close() {
      this.state = 'closed';
      return Promise.resolve();
    }

    createGain() {
      const n = new FakeNode(this, 'gain');
      n.gain = new FakeParam(1);
      return n;
    }

    createOscillator() {
      const n = new FakeSource(this, 'osc');
      n.type = 'sine';
      n.frequency = new FakeParam(440);
      n.detune = new FakeParam(0);
      return n;
    }

    createBufferSource() {
      const n = new FakeSource(this, 'bufsrc');
      n.buffer = null;
      n.loop = false;
      return n;
    }

    createBiquadFilter() {
      const n = new FakeNode(this, 'biquad');
      n.type = 'lowpass';
      n.frequency = new FakeParam(350);
      n.Q = new FakeParam(1);
      n.gain = new FakeParam(0);
      return n;
    }

    createConvolver() {
      const n = new FakeNode(this, 'convolver');
      n.buffer = null;
      return n;
    }

    createDynamicsCompressor() {
      const n = new FakeNode(this, 'compressor');
      ['threshold', 'knee', 'ratio', 'attack', 'release'].forEach((k) => (n[k] = new FakeParam()));
      return n;
    }

    createDelay(max) {
      const n = new FakeNode(this, 'delay');
      n.maxDelay = max;
      n.delayTime = new FakeParam();
      return n;
    }

    createPanner() {
      const n = new FakeNode(this, 'panner');
      n.positionX = new FakeParam();
      n.positionY = new FakeParam();
      n.positionZ = new FakeParam();
      return n;
    }

    createStereoPanner() {
      const n = new FakeNode(this, 'stereopanner');
      n.pan = new FakeParam();
      return n;
    }

    createBuffer(channels, length, rate) {
      if (!(channels >= 1) || !(length >= 1) || !(rate > 0)) throw new RangeError('createBuffer: geçersiz boyut');
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return {
        numberOfChannels: channels,
        length,
        sampleRate: rate,
        duration: length / rate,
        getChannelData: (i) => data[i],
        copyToChannel: (arr, i) => data[i].set(arr),
      };
    }

    /** Kind'a göre düğme sayısı (test yardımcısı). */
    count(kind) {
      return this.nodes.filter((n) => n.kind === kind).length;
    }
  }
  FakeAudioContext.instances = instances;
  return FakeAudioContext;
}
