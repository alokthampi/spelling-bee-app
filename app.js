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
  });

/* Map difficulty to display label */
function difficultyLabel(level) {
  if (level === "one") return "One Bee 🐝";
  if (level === "two") return "Two Bee 🐝🐝";
  if (level === "three") return "Three Bee 🐝🐝🐝";
  return "—";
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
    list.appendChild(div);
  });
}

/* Select word → highlight + speak ONLY the word */
function selectWord(index) {
  if (currentIndex !== -1) {
    selectedIndexes.add(currentIndex);
  }

  currentIndex = index;
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

  /* Update colors */
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

  document.querySelectorAll(".word-item").forEach(el =>
    el.classList.remove("selected", "active")
  );

  if (clearFilter) {
    const dropdown = document.getElementById("difficultyFilter");
    if (dropdown) dropdown.value = "all";
    filteredWords = words;
    renderWordList();
  }
}

/* Get American English voice */
function getUSVoice() {
  const voices = speechSynthesis.getVoices();
  return (
    voices.find(v => v.name.includes("Google US")) ||
    voices.find(v => v.lang === "en-US")
  );
}
