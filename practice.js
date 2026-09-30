/* ---------------------------
   Practice tab: hear the word, type the spelling.
   Uses globals from app.js (filteredWords, saveProgress, audio helpers...).
--------------------------- */
let practice = null;               // { entries, index } for the running test
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
}

/* ---------------------------
   Practice filters (independent of the Learning tab)
--------------------------- */
function practiceScopeAndLevelWords() {
  const scopes = selectedValues("practiceScopeFilter");
  const levels = selectedValues("practiceDifficultyFilter");
  return words.filter(w => scopes.includes(w._scope) && levels.includes(w.difficulty));
}

function practicePool() {
  return practiceScopeAndLevelWords().filter(w =>
    !practiceLetters.size || practiceLetters.has(w.word.charAt(0).toUpperCase())
  );
}

function renderPracticeLetters() {
  const container = practiceEl("practiceLetterFilter");
  container.innerHTML = "";

  const counts = {};
  practiceScopeAndLevelWords().forEach(w => {
    const letter = w.word.charAt(0).toUpperCase();
    counts[letter] = (counts[letter] || 0) + 1;
  });

  const all = document.createElement("button");
  all.className = "letter-btn all-btn";
  all.textContent = "All";
  all.classList.toggle("active", !practiceLetters.size);
  all.onclick = () => {
    practiceLetters.clear();
    practiceFiltersChanged();
  };
  container.appendChild(all);

  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach(letter => {
    const btn = document.createElement("button");
    btn.className = "letter-btn";
    btn.textContent = letter;
    btn.title = `${counts[letter] || 0} words`;
    btn.classList.toggle("active", practiceLetters.has(letter));
    btn.classList.toggle("no-words", !counts[letter]);
    btn.onclick = () => {
      if (practiceLetters.has(letter)) practiceLetters.delete(letter);
      else practiceLetters.add(letter);
      practiceFiltersChanged();
    };
    container.appendChild(btn);
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
    return;
  }
  if (!practice) showPracticeStart();
}

/* Called by app.js once the word lists have loaded */
function onWordsLoaded() {
  if (!practice) showPracticeStart();
}

function showPracticeStart() {
  const count = practicePool().length;
  const scopes = selectedValues("practiceScopeFilter")
    .map(s => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" + ");
  const letters = practiceLetters.size
    ? ` · Letters ${[...practiceLetters].sort().join(", ")}`
    : "";
  practiceEl("practiceSetText").textContent = count
    ? `${count} word${count === 1 ? "" : "s"} · ${scopes} · ${difficultySummary("practiceDifficultyFilter")}${letters}`
    : "No words match these filters. Try a different Scope, Difficulty or letter.";
  practiceEl("practiceStartBtn").disabled = !count;
  renderPracticeLetters();
  showPracticeScreen("practiceStart");
  renderPracticeList();
}

function startPractice(items) {
  const list = items.slice();
  if (practiceEl("practiceShuffle").checked) shuffleArray(list);
  practice = {
    entries: list.map(item => ({ item, status: null, typed: "" })),
    index: 0
  };
  showQuestion(0, true);
}

/* ---------------------------
   Question flow
--------------------------- */
function currentEntry() {
  return practice?.entries[practice.index] || null;
}

function showQuestion(index, autoplay) {
  practice.index = index;
  const entry = currentEntry();
  const input = practiceEl("practiceInput");

  showPracticeScreen("practiceQuestion");
  updatePracticeCounter();

  practiceEl("practiceMWBtn").disabled = !entry.item.audio_url;
  practiceEl("practiceDefBtn").disabled = !entry.item.definition;
  practiceEl("practiceSentBtn").disabled = !entry.item.sentence;

  if (entry.status === "correct" || entry.status === "wrong") {
    // Reviewing a word that was already answered
    input.value = entry.typed;
    showAnswerState(entry);
  } else {
    input.value = "";
    input.readOnly = false;
    input.classList.remove("is-correct", "is-wrong");
    practiceEl("practiceFeedback").hidden = true;
    practiceEl("practiceCheckBtn").hidden = false;
    practiceEl("practiceSkipBtn").hidden = false;
    practiceEl("practiceNextBtn").hidden = true;
  }

  renderPracticeList();
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
  if (!entry || entry.status === "correct" || entry.status === "wrong") {
    nextPracticeWord();
    return;
  }

  const input = practiceEl("practiceInput");
  const typed = input.value.trim();
  if (!typed) {
    input.focus();
    return;
  }

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
  feedback.innerHTML = correct
    ? `<div class="fb-title">✅ Correct!</div><div class="fb-word"></div>`
    : `<div class="fb-title">❌ Not quite</div>
       <div>Correct spelling: <span class="fb-word"></span></div>
       <div>You typed: <span class="fb-typed"></span></div>`;
  feedback.querySelector(".fb-word").textContent = entry.item.word;
  if (!correct) feedback.querySelector(".fb-typed").textContent = entry.typed;
  feedback.hidden = false;

  practiceEl("practiceCheckBtn").hidden = true;
  practiceEl("practiceSkipBtn").hidden = true;
  const next = practiceEl("practiceNextBtn");
  next.hidden = false;
  next.textContent = nextUnansweredIndex() === -1 ? "See results →" : "Next word →";
}

/* Save the typed result as the word's result, so Learning and Stats show it */
function recordPracticeResult(entry) {
  const item = entry.item;
  item.result = entry.status;
  selectedIndexes.add(progressKey(item._scope, item.word));
  saveProgress(item._scope, item.word, {
    result: item.result,
    markedForCorrection: item.markedForCorrection,
    correctionNote: item.correctionNote
  });
  renderWordList();
  updateProgress();
}

function nextUnansweredIndex() {
  const { entries, index } = practice;
  for (let step = 1; step <= entries.length; step++) {
    const i = (index + step) % entries.length;
    if (!entries[i].status || entries[i].status === "skipped") return i;
  }
  return -1;
}

function nextPracticeWord() {
  const next = nextUnansweredIndex();
  if (next === -1) finishPractice();
  else showQuestion(next, true);
}

function skipPracticeWord() {
  const entry = currentEntry();
  if (!entry) return;
  entry.status = "skipped";
  nextPracticeWord();
}

function finishPractice() {
  stopAllAudio();
  const { correct, wrong, total } = practiceCounts();
  const answered = correct + wrong;
  const pct = answered ? Math.round((correct / answered) * 100) : 0;

  practiceEl("practiceDoneTitle").textContent =
    !answered ? "Test ended" : pct === 100 ? "🏆 Perfect score!" : pct >= 80 ? "🎉 Great job!" : "👍 Keep practicing!";
  practiceEl("practiceDoneScore").textContent = `${correct} / ${answered}`;
  const unanswered = total - answered;
  practiceEl("practiceDoneText").textContent =
    `${pct}% correct` +
    (wrong ? ` · ${wrong} to practice again` : "") +
    (unanswered ? ` · ${unanswered} not answered` : "");

  const retry = practiceEl("practiceRetryBtn");
  retry.hidden = !wrong;
  retry.textContent = `🔁 Practice ${wrong} missed word${wrong === 1 ? "" : "s"}`;

  practice.index = -1;
  showPracticeScreen("practiceDone");
  renderPracticeList();
}

/* ---------------------------
   Audio (spoken only, never shown)
--------------------------- */
function playPracticeWord() {
  const item = currentEntry()?.item;
  if (!item) return;
  if (item.audio_url) playMWAudio(item.audio_url);
  else speakAmerican(item.word);
}

/* ---------------------------
   Left-hand list and counters
--------------------------- */
function practiceCounts() {
  const entries = practice?.entries || [];
  return {
    total: entries.length,
    correct: entries.filter(e => e.status === "correct").length,
    wrong: entries.filter(e => e.status === "wrong").length
  };
}

function updatePracticeCounter() {
  const { total, correct, wrong } = practiceCounts();
  practiceEl("practiceCounter").textContent = `Word ${practice.index + 1} of ${total}`;
  practiceEl("practiceScore").textContent = total ? `✅ ${correct} · ❌ ${wrong}` : "";
}

function renderPracticeList() {
  const list = practiceEl("practiceList");
  list.innerHTML = "";

  if (!practice) {
    practiceEl("practiceScore").textContent = "";
    const note = document.createElement("div");
    note.className = "practice-empty";
    note.textContent = "Your words will appear here as you spell them.";
    list.appendChild(note);
    return;
  }

  const { correct, wrong } = practiceCounts();
  practiceEl("practiceScore").textContent = `✅ ${correct} · ❌ ${wrong}`;

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

    if (entry.status === "correct" || entry.status === "wrong") {
      const word = document.createElement("span");
      word.textContent = entry.item.word;
      row.appendChild(word);
    } else {
      const blank = document.createElement("span");
      blank.className = "pi-blank";
      row.appendChild(blank);
    }

    row.onclick = () => showQuestion(i, !entry.status || entry.status === "skipped");
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
  practiceEl("practiceStartBtn").addEventListener("click", () => startPractice(practicePool()));
  document.querySelectorAll("#practiceFilters .multi-select input").forEach(input => {
    input.addEventListener("change", practiceFiltersChanged);
  });
  practiceEl("practiceRestartBtn").addEventListener("click", () => {
    practice = null;
    showPracticeStart();
  });
  practiceEl("practiceRetryBtn").addEventListener("click", () => {
    startPractice(practice.entries.filter(e => e.status === "wrong").map(e => e.item));
  });
  practiceEl("practiceEndBtn").addEventListener("click", finishPractice);
  practiceEl("practiceSkipBtn").addEventListener("click", skipPracticeWord);
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

  renderPracticeList();
});
