/* ---------------------------
   Practice tab: hear the word, type the spelling.
   Uses globals from app.js (words, saveWord, savePracticeSession, audio helpers...).
--------------------------- */
const TIME_LIMIT_MS = 90 * 1000;
const AUTO_NEXT_SECONDS = 4;        // after time runs out, move on by itself

let practice = null;                // running/finished test: { entries, index, label, mode, saved }
const practiceLetters = new Set();  // first letters picked on the Practice tab

function practiceEl(id) {
  return document.getElementById(id);
}

function showPracticeScreen(name) {
  ["practiceStart", "practiceQuestion", "practiceDone"].forEach(id => {
    practiceEl(id).hidden = id !== name;
  });
  // Filters can't change mid-test; they come back on the start/results screens
  practiceEl("practiceFilters").hidden = name === "practiceQuestion";
  // "Your Words" only appears once a test has started (questions and results)
  practiceEl("practiceListPanel").hidden = name === "practiceStart";
}

/* ---------------------------
   Practice filters (independent of the Learning tab)
--------------------------- */
function practiceScopeAndLevelWords() {
  const scopes = selectedValues("practiceScopeFilter");
  const levels = selectedValues("practiceDifficultyFilter");
  return words.filter(w => scopes.includes(w._scope) && levels.includes(w.difficulty));
}

// Scope + Difficulty + Origin. Origin's options are counted from Scope + Difficulty.
function practiceFilteredWords() {
  const base = practiceScopeAndLevelWords();
  renderOriginOptions("practiceOriginFilter", base);
  const origins = filterSelectValues("practiceOriginFilter");
  return origins.length ? base.filter(w => originsOf(w).some(o => origins.includes(o))) : base;
}

function practicePool() {
  return practiceFilteredWords().filter(w =>
    !practiceLetters.size || practiceLetters.has(w.word.charAt(0).toUpperCase())
  );
}

const MODE_NAMES = { wrong: "Wrong", pending: "Not attempted", correct: "Spelled right", everWrong: "Ever spelled wrong" };

// Which practice groups to test: any mix of "wrong", "pending", "correct"
function selectedModes() {
  return Array.from(document.querySelectorAll('input[name="practiceMode"]:checked'))
    .map(input => input.value);
}

// Groups combine: a word is in the test if it's in any picked group.
// "everWrong" = spelled wrong in at least one attempt, even if right since.
function wordsForModes(pool, modes) {
  return pool.filter(w =>
    modes.includes(practiceStatus(w)) || (modes.includes("everWrong") && w.practice.wrong > 0)
  );
}

function gradeGradient(c) {
  const total = c.correct + c.wrong + c.pending;
  if (!total) return "transparent";
  const a = (c.correct / total) * 100;
  const b = a + (c.wrong / total) * 100;
  return `linear-gradient(to right, var(--success) 0 ${a}%, var(--danger) ${a}% ${b}%, var(--border-strong) ${b}% 100%)`;
}

function renderPracticeLetters() {
  const container = practiceEl("practiceLetterFilter");
  container.innerHTML = "";
  updateLetterSummary("practiceLetterFilter", practiceLetters);

  const counts = {};
  const all = { correct: 0, wrong: 0, pending: 0 };
  practiceFilteredWords().forEach(w => {
    const letter = w.word.charAt(0).toUpperCase();
    const c = counts[letter] || (counts[letter] = { correct: 0, wrong: 0, pending: 0 });
    c[practiceStatus(w)]++;
    all[practiceStatus(w)]++;
  });

  const makeButton = (text, c, active, onclick) => {
    const btn = document.createElement("button");
    btn.className = "letter-btn graded";
    btn.textContent = text;
    btn.classList.toggle("active", active);
    const total = c ? c.correct + c.wrong + c.pending : 0;
    btn.classList.toggle("no-words", !total);
    btn.title = total
      ? `${text}: ${c.correct} right · ${c.wrong} wrong · ${c.pending} not attempted`
      : `${text}: no words`;
    if (total) {
      const grade = document.createElement("span");
      grade.className = "letter-grade";
      grade.style.background = gradeGradient(c);
      btn.appendChild(grade);
    }
    btn.onclick = onclick;
    container.appendChild(btn);
    return btn;
  };

  makeButton("All", all, !practiceLetters.size, () => {
    practiceLetters.clear();
    practiceFiltersChanged();
  }).classList.add("all-btn");

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
    makeButton(letter, counts[letter], practiceLetters.has(letter), () => {
      if (practiceLetters.has(letter)) practiceLetters.delete(letter);
      else practiceLetters.add(letter);
      practiceFiltersChanged();
    });
  });
}

