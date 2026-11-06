/* ---------------------------
   Bee Buddy: a little bee on the Practice card. It floats while she thinks,
   sweats as the timer runs down, dances on a right answer and faints on a
   wrong one, and grows as more words are completed. It only reacts: it never
   slows the test down, and never says anything about the word's spelling.
   Uses globals from app.js (words, isCompleted, progressData).
--------------------------- */
// `at` = completed words needed. Her progress starts high, so the top stages
// are spaced out to leave room to grow.
const BUDDY_STAGES = [
  { at: 0, name: "Egg", body: "egg" },
  { at: 100, name: "Larva", body: "larva" },
  { at: 400, name: "Pupa", body: "pupa" },
  { at: 1000, name: "Worker Bee", body: "bee" },
  { at: 1750, name: "Forager", body: "bee", extras: "pollen" },
  { at: 2500, name: "Royal Bee", body: "bee", extras: "pollen cape" },
  { at: 3000, name: "Queen Bee", body: "bee", extras: "pollen cape crown" }
];
const BUDDY_STAGE_KEY = "spellingBeeBuddyStage";

// The joke is always on the word or the bee, never on her
const BUDDY_LINES = {
  newWord: ["Listen closely!", "You've got this!", "Ears on, antennae up!", "Ooh, I like this one.", "Take your time."],
  worried: ["No rush... but I'm sweating!", "Is it hot in here?", "Tick tock, little bee!"],
  panic: ["Bzz bzz bzz! Hurry!", "My wings are sweating!", "Time is buzzing away!"],
  right: ["Bee-utiful!", "You're the bee's knees!", "Buzz-tastic!", "Un-bee-lievable!", "Sweet as honey!", "That word never stood a chance!"],
  wrong: ["Oof! That word stung a bit.", "I'm okay! Just fainting.", "Bzzt! Sneaky word!", "We'll get it next time!", "Even bees bump into windows."],
  timeUp: ["Time flew, and I flew after it!", "Oops! The clock out-buzzed us."],
  tickle: ["Hee hee! That tickles!", "Bzz-ha-ha-ha!", "Stop it, I'm ticklish! 😆", "Wheee!", "Again! Again!"],
  perfect: ["Perfect! I'm doing the honey dance!", "Every. Single. Word. Bee-utiful!"],
  great: ["What a sweet score!", "The whole hive is cheering!"],
  keepGoing: ["Every wrong word makes us smarter!", "Those tricky words won't know what hit them."],
  ended: ["See you next time!"]
};

let buddyMood = null;
let buddyBody = null;
let buddyLastLine = "";

function buddyPick(group) {
  const lines = BUDDY_LINES[group].filter(line => line !== buddyLastLine);
  return lines[Math.floor(Math.random() * lines.length)] || BUDDY_LINES[group][0];
}

function buddyFaceSvg() {
  return `
    <g class="bb-eyes"><circle cx="25" cy="30" r="3"/><circle cx="39" cy="30" r="3"/></g>
    <g class="bb-eyes-x"><path d="M22 27l6 6m0-6l-6 6M36 27l6 6m0-6l-6 6"/></g>
    <path class="bb-mouth bb-smile" d="M26 37q6 6 12 0"/>
    <path class="bb-mouth bb-wavy" d="M25 39q3.5-4 7 0t7 0"/>
    <ellipse class="bb-oh" cx="32" cy="39" rx="3" ry="4"/>
    <path class="bb-sweat" d="M53 16q5 7 0 10q-5-3 0-10z"/>
    <path class="bb-sweat bb-sweat-2" d="M10 22q4 6 0 9q-4-3 0-9z"/>
    <g class="bb-dizzy-eyes">
      <path d="M25 30m-1 0a1 1 0 1 1 2 0a2 2 0 1 1-4 0a3 3 0 1 1 6 0"/>
      <path d="M39 30m-1 0a1 1 0 1 1 2 0a2 2 0 1 1-4 0a3 3 0 1 1 6 0"/>
    </g>
    <g class="bb-flame">
      <path d="M-6 58q-9-8-3-19q1 6 5 7q-3-9 5-16q-1 9 4 13q4 7-2 15z" fill="#f97316"/>
      <path d="M-3 57q-5-5-1-11q1 4 4 4q-1-5 3-8q0 6 2 8q2 5-2 7z" fill="#fde047"/>
    </g>
    <g class="bb-shades">
      <path d="M16 27h32" stroke="#1f1a24" stroke-width="2"/>
      <rect x="17" y="25" width="13" height="9" rx="3" fill="#1f1a24"/>
      <rect x="34" y="25" width="13" height="9" rx="3" fill="#1f1a24"/>
      <path d="M20 28l3-1M37 28l3-1" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>
    </g>`;
}

