let words = [];
let filteredWords = [];
let currentIndex = -1;
let currentItem = null;               // canonical selected word
let searchQuery = "";

const USER_ID = "nikku";
const SESSIONS_KEY = "_practiceSessions"; // practice test summaries, same doc

/* ---------------------------
   Speech setup (FORCE AMERICAN)
--------------------------- */
let americanVoice = null;
// Not every browser exposes speech synthesis (some in-app/mobile webviews don't)
const synth = window.speechSynthesis || null;

function loadAmericanVoice() {
  if (!synth) return;
  const voices = synth.getVoices();
  if (!voices.length) return;

  americanVoice =
    voices.find(v => v.lang === "en-US" && v.name.includes("Samantha")) ||
    voices.find(v => v.lang === "en-US" && v.name.includes("Alex")) ||
    voices.find(v => v.lang === "en-US") ||
    null;
}

if (synth) synth.onvoiceschanged = loadAmericanVoice;

/* ---------------------------
   Firestore helpers
--------------------------- */
const FIRESTORE_URL = "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Never let a slow or failing Firestore connection block the word list
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ]);
}

// The whole progress doc, fetched once and kept in sync by saves, so switching
// scope doesn't go back to Firestore (which can be slow on mobile Safari)
let progressData = null;

// Resolves to the progress doc, or null if Firestore couldn't be reached
async function fetchProgressDoc() {
  if (progressData) return progressData;
  if (!window.db) return null;
  try {
    const { doc, getDoc } = await import(FIRESTORE_URL);
    const snap = await withTimeout(getDoc(doc(window.db, "progress", USER_ID)), 12000);
    progressData = snap.exists() ? snap.data() || {} : {};
    return progressData;
  } catch (err) {
    console.warn("Could not load saved progress:", err);
    return null;
  }
}

