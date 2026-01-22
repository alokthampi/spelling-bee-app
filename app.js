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

  loadWords("regional");
});

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
