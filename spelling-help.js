/* ---------------------------
   Spelling help, shared by the Learning card and Practice
   - spellingDiff / renderSpellingDiff / mistakeNotes: line a misspelling up
     with the right spelling and say what went wrong ("Double the “l”")
   - spellingTips: language-of-origin tips that fit this particular word
--------------------------- */

// Letters compare without case or accents, like the answer check does
function letterKey(ch) {
  return (ch || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/* Line up `typed` against `word` letter by letter (the fewest changes, where
   two neighbouring letters swapped count as one change: "recieve").
   Returns steps: { type: "same" | "wrong" | "missing" | "extra" | "swap", want, got } */
function spellingDiff(word, typed) {
  const a = [...word];
  const b = [...(typed || "").trim()];
  const n = a.length;
  const m = b.length;
  const same = (i, j) => letterKey(a[i]) === letterKey(b[j]);
  const canSwap = (i, j) => i > 1 && j > 1 && same(i - 1, j - 2) && same(i - 2, j - 1) && !same(i - 1, j - 1);

  const d = Array.from({ length: n + 1 }, (_, i) => Array.from({ length: m + 1 }, (_, j) => (i ? (j ? 0 : i) : j)));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (same(i - 1, j - 1) ? 0 : 1));
      if (canSwap(i, j)) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }

  const steps = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && same(i - 1, j - 1) && d[i][j] === d[i - 1][j - 1]) {
      steps.push({ type: "same", want: a[i - 1], got: b[j - 1] }); i--; j--;
    } else if (canSwap(i, j) && d[i][j] === d[i - 2][j - 2] + 1) {
      steps.push({ type: "swap", want: a[i - 2] + a[i - 1], got: b[j - 2] + b[j - 1] }); i -= 2; j -= 2;
    } else if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + 1) {
      steps.push({ type: "wrong", want: a[i - 1], got: b[j - 1] }); i--; j--;
    } else if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      steps.push({ type: "missing", want: a[i - 1], got: "" }); i--;
    } else {
      steps.push({ type: "extra", want: "", got: b[j - 1] }); j--;
    }
  }
  return steps.reverse();
}

/* One line of the comparison as highlighted letters.
   side "want": the right spelling, with the letters that were missed or wrong highlighted
   side "got":  what was typed, with wrong letters marked, extra ones crossed out
                and a _ wherever a letter was left out */
function renderSpellingDiff(steps, side) {
  const line = document.createElement("span");
  line.className = "sd-line";
  steps.forEach(step => {
    const text = side === "want" ? step.want : step.got;
    if (step.type === "same") {
      line.append(text);
      return;
    }
    const mark = document.createElement("span");
    if (side === "want") {
      if (!text) return; // an extra typed letter has nothing on this line
      mark.className = "sd-fix";
      mark.textContent = text;
    } else if (step.type === "missing") {
      mark.className = "sd-gap";
      mark.textContent = "_".repeat([...step.want].length);
      mark.title = `Missing “${step.want}”`;
    } else {
      mark.className = step.type === "extra" ? "sd-bad sd-extra" : "sd-bad";
      mark.textContent = text;
    }
    line.append(mark);
  });
  return line;
}

/* Plain-words notes on what went wrong, at most `limit`:
   "Double the “l”", "Only one “s”", "“ie” should be “ei” (swapped)" */
function mistakeNotes(steps, limit = 3) {
  // Neighbouring changes read better as one note: "sf" should be "ph"
  const runs = [];
  steps.forEach((step, k) => {
    if (step.type === "same") return;
    const last = runs[runs.length - 1];
    if (last && last.end === k - 1) {
      last.want += step.want; last.got += step.got; last.end = k; last.swap = false;
    } else {
      runs.push({ want: step.want, got: step.got, start: k, end: k, swap: step.type === "swap" });
    }
  });

  const say = s => (s === " " ? "a space" : s === "-" ? "a hyphen" : `“${s}”`);
  const before = run => letterKey(steps[run.start - 1]?.want.slice(-1));
  const after = run => letterKey(steps[run.end + 1]?.want.charAt(0));

  return runs.slice(0, limit).map(run => {
    if (run.swap) return `${say(run.got)} should be ${say(run.want)} (swapped)`;
    if (!run.got) {
      const doubled = [...run.want].length === 1 && [before(run), after(run)].includes(letterKey(run.want));
      return doubled ? `Double the ${say(run.want)}` : `Missing ${say(run.want)}`;
    }
    if (!run.want) {
      const doubled = [...run.got].length === 1 && [before(run), after(run)].includes(letterKey(run.got));
      return doubled ? `Only one ${say(run.got)}` : `Leave out ${say(run.got)}`;
    }
    return `${say(run.got)} should be ${say(run.want)}`;
  });
}

