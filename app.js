let words = [];
let filteredWords = [];
let currentIndex = -1;
let currentItem = null;               // canonical selected word

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

/* Practice tests saved part-way through ("Save for later"), so they can be
   resumed on any device. Stored as { id: test } so each one is saved or
   removed on its own; ending or finishing a test removes it. Also kept in
   this browser in case the progress doc can't be reached. */
const SAVED_TESTS_KEY = "_savedPracticeTests";
const SAVED_TESTS_LOCAL = "spellingBeeSavedPracticeTests";
const MAX_SAVED_TESTS = 10; // the whole progress doc has to stay under Firestore's 1 MB

function savedTestsMap() {
  if (progressData) return progressData[SAVED_TESTS_KEY] || {};
  try {
    return JSON.parse(localStorage.getItem(SAVED_TESTS_LOCAL)) || {};
  } catch {
    return {};
  }
}

// Newest first
function savedPracticeTests() {
  return Object.entries(savedTestsMap())
    .map(([id, test]) => ({ ...test, id }))
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

// `test` = null removes that saved test
async function storeSavedPracticeTest(id, test) {
  const map = { ...savedTestsMap() };
  if (test) map[id] = test;
  else delete map[id];
  if (progressData) progressData[SAVED_TESTS_KEY] = map;
  try {
    localStorage.setItem(SAVED_TESTS_LOCAL, JSON.stringify(map));
  } catch {
    // private browsing / storage full: the progress doc still has them
  }
  if (!window.db) return;
  try {
    const { doc, setDoc, deleteField } = await import(FIRESTORE_URL);
    await setDoc(
      doc(window.db, "progress", USER_ID),
      { [SAVED_TESTS_KEY]: { [id]: test || deleteField() } },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save the practice test:", err);
  }
}

async function resetCloudProgress() {
  try { localStorage.removeItem(SAVED_TESTS_LOCAL); } catch {}
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
  school: "word_list_school.json?v=2026101302",
  regional: "word_list_regional.json?v=2026102601"
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
  item.coveredAt = item.covered ? obj.coveredAt || null : null;
  item.markedForCorrection = obj.markedForCorrection === true;
  item.correctionNote = obj.correctionNote || "";
  item.imageHidden = obj.imageHidden === true;
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
        coveredAt: null,
        markedForCorrection: false,
        correctionNote: "",
        imageHidden: false,
        practice: emptyPractice()
      }));
    })
  ]);

  words = datasets.flat();
  const defaultScopes = savedDefaultScopes();
  if (defaultScopes) {
    applyDefaultScopes(defaultScopes, true);
    try { localStorage.setItem(DEFAULT_SCOPES_LOCAL, JSON.stringify(defaultScopes)); } catch {}
  }
  if (progress) applyProgressToWords(progress);
  else retryProgressLoad();

  // Shuffle starts on (the button's aria-pressed in index.html)
  if (!shuffleRanks && document.getElementById("shuffleWordsBtn").getAttribute("aria-pressed") === "true") {
    shuffleRanks = newShuffleRanks();
  }
  applyFilter();
  if (typeof onWordsLoaded === "function") onWordsLoaded();
  // A refresh on Stats opened it before the words arrived: draw it with them now
  if (activeTab === "stats") renderStats();
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

// Every word is in exactly one of these: "everWrong" = wrong in any attempt,
// even if right since; "alwaysRight" = practiced and never wrong; "pending" =
// never practiced
function practiceGroup(item) {
  if (item.practice.wrong > 0) return "everWrong";
  return item.practice.attempts > 0 ? "alwaysRight" : "pending";
}

/* ---------------------------
   Init
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadAmericanVoice();

  // Scope and Difficulty (Results and Origin are wired by wireFilterSelect)
  document.querySelectorAll(".multi-select:not(.filter-select) input[type=checkbox]").forEach(input => {
    input.addEventListener("change", event => {
      updateMultiSelectSummary(event.target.closest(".multi-select"));
      if (event.target.closest("#learningTab")) applyFilter();
      else if (event.target.closest("#statsTab")) renderStats();
    });
  });

  // Default scope: this browser's copy now; the saved one once progress loads
  const localDefault = savedDefaultScopes();
  if (localDefault) applyDefaultScopes(localDefault, true);
  else updateDefaultScopeButtons();
  SCOPE_DROPDOWNS.forEach(id => {
    const container = document.getElementById(id);
    container.addEventListener("change", updateDefaultScopeButtons);
    container.querySelector(".scope-default-btn").addEventListener("click", () => makeDefaultScope(id));
  });

  wireFilterSelect("resultFilter", applyFilter);
  wireFilterSelect("originFilter", applyFilter);
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

  document.getElementById("searchInput").addEventListener("input", applyFilter);
  document.getElementById("clearLearningFilters").addEventListener("click", clearLearningFilters);
  document.getElementById("shuffleWordsBtn").addEventListener("click", toggleShuffle);

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
  // After practice.js has wired itself up too (its DOMContentLoaded runs after this one)
  setTimeout(restoreTab, 0);
  watchForNewVersion();
  renderLearningLetters(); // plain letters until the words load
});

/* ---------------------------
   Auto-refresh when a new version is deployed
   Nothing is checked on a timer. After GitHub Pages deploys main, the
   "Announce new version" workflow writes the deployed script versions (the
   ?v= on each script tag) to Firestore meta/version, and this page listens to
   that doc live. If they differ from the versions running here, there's new
   code. The page reloads only when nobody is mid-way through something: never
   while a test or its results are open, and only while the app is in the
   background, just reopened, or untouched for a minute (or since it loaded).
--------------------------- */
const UPDATE_IDLE_MS = 60 * 1000;
const RELOADED_FOR_KEY = "spellingBeeReloadedFor";
let updateWaiting = null;   // the newer versions, once announced
let updateRetry = null;
let lastInteraction = 0;    // 0 = not touched since the page loaded

function scriptVersions() {
  return [...document.querySelectorAll('script[src*="?v="]')].map(s => s.getAttribute("src")).join(" ");
}

function safeToReload(returning) {
  const testOpen = typeof practice !== "undefined" && practice && activeTab === "practice";
  const idle = Date.now() - lastInteraction >= UPDATE_IDLE_MS;
  return !testOpen && (document.hidden || returning || idle);
}

function reloadIfSafe(returning = false) {
  if (!updateWaiting || !safeToReload(returning)) return;
  // A reload that still brings back the old copy (cached for a few minutes)
  // must not reload again and again: one try per announced version
  try { sessionStorage.setItem(RELOADED_FOR_KEY, updateWaiting); } catch {}
  location.reload();
}