function buddyBodySvg(stage) {
  const has = extra => (stage.extras || "").includes(extra);
  if (stage.body === "egg") {
    return `<ellipse cx="32" cy="34" rx="20" ry="25" fill="#fdf6e3" stroke="#d4af6a" stroke-width="2"/>
      <circle cx="19" cy="48" r="2.5" fill="#f2dfae"/><circle cx="44" cy="15" r="3" fill="#f2dfae"/>`;
  }
  if (stage.body === "larva") {
    return `<ellipse cx="50" cy="51" rx="9" ry="7" fill="#f7e7bd" stroke="#d4af6a" stroke-width="2"/>
      <ellipse cx="41" cy="48" rx="11" ry="10" fill="#fbeecb" stroke="#d4af6a" stroke-width="2"/>
      <ellipse cx="31" cy="34" rx="20" ry="19" fill="#fdf6e3" stroke="#d4af6a" stroke-width="2"/>`;
  }
  if (stage.body === "pupa") {
    return `<ellipse cx="32" cy="34" rx="21" ry="26" fill="#e6c98d" stroke="#a9833f" stroke-width="2"/>
      <path d="M13 44q19 8 38 0M17 53q15 6 30 0M15 19q17-7 34 0" fill="none" stroke="#a9833f" stroke-width="2"/>`;
  }
  return `
    ${has("cape") ? `<path d="M14 32 L5 60 H59 L50 32 Z" fill="#8b5cf6" stroke="#6d3fd1" stroke-width="2"/>` : ""}
    <g class="bb-wings">
      <ellipse cx="11" cy="20" rx="10" ry="15" fill="#bfe3ff" fill-opacity="0.75" stroke="#7fb9e6" transform="rotate(-25 11 20)"/>
      <ellipse cx="53" cy="20" rx="10" ry="15" fill="#bfe3ff" fill-opacity="0.75" stroke="#7fb9e6" transform="rotate(25 53 20)"/>
    </g>
    <path d="M25 13q-3-8-9-8M39 13q3-8 9-8" fill="none" stroke="#2b2233" stroke-width="2" stroke-linecap="round"/>
    <circle cx="16" cy="5" r="2.5" fill="#2b2233"/><circle cx="48" cy="5" r="2.5" fill="#2b2233"/>
    <ellipse cx="32" cy="36" rx="21" ry="24" fill="#fbbf24" stroke="#2b2233" stroke-width="2"/>
    <path d="M13 46q19 7 38 0" fill="none" stroke="#2b2233" stroke-width="5"/>
    <path d="M19 54q13 5 26 0" fill="none" stroke="#2b2233" stroke-width="4"/>
    ${has("pollen") ? `<circle cx="10" cy="44" r="5" fill="#fb923c"/><circle cx="54" cy="44" r="5" fill="#fb923c"/>` : ""}
    ${has("crown") ? `<path d="M19 15 L17 3 L25 9 L32 1 L39 9 L47 3 L45 15 Z" fill="#fcd34d" stroke="#b7791f" stroke-width="1.5"/>` : ""}`;
}

function buddySetStage(stage) {
  if (buddyBody === stage.name) return;
  buddyBody = stage.name;
  const el = document.getElementById("beeBuddyFigure");
  el.innerHTML = `${buddyBodySvg(stage)}${buddyFaceSvg()}`;
  document.getElementById("beeBuddy").dataset.stage = stage.body;
}

function setBuddy(mood, text) {
  const el = document.getElementById("beeBuddy");
  el.dataset.mood = mood;
  buddyMood = mood;
  buddyLastLine = text;
  const speech = document.getElementById("beeBuddySpeech");
  speech.textContent = text;
  speech.hidden = !text;
}

function buddyStageIndex(count) {
  return BUDDY_STAGES.reduce((best, stage, i) => (count >= stage.at ? i : best), 0);
}

