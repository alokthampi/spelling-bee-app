let words = [];
let filteredWords = [];
let currentIndex = -1;
let selectedIndexes = new Set();
let searchQuery = "";

let audioPlayer = null;

/* ---------------------------
   Speech setup
--------------------------- */
window.speechSynthesis.onvoiceschanged = () => {
  speechSynthesis.getVoices();
};

/* ---------------------------
   Load words
--------------------------- */
fetch("words.json")
  .then(res => res.json())
  .then(data => {
    words = data;
    filteredWords = words;
    renderWordList();
    updateProgress();
  });

/* ---------------------------
   Search
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.getElementById("searchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });
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
   Filtering
--------------------------- */
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

/* ---------------------------
   Render list
--------------------------- */
function renderWordList() {
  const list = document.getElementById("wordList");
  list.innerHTML = "";

  filteredWords.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "word-item";
    div.innerText = item.word;
    div.onclick = () => selectWord(index);

    if (selectedIndexes.has(item.word)) div.classList.add("selected");
    if (index === currentIndex) div.classList.add("active");

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
  audioPlayer.play().catch(() => {
    console.warn("Dictionary audio failed");
  });
}

function speakAmerican(text) {
  stopAllAudio();

  const utterance = new SpeechSynthesisUtterance(`\u200B ${text}`);
  utterance.lang = "en-US";
  utterance.rate = 0.85;

  const voice = getUSVoice();
  if (voice) utterance.voice = voice;

  setTimeout(() => {
    speechSynthesis.resume();
    speechSynthesis.speak(utterance);
  }, 200);
}

/* ---------------------------
   Dictionary button state
--------------------------- */
function updateMWButtonState(item) {
  const btn = document.getElementById("mwPronunciationBtn");
  if (!btn) return;

  btn.disabled = !item?.audio_url;
}

/* ---------------------------
   Select word
--------------------------- */
function selectWord(index) {
  currentIndex = index;
  const item = filteredWords[index];

  selectedIndexes.add(item.word);

  document.getElementById("word").innerText = item.word;
  document.getElementById("difficulty").innerText =
    difficultyLabel(item.difficulty);
  document.getElementById("pos").innerText = item.part_of_speech;
  document.getElementById("definition").innerText = item.definition;
  document.getElementById("sentence").innerText = item.sentence;

  updateMWButtonState(item);

  /* 🔊 Default pronunciation */
  if (item.audio_url) {
    playMWAudio(item.audio_url);
  } else {
    speakAmerican(item.word);
  }

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Manual pronunciation
--------------------------- */
function playMWPronunciation() {
  if (currentIndex === -1) return;

  const item = filteredWords[currentIndex];
  if (!item.audio_url) return;

  playMWAudio(item.audio_url);
}

function playAmericanPronunciation() {
  if (currentIndex === -1) return;
  speakAmerican(filteredWords[currentIndex].word);
}

/* ---------------------------
   Manual reads (TTS only)
--------------------------- */
function readPOS() {
  if (currentIndex === -1) return;
  speakAmerican(filteredWords[currentIndex].part_of_speech);
}

function readDefinition() {
  if (currentIndex === -1) return;
  speakAmerican(filteredWords[currentIndex].definition);
}

function readSentence() {
  if (currentIndex === -1) return;
  speakAmerican(filteredWords[currentIndex].sentence);
}

/* ---------------------------
   Progress
--------------------------- */
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

/* ---------------------------
   Reset
--------------------------- */
function resetSelection(clearFilter = true) {
  currentIndex = -1;
  selectedIndexes.clear();
  searchQuery = "";
  stopAllAudio();

  document.getElementById("word").innerText = "Select a word";
  document.getElementById("difficulty").innerText = "—";
  document.getElementById("pos").innerText = "—";
  document.getElementById("definition").innerText = "—";
  document.getElementById("sentence").innerText = "—";

  updateMWButtonState(null);

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

/* ---------------------------
   Voice selection
--------------------------- */
function getUSVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.name.includes("Google US")) ||
    voices.find(v => v.lang === "en-US")
  );
}
