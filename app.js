let words = [];
let filteredWords = [];
let currentIndex = -1;
let selectedIndexes = new Set();

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

/* Map difficulty to display label */
function difficultyLabel(level) {
  if (level === "one") return "One Bee 🐝";
  if (level === "two") return "Two Bee 🐝🐝";
  if (level === "three") return "Three Bee 🐝🐝🐝";
  return "All Bees";
}

/* Apply Bee-level filter */
function applyFilter() {
  const level = document.getElementById("difficultyFilter").value;

  filteredWords =
    level === "all"
      ? words
      : words.filter(w => w.difficulty === level);

  resetSelection(false);
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

    if (selectedIndexes.has(index)) {
      div.classList.add("selected");
    }
    if (index === currentIndex) {
      div.classList.add("active");
    }

    list.appendChild(div);
  });
}

/* ✅ Select word → ACTIVE + SELECTED + speak word */
function selectWord(index) {
  currentIndex = index;

  // ✅ Mark clicked word as selected
  selectedIndexes.add(index);

  const item = filteredWords[index];

  /* Update UI */
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

  /* Update list styles */
  document.querySelectorAll(".word-item").forEach((el, i) => {
    el.classList.remove("active");

    if (selectedIndexes.has(i)) {
      el.classList.add("selected");
    }

    if (i === index) {
      el.classList.add("active");
    }
  });

  speechSynthesis.cancel();
  speakText(item.word);

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

/* Progress + Category Count */
function updateProgress() {
  const categoryCountEl = document.getElementById("categoryCount");
  const progressTextEl = document.getElementById("progressText");
  const level = document.getElementById("difficultyFilter")?.value || "all";

  if (!categoryCountEl || !progressTextEl) return;

  const total = filteredWords.length;
  const selected = selectedIndexes.size;

  categoryCountEl.innerText = `${difficultyLabel(level)} — ${total} words`;
  progressTextEl.innerText = `${selected} / ${total} completed`;
}

/* Reset */
function resetSelection(clearFilter = true) {
  currentIndex = -1;
  selectedIndexes.clear();
  speechSynthesis.cancel();

  document.getElementById("word").innerText = "Select a word";
  document.getElementById("difficulty").innerText = "—";
  document.getElementById("pos").innerText = "—";
  document.getElementById("definition").innerText = "—";
  document.getElementById("sentence").innerText = "—";
  document.getElementById("ipa").innerText = "—";

  if (clearFilter) {
    const dropdown = document.getElementById("difficultyFilter");
    if (dropdown) dropdown.value = "all";
    filteredWords = words;
    renderWordList();
  }

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
