/* ---------------------------
   Sound effects for Practice: chimes, boings and fanfares that go with the
   Bee Buddy's reactions. All made on the fly with Web Audio (no files to
   download). Rules:
   - Practice tab only, and never while the app is in the background
   - Never over the word: any recording or spoken word starts with
     stopAllAudio() (app.js), which hushes every effect still playing
   - Quiet by design, and a 🔊 button on the Practice card turns them off
     (remembered on this device)
   bee-buddy.js and practice.js call sfx("name"); names are in SFX below.
--------------------------- */
const SFX_VOLUME = 0.35;
const SFX_MUTED_KEY = "spellingBeeSfxMuted";

let sfxCtx = null;
let sfxMaster = null;
let sfxNoiseBuffer = null;
const sfxVoices = new Set();

function sfxMuted() {
  try { return localStorage.getItem(SFX_MUTED_KEY) === "1"; } catch { return false; }
}

// The audio context, created (and woken) on demand. Phones only allow that
// during a tap, so a tap anywhere also wakes it (see the listener below).
function sfxReady() {
  if (sfxMuted() || document.hidden || typeof activeTab === "undefined" || activeTab !== "practice") return null;
  try {
    if (!sfxCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      sfxCtx = new AC();
      sfxMaster = sfxCtx.createGain();
      sfxMaster.gain.value = SFX_VOLUME;
      sfxMaster.connect(sfxCtx.destination);
    }
    if (sfxCtx.state === "suspended") sfxCtx.resume();
    return sfxCtx;
  } catch { return null; }
}

const midi = n => 440 * 2 ** ((n - 69) / 12);

function sfxTrack(node, stopAt) {
  sfxVoices.add(node);
  node.onended = () => sfxVoices.delete(node);
  node.start(sfxCtx.currentTime + Math.max(0, stopAt.start));
  node.stop(sfxCtx.currentTime + stopAt.end + 0.05);
}

function sfxEnvelope(t, dur, vol, attack) {
  const g = sfxCtx.createGain();
  const at = sfxCtx.currentTime + t;
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  g.connect(sfxMaster);
  return g;
}

// One note. `path` = [[seconds, Hz], ...] bends the pitch along the way;
// `vib` = [rate Hz, depth Hz] wobbles it.
function tone(freq, t, dur, { type = "sine", vol = 0.4, attack = 0.01, path = null, vib = null } = {}) {
  const o = sfxCtx.createOscillator();
  const at = sfxCtx.currentTime + t;
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (path) for (const [dt, f] of path) o.frequency.exponentialRampToValueAtTime(f, at + dt);
  if (vib) {
    const lfo = sfxCtx.createOscillator(), depth = sfxCtx.createGain();
    lfo.frequency.value = vib[0];
    depth.gain.value = vib[1];
    lfo.connect(depth).connect(o.frequency);
    sfxTrack(lfo, { start: t, end: t + dur });
  }
  o.connect(sfxEnvelope(t, dur, vol, attack));
  sfxTrack(o, { start: t, end: t + dur });
}

// A burst of hiss through a filter whose frequency can sweep (whooshes, splats)
function noise(t, dur, { vol = 0.3, kind = "bandpass", freq = 1000, to = null, q = 1, attack = 0.01 } = {}) {
  if (!sfxNoiseBuffer) {
    sfxNoiseBuffer = sfxCtx.createBuffer(1, sfxCtx.sampleRate, sfxCtx.sampleRate);
    const data = sfxNoiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = sfxCtx.createBufferSource();
  src.buffer = sfxNoiseBuffer;
  src.loop = true;
  const filter = sfxCtx.createBiquadFilter();
  const at = sfxCtx.currentTime + t;
  filter.type = kind;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(freq, at);
  if (to) filter.frequency.exponentialRampToValueAtTime(to, at + dur);
  src.connect(filter).connect(sfxEnvelope(t, dur, vol, attack));
  sfxTrack(src, { start: t, end: t + dur });
}

// Notes one after another: [midi, ...] every `step` seconds
function arp(notes, t, step, opts = {}) {
  notes.forEach((n, i) => tone(midi(n), t + i * step, opts.dur || 0.3, opts));
}

const PENTA = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96];
const sfxRand = list => list[Math.floor(Math.random() * list.length)];