async function watchForNewVersion() {
  if (!window.db) return;
  try {
    const { doc, onSnapshot } = await import(FIRESTORE_URL);
    onSnapshot(doc(window.db, "meta", "version"), snap => {
      const live = snap.data()?.scripts;
      let triedAlready = false;
      try { triedAlready = sessionStorage.getItem(RELOADED_FOR_KEY) === live; } catch {}
      if (!live || live === scriptVersions() || triedAlready) return;
      updateWaiting = live;
      reloadIfSafe();
      // Not a good moment: look again now and then (no network, just this page's state)
      if (!updateRetry) updateRetry = setInterval(reloadIfSafe, 15 * 1000);
    }, err => console.warn("Can't watch for new versions:", err));
  } catch (err) {
    console.warn("Can't watch for new versions:", err);
  }
}

document.addEventListener("visibilitychange", () => reloadIfSafe(!document.hidden));
["pointerdown", "keydown"].forEach(type =>
  document.addEventListener(type, () => { lastInteraction = Date.now(); }, { passive: true })
);

/* ---------------------------
   Tabs
--------------------------- */
let activeTab = "learning";
// The open tab is remembered for this browser tab, so a refresh comes back to it
const TAB_KEY = "spellingBeeActiveTab";

function restoreTab() {
  let tab = null;
  try { tab = sessionStorage.getItem(TAB_KEY); } catch {}
  if (tab && tab !== activeTab && document.getElementById(`${tab}Tab`)) switchTab(tab);
}

function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `${tab}Tab`)
  );

  const leaving = activeTab;
  activeTab = tab;
  try { sessionStorage.setItem(TAB_KEY, tab); } catch {}
  stopAllAudio();
  if (leaving === "practice" && tab !== "practice" && typeof leavePractice === "function") leavePractice();
  if (tab === "stats") renderStats();
  if (tab === "practice" && typeof openPractice === "function") openPractice();
}

// Opening Learning from a Stats tile or word shows exactly those words:
// any Origin pick there would hide some of them
function showFilteredResults(filter) {
  setFilterSelect("resultFilter", [filter]);
  setFilterSelect("originFilter", []);
  switchTab("learning");
  applyFilter();
}

function showWordInLearning(word) {
  setFilterSelect("resultFilter", []);
  setFilterSelect("originFilter", []);
  document.getElementById("searchInput").value = word;
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

// An option's name without its count badge: "School", not "School450"
function optionText(input) {
  return input.dataset.label || Array.from(input.parentElement.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent).join("").trim();
}

// Shows how many words an option would match (right-aligned, like Origin's)
function setOptionCount(input, count) {
  let badge = input.parentElement.querySelector(".option-count");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "option-count";
    input.parentElement.append(badge);
  }
  badge.textContent = count;
}

// Learning dropdown counts, each counted within the filters before it:
// Scope from every word, Difficulty within the picked scopes, Results within
// Scope + Difficulty, Origin within Scope + Difficulty + Results
function renderLearningCounts() {
  const scopes = selectedValues("scopeFilter");
  const levels = selectedValues("difficultyFilter");
  document.querySelectorAll('#scopeFilter input[type="checkbox"]').forEach(input =>
    setOptionCount(input, words.filter(w => w._scope === input.value).length));
  const inScope = words.filter(w => scopes.includes(w._scope));
  document.querySelectorAll('#difficultyFilter input[type="checkbox"]').forEach(input =>
    setOptionCount(input, inScope.filter(w => w.difficulty === input.value).length));
  const base = inScope.filter(w => levels.includes(w.difficulty));
  document.querySelectorAll('#resultFilter input[type="checkbox"]').forEach(input =>
    setOptionCount(input, input.value === "all"
      ? base.length
      : base.filter(w => matchesResultFilter(w, input.value)).length));
  renderOriginOptions(LEARNING_FILTERS.origin, wordsBeforeOrigin(LEARNING_FILTERS));
}

function updateMultiSelectSummary(container) {
  const selected = Array.from(container.querySelectorAll("input:checked"));
  const summary = container.querySelector("summary");
  const kind = container.dataset.kind; // "scope" or "difficulty"
  if (kind === "scope") updateDefaultScopeButtons();
  if (!selected.length) {
    summary.textContent = kind === "scope" ? "Select scope" : "No difficulty";
    return;
  }
  if (kind === "difficulty" && selected.length === 3) {
    summary.textContent = "All Bees";
    return;
  }
  summary.textContent = selected.map(optionText).join(", ");
}

/* ---------------------------
   Results and Origin dropdowns (Learning and Practice)
   Multi-select checkboxes with an "All" option: ticking "All" clears the
   others, ticking anything else clears "All", and clearing everything goes
   back to "All".
--------------------------- */
function filterSelectValues(id) {
  return selectedValues(id).filter(value => value !== "all");
}

function updateFilterSelectSummary(id) {
  const container = document.getElementById(id);
  const names = Array.from(container.querySelectorAll('input[type="checkbox"]:checked'))
    .filter(input => input.value !== "all")
    .map(optionText);
  container.querySelector(".summary-text").textContent = !names.length
    ? container.dataset.allText
    : names.length <= 2 ? names.join(", ") : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function setFilterSelect(id, values) {
  const container = document.getElementById(id);
  container.querySelectorAll('input[type="checkbox"]').forEach(input => {
    input.checked = values.length ? values.includes(input.value) : input.value === "all";
  });
  updateFilterSelectSummary(id);
}

/* ---------------------------
   Clear filters (Learning and Practice): back to how the page opens.
   Scope and Difficulty go back to their ticked-in-the-HTML options;
   Results and Origin go back to "All".
--------------------------- */
function resetFilterDropdowns(ids) {
  ids.forEach(id => {
    const container = document.getElementById(id);
    if (container.classList.contains("filter-select")) {
      setFilterSelect(id, []);
    } else {
      container.querySelectorAll('input[type="checkbox"]').forEach(input => (input.checked = input.defaultChecked));
      updateMultiSelectSummary(container);
    }
  });
}

function filterDropdownsAtDefault(ids) {
  return ids.every(id => {
    const container = document.getElementById(id);
    return container.classList.contains("filter-select")
      ? !filterSelectValues(id).length
      : Array.from(container.querySelectorAll('input[type="checkbox"]')).every(input => input.checked === input.defaultChecked);
  });
}

const LEARNING_DROPDOWNS = ["scopeFilter", "difficultyFilter", "resultFilter", "originFilter"];

/* ---------------------------
   Default scope, shared by all three tabs. It's what each tab opens with and
   what Clear filters goes back to (the Scope checkboxes' defaultChecked).
   Saved in the progress doc so it follows to other devices, and in this
   browser so the page opens with it before the progress doc arrives.
--------------------------- */
const SCOPE_DROPDOWNS = ["scopeFilter", "practiceScopeFilter", "statsScopeFilter"];
const SETTINGS_KEY = "_settings";
const DEFAULT_SCOPES_LOCAL = "spellingBeeDefaultScopes";

function savedDefaultScopes() {
  const fromDoc = progressData?.[SETTINGS_KEY]?.defaultScopes;
  if (Array.isArray(fromDoc) && fromDoc.length) return fromDoc;
  try {
    const local = JSON.parse(localStorage.getItem(DEFAULT_SCOPES_LOCAL));
    if (Array.isArray(local) && local.length) return local;
  } catch {}
  return null;
}

// Makes `scopes` the default in every tab; `select` also ticks them now
function applyDefaultScopes(scopes, select) {
  SCOPE_DROPDOWNS.forEach(id => {
    const container = document.getElementById(id);
    container.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.defaultChecked = scopes.includes(input.value);
      if (select) input.checked = input.defaultChecked;
    });
    updateMultiSelectSummary(container);
  });
  updateDefaultScopeButtons();
}

