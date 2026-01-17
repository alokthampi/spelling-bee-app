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
   Load words by scope
--------------------------- */
function loadWords(scope = "regional") {
  const file =
    scope === "school" ? "words_school.json" : "words_regional.json";

  stopAllAudio();
  currentIndex = -1;
  selectedIndexes.clear();

  fetch(file)
    .then(res => res.json())
    .then(data => {
      words = data.map((w, i) => ({
        ...w,
        _originalIndex: i,
        result: null
      }));
      filteredWords = words;
      applyFilter();
    });
}

/* ---------------------------
   Search + Filters
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("scopeFilter")?.addEventListener("change", e => {
    loadWords(e.target.value);
  });

  document.getElementById("alphabetFilter")?.addEventListener("change", applyFilter);

  document.getElementById("searchInput")?.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });

  document.getElementById("difficultyFilter")?.addEventListener("change", applyFilter);
  document.getElementById("resultFilter")?.addEventListener("change", applyFilter);

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
   Filtering
--------------------------- */
function applyFilter() {
  const level = document.getElementById("difficultyFilter").value;
  const resultFilter = document.getElementById("resultFilter").value;
  const alphabet = document.getElementById("alphabetFilter").value.toLowerCase();

  filteredWords = words.filter(w => {
    const matchesLevel = level === "all" || w.difficulty === level;
    const matchesResult = resultFilter === "all" || w.result === resultFilter;
    const matchesSearch = w.word.toLowerCase().includes(searchQuery);
    const matchesAlphabet =
      alphabet === "all" || w.word.toLowerCase().startsWith(alphabet);

    return matchesLevel && matchesResult && matchesSearch && matchesAlphabet;
  });

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
    div.innerHTML = `<span class="word-number">${index + 1}.</span> ${item.word}`;
    div.onclick = () => selectWord(index);

    if (selectedIndexes.has(item.word)) div.classList.add("selected");
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
    audioPlayer.currentTime = 0;
    audioPlayer = null;
  }
}

function playMWAudio(url) {
  stopAllAudio();
  audioPlayer = new Audio(url);
  audioPlayer.playsInline = true;
  audioPlayer.preload = "auto";
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
function selectWord(index) {
  currentIndex = index;
  const item = filteredWords[index];
  selectedIndexes.add(item.word);

  document.getElementById("word").innerText = item.word;
  document.getElementById("difficulty").innerText = difficultyLabel(item.difficulty);
  document.getElementById("origin").innerText = item.origin || "—";
  document.getElementById("definition").innerText = item.definition;
  document.getElementById("sentence").innerText = item.sentence;
  document.getElementById("pos").innerText = item.part_of_speech;

  updateMWButtonState(item);

  if (item.audio_url) playMWAudio(item.audio_url);
  else speakAmerican(item.word);

  renderWordList();
  updateProgress();
}

/* ---------------------------
   Correct / Wrong
--------------------------- */
function markAnswer(result) {
  if (currentIndex === -1) return;
  filteredWords[currentIndex].result = result;
  renderWordList();
}

/* ---------------------------
   Pronunciation
--------------------------- */
function playMWPronunciation() {
  if (currentIndex !== -1 && filteredWords[currentIndex].audio_url)
    playMWAudio(filteredWords[currentIndex].audio_url);
}

function playAmericanPronunciation() {
  if (currentIndex !== -1)
    speakAmerican(filteredWords[currentIndex].word);
}

function readDefinition() {
  if (currentIndex !== -1)
    speakAmerican(filteredWords[currentIndex].definition);
}

function readSentence() {
  if (currentIndex !== -1)
    speakAmerican(filteredWords[currentIndex].sentence);
}

/* ---------------------------
   Progress
--------------------------- */
function updateProgress() {
  const total = filteredWords.length;
  const completed = filteredWords.filter(w => selectedIndexes.has(w.word)).length;

  document.getElementById("categoryCount").innerText =
    `${difficultyLabel(document.getElementById("difficultyFilter").value)} — ${total} words`;

  document.getElementById("progressText").innerText =
    `${completed} / ${total} completed`;
}

/* ---------------------------
   Reset
--------------------------- */
function resetSelection() {
  currentIndex = -1;
  selectedIndexes.clear();
  searchQuery = "";

  words.forEach(w => (w.result = null));

  document.getElementById("difficultyFilter").value = "all";
  document.getElementById("resultFilter").value = "all";
  document.getElementById("alphabetFilter").value = "all";
  document.getElementById("searchInput").value = "";

  stopAllAudio();
  applyFilter();
}

function updateMWButtonState(item) {
  const btn = document.getElementById("mwPronunciationBtn");
  if (btn) btn.disabled = !item?.audio_url;
}
