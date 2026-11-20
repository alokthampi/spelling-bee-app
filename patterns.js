/* ---------------------------
   Roots and spelling patterns:
   - Word parts: the word's Greek and Latin roots on the Learning card, with
     what they mean and other words that share them (word_roots.json, made by
     tag_roots.py)
   - Pattern drills: fill in the letters a language's spelling rule decides
     ("Greek: __ysical, ph or f?"), from the card's tips or from Stats
   - Stats > Spelling patterns: the rules the speller's misspellings keep
     touching, worked out from the practice history already saved (nothing new
     is stored)
   Uses spelling-help.js (spellingTips, spellingDiff, mistakePositions) and
   app.js / practice.js globals; everything here runs after they load.
--------------------------- */

const WORD_ROOTS_FILE = "word_roots.json?v=2026111803";
let wordRoots = null;        // { roots: { id: {root, lang, meaning} }, words: { word: [[id, start, end]] } }
let rootIndex = null;        // root id -> words that have it

async function loadWordRoots() {
  try {
    const r = await fetch(WORD_ROOTS_FILE);
    if (!r.ok) throw new Error(`${WORD_ROOTS_FILE}: HTTP ${r.status}`);
    wordRoots = await r.json();
  } catch (err) {
    console.error("Could not load word roots:", err);
    wordRoots = { roots: {}, words: {} };
  }
  rootIndex = new Map();
  Object.entries(wordRoots.words).forEach(([word, parts]) => {
    parts.forEach(([id]) => {
      if (!rootIndex.has(id)) rootIndex.set(id, []);
      rootIndex.get(id).push(word);
    });
  });
  // The card may already show a word that was picked before the roots arrived
  if (typeof currentItem !== "undefined" && currentItem) renderWordParts(currentItem);
  // A refresh on the Roots tab opened it before the roots arrived
  if (typeof activeTab !== "undefined" && activeTab === "roots") renderRootsTab();
}
loadWordRoots();

function rootLangLabel(lang) {
  return lang === "Greek/Latin" ? "Greek & Latin" : lang;
}

/* The word cut into pieces: roots, the linking vowel between two roots (Greek
   o, Latin i) and the letters in between.
   [{ text, root: {id, root, lang, meaning} } | { text, glue: "Greek" } | { text }] */
function wordPieces(item) {
  const parts = wordRoots?.words[item?.word];
  if (!parts) return null;
  const chars = [...item.word];
  const pieces = [];
  let at = 0;
  parts.forEach(([id, start, end], n) => {
    const root = { id, ...wordRoots.roots[id] };
    if (start > at) {
      const text = chars.slice(at, start).join("");
      const prev = pieces[pieces.length - 1]?.root;
      // One o (Greek) or i (Latin) between two roots joins them
      const glue = n > 0 && start - at === 1 && prev && (
        (text.toLowerCase() === "o" && prev.lang.includes("Greek") && root.lang.includes("Greek")) ? "Greek" :
        (text.toLowerCase() === "i" && prev.lang.includes("Latin") && root.lang.includes("Latin")) ? "Latin" : "");
      pieces.push(glue ? { text, glue } : { text });
    }
    pieces.push({ text: chars.slice(start, end).join(""), root });
    at = end;
  });
  if (at < chars.length) pieces.push({ text: chars.slice(at).join("") });
  return pieces;
}

const SEE_ALSO_MAX = 6;

function sameScope(word, item) {
  return words.some(x => x.word === word && x._scope === item._scope) ? 1 : 0;
}

/* Open a study word on the Learning card from Word parts or the Roots tab.
   Its scope and difficulty get ticked first if the filters were hiding it,
   and the letter filter is cleared if that still hides it. */
function openRootWord(word, preferScope) {
  const matches = words.filter(x => x.word === word);
  const item = matches.find(x => x._scope === preferScope) || matches[0];
  if (!item) return;
  [["scopeFilter", item._scope], ["difficultyFilter", item.difficulty]].forEach(([id, value]) => {
    const box = document.querySelector(`#${id} input[value="${value}"]`);
    if (box && !box.checked) {
      box.checked = true;
      if (typeof updateMultiSelectSummary === "function") updateMultiSelectSummary(document.getElementById(id));
    }
  });
  showWordInLearning(word);
  if (currentItem?.word !== word && window.selectedLetters?.size) {
    window.selectedLetters.clear();
    showWordInLearning(word);
  }
}