function practiceFiltersChanged() {
  practice = null; // any finished test is replaced by a fresh start screen
  showPracticeStart();
}

/* Called by switchTab() whenever the Practice tab is opened */
function openPractice() {
  if (practice && practice.index >= 0) {
    renderPracticeList();
    const entry = currentEntry();
    if (entry && !isAnswered(entry)) resumeTimer();
    return;
  }
  if (!practice) showPracticeStart();
  else renderPracticeLetters(); // results screen: refresh letter colours
}

/* Called by switchTab() when leaving the Practice tab */
function leavePractice() {
  pauseTimer();
  cancelAutoNext();
}

/* Called by app.js once the word lists have loaded (or after a reset) */
function onWordsLoaded() {
  if (!practice) showPracticeStart();
}

function practiceSetLabel(modes) {
  const scopes = selectedValues("practiceScopeFilter")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" + ");
  const origins = filterSelectValues("practiceOriginFilter");
  const originText = origins.length ? ` · ${document.querySelector("#practiceOriginFilter .summary-text").textContent}` : "";
  const letters = practiceLetters.size ? ` · ${[...practiceLetters].sort().join(", ")}` : "";
  const everyWord = modes && ["wrong", "pending", "correct"].every(m => modes.includes(m));
  const modeText = modes && !everyWord ? ` · ${modes.map(m => MODE_NAMES[m]).join(" + ")}` : "";
  return `${scopes} · ${difficultySummary("practiceDifficultyFilter")}${originText}${letters}${modeText}`;
}

function showPracticeStart() {
  const pool = practicePool();
  const counts = {
    wrong: wordsForModes(pool, ["wrong"]).length,
    pending: wordsForModes(pool, ["pending"]).length,
    correct: wordsForModes(pool, ["correct"]).length,
    everWrong: wordsForModes(pool, ["everWrong"]).length
  };
  practiceEl("modeCountWrong").textContent = counts.wrong;
  practiceEl("modeCountPending").textContent = counts.pending;
  practiceEl("modeCountCorrect").textContent = counts.correct;
  practiceEl("modeCountEverWrong").textContent = counts.everWrong;

  document.querySelectorAll(".mode-option").forEach(option => {
    const input = option.querySelector("input");
    option.classList.toggle("selected", input.checked);
    option.classList.toggle("disabled", !counts[input.value]);
  });

  const modes = selectedModes();
  const count = wordsForModes(pool, modes).length;
  let text;
  if (!pool.length) {
    text = "No words match these filters. Try a different Scope, Difficulty, Origin or letter.";
  } else if (!modes.length) {
    text = "Pick at least one group of words below.";
  } else if (!count) {
    text = "No words in the groups you picked. Try adding another group.";
  } else {
    text = `${count} word${count === 1 ? "" : "s"} to test · ${practiceSetLabel()}`;
  }
  practiceEl("practiceSetText").textContent = text;
  practiceEl("startTallyTotal").textContent = pool.length;
  practiceEl("startTallyTest").textContent = count;
  practiceEl("practiceStartBtn").disabled = !count;

  renderPracticeLetters();
  renderSavedPractice();
  showPracticeScreen("practiceStart");
  renderPracticeList();
}

function startPractice(items, mode, label) {
  const list = items.slice();
  if (practiceEl("practiceShuffle").checked) shuffleArray(list);
  practice = {
    entries: list.map(item => ({ item, status: null, typed: "", timedOut: false })),
    index: 0,
    mode,
    label,
    startedAt: new Date().toISOString(),
    // Filters the test was taken with, shown under Recent tests on Stats
    scope: selectedValues("practiceScopeFilter").map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(" + "),
    difficulty: difficultySummary("practiceDifficultyFilter"),
    letters: [...practiceLetters].sort(),
    origins: filterSelectValues("practiceOriginFilter"),
    saved: false
  };
  showQuestion(0, true);
}

