/* ---------------------------
   Learning bee: stays out of the way while she learns. Only when one word has
   been on the card for 30 seconds (counting only while the app is on screen)
   does her bee pop into the corner, do something silly for a few seconds and
   fly off. It comes back at most twice more for the same word, then leaves
   her alone. Never covers the card: a small corner sprite, gone in seconds.
   Also:
   - every 10 words learned in a sitting, a bee flies across with a banner
   - a word with "bee", "honey", "buzz"... in it: a quick wave hello
   - tap the visiting bee: it giggles and flies off early
   Uses app.js (activeTab, currentItem, words, isCompleted, progressData) and
   bee-buddy.js (BUDDY_STAGES, buddyStageIndex, buddyBodySvg, buddyFaceSvg,
   flyingBeeSvg, pickOne, reducedMotion).
--------------------------- */
const LEARN_BEE_VISITS_AT = [30, 75, 120]; // seconds on one word; the last visit is a nap
const LEARN_BEE_MILESTONE = 10;            // flyby every this many words learned in a sitting
const LEARN_BEE_WORD_RE = /bee|buzz|honey|hive|pollen|nectar|wax/i;

const LEARN_BEE_FACTS = [
  "Fun fact: bees have FIVE eyes! 👀👀👁️", "Fun fact: bees dance to tell friends where flowers are! 💃",
  "Fun fact: a bee's wings flap 200 times a second! 🪽", "Fun fact: honey never goes bad. Ever! 🍯",
  "Fun fact: bees can recognise human faces! 🙂", "Fun fact: a bee visits about 100 flowers on one trip! 🌸",
  "Fun fact: bees taste with their feet! 🦶", "Fun fact: a hive can have 50,000 bees! That's a LOT of buzz.",
  "Fun fact: bees sleep and even take naps! 😴", "Fun fact: bees can see colours we can't! 🌈"
];

// Each skit: `skit` matches a .learn-bee[data-skit] rule in index.html; ms = time on screen
const LEARN_BEE_SKITS = [
  { skit: "peek", ms: 4200, lines: ["Psst... just checking on you! 👀", "Peekaboo! Take your time!",
    "Is this word being tricky? I'll wait. 👀"] },
  { skit: "magnify", ms: 4600, lines: ["Hmm... let me inspect this word... 🔍", "Detective Bee is on the case! 🕵️",
    "I see letters. Lots of letters. 🔍"] },
  { skit: "juggle", ms: 5000, lines: ["Look! I'm juggling your word! 🤹", "Letters are fun to juggle!",
    "Don't worry, I won't drop them! (Probably.)"] },
  { skit: "music", ms: 4600, lines: ["Thinking music! Doo-bee-doo... 🎶", "Bzz bzz, a little thinking song! 🎵",
    "Humming helps me remember! Hmm-hmm-hmm 🎶"] },
  { skit: "stretch", ms: 4600, lines: ["Stretch break! Wiggle your fingers! 🙆", "Big stretch! Ahhh, that's better.",
    "Shake out those wings! (Or arms.)"] },
  { skit: "fact", ms: 5800, lines: LEARN_BEE_FACTS },
  { skit: "sign", ms: 4600, lines: ["I made a sign for you!", "Holding this up for you! 📣", "Your biggest fan is here!"],
    signs: ["You got this!", "Go go go!", "Spell-tacular!", "#1 Speller", "Bee brave!"] },
  { skit: "spin", ms: 4200, lines: ["Wheee! Spinning helps me think!", "Round and round... okay, dizzy now. 😵‍💫"] }
];
const LEARN_BEE_NAP = { skit: "nap", ms: 6500, lines: ["This word is so cozy I took a nap 😴", "Wake me when you're ready! 💤",
  "Zzz... honey... zzz... 🍯"] };
const LEARN_BEE_HELLO = { skit: "hello", ms: 3000, lines: ["Hey! A bee word! That's family! 🐝", "Bzz! That word speaks my language!",
  "A word about ME?! I'm blushing! ☺️"] };
const LEARN_BEE_LONG_LINES = ["That word is longer than my stinger! 📏", "Whoa, that's a BIG word! It's bigger than me!"];
const LEARN_BEE_SHOO = ["Hee hee! Okay, back to learning! 🫡", "Bzz! I'll let you think!", "Ticklish! Bye-bye! 👋"];

let lbItem = null;      // the word whose time is being counted
let lbSeconds = 0;      // seconds that word has been on screen
let lbVisits = 0;       // visits so far for that word
let lbEl = null;        // the bee on screen, if any
let lbTimers = [];
let lbLearned = 0;      // words learned since the page opened
let lbLastSkit = "";

function learnBeeLearning() {
  return typeof activeTab !== "undefined" && activeTab === "learning" && !document.hidden;
}

// Something else on top (a pop-up or a full-screen show): don't add to it
function learnBeeBusy() {
  return !!document.querySelector("dialog[open], .mw-overlay:not([hidden]), .fx-screen");
}

function learnBeeFigureSvg() {
  const count = typeof words !== "undefined" ? words.filter(isCompleted).length : 0;
  const stage = BUDDY_STAGES[buddyStageIndex(count)];
  return `<svg class="lb-figure" viewBox="0 0 64 64">${buddyBodySvg(stage)}${buddyFaceSvg()}</svg>`;
}

function learnBeeClear() {
  lbTimers.forEach(clearTimeout);
  lbTimers = [];
}

// Fly off (or vanish at once when `now`, e.g. the tab changed)
function learnBeeLeave(now = false) {
  if (!lbEl) return;
  const el = lbEl;
  lbEl = null;
  learnBeeClear();
  if (now || reducedMotion()) { el.remove(); return; }
  el.classList.remove("lb-in");
  el.classList.add("lb-out");
  setTimeout(() => el.remove(), 700);
}