/* Learning card: "Word parts" under the spelling tips */
function renderWordParts(item) {
  const section = document.getElementById("wordPartsSection");
  if (!section) return;
  const pieces = item ? wordPieces(item) : null;
  section.hidden = !pieces;
  if (!pieces) return;

  const line = document.getElementById("wordPartsLine");
  line.replaceChildren(...pieces.map(piece => {
    const el = document.createElement("span");
    if (piece.root) {
      el.className = `wp-root wp-${piece.root.lang.includes("Greek") ? "greek" : "latin"}`;
      const letters = document.createElement("b");
      letters.textContent = piece.text;
      const meaning = document.createElement("small");
      meaning.textContent = piece.root.meaning.split(";")[0];
      el.append(letters, meaning);
      el.title = `${rootLangLabel(piece.root.lang)} ${piece.root.root}: “${piece.root.meaning}”`;
    } else if (piece.glue) {
      el.className = "wp-glue";
      el.textContent = piece.text;
      el.title = piece.glue === "Greek" ? "Greek roots are usually joined with an o" : "Latin roots are usually joined with an i";
    } else {
      el.className = "wp-rest";
      el.textContent = piece.text;
    }
    return el;
  }));

  const list = document.getElementById("wordPartsList");
  const items = pieces.filter(p => p.root).map(({ root }) => {
    const li = document.createElement("li");
    const lang = document.createElement("span");
    lang.className = "tip-lang";
    lang.textContent = rootLangLabel(root.lang);
    const letters = document.createElement("b");
    letters.className = "tip-letters";
    letters.textContent = root.root;
    li.append(lang, letters, `means “${root.meaning}”.`);
    if (root.common?.length) li.append(` As in ${root.common.slice(0, 3).join(", ")}.`);
    // Other study words with this root, this word's scope first
    const others = (rootIndex?.get(root.id) || []).filter(w => w !== item.word)
      .sort((a, b) => sameScope(b, item) - sameScope(a, item));
    if (others.length) {
      const also = document.createElement("div");
      also.className = "wp-also";
      also.append(others.length > SEE_ALSO_MAX ? `Also in ${others.length} words, like ` : "Also in ");
      others.slice(0, SEE_ALSO_MAX).forEach((w, i) => {
        if (i) also.append(", ");
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "wp-word";
        btn.textContent = w;
        btn.addEventListener("click", () => openRootWord(w, item._scope));
        also.append(btn);
      });
      li.append(also);
    }
    return li;
  });
  const glues = [...new Set(pieces.filter(p => p.glue).map(p => p.glue))];
  glues.forEach(glue => {
    const li = document.createElement("li");
    li.className = "wp-glue-note";
    const letters = document.createElement("b");
    letters.className = "tip-letters";
    letters.textContent = glue === "Greek" ? "o" : "i";
    li.append(letters, glue === "Greek"
      ? "joins the Greek roots. Greek roots are usually linked with o (hydr·o·phobia), Latin ones with i."
      : "joins the Latin roots. Latin roots are usually linked with i (frug·i·vore), Greek ones with o.");
    items.push(li);
  });
  list.replaceChildren(...items);
}

/* ---------------------------
   Pattern rules across all the words
--------------------------- */
const patternTipCache = new WeakMap(); // word -> its pattern tips (the ones with letters)

function patternTipsOf(item) {
  let tips = patternTipCache.get(item);
  if (!tips) {
    tips = spellingTips(item, 99).filter(t => t.start !== undefined);
    patternTipCache.set(item, tips);
  }
  return tips;
}

// rule id -> { id, lang, text, entries: [{ item, start, end }] }, one entry per word
function patternRule(id) {
  const rule = { id, lang: "", text: "", entries: [] };
  const seen = new Set();
  words.forEach(item => {
    const key = item.word.toLowerCase();
    if (seen.has(key)) return; // the same word in School and Regional
    const tip = patternTipsOf(item).find(t => t.id === id);
    if (!tip) return;
    seen.add(key);
    if (!rule.text) Object.assign(rule, { lang: tip.lang, text: tip.text });
    rule.entries.push({ item, start: tip.start, end: tip.end, alts: tip.alts });
  });
  return rule;
}

/* ---------------------------
   Pattern drill: a pop-up of up to 10 "which letters go here?" questions
--------------------------- */
const DRILL_LENGTH = 10;