function updateDefaultScopeButtons() {
  SCOPE_DROPDOWNS.forEach(id => {
    const inputs = Array.from(document.querySelectorAll(`#${id} input[type="checkbox"]`));
    const isDefault = inputs.every(input => input.checked === input.defaultChecked);
    const btn = document.querySelector(`#${id} .scope-default-btn`);
    btn.disabled = isDefault || !inputs.some(input => input.checked);
    btn.textContent = isDefault ? "⭐ Default scope for all tabs" : "☆ Make this the default scope";
  });
}

async function saveDefaultScopes(scopes) {
  try { localStorage.setItem(DEFAULT_SCOPES_LOCAL, JSON.stringify(scopes)); } catch {}
  if (progressData) progressData[SETTINGS_KEY] = { ...(progressData[SETTINGS_KEY] || {}), defaultScopes: scopes };
  if (!window.db) return;
  try {
    const { doc, setDoc } = await import(FIRESTORE_URL);
    await setDoc(doc(window.db, "progress", USER_ID), { [SETTINGS_KEY]: { defaultScopes: scopes } }, { merge: true });
  } catch (err) {
    console.warn("Could not save the default scope:", err);
  }
}

// The picked scopes become the default, and every tab switches to them
function makeDefaultScope(id) {
  const scopes = selectedValues(id);
  if (!scopes.length) return;
  saveDefaultScopes(scopes);
  applyDefaultScopes(scopes, true);
  document.getElementById(id).open = false;
  applyFilter();
  if (typeof practiceFiltersChanged === "function" && !(practice && practice.index >= 0)) practiceFiltersChanged();
  else if (typeof updateClearPracticeButton === "function") updateClearPracticeButton();
  renderStats();
}

function clearLearningFilters() {
  resetFilterDropdowns(LEARNING_DROPDOWNS);
  document.getElementById("searchInput").value = "";
  window.selectedLetters.clear();
  applyFilter();
}

function updateClearLearningButton() {
  document.getElementById("clearLearningFilters").disabled =
    filterDropdownsAtDefault(LEARNING_DROPDOWNS) &&
    !document.getElementById("searchInput").value.trim() &&
    !window.selectedLetters.size;
}

// Listens on the dropdown itself because Origin's options are rebuilt
function wireFilterSelect(id, onChange) {
  const container = document.getElementById(id);
  container.addEventListener("change", event => {
    const input = event.target;
    if (input.type !== "checkbox") return;
    const all = container.querySelector('input[value="all"]');
    if (input === all) {
      if (all.checked) container.querySelectorAll('input[type="checkbox"]').forEach(i => (i.checked = i === all));
      else all.checked = true; // "All" can't be unticked on its own
    } else {
      all.checked = !filterSelectValues(id).length;
    }
    updateFilterSelectSummary(id);
    onChange();
  });
}

// "Not started" vs "Completed": a word counts as completed once it's been
// opened on the Learning card or attempted in Practice
function isCompleted(item) {
  return item.covered || item.practice.attempts > 0;
}

function matchesResultFilter(w, filter) {
  switch (filter) {
    case "completed": return isCompleted(w);
    case "not-started": return !isCompleted(w);
    case "practice-ever-wrong": return practiceGroup(w) === "everWrong";
    case "practice-always-right": return practiceGroup(w) === "alwaysRight";
    case "practice-pending": return practiceGroup(w) === "pending";
    case "correction": return w.markedForCorrection;
    default: return true;
  }
}

// Picks in the same group widen the list (Spelled wrong OR Not practiced);
// picks in different groups narrow it (Completed AND Spelled wrong)
const RESULT_GROUPS = [
  ["completed", "not-started", "correction"],
  ["practice-ever-wrong", "practice-always-right", "practice-pending"]
];

function matchesResults(w, picked) {
  return RESULT_GROUPS.every(group => {
    const chosen = group.filter(value => picked.includes(value));
    return !chosen.length || chosen.some(value => matchesResultFilter(w, value));
  });
}

// Languages in a word's origin: "Latin, French" -> ["Latin", "French"]
function originsOf(item) {
  return (item.origin || "").split(",").map(s => s.trim()).filter(Boolean);
}

// One option per language among `baseWords` (the words matching the filters
// before Origin), with counts. Picked languages stay listed (count 0) even if
// those filters no longer include them, so they can still be unticked.
function renderOriginOptions(id, baseWords) {
  const menu = document.querySelector(`#${id} .multi-select-menu`);
  const picked = filterSelectValues(id);
  const counts = new Map(picked.map(origin => [origin, 0]));
  baseWords.forEach(w => originsOf(w).forEach(o => counts.set(o, (counts.get(o) || 0) + 1)));

  const option = (value, text, count) => {
    const label = document.createElement("label");
    label.className = "multi-select-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = value;
    input.dataset.label = text;
    input.checked = value === "all" ? !picked.length : picked.includes(value);
    const countEl = document.createElement("span");
    countEl.className = "option-count";
    countEl.textContent = count;
    label.append(input, text, countEl);
    return label;
  };

  const scrollTop = menu.scrollTop; // rebuilt while open: don't jump to the top
  menu.replaceChildren(
    option("all", "All origins", baseWords.length),
    ...[...counts].sort((a, b) => a[0].localeCompare(b[0])).map(([o, n]) => option(o, o, n))
  );
  menu.scrollTop = scrollTop;
  updateFilterSelectSummary(id);
}

/* Shared filtering for Learning and Practice. Each tab names its own controls. */
const LEARNING_FILTERS = {
  scope: "scopeFilter", difficulty: "difficultyFilter", results: "resultFilter",
  origin: "originFilter", search: "searchInput", letters: () => window.selectedLetters
};

// Scope, Difficulty and Results: the words the Origin options are counted from
function wordsBeforeOrigin(f) {
  const scopes = selectedValues(f.scope);
  const levels = selectedValues(f.difficulty);
  const results = filterSelectValues(f.results);
  return words.filter(w =>
    scopes.includes(w._scope) && levels.includes(w.difficulty) && matchesResults(w, results)
  );
}