// Start screen: the bee as big as she's grown it, with a party at a new stage
function buddyHome() {
  document.getElementById("beeBuddy").classList.remove("compact");
  buddyStreak = 0; // each test starts a fresh streak
  buddySetStreakLook("");
  const count = words.filter(isCompleted).length;
  const index = buddyStageIndex(count);
  const stage = BUDDY_STAGES[index];
  buddySetStage(stage);

  let seen = null;
  try { seen = JSON.parse(localStorage.getItem(BUDDY_STAGE_KEY)); } catch {}
  // Saved progress hasn't arrived yet: the count means nothing so far
  if (!progressData && !count) {
    setBuddy("idle", "");
    return;
  }
  try { if (seen === null || index > seen) localStorage.setItem(BUDDY_STAGE_KEY, index); } catch {}
  if (seen !== null && index > seen) {
    setBuddy("evolve", `🎉 Your buddy grew into a ${stage.name}!`);
    return;
  }
  setBuddy("idle", "");
}

function buddyNewWord(answered) {
  document.getElementById("beeBuddy").classList.add("compact");
  setBuddy("idle", answered ? "" : buddyPick("newWord"));
}

// `elapsed` = seconds used on this word; same steps as the timer's colours
function buddyTimer(elapsed) {
  const mood = elapsed >= 60 ? "panic" : elapsed >= 30 ? "worried" : "idle";
  if (mood !== buddyMood && mood !== "idle") setBuddy(mood, buddyPick(mood));
}

function buddyAnswer(entry) {
  if (entry.status === "correct") {
    buddyStreak++;
    const golden = Math.random() < GOLDEN_BEE_CHANCE && buddyGoldenBee();
    if (buddyStreak === 5) setBuddy("happy", "5 in a row! Too cool for school 😎");
    else if (buddyStreak === 10) setBuddy("happy", "10 in a row! I'm on fire! 🔥");
    else if (golden) setBuddy("happy", golden);
    else setBuddy("happy", buddyPick("right"));
    if (buddyStreak === 5 || buddyStreak === 10) buddyPop(1700); // the dance is 2 × 0.8s
  } else {
    const hadShades = buddyStreak >= 5;
    buddyStreak = 0;
    setBuddy("faint", hadShades ? "My shades! 😵 New streak, here we come." : buddyPick(entry.timedOut ? "timeUp" : "wrong"));
    if (hadShades) {
      buddySetStreakLook("drop");
      buddyPop(1300); // long enough to watch the shades fall
      return;
    }
  }
  buddySetStreakLook(buddyStreak >= 10 ? "fire" : buddyStreak >= 5 ? "cool" : "");
}

/* ---------------------------
   Just for fun. All CSS transforms/opacity, played once and removed, and
   switched off when the device asks for reduced motion.
--------------------------- */
let buddyStreak = 0;          // correct answers in a row in this test
const GOLDEN_BEE_CHANCE = 1 / 40;
const GOLDEN_BEES_KEY = "spellingBeeGoldenBees";

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

// The buddy grows for `ms` so she notices something's happening, then shrinks
// back. Uses the CSS `scale` property, so it stacks on the mood animations
// (which use `transform`) without fighting them.
let buddyPopTimer = null;

function buddyPop(ms) {
  const el = document.getElementById("beeBuddy");
  el.classList.add("bb-pop");
  clearTimeout(buddyPopTimer);
  buddyPopTimer = setTimeout(() => el.classList.remove("bb-pop"), ms);
}

// "" | "cool" (😎 at 5 in a row) | "fire" (🔥 at 10) | "drop" (shades fall off)
function buddySetStreakLook(look) {
  const el = document.getElementById("beeBuddy");
  if (look) el.dataset.streak = look;
  else delete el.dataset.streak;
}