/* ---------------------------
   Save for later / resume (several tests can be saved)
   A saved test keeps itself up to date after every word, so closing the app
   after resuming doesn't lose answers. Ending or finishing it removes it.
--------------------------- */
function practiceSnapshot() {
  const entry = currentEntry();
  const timeLeft = entry && !isAnswered(entry)
    ? (timerInterval ? Math.max(0, timerDeadline - Date.now()) : timerRemaining)
    : null;
  return {
    savedAt: new Date().toISOString(),
    startedAt: practice.startedAt,
    label: practice.label,
    mode: practice.mode,
    scope: practice.scope,
    difficulty: practice.difficulty,
    letters: practice.letters,
    origins: practice.origins,
    index: practice.index,
    timeLeft,
    entries: practice.entries.map(e => ({
      scope: e.item._scope,
      word: e.item.word,
      status: e.status,
      typed: e.typed,
      timedOut: e.timedOut
    }))
  };
}

// Saved tests are stored by id; `practice.savedId` is set once a test is saved
function persistSavedTest() {
  if (practice?.savedId && practice.index >= 0) storeSavedPracticeTest(practice.savedId, practiceSnapshot());
}

function savePracticeForLater() {
  if (!practice) return;
  if (!practice.savedId && savedPracticeTests().length >= MAX_SAVED_TESTS) {
    alert(`You already have ${MAX_SAVED_TESTS} saved tests. Discard one on the start screen, then save this test.`);
    return;
  }
  pauseTimer();
  cancelAutoNext();
  stopAllAudio();
  practice.savedId = practice.savedId || `t${Date.now().toString(36)}`;
  persistSavedTest();
  practice = null;
  showPracticeStart();
}

function resumeSavedPractice(id) {
  const saved = savedPracticeTests().find(test => test.id === id);
  if (!saved) return;
  const byKey = new Map(words.map(w => [`${w._scope}|${w.word}`, w]));
  const entries = saved.entries
    .map(e => ({ ...e, item: byKey.get(`${e.scope}|${e.word}`) }))
    .filter(e => e.item) // a word since removed from its list is dropped
    .map(e => ({ item: e.item, status: e.status, typed: e.typed || "", timedOut: Boolean(e.timedOut) }));
  if (!entries.length) {
    discardSavedPractice(id, false);
    return;
  }

  practice = {
    entries,
    index: Math.min(saved.index || 0, entries.length - 1),
    mode: saved.mode,
    label: saved.label,
    startedAt: saved.startedAt,
    scope: saved.scope,
    difficulty: saved.difficulty,
    letters: saved.letters || [],
    origins: saved.origins || [],
    savedId: id,
    saved: false
  };
  // Carry on from the word that was showing, or the next one still to answer
  let index = practice.index;
  if (isAnswered(entries[index])) index = nextUnansweredIndex();
  if (index === -1) {
    finishPractice();
    return;
  }
  const resumeOnSameWord = index === practice.index;
  showQuestion(index, true);
  // Give back the time that was left on that word
  if (resumeOnSameWord && saved.timeLeft > 0) {
    stopTimer();
    timerRemaining = saved.timeLeft;
    resumeTimer();
    persistSavedTest();
  }
}

function discardSavedPractice(id, confirmFirst = true) {
  if (confirmFirst && !confirm("Discard this saved test? Answers already given stay in your practice history.")) return;
  storeSavedPracticeTest(id, null);
  renderSavedPractice();
}

function renderSavedPractice() {
  const tests = savedPracticeTests();
  practiceEl("practiceSaved").hidden = !tests.length;
  practiceEl("practiceSavedCount").textContent = tests.length > 1 ? `(${tests.length})` : "";
  practiceEl("practiceSavedList").replaceChildren(...tests.map(test => {
    const total = test.entries.length;
    const correct = test.entries.filter(e => e.status === "correct").length;
    const wrong = test.entries.filter(e => e.status === "wrong").length;

    const row = document.createElement("div");
    row.className = "saved-test";
    const info = document.createElement("div");
    info.className = "saved-test-info";
    const progress = document.createElement("div");
    progress.className = "saved-test-progress";
    progress.textContent = `${correct + wrong} of ${total} answered · ✅ ${correct} · ❌ ${wrong} · ${total - correct - wrong} left`;
    const meta = document.createElement("div");
    meta.className = "saved-test-meta";
    meta.textContent = [test.label, `saved ${formatSessionDate(test.savedAt)}`].filter(Boolean).join(" · ");
    info.append(progress, meta);

    const actions = document.createElement("div");
    actions.className = "saved-test-actions";
    const resume = document.createElement("button");
    resume.type = "button";
    resume.className = "primary-btn";
    resume.textContent = "▶️ Resume";
    resume.addEventListener("click", () => resumeSavedPractice(test.id));
    const discard = document.createElement("button");
    discard.type = "button";
    discard.className = "link-btn";
    discard.textContent = "Discard";
    discard.addEventListener("click", () => discardSavedPractice(test.id));
    actions.append(resume, discard);

    row.append(info, actions);
    return row;
  }));
}