// Every filter; `ignoreLetters` gives the words the letter buttons are counted from
function wordsMatchingFilters(f, { ignoreLetters = false } = {}) {
  const base = wordsBeforeOrigin(f);
  renderOriginOptions(f.origin, base);
  const origins = filterSelectValues(f.origin);
  const query = document.getElementById(f.search).value.toLowerCase().trim();
  const letters = f.letters();
  return base.filter(w =>
    (!origins.length || originsOf(w).some(o => origins.includes(o))) &&
    w.word.toLowerCase().includes(query) &&
    (ignoreLetters || !letters || !letters.size || letters.has(firstLetter(w.word)))
  );
}

// A word's letter-button letter, ignoring accents: "éclair" -> "E"
function firstLetter(word) {
  return word.normalize("NFD").charAt(0).toUpperCase();
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
   Shuffle (Learning word list)
   While on, every word keeps one random position, so the order doesn't
   jump around as filters change. Off goes back to the list's own order.
--------------------------- */
let shuffleRanks = null; // "scope:word" -> random position, while Shuffle is on

function wordKey(item) {
  return `${item._scope}:${item.word}`;
}

function newShuffleRanks() {
  const keys = words.map(wordKey);
  shuffleArray(keys);
  return new Map(keys.map((key, i) => [key, i]));
}

function toggleShuffle() {
  shuffleRanks = shuffleRanks ? null : newShuffleRanks();
  document.getElementById("shuffleWordsBtn").setAttribute("aria-pressed", String(!!shuffleRanks));
  applyFilter();
  document.getElementById("wordList").closest(".word-list").scrollTop = 0;
}

/* ---------------------------
   Filtering
--------------------------- */
function applyFilter() {
  // The letter buttons count every filter except the letters themselves
  const pool = wordsMatchingFilters(LEARNING_FILTERS, { ignoreLetters: true });
  const letters = window.selectedLetters;
  filteredWords = letters.size ? pool.filter(w => letters.has(firstLetter(w.word))) : pool;
  letterPool = pool;
  renderLearningLetters(pool);
  if (filterSelectValues(LEARNING_FILTERS.results).includes("practice-ever-wrong")) {
    // Most misspelled first, even while Shuffle is on; ties keep their usual order
    filteredWords.sort((a, b) => b.practice.wrong - a.practice.wrong);
  } else if (shuffleRanks) {
    filteredWords.sort((a, b) => (shuffleRanks.get(wordKey(a)) ?? 0) - (shuffleRanks.get(wordKey(b)) ?? 0));
  }

  // Keep the selected word highlighted if it's still in the list
  currentIndex = currentItem ? filteredWords.indexOf(currentItem) : -1;

  updateLetterSummary("letterFilter", window.selectedLetters || new Set());
  updateClearLearningButton();
  renderWordList();
  updateProgress();
}

window.applyFilters = applyFilter;

/* Learning letter buttons: each has a bar of completed (blue) vs not started
   (grey) words, like the Practice tab's letters.
   Letters combine; adding one jumps the word list to that letter's words. */
let letterPool = []; // the words the buttons were last counted from

function renderLearningLetters(pool = letterPool) {
  const container = document.getElementById("letterFilter");
  const counts = {};
  pool.forEach(w => {
    const c = counts[firstLetter(w.word)] || (counts[firstLetter(w.word)] = { total: 0, completed: 0 });
    c.total++;
    if (isCompleted(w)) c.completed++;
  });
  const loaded = words.length > 0; // before the word lists arrive, plain letters

  container.replaceChildren(..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map(letter => {
    const c = counts[letter] || { total: 0, completed: 0 };
    const btn = document.createElement("button");
    btn.className = "letter-btn graded";
    btn.classList.toggle("active", window.selectedLetters.has(letter));
    btn.classList.toggle("no-words", loaded && !c.total);
    btn.append(letter);
    if (loaded) {
      btn.title = c.total
        ? `${letter}: ${c.total} word${c.total === 1 ? "" : "s"} · ${c.completed} completed · ${c.total - c.completed} not started`
        : `${letter}: no words`;
    }
    if (c.total) {
      const pct = (c.completed / c.total) * 100;
      const grade = document.createElement("span");
      grade.className = "letter-grade";
      grade.style.background =
        `linear-gradient(to right, var(--covered) 0 ${pct}%, var(--border-strong) ${pct}% 100%)`;
      btn.append(grade);
    }
    btn.onclick = () => {
      const adding = !window.selectedLetters.has(letter);
      if (adding) window.selectedLetters.add(letter);
      else window.selectedLetters.delete(letter);
      applyFilter();
      if (adding) showLetterInWordList(letter);
    };
    return btn;
  }));
}

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
    if (item.image_url) {
      const pic = document.createElement("span");
      pic.className = "wi-pic" + (item.imageHidden ? " hidden-pic" : "");
      pic.textContent = "🖼️";
      pic.title = item.imageHidden ? "Has a picture (hidden)" : "Has a picture";
      label.appendChild(pic);
    }
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
    // Practice results win over "completed"; a wrong latest attempt shows red
    const status = practiceStatus(item);
    if (status === "wrong") div.classList.add("wrong");
    else if (status === "correct") div.classList.add("correct");
    else if (isCompleted(item)) div.classList.add("covered");

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
  const index = filteredWords.findIndex(w => firstLetter(w.word) === letter);
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

// Recordings (and finally the device voice) still to play after the current
// one; see playMWSequence
let audioQueue = [];
let audioQueueTimer = null;
const PRONUNCIATION_GAP_MS = 600; // pause between one pronunciation and the next

// A recording that hasn't started playing this long after being asked for is
// treated as stuck and asked for again
const AUDIO_START_TIMEOUT_MS = 3000;
let audioWatchdog = null;
let audioRequest = null; // { url, retry } of the recording being loaded/played

function stopAllAudio() {
  if (synth) synth.cancel();
  audioQueue = [];
  clearTimeout(audioQueueTimer);
  releaseAudio();
}

// Pausing alone leaves a half-loaded recording's request open, and the browser
// makes the next request for the same file wait behind it. That left MW audio
// silent, even when tapped, for a minute or two until the request timed out.
function releaseAudio() {
  clearTimeout(audioWatchdog);
  audioRequest = null;
  audioPlayer.pause();
  if (audioPlayer.hasAttribute("src")) {
    audioPlayer.removeAttribute("src");
    audioPlayer.load();
  }
}

// Plays one recording on the shared element. If it hasn't started in time or
// fails to load, it's asked for once more under a fresh URL (so it can't queue
// behind a stuck request); if that fails too it's skipped.
function startAudio(url, retry = false) {
  releaseAudio();
  const request = audioRequest = { url, retry };
  audioPlayer.src = retry ? `${url}${url.includes("?") ? "&" : "?"}r=${Date.now()}` : url;
  audioPlayer.play().catch(err => {
    // Blocked without a tap: retrying won't help
    if (err.name === "NotAllowedError" && audioRequest === request) clearTimeout(audioWatchdog);
  });
  audioWatchdog = setTimeout(() => audioStalled(request), AUDIO_START_TIMEOUT_MS);
}

function audioStalled(request) {
  if (audioRequest !== request) return;
  if (!request.retry) startAudio(request.url, true);
  else {
    releaseAudio();
    playNextQueued();
  }
}

function playMWAudio(url) {
  stopAllAudio();
  startAudio(url);
}

// Plays the recordings one after another, then says `speakText` in the
// device's American voice. A recording that fails to load is skipped.
function playMWSequence(urls, speakText) {
  const [first, ...rest] = [...new Set(urls)];
  if (!first) {
    if (speakText) speakAmerican(speakText);
    return;
  }
  playMWAudio(first);
  audioQueue = speakText ? [...rest, { speak: speakText }] : rest;
}

function playNextQueued() {
  if (!audioQueue.length) return;
  audioQueueTimer = setTimeout(() => {
    const next = audioQueue.shift();
    if (next.speak) {
      speakAmerican(next.speak);
      return;
    }
    startAudio(next);
  }, PRONUNCIATION_GAP_MS);
}

audioPlayer.addEventListener("playing", () => clearTimeout(audioWatchdog));
audioPlayer.addEventListener("ended", () => {
  audioRequest = null;
  playNextQueued();
});
// Errors from releasing the element (no src) aren't failed recordings
audioPlayer.addEventListener("error", () => {
  if (audioRequest && audioPlayer.hasAttribute("src")) {
    clearTimeout(audioWatchdog);
    audioStalled(audioRequest);
  }
});

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
  renderPicture(currentItem);
  renderCardTips(currentItem);
  document.getElementById("correctionCheckbox").checked = currentItem.markedForCorrection;
  document.getElementById("correctionNote").value = currentItem.correctionNote;
  updateCorrectionNoteState(currentItem);
  renderWordCardStatus();

  updateMWButtonState(currentItem);

  // Every recorded pronunciation, MW's preferred one first, then the device's American voice
  if (!autoplay) stopAllAudio();
  else playMWSequence(recordedPronunciations(currentItem), currentItem.word);

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

// Language-of-origin tips that fit this word (spelling-help.js)
function renderCardTips(item) {
  const tips = item ? spellingTips(item) : [];
  document.getElementById("spellingTipsSection").hidden = !tips.length;
  renderSpellingTips(document.getElementById("spellingTips"), tips);
}

// The last few misspellings from Practice, newest first, each lined up with
// the right spelling: "dashund  Missing “ch”  · Oct 11"
function renderPastMistakes(item) {
  const mistakes = (item?.practice.misspellings || []).slice().reverse();
  document.getElementById("pastMistakesSection").hidden = !mistakes.length;
  document.getElementById("pastMistakes").replaceChildren(...mistakes.map(m => {
    const steps = spellingDiff(item.word, m.typed);
    const li = document.createElement("li");
    const note = document.createElement("span");
    note.className = "pm-note";
    note.textContent = mistakeNotes(steps, 2).join(" · ");
    const when = document.createElement("span");
    when.className = "pm-when";
    const date = new Date(m.at);
    when.textContent = isNaN(date) ? "" : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    li.append(renderSpellingDiff(steps, "got"), note, when);
    return li;
  }));
}

// The word's picture, if the word file has one. A picture can be hidden (a wrong
// or unhelpful match); that's saved with the word and can be undone.
function renderPicture(item) {
  const section = document.getElementById("pictureSection");
  section.hidden = !item?.image_url;
  if (section.hidden) return;

  const img = document.getElementById("wordPicture");
  const source = document.getElementById("pictureSource");
  const isMW = item.image_source === "merriam_webster";
  document.getElementById("pictureFrame").hidden = item.imageHidden;
  document.getElementById("pictureHiddenNote").hidden = !item.imageHidden;
  document.getElementById("togglePictureBtn").textContent =
    item.imageHidden ? "Show picture" : "Wrong or unhelpful picture? Hide it";
  source.textContent = isMW ? "📖 Merriam-Webster" : "🌐 Wikipedia";
  source.href = item.image_link || item.image_url;
  source.title = item.image_credit || "";
  img.alt = `Picture of ${item.word}`;
  // A picture that no longer loads is left out instead of showing a broken image
  img.onerror = () => { if (currentItem === item) section.hidden = true; };
  if (img.getAttribute("src") !== item.image_url) img.src = item.image_url;
}

function togglePicture() {
  if (!currentItem) return;
  currentItem.imageHidden = !currentItem.imageHidden;
  saveWord(currentItem, { imageHidden: currentItem.imageHidden });
  renderPicture(currentItem);
  renderWordList();
}

document.getElementById("togglePictureBtn").addEventListener("click", togglePicture);

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
  // When it was learned, for Stats > Activity; undoing clears it
  item.coveredAt = covered ? item.coveredAt || new Date().toISOString() : null;
  // Don't wait on the network before showing the word and playing audio
  saveWord(item, { covered, coveredAt: item.coveredAt });
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
  renderPastMistakes(currentItem);
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
  renderLearningCounts(); // "Marked for correction" count

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
  renderLearningLetters(); // a word just completed (or cleared) moves its letter's bar
  const total = filteredWords.length;
  const completed = filteredWords.filter(isCompleted).length;

  document.getElementById("categoryCount").innerText =
    `${difficultySummary()} — ${total} words`;

  document.getElementById("progressText").innerText =
    `${completed} / ${total} completed`;

  const fill = document.getElementById("progressBarFill");
  if (fill) {
    const pct = total ? Math.round((completed / total) * 100) : 0;
    fill.style.width = `${pct}%`;
  }

  // Opening or practicing a word moves it between Results groups
  renderLearningCounts();
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
  const completed = list.filter(isCompleted).length;
  return {
    total: list.length,
    completed,
    notStarted: list.length - completed,
    correction: list.filter(w => w.markedForCorrection).length
  };
}

