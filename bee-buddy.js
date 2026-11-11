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
  newWord: ["Listen closely!", "You've got this!", "Ears on, antennae up!", "Ooh, I like this one.", "Take your time.",
    "Antennae tuned in! 📡", "Shhh... the word is shy.", "I'm all ears! (I don't have ears.)", "Bee-lieve in yourself!",
    "Ready, set, spell!", "My wings are crossed for you!", "This word looks suspicious 🧐", "I've got my thinking stripes on!",
    "New word, who dis? 📱", "I polished my antennae for this one.", "Sounding it out in my head... bzz...",
    "This one smells like a flower. 🌸", "Let's spell-ebrate in advance!", "I packed snacks for this word. 🍯",
    "Brain: ON. Wings: ON. Let's go!", "Shh, I'm concentrating... on you!", "Word incoming! Brace your letters!"],
  worried: ["No rush... but I'm sweating!", "Is it hot in here?", "Tick tock, little bee!", "I'm not nervous, YOU'RE nervous!",
    "Sweating honey over here!", "My stripes are getting wobbly!", "I'm chewing my tiny bee nails...",
    "Hmm, take a deep breath. I'll hold mine! 😤", "The clock is staring at me.", "Should I hum some thinking music? 🎶"],
  panic: ["Bzz bzz bzz! Hurry!", "My wings are sweating!", "Time is buzzing away!", "AAAH! Spell like the wind!",
    "My antennae are spinning!", "Buzz-mergency! 🚨", "I'm flapping SO fast right now!", "Type type type type! ⌨️",
    "Go go go! I believe in you!", "My stinger is shaking! (Not in a scary way.)"],
  right: ["Bee-utiful!", "You're the bee's knees!", "Buzz-tastic!", "Un-bee-lievable!", "Sweet as honey!", "That word never stood a chance!",
    "Hive five! ✋", "I'm buzzing with joy!", "Somebody call the Queen!", "Even the dictionary is impressed!", "Bzz-ingo! 🍯",
    "That word got stung by your brain!", "Nailed it! Like a stinger. (Gently.)", "Spelled it bee-autifully!",
    "Wing-credible! 🪽", "Ding ding ding! 🔔", "Your brain is made of honey! (The smart kind.)", "Spelling champion of the hive!",
    "I'm telling all the flowers about this! 🌼", "That was smooth like honey!", "Pollen-tastic!",
    "The letters lined up just for you!", "I knew you'd get it! (I was 98% sure.)", "Stripe-tacular! 🐝"],
  wrong: ["Oof! That word stung a bit.", "I'm okay! Just fainting.", "Bzzt! Sneaky word!", "We'll get it next time!", "Even bees bump into windows.",
    "That word is a sneaky little stinker!", "The word cheated. I'm sure of it.", "I fainted. Dramatically. 🎭",
    "Plot twist! That word is weird.", "Words are like bees: some just sting.", "Mistakes are how bees get smarter!",
    "Who even invented that word?! 🤨", "That word has too many letters. Rude.", "I'm writing that word a strongly worded letter.",
    "Almost! The word wiggled at the last second.", "Even the Queen gets that one wrong. Shh! 🤫",
    "Tricky! Now we know its secret.", "That word owes us an apology."],
  timeUp: ["Time flew, and I flew after it!", "Oops! The clock out-buzzed us.", "The clock stole my nectar!", "Tick... tock... BZZT!",
    "The clock is way too fast. I'm reporting it! ⏰", "Time's up! But thinking hard still counts.",
    "I blinked and the time buzzed off!"],
  tickle: ["Hee hee! That tickles!", "Bzz-ha-ha-ha!", "Stop it, I'm ticklish! 😆", "Wheee!", "Again! Again!",
    "That's my ticklish stripe!", "Okay okay, I surrender! 🏳️", "Not the antennae!", "Bzz-hee-hee!",
    "My wings are giggling!", "Hee! You found my tickle spot!", "Ha-ha-ha-honey! 🍯", "I'm laughing so hard I'm buzzing!",
    "No fair, I can't tickle back!"],
  perfect: ["Perfect! I'm doing the honey dance!", "Every. Single. Word. Bee-utiful!", "PERFECT! Even the Queen is clapping! 👑",
    "100%?! I need to sit down. On a flower.", "Flawless! I'm framing this score! 🖼️",
    "Not one mistake?! Are you secretly a dictionary? 📖", "Perfect score! Honey for everyone! 🍯🍯🍯"],
  great: ["What a sweet score!", "The whole hive is cheering!", "Sweeter than a honey sandwich!", "You're on a roll! A honey roll!",
    "So close to perfect! Bzz-awesome!", "That score made my wings flutter!", "The flowers are doing a wave for you! 🌷"],
  keepGoing: ["Every wrong word makes us smarter!", "Those tricky words won't know what hit them.",
    "Practice makes perfect... and honey!", "Every bee started as an egg! 🥚", "Bzz! Next round is ours!",
    "Even honey takes time to make!", "Tricky words just need a second date.", "Round two: the words are scared now! 💪"],
  ended: ["See you next time!", "Buzz you later!", "Flying off for a nap! 💤", "Bee seeing you! 👋",
    "Off to tell the hive how great you did!", "Toodle-oo, spelling buddy! 🌻"],
  // Secret surprises (see "Secrets" below)
  jokes: ["What do bees chew? Bumble gum! 😄", "Why do bees have sticky hair? They use honeycombs!",
    "What's a bee's favorite sport? Rugbee! 🏉", "Where do bees go to the bathroom? The BP station!",
    "What do you call a bee that can't make up its mind? A may-bee!", "Why did the bee get married? It found its honey! 💍",
    "What's a bee's favorite haircut? A buzz cut! 💇", "How do bees get to school? On the school buzz! 🚌",
    "What kind of bee can't be understood? A mumble-bee!", "What do bees say on a hot day? Swarm, isn't it? ☀️",
    "What do you call a bee that's having a bad hair day? A frizz-bee! 💨", "What's a bee's favorite flower? Bee-gonias! 🌺",
    "Who's a bee's favorite singer? Sting! 🎤", "What do you call a bee born in May? A May-bee baby!",
    "Why do bees hum? They forgot the words! 🎵", "What does a bee use to brush its hair? A honeycomb! Wait, I told that one...",
    "What's black, yellow, and goes zzub zzub? A bee flying backwards! 🔙", "What do bees do after they marry? Go on a honeymoon! 🌙",
    "What did the bee say to the flower? Hey bud, what time do you open? 🌼", "What's a bee's favorite letter? B, obviously!",
    "Why was the bee's spelling so good? It practiced in the spelling HIVE!", "What do you call a bee in a library? A book-bee! 📚"],
  wake: ["I wasn't sleeping! I was resting my eyes.", "Huh? What? I'm up! I'm up!", "Five more minutes... okay fine! 🥱",
    "I was dreaming about a giant flower! 🌻", "Who? What? Is it honey time?", "I'm awake! My wings were just napping."],
  beeWord: ["Hey! That word has a BEE in it! 🐝", "A bee word! My favorite kind!", "That word is basically my cousin!",
    "That word is family! I'm so proud! 🥹", "Bzz! That word speaks my language!"]
};