/* ---------------------------
   Timer (90 seconds per word)
--------------------------- */
let timerDeadline = 0;
let timerRemaining = TIME_LIMIT_MS;
let timerInterval = null;

function startTimer() {
  stopTimer();
  timerRemaining = TIME_LIMIT_MS;
  practiceEl("practiceTimer").hidden = false;
  resumeTimer();
}

function resumeTimer() {
  if (timerInterval || timerRemaining <= 0) return;
  timerDeadline = Date.now() + timerRemaining;
  practiceEl("practiceTimer").classList.remove("paused");
  timerInterval = setInterval(tickTimer, 250);
  tickTimer();
}

function pauseTimer() {
  if (!timerInterval) return;
  timerRemaining = Math.max(0, timerDeadline - Date.now());
  clearInterval(timerInterval);
  timerInterval = null;
  practiceEl("practiceTimer").classList.add("paused");
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

function tickTimer() {
  const left = Math.max(0, timerDeadline - Date.now());
  timerRemaining = left;
  const seconds = Math.ceil(left / 1000);
  practiceEl("practiceTimerText").textContent =
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  practiceEl("practiceTimerFill").style.width = `${(left / TIME_LIMIT_MS) * 100}%`;
  const timer = practiceEl("practiceTimer");
  // Yellow once 30 seconds have passed, red once 60 have passed
  const elapsed = (TIME_LIMIT_MS - left) / 1000;
  timer.classList.toggle("warn", elapsed >= 30 && elapsed < 60);
  timer.classList.toggle("danger", elapsed >= 60);
  if (left <= 0) {
    stopTimer();
    timeUp();
  }
}

function timeUp() {
  const entry = currentEntry();
  if (!entry || isAnswered(entry)) return;
  entry.typed = practiceEl("practiceInput").value.trim();
  entry.status = "wrong";
  entry.timedOut = true;
  recordPracticeResult(entry);
  showAnswerState(entry);
  renderPracticeList();
  updatePracticeCounter();
  startAutoNext();
}

// Pause while the app is in the background (phone locked, other app, other tab)
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    pauseTimer();
  } else if (activeTab === "practice" && practice && practice.index >= 0) {
    const entry = currentEntry();
    if (entry && !isAnswered(entry) && !practiceEl("practiceQuestion").hidden) resumeTimer();
  }
});

/* After time runs out, count down on the Next button and move on */
let autoNextInterval = null;

function startAutoNext() {
  cancelAutoNext();
  let left = AUTO_NEXT_SECONDS;
  const btn = practiceEl("practiceNextBtn");
  const label = btn.textContent.replace(/ \(\d+\)$/, "");
  btn.textContent = `${label} (${left})`;
  autoNextInterval = setInterval(() => {
    left--;
    if (left <= 0) {
      cancelAutoNext();
      nextPracticeWord();
    } else {
      btn.textContent = `${label} (${left})`;
    }
  }, 1000);
}

function cancelAutoNext() {
  if (!autoNextInterval) return;
  clearInterval(autoNextInterval);
  autoNextInterval = null;
  const btn = practiceEl("practiceNextBtn");
  btn.textContent = btn.textContent.replace(/ \(\d+\)$/, "");
}

/* ---------------------------
   Question flow
--------------------------- */
function currentEntry() {
  return practice?.entries[practice.index] || null;
}

function isAnswered(entry) {
  return entry.status === "correct" || entry.status === "wrong";
}

