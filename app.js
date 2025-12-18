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
    // preserve original order
    words = data.map((w, i) => ({
      ...w,
      _originalIndex: i,
      result: null
    }));
    filteredWords = words;
    renderWordList();
    updateProgress();
  });

/* ---------------------------
   Search + Filters
--------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("searchInput")?.addEventListener("input", e => {
    searchQuery = e.target.value.toLowerCase().trim();
    applyFilter();
  });

  document.getElementById("difficultyFilter")?.addEventListener("change", applyFilter);
  document.getElementById("sortFilter")?.addEventListener("change", applyFilter);
  document.getElementById("resultFilter")?.addEventListener("change", applyFilter);
});

/* ---------------------------
   Helpers
--------------------------- */
function isCurrentWordLocked() {
  if (currentIndex === -1) return false;
  return !filteredWords[currentIndex]?.result;
}

function difficultyLabel(level) {
  if (level === "one") return "One Bee 🐝";
  if (level === "two") return "Two Bee 🐝🐝";
  if (level === "three") return "Three Bee 🐝🐝🐝";
  return "All Bees";
}

/* ---------------------------
   Filtering + Sorting
--------------------------- */
function applyFilter() {
  const level = document.getElementById("difficultyFilter")?.value || "all";
  const sort = document.getElementById("sortFilter")?.value || "original";
  const resultFilter = document.getElementById("resultFilter")?.value || "all";

  filteredWords = words.filter(w =>
    (level === "all" || w.difficulty === level) &&
    w.word.toLowerCase().includes(searchQuery) &&
    (resultFilter === "all" || w.result === resultFilter)
  );

  if (sort === "az") {
    filteredWords.sort((a, b) => a.word.localeCompare(b.word));
  } else if (sort === "za") {
    filteredWords.sort((a, b) => b.word.localeCompare(a.word));
  } else {
    filteredWords.sort((a, b) => a._originalIndex - b._originalIndex);
  }

  currentIndex = -1;
  renderWordList();
  updateProgress();
}

/* ---------------------------
   Render list (LOCKED)
--------------------------- */
function renderWordList() {
  const list = document.getElementById("wordList");
  list.innerHTML = "";

  filteredWords.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "word-item";
    div.innerText = item.word;

    div.onclick = () => {
      if (currentIndex !== -1 && index !== currentIndex && isCurrentWordLocked()) return;
      selectWord(index);
    };

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
  audioPlayer.play().catch(() => {});
}

function speakAmerican(text) {
  stopAllAudio();
  const u = new SpeechSynthesisUtterance(`\u200B ${text}`);
  u.lang = "en-US";
  u.rate = 0.85;
  const voice = getUSVoice();
  if (voice) u.voice = voice;
  setTimeout(() => speechSynthesis.speak(u), 200);
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
  document.getElementById("pos").innerText = item.part_of_speech;
  document.getElementById("definition").innerText = item.definition;
  document.getElementById("sentence").innerText = item.sentence;

  updateMWButtonState(item);
  item.audio_url ? playMWAudio(item.audio_url) : speakAmerican(item.word);

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
   Pronunciation / TTS
--------------------------- */
function playMWPronunciation() {
  if (currentIndex !== -1 && filteredWords[currentIndex].audio_url)
    playMWAudio(filteredWords[currentIndex].audio_url);
}

function playAmericanPronunciation() {
  if (currentIndex !== -1)
    speakAmerican(filteredWords[currentIndex].word);
}

function readPOS() {
  if (currentIndex !== -1)
    speakAmerican(filteredWords[currentIndex].part_of_speech);
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
    `${difficultyLabel(document.getElementById("difficultyFilter")?.value)} — ${total} words`;

  document.getElementById("progressText").innerText =
    `${completed} / ${total} completed`;
}

/* ---------------------------
   Reset (FIXED)
--------------------------- */
function resetSelection() {
  currentIndex = -1;
  selectedIndexes.clear();
  searchQuery = "";

  // clear results
  words.forEach(w => (w.result = null));

  // reset UI filters
  document.getElementById("difficultyFilter").value = "all";
  document.getElementById("sortFilter").value = "original";
  document.getElementById("resultFilter").value = "all";
  document.getElementById("searchInput").value = "";

  stopAllAudio();
  applyFilter();
}

/* ---------------------------
   Voice helpers
--------------------------- */
function getUSVoice() {
  const voices = speechSynthesis.getVoices();
  return voices.find(v => v.name.includes("Google US")) ||
         voices.find(v => v.lang === "en-US");
}

function updateMWButtonState(item) {
  const btn = document.getElementById("mwPronunciationBtn");
  if (btn) btn.disabled = !item?.audio_url;
}