// Wrong answers that sound right, for each group of letters a rule decides
// ("ph" could be heard as "f" or "ff"). Most useful first; at most 3 are used.
// Doubled letters, silent letters and lone vowels are handled after these.
const SOUND_ALIKES = {
  ph: ["f", "ff"], rh: ["r"], y: ["i"], eu: ["u", "yu"], ch: ["k", "c", "sh"], sch: ["sh", "sk"],
  graph: ["graf"], gram: ["gramm", "grame"], logy: ["logie", "lojy"], ism: ["izm", "ysm"],
  tion: ["sion", "cian", "shun"], sion: ["tion", "shun", "cian"], cian: ["tion", "sian", "shan"],
  ible: ["able"], able: ["ible"], ance: ["ence"], ence: ["ance"], ancy: ["ency"], ency: ["ancy"],
  ant: ["ent"], ent: ["ant"], ous: ["us"],
  que: ["k", "ck", "c"], gue: ["g", "gg"], ette: ["et", "ett"], eau: ["o", "ow", "oh"], eur: ["er", "ure", "ur"],
  oi: ["wa", "oy"], ou: ["oo", "u"], age: ["aj", "aje"], et: ["ay", "ett"],
  eigh: ["ay", "a"], igh: ["i", "y", "ie"], ough: ["uff", "off", "ow"], augh: ["aff", "off"],
  tch: ["ch", "sh"], dge: ["ge", "j"], ck: ["k", "c"], wh: ["w"], sk: ["sc"],
  zz: ["z", "tz"], gh: ["g"], c: ["ch", "cc"], qu: ["k", "c", "kw"], ll: ["y", "l"], rr: ["r"], j: ["h"],
  ei: ["i", "ie", "y"], ie: ["ee", "ei"], oo: ["o", "u"], aa: ["a", "ah"], al: ["el", "all"]
};
const VOWEL_ALIKES = { a: ["e", "o"], e: ["a", "i"], i: ["e", "y"], o: ["a", "u"], u: ["o"] };

function drillOptions(entry) {
  const chars = [...entry.item.word];
  const right = chars.slice(entry.start, entry.end).join("").toLowerCase();
  const accepted = new Set(acceptedSpellings(entry.item).map(normalizeSpelling));
  const wrong = [];
  const add = letters => {
    if (letters === right || wrong.includes(letters) || wrong.length >= 3) return;
    // Not a wrong answer if it makes one of the word's accepted spellings
    const whole = [...chars.slice(0, entry.start), letters, ...chars.slice(entry.end)].join("");
    if (!accepted.has(normalizeSpelling(whole))) wrong.push(letters);
  };
  // The rule's own sound-alikes first (spelling-help.js alts), then the general ones
  [...(entry.alts || []), ...(SOUND_ALIKES[right] || [])].forEach(add);
  if (/^([a-z])\1$/.test(right)) add(right[0]);                            // tt -> t
  else if (entry.start === 0 && /^[kgpw]$/.test(right) && /[nrst]/.test(chars[1] || ""))
    add("");                                                                // a silent first letter: knit, wrong, psychology
  else if (/^[bdgkpt]h$/.test(right)) add(right[0]);                       // Sanskrit bh, dh, th: drop the puff of air
  else if (/^[bcdfgklmnprstvz]$/.test(right)) add(right + right);          // t -> tt
  (VOWEL_ALIKES[right] || []).forEach(add);                                 // the vowel at the end of an Italian word
  if (!wrong.length) return null;
  const options = [right, ...wrong];
  shuffleArray(options);
  return { right, options };
}

let drill = null; // { rule, questions: [{ entry, right, options, picked }], index }

function drillQuestions(rule, firstItem) {
  const entries = rule.entries.slice();
  shuffleArray(entries);
  // Opened from a word's card: that word first
  const first = entries.findIndex(e => e.item.word === firstItem?.word);
  if (first > 0) entries.unshift(...entries.splice(first, 1));
  const questions = [];
  for (const entry of entries) {
    const opts = drillOptions(entry);
    if (opts) questions.push({ entry, ...opts, picked: null });
    if (questions.length >= DRILL_LENGTH) break;
  }
  return questions;
}

function openPatternDrill(ruleId, firstItem = null) {
  const rule = patternRule(ruleId);
  const questions = drillQuestions(rule, firstItem);
  if (!questions.length) return;
  stopAllAudio();
  drill = { rule, questions, index: 0, firstItem };
  renderDrill();
  const dialog = document.getElementById("drillDialog");
  if (!dialog.open) dialog.showModal();
}

function drillEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}

function drillButton(className, icon, text, onClick) {
  const btn = drillEl("button", className);
  btn.type = "button";
  setIconText(btn, icon, text);
  btn.addEventListener("click", onClick);
  return btn;
}