/* ---------------------------
   Language-of-origin tips
   Each language has patterns and a general tip used only when no pattern
   fits. A pattern is [regex on the word, tip, options]; the highlighted
   letters are capture group 1, or the whole match. Options:
   - unless: a regex on the word that rules the tip out (words that look
     like they fit but don't, such as "collar" for the Latin prefix tip)
   - sound: a regex on Merriam-Webster's written pronunciation (ü = "oo",
     sh, zh, ā = long a...). The tip shows only when the word really has
     that sound (and not `notSound`). Words without a pronunciation get the
     `ifSound` wording ("If ch sounds like “sh”…") instead, or no tip.
--------------------------- */
const ORIGIN_TIPS = {
  Greek: {
    patterns: [
      [/ph/, "Greek words spell the “f” sound ph (phone, graph, alphabet)."],
      [/(?:^|r)(rh)/, "rh is a Greek spelling; the h is silent (rhythm, rhinoceros)."],
      [/^(p)[snt]/, "A silent p at the start is a Greek clue (psychology, pneumonia, pterodactyl)."],
      [/ch/, "In Greek words ch says “k” (chorus, chaos, orchestra).",
        { sound: /k/, ifSound: "In Greek words ch usually says “k” (chorus, chaos, orchestra)." }],
      [/[^aeiou](y)[^aeiou]/, "Greek words often use y where English would use i (myth, cycle, symbol)."],
      [/(logy)$/, "-logy is Greek for “study of” (biology, anthropology)."],
      [/^(eu)/, "eu- is Greek for “good” or “well” (euphemism, eulogy)."],
      [/(graph|gram)/, "graph and gram are Greek for “write” (autograph, telegram)."],
      [/(ism)$/, "-ism is a Greek ending for an idea or a way of acting (heroism, optimism).", { unless: /^prism$/ }]
    ],
    general: "Greek words often use ph, ch, rh and y where English would use f, k, r and i."
  },
  Latin: {
    patterns: [
      [/^(?:a|co|e|i|o|su)(cc|dd|ff|gg|ll|mm|nn|pp|rr|ss|tt)/,
        "Double letter near the start? In Latin words a prefix often changes its last letter to match the next one: ad + cord → accord, in + mobile → immobile, sub + port → support.",
        // look like a prefix + double letter, but aren't
        { unless: /^(collar|attitud|copper|essen|annel|anniv|annoy|accomplic)/ }],
      [/(cian)$/, "-cian is for a person who does something (musician, magician, clinician)."],
      [/(tion)$/, "The “shun” ending is usually spelled -tion in Latin words (nation, attention)."],
      [/(sion)$/, "-sion is common after l, n, r or s (tension, version, mission), and when a related word has d or s (decide → decision)."],
      [/(ible)$/, "-ible usually follows a Latin root that isn't a word by itself (visible, edible, combustible)."],
      [/(able)$/, "-able usually follows a whole English word (read + able → readable)."],
      [/(ance|ancy|ant|ence|ency|ent)$/,
        "-ant / -ance and -ent / -ence sound alike. A related word can give the vowel away: substance → substantial, confidence → confidential.",
        { unless: /ment$|^stance$/ }],
      [/(ous)(ly|ness)?$/, "-ous makes a describing word and is always spelled -ous, never -us: nervous, previous (but a thing is -us: bonus, census)."]
    ],
    general: "Latin words are built from parts (prefix + root + ending) that keep their spelling from word to word: re-, pre-, -tion, -ment."
  },
  French: {
    patterns: [
      [/(que)$/, "-que at the end says “k” (unique, antique, boutique)."],
      [/(gue)$/, "-gue says “g”; the u and e are silent (league, intrigue, vogue)."],
      [/(ette)$/, "-ette means “small” and says “et” (kitchenette, statuette)."],
      [/(eau)/, "eau says “oh” (plateau, bureau, beau)."],
      [/(eur)$/, "-eur says “ur” (chauffeur, entrepreneur, grandeur)."],
      [/(ch)/, "Here ch says “sh”, the French way (chef, machine, brochure).",
        { sound: /sh/, notSound: /ch/, ifSound:"If ch sounds like “sh”, that's the French way (chef, machine, brochure)." }],
      [/(oi)/, "Here oi says “wah”, the French way (memoir, reservoir).",
        { sound: /w[äȯ]/, ifSound: "If oi sounds like “wah”, that's French (memoir, reservoir)." }],
      [/(ou)(?!s(ly|ness)?$)/, "Here ou says “oo”, the French way (soup, route, rendezvous).",
        { sound: /ü|u̇/, ifSound: "If ou sounds like “oo”, that's French (soup, route, souvenir)." }],
      [/(age)$/, "Here -age says “ahzh”, the French way (garage, montage, collage).",
        { sound: /äzh/, ifSound: "If -age sounds like “ahzh”, that's French (garage, montage, collage)." }],
      [/(et)$/, "The t at the end is silent, the French way (ballet, buffet, gourmet).",
        { sound: /ā(\s|$)/, ifSound: "If the t at the end is silent, that's French (ballet, buffet, gourmet)." }]
    ],
    general: "French spellings often have letters you don't hear: silent endings, -que for “k” and eau for “oh”."
  },
  "Old English": {
    patterns: [
      [/^(k)n/, "A silent k before n is Old English (knight, knee, knot)."],
      [/^(w)r/, "A silent w before r is Old English (write, wrist, wring)."],
      [/^(g)n/, "A silent g before n is an old spelling (gnaw, gnat)."],
      [/(eigh)/, "eigh says a long “a” (eight, weigh, neighbor).", { unless: /^height/ }],
      [/(igh)/, "igh says a long “i” (night, knight, light).", { unless: /^(?!height).*eigh/ }],
      [/(ough|augh)/, "ough and augh are old spellings with many sounds (though, through, caught); learn each word by sight."],
      [/[aeiou](tch)/, "After a short vowel, the “ch” sound is usually spelled -tch (hutch, hatchet, kitchen)."],
      [/[aeiou](dge)/, "After a short vowel, the “j” sound is usually spelled -dge (edge, badge, bridge)."],
      [/[aeiou](ck)/, "After a short vowel, the “k” sound is often spelled ck (brick, knock, pocket)."],
      [/^(wh)/, "wh at the start is Old English (what, wheel, whelp)."]
    ],
    general: "Old English words are the oldest in English; their spelling keeps sounds people stopped saying, like silent k, gh and w."
  },
  "Old Norse": {
    patterns: [[/(sk)/, "sk is often a Norse clue (sky, skin, skull, bask)."]],
    general: "Old Norse gave English short, everyday words, often with sk or a hard g or k (sky, egg, get, kettle)."
  },
  Italian: {
    patterns: [
      [/(zz)/, "Italian loves a double z (pizza, mezzo, paparazzi)."],
      [/(gh)[ei]/, "gh before e or i keeps the g hard (spaghetti, ghetto)."],
      [/(c)[ei]/, "Here c says “ch”, the Italian way (cello, concerto).",
        { sound: /ch/, ifSound: "If c sounds like “ch”, that's Italian (cello, concerto)." }],
      [/(([bcdfglmnprstv])\2)/, "Italian words often double their consonants (spaghetti, umbrella, staccato)."],
      [/([aio])$/, "Italian words usually end in a vowel (piano, opera, confetti)."]
    ],
    general: "Italian words are spelled much as they sound, often with double consonants and a vowel at the end."
  },
  Spanish: {
    patterns: [
      [/(qu)/, "In Spanish words qu says “k” (mosquito, quesadilla)."],
      [/(ll)/, "Here ll says “y”, the Spanish way (tortilla, quesadilla).",
        { sound: /y/, ifSound: "If ll sounds like “y”, that's Spanish (tortilla, quesadilla)." }],
      [/(rr)/, "rr is the rolled Spanish r (burrito, guerrilla)."],
      [/(j)/, "Here j says “h”, the Spanish way (jalapeño, fajita).",
        { sound: /h/, ifSound: "In Spanish words j usually says “h” (jalapeño, fajita)." }],
      [/([ao])$/, "Spanish words usually end in a vowel, often -o or -a (bonanza, burrito, patio)."]
    ],
    general: "Spanish words are spelled the way they sound, letter by letter."
  },
  German: {
    patterns: [
      [/(sch)/, "sch is a German spelling (schnauzer, schnitzel)."],
      // A k from c or qu elsewhere doesn't count when ch says "ch" or "sh" (coach, quiche)
      [/(ch)/, "Here ch says “k”, as it often does in German (dachshund, Bach).", { sound: /k/, notSound: /ch|sh/ }],
      [/(ei)/, "In German words ei says a long “i” (stein, poltergeist).", { sound: /ī/ }],
      [/(ie)/, "In German words ie says “ee” (glockenspiel).", { sound: /ē/ }]
    ],
    general: "German words keep German letter groups: sch, ei (long “i”), ie (“ee”), and endings like -en and -er."
  },
  Dutch: {
    patterns: [[/(oo|aa)/, "A double vowel is a Dutch clue (cookie, aardvark)."]],
    general: "Dutch gave English many sailing and everyday words (yacht, skipper, cookie)."
  },
  Arabic: {
    patterns: [[/^(al)/, "al- is Arabic for “the” (algebra, alcohol, alchemy)."]]
  },
  Japanese: {
    general: "Japanese words are spelled the way they sound, one syllable at a time, with clear vowels a, i, u, e, o (karate, tsunami, ramen)."
  },
  Hawaiian: {
    general: "Hawaiian uses just 12 letters (a, e, i, o, u, h, k, l, m, n, p, w) and every syllable ends in a vowel, so spell each sound: lu-au, la-na-i."
  },
  Sanskrit: {
    general: "Words from Sanskrit and Hindi often keep a for the “ah” sound (nirvana, mantra, avatar)."
  },
  "Native American": {
    general: "This word began in a Native American language and reached English through Spanish (condor, maize, canoe)."
  },
  Eponym: {
    general: "This word comes from the name of a person or place, so it keeps that name's spelling (Arthurian, sandwich, cardigan)."
  },
  Imitative: {
    general: "This word imitates a sound, so spell it the way it sounds (buzz, sizzle, cuckoo)."
  }
};