// The props each skit holds or throws (all aria-hidden decoration)
function learnBeeProps(skit) {
  const word = (lbItem?.word || "bee").replace(/[^a-z]/gi, "");
  switch (skit.skit) {
    case "magnify": return `<span class="lb-prop lb-glass">🔍</span>`;
    case "juggle": {
      const letters = [...new Set(word.toUpperCase())].sort(() => Math.random() - 0.5).slice(0, 3);
      while (letters.length < 3) letters.push("B");
      return letters.map((ch, i) => `<span class="lb-prop lb-ball" style="--i:${i}">${ch}</span>`).join("");
    }
    case "music": return ["🎵", "🎶", "🎵"].map((n, i) => `<span class="lb-prop lb-note" style="--i:${i}">${n}</span>`).join("");
    case "fact": return `<span class="lb-prop lb-bulb">💡</span>`;
    case "sign": return `<span class="lb-prop lb-sign"></span>`;
    case "nap": return `<span class="lb-prop lb-pillow">☁️</span>`;
    case "hello": return `<span class="lb-prop lb-wave">👋</span>`;
    default: return "";
  }
}

function learnBeeShow(skit, line) {
  learnBeeLeave(true);
  const el = document.createElement("div");
  el.className = "learn-bee";
  el.dataset.skit = skit.skit;
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<p class="lb-speech"></p><div class="lb-body">${learnBeeProps(skit)}${learnBeeFigureSvg()}</div>`;
  el.querySelector(".lb-speech").textContent = line;
  const sign = el.querySelector(".lb-sign");
  if (sign) sign.textContent = pickOne(skit.signs);
  const figure = el.querySelector(".lb-figure");
  figure.addEventListener("pointerdown", learnBeeShoo);
  figure.addEventListener("contextmenu", event => event.preventDefault());
  document.body.append(el);
  lbEl = el;
  void el.offsetWidth; // start off screen, then slide in
  el.classList.add("lb-in");
  lbTimers.push(setTimeout(() => learnBeeLeave(), skit.ms));
}

// Tap the visiting bee: a giggle and a spin, then off it goes
function learnBeeShoo(event) {
  event.preventDefault();
  if (!lbEl || lbEl.dataset.skit === "shoo") return;
  learnBeeClear();
  lbEl.dataset.skit = "shoo";
  lbEl.querySelectorAll(".lb-prop").forEach(prop => prop.remove());
  lbEl.querySelector(".lb-speech").textContent = pickOne(LEARN_BEE_SHOO);
  lbTimers.push(setTimeout(() => learnBeeLeave(), 1300));
}

function learnBeeVisit() {
  lbVisits++;
  const last = lbVisits === LEARN_BEE_VISITS_AT.length;
  let skit = last ? LEARN_BEE_NAP : pickOne(LEARN_BEE_SKITS.filter(s => s.skit !== lbLastSkit));
  lbLastSkit = skit.skit;
  let lines = skit.lines;
  // Now and then, a line about the word itself (never about how it's spelled)
  if (!last && (lbItem?.word || "").length >= 11 && Math.random() < 0.4) lines = LEARN_BEE_LONG_LINES;
  learnBeeShow(skit, pickOne(lines));
}

// Once a second: count time on the word, and send the bee when it's due
function learnBeeTick() {
  if (!learnBeeLearning()) { learnBeeLeave(true); return; }
  const item = typeof currentItem !== "undefined" ? currentItem : null;
  if (item !== lbItem) {
    learnBeeLeave(true);
    lbItem = item;
    lbSeconds = 0;
    lbVisits = 0;
    // A bee word: a quick hello once it's been open a moment
    if (item && LEARN_BEE_WORD_RE.test(item.word)) lbVisits = -1;
    return;
  }
  if (!item) return;
  lbSeconds++;
  if (lbVisits === -1 && lbSeconds === 2) {
    lbVisits = 0;
    if (!learnBeeBusy()) learnBeeShow(LEARN_BEE_HELLO, pickOne(LEARN_BEE_HELLO.lines));
    return;
  }
  const due = LEARN_BEE_VISITS_AT[lbVisits];
  if (due !== undefined && lbSeconds >= due && !lbEl) {
    if (learnBeeBusy()) return; // try again next second
    learnBeeVisit();
  }
}

// Called by app.js when a word becomes learned (opened on the card for the first time)
function learnBeeLearned() {
  lbLearned++;
  if (lbLearned % LEARN_BEE_MILESTONE || reducedMotion() || document.hidden) return;
  const n = lbLearned;
  const banner = n >= 50 ? `${n} words! LEGENDARY! 🏆` : n >= 30 ? `${n} words! Amazing! 🌟` : `${n} words learned! 🎉`;
  const fly = document.createElement("div");
  fly.className = "lb-flyby";
  fly.setAttribute("aria-hidden", "true");
  fly.style.top = `${10 + Math.random() * 20}vh`;
  fly.innerHTML = `<span class="lb-banner"></span><div class="gb-bob">${flyingBeeSvg()}</div>`;
  fly.querySelector(".lb-banner").textContent = banner;
  document.body.append(fly);
  const remove = () => fly.remove();
  fly.addEventListener("animationend", event => { if (event.target === fly) remove(); });
  setTimeout(remove, 7000); // in case the animation never ends (tab hidden)
}

setInterval(learnBeeTick, 1000);
document.addEventListener("visibilitychange", () => { if (document.hidden) learnBeeLeave(true); });
