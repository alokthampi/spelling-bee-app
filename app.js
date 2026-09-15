let words = [];
let filteredWords = [];
let currentIndex = -1;
let currentItem = null;               // canonical selected word
let selectedIndexes = new Set();
let searchQuery = "";
let audioPlayer = null;
let suppressActiveHighlight = false;  // controls yellow highlight only

const USER_ID = "nikku";

/* ---------------------------
   Speech setup (FORCE AMERICAN)
--------------------------- */
let americanVoice = null;

function loadAmericanVoice() {
  const voices = speechSynthesis.getVoices();
  if (!voices.length) return;

  americanVoice =
    voices.find(v => v.lang === "en-US" && v.name.includes("Samantha")) ||
    voices.find(v => v.lang === "en-US" && v.name.includes("Alex")) ||
    voices.find(v => v.lang === "en-US") ||
    null;
}

speechSynthesis.onvoiceschanged = loadAmericanVoice;

/* ---------------------------
   Firestore helpers
--------------------------- */
async function loadProgress(scope) {
  if (!window.db) return {};
  const { doc, getDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  const snap = await getDoc(doc(window.db, "progress", USER_ID));
  return snap.exists() ? snap.data()?.[scope] || {} : {};
}

async function saveProgress(scope, word, result) {
  if (!window.db) return;
  const { doc, setDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  await setDoc(
    doc(window.db, "progress", USER_ID),
    { [scope]: { [word]: result } },
    { merge: true }
  );
}

async function deleteProgress(scope, word) {
  if (!window.db) return;
  const { doc, updateDoc, deleteField } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  await updateDoc(
    doc(window.db, "progress", USER_ID),
    { [`${scope}.${word}`]: deleteField() }
  );
}

async function resetCloudProgress() {
  if (!window.db) return;
  const { doc, setDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  await setDoc(doc(window.db, "progress", USER_ID), {}, { merge: false });
}

/* ---------------------------
   Load words
--------------------------- */
async function loadWords(scope = "regional") {
  const file = scope === "school" ? "words_school.json" : "words_regional.json";

  stopAllAudio();
  currentIndex = -1;
  currentItem = null;
  suppressActiveHighlight = false;
  selectedIndexes.clear();

  const savedProgress = await loadProgress(scope);
  const res = await fetch(file);
  const data = await res.json();

  words = data.map((w, i) => ({
    ...w,
    _originalIndex: i,
    result: savedProgress[w.word] || null
  }));

  words.forEach(w => {
    if (w.result) selectedIndexes.add(w.word);
  });

  applyFilter();
}

/* ---------------------------
   Init
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  loadAmericanVoice();

  document.getElementById("scopeFilter").addEventListener("change", e => {
    loadWords(e.target.value);
  });

  document.getElementById("difficultyFilter").addEventListener("change", applyFilter);
  document.getElementById("resultFilter").addEventListener("change", applyFilter);

  document.getElementById("searchInput").addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });

  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  loadWords("regional");
});

/* ---------------------------
   Tabs
--------------------------- */
function switchTab(tab) {
  document.querySelectorAll(".tab-btn").forEach(btn =>
    btn.classList.toggle("active", btn.dataset.tab === tab)
  );
  document.querySelectorAll(".tab-panel").forEach(panel =>
    panel.classList.toggle("active", panel.id === `${tab}Tab`)
  );

  if (tab === "stats") renderStats();
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

/* ---------------------------
   Shuffle helpers (RESTORED)
--------------------------- */
function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffleFilteredWords() {
  if (!filteredWords.length) return;

  shuffleArray(filteredWords);

  currentIndex = -1;
  suppressActiveHighlight = true;

  renderWordList();
}

/* ---------------------------
   Filtering
--------------------------- */
function applyFilter() {
  const level = document.getElementById("difficultyFilter").value;
  const resultFilter = document.getElementById("resultFilter").value;
  const shuffleBtn = document.getElementById("shuffleBtn");

  filteredWords = words.filter(w => {
    const firstLetter = w.word?.charAt(0)?.toUpperCase();
    const letterMatch =
      !window.selectedLetters ||
      window.selectedLetters.size === 0 ||
      window.selectedLetters.has(firstLetter);

    return (
      (level === "all" || w.difficulty === level) &&
      (resultFilter === "all" || w.result === resultFilter) &&
      w.word.toLowerCase().includes(searchQuery) &&
      letterMatch
    );
  });

  if (shuffleBtn) {
    shuffleBtn.style.display =
      resultFilter === "wrong" ? "inline-block" : "none";
  }

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
    div.textContent = `${index + 1}. ${item.word}`;
    div.onclick = () => selectWord(index);

    if (index === currentIndex && !suppressActiveHighlight) {
      div.classList.add("active");
    }
    if (item.result === "correct") div.classList.add("correct");
    if (item.result === "wrong") div.classList.add("wrong");

    list.appendChild(div);
  });
}

/* ---------------------------
   Audio helpers
--------------------------- */
function stopAllAudio() {
  speechSynthesis.cancel();
  if (audioPlayer) {
    audioPlayer.pause();
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }
}

function playMWAudio(url) {
  stopAllAudio();
  audioPlayer = new Audio(url);
  audioPlayer.playsInline = true;
  audioPlayer.play().catch(() => {});
}

function speakAmerican(text) {
  stopAllAudio();
  const u = new SpeechSynthesisUtterance(`\u200B ${text}`);
  u.lang = "en-US";
  u.rate = 0.85;
  if (americanVoice) u.voice = americanVoice;
  speechSynthesis.speak(u);
}

/* ---------------------------
   Select word (auto-correct preserved)
--------------------------- */
async function selectWord(index) {
  currentIndex = index;
  currentItem = filteredWords[index];
  suppressActiveHighlight = false;

  const scope = document.getElementById("scopeFilter").value;

  if (!currentItem.result) {
    currentItem.result = "correct";
    selectedIndexes.add(currentItem.word);
    await saveProgress(scope, currentItem.word, "correct");
  }

  document.getElementById("word").innerText = currentItem.word;
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

  updateMWButtonState(currentItem);

  if (currentItem.audio_url) playMWAudio(currentItem.audio_url);
  else speakAmerican(currentItem.word);

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Correct / Wrong
--------------------------- */
async function markAnswer(result) {
  if (!currentItem) return;

  const scope = document.getElementById("scopeFilter").value;

  currentItem.result = result;
  selectedIndexes.add(currentItem.word);
  await saveProgress(scope, currentItem.word, result);

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Clear result
--------------------------- */
async function clearResult() {
  if (!currentItem) return;

  const scope = document.getElementById("scopeFilter").value;

  currentItem.result = null;
  selectedIndexes.delete(currentItem.word);
  await deleteProgress(scope, currentItem.word);

  suppressActiveHighlight = true;

  renderWordList();
  updateProgress();
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
  const completed = filteredWords.filter(w =>
    selectedIndexes.has(w.word)
  ).length;

  document.getElementById("categoryCount").innerText =
    `${difficultyLabel(document.getElementById("difficultyFilter").value)} — ${total} words`;

  document.getElementById("progressText").innerText =
    `${completed} / ${total} completed`;

  const fill = document.getElementById("progressBarFill");
  if (fill) {
    const pct = total ? Math.round((completed / total) * 100) : 0;
    fill.style.width = `${pct}%`;
  }

  renderStats();
}

/* ---------------------------
   Stats tab
--------------------------- */
function countResults(list) {
  let correct = 0;
  let wrong = 0;
  list.forEach(w => {
    if (w.result === "correct") correct++;
    else if (w.result === "wrong") wrong++;
  });
  return { correct, wrong, total: list.length, unattempted: list.length - correct - wrong };
}

function renderStackBar(container, counts) {
  container.innerHTML = "";
  if (!counts.total) return;

  const segments = [
    { key: "correct", cls: "seg-correct", count: counts.correct },
    { key: "wrong", cls: "seg-wrong", count: counts.wrong },
    { key: "unattempted", cls: "seg-empty", count: counts.unattempted }
  ];

  segments.forEach(seg => {
    if (!seg.count) return;
    const div = document.createElement("div");
    div.className = `stack-seg ${seg.cls}`;
    div.style.flexBasis = `${(seg.count / counts.total) * 100}%`;
    div.title = `${seg.key}: ${seg.count}`;
    container.appendChild(div);
  });
}

function renderStats() {
  const grid = document.getElementById("statGrid");
  const overallBar = document.getElementById("statsOverallBar");
  const overallLegend = document.getElementById("statsOverallLegend");
  const byDifficulty = document.getElementById("statsByDifficulty");
  if (!grid || !overallBar || !overallLegend || !byDifficulty) return;

  const counts = countResults(words);
  const answered = counts.correct + counts.wrong;
  const accuracy = answered ? Math.round((counts.correct / answered) * 100) : 0;

  grid.innerHTML = `
    <div class="stat-tile">
      <div class="stat-label">Total words</div>
      <div class="stat-value">${counts.total}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">✅ Correct</div>
      <div class="stat-value" style="color:var(--success)">${counts.correct}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">❌ Wrong</div>
      <div class="stat-value" style="color:var(--danger)">${counts.wrong}</div>
    </div>
    <div class="stat-tile">
      <div class="stat-label">Accuracy</div>
      <div class="stat-value">${accuracy}%</div>
    </div>
  `;

  renderStackBar(overallBar, counts);
  overallLegend.innerHTML = `
    <div class="legend-item"><span class="legend-swatch" style="background:var(--success)"></span>✅ Correct — <strong>${counts.correct}</strong></div>
    <div class="legend-item"><span class="legend-swatch" style="background:var(--danger)"></span>❌ Wrong — <strong>${counts.wrong}</strong></div>
    <div class="legend-item"><span class="legend-swatch" style="background:var(--border-strong)"></span>➖ Not attempted — <strong>${counts.unattempted}</strong></div>
  `;

  byDifficulty.innerHTML = "";
  ["one", "two", "three"].forEach(level => {
    const levelWords = words.filter(w => w.difficulty === level);
    if (!levelWords.length) return;

    const levelCounts = countResults(levelWords);

    const row = document.createElement("div");
    row.className = "mini-bar-row";
    row.innerHTML = `
      <div class="mini-bar-row-header">
        <span class="mini-bar-title">${difficultyLabel(level)}</span>
        <span class="mini-bar-caption">${levelCounts.correct} ✅ · ${levelCounts.wrong} ❌ · ${levelCounts.unattempted} left</span>
      </div>
      <div class="mini-bar-track"></div>
    `;

    renderStackBar(row.querySelector(".mini-bar-track"), levelCounts);
    byDifficulty.appendChild(row);
  });
}

/* ---------------------------
   Reset
--------------------------- */
async function confirmReset() {
  if (!confirm("⚠️ This will reset ALL progress.\n\nContinue?")) return;
  if (!confirm("❗ Are you REALLY sure?")) return;
  await resetSelection();
}

async function resetSelection() {
  currentIndex = -1;
  currentItem = null;
  suppressActiveHighlight = false;
  selectedIndexes.clear();
  searchQuery = "";

  words.forEach(w => (w.result = null));

  document.getElementById("difficultyFilter").value = "all";
  document.getElementById("resultFilter").value = "all";
  document.getElementById("searchInput").value = "";

  if (window.selectedLetters) {
    window.selectedLetters.clear();
    document
      .querySelectorAll(".letter-btn.active")
      .forEach(b => b.classList.remove("active"));
  }

  stopAllAudio();
  await resetCloudProgress();
  applyFilter();
}

/* ---------------------------
   MW button state 
--------------------------- */
function updateMWButtonState(item) {
  const btn = document.getElementById("mwPronunciationBtn");
  if (btn) btn.disabled = !item?.audio_url;
}