// Languages that share another's tips
const ORIGIN_TIP_ALIASES = {
  Norwegian: "Old Norse", Swedish: "Old Norse", Afrikaans: "Dutch", Yiddish: "German",
  Hindi: "Sanskrit", Bengali: "Sanskrit",
  Quechua: "Native American", Aymara: "Native American", Taino: "Native American",
  Arawak: "Native American", Carib: "Native American", Nahuatl: "Native American"
};

/* Tips for this word: { lang, letters, text }. Pattern tips for every
   language in its origin (letters = the matching letters in the word),
   else the root language's general tip. At most `limit`. */
function spellingTips(item, limit = 3) {
  const word = letterKey(item?.word);
  if (!word) return [];
  const langs = (item.origin || "").split(",").map(s => s.trim()).filter(Boolean);
  // MW's written pronunciations, with "ow" (au̇) taken out so u̇ only means "oo"
  const sounds = (item.pronunciations || []).map(p => p.written || "").join(" / ").replace(/au̇/g, "aw");
  const tips = [];
  const seen = new Set();
  langs.forEach(lang => {
    (ORIGIN_TIPS[ORIGIN_TIP_ALIASES[lang] || lang]?.patterns || []).forEach(([re, text, opts = {}]) => {
      const match = word.match(re);
      if (!match || opts.unless?.test(word)) return;
      let shown = text;
      if (opts.sound) {
        if (sounds) {
          if (!opts.sound.test(sounds) || opts.notSound?.test(sounds)) return;
        } else if (opts.ifSound) {
          shown = opts.ifSound;
        } else {
          return;
        }
      }
      if (seen.has(shown)) return;
      seen.add(shown);
      tips.push({ lang, letters: match[1] || match[0], text: shown });
    });
  });
  // Otherwise the root language's general tip (the first one listed). A
  // language the word only passed through says little about its spelling.
  const root = langs[0];
  const general = ORIGIN_TIPS[ORIGIN_TIP_ALIASES[root] || root]?.general;
  if (!tips.length && general) tips.push({ lang: root, letters: "", text: general });
  return tips.slice(0, limit);
}

// <li>s for a tips list: "Greek  ph  Greek words spell the “f” sound ph…"
function renderSpellingTips(list, tips) {
  list.replaceChildren(...tips.map(tip => {
    const li = document.createElement("li");
    const lang = document.createElement("span");
    lang.className = "tip-lang";
    lang.textContent = tip.lang;
    li.append(lang);
    if (tip.letters) {
      const letters = document.createElement("b");
      letters.className = "tip-letters";
      letters.textContent = tip.letters;
      li.append(letters);
    }
    li.append(tip.text);
    return li;
  }));
}
