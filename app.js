let words = [];
let index = 0;

fetch("words.json")
  .then(res => res.json())
  .then(data => {
    words = data;
    showWord();
  });

function showWord() {
  document.getElementById("word").innerText = words[index].word;
  document.getElementById("context").innerText = words[index].context;
}

function speakWord() {
  const utterance = new SpeechSynthesisUtterance(words[index].word);
  utterance.lang = "en-US"; // American pronunciation
  speechSynthesis.speak(utterance);
}

function nextWord() {
  index = (index + 1) % words.length;
  showWord();
}
