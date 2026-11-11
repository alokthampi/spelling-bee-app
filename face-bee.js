/* ---------------------------
   Face bee: a bee with her own photo for a head. It turns up only now and
   then, on top of the usual bees (which stay as they are):
   - Practice, right answer (1 in 15): it loops across the screen
   - Practice, wrong answer (1 in 6): it drops in from a top corner and
     blows a raspberry at the tricky word (the joke is on the word, never on her)
   - Learning: 1 in 4 corner visits is the face bee, dropping in from the
     top right or left (learn-bee.js)
   - Tap the Practice bee 10 times fast: instead of just getting dizzy, it
     spins into the face bee for a moment
   - Full-screen swarms have a few face bees in them
   - Secret: type "selfie" on a keyboard for a face-bee swarm with a camera flash
   Everything here is decoration: aria-hidden, never takes taps, skipped for
   reduced motion. Uses bee-buddy.js (FX_SCENES, fxSprite, rand, pickOne,
   reducedMotion, buddySfx, BUDDY_SECRET_WORDS).
--------------------------- */
// Photo 1: crossed eyes and tongue out. Photo 2: big pout under a bow.
const FACE_BEE_PHOTOS = ["bee-faces/face-1.jpg", "bee-faces/face-2.jpg"];
const FACE_BEE_RIGHT_CHANCE = 1 / 15;
const FACE_BEE_WRONG_CHANCE = 1 / 6;
const FACE_BEE_LEARN_CHANCE = 1 / 4;

const FACE_BEE_LINES = {
  right: ["Bzz! The REAL spelling bee is here! 🐝", "Who's that bee? It's YOU! 😜", "Spelled it! Now I'm doing a victory lap!",
    "Wheee! Best bee in the hive! 👑", "Loop-de-loop for that word! 🎢", "Bee-ware: genius speller flying by!"],
  // Matched to each photo's face
  wrong: [
    ["Pbbbt! 😛 Silly word!", "Pbbbt! That word is a stinker! 😛", "Bleh! Who spelled THAT word like that?! 😛"],
    ["Hmph! That word was rude! 😤", "Pouting at that word. Hmph! 😤", "That word owes me a cookie! 😤"]
  ]
};
// What the Practice bee says when the face bee zooms past
const FACE_BEE_BUDDY_LINES = ["Whoa! Who's THAT bee?! 😲", "Hey, she looks familiar! 🤔", "Wait... is that YOU?! 😆"];

let faceBeeId = 0;

// A striped bee body, wings and antennae, with a round photo for a head.
// viewBox 80 × 96; `photo` = 0 or 1; `cls` goes on the <svg>.
function faceBeeSvg(photo = Math.floor(Math.random() * FACE_BEE_PHOTOS.length), cls = "") {
  const clip = `fb-clip-${++faceBeeId}`;
  return `<svg class="face-bee-svg ${cls}" viewBox="0 0 80 96" aria-hidden="true">
    <defs><clipPath id="${clip}"><circle cx="40" cy="32" r="26"/></clipPath></defs>
    <g class="gb-wings">
      <ellipse cx="17" cy="56" rx="11" ry="16" fill="#e0f2fe" fill-opacity="0.85" stroke="#7fb9e6" transform="rotate(-35 17 56)"/>
      <ellipse cx="63" cy="56" rx="11" ry="16" fill="#e0f2fe" fill-opacity="0.85" stroke="#7fb9e6" transform="rotate(35 63 56)"/>
    </g>
    <path d="M40 94l-4-6h8z" fill="#2b2233"/>
    <ellipse cx="40" cy="70" rx="16" ry="19" fill="#fbbf24" stroke="#2b2233" stroke-width="2"/>
    <path d="M25 70q15 6 30 0M28 80q12 5 24 0" fill="none" stroke="#2b2233" stroke-width="4.5"/>
    <path d="M30 8q-4-7-10-9M50 8q4-7 10-9" fill="none" stroke="#2b2233" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="20" cy="-1" r="3" fill="#2b2233"/><circle cx="60" cy="-1" r="3" fill="#2b2233"/>
    <circle cx="40" cy="32" r="28" fill="#fbbf24" stroke="#2b2233" stroke-width="2"/>
    <image href="${FACE_BEE_PHOTOS[photo]}" x="14" y="6" width="52" height="52" clip-path="url(#${clip})" preserveAspectRatio="xMidYMid slice"/>
  </svg>`;
}

function faceBeeRemoveLater(el, ms) {
  const remove = () => el.remove();
  el.addEventListener("animationend", event => { if (event.target === el) remove(); });
  setTimeout(remove, ms); // in case the animation never ends (tab hidden)
}