// A rare golden bee zooms across the screen. Returns what the buddy says.
function buddyGoldenBee() {
  let count = 1;
  try {
    count = (Number(localStorage.getItem(GOLDEN_BEES_KEY)) || 0) + 1;
    localStorage.setItem(GOLDEN_BEES_KEY, count);
  } catch {}
  if (!reducedMotion()) {
    const bee = document.createElement("div");
    bee.className = "golden-bee";
    bee.setAttribute("aria-hidden", "true");
    bee.style.top = `${15 + Math.random() * 35}vh`;
    bee.innerHTML = `<div class="gb-bob"><svg viewBox="0 0 64 64">
      <circle cx="32" cy="34" r="30" fill="#fde68a" opacity="0.35"/>
      <g class="gb-wings"><ellipse cx="22" cy="16" rx="9" ry="13" fill="#fff" fill-opacity="0.85" transform="rotate(-25 22 16)"/>
      <ellipse cx="42" cy="16" rx="9" ry="13" fill="#fff" fill-opacity="0.85" transform="rotate(25 42 16)"/></g>
      <ellipse cx="32" cy="36" rx="17" ry="19" fill="#facc15" stroke="#a16207" stroke-width="2"/>
      <path d="M17 42q15 6 30 0M20 50q12 4 24 0" fill="none" stroke="#a16207" stroke-width="4"/>
      <circle cx="26" cy="30" r="2.5" fill="#422006"/><circle cx="38" cy="30" r="2.5" fill="#422006"/>
      <path d="M8 10l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>
    </svg></div>`;
    document.body.append(bee);
    const remove = () => bee.remove();
    bee.addEventListener("animationend", event => { if (event.target === bee) remove(); });
    setTimeout(remove, 4000); // in case the animation never ends (tab hidden)
  }
  buddyPop(1900); // while the golden bee crosses the screen
  return count === 1
    ? "✨ Whoa, a golden bee! They're super rare!"
    : `✨ A golden bee! That's golden bee #${count}!`;
}

// The letters of a correctly spelled word hop one after another
function buddyBounceWord(el, word) {
  if (!el || reducedMotion()) return;
  el.replaceChildren(...[...word].map((ch, i) => {
    const span = document.createElement("span");
    span.className = "fb-letter";
    span.textContent = ch;
    span.style.animationDelay = `${i * 45}ms`;
    return span;
  }));
}

// A Learning letter just reached 100%: a bee flies in, crowns it and flies off
function buddyCrownLetter(btn) {
  if (reducedMotion()) return;
  const rect = btn.getBoundingClientRect();
  if (!rect.width || rect.bottom < 0 || rect.top > window.innerHeight) return; // hidden or off screen
  const bee = document.createElement("div");
  bee.className = "letter-bee";
  bee.setAttribute("aria-hidden", "true");
  bee.textContent = "🐝";
  bee.style.left = `${rect.left + rect.width / 2 - 11}px`;
  bee.style.top = `${rect.top - 20}px`;
  document.body.append(bee);
  const remove = () => bee.remove();
  bee.addEventListener("animationend", remove);
  setTimeout(remove, 3000);
}

/* Tickle the bee: a giggle and a spin; 10 quick taps make it dizzy */
let buddyTaps = [];
let buddyFxTimer = null;

function buddySay(text) {
  const speech = document.getElementById("beeBuddySpeech");
  speech.textContent = text;
  speech.hidden = !text;
  buddyLastLine = text;
}

function buddyFx(fx, ms, line) {
  const el = document.getElementById("beeBuddy");
  delete el.dataset.fx;
  void el.offsetWidth; // restart the animation on every tap
  el.dataset.fx = fx;
  buddySay(line);
  clearTimeout(buddyFxTimer);
  buddyFxTimer = setTimeout(() => delete el.dataset.fx, ms);
}

function buddyTickle() {
  const el = document.getElementById("beeBuddy");
  const now = Date.now();
  buddyTaps = [...buddyTaps.filter(t => now - t < 4000), now];
  if (buddyTaps.length >= 10) {
    buddyTaps = [];
    buddyFx("dizzy", 2600, "Whoa... the room is spinning... 😵‍💫");
    buddyPop(2600);
  } else if (el.dataset.fx !== "dizzy") {
    buddyFx("tickle", 650, buddyPick("tickle"));
    buddyPop(800);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const figure = document.getElementById("beeBuddyFigure");
  // pointerdown so it reacts at once; mousedown kept from taking focus, so a
  // tap mid-test doesn't close the phone's keyboard
  figure.addEventListener("pointerdown", buddyTickle);
  figure.addEventListener("mousedown", event => event.preventDefault());
});

function buddyResults(answered, pct) {
  document.getElementById("beeBuddy").classList.remove("compact");
  if (!answered) setBuddy("idle", buddyPick("ended"));
  else if (pct === 100) setBuddy("party", buddyPick("perfect"));
  else if (pct >= 80) setBuddy("happy", buddyPick("great"));
  else setBuddy("idle", buddyPick("keepGoing"));
}