function showQuestion(index, autoplay) {
  cancelAutoNext();
  practice.index = index;
  const entry = currentEntry();
  const input = practiceEl("practiceInput");

  showPracticeScreen("practiceQuestion");
  updatePracticeCounter();

  practiceEl("practiceMWBtn").disabled = !entry.item.audio_url;
  practiceEl("practiceAltBtn").disabled = recordedPronunciations(entry.item).length < 2;
  practice.altPronunciation = 0;
  practiceEl("practiceDefBtn").disabled = !entry.item.definition;
  practiceEl("practiceSentBtn").disabled = !entry.item.sentence;
  practiceEl("practiceOriginBtn").disabled = !entry.item.origin;
  practiceEl("practicePosBtn").disabled = !entry.item.part_of_speech;
  clearPracticeInfo();

  if (isAnswered(entry)) {
    // Reviewing a word that was already answered
    stopTimer();
    practiceEl("practiceTimer").hidden = true;
    input.value = entry.typed;
    showAnswerState(entry);
  } else {
    input.value = "";
    input.readOnly = false;
    input.classList.remove("is-correct", "is-wrong");
    practiceEl("practiceFeedback").hidden = true;
    practiceEl("practiceCheckBtn").hidden = false;
    practiceEl("practiceNextBtn").hidden = true;
    startTimer();
  }

  renderPracticeList();
  persistSavedTest();
  // focus() must run inside the tap/keypress for iOS to raise the keyboard
  input.focus({ preventScroll: true });
  if (autoplay) playPracticeWord();
}

function normalizeSpelling(text) {
  return (text || "")
    .trim()
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[‐-—]/g, "-")
    .replace(/\s+/g, " ");
}

function checkPracticeAnswer() {
  const entry = currentEntry();
  if (!entry || isAnswered(entry)) {
    nextPracticeWord();
    return;
  }

  const input = practiceEl("practiceInput");
  const typed = input.value.trim();
  if (!typed) {
    input.focus();
    return;
  }

  stopTimer();
  entry.typed = typed;
  entry.status = normalizeSpelling(typed) === normalizeSpelling(entry.item.word) ? "correct" : "wrong";
  recordPracticeResult(entry);
  showAnswerState(entry);
  renderPracticeList();
  updatePracticeCounter();
}

function showAnswerState(entry) {
  const input = practiceEl("practiceInput");
  const feedback = practiceEl("practiceFeedback");
  const correct = entry.status === "correct";

  input.readOnly = true;
  input.classList.toggle("is-correct", correct);
  input.classList.toggle("is-wrong", !correct);

  feedback.className = `practice-feedback ${correct ? "correct" : "wrong"}`;
  if (correct) {
    feedback.innerHTML = `<div class="fb-title">✅ Correct!</div><div class="fb-word"></div>`;
  } else {
    feedback.innerHTML = `
      <div class="fb-title">${entry.timedOut ? "⏰ Time's up" : "❌ Not quite"}</div>
      <div>Correct spelling: <span class="fb-word"></span></div>
      <div class="fb-typed-row">You typed: <span class="fb-typed"></span></div>`;
    if (entry.typed) feedback.querySelector(".fb-typed").textContent = entry.typed;
    else feedback.querySelector(".fb-typed-row").remove();
  }
  feedback.querySelector(".fb-word").textContent = entry.item.word;
  feedback.hidden = false;

  practiceEl("practiceCheckBtn").hidden = true;
  const next = practiceEl("practiceNextBtn");
  next.hidden = false;
  next.textContent = nextUnansweredIndex() === -1 ? "See results →" : "Next word →";
}

/* Save the attempt to the word's practice history (shown on Learning + Stats) */
function recordPracticeResult(entry) {
  const item = entry.item;
  const p = item.practice;
  p.attempts++;
  p[entry.status]++;
  p.last = entry.status;
  p.lastAt = new Date().toISOString();
  // Every attempt in order, oldest first: "c" = correct, "w" = wrong
  p.history = (p.history || "") + (entry.status === "correct" ? "c" : "w");
  saveWord(item, { practice: { ...p } });
  persistSavedTest();

  renderWordList();
  updateProgress();
  if (currentItem === item) renderWordCardStatus();
}

function nextUnansweredIndex() {
  const { entries, index } = practice;
  for (let step = 1; step <= entries.length; step++) {
    const i = (index + step) % entries.length;
    if (!isAnswered(entries[i])) return i;
  }
  return -1;
}