function renderDrill() {
  const dialog = document.getElementById("drillDialog");
  const { rule, questions, index } = drill;
  const top = drillEl("div", "drill-top");
  top.append(drillEl("span", "tip-lang", rule.lang));
  top.append(drillEl("span", "drill-count", index < questions.length ? `${index + 1} of ${questions.length}` : "Done"));
  const close = drillEl("button", "drill-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", "Close the drill");
  close.addEventListener("click", () => dialog.close());
  top.append(close);

  if (index >= questions.length) {
    const right = questions.filter(q => q.picked === q.right).length;
    const title = drillEl("h3", "", right === questions.length ? "All right!" : `${right} of ${questions.length} right`);
    title.id = "drillTitle";
    const rule_ = drillEl("p", "drill-rule", rule.text);
    const actions = drillEl("div", "drill-actions");
    actions.append(
      drillButton("primary-btn", "repeat", "Drill again", () => openPatternDrill(rule.id)),
      drillButton("reset-btn", "check", "Done", () => dialog.close()));
    dialog.replaceChildren(top, title, rule_, actions);
    actions.querySelector("button").focus();
    return;
  }

  const q = questions[index];
  const chars = [...q.entry.item.word];
  const title = drillEl("h3", "", "Which letters fill the gap?");
  title.id = "drillTitle";
  const word = drillEl("div", "drill-word");
  const answered = q.picked !== null;
  const gap = answered
    ? drillEl("span", `drill-gap filled ${q.picked === q.right ? "right" : "wrong"}`, chars.slice(q.entry.start, q.entry.end).join(""))
    : drillEl("span", "drill-gap", "?");
  word.append(chars.slice(0, q.entry.start).join(""), gap, chars.slice(q.entry.end).join(""));
  const def = drillEl("p", "drill-def", q.entry.item.definition || "");
  const hear = drillButton("reset-btn drill-hear", "volume", "Hear it", () =>
    playMWSequence(recordedPronunciations(q.entry.item), q.entry.item.word));

  const options = drillEl("div", "drill-options");
  q.options.forEach(letters => {
    const btn = drillEl("button", "drill-option", letters || "(no letter)");
    btn.type = "button";
    if (answered) {
      btn.disabled = true;
      if (letters === q.right) btn.classList.add("right");
      else if (letters === q.picked) btn.classList.add("wrong");
    }
    btn.addEventListener("click", () => {
      q.picked = letters;
      if (typeof sfx === "function") sfx(letters === q.right ? "correct" : "wrong");
      renderDrill();
    });
    options.append(btn);
  });

  const parts = [top, title, word, def, hear, options];
  if (answered) {
    const after = drillEl("div", `drill-after ${q.picked === q.right ? "right" : "wrong"}`);
    after.append(drillEl("strong", "", q.picked === q.right ? "Right!" : q.right ? `It's “${q.right}”.` : "No letter there."), " ", rule.text);
    const next = drillButton("primary-btn", "play", index + 1 < questions.length ? "Next" : "See score", () => {
      drill.index++;
      renderDrill();
    });
    parts.push(after, next);
    dialog.replaceChildren(...parts);
    next.focus();
  } else {
    dialog.replaceChildren(...parts);
    options.querySelector("button").focus();
  }
}

/* The card's tips get a "Drill" button for each pattern rule (not for the
   general language tip, which has no letters to fill in) */
function addDrillButtons(list, tips, item) {
  [...list.children].forEach((li, i) => {
    const tip = tips[i];
    if (!tip || tip.start === undefined) return;
    li.append(drillButton("link-btn tip-drill", "target", "Drill this pattern", () => openPatternDrill(tip.id, item)));
  });
}

/* ---------------------------
   Stats > Spelling patterns: which rules the misspellings touched. Each word
   keeps its last few misspellings (practice.misspellings), so this looks at
   recent slips, not every one ever made.
--------------------------- */
const PATTERN_ROWS = 8;

function patternStats(scopeWords) {
  const stats = new Map();
  scopeWords.forEach(w => {
    if (!w.practice.attempts) return;
    const tips = patternTipsOf(w);
    if (!tips.length) return;
    const slips = (w.practice.misspellings || []).map(m => mistakePositions(spellingDiff(w.word, m.typed)));
    tips.forEach(tip => {
      let s = stats.get(tip.id);
      if (!s) {
        s = { id: tip.id, lang: tip.lang, text: tip.text, letters: new Map(), words: 0, slips: 0, slipWords: 0 };
        stats.set(tip.id, s);
      }
      s.words++;
      const letters = tip.letters.toLowerCase();
      s.letters.set(letters, (s.letters.get(letters) || 0) + 1);
      const hits = slips.filter(at => { for (let k = tip.start; k < tip.end; k++) if (at.has(k)) return true; return false; }).length;
      s.slips += hits;
      if (hits) s.slipWords++;
    });
  });
  return [...stats.values()];
}