const SFX = {
  // ---- answers ----
  correct() {
    const pattern = sfxRand([[72, 76, 79], [76, 79, 84], [79, 84, 88], [72, 79, 84]]);
    arp(pattern, 0, 0.07, { type: "triangle", vol: 0.35, dur: 0.35 });
    tone(midi(pattern[2] + 12), 0.2, 0.4, { vol: 0.12 });
  },
  wrong() { // a gentle "wah-wahh", never a harsh buzzer
    tone(midi(67), 0, 0.2, { type: "triangle", vol: 0.3 });
    tone(midi(62), 0.2, 0.45, { type: "triangle", vol: 0.3, path: [[0.45, midi(57)]], vib: [6, 4] });
  },
  timeUp() {
    tone(880, 0, 0.08, { type: "square", vol: 0.08 });
    tone(660, 0.1, 0.08, { type: "square", vol: 0.08 });
    tone(520, 0.24, 0.7, { vol: 0.35, path: [[0.7, 110]], vib: [9, 18] });
  },
  tick() { tone(1700, 0, 0.04, { type: "square", vol: 0.05, attack: 0.002 }); },
  tickLast() { tone(2200, 0, 0.06, { type: "square", vol: 0.07, attack: 0.002 }); },

  // ---- streaks and surprises ----
  streak5() { // "too cool": a bass hop and a shimmer
    tone(midi(48), 0, 0.15, { type: "triangle", vol: 0.4 });
    tone(midi(55), 0.15, 0.2, { type: "triangle", vol: 0.4 });
    arp([72, 76, 79, 84], 0.3, 0.06, { vol: 0.2, dur: 0.4 });
  },
  streak10() { // fanfare with a whoosh of fire
    noise(0, 0.6, { vol: 0.15, freq: 400, to: 3000 });
    arp([67, 72, 76], 0.05, 0.12, { type: "triangle", vol: 0.35, dur: 0.18 });
    tone(midi(79), 0.41, 0.7, { type: "triangle", vol: 0.35, vib: [5, 5] });
    tone(midi(84), 0.41, 0.7, { type: "sine", vol: 0.15 });
  },
  golden() { // magic sparkles while the golden bee crosses
    for (let i = 0; i < 16; i++) tone(midi(sfxRand(PENTA) + 12), i * 0.22 + Math.random() * 0.1, 0.35, { vol: 0.1 });
  },
  evolve() { // the bee grows into a new stage
    arp([60, 64, 67, 72, 76, 79, 84, 88], 0, 0.09, { type: "triangle", vol: 0.25, dur: 0.5 });
    tone(midi(96), 0.75, 1, { vol: 0.08, vib: [7, 12] });
  },

  // ---- tricks (names match BUDDY_TRICKS fx) ----
  backflip() {
    noise(0, 0.5, { vol: 0.25, freq: 300, to: 3000, q: 2 });
    tone(110, 0.82, 0.15, { vol: 0.4, path: [[0.15, 60]] });
  },
  loop() { tone(500, 0, 1.05, { vol: 0.2, path: [[0.5, 1300], [1.05, 500]] }); }, // slide whistle
  boing() { tone(180, 0, 0.6, { vol: 0.35, path: [[0.12, 520], [0.6, 260]], vib: [14, 40] }); },
  waggle() {
    for (let i = 0; i < 8; i++) tone(midi(i % 2 ? 79 : 76), i * 0.15, 0.13, { type: "triangle", vol: 0.2 });
  },
  zoom() {
    noise(0, 1.2, { vol: 0.25, freq: 3500, to: 250, q: 3 });
    tone(900, 0, 1.1, { vol: 0.12, path: [[1.1, 280]] });
  },
  twirl() { arp([84, 88, 91, 96, 91, 96], 0, 0.11, { vol: 0.15, dur: 0.3 }); },
  hophop() { [0, 0.37, 0.73].forEach((t, i) => tone(300 + i * 80, t, 0.18, { vol: 0.3, path: [[0.12, 700 + i * 150]] })); },
  peekaboo() {
    tone(800, 0, 0.35, { vol: 0.2, path: [[0.35, 200]] });
    tone(400, 0.85, 0.12, { vol: 0.35, path: [[0.08, 1300]] });
  },
  jelly() { tone(260, 0, 0.9, { vol: 0.3, vib: [11, 70] }); },
  splat() {
    noise(0, 0.3, { vol: 0.5, kind: "lowpass", freq: 1200, to: 200 });
    tone(140, 0, 0.3, { vol: 0.45, path: [[0.3, 45]] });
  },

  // ---- tapping the bee ----
  tickle() { for (let i = 0; i < 5; i++) tone(1000 + Math.random() * 700, i * 0.07, 0.07, { vol: 0.15, path: [[0.06, 1900]] }); },
  dizzy() { tone(600, 0, 2.2, { vol: 0.18, vib: [3, 220] }); },
  sleep() { [0, 2.4, 4.8].forEach(t => noise(t, 1.1, { vol: 0.12, kind: "lowpass", freq: 350, attack: 0.5 })); },
  wake() { arp([72, 79, 84], 0, 0.08, { vol: 0.25, dur: 0.2 }); },

  // ---- full-screen shows (names match FX_SCENES) ----
  swarm() { // a swelling buzz of many bees
    [170, 205, 240].forEach((f, i) => tone(f, i * 0.15, 3.6, { type: "sawtooth", vol: 0.06, attack: 0.8, vib: [17 + i * 4, 10] }));
  },
  honey() { for (let i = 0; i < 9; i++) tone(900 + Math.random() * 400, 0.3 + i * 0.35 + Math.random() * 0.1, 0.16, { vol: 0.25, path: [[0.15, 260]] }); },
  bloom() { arp([72, 76, 79, 84, 88, 91, 96, 91, 88, 91, 96, 100], 0.2, 0.17, { type: "triangle", vol: 0.18, dur: 0.6 }); },
  party() {
    SFX.streak10();
    for (let i = 0; i < 8; i++) noise(0.9 + i * 0.25 + Math.random() * 0.1, 0.08, { vol: 0.3, freq: 2500, q: 0.7 }); // poppers
  },

  // ---- end of test ----
  perfect() {
    arp([72, 76, 79], 0, 0.13, { type: "triangle", vol: 0.32, dur: 0.2 });
    [72, 76, 79, 84].forEach(n => tone(midi(n), 0.42, 1.3, { type: "triangle", vol: 0.16, vib: [5, 3] }));
    SFX.golden();
  },
  great() { arp([72, 76, 79, 84], 0, 0.11, { type: "triangle", vol: 0.3, dur: 0.45 }); },
  keepGoing() { arp([67, 72, 74, 76], 0, 0.16, { type: "triangle", vol: 0.25, dur: 0.5 }); }
};