// "c" / "w" for the word's first attempt, or null if never practiced or it
// can't be told (mixed results from before history was kept)
function firstAttemptResult(p) {
  if (!p.attempts) return null;
  if (!p.wrong) return "c";
  if (!p.correct) return "w";
  return (p.history || "").length === p.attempts ? p.history[0] : null;
}

function practiceCounts(list) {
  const counts = {
    total: list.length, alwaysRight: 0, everWrong: 0, pending: 0, // practiceGroup
    stillWrong: 0, // ever wrong and wrong on the latest attempt
    attempts: 0, correctAttempts: 0, wrongAttempts: 0,
    firstTried: 0, firstTryCorrect: 0 // words whose first attempt is known
  };
  list.forEach(w => {
    const p = w.practice;
    counts[practiceGroup(w)]++;
    if (practiceStatus(w) === "wrong") counts.stillWrong++;
    counts.attempts += p.attempts;
    counts.correctAttempts += p.correct;
    counts.wrongAttempts += p.wrong;

    const first = firstAttemptResult(p);
    if (first) {
      counts.firstTried++;
      if (first === "c") counts.firstTryCorrect++;
    }
  });
  return counts;
}

function percent(part, whole) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
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

function statTile(label, value, color, filter, extraClass = "", note = "") {
  const attrs = filter
    ? ` stat-filter" data-filter="${filter}" role="button" tabindex="0" title="Show these words in Learning`
    : "";
  return `
    <div class="stat-tile${extraClass ? ` ${extraClass}` : ""}${attrs}">
      <div class="stat-label">${label}</div>
      <div class="stat-value"${color ? ` style="color:${color}"` : ""}>${value}</div>
      ${note ? `<div class="stat-note">${note}</div>` : ""}
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
    // Time actually spent on the test; older tests only have start and end
    const ms = typeof session.activeMs === "number" ? session.activeMs : end - start;
    const minutes = Math.round(ms / 60000);
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
    session.results || "",
    session.origins && session.origins.length ? session.origins.join(", ") : "",
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
    !statsLetters.size || statsLetters.has(firstLetter(w.word))
  );
}

function renderStatsLetters() {
  const container = document.getElementById("statsLetterFilter");
  if (!container) return;
  container.innerHTML = "";
  updateLetterSummary("statsLetterFilter", statsLetters);

  const counts = {};
  statsScopeAndLevelWords().forEach(w => {
    const letter = firstLetter(w.word);
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
    statsLetters.forEach(letter => window.selectedLetters.add(letter)); // buttons redraw in applyFilter
  }
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
    { count: c.completed, cls: "seg-covered", label: "Completed" },
    { count: c.notStarted, cls: "seg-empty", label: "Not started" }
  ];
  const learningRows = levels.map(level => {
    const c = learningCounts(scopeWords.filter(w => w.difficulty === level));
    if (!c.total) return "";
    return `
      <div class="mini-bar-row">
        <div class="mini-bar-row-header">
          <span class="mini-bar-title">${difficultyLabel(level)}</span>
          <span class="mini-bar-caption">${c.completed} of ${c.total} completed</span>
        </div>
        ${stackBarHtml(learningSegments(c), c.total, true)}
      </div>`;
  }).join("");

  // ---- Practice ----
  const pc = practiceCounts(scopeWords);
  const accuracy = pc.attempts ? Math.round((pc.correctAttempts / pc.attempts) * 100) : 0;
  const practiceSegments = c => [
    { count: c.alwaysRight, cls: "seg-correct", label: "Always right" },
    { count: c.everWrong, cls: "seg-wrong", label: "Ever spelled wrong" },
    { count: c.pending, cls: "seg-empty", label: "Not attempted" }
  ];
  const practiceRows = levels.map(level => {
    const c = practiceCounts(scopeWords.filter(w => w.difficulty === level));
    if (!c.total) return "";
    return `
      <div class="mini-bar-row">
        <div class="mini-bar-row-header">
          <span class="mini-bar-title">${difficultyLabel(level)}</span>
          <span class="mini-bar-caption"><span title="Always right">${c.alwaysRight} ✅</span> · <span title="Ever spelled wrong">${c.everWrong} ⚠️</span> · ${c.pending} left</span>
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

  const monthAgo = Date.now() - SESSIONS_MONTH_DAYS * DAY_MS;
  const sessions = sessionsView === "month"
    ? practiceSessions().filter(s => new Date(s.at) >= monthAgo).reverse()
    : practiceSessions().slice(-RECENT_SESSIONS).reverse();
  const sessionTotals = sessions.reduce((t, s) => ({ correct: t.correct + (s.correct || 0), wrong: t.wrong + (s.wrong || 0) }), { correct: 0, wrong: 0 });
  const sessionsSummary = sessionsView === "month" && sessions.length
    ? `<div class="session-summary">${sessions.length} test${sessions.length === 1 ? "" : "s"} · ${sessionTotals.correct} / ${sessionTotals.correct + sessionTotals.wrong} right · ${percent(sessionTotals.correct, sessionTotals.correct + sessionTotals.wrong)}</div>`
    : "";
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
    : `<div class="stats-empty">${sessionsView === "month" ? `No tests in the past ${SESSIONS_MONTH_DAYS} days.` : "Finish a Practice test to see it here."}</div>`;

  container.innerHTML = `
    <div class="stats-scope">${lc.total} words · ${escapeHtml(scopeLabel)} · ${escapeHtml(difficultySummary("statsDifficultyFilter"))}${escapeHtml(lettersLabel)}</div>
    ${activitySectionHtml(scopeWords)}

    <div class="stats-columns">
      <section class="stats-col" aria-label="Learning">
        <div class="stats-col-header learning"><h2 class="stats-heading">📖 Learning</h2></div>
        <div class="stat-grid">
          ${statTile("Total words", lc.total)}
          ${statTile("✓ Completed", lc.completed, "var(--covered)", "completed")}
          ${statTile("○ Not started", lc.notStarted, null, "not-started")}
          ${statTile("⚑ Marked for correction", lc.correction, "var(--accent-hover)", "correction")}
        </div>
        <div class="stat-section">
          <h3>Overall</h3>
          ${stackBarHtml(learningSegments(lc), lc.total, false)}
          <div class="stack-legend">
            <div class="legend-item"><span class="legend-swatch" style="background:var(--covered)"></span>Completed — <strong>${lc.completed}</strong></div>
            <div class="legend-item"><span class="legend-swatch" style="background:var(--border-strong)"></span>Not started — <strong>${lc.notStarted}</strong></div>
            <div class="legend-item">${lc.total ? Math.round((lc.completed / lc.total) * 100) : 0}% completed</div>
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
          ${statTile("✍️ Words practiced", pc.alwaysRight + pc.everWrong, null, null, "", `of ${pc.total} words`)}
          ${statTile("⏳ Not attempted", pc.pending, null, "practice-pending")}
          ${statTile("✅ Always right", pc.alwaysRight, "var(--success)", "practice-always-right", "", "never spelled wrong")}
          ${statTile("⚠️ Ever spelled wrong", pc.everWrong, "var(--warning)", "practice-ever-wrong", "",
            pc.stillWrong ? `${pc.stillWrong} still wrong last time` : "")}
          ${statTile("🎯 First-try accuracy", percent(pc.firstTryCorrect, pc.firstTried), null, null, "stat-wide",
            pc.firstTried ? `${pc.firstTryCorrect} of ${pc.firstTried} words right first time` : "no words practiced yet")}
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
          <div class="stat-section-head">
            <h3>Recent tests</h3>
            <div class="act-toggle sessions-toggle" role="group" aria-label="Tests to show">
              <button type="button" data-sessions="recent" aria-pressed="${sessionsView === "recent"}">Last ${RECENT_SESSIONS}</button>
              <button type="button" data-sessions="month" aria-pressed="${sessionsView === "month"}">Past ${SESSIONS_MONTH_DAYS} days</button>
            </div>
          </div>
          ${sessionsSummary}
          <div class="session-list${sessionsView === "month" ? " scrollable" : ""}">${sessionsHtml}</div>
        </div>
      </section>
    </div>
  `;

  wireActivity(container);
  wireSessionsToggle(container);

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
   Stats: activity by day or week. Words learned come from each word's
   coveredAt (when it was first opened on the Learning card); practice comes
   from each word's practice.days (the day of every attempt). Both were only
   recorded from TRACKING_START on, so older activity is counted separately.
--------------------------- */
const TRACKING_START = "2026-10-11";
const DAY_MS = 86400000;
const MAX_ACTIVITY_DAYS = 366;

// Calendar days as whole numbers in local time, so "today" matches the device
function dayNumber(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
}
function dayFromInput(value) {
  const [y, m, d] = (value || "").split("-").map(Number);
  return y && m && d ? Math.floor(Date.UTC(y, m - 1, d) / DAY_MS) : null;
}
function dayToInput(day) {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}
function dayLabel(day, options) {
  return new Date(day * DAY_MS).toLocaleDateString(undefined, { timeZone: "UTC", ...options });
}
function weekStart(day) {
  return day - ((new Date(day * DAY_MS).getUTCDay() + 6) % 7); // weeks start on Monday
}

const activityView = { group: "day", range: "7", from: null, to: null };

function activityRange() {
  const today = dayNumber();
  if (activityView.range === "custom") {
    let from = dayFromInput(activityView.from) ?? today - 6;
    let to = dayFromInput(activityView.to) ?? today;
    if (from > to) [from, to] = [to, from];
    return { from: Math.max(from, to - MAX_ACTIVITY_DAYS + 1), to };
  }
  return { from: today - Number(activityView.range) + 1, to: today };
}

// [{ start, end, learned, practiced: Set, attempts, correct, wrong }] oldest first
function activityPeriods(list) {
  const { from, to } = activityRange();
  const periods = [];
  const byDay = new Map();
  for (let day = from; day <= to; day++) {
    const start = activityView.group === "week" ? Math.max(weekStart(day), from) : day;
    let period = periods[periods.length - 1];
    if (!period || period.start !== start) {
      period = { start, end: start, learned: 0, practiced: new Set(), attempts: 0, correct: 0, wrong: 0 };
      periods.push(period);
    }
    period.end = day;
    byDay.set(day, period);
  }

  const undated = { learned: 0, attempts: 0 };
  list.forEach(w => {
    if (w.covered) {
      const day = w.coveredAt ? dayNumber(new Date(w.coveredAt)) : null;
      if (day === null) undated.learned++;
      else if (byDay.has(day)) byDay.get(day).learned++;
    }
    const p = w.practice;
    const days = p.days || [];
    undated.attempts += Math.max(0, p.attempts - days.length);
    // days lines up with the newest attempts in history
    const results = days.length ? (p.history || "").slice(-days.length) : "";
    days.forEach((day, i) => {
      const period = byDay.get(day);
      if (!period) return;
      period.practiced.add(w);
      period.attempts++;
      if (results[i] === "c") period.correct++;
      else if (results[i] === "w") period.wrong++;
    });
  });
  return { periods, undated };
}

function periodText(period, long) {
  if (activityView.group === "day") {
    return dayLabel(period.start, long ? { weekday: "short", month: "short", day: "numeric" } : { weekday: "short", day: "numeric" });
  }
  const start = dayLabel(period.start, { month: "short", day: "numeric" });
  if (!long) return start;
  return period.end === period.start ? start : `${start} – ${dayLabel(period.end, { month: "short", day: "numeric" })}`;
}

// One grouped column chart: a learned bar and a practiced bar for every day
// or week, on one shared scale. Values sit on the caps when there's room;
// each group has a hover/focus tooltip listing both, and the table below
// lists everything.
const ACTIVITY_SERIES = [
  { key: "learned", name: "Learned", color: "var(--series-learned)", value: p => p.learned },
  { key: "practiced", name: "Practiced", color: "var(--series-practiced)", value: p => p.practiced.size }
];

function activityChartHtml(periods) {
  const max = Math.max(1, ...periods.flatMap(p => ACTIVITY_SERIES.map(s => s.value(p))));
  const labelEvery = Math.ceil(periods.length / 10);
  const showValues = periods.length <= 14;
  const groups = periods.map((period, i) => {
    const bars = ACTIVITY_SERIES.map(s => {
      const v = s.value(period);
      const height = v ? Math.max(2, Math.round((v / max) * 100)) : 0;
      return `
          <div class="act-bar-slot">
            ${showValues && v ? `<span class="act-value">${v}</span>` : ""}
            <div class="act-bar" style="height:${height}%;background:${s.color}"></div>
          </div>`;
    }).join("");
    const tip = `${period.learned}|${period.practiced.size}|${period.attempts}|${period.correct}|${period.wrong}`;
    return `
      <div class="act-col" tabindex="0" data-tip="${tip}" data-tip-label="${escapeHtml(periodText(period, true))}">
        <div class="act-bar-area">${bars}</div>
        <span class="act-x">${i % labelEvery === 0 ? escapeHtml(periodText(period, false)) : ""}</span>
      </div>`;
  }).join("");
  const legend = ACTIVITY_SERIES.map(s =>
    `<span class="act-legend-item"><span class="act-swatch" style="background:${s.color}"></span>${s.name}</span>`).join("");
  return `
    <div class="act-chart">
      <div class="act-chart-head">
        <span class="act-chart-title">Words per ${activityView.group === "day" ? "day" : "week"}</span>
        <span class="act-legend">${legend}</span>
      </div>
      <div class="act-plot" role="img" aria-label="Words learned and practiced per ${activityView.group}; the table below lists every value">${groups}</div>
    </div>`;
}

function activitySectionHtml(list) {
  const { periods, undated } = activityPeriods(list);
  const { from, to } = activityRange();
  const learned = periods.reduce((n, p) => n + p.learned, 0);
  const practicedWords = new Set(periods.flatMap(p => [...p.practiced])).size;
  const attempts = periods.reduce((n, p) => n + p.attempts, 0);
  const correct = periods.reduce((n, p) => n + p.correct, 0);
  const wrong = periods.reduce((n, p) => n + p.wrong, 0);
  const unit = activityView.group === "day" ? "Day" : "Week";

  const rangeOptions = [["1", "Today"], ["7", "Last 7 days"], ["14", "Last 14 days"], ["30", "Last 30 days"], ["84", "Last 12 weeks"], ["custom", "Custom dates…"]]
    .map(([v, t]) => `<option value="${v}"${activityView.range === v ? " selected" : ""}>${t}</option>`).join("");
  const rows = periods.slice().reverse().map(p => `
    <tr>
      <th scope="row">${escapeHtml(periodText(p, true))}</th>
      <td>${p.learned}</td><td>${p.practiced.size}</td><td>${p.attempts}</td><td>${p.correct}</td><td>${p.wrong}</td>
    </tr>`).join("");
  const startText = dayLabel(dayFromInput(TRACKING_START), { month: "short", day: "numeric", year: "numeric" });
  const note = undated.learned || undated.attempts
    ? `<p class="act-note">Dates are recorded from ${startText}. ${undated.learned} word${undated.learned === 1 ? "" : "s"} learned and ${undated.attempts} practice attempt${undated.attempts === 1 ? "" : "s"} from before then aren't shown by ${unit.toLowerCase()}.</p>`
    : "";

  return `
    <section class="stat-section activity-section" aria-label="Activity">
      <h3>📅 Activity by ${unit.toLowerCase()}</h3>
      <div class="act-controls">
        <div class="act-toggle" role="group" aria-label="Group by">
          <button type="button" data-group="day" aria-pressed="${activityView.group === "day"}">Daily</button>
          <button type="button" data-group="week" aria-pressed="${activityView.group === "week"}">Weekly</button>
        </div>
        <select class="act-select" id="activityRange" aria-label="Date range">${rangeOptions}</select>
        <div class="act-custom"${activityView.range === "custom" ? "" : " hidden"}>
          <input type="date" id="activityFrom" aria-label="From" value="${dayToInput(from)}" max="${dayToInput(dayNumber())}" />
          <span>to</span>
          <input type="date" id="activityTo" aria-label="To" value="${dayToInput(to)}" max="${dayToInput(dayNumber())}" />
        </div>
      </div>
      <div class="act-range-text">${escapeHtml(dayLabel(from, { month: "short", day: "numeric", year: "numeric" }))}${from === to ? "" : ` – ${escapeHtml(dayLabel(to, { month: "short", day: "numeric", year: "numeric" }))}`}</div>
      <div class="stat-grid act-tiles">
        ${statTile("📖 Words learned", learned)}
        ${statTile("✍️ Words practiced", practicedWords)}
        ${statTile("Attempts", attempts)}
        ${statTile("🎯 Accuracy", attempts ? `${Math.round((correct / attempts) * 100)}%` : "—")}
      </div>
      ${activityChartHtml(periods)}
      <details class="act-table-wrap">
        <summary>Show as a table</summary>
        <table class="act-table">
          <thead><tr><th scope="col">${unit}</th><th scope="col">Learned</th><th scope="col">Practiced</th><th scope="col">Attempts</th><th scope="col">✅</th><th scope="col">❌</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
      ${note}
    </section>`;
}

// Recent tests on Stats: the last few, or every test from the past month
const RECENT_SESSIONS = 8;
const SESSIONS_MONTH_DAYS = 30;
let sessionsView = "recent";

function wireSessionsToggle(container) {
  container.querySelectorAll(".sessions-toggle button").forEach(btn =>
    btn.addEventListener("click", () => { sessionsView = btn.dataset.sessions; renderStats(); }));
}

function wireActivity(container) {
  container.querySelectorAll(".act-toggle button").forEach(btn =>
    btn.addEventListener("click", () => { activityView.group = btn.dataset.group; renderStats(); }));
  container.querySelector("#activityRange").addEventListener("change", event => {
    const { from, to } = activityRange();
    activityView.range = event.target.value;
    if (activityView.range === "custom" && !activityView.from) {
      activityView.from = dayToInput(from);
      activityView.to = dayToInput(to);
    }
    renderStats();
  });
  ["activityFrom", "activityTo"].forEach(id => container.querySelector(`#${id}`).addEventListener("change", event => {
    if (!event.target.value) return;
    activityView[id === "activityFrom" ? "from" : "to"] = event.target.value;
    renderStats();
  }));

  // One shared tooltip: value first, then the period
  let tip = document.getElementById("actTip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "actTip";
    tip.className = "act-tip";
    tip.hidden = true;
    document.body.appendChild(tip);
  }
  const show = col => {
    // Values lead, the period follows; a short colour key marks each series
    const [learned, practiced, attempts, correct, wrong] = col.dataset.tip.split("|");
    tip.replaceChildren();
    const label = document.createElement("div");
    label.className = "act-tip-label";
    label.textContent = col.dataset.tipLabel;
    const row = (series, value, detail) => {
      const line = document.createElement("div");
      line.className = "act-tip-row";
      const key = document.createElement("span");
      key.className = "act-tip-key";
      key.style.background = series.color;
      const strong = document.createElement("strong");
      strong.textContent = value;
      line.append(key, strong, document.createTextNode(` ${series.name.toLowerCase()}${detail}`));
      return line;
    };
    tip.append(
      row(ACTIVITY_SERIES[0], learned, ""),
      row(ACTIVITY_SERIES[1], practiced, ` · ${attempts} attempt${attempts === "1" ? "" : "s"}, ${correct} ✅ ${wrong} ❌`),
      label
    );
    tip.hidden = false;
    const r = col.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tip.offsetWidth - 8, Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = `${left + window.scrollX}px`;
    tip.style.top = `${r.top + window.scrollY - tip.offsetHeight - 6}px`;
  };
  container.querySelectorAll(".act-col").forEach(col => {
    col.addEventListener("pointerenter", () => show(col));
    col.addEventListener("focus", () => show(col));
    col.addEventListener("pointerleave", () => (tip.hidden = true));
    col.addEventListener("blur", () => (tip.hidden = true));
  });
}

/* ---------------------------
   Reset
--------------------------- */
async function confirmReset() {
  if (!confirm("⚠️ This will reset ALL progress — completed words, practice history and test results.\n\nContinue?")) return;
  if (!confirm("❗ Are you REALLY sure?")) return;
  if (!confirm("🛑 Last chance: all progress will be permanently deleted. This cannot be undone.\n\nDelete everything?")) return;
  await resetSelection();
}

async function resetSelection() {
  currentIndex = -1;
  currentItem = null;
  document.getElementById("correctionCheckbox").checked = false;
  document.getElementById("correctionNote").value = "";
  document.getElementById("correctionNote").hidden = true;

  words.forEach(w => {
    w.covered = false;
    w.coveredAt = null;
    w.markedForCorrection = false;
    w.correctionNote = "";
    w.practice = emptyPractice();
  });

  document.querySelectorAll("#difficultyFilter input").forEach(input => (input.checked = true));
  updateMultiSelectSummary(document.getElementById("difficultyFilter"));
  setFilterSelect("resultFilter", []);
  setFilterSelect("originFilter", []);
  document.getElementById("searchInput").value = "";

  if (window.selectedLetters) window.selectedLetters.clear(); // buttons redraw in applyFilter

  stopAllAudio();
  showCardWord(null);
  renderPronunciations(null);
  renderSourceBadge("definitionSource", null);
  renderSourceBadge("sentenceSource", null);
  renderPicture(null);
  renderCardTips(null);
  renderWordCardStatus();
  await resetCloudProgress();
  // Hidden pictures and the default scope aren't progress: keep them after the reset
  words.filter(w => w.imageHidden).forEach(w => saveWord(w, { imageHidden: true }));
  const defaultScopes = savedDefaultScopes();
  if (defaultScopes) saveDefaultScopes(defaultScopes);
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