/* Merge `fields` into one word's saved progress (other fields are kept) */
async function saveProgress(scope, word, fields) {
  if (progressData) {
    const scoped = progressData[scope] || (progressData[scope] = {});
    scoped[word] = { ...(typeof scoped[word] === "object" ? scoped[word] : {}), ...fields };
  }
  if (!window.db) return;
  try {
    const { doc, setDoc } = await import(FIRESTORE_URL);
    await setDoc(
      doc(window.db, "progress", USER_ID),
      { [scope]: { [word]: fields } },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save progress:", err);
  }
}

function saveWord(item, fields) {
  item._touched = true; // changed this session: late-arriving saved data must not overwrite it
  return saveProgress(item._scope, item.word, fields);
}

async function savePracticeSession(session) {
  if (progressData) {
    progressData[SESSIONS_KEY] = [...(progressData[SESSIONS_KEY] || []), session];
  }
  if (!window.db) return;
  try {
    const { doc, setDoc, arrayUnion } = await import(FIRESTORE_URL);
    await setDoc(
      doc(window.db, "progress", USER_ID),
      { [SESSIONS_KEY]: arrayUnion(session) },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save practice session:", err);
  }
}

function practiceSessions() {
  return (progressData && progressData[SESSIONS_KEY]) || [];
}

async function resetCloudProgress() {
  if (progressData) progressData = {};
  if (!window.db) return;
  const { doc, setDoc } = await import(FIRESTORE_URL);
  await setDoc(doc(window.db, "progress", USER_ID), {}, { merge: false });
}

/* ---------------------------
   Load words
--------------------------- */
// Every scope is loaded once up front; the Learning and Practice tabs each
// filter by scope in memory, and share the same word objects.
// Bump ?v= whenever a word file changes so phones don't keep a cached copy
const SCOPE_FILES = {
  school: "word_list_school.json?v=2026100704",
  regional: "word_list_regional.json?v=2026100704"
};

function emptyPractice() {
  // history: every attempt oldest first, "c" = correct, "w" = wrong
  return { attempts: 0, correct: 0, wrong: 0, last: null, lastAt: null, history: "" };
}

// Copy one word's saved Firestore progress onto the in-memory word
function applySavedProgress(item, saved) {
  const obj = typeof saved === "object" && saved ? saved : {};
  // Older saves only had result "correct"/"wrong" from the Learning tab;
  // any result there just means the word was covered.
  item.covered = typeof obj.covered === "boolean"
    ? obj.covered
    : Boolean(typeof saved === "string" ? saved : obj.result);
  item.markedForCorrection = obj.markedForCorrection === true;
  item.correctionNote = obj.correctionNote || "";
  item.practice = { ...emptyPractice(), ...(obj.practice || {}) };
}

function applyProgressToWords(data) {
  words.forEach(item => {
    if (!item._touched) applySavedProgress(item, data[item._scope]?.[item.word]);
  });
}

async function loadWords() {
  const [progress, ...datasets] = await Promise.all([
    fetchProgressDoc(),
    ...Object.keys(SCOPE_FILES).map(async scope => {
      const file = SCOPE_FILES[scope];
      const data = !file ? [] : await fetch(file).then(r => {
        if (!r.ok) throw new Error(`${file}: HTTP ${r.status}`);
        return r.json();
      }).catch(err => {
        console.error("Could not load words:", err);
        return [];
      });
      return data.map((w, i) => ({
        ...w,
        _scope: scope,
        _originalIndex: i,
        covered: false,
        markedForCorrection: false,
        correctionNote: "",
        practice: emptyPractice()
      }));
    })
  ]);

  words = datasets.flat();
  if (progress) applyProgressToWords(progress);
  else retryProgressLoad();

  applyFilter();
  if (typeof onWordsLoaded === "function") onWordsLoaded();
}

/* ---------------------------
   Saved progress couldn't be loaded: say so, and keep retrying
--------------------------- */
let progressRetryTimer = null;
let progressRetryDelay = 3000;

function showSyncBanner(state) {
  const banner = document.getElementById("syncBanner");
  if (!banner) return;
  banner.hidden = state === "ok";
  banner.classList.toggle("loading", state === "loading");
  document.getElementById("syncBannerText").textContent = state === "loading"
    ? "Loading your saved progress…"
    : "Couldn't load your saved progress — retrying. Your words still work, and new progress is saved.";
}

function retryProgressLoad() {
  if (!window.db) return; // Firebase itself didn't load; nothing to retry
  showSyncBanner("failed");
  clearTimeout(progressRetryTimer);
  progressRetryTimer = setTimeout(retryProgressNow, progressRetryDelay);
  progressRetryDelay = Math.min(progressRetryDelay * 2, 30000);
}

async function retryProgressNow() {
  clearTimeout(progressRetryTimer);
  showSyncBanner("loading");
  const progress = await fetchProgressDoc();
  if (!progress) {
    retryProgressLoad();
    return;
  }
  showSyncBanner("ok");
  applyProgressToWords(progress);
  applyFilter();
  if (currentItem) renderWordCardStatus();
  if (typeof onWordsLoaded === "function") onWordsLoaded();
  if (activeTab === "stats") renderStats();
}

/* ---------------------------
   Word status helpers (shared with practice.js)
--------------------------- */
// "correct" / "wrong" = result of the latest practice attempt; "pending" = never practiced
function practiceStatus(item) {
  return item.practice.last || "pending";
}

/* ---------------------------
   Init
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadAmericanVoice();

  document.querySelectorAll(".multi-select input[type=checkbox]").forEach(input => {
    input.addEventListener("change", event => {
      updateMultiSelectSummary(event.target.closest(".multi-select"));
      if (event.target.closest("#learningTab")) applyFilter();
      else if (event.target.closest("#statsTab")) renderStats();
    });
  });

  document.querySelectorAll('#resultFilter input[type="radio"]').forEach(input => {
    input.addEventListener("change", () => {
      updateResultFilterSummary();
      document.getElementById("resultFilter").open = false;
      applyFilter();
    });
  });
  document.getElementById("prevWordBtn").addEventListener("click", () => stepWord(-1));
  document.getElementById("nextWordBtn").addEventListener("click", () => stepWord(1));
  document.querySelectorAll(".collapse-toggle").forEach(toggle => {
    toggle.addEventListener("click", () => {
      const section = toggle.closest(".collapsible");
      const collapsed = section.classList.toggle("collapsed");
      toggle.setAttribute("aria-expanded", String(!collapsed));
    });
  });
  document.getElementById("correctionCheckbox").addEventListener("change", toggleCorrection);
  document.getElementById("correctionNote").addEventListener("change", saveCorrectionNote);
  document.getElementById("clearCoveredBtn").addEventListener("click", clearCovered);
  document.getElementById("syncRetryBtn").addEventListener("click", retryProgressNow);

  document.getElementById("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  // Close open dropdowns when tapping anywhere outside them. pointerdown
  // (not click) because iOS Safari doesn't send clicks from plain elements.
  document.addEventListener("pointerdown", event => {
    document.querySelectorAll(".multi-select[open]").forEach(menu => {
      if (!menu.contains(event.target)) menu.open = false;
    });
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      document.querySelectorAll(".multi-select[open]").forEach(menu => (menu.open = false));
    }
  });
  // Only one dropdown open at a time
  document.querySelectorAll(".multi-select").forEach(menu => {
    menu.addEventListener("toggle", () => {
      if (!menu.open) return;
      document.querySelectorAll(".multi-select[open]").forEach(other => {
        if (other !== menu) other.open = false;
      });
    });
  });

  loadWords();
});

/* ---------------------------
   Tabs
--------------------------- */
let activeTab = "learning";

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `${tab}Tab`)
  );

  const leaving = activeTab;
  activeTab = tab;
  stopAllAudio();
  if (leaving === "practice" && tab !== "practice" && typeof leavePractice === "function") leavePractice();
  if (tab === "stats") renderStats();
  if (tab === "practice" && typeof openPractice === "function") openPractice();
}

function showFilteredResults(filter) {
  setResultFilter(filter);
  switchTab("learning");
  applyFilter();
}

function showWordInLearning(word) {
  setResultFilter("all");
  document.getElementById("searchInput").value = word;
  searchQuery = word.toLowerCase();
  switchTab("learning");
  applyFilter();
  const index = filteredWords.findIndex(w => w.word === word);
  if (index >= 0) selectWord(index);
}

/* ---------------------------
   Difficulty labels
--------------------------- */
function difficultyLabel(level) {
  if (level === "one") return "One Bee 🐝";
  if (level === "two") return "Two Bee 🐝🐝";
  if (level === "three") return "Three Bee 🐝🐝🐝";
  return "All Bees";
}

