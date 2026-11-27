const scores = {
  hearth: {
    beat: 0.62,
    steps: 6,
    chords: [[48, 55, 60, 64], [45, 52, 57, 60], [41, 48, 57, 60], [43, 50, 55, 62],
      [48, 55, 60, 64], [40, 52, 55, 59], [41, 48, 57, 60], [43, 50, 55, 59]],
    melody: [[72, 0, 76, 79, 0, 76], [74, 72, 69, 0, 72, 0], [69, 72, 77, 0, 76, 72], [74, 0, 71, 67, 0, 71],
      [72, 0, 76, 79, 0, 81], [79, 76, 74, 0, 71, 0], [72, 69, 65, 0, 69, 72], [74, 0, 71, 67, 0, 0]],
  },
  rain: {
    beat: 0.76,
    steps: 4,
    chords: [[45, 52, 57, 60], [41, 48, 53, 57], [48, 55, 60, 64], [43, 50, 57, 59],
      [45, 52, 57, 60], [38, 45, 53, 57], [41, 48, 57, 60], [40, 47, 56, 62]],
    melody: [[69, 0, 72, 76], [77, 76, 72, 0], [67, 0, 72, 74], [71, 69, 67, 0],
      [72, 76, 81, 0], [77, 72, 69, 0], [69, 72, 76, 77], [76, 74, 71, 0]],
  },
};

function tone(context, output, { note, start, duration, level, shape = 'sine', attack = 0.008 }) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = shape;
  oscillator.frequency.value = 440 * 2 ** ((note - 69) / 12);
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(level, start + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(envelope).connect(output);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function renderLoop(id) {
  const score = scores[id];
  const halfBeat = score.beat / 2;
  const duration = score.chords.length * score.steps * halfBeat;
  const sampleRate = 22050;
  const OfflineContext = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const context = new OfflineContext(1, Math.ceil(duration * sampleRate), sampleRate);
  const cutoff = context.createBiquadFilter();
  cutoff.frequency.value = id === 'rain' ? 2500 : 3350;
  cutoff.connect(context.destination);

  score.chords.forEach((chord, bar) => {
    const start = bar * score.steps * halfBeat;
    tone(context, cutoff, { note: chord[0], start, duration: halfBeat * 2.5, level: 0.16 });
    score.melody[bar].forEach((note, step) => {
      const at = start + step * halfBeat;
      const noteLength = Math.min(0.82, duration - at - 0.008);
      const instrument = id === 'hearth' ? 'triangle' : 'sine';
      tone(context, cutoff, { note: chord[(step % 3) + 1], start: at, duration: noteLength, level: 0.075, shape: 'triangle' });
      if (note) tone(context, cutoff, { note, start: at, duration: noteLength, level: 0.14, shape: instrument, attack: 0.025 });
    });
  });
  return context.startRendering();
}

export class RoomAudio {
  track = 'none';
  loops = new Map();
  lastChime = -Infinity;

  async unlock() {
    const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Context) return;
    try {
      this.context ??= new Context();
      if (this.context.state !== 'running') await this.context.resume();
      await this.playTrack();
    } catch {
      // A later interaction can retry if the browser blocks audio.
    }
  }

  setTrack(track) {
    if (track === this.track) return;
    this.track = track;
    if (this.source) {
      const { source, level } = this.source;
      const now = this.context.currentTime;
      level.gain.setTargetAtTime(0, now, 0.025);
      source.stop(now + 0.13);
    }
    this.source = undefined;
    void this.playTrack();
  }

  async playTrack() {
    const { context, track } = this;
    if (context?.state !== 'running' || this.source || !Object.hasOwn(scores, track)) return;
    try {
      if (!this.loops.has(track)) this.loops.set(track, renderLoop(track));
      const buffer = await this.loops.get(track);
      if (this.track !== track || this.source || context.state !== 'running') return;
      const source = context.createBufferSource();
      const level = context.createGain();
      level.gain.value = 0;
      level.gain.setTargetAtTime(0.25, context.currentTime, 0.04);
      source.buffer = buffer;
      source.loop = true;
      source.connect(level).connect(context.destination);
      source.onended = () => {
        source.disconnect();
        level.disconnect();
      };
      source.start();
      this.source = { source, level };
    } catch {
      this.loops.delete(track);
    }
  }

  chime() {
    const context = this.context;
    if (context?.state !== 'running' || context.currentTime - this.lastChime < 0.28) return;
    this.lastChime = context.currentTime;
    tone(context, context.destination, { note: 79, start: this.lastChime, duration: 0.16, level: 0.07 });
    tone(context, context.destination, { note: 84, start: this.lastChime + 0.065, duration: 0.22, level: 0.065 });
  }
}
