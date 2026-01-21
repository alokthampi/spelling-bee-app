let words = [];
let filteredWords = [];
let currentIndex = -1;
let selectedIndexes = new Set();
let searchQuery = "";
let audioPlayer = null;

const USER_ID = "nikku";

/* ---------------------------
   Speech setup
--------------------------- */
window.speechSynthesis.onvoiceschanged = () => {
  speechSynthesis.getVoices();
};

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
  await setDoc(doc(window.db, "progress", USER_ID), {
    [scope]: { [word]: result }
  }, { merge: true });
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
  document.getElementById("scopeFilter").addEventListener("change", e => {
    loadWords(e.target.value);
  });

  document.getElementById("alphabetFilter").addEventListener("change", applyFilter);
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
   Shuffle helpers
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
  renderWordList();
}

/* ---------------------------
   Filtering
--------------------------- */
function applyFilter() {
  const level = document.getElementById("difficultyFilter").value;
  const resultFilter = document.getElementById("resultFilter").value;
  const alphabet = document.getElementById("alphabetFilter").value.toLowerCase();
  const shuffleBtn = document.getElementById("shuffleBtn");

  filteredWords = words.filter(w => (
    (level === "all" || w.difficulty === level) &&
    (resultFilter === "all" || w.result === resultFilter) &&
    w.word.toLowerCase().includes(searchQuery) &&
    (alphabet === "all" || w.word.toLowerCase().startsWith(alphabet))
  ));

  shuffleBtn.style.display = resultFilter === "wrong" ? "block" : "none";

  renderWordList();
  updateProgress();
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
    div.textContent = `${index + 1}. ${item.word}`;
    div.onclick = () => selectWord(index);

    if (index === currentIndex) div.classList.add("active");
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
    audioPlayer = null;
  }
}

function playMWAudio(url) {
  stopAllAudio();
  audioPlayer = new Audio(url);
  audioPlayer.play().catch(() => {});
}

function speakAmerican(text) {
  stopAllAudio();
  const u = new SpeechSynthesisUtterance(`\u200B ${text}`);
  u.lang = "en-US";
  u.rate = 0.85;
  speechSynthesis.speak(u);
}

/* ---------------------------
   Select word
--------------------------- */
async function selectWord(index) {
  currentIndex = index;
  const item = filteredWords[index];
  selectedIndexes.add(item.word);

  if (!item.result) {
    item.result = "correct";
    await saveProgress(
      document.getElementById("scopeFilter").value,
      item.word,
      "correct"
    );
  }

  document.getElementById("word").innerText = item.word;
  document.getElementById("difficulty").innerText = difficultyLabel(item.difficulty);
  document.getElementById("origin").innerText = item.origin || "—";
  document.getElementById("definition").innerText = item.definition;
  document.getElementById("sentence").innerText = item.sentence;
  document.getElementById("pos").innerText = item.part_of_speech;

  updateMWButtonState(item);
  item.audio_url ? playMWAudio(item.audio_url) : speakAmerican(item.word);

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Correct / Wrong
--------------------------- */
async function markAnswer(result) {
  if (currentIndex === -1) return;
  const item = filteredWords[currentIndex];
  item.result = result;
  selectedIndexes.add(item.word);

  await saveProgress(
    document.getElementById("scopeFilter").value,
    item.word,
    result
  );

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Pronunciation
--------------------------- */
function playMWPronunciation() {
  if (currentIndex !== -1 && filteredWords[currentIndex].audio_url) {
    playMWAudio(filteredWords[currentIndex].audio_url);
  }
}

function playAmericanPronunciation() {
  if (currentIndex !== -1) speakAmerican(filteredWords[currentIndex].word);
}

function readDefinition() {
  if (currentIndex !== -1) speakAmerican(filteredWords[currentIndex].definition);
}

function readSentence() {
  if (currentIndex !== -1) speakAmerican(filteredWords[currentIndex].sentence);
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
  selectedIndexes.clear();
  searchQuery = "";

  words.forEach(w => (w.result = null));

  document.getElementById("difficultyFilter").value = "all";
  document.getElementById("resultFilter").value = "all";
  document.getElementById("alphabetFilter").value = "all";
  document.getElementById("searchInput").value = "";

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
