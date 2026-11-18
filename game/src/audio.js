// PORT VESPER - every sound is synthesised in the browser. No files, no network, no samples: a
// few oscillators, one noise buffer and short gain envelopes. Audio starts only after a gesture.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuffer = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let muted = false;

  function makeNoise() {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function ensure() {
    if (!ctx) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      try {
        ctx = new Audio();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.34;
        master.connect(ctx.destination);
        noiseBuffer = makeNoise();

        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 70;
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 480;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(master);
        engineOsc.start();

        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'sawtooth';
        sirenOsc.frequency.value = 500;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0;
        sirenLfo = ctx.createOscillator();
        sirenLfo.type = 'sine';
        sirenLfo.frequency.value = 2.6;
        const sweep = ctx.createGain();
        sweep.gain.value = 150;
        sirenLfo.connect(sweep).connect(sirenOsc.frequency);
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        sirenLfo.start();
      } catch {
        ctx = null;
        return false;
      }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return true;
  }

  function tone(frequency, duration, type, volume, endFrequency) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, now);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), now + duration);
    gain.gain.setValueAtTime(Math.max(0.0001, volume), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  function burst(duration, volume, filterType, cutoff) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType || 'lowpass';
    filter.frequency.value = cutoff || 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function chord(notes, spacing, duration, volume) {
    notes.forEach((note, index) => {
      window.setTimeout(() => tone(note, duration, 'triangle', volume), index * spacing);
    });
  }

  return {
    unlock() { ensure(); },
    setMuted(value) {
      muted = value;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.34, ctx.currentTime, 0.05);
    },
    isMuted() { return muted; },
    play(name) {
      if (name === 'shot') {
        burst(0.13, 0.75, 'highpass', 900);
        tone(180, 0.09, 'square', 0.35, 55);
      } else if (name === 'policeShot') {
        burst(0.1, 0.28, 'highpass', 1200);
      } else if (name === 'hit') {
        tone(150, 0.22, 'sawtooth', 0.5, 45);
        burst(0.12, 0.18, 'lowpass', 500);
      } else if (name === 'crash') {
        burst(0.3, 0.5, 'lowpass', 1200);
        tone(90, 0.25, 'square', 0.3, 40);
      } else if (name === 'pickup') {
        chord([660, 880, 1180], 55, 0.12, 0.22);
      } else if (name === 'missionStart') {
        chord([440, 554, 660], 80, 0.16, 0.2);
      } else if (name === 'missionDone') {
        chord([523, 659, 784, 1046], 90, 0.22, 0.24);
      } else if (name === 'alarm') {
        tone(880, 0.7, 'square', 0.18, 440);
        tone(440, 0.7, 'square', 0.16, 880);
      } else if (name === 'enter') {
        tone(320, 0.1, 'triangle', 0.2, 520);
      } else if (name === 'denied' || name === 'dry') {
        tone(170, 0.16, 'square', 0.2, 120);
      } else if (name === 'busted') {
        chord([330, 262, 196, 131], 160, 0.4, 0.28);
      } else if (name === 'ui') {
        tone(620, 0.07, 'triangle', 0.16, 780);
      }
    },
    /** Continuous engine and siren levels follow what is happening on screen. */
    update(state) {
      if (!ctx || ctx.state !== 'running') return;
      const now = ctx.currentTime;
      const car = state.player.car;
      const speed = car ? Math.abs(car.speed) : 0;
      engineOsc.frequency.setTargetAtTime(65 + speed * 0.55, now, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + speed * 2.4, now, 0.1);
      engineGain.gain.setTargetAtTime(car ? 0.035 + Math.min(0.09, speed * 0.0004) : 0, now, 0.12);
      sirenOsc.frequency.setTargetAtTime(470 + state.wanted * 22, now, 0.15);
      sirenGain.gain.setTargetAtTime(state.wanted > 0 ? 0.018 + state.wanted * 0.009 : 0, now, 0.2);
    },
  };
}