function sfx(name) {
  if (!SFX[name] || !sfxReady()) return;
  try { SFX[name](); } catch {}
}

// Stop every effect at once (a word is about to be spoken, or the tab changed)
function sfxHush() {
  for (const node of sfxVoices) { try { node.stop(); } catch {} }
  sfxVoices.clear();
}

function sfxRenderToggle() {
  const btn = document.getElementById("sfxToggle");
  if (!btn) return;
  const muted = sfxMuted();
  btn.textContent = muted ? "🔇" : "🔊";
  btn.setAttribute("aria-pressed", String(!muted));
  btn.title = muted ? "Sound effects are off. Tap to turn them on" : "Sound effects are on. Tap to turn them off";
}

document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("sfxToggle");
  if (!btn) return;
  sfxRenderToggle();
  btn.addEventListener("mousedown", event => event.preventDefault()); // keep the phone's keyboard open
  btn.addEventListener("click", () => {
    const muted = !sfxMuted();
    try { localStorage.setItem(SFX_MUTED_KEY, muted ? "1" : "0"); } catch {}
    if (muted) sfxHush();
    sfxRenderToggle();
    if (!muted) sfx("wake"); // a little "on!" so she knows it worked
  });
});

// Phones only let audio start during a tap or key press: wake the context then
for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, () => sfxReady(), { capture: true, passive: true });
document.addEventListener("visibilitychange", () => { if (document.hidden) sfxHush(); });