function selectedValues(id) {
  return Array.from(document.querySelectorAll(`#${id} input[type="checkbox"]:checked`))
    .map(input => input.value);
}

function difficultySummary(id = "difficultyFilter") {
  const levels = selectedValues(id);
  if (levels.length === 3) return "All Bees";
  return levels.map(difficultyLabel).join(", ") || "No difficulty";
}

function updateMultiSelectSummary(container) {
  const selected = Array.from(container.querySelectorAll("input:checked"));
  const summary = container.querySelector("summary");
  const kind = container.dataset.kind; // "scope" or "difficulty"
  if (!selected.length) {
    summary.textContent = kind === "scope" ? "Select scope" : "No difficulty";
    return;
  }
  if (kind === "difficulty" && selected.length === 3) {
    summary.textContent = "All Bees";
    return;
  }
  summary.textContent = selected.map(input => input.parentElement.textContent.trim()).join(", ");
}

/* Results dropdown (radio buttons inside a <details>) */
function getResultFilter() {
  return document.querySelector('#resultFilter input[type="radio"]:checked')?.value || "all";
}

function setResultFilter(value) {
  document.querySelectorAll('#resultFilter input[type="radio"]').forEach(input => {
    input.checked = input.value === value;
  });
  updateResultFilterSummary();
}

function updateResultFilterSummary() {
  const container = document.getElementById("resultFilter");
  const checked = container.querySelector("input:checked");
  container.querySelector("summary").textContent = checked
    ? checked.parentElement.textContent.trim()
    : "All words";
}

/* Collapsed-toggle text for a letter row, e.g. "All" or "A, C" */
function updateLetterSummary(containerId, letters) {
  const summary = document.getElementById(containerId)
    ?.closest(".collapsible")
    ?.querySelector(".collapse-summary");
  if (summary) summary.textContent = letters.size ? [...letters].sort().join(", ") : "All";
}

/* ---------------------------
   Shuffle helpers
--------------------------- */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}


/* ---------------------------
   Filtering
--------------------------- */
// Words in the scopes picked on the Learning tab
function learningScopeWords() {
  const scopes = selectedValues("scopeFilter");
  return words.filter(w => scopes.includes(w._scope));
}

function matchesResultFilter(w, filter) {
  switch (filter) {
    case "covered": return w.covered;
    case "not-covered": return !w.covered;
    case "practice-wrong": return practiceStatus(w) === "wrong";
    // Wrong in any attempt, even if spelled right since
    case "practice-ever-wrong": return w.practice.wrong > 0;
    case "practice-correct": return practiceStatus(w) === "correct";
    case "practice-pending": return practiceStatus(w) === "pending";
    case "correction": return w.markedForCorrection;
    default: return true;
  }
}

function applyFilter() {
  const levels = selectedValues("difficultyFilter");
  const resultFilter = getResultFilter();

  filteredWords = learningScopeWords().filter(w => {
    const firstLetter = w.word?.charAt(0)?.toUpperCase();
    const letterMatch =
      !window.selectedLetters ||
      window.selectedLetters.size === 0 ||
      window.selectedLetters.has(firstLetter);

    return (
      levels.includes(w.difficulty) &&
      matchesResultFilter(w, resultFilter) &&
      w.word.toLowerCase().includes(searchQuery) &&
      letterMatch
    );
  });

  // Keep the selected word highlighted if it's still in the list
  currentIndex = currentItem ? filteredWords.indexOf(currentItem) : -1;

  updateLetterSummary("letterFilter", window.selectedLetters || new Set());
  renderWordList();
  updateProgress();
}

window.applyFilters = applyFilter;

/* ---------------------------
   Render list
--------------------------- */
function renderWordList() {
  const list = document.getElementById("wordList");
  list.innerHTML = "";

  filteredWords.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "word-item";
    div.onclick = () => selectWord(index);

    const label = document.createElement("span");
    label.className = "wi-word";
    label.textContent = `${index + 1}. ${item.word}`;
    div.appendChild(label);

    const p = item.practice;
    if (p.attempts) {
      const badge = document.createElement("span");
      badge.className = "wi-badge";
      badge.textContent = `✓${p.correct} ✗${p.wrong}`;
      badge.title = `Practice: ${p.attempts} attempts, ${p.correct} correct, ${p.wrong} wrong`;
      div.appendChild(badge);
    }

    if (index === currentIndex) {
      div.classList.add("active");
    }
    // Practice results win over "covered"; a wrong latest attempt shows red
    const status = practiceStatus(item);
    if (status === "wrong") div.classList.add("wrong");
    else if (status === "correct") div.classList.add("correct");
    else if (item.covered) div.classList.add("covered");

    list.appendChild(div);
  });

  document.getElementById("wordListCount").textContent = `${filteredWords.length} words`;
  updateWordNav();
}

/* ---------------------------
   Previous / next word
--------------------------- */
function updateWordNav() {
  const total = filteredWords.length;
  const hasCurrent = currentIndex >= 0;
  document.getElementById("prevWordBtn").disabled = !hasCurrent || currentIndex === 0;
  document.getElementById("nextWordBtn").disabled =
    !total || (hasCurrent && currentIndex >= total - 1);
  document.getElementById("wordPosition").textContent =
    hasCurrent ? `${currentIndex + 1} of ${total}` : total ? `— of ${total}` : "";
}

