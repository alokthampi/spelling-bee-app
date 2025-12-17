let words = [];
let filteredWords = [];
let currentIndex = -1;
let selectedIndexes = new Set();
let searchQuery = "";

/* Ensure voices load */
window.speechSynthesis.onvoiceschanged = () => {
  speechSynthesis.getVoices();
};

/* Load words JSON */
fetch("words.json")
  .then(res => res.json())
  .then(data => {
    words = data;
    filteredWords = words;
    renderWordList();
    updateProgress();
  });

/* 🆕 Search input listener */
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });
});

/* Map difficulty to display label */
function difficultyLabel(level) {
  if (level === "one") return "One Bee 🐝";
  if (level === "two") return "Two Bee 🐝🐝";
  if (level === "three") return "Three Bee 🐝🐝🐝";
  return "All Bees";
}

/* Apply Bee-level + search filter */
function applyFilter() {
  const level = document.getElementById("difficultyFilter").value;

  filteredWords = words.filter(w => {
    const matchesLevel = level === "all" || w.difficulty === level;
    const matchesSearch = w.word.toLowerCase().includes(searchQuery);
    return matchesLevel && matchesSearch;
  });

  currentIndex = -1;
  renderWordList();
  updateProgress();
}

/* Render word list */
function renderWordList() {
  const list = document.getElementById("wordList");
  list.innerHTML = "";

  filteredWords.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "word-item";
    div.innerText = item.word;
    div.onclick = () => selectWord(index);

    if (selectedIndexes.has(item.word)) {
      div.classList.add("selected");
    }
    if (index === currentIndex) {
      div.classList.add("active");
    }

    list.appendChild(div);
  });
}

/* Select word → ACTIVE + SELECTED + speak */
function selectWord(index) {
  currentIndex = index;
  const item = filteredWords[index];

  /* ✅ Track by WORD (safe across filters/search) */
  selectedIndexes.add(item.word);

  document.getElementById("word").innerText = item.word;
  document.getElementById("difficulty").innerText =
    difficultyLabel(item.difficulty);
  document.getElementById("pos").innerText = item.part_of_speech;
  document.getElementById("definition").innerText = item.definition;
  document.getElementById("sentence").innerText = item.sentence;

  document.getElementById("ipa").innerText =
    item.alternate_pronunciations
      .map(p => `${p.dialect}: ${p.ipa}`)
      .join(" | ");

  speechSynthesis.cancel();
  speakText(item.word);

  renderWordList();
  updateProgress();
}

/* 🔊 Manual audio buttons */
function readPOS() {
  if (currentIndex === -1) return;
  speakText(filteredWords[currentIndex].part_of_speech);
}

function readDefinition() {
  if (currentIndex === -1) return;
  speakText(filteredWords[currentIndex].definition);
}

function readSentence() {
  if (currentIndex === -1) return;
  speakText(filteredWords[currentIndex].sentence);
}

/* Core speech helper */
function speakText(text) {
  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(`\u200B ${text}`);
  utterance.lang = "en-US";
  utterance.rate = 0.85;

  const voice = getUSVoice();
  if (voice) utterance.voice = voice;

  setTimeout(() => {
    speechSynthesis.resume();
    speechSynthesis.speak(utterance);
  }, 250);
}

/* Progress */
function updateProgress() {
  const categoryCountEl = document.getElementById("categoryCount");
  const progressTextEl = document.getElementById("progressText");
  const level = document.getElementById("difficultyFilter")?.value || "all";

  if (!categoryCountEl || !progressTextEl) return;

  const total = filteredWords.length;
  const completed = filteredWords.filter(w =>
    selectedIndexes.has(w.word)
  ).length;

  categoryCountEl.innerText = `${difficultyLabel(level)} — ${total} words`;
  progressTextEl.innerText = `${completed} / ${total} completed`;
}

/* Reset */
function resetSelection(clearFilter = true) {
  currentIndex = -1;
  selectedIndexes.clear();
  searchQuery = "";
  speechSynthesis.cancel();

  document.getElementById("word").innerText = "Select a word";
  document.getElementById("difficulty").innerText = "—";
  document.getElementById("pos").innerText = "—";
  document.getElementById("definition").innerText = "—";
  document.getElementById("sentence").innerText = "—";
  document.getElementById("ipa").innerText = "—";

  const searchInput = document.getElementById("searchInput");
  if (searchInput) searchInput.value = "";

  if (clearFilter) {
    const dropdown = document.getElementById("difficultyFilter");
    if (dropdown) dropdown.value = "all";
    filteredWords = words;
  }

  renderWordList();
  updateProgress();
}

/* Get American English voice */
function getUSVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.name.includes("Google US")) ||
    voices.find(v => v.lang === "en-US")
  );
}