// The words a pattern test would use: in these filters, and learned or
// practiced already (Practice's 50-word lock is about unlearned words)
function patternPracticeWords(scopeWords, ruleId) {
  return scopeWords.filter(w => (w.covered || w.practice.attempts) && patternTipsOf(w).some(t => t.id === ruleId));
}

function commonLetters(s) {
  return [...s.letters.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

function patternStatsHtml(scopeWords) {
  const all = patternStats(scopeWords);
  const slipped = all.filter(s => s.slips)
    .sort((a, b) => b.slipWords - a.slipWords || b.slips - a.slips || b.words - a.words)
    .slice(0, PATTERN_ROWS);
  const solid = all.filter(s => !s.slips && s.words >= 5).sort((a, b) => b.words - a.words).slice(0, 4);

  const rows = slipped.map(s => {
    const count = patternPracticeWords(scopeWords, s.id).length;
    return `
      <div class="pattern-row">
        <div class="pattern-rule">
          <span class="tip-lang">${escapeHtml(s.lang)}</span><b class="tip-letters">${escapeHtml(commonLetters(s))}</b>${escapeHtml(s.text)}
        </div>
        <div class="pattern-meta">Slipped in ${s.slipWords} of ${s.words} practiced word${s.words === 1 ? "" : "s"}${s.slips > s.slipWords ? ` (${s.slips} times)` : ""}</div>
        <div class="pattern-actions">
          <button type="button" class="reset-btn pattern-drill" data-rule="${escapeHtml(s.id)}">${iconSvg("target")}Drill</button>
          <button type="button" class="reset-btn pattern-practice" data-rule="${escapeHtml(s.id)}" ${count ? "" : "disabled title=\"Learn some of these words first\""}>${iconSvg("pen")}Practice ${count} word${count === 1 ? "" : "s"}</button>
        </div>
      </div>`;
  }).join("");
  const solidHtml = solid.length
    ? `<div class="pattern-solid">No slips yet: ${solid.map(s =>
        `<span class="pattern-chip" title="${escapeHtml(s.text)}">${escapeHtml(s.lang)} <b>${escapeHtml(commonLetters(s))}</b> · ${s.words}</span>`).join(" ")}</div>`
    : "";
  const body = rows || (all.length
    ? `<div class="stats-empty">No recent misspellings land on a spelling pattern. Nice!</div>`
    : `<div class="stats-empty">Practice some words to see which spelling patterns trip you up.</div>`);
  return `
    <div class="stat-section">
      <h3>Spelling patterns</h3>
      <p class="pattern-intro">Language rules your recent misspellings got wrong, from each word's last ${typeof MAX_MISSPELLINGS === "number" ? MAX_MISSPELLINGS : 3} misspellings.</p>
      <div class="pattern-list">${body}</div>
      ${solidHtml}
    </div>`;
}

function wirePatternStats(container, scopeWords) {
  container.querySelectorAll(".pattern-drill").forEach(btn =>
    btn.addEventListener("click", () => openPatternDrill(btn.dataset.rule)));
  container.querySelectorAll(".pattern-practice").forEach(btn =>
    btn.addEventListener("click", () => {
      const rule = patternStats(scopeWords).find(s => s.id === btn.dataset.rule);
      startPatternPractice(patternPracticeWords(scopeWords, btn.dataset.rule), rule);
    }));
}

/* A Practice test of one pattern's words. A test already under way is saved
   for later first (or kept, if the speller says no). */
function startPatternPractice(items, rule) {
  if (!items.length) return;
  if (practice && practice.index >= 0 && practice.entries.some(isAnswered)) {
    if (!confirm("A practice test is under way. Save it for later and start this one?")) return;
    savePracticeForLater();
    if (practice) return; // couldn't save (too many saved tests): keep it
  }
  practice = null;
  switchTab("practice");
  startPractice(items, "pattern", `Pattern: ${rule.lang} ${commonLetters(rule)}`);
}

/* ---------------------------
   Roots tab: every root in word_roots.json, tagged in a study word or not,
   with its meaning, everyday words and the study words that have it
--------------------------- */
let rootsBuilt = false;
let selectedRootRow = null;
let rootStudyWordSource;

function rootSortKey(root) {
  return root.root.toLowerCase().replace(/[^a-z]/g, "");
}

// Study words with this root, alphabetical, each once
function rootStudyWords(id) {
  return [...new Set(rootIndex?.get(id) || [])].sort((a, b) => a.localeCompare(b));
}

function rootStudyWordCard(word, item) {
  const card = drillEl("article", "card root-study-word");
  const head = drillEl("div", "word-header root-study-word-head");
  head.append(drillEl("h4", "word-heading", word));
  card.append(head);
  if (!item) {
    card.append(drillEl("p", "root-none", "Word details unavailable."));
    return card;
  }

  const audio = drillEl("button", "reset-btn root-study-audio");
  audio.type = "button";
  audio.setAttribute("aria-label", `Hear ${word}`);
  audio.append(iconEl("volume"));
  audio.addEventListener("click", () => playMWSequence(recordedPronunciations(item), word));
  head.append(audio);

  const pronunciations = (item.pronunciations || []).filter(p => p.written)
    .map(p => p.label ? `${p.written} (${p.label})` : p.written);
  const details = drillEl("dl", "root-study-fields");
  for (const [label, value] of [
    ["Pronunciation", pronunciations.join(" / ")],
    ["Part of speech", item.part_of_speech],
    ["Origin", item.origin],
    ["Difficulty", item.difficulty && difficultyLabel(item.difficulty)],
    ["Definition", item.definition],
    ["Example sentence", item.sentence]
  ]) {
    if (!value) continue;
    const isPassage = label === "Definition" || label === "Example sentence";
    const field = drillEl("div", isPassage ? "root-study-wide" : "");
    field.append(drillEl("dt", "label", label), drillEl("dd", isPassage ? "word-passage" : "", value));
    details.append(field);
  }
  card.append(details);
  return card;
}

function selectRoot(row) {
  if (row === selectedRootRow && rootStudyWordSource === words) return;
  selectedRootRow?.classList.remove("active");
  selectedRootRow?.setAttribute("aria-pressed", "false");
  selectedRootRow = row;
  rootStudyWordSource = words;
  const detail = document.getElementById("rootsDetail");
  if (!row) {
    detail.replaceChildren(drillEl("p", "stats-empty", "No roots match. Try another search or clear the filters."));
    return;
  }
  row.classList.add("active");
  row.setAttribute("aria-pressed", "true");
  const id = row.dataset.id;
  const root = wordRoots.roots[id];
  const head = drillEl("div", "word-header root-heading-banner");
  const tags = drillEl("div", "root-tags");
  tags.append(drillEl("span", `root-lang ${root.lang.includes("Greek") ? "wp-greek" : "wp-latin"}`, rootLangLabel(root.lang)),
    drillEl("span", "root-kind", root.kind));
  head.append(tags, drillEl("h2", "word-heading root-name", root.root));
  detail.replaceChildren(head, drillEl("p", "root-meaning", `“${root.meaning}”`));
  if (root.common?.length) {
    const common = drillEl("p", "root-common");
    common.append(drillEl("span", "root-label", "Everyday: "), root.common.join(", "));
    detail.append(common);
  }
  const mine = rootStudyWords(id);
  if (!mine.length) {
    detail.append(drillEl("p", "root-common root-none", "Not in your study words yet"));
    return;
  }
  const wanted = new Set(mine);
  const entries = new Map();
  for (const item of words) {
    if (wanted.has(item.word) && !entries.has(item.word)) entries.set(item.word, item);
  }
  const study = drillEl("section", "root-study");
  study.append(drillEl("h3", "root-study-heading", `Study words (${mine.length})`));
  const list = drillEl("div", "root-study-list");
  list.append(...mine.map(word => rootStudyWordCard(word, entries.get(word))));
  study.append(list);
  detail.append(study);
}

function buildRootsTab() {
  const listEl = document.getElementById("rootsList");
  if (!listEl || !wordRoots) return false;
  const entries = Object.entries(wordRoots.roots).sort((a, b) => rootSortKey(a[1]).localeCompare(rootSortKey(b[1])));
  listEl.replaceChildren(...entries.map(([id, root]) => {
    const row = drillEl("button", "word-item root-row", root.root);
    row.type = "button";
    row.setAttribute("aria-pressed", "false");
    row.setAttribute("aria-controls", "rootsDetail");
    row.dataset.id = id;
    row.dataset.search = [root.root, root.meaning, ...(root.common || []), ...rootStudyWords(id)].join(" ").toLowerCase();
    row.addEventListener("click", () => selectRoot(row));
    return row;
  }));
  rootsBuilt = true;
  return true;
}

function filterRootsTab() {
  const filters = document.getElementById("rootsFilters").elements;
  const q = filters.rootsSearch.value.trim().toLowerCase();
  const lang = filters.rootsLang.value;
  const kind = filters.rootsKind.value;
  const mine = filters.rootsMine.checked;
  filters.clearRootsFilters.disabled = !(filters.rootsSearch.value || lang !== "all" || kind !== "all" || mine);
  if (!rootsBuilt) return;

  const rows = Array.from(document.getElementById("rootsList").children);
  const visibleRows = rows.filter(row => {
    const id = row.dataset.id;
    const root = wordRoots.roots[id];
    const matches = (!q || row.dataset.search.includes(q)) &&
      (lang === "all" || root.lang.includes(lang)) &&
      (kind === "all" || root.kind === kind) &&
      (!mine || rootIndex.has(id));
    row.hidden = !matches;
    return matches;
  });
  document.getElementById("rootsCount").textContent = `${visibleRows.length} of ${rows.length}`;
  if (!selectedRootRow || selectedRootRow.hidden) {
    selectRoot(visibleRows[0]);
    document.getElementById("rootsListPanel").scrollTop = 0;
  }
}

// Called by switchTab() when the Roots tab opens (it shows whichever page is open)
function renderRootsTab() {
  if (!document.getElementById("patternsPage")?.hidden) return renderPatternsPage();
  if (!rootsBuilt && !buildRootsTab()) return; // word_roots.json not loaded yet: loadWordRoots draws it
  filterRootsTab();
  if (selectedRootRow) selectRoot(selectedRootRow);
}

function wireRootsTab() {
  const form = document.getElementById("rootsFilters");
  if (!form) return;
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("change", filterRootsTab);
  form.elements.rootsSearch.addEventListener("input", filterRootsTab);
  form.elements.clearRootsFilters.addEventListener("click", () => {
    form.reset();
    filterRootsTab();
  });
}

/* ---------------------------
   Roots tab > Language patterns: every rule in ORIGIN_TIPS (spelling-help.js),
   by language, each with its shortest study word as an example and a Drill
   button
--------------------------- */
const patternsView = { query: "", lang: "all" };
let patternsBuilt = false;

// One pass over the words: rule id -> { entries, letters } and tip group -> how many words
function patternIndex() {
  const rules = new Map();
  const langWords = new Map();
  const seen = new Set();
  words.forEach(item => {
    const key = item.word.toLowerCase();
    if (seen.has(key)) return; // the same word in School and Regional
    seen.add(key);
    new Set((item.origin || "").split(",").map(s => s.trim()).filter(Boolean)
      .map(lang => ORIGIN_TIP_ALIASES[lang] || lang)).forEach(k => langWords.set(k, (langWords.get(k) || 0) + 1));
    patternTipsOf(item).forEach(tip => {
      if (!rules.has(tip.id)) rules.set(tip.id, { entries: [], letters: new Map() });
      const r = rules.get(tip.id);
      r.entries.push({ item, start: tip.start, end: tip.end });
      const l = tip.letters.toLowerCase();
      r.letters.set(l, (r.letters.get(l) || 0) + 1);
    });
  });
  return { rules, langWords };
}

function patternCard(id, text, found) {
  const card = drillEl("article", "pattern-card");
  const letters = found ? commonLetters(found) : "";
  if (letters) {
    const head = drillEl("div", "pattern-card-head");
    head.append(drillEl("b", "tip-letters", letters));
    card.append(head);
  }
  card.append(drillEl("p", "pattern-card-rule", text));
  const example = drillEl("p", "pattern-card-example");
  if (found?.entries.length) {
    // The shortest study word with this rule reads best
    const e = found.entries.slice().sort((a, b) => a.item.word.length - b.item.word.length)[0];
    const chars = [...e.item.word];
    const btn = drillEl("button", "wp-word");
    btn.type = "button";
    btn.append(chars.slice(0, e.start).join(""), drillEl("b", "", chars.slice(e.start, e.end).join("")), chars.slice(e.end).join(""));
    btn.addEventListener("click", () => openRootWord(e.item.word, e.item._scope));
    const n = found.entries.length;
    example.append("Example: ", btn, ` · ${n} study word${n === 1 ? "" : "s"}`);
    card.append(example, drillButton("link-btn tip-drill", "target", "Drill this pattern", () => openPatternDrill(id)));
  } else {
    example.append("No study word uses this yet.");
    card.append(example);
  }
  card.dataset.search = `${text} ${letters}`.toLowerCase();
  return card;
}

function buildPatternsPage() {
  const list = document.getElementById("patternsList");
  if (!list || !words.length) return false;
  const { rules, langWords } = patternIndex();
  const select = document.getElementById("patternsLang");
  const sections = Object.entries(ORIGIN_TIPS).map(([key, group]) => {
    const name = ORIGIN_TIP_NAMES[key] || key;
    const patterns = group.patterns || [];
    const section = drillEl("section", "pattern-lang-section");
    section.dataset.lang = key;
    const head = drillEl("div", "pattern-lang-head");
    const count = langWords.get(key) || 0;
    head.append(drillEl("h3", "", name), drillEl("span", "pattern-lang-count",
      `${patterns.length} pattern${patterns.length === 1 ? "" : "s"} · ${count} study word${count === 1 ? "" : "s"}`));
    section.append(head);
    if (group.general) section.append(drillEl("p", "pattern-lang-note", group.general));
    if (patterns.length) {
      const cards = drillEl("div", "pattern-cards");
      patterns.forEach(([, text], i) => {
        const id = `${key}#${i}`;
        cards.append(patternCard(id, text, rules.get(id)));
      });
      section.append(cards);
    }
    section.dataset.search = `${name} ${group.general || ""}`.toLowerCase();
    const option = drillEl("option", "", name);
    option.value = key;
    select.append(option);
    return section;
  });
  list.replaceChildren(...sections);
  patternsBuilt = true;
  return true;
}

function filterPatternsPage() {
  const q = patternsView.query.trim().toLowerCase();
  let shown = 0;
  let total = 0;
  document.querySelectorAll("#patternsList .pattern-lang-section").forEach(section => {
    const langOk = patternsView.lang === "all" || section.dataset.lang === patternsView.lang;
    // A search for the language's name shows all its patterns
    const sectionHit = Boolean(q) && section.dataset.search.includes(q);
    const cards = section.querySelectorAll(".pattern-card");
    let any = false;
    cards.forEach(card => {
      total++;
      const ok = langOk && (!q || sectionHit || card.dataset.search.includes(q));
      card.hidden = !ok;
      if (ok) { shown++; any = true; }
    });
    // A language with only a note (no patterns) shows unless something narrows it out
    const noteOnly = !cards.length && langOk && (!q || sectionHit);
    section.hidden = !(any || noteOnly);
  });
  document.getElementById("patternsCount").textContent = `${shown} of ${total} patterns`;
  document.getElementById("patternsEmpty").hidden =
    [...document.querySelectorAll("#patternsList .pattern-lang-section")].some(s => !s.hidden);
}

function renderPatternsPage() {
  if (!patternsBuilt && !buildPatternsPage()) return; // words not loaded yet
  filterPatternsPage();
}

const ROOTS_PAGE_KEY = "spellingBeeRootsPage";

function showRootsPage(page) {
  document.querySelectorAll("#rootsTab [data-roots-page]").forEach(b =>
    b.setAttribute("aria-pressed", String(b.dataset.rootsPage === page)));
  document.getElementById("rootsPage").hidden = page !== "roots";
  document.getElementById("patternsPage").hidden = page !== "patterns";
  try { sessionStorage.setItem(ROOTS_PAGE_KEY, page); } catch {}
  renderRootsTab();
}

function wirePatternsPage() {
  const search = document.getElementById("patternsSearch");
  if (!search) return;
  document.querySelectorAll("#rootsTab [data-roots-page]").forEach(btn =>
    btn.addEventListener("click", () => showRootsPage(btn.dataset.rootsPage)));
  search.addEventListener("input", () => { patternsView.query = search.value; filterPatternsPage(); });
  document.getElementById("patternsLang").addEventListener("change", event => {
    patternsView.lang = event.target.value;
    filterPatternsPage();
  });
  // Back on the page that was open before a refresh (without drawing it yet)
  let page = null;
  try { page = sessionStorage.getItem(ROOTS_PAGE_KEY); } catch {}
  if (page === "patterns") {
    document.querySelectorAll("#rootsTab [data-roots-page]").forEach(b =>
      b.setAttribute("aria-pressed", String(b.dataset.rootsPage === page)));
    document.getElementById("rootsPage").hidden = true;
    document.getElementById("patternsPage").hidden = false;
  }
}
function wireRootsAndPatterns() {
  wireRootsTab();
  wirePatternsPage();
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wireRootsAndPatterns);
else wireRootsAndPatterns();