// Nothing selected (or it was filtered out): Next starts at the top
function stepWord(delta) {
  const hasCurrent = currentIndex >= 0;
  const index = hasCurrent ? currentIndex + delta : 0;
  if (index < 0 || index >= filteredWords.length) return;
  selectWord(index);
  scrollActiveWordIntoView();
}

// After adding a letter: open the word list (if collapsed on a phone), show
// that letter's first word in the card (without reading it out), and scroll the list to it
function showLetterInWordList(letter) {
  const panel = document.querySelector("#learningTab .word-list");
  if (!panel) return;
  if (panel.classList.contains("collapsed")) {
    panel.classList.remove("collapsed");
    panel.querySelector(".collapse-toggle")?.setAttribute("aria-expanded", "true");
  }
  const index = filteredWords.findIndex(w => w.word.charAt(0).toUpperCase() === letter);
  if (index >= 0) selectWord(index, false);
  const row = document.querySelectorAll("#wordList .word-item")[index];
  if (index <= 0 || !row) {
    panel.scrollTop = 0;
    return;
  }
  const header = panel.querySelector(".word-list-header");
  const rowTop = row.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  panel.scrollTop = Math.max(0, rowTop - (header ? header.offsetHeight + 8 : 0));
}

// Scroll the list panel only, never the whole page
function scrollActiveWordIntoView() {
  const panel = document.querySelector("#learningTab .word-list");
  const row = document.querySelector("#wordList .word-item.active");
  if (!panel || !row || panel.scrollHeight <= panel.clientHeight) return;
  const rowTop = row.getBoundingClientRect().top - panel.getBoundingClientRect().top + panel.scrollTop;
  // The pinned header covers the top of the panel
  const headerHeight = panel.querySelector(".word-list-header")?.offsetHeight || 0;
  if (rowTop < panel.scrollTop + headerHeight + 8 || rowTop > panel.scrollTop + panel.clientHeight - 60) {
    panel.scrollTop = Math.max(0, rowTop - panel.clientHeight / 2);
  }
}

/* ---------------------------
   Audio helpers
--------------------------- */
// One reusable element: iOS only lets an element play without a tap after
// it has played once from a tap, so a fresh Audio() per word would be blocked
// when the Practice timer moves on by itself.
const audioPlayer = new Audio();
audioPlayer.playsInline = true;

function stopAllAudio() {
  if (synth) synth.cancel();
  audioPlayer.pause();
}

function playMWAudio(url) {
  stopAllAudio();
  audioPlayer.src = url;
  audioPlayer.play().catch(() => {});
}

// Recorded MW pronunciations of a word, the default (MW's preferred) first.
// Older word files only have audio_url.
function recordedPronunciations(item) {
  const urls = (item?.pronunciations || []).map(p => p.audio_url).filter(Boolean);
  return urls.length ? urls : (item?.audio_url ? [item.audio_url] : []);
}

// Every MW pronunciation as written by MW; recorded ones play when tapped,
// ones MW spells out without a recording are shown dashed
function renderPronunciations(item) {
  const el = document.getElementById("pronunciations");
  el.replaceChildren();
  const list = item?.pronunciations || [];
  if (!list.length) {
    el.textContent = "—";
    return;
  }
  const defaultUrl = recordedPronunciations(item)[0];
  for (const p of list) {
    const chip = document.createElement(p.audio_url ? "button" : "span");
    chip.className = "pronunciation-chip";
    chip.textContent = `${p.audio_url ? "🔊 " : ""}\\${p.written}\\`;
    if (p.label) {
      const label = document.createElement("small");
      label.textContent = p.label;
      chip.append(label);
    }
    if (p.audio_url) {
      chip.type = "button";
      chip.title = "Play this pronunciation";
      chip.addEventListener("click", () => playMWAudio(p.audio_url));
      if (p.audio_url === defaultUrl) chip.classList.add("default");
    } else {
      chip.classList.add("unrecorded");
      chip.title = "Merriam-Webster gives this pronunciation but has no recording of it";
    }
    el.append(chip);
  }
}

function speakAmerican(text) {
  stopAllAudio();
  if (!synth) return;
  const u = new SpeechSynthesisUtterance(`​ ${text}`);
  u.lang = "en-US";
  u.rate = 0.85;
  if (americanVoice) u.voice = americanVoice;
  synth.speak(u);
}

/* ---------------------------
   Select word (marks it covered)
--------------------------- */
// autoplay: false shows the word without reading it out (used when picking a letter)
function selectWord(index, autoplay = true) {
  currentIndex = index;
  currentItem = filteredWords[index];

  if (!currentItem.covered) setCovered(currentItem, true);

  showCardWord(currentItem.word);
  document.getElementById("difficulty").innerText =
    difficultyLabel(currentItem.difficulty);
  document.getElementById("origin").innerText =
    currentItem.origin || "—";
  document.getElementById("definition").innerText =
    currentItem.definition;
  document.getElementById("sentence").innerText =
    currentItem.sentence;
  document.getElementById("pos").innerText =
    currentItem.part_of_speech;
  renderPronunciations(currentItem);
  renderSourceBadge("definitionSource", currentItem.definition, currentItem.definition_source);
  renderSourceBadge("sentenceSource", currentItem.sentence, currentItem.sentence_source);
  document.getElementById("correctionCheckbox").checked = currentItem.markedForCorrection;
  document.getElementById("correctionNote").value = currentItem.correctionNote;
  updateCorrectionNoteState(currentItem);
  renderWordCardStatus();

  updateMWButtonState(currentItem);

  if (!autoplay) stopAllAudio();
  else if (currentItem.audio_url) playMWAudio(currentItem.audio_url);
  else speakAmerican(currentItem.word);

  renderWordList();
  updateProgress();
}