// Little tricks the bee does on a right (or wrong) answer, instead of the dance.
// `fx` matches a .bee-buddy[data-fx] rule in index.html; ms = its animation length.
const BUDDY_TRICKS = [
  { fx: "backflip", ms: 1000, lines: ["Backflip! Did you see that?!", "I've been practicing that one!"] },
  { fx: "loop", ms: 1100, lines: ["Loop-de-loop! Wheee!", "Air show! ✈️"] },
  { fx: "boing", ms: 900, lines: ["BOING! 🦘", "I'm so happy I'm bouncy!"] },
  { fx: "waggle", ms: 1200, lines: ["Waggle dance! That means 'great job' in Bee.", "Shake your stripes! 💃"] },
  { fx: "zoom", ms: 1300, lines: ["Brb, telling the whole hive!", "Zoom! Be right back!"] },
  { fx: "twirl", ms: 1000, lines: ["Ballerina bee! 🩰", "Twirl twirl twirl!"] },
  { fx: "hophop", ms: 1100, lines: ["Hop! Hop! Hooray!", "Happy hops! 🐇"] },
  { fx: "peekaboo", ms: 1200, lines: ["Peekaboo! 👀", "Hiding from that word... it's gone? Yay!"] },
  { fx: "jelly", ms: 1000, lines: ["I'm so happy I'm wobbly! 🍮", "Jelly bee! Wibble wobble!"] }
];
const BUDDY_SPLAT = { fx: "splat", ms: 1100, lines: ["SPLAT! Who put a window there?", "I'm flat as a pancake! 🥞",
  "Ow! That word had a wall in it!", "I'm okay! The window is not. 🪟"] };