// Right answer: the face bee loops across the screen with a line.
// Returns what the Practice bee says, or "" when it didn't fly.
function faceBeeFlyby() {
  if (reducedMotion() || document.hidden || document.querySelector(".face-bee-fly, .fx-screen")) return "";
  const el = document.createElement("div");
  el.className = "face-bee-fly";
  el.setAttribute("aria-hidden", "true");
  el.style.top = `${18 + Math.random() * 30}vh`;
  el.innerHTML = `<p class="fbf-speech"></p><div class="fbf-loop"><div class="gb-bob">${faceBeeSvg()}</div></div>`;
  el.querySelector(".fbf-speech").textContent = pickOne(FACE_BEE_LINES.right);
  document.body.append(el);
  faceBeeRemoveLater(el, 7000);
  buddySfx("loop");
  return pickOne(FACE_BEE_BUDDY_LINES);
}

// Wrong answer: the face bee drops in from a top corner, blows a raspberry at the word and flies back up
function faceBeeRaspberry() {
  if (reducedMotion() || document.hidden || document.querySelector(".face-bee-pop")) return;
  const photo = Math.floor(Math.random() * FACE_BEE_PHOTOS.length);
  const el = document.createElement("div");
  el.className = Math.random() < 0.5 ? "face-bee-pop" : "face-bee-pop fbp-right"; // top-left or top-right
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<div class="fbp-figure">${faceBeeSvg(photo)}</div><p class="fbp-speech"></p>`;
  el.querySelector(".fbp-speech").textContent = pickOne(FACE_BEE_LINES.wrong[photo]);
  document.body.append(el);
  faceBeeRemoveLater(el, 4500);
  buddySfx("raspberry");
}

// Answer hooks for bee-buddy.js. Right: the Practice bee's line when the
// face bee flew ("" when it didn't). Wrong: true when it popped up.
function faceBeeOnRight() {
  if (Math.random() >= FACE_BEE_RIGHT_CHANCE) return "";
  return faceBeeFlyby();
}

function faceBeeOnWrong() {
  if (Math.random() >= FACE_BEE_WRONG_CHANCE) return false;
  faceBeeRaspberry();
  return true;
}

// 10 quick taps on the Practice bee: it spins into the face bee for `ms`,
// then turns back into whatever stage it was. Returns its line.
let faceBeeSwapTimer = null;
const FACE_BEE_DIZZY_LINES = ["Whoa... I spun so fast I turned into YOU! 😵‍💫", "Too many spins! Now I look like you! 😜",
  "Dizzy... wait, why do I have your face?! 😲"];

function faceBeeBuddySwap(ms) {
  const fig = document.getElementById("beeBuddyFigure");
  if (!fig) return "";
  const saved = fig.innerHTML;
  // Nested <svg>: fills the buddy's 64 × 64 figure, so its sizes and animations carry on as usual
  fig.innerHTML = faceBeeSvg();
  clearTimeout(faceBeeSwapTimer);
  faceBeeSwapTimer = setTimeout(() => {
    // Only if nothing else redrew the bee meanwhile (e.g. it grew a stage)
    if (fig.querySelector(".face-bee-svg")) fig.innerHTML = saved;
  }, ms);
  return pickOne(FACE_BEE_DIZZY_LINES);
}

// Full-screen show for the "selfie" secret: a camera flash, then face bees everywhere
FX_SCENES.selfie = function (layer, W, H) {
  fxSprite(layer, "fx-flash", "", {});
  for (let i = 0; i < 14; i++) {
    const size = rand(48, 84), leftToRight = i % 2 === 0;
    fxSprite(layer, "fx-bee fx-face-bee", `<div class="gb-bob">${faceBeeSvg(i % FACE_BEE_PHOTOS.length)}</div>`, {
      y: `${rand(0.04, 0.8) * H}px`, sz: `${size}px`,
      from: `${leftToRight ? -size - 10 : W + 10}px`, to: `${leftToRight ? W + 10 : -size - 10}px`,
      d: `${0.4 + rand(0, 1.6)}s`, dur: `${rand(3, 4.2)}s`
    });
  }
  return 6200;
};
BUDDY_SECRET_WORDS.selfie = "selfie";

// A few face bees mixed into the regular swarm
const faceBeeSwarm = FX_SCENES.swarm;
FX_SCENES.swarm = function (layer, W, H) {
  const ms = faceBeeSwarm(layer, W, H);
  for (let i = 0; i < 3; i++) {
    const size = rand(50, 70), leftToRight = i % 2 === 1;
    fxSprite(layer, "fx-bee fx-face-bee", `<div class="gb-bob">${faceBeeSvg(i % FACE_BEE_PHOTOS.length)}</div>`, {
      y: `${rand(0.1, 0.75) * H}px`, sz: `${size}px`,
      from: `${leftToRight ? -size - 10 : W + 10}px`, to: `${leftToRight ? W + 10 : -size - 10}px`,
      d: `${rand(0.3, 1.8)}s`, dur: `${rand(3.2, 4.2)}s`
    });
  }
  return ms;
};