// Merriam-Webster definitions and sentences get their own badge; every other
// source shows as generated
function renderSourceBadge(id, text, source) {
  const badge = document.getElementById(id);
  const isMW = source === "merriam_webster";
  badge.hidden = !text;
  badge.textContent = isMW ? "📖 Merriam-Webster" : "🤖 Generated";
  badge.className = `source-badge ${isMW ? "source-mw" : "source-generated"}`;
  badge.title = isMW ? "Merriam-Webster Collegiate Dictionary" : "Not from Merriam-Webster";
}

// The big word at the top of the card; null shows the "Select a word" placeholder
function showCardWord(word) {
  const el = document.getElementById("word");
  el.innerText = word || "Select a word";
  el.closest(".word-header").classList.toggle("empty", !word);
  el.classList.remove("word-enter");
  if (word) {
    void el.offsetWidth; // restart the fade-in for each new word
    el.classList.add("word-enter");
  }
}

/* ---------------------------
   Covered (Learning) + undo
--------------------------- */
function setCovered(item, covered) {
  item.covered = covered;
  // Don't wait on the network before showing the word and playing audio
  saveWord(item, { covered });
}

// Undo an accidental tap: the word goes back to not covered
function clearCovered() {
  if (!currentItem || !currentItem.covered) return;
  setCovered(currentItem, false);
  renderWordCardStatus();
  renderWordList();
  updateProgress();
}

function renderWordCardStatus() {
  const clearBtn = document.getElementById("clearCoveredBtn");
  const history = document.getElementById("practiceHistory");
  clearBtn.hidden = !currentItem?.covered;
  if (!currentItem) {
    history.textContent = "—";
    return;
  }

  const p = currentItem.practice;
  history.innerHTML = "";
  if (!p.attempts) {
    history.textContent = "Not practiced yet";
    return;
  }
  history.appendChild(renderAttemptHistory(p));
}

// "3 attempts  latest ✗ ✗ ✓": every attempt, newest on the far left
function renderAttemptHistory(p) {
  const strip = document.createElement("div");
  strip.className = "history-strip";

  const count = document.createElement("span");
  count.className = "history-count";
  count.textContent = `${p.attempts} attempt${p.attempts === 1 ? "" : "s"}`;
  strip.appendChild(count);

  const latest = document.createElement("span");
  latest.className = "history-latest";
  latest.textContent = "latest";
  strip.appendChild(latest);

  // Attempts saved before history was kept only have their last result
  const recorded = p.history || (p.last ? p.last.charAt(0) : "");
  const attempts = [...recorded].reverse();
  attempts.forEach((result, i) => {
    const mark = document.createElement("span");
    const correct = result === "c";
    mark.className = `history-mark ${correct ? "correct" : "wrong"}${i === 0 ? " latest" : ""}`;
    mark.textContent = correct ? "✓" : "✗";
    const number = attempts.length - i; // attempt number, counting from the first
    mark.title = `Attempt ${number}: ${correct ? "correct" : "wrong"}` +
      (i === 0 && p.lastAt ? ` · ${formatSessionDate(p.lastAt)}` : "");
    mark.setAttribute("aria-label", mark.title);
    strip.appendChild(mark);
  });

  const untracked = p.attempts - recorded.length;
  if (untracked > 0) {
    const note = document.createElement("span");
    note.className = "history-note";
    note.textContent = `+${untracked} earlier`;
    note.title = "Attempts from before history was recorded";
    strip.appendChild(note);
  }
  return strip;
}

/* ---------------------------
   Correction flag
--------------------------- */
function toggleCorrection(event) {
  if (!currentItem) return;

  currentItem.markedForCorrection = event.target.checked;
  // Unmarking clears the comment too
  if (!currentItem.markedForCorrection) {
    currentItem.correctionNote = "";
    document.getElementById("correctionNote").value = "";
  }
  updateCorrectionNoteState(currentItem);
  saveWord(currentItem, {
    markedForCorrection: currentItem.markedForCorrection,
    correctionNote: currentItem.correctionNote
  });

  applyFilter();
}

function updateCorrectionNoteState(item) {
  const note = document.getElementById("correctionNote");
  if (!note) return;
  note.hidden = !item?.markedForCorrection;
}

function saveCorrectionNote(event) {
  if (!currentItem || !currentItem.markedForCorrection) return;

  currentItem.correctionNote = event.target.value;
  saveWord(currentItem, { correctionNote: currentItem.correctionNote });
}

/* ---------------------------
   Pronunciation / Text buttons
--------------------------- */
function playMWPronunciation() {
  if (currentItem?.audio_url) {
    playMWAudio(currentItem.audio_url);
  }
}

function playAmericanPronunciation() {
  if (currentItem) {
    speakAmerican(currentItem.word);
  }
}

function readDefinition() {
  if (currentItem) {
    speakAmerican(currentItem.definition);
  }
}