function nextPracticeWord() {
  cancelAutoNext();
  const next = nextUnansweredIndex();
  if (next === -1) finishPractice();
  else showQuestion(next, true);
}

function finishPractice() {
  stopTimer();
  cancelAutoNext();
  stopAllAudio();
  // Ending or finishing a saved test removes it from Saved tests
  if (practice.savedId) storeSavedPracticeTest(practice.savedId, null);
  practice.savedId = null;
  const { correct, wrong, total } = testCounts();
  const answered = correct + wrong;
  const pct = answered ? Math.round((correct / answered) * 100) : 0;

  practiceEl("practiceDoneTitle").textContent =
    !answered ? "Test ended" : pct === 100 ? "🏆 Perfect score!" : pct >= 80 ? "🎉 Great job!" : "👍 Keep practicing!";
  practiceEl("practiceDoneScore").textContent = `${correct} / ${answered}`;
  const unanswered = total - answered;
  const timedOut = practice.entries.filter(e => e.timedOut).length;
  practiceEl("practiceDoneText").textContent =
    `${pct}% correct` +
    (wrong ? ` · ${wrong} to practice again` : "") +
    (timedOut ? ` · ${timedOut} ran out of time` : "") +
    (unanswered ? ` · ${unanswered} not answered` : "");

  const retry = practiceEl("practiceRetryBtn");
  retry.hidden = !wrong;
  retry.textContent = `🔁 Practice ${wrong} missed word${wrong === 1 ? "" : "s"}`;

  if (answered && !practice.saved) {
    practice.saved = true;
    savePracticeSession({
      at: new Date().toISOString(), // when the test ended
      startedAt: practice.startedAt,
      scope: practice.scope,
      difficulty: practice.difficulty,
      letters: practice.letters,
      origins: practice.origins,
      label: practice.label,
      mode: practice.mode,
      total,
      correct,
      wrong,
      timedOut
    });
  }

  practice.index = -1;
  renderPracticeLetters();
  showPracticeScreen("practiceDone");
  renderPracticeList();
}

/* ---------------------------
   Audio (spoken only, never shown)
--------------------------- */
/* Origin / part of speech: read aloud like a bee pronouncer, and shown as text
   (neither gives away the spelling) */
const practiceInfoShown = {};

function clearPracticeInfo() {
  Object.keys(practiceInfoShown).forEach(key => delete practiceInfoShown[key]);
  const box = practiceEl("practiceInfo");
  box.innerHTML = "";
  box.hidden = true;
}

function showPracticeInfo(key, label, value) {
  speakAmerican(value);
  practiceInfoShown[key] = [label, value];
  const box = practiceEl("practiceInfo");
  box.innerHTML = "";
  ["origin", "pos"].forEach(k => {
    if (!practiceInfoShown[k]) return;
    const [l, v] = practiceInfoShown[k];
    const row = document.createElement("span");
    const labelEl = document.createElement("span");
    labelEl.className = "info-label";
    labelEl.textContent = l;
    row.append(labelEl, v);
    box.appendChild(row);
  });
  box.hidden = false;
}

function playPracticeWord() {
  const item = currentEntry()?.item;
  if (!item) return;
  if (item.audio_url) playMWAudio(item.audio_url);
  else speakAmerican(item.word);
}

/* ---------------------------
   Left-hand list and counters
--------------------------- */
function testCounts() {
  const entries = practice?.entries || [];
  return {
    total: entries.length,
    correct: entries.filter(e => e.status === "correct").length,
    wrong: entries.filter(e => e.status === "wrong").length
  };
}

function updatePracticeCounter() {
  const { total, correct, wrong } = testCounts();
  practiceEl("practiceCounter").textContent = `Word ${practice.index + 1} of ${total}`;
  practiceEl("practiceScore").textContent = total ? `✅ ${correct} · ❌ ${wrong} · ${total} words` : "";
  practiceEl("tallyTotal").textContent = total;
  practiceEl("tallyCorrect").textContent = correct;
  practiceEl("tallyWrong").textContent = wrong;
  practiceEl("tallyLeft").textContent = total - correct - wrong;
}