const BUDDY_TRICK_CHANCE = 0.35;

// Full-screen celebrations for long streaks (5 and 10 have their own looks)
const BUDDY_STREAK_SCENES = {
  15: { scene: "swarm", banner: "BEE SWARM!", line: "15 in a row! I called ALL my friends! 🐝🐝🐝" },
  20: { scene: "honey", banner: "HONEY OVERLOAD!", line: "20 in a row! It's raining honey! 🍯" },
  25: { scene: "bloom", banner: "FLOWER POWER!", line: "25 in a row! The whole garden is blooming! 🌻" }
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
    <g class="bb-sleep-eyes"><path d="M22 30q3 3 6 0M36 30q3 3 6 0"/></g>
    <g class="bb-zzz"><text x="50" y="12">z</text><text x="56" y="4">z</text><text x="61" y="-5">Z</text></g>
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
  if (mood === "evolve" && buddyMood !== "evolve") buddySfx("evolve");
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
    buddyFullScreen("party", `${stage.name}!`);
    return;
  }
  buddySpecialDay();
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
    const n = buddyStreak;
    // 15, 20, 25 in a row, then every 10 more: a full-screen show
    const show = BUDDY_STREAK_SCENES[n] || (n >= 30 && n % 10 === 0 && {
      scene: pickOne(["swarm", "honey", "bloom", "party"]),
      banner: "LEGENDARY!",
      line: `${n} in a row! Is that even allowed?! 🤯`
    });
    if (n === 5) setBuddy("happy", "5 in a row! Too cool for school 😎");
    else if (n === 10) setBuddy("happy", "10 in a row! I'm on fire! 🔥");
    else if (show) {
      setBuddy("party", show.line);
      buddyFullScreen(show.scene, show.banner);
    } else if (Math.random() < GOLDEN_BEE_CHANCE) setBuddy("happy", buddyGoldenBee());
    else if (/bee|buzz|honey|hive|pollen|nectar/i.test(entry.item.word)) {
      // Secret: a word with a bee (or bee things) in it
      setBuddy("happy", "");
      buddyTrick({ fx: "boing", ms: 900, lines: BUDDY_LINES.beeWord });
    } else if (Math.random() < BUDDY_TRICK_CHANCE) {
      setBuddy("happy", "");
      buddyTrick(BUDDY_TRICKS[Math.floor(Math.random() * BUDDY_TRICKS.length)]);
    } else setBuddy("happy", buddyPick("right"));
    if (n === 5 || n === 10 || show) buddyPop(1700); // the dance is 2 × 0.8s
    // A show plays its own sound (buddyFullScreen)
    if (n === 5) buddySfx("streak5");
    else if (n === 10) buddySfx("streak10");
    else if (!show) buddySfx("correct");
  } else {
    const hadShades = buddyStreak >= 5;
    buddyStreak = 0;
    buddySfx(entry.timedOut ? "timeUp" : "wrong");
    setBuddy("faint", hadShades ? "My shades! 😵 New streak, here we come." : buddyPick(entry.timedOut ? "timeUp" : "wrong"));
    if (hadShades) {
      buddySetStreakLook("drop");
      buddyPop(1300); // long enough to watch the shades fall
      return;
    }
    if (!entry.timedOut && Math.random() < 0.25) buddyTrick(BUDDY_SPLAT);
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

// Sound effects (sfx.js); does nothing if that file isn't loaded
function buddySfx(name) {
  if (typeof sfx === "function") sfx(name);
}

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
    setTimeout(remove, 5000); // in case the animation never ends (tab hidden)
  }
  buddyPop(4000); // while the golden bee crosses the screen
  buddySfx("correct");
  buddySfx("golden");
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