function readSentence() {
  if (currentItem) {
    speakAmerican(currentItem.sentence);
  }
}

/* ---------------------------
   Progress
--------------------------- */
function updateProgress() {
  const total = filteredWords.length;
  const covered = filteredWords.filter(w => w.covered).length;

  document.getElementById("categoryCount").innerText =
    `${difficultySummary()} — ${total} words`;

  document.getElementById("progressText").innerText =
    `${covered} / ${total} covered`;

  const fill = document.getElementById("progressBarFill");
  if (fill) {
    const pct = total ? Math.round((covered / total) * 100) : 0;
    fill.style.width = `${pct}%`;
  }

  if (activeTab === "stats") renderStats();
}

/* ---------------------------
   Stats tab
--------------------------- */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

function learningCounts(list) {
  const covered = list.filter(w => w.covered).length;
  return {
    total: list.length,
    covered,
    notCovered: list.length - covered,
    correction: list.filter(w => w.markedForCorrection).length
  };
}

function practiceCounts(list) {
  const counts = { total: list.length, correct: 0, wrong: 0, pending: 0, attempts: 0, correctAttempts: 0, wrongAttempts: 0 };
  list.forEach(w => {
    counts[practiceStatus(w)]++;
    counts.attempts += w.practice.attempts;
    counts.correctAttempts += w.practice.correct;
    counts.wrongAttempts += w.practice.wrong;
  });
  return counts;
}

// segments: [{ count, cls, label }]
function stackBarHtml(segments, total, small) {
  if (!total) return `<div class="${small ? "mini-bar-track" : "stack-bar"}"></div>`;
  const segs = segments
    .filter(s => s.count)
    .map(s => `<div class="stack-seg ${s.cls}" style="flex-basis:${(s.count / total) * 100}%" title="${s.label}: ${s.count}"></div>`)
    .join("");
  return `<div class="${small ? "mini-bar-track" : "stack-bar"}">${segs}</div>`;
}

function statTile(label, value, color, filter) {
  const attrs = filter
    ? ` stat-filter" data-filter="${filter}" role="button" tabindex="0" title="Show these words in Learning`
    : "";
  return `
    <div class="stat-tile${attrs}">
      <div class="stat-label">${label}</div>
      <div class="stat-value"${color ? ` style="color:${color}"` : ""}>${value}</div>
    </div>`;
}

function formatSessionDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// "Sep 30 · 4:07 PM – 4:19 PM · 12 min" (tests saved before start times were
// recorded say so: "ended 4:19 PM · start time not recorded")
function formatSessionTimes(session) {
  const end = new Date(session.at);
  if (isNaN(end)) return "";
  const time = d => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const start = new Date(session.startedAt);
  const parts = [end.toLocaleDateString(undefined, { month: "short", day: "numeric" })];
  if (isNaN(start)) {
    parts.push(`ended ${time(end)}`, "start time not recorded");
  } else {
    const minutes = Math.round((end - start) / 60000);
    parts.push(`${time(start)} – ${time(end)}`, minutes < 1 ? "under 1 min" : `${minutes} min`);
  }
  return parts.join(" · ");
}

// "School · All Bees · Letters A, B". Older tests only saved a description
// ("School · All Bees · A, B · Wrong + Not attempted"), so read it from that.
function formatSessionFilters(session) {
  let { scope, difficulty, letters } = session;
  if (scope === undefined && session.label) {
    const parts = session.label.split(" · ").filter(p => p !== "Retry");
    [scope, difficulty] = parts;
    const letterPart = parts.slice(2).find(p => /^[A-Z](, [A-Z])*$/.test(p));
    letters = letterPart ? letterPart.split(", ") : [];
  }
  return [
    scope || "",
    difficulty || "",
    letters && letters.length ? `Letters ${letters.join(", ")}` : "All letters"
  ].filter(Boolean).join(" · ");
}

/* Stats tab filters (independent of Learning and Practice) */
const statsLetters = new Set();

function statsScopeAndLevelWords() {
  const scopes = selectedValues("statsScopeFilter");
  const levels = selectedValues("statsDifficultyFilter");
  return words.filter(w => scopes.includes(w._scope) && levels.includes(w.difficulty));
}

function statsWords() {
  return statsScopeAndLevelWords().filter(w =>
    !statsLetters.size || statsLetters.has(w.word.charAt(0).toUpperCase())
  );
}

function renderStatsLetters() {
  const container = document.getElementById("statsLetterFilter");
  if (!container) return;
  container.innerHTML = "";
  updateLetterSummary("statsLetterFilter", statsLetters);

  const counts = {};
  statsScopeAndLevelWords().forEach(w => {
    const letter = w.word.charAt(0).toUpperCase();
    counts[letter] = (counts[letter] || 0) + 1;
  });

  const add = (text, active, count, onclick) => {
    const btn = document.createElement("button");
    btn.className = "letter-btn";
    btn.textContent = text;
    btn.classList.toggle("active", active);
    btn.classList.toggle("no-words", !count);
    btn.title = `${count || 0} words`;
    btn.onclick = onclick;
    container.appendChild(btn);
    return btn;
  };

  add("All", !statsLetters.size, statsScopeAndLevelWords().length, () => {
    statsLetters.clear();
    renderStats();
  }).classList.add("all-btn");

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
    add(letter, statsLetters.has(letter), counts[letter], () => {
      if (statsLetters.has(letter)) statsLetters.delete(letter);
      else statsLetters.add(letter);
      renderStats();
    });
  });
}