function renderPracticeList() {
  const list = practiceEl("practiceList");
  list.innerHTML = "";

  if (!practice) return; // start screen: the panel is hidden

  const { total, correct, wrong } = testCounts();
  practiceEl("practiceScore").textContent = `✅ ${correct} · ❌ ${wrong} · ${total} words`;

  let currentRow = null;
  practice.entries.forEach((entry, i) => {
    const row = document.createElement("div");
    row.className = "practice-item";
    if (entry.status) row.classList.add(entry.status);
    if (i === practice.index) {
      row.classList.add("current");
      currentRow = row;
    }

    const num = document.createElement("span");
    num.className = "pi-num";
    num.textContent = `${i + 1}.`;
    row.appendChild(num);

    if (isAnswered(entry)) {
      const word = document.createElement("span");
      word.textContent = entry.item.word + (entry.timedOut ? " ⏰" : "");
      row.appendChild(word);
    } else {
      const blank = document.createElement("span");
      blank.className = "pi-blank";
      row.appendChild(blank);
    }

    row.onclick = () => {
      if (practice.index === -1) return; // results screen: list is read-only
      showQuestion(i, !isAnswered(entry));
    };
    list.appendChild(row);
  });

  // Keep the current word visible without scrolling the whole page
  const panel = practiceEl("practiceListPanel");
  if (currentRow && panel.scrollHeight > panel.clientHeight) {
    const top = currentRow.offsetTop - panel.clientHeight / 2;
    panel.scrollTop = Math.max(0, top);
  }
}

/* ---------------------------
   Wiring
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  practiceEl("practiceStartBtn").addEventListener("click", () => {
    const modes = selectedModes();
    startPractice(wordsForModes(practicePool(), modes), modes.join("+"), practiceSetLabel(modes));
  });
  document.querySelectorAll("#practiceFilters .multi-select:not(.filter-select) input").forEach(input => {
    input.addEventListener("change", practiceFiltersChanged);
  });
  wireFilterSelect("practiceOriginFilter", practiceFiltersChanged);
  document.querySelectorAll('input[name="practiceMode"]').forEach(input => {
    input.addEventListener("change", showPracticeStart);
  });

  practiceEl("practiceRestartBtn").addEventListener("click", () => {
    practice = null;
    showPracticeStart();
  });
  practiceEl("practiceRetryBtn").addEventListener("click", () => {
    const missed = practice.entries.filter(e => e.status === "wrong").map(e => e.item);
    startPractice(missed, "wrong", `${practice.label} · Retry`);
  });
  practiceEl("practiceEndBtn").addEventListener("click", finishPractice);
  practiceEl("practiceSaveBtn").addEventListener("click", savePracticeForLater);
  practiceEl("practiceNextBtn").addEventListener("click", nextPracticeWord);

  practiceEl("practiceForm").addEventListener("submit", event => {
    event.preventDefault();
    checkPracticeAnswer();
  });
  // Enter after answering moves on (the Check button is hidden by then,
  // so don't rely on the form's implicit submit)
  practiceEl("practiceInput").addEventListener("keydown", event => {
    if (event.key === "Enter" && event.target.readOnly) {
      event.preventDefault();
      nextPracticeWord();
    }
  });

  practiceEl("practiceMWBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item?.audio_url) playMWAudio(item.audio_url);
  });
  // Steps through MW's other recordings (never the default, which has its own
  // button) without showing them written out, like asking the pronouncer
  practiceEl("practiceAltBtn").addEventListener("click", () => {
    const urls = recordedPronunciations(currentEntry()?.item);
    if (urls.length < 2) return;
    practice.altPronunciation = (practice.altPronunciation % (urls.length - 1)) + 1;
    playMWAudio(urls[practice.altPronunciation]);
  });
  practiceEl("practiceUSBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item) speakAmerican(item.word);
  });
  practiceEl("practiceDefBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item?.definition) speakAmerican(item.definition);
  });
  practiceEl("practiceSentBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item?.sentence) speakAmerican(item.sentence);
  });
  practiceEl("practiceOriginBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item?.origin) showPracticeInfo("origin", "Origin", item.origin);
  });
  practiceEl("practicePosBtn").addEventListener("click", () => {
    const item = currentEntry()?.item;
    if (item?.part_of_speech) showPracticeInfo("pos", "Part of speech", item.part_of_speech);
  });

  renderPracticeList();
});