// A trick from BUDDY_TRICKS (or the splat): the bee plays it and says one of its lines
function buddyTrick(trick) {
  buddyFx(trick.fx, trick.ms, trick.lines[Math.floor(Math.random() * trick.lines.length)]);
  buddyPop(trick.ms);
}

/* ---------------------------
   Full-screen shows: a layer over the whole screen that never takes taps
   (pointer-events: none), so typing carries on underneath. One at a time,
   removed when done, skipped for reduced motion or a hidden tab.
--------------------------- */
let fxScreenOn = false;

const rand = (min, max) => min + Math.random() * (max - min);
function pickOne(list) { return list[Math.floor(Math.random() * list.length)]; }

function flyingBeeSvg() {
  return `<svg viewBox="0 0 64 64">
    <g class="gb-wings"><ellipse cx="22" cy="16" rx="9" ry="13" fill="#e0f2fe" fill-opacity="0.9" stroke="#7fb9e6" transform="rotate(-25 22 16)"/>
    <ellipse cx="42" cy="16" rx="9" ry="13" fill="#e0f2fe" fill-opacity="0.9" stroke="#7fb9e6" transform="rotate(25 42 16)"/></g>
    <ellipse cx="32" cy="36" rx="17" ry="19" fill="#fbbf24" stroke="#2b2233" stroke-width="2"/>
    <path d="M17 42q15 6 30 0M20 50q12 4 24 0" fill="none" stroke="#2b2233" stroke-width="4"/>
    <circle cx="26" cy="30" r="2.5" fill="#2b2233"/><circle cx="38" cy="30" r="2.5" fill="#2b2233"/>
    <path d="M27 36q5 4 10 0" fill="none" stroke="#2b2233" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

function fxSprite(parent, className, html, vars) {
  const el = document.createElement("div");
  el.className = className;
  el.innerHTML = html;
  for (const [name, value] of Object.entries(vars)) el.style.setProperty(`--${name}`, value);
  parent.append(el);
  return el;
}

// Each scene fills the layer (W × H px) and returns how long it lasts (ms)
const FX_SCENES = {
  // Bees zoom across from both sides
  swarm(layer, W, H) {
    for (let i = 0; i < 22; i++) {
      const size = rand(26, 56), leftToRight = i % 2 === 0;
      fxSprite(layer, "fx-bee", `<div class="gb-bob">${flyingBeeSvg()}</div>`, {
        y: `${rand(0.04, 0.85) * H}px`, sz: `${size}px`,
        from: `${leftToRight ? -size - 10 : W + 10}px`, to: `${leftToRight ? W + 10 : -size - 10}px`,
        d: `${rand(0, 1.5)}s`, dur: `${rand(3, 4.2)}s`
      });
    }
    return 6000;
  },
  // Honey oozes down from the top of the screen and drips
  honey(layer, W, H) {
    fxSprite(layer, "fx-honey-top", "", {});
    const drips = Math.max(8, Math.round(W / 40));
    for (let i = 0; i < drips; i++) {
      const w = rand(14, 30), len = rand(0.12, 0.5) * H, d = rand(0, 0.8);
      const x = (i + rand(0.1, 0.9)) * (W / drips) - w / 2;
      fxSprite(layer, "fx-drip", "", { x: `${x}px`, w: `${w}px`, len: `${len}px`, d: `${d}s` });
      fxSprite(layer, "fx-drop", "", { x: `${x + w / 2 - 6}px`, len: `${len}px`, fall: `${H}px`, d: `${d + 1.1}s` });
    }
    for (let i = 0; i < 3; i++) {
      fxSprite(layer, "fx-pot", "🍯", { x: `${rand(0.1, 0.8) * W}px`, fall: `${H}px`, d: `${0.4 + i * 0.5}s`, r: `${rand(-40, 40)}deg` });
    }
    return 3800;
  },
  // Confetti, flowers, bees and honey pots rain down
  party(layer, W, H) {
    const colors = ["#fbbf24", "#f472b6", "#60a5fa", "#34d399", "#a78bfa", "#fb923c"];
    for (let i = 0; i < 46; i++) {
      const emoji = i % 3 === 0;
      fxSprite(layer, emoji ? "fx-fall fx-fall-emoji" : "fx-fall", emoji ? pickOne(["🐝", "🌼", "🌸", "🍯", "⭐", "🎉"]) : "", {
        x: `${rand(0, W)}px`, dx: `${rand(-60, 60)}px`, fall: `${H + 40}px`, r: `${rand(-540, 540)}deg`,
        d: `${rand(0, 1.3)}s`, dur: `${rand(1.8, 2.8)}s`, c: pickOne(colors)
      });
    }
    return 3800;
  },
  // Flowers pop up along the bottom and sway, and a few bees come to visit
  bloom(layer, W, H) {
    const flowers = Math.max(10, Math.round(W / 34));
    for (let i = 0; i < flowers; i++) {
      const size = rand(34, 58);
      fxSprite(layer, "fx-flower", pickOne(["🌻", "🌼", "🌷", "🌸", "🌺"]), {
        x: `${(i + rand(0, 0.6)) * (W / flowers) - size / 3}px`, y: `${H - size - rand(0, 0.25) * H}px`,
        sz: `${size}px`, d: `${rand(0, 1)}s`
      });
    }
    for (let i = 0; i < 6; i++) {
      const leftToRight = i % 2 === 0;
      fxSprite(layer, "fx-bee", `<div class="gb-bob">${flyingBeeSvg()}</div>`, {
        y: `${rand(0.45, 0.7) * H}px`, sz: "36px",
        from: `${leftToRight ? -46 : W + 10}px`, to: `${leftToRight ? W + 10 : -46}px`,
        d: `${0.8 + i * 0.3}s`, dur: `${rand(3.2, 4)}s`
      });
    }
    return 6600;
  }
};

function buddyFullScreen(scene, banner) {
  if (reducedMotion() || document.hidden || fxScreenOn) return false;
  // The visible area, so it isn't hidden behind the phone's keyboard
  const vv = window.visualViewport;
  const W = vv ? vv.width : window.innerWidth;
  const H = vv ? vv.height : window.innerHeight;
  const layer = document.createElement("div");
  layer.className = `fx-screen fx-${scene}`;
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, { top: `${vv ? vv.offsetTop : 0}px`, left: `${vv ? vv.offsetLeft : 0}px`, width: `${W}px`, height: `${H}px` });
  const ms = FX_SCENES[scene](layer, W, H);
  layer.style.setProperty("--ms", `${ms}ms`);
  if (banner) fxSprite(layer, "fx-banner", "", {}).textContent = banner;
  document.body.append(layer);
  fxScreenOn = true;
  buddySfx(scene);
  setTimeout(() => { layer.remove(); fxScreenOn = false; }, ms + 100);
  return true;
}

/* ---------------------------
   Secrets: hidden surprises with no button or hint, for her to discover.
   - Tap the speech bubble: the bee tells a joke
   - Hold the bee for a second: it falls asleep (tap to wake it)
   - Tap the bee 25 times fast: a secret bee swarm
   - Spell a word with "bee", "buzz", "honey"... in it right: the bee notices
   - Special days on the start screen: April Fools', Halloween, Christmas...
   - On a computer keyboard (not while typing an answer), type "buzz",
     "honey", "bloom" or "party"
--------------------------- */
const BUDDY_SECRET_WORDS = { buzz: "swarm", honey: "honey", bloom: "bloom", party: "party" };
let buddyHoldTimer = null;
let buddyAllTaps = [];
let buddyKeys = "";

// Start screen line (and look) for special days and late nights
function buddySpecialDay(now = new Date()) {
  const md = `${now.getMonth() + 1}-${now.getDate()}`;
  const hour = now.getHours();
  const days = {
    "1-1": "Happy New Year! 🎆 New year, new words!",
    "2-14": "Happy Valentine's Day! You're my honey! 💛",
    "3-14": "Happy Pi Day! I prefer honey pie. 🥧",
    "4-1": "April Fools! 🙃 (Tap me to flip me back!)",
    "5-20": "It's World Bee Day! That's MY day! 🐝🎉",
    "10-31": "Boo-zz! 👻 Happy Halloween!",
    "12-24": "Merry Bee-mas Eve! 🎄",
    "12-25": "Merry Bee-mas! 🎁"
  };
  if (days[md]) {
    setBuddy("idle", days[md]);
    if (md === "4-1") buddyFx("upside", 60000, days[md]);
    if (md === "1-1" || md === "5-20") buddyFullScreen("party", md === "1-1" ? "HAPPY NEW YEAR!" : "WORLD BEE DAY!");
  } else if (hour >= 21 || hour < 5) {
    setBuddy("idle", pickOne(["Yawn... it's past MY bedtime! 🌙", "Late-night spelling? Bee-sides, I'm a night owl. 🦉"]));
  } else setBuddy("idle", "");
}

function buddyJoke(event) {
  event.preventDefault(); // keep the phone's keyboard open
  buddyTrick({ fx: "boing", ms: 900, lines: [buddyPick("jokes")] });
}

function buddyHoldStart() {
  clearTimeout(buddyHoldTimer);
  buddyHoldTimer = setTimeout(() => buddyFx("sleep", 8000, "Zzz... 💤"), 900);
}

function buddyHoldEnd() { clearTimeout(buddyHoldTimer); }

// Typing a secret word on a keyboard, anywhere except an answer box
function buddySecretKey(event) {
  const target = event.target;
  if (target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (event.key.length !== 1 || !/[a-z]/i.test(event.key)) return;
  buddyKeys = (buddyKeys + event.key.toLowerCase()).slice(-8);
  const word = Object.keys(BUDDY_SECRET_WORDS).find(w => buddyKeys.endsWith(w));
  if (!word) return;
  buddyKeys = "";
  if (buddyFullScreen(BUDDY_SECRET_WORDS[word], `${word.toUpperCase()}!`)) buddySay("🤫 You found a secret!");
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
  buddySfx(fx); // tricks, splat, tickle, dizzy, sleep
  clearTimeout(buddyFxTimer);
  buddyFxTimer = setTimeout(() => delete el.dataset.fx, ms);
}

function buddyTickle() {
  const el = document.getElementById("beeBuddy");
  const now = Date.now();
  buddyHoldStart();
  // Asleep, or upside down on April Fools': a tap puts it right
  if (el.dataset.fx === "sleep" || el.dataset.fx === "upside") {
    buddyFx("tickle", 650, el.dataset.fx === "sleep" ? buddyPick("wake") : "Phew! Much better. 😵‍💫");
    buddyTaps = [];
    return;
  }
  // Secret: 25 taps in 10 seconds summons the swarm
  buddyAllTaps = [...buddyAllTaps.filter(t => now - t < 10000), now];
  if (buddyAllTaps.length >= 25 && buddyFullScreen("swarm", "SWARM SUMMONED!")) {
    buddyAllTaps = [];
    buddyFx("dizzy", 2600, "You summoned the swarm! 🐝🐝🐝");
    buddyPop(2600);
    return;
  }
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
  for (const type of ["pointerup", "pointerleave", "pointercancel"]) figure.addEventListener(type, buddyHoldEnd);
  figure.addEventListener("contextmenu", event => event.preventDefault()); // a long press isn't a right-click
  const speech = document.getElementById("beeBuddySpeech");
  speech.addEventListener("pointerdown", buddyJoke);
  speech.addEventListener("mousedown", event => event.preventDefault());
  document.addEventListener("keydown", buddySecretKey);
});

function buddyResults(answered, pct) {
  document.getElementById("beeBuddy").classList.remove("compact");
  if (!answered) setBuddy("idle", buddyPick("ended"));
  else if (pct === 100) {
    setBuddy("party", buddyPick("perfect"));
    // The party show brings its own fanfare
    if (!(answered >= 5 && buddyFullScreen("party", "PERFECT!"))) buddySfx("perfect");
  }
  else if (pct >= 80) {
    setBuddy("happy", buddyPick("great"));
    buddySfx("great");
  }
  else {
    setBuddy("idle", buddyPick("keepGoing"));
    buddySfx("keepGoing");
  }
}