/* Tapping a stat opens Learning with the same Scope/Difficulty/letters */
function copyStatsFiltersToLearning() {
  [["statsScopeFilter", "scopeFilter"], ["statsDifficultyFilter", "difficultyFilter"]].forEach(([from, to]) => {
    const picked = selectedValues(from);
    document.querySelectorAll(`#${to} input[type="checkbox"]`).forEach(input => {
      input.checked = picked.includes(input.value);
    });
    updateMultiSelectSummary(document.getElementById(to));
  });
  if (window.selectedLetters) {
    window.selectedLetters.clear();
    statsLetters.forEach(letter => window.selectedLetters.add(letter));
    document.querySelectorAll("#letterFilter .letter-btn").forEach(btn => {
      btn.classList.toggle("active", statsLetters.has(btn.textContent));
    });
  }
  searchQuery = "";
  document.getElementById("searchInput").value = "";
}

function renderStats() {
  const container = document.getElementById("statsContent");
  if (!container) return;

  renderStatsLetters();
  const scopeWords = statsWords();
  const levels = ["one", "two", "three"];
  const scopeLabel = selectedValues("statsScopeFilter")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + ") || "No scope";
  const lettersLabel = statsLetters.size ? ` · Letters ${[...statsLetters].sort().join(", ")}` : "";

  // ---- Learning ----
  const lc = learningCounts(scopeWords);
  const learningSegments = c => [
    { count: c.covered, cls: "seg-covered", label: "Covered" },
    { count: c.notCovered, cls: "seg-empty", label: "Not covered" }
  ];
  const learningRows = levels.map(level => {
    const c = learningCounts(scopeWords.filter(w => w.difficulty === level));
    if (!c.total) return "";
    return `
      <div class="mini-bar-row">
        <div class="mini-bar-row-header">
          <span class="mini-bar-title">${difficultyLabel(level)}</span>
          <span class="mini-bar-caption">${c.covered} of ${c.total} covered</span>
        </div>
        ${stackBarHtml(learningSegments(c), c.total, true)}
      </div>`;
  }).join("");

  // ---- Practice ----
  const pc = practiceCounts(scopeWords);
  const accuracy = pc.attempts ? Math.round((pc.correctAttempts / pc.attempts) * 100) : 0;
  const practiceSegments = c => [
    { count: c.correct, cls: "seg-correct", label: "Correct" },
    { count: c.wrong, cls: "seg-wrong", label: "Wrong" },
    { count: c.pending, cls: "seg-empty", label: "Not attempted" }
  ];
  const practiceRows = levels.map(level => {
    const c = practiceCounts(scopeWords.filter(w => w.difficulty === level));
    if (!c.total) return "";
    return `
      <div class="mini-bar-row">
        <div class="mini-bar-row-header">
          <span class="mini-bar-title">${difficultyLabel(level)}</span>
          <span class="mini-bar-caption">${c.correct} ✅ · ${c.wrong} ❌ · ${c.pending} left</span>
        </div>
        ${stackBarHtml(practiceSegments(c), c.total, true)}
      </div>`;
  }).join("");

  const missed = scopeWords
    .filter(w => w.practice.wrong > 0)
    .sort((a, b) => b.practice.wrong - a.practice.wrong || (a.practice.last === "wrong" ? -1 : 1))
    .slice(0, 10);
  const missedHtml = missed.length
    ? missed.map(w => `
        <button class="missed-word ${practiceStatus(w)}" data-word="${escapeHtml(w.word)}">
          <span>${escapeHtml(w.word)}</span>
          <span class="missed-count">✗${w.practice.wrong} ✓${w.practice.correct}</span>
        </button>`).join("")
    : `<div class="stats-empty">No misspelled words yet.</div>`;

  const sessions = practiceSessions().slice(-8).reverse();
  const sessionsHtml = sessions.length
    ? sessions.map(s => {
        const answered = (s.correct || 0) + (s.wrong || 0);
        const pct = answered ? Math.round((s.correct / answered) * 100) : 0;
        return `
          <div class="session-row">
            <div>
              <div class="session-score">${s.correct} / ${answered} <span class="session-pct">${pct}%</span></div>
              <div class="session-meta">${escapeHtml(formatSessionTimes(s))}</div>
              <div class="session-meta">${escapeHtml(formatSessionFilters(s))}</div>
            </div>
            ${stackBarHtml([
              { count: s.correct, cls: "seg-correct", label: "Correct" },
              { count: s.wrong, cls: "seg-wrong", label: "Wrong" }
            ], answered, true)}
          </div>`;
      }).join("")
    : `<div class="stats-empty">Finish a Practice test to see it here.</div>`;

  container.innerHTML = `
    <div class="stats-scope">${lc.total} words · ${escapeHtml(scopeLabel)} · ${escapeHtml(difficultySummary("statsDifficultyFilter"))}${escapeHtml(lettersLabel)}</div>

    <div class="stats-columns">
      <section class="stats-col" aria-label="Learning">
        <div class="stats-col-header learning"><h2 class="stats-heading">📖 Learning</h2></div>
        <div class="stat-grid">
          ${statTile("Total words", lc.total)}
          ${statTile("✓ Covered", lc.covered, "var(--covered)", "covered")}
          ${statTile("○ Not covered", lc.notCovered, null, "not-covered")}
          ${statTile("⚑ Marked for correction", lc.correction, "var(--accent-hover)", "correction")}
        </div>
        <div class="stat-section">
          <h3>Overall</h3>
          ${stackBarHtml(learningSegments(lc), lc.total, false)}
          <div class="stack-legend">
            <div class="legend-item"><span class="legend-swatch" style="background:var(--covered)"></span>Covered — <strong>${lc.covered}</strong></div>
            <div class="legend-item"><span class="legend-swatch" style="background:var(--border-strong)"></span>Not covered — <strong>${lc.notCovered}</strong></div>
            <div class="legend-item">${lc.total ? Math.round((lc.covered / lc.total) * 100) : 0}% covered</div>
          </div>
        </div>
        <div class="stat-section">
          <h3>By difficulty</h3>
          <div class="mini-bars">${learningRows || `<div class="stats-empty">No words.</div>`}</div>
        </div>
      </section>

      <section class="stats-col" aria-label="Practice">
        <div class="stats-col-header practice"><h2 class="stats-heading">✍️ Practice</h2></div>
        <div class="stat-grid">
          ${statTile("✅ Spelled right", pc.correct, "var(--success)", "practice-correct")}
          ${statTile("❌ Spelled wrong", pc.wrong, "var(--danger)", "practice-wrong")}
          ${statTile("⏳ Not attempted", pc.pending, null, "practice-pending")}
          ${statTile("🎯 Accuracy", `${accuracy}%`)}
        </div>
        <div class="stat-section">
          <h3>Overall</h3>
          ${stackBarHtml([
            { count: pc.correctAttempts, cls: "seg-correct", label: "Correct attempts" },
            { count: pc.wrongAttempts, cls: "seg-wrong", label: "Wrong attempts" }
          ], pc.attempts, false)}
          <div class="stack-legend">
            <div class="legend-item">Total attempts — <strong>${pc.attempts}</strong></div>
            <div class="legend-item"><span class="legend-swatch" style="background:var(--success)"></span>Correct — <strong>${pc.correctAttempts}</strong></div>
            <div class="legend-item"><span class="legend-swatch" style="background:var(--danger)"></span>Wrong — <strong>${pc.wrongAttempts}</strong></div>
            <div class="legend-item">${accuracy}% correct</div>
          </div>
        </div>
        <div class="stat-section">
          <h3>By difficulty</h3>
          <div class="mini-bars">${practiceRows || `<div class="stats-empty">No words.</div>`}</div>
        </div>
        <div class="stat-section">
          <h3>Most missed words</h3>
          <div class="missed-list">${missedHtml}</div>
        </div>
        <div class="stat-section">
          <h3>Recent tests</h3>
          <div class="session-list">${sessionsHtml}</div>
        </div>
      </section>
    </div>
  `;

  container.querySelectorAll(".stat-filter").forEach(tile => {
    const open = () => {
      copyStatsFiltersToLearning();
      showFilteredResults(tile.dataset.filter);
    };
    tile.addEventListener("click", open);
    tile.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  });
  container.querySelectorAll(".missed-word").forEach(btn => {
    btn.addEventListener("click", () => {
      copyStatsFiltersToLearning();
      showWordInLearning(btn.dataset.word);
    });
  });
}

/* ---------------------------
   Reset
--------------------------- */
async function confirmReset() {
  if (!confirm("⚠️ This will reset ALL progress — covered words, practice history and test results.\n\nContinue?")) return;
  if (!confirm("❗ Are you REALLY sure?")) return;
  if (!confirm("🛑 Last chance: all progress will be permanently deleted. This cannot be undone.\n\nDelete everything?")) return;
  await resetSelection();
}

async function resetSelection() {
  currentIndex = -1;
  currentItem = null;
  searchQuery = "";
  document.getElementById("correctionCheckbox").checked = false;
  document.getElementById("correctionNote").value = "";
  document.getElementById("correctionNote").hidden = true;

  words.forEach(w => {
    w.covered = false;
    w.markedForCorrection = false;
    w.correctionNote = "";
    w.practice = emptyPractice();
  });

  document.querySelectorAll("#difficultyFilter input").forEach(input => (input.checked = true));
  updateMultiSelectSummary(document.getElementById("difficultyFilter"));
  setResultFilter("all");
  document.getElementById("searchInput").value = "";

  if (window.selectedLetters) {
    window.selectedLetters.clear();
    document
      .querySelectorAll("#letterFilter .letter-btn.active")
      .forEach(b => b.classList.remove("active"));
  }

  stopAllAudio();
  showCardWord(null);
  renderPronunciations(null);
  renderSourceBadge("definitionSource", null);
  renderSourceBadge("sentenceSource", null);
  renderWordCardStatus();
  await resetCloudProgress();
  applyFilter();
  if (typeof onWordsLoaded === "function") onWordsLoaded();
}

/* ---------------------------
   MW button state
--------------------------- */
function updateMWButtonState(item) {
  const btn = document.getElementById("mwPronunciationBtn");
  if (btn) btn.disabled = !item?.audio_url;
}
