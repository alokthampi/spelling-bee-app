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
   - alts: wrong answers that sound right, for this rule's pattern drill
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
      [/^(eu)/, "eu- is Greek for “good” or “well” (euphemism, eulogy).", { unless: /^eur(ek|o)/ }],
      [/(graph|gram)/, "graph and gram are Greek for “write” (autograph, telegram)."],
      [/(ism)$/, "-ism is a Greek ending for an idea or a way of acting (heroism, optimism).", { unless: /^prism$/ }],
      // From here on: the 2026 Words of the Champions language guide (pp. 64-81)
      [/^(x)/, "At the start of a Greek word, x says “z” (xylophone, xyloglyphy).", { sound: /(^|\s)z/, alts: ["z"] }],
      [/^(k)/, "Greek words sometimes keep k for the “k” sound (kyphoplasty, kinesiology) where Latin would use c.", { alts: ["c", "ch"] }],
      [/(c)[aou]/, "A “k” sound in a Greek word can be c, k or ch, as in cataphora, kyphoplasty and allochroous; ask for the root to be sure.",
        { sound: /k/, alts: ["k", "ch"] }]
    ],
    general: "Greek words often use ph, ch, rh and y where English would use f, k, r and i. Greek roots are usually joined with an o (hydr-o-phobia)."
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
      [/(ous)(ly|ness)?$/, "-ous makes a describing word and is always spelled -ous, never -us: nervous, previous (but a thing is -us: bonus, census)."],
      // From here on: the 2026 Words of the Champions language guide (pp. 64-81)
      [/(ae)$/, "A Latin plural that ends in an “ee” sound is spelled -ae (lunulae, larvae).", { sound: /ē/, alts: ["i", "e", "ee"] }],
      [/[^aeiou](i)$/, "A Latin plural that ends in an “eye” sound is spelled -i (stimuli, cacti).", { sound: /ī(\s|$)/, unless: /-/, alts: ["ae", "y", "ie"] }],
      [/(us)$/, "A thing (a noun) that ends in “us” is spelled -us in Latin words (cumulus, impetus); a describing word is -ous.",
        { unless: /ous$/, alts: ["ous", "ess"] }],
      [/(au)/, "In Latin words au can say “ah” or “aw” (plaudits, fraudulent).", { sound: /ȯ|ä/, alts: ["o", "aw", "a"] }],
      [/(?:^|[^aeoqg])(u)(?![aeiouy])/, "The “oo” and “yoo” sounds are spelled with a plain u in Latin words (elocution, cumulus).",
        { sound: /ü/, alts: ["oo", "ew", "eu"] }],
      [/(c)(?![eiyh])/, "Latin spells the “k” sound with c; k, z and w are very rare in Latin words (cumulus, cantor).",
        { sound: /k/, alts: ["k", "ck"] }]
    ],
    general: "Latin words are built from parts (prefix + root + ending) that keep their spelling from word to word: re-, pre-, -tion, -ment. Latin roots are usually joined with an i (frug-i-vore). When unsure, go with the spelling you know from everyday words."
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
        { sound: /ā(\s|$)/, ifSound: "If the t at the end is silent, that's French (ballet, buffet, gourmet)." }],
      // From here on: the 2026 Words of the Champions language guide (pp. 68-69)
      [/^(e)/, "A long “a” at the start of a French word is spelled é (étude, éclaircissement).", { sound: /(^|\s)ā/, alts: ["a", "ai", "ay"] }],
      [/[aeiou](ss)[aeiou]/, "In French words a double ss between vowels says “s” (impasse, lassitude, coulisse); a single s there would say “z”.",
        { sound: /s/, alts: ["s", "c", "sc"] }],
      [/[aeiou](s)[aeiou]/, "In French words a single s between vowels says “z” (chemise, exposé, résumé).", { sound: /z/, alts: ["z", "ss", "zz"] }],
      [/(ment)$/, "-ment makes a noun from a verb, the French way (engagement, embezzlement, annulment).",
        // words where ment belongs to the root, not the ending
        { unless: /^(aug|fer|ce|la|com|tor|seg|fo|de|fra|pig|ce|ele|frag|sedi|fila|lini)ment$/, alts: ["mant", "mint"] }],
      [/(ade)$/, "-ade at the end says “ahd”, the French way (façade, boutade, croustade).", { sound: /äd/, alts: ["od", "ahd", "add"] }],
      [/(aille)$/, "-aille says “eye”, the French way (trouvaille, canaille).", { sound: /ī/, alts: ["ai", "aye", "ie"] }],
      [/[aeiou](ill)/, "Here ill says “y” or is nearly silent, the French way (bouillon, andouille, mille-feuille).", { sound: /y/, alts: ["y", "il", "lli"] }],
      [/(gn)/, "gn says “ny”, the French way (vignette, vigneron).", { sound: /ny/, alts: ["ni", "ny", "n"] }],
      [/(au)/, "Here au says “oh”, the French way (mauve, au jus, au courant).", { sound: /ō/, alts: ["o", "eau", "oh"] }]
    ],
    general: "French spellings often have letters you don't hear: silent endings, -que for “k” and eau for “oh”. French is more regular than it looks: each vowel group stands for one sound."
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
    patterns: [
      [/(sk)/, "sk is often a Norse clue (sky, skin, skull, bask)."],
      // The 2026 Words of the Champions language guide (p. 73)
      [/[^aeiou](a)[^aeiou]/, "In Scandinavian words the “ah” sound is usually spelled a (slalom).", { sound: /ä/, alts: ["o", "ah", "aa"] }]
    ],
    general: "Old Norse and the Scandinavian languages gave English short words that are spelled much like German ones; the schwa can be any vowel (fulmar, anorak, lefse, litmus)."
  },
  Italian: {
    patterns: [
      [/(zz)/, "Italian loves a double z (pizza, mezzo, paparazzi)."],
      [/(gh)[ei]/, "gh before e or i keeps the g hard (spaghetti, ghetto)."],
      [/(c)[ei]/, "Here c says “ch”, the Italian way (cello, concerto).",
        { sound: /ch/, ifSound: "If c sounds like “ch”, that's Italian (cello, concerto)." }],
      [/(([bcdfglmnprstv])\2)/, "Italian words often double their consonants (spaghetti, umbrella, staccato)."],
      [/([aio])$/, "Italian words usually end in a vowel (piano, opera, confetti)."],
      // From here on: the 2026 Words of the Champions language guide (p. 70)
      [/(c{1,2})i[aeou]/, "Before i and another vowel, c or cc says “ch” and the i is silent (focaccia, cioppino, perciatelli).",
        { sound: /ch/, alts: ["ch", "cch", "tch"] }],
      [/(ch)/, "In Italian words ch says “k” (macchiato, scherzo, gnocchi, bruschetta).", { sound: /k/, alts: ["k", "c", "ck"] }],
      [/(g{1,2})i[aou]/, "Italian has no j: g (or gg) before i and another vowel says “j” (loggia, agio, giallolino).", { sound: /j/, alts: ["j", "dj", "dg"] }],
      [/(gn)/, "gn says “ny” (or just “n”), the Italian way (gnocchi, Bolognese); ask for every pronunciation.", { alts: ["n", "ny", "ni"] }],
      [/(gl)i[aeou]/, "Before i and another vowel, gl says “ly”: the g is silent (scagliola, bisbigliando, consigliere).", { alts: ["l", "ll", "ly"] }],
      [/[^aeiou](io)/, "Italian has no y: the “yo” sound is spelled io (arpeggio, grazioso, scagliola).", { sound: /y|ē-ō/, alts: ["yo", "eo", "o"] }]
    ],
    general: "Italian words are spelled much as they sound, often with double consonants and a vowel at the end. There is no j, k, w or y in Italian spelling."
  },
  Spanish: {
    patterns: [
      [/(qu)/, "In Spanish words qu says “k” (mosquito, quesadilla)."],
      [/(ll)/, "Here ll says “y”, the Spanish way (tortilla, quesadilla).",
        { sound: /y/, ifSound: "If ll sounds like “y”, that's Spanish (tortilla, quesadilla)." }],
      [/(rr)/, "rr is the rolled Spanish r (burrito, guerrilla)."],
      [/(j)/, "Here j says “h”, the Spanish way (jalapeño, fajita).",
        { sound: /h/, ifSound: "In Spanish words j usually says “h” (jalapeño, fajita)." }],
      [/([ao])$/, "Spanish words usually end in a vowel, often -o or -a (bonanza, burrito, patio)."],
      // From here on: the 2026 Words of the Champions language guide (p. 71)
      [/(i)$/, "An “ee” at the end of a stressed last syllable is spelled i in Spanish words (coquí).", { sound: /ˈ[^-ˌˈ\s]*ē(\s|$)/, alts: ["e", "ee", "y"] }],
      [/[^aeiou](e)$/, "An “ee” at the end of an unstressed last syllable is spelled e in Spanish words (zacate).", { sound: /-[^ˈˌ\s-]*ē(\s|$)/, alts: ["i", "ee", "y"] }],
      [/(c)[ei]/, "Before e or i, c says “s” in Spanish words (cilantro, cereza).", { sound: /s/, alts: ["s", "z", "ss"] }],
      [/(z)/, "In Spanish words z often says “s” (almuerzo, mozo); ask for every pronunciation.", { sound: /s/, notSound: /z/, alts: ["s", "c", "ss"] }],
      [/(illa)$/, "A thing or a describing word with an “EE-yuh” ending is spelled -illa (quesadilla, camarilla); a place usually ends in -ía (taquería).",
        { alts: ["iya", "ia", "ilia"] }]
    ],
    general: "Spanish words are spelled the way they sound, letter by letter. The “k” sound is c or qu (Spanish has no k), and ll often says “y”."
  },
  German: {
    patterns: [
      [/(sch)/, "sch is a German spelling (schnauzer, schnitzel)."],
      // A k from c or qu elsewhere doesn't count when ch says "ch" or "sh" (coach, quiche)
      [/(ch)/, "Here ch says “k”, as it often does in German (dachshund, Bach).", { sound: /k/, notSound: /ch|sh/ }],
      [/(ei)/, "In German words ei says a long “i” (stein, poltergeist).", { sound: /ī/ }],
      [/(ie)/, "In German words ie says “ee” (glockenspiel).", { sound: /ē/ }],
      // From here on: the 2026 Words of the Champions language guide (pp. 72-73)
      [/(w)/, "In German words w says “v” (Weimaraner, weltschmerz).", { sound: /v/, alts: ["v", "wh", "f"] }],
      [/(au)/, "In German words the “ow” sound is spelled au (sauerkraut).", { sound: /aw/, alts: ["ow", "ou", "ao"] }],
      [/^(k)/, "German spells the “k” sound with k, rarely c (konditorei, kriegspiel).", { alts: ["c", "ck", "ch"] }],
      [/[aeiou](ck)/, "Inside a German word the “k” sound is often ck (schnecken).", { sound: /k/, alts: ["k", "c", "kk"] }],
      [/[aeiou](s)[aeiou]/, "In German words a single s between vowels says “z” (hexenbesen, gesellschaft); a double ss says “s” (edelweiss).",
        { sound: /z/, alts: ["z", "ss", "zz"] }],
      [/(z)/, "In German words z says “ts” (zeitgeist, zugzwang, Alzheimer).", { sound: /ts/, alts: ["ts", "tz", "c"] }],
      [/(e)(?=[^aeiou])/, "In German words the long “a” sound is usually spelled e (hexenbesen, edelweiss, gegenschein).", { sound: /ā/, alts: ["a", "ay", "ei"] }]
    ],
    general: "German words keep German letter groups: sch, ei (long “i”), ie (“ee”), w for “v”, z for “ts”, and endings like -en and -er. They usually follow reliable patterns, so you can often spell them by sound."
  },
  Dutch: {
    patterns: [
      [/(oo|aa)/, "A double vowel is a Dutch clue (cookie, aardvark)."],
      // From here on: the 2026 Words of the Champions language guide (p. 73)
      [/(oe)/, "In Dutch and Afrikaans words oe says “oo” (baboen).", { sound: /ü/, alts: ["oo", "u", "ou"] }],
      [/(ee)/, "In Dutch and Afrikaans words ee says a long “a” (keeshond).", { sound: /ā/, alts: ["a", "ay", "ei"] }]
    ],
    general: "Dutch and Afrikaans gave English many sailing and everyday words (yacht, skipper, cookie). oe says “oo”, ee says “ay”, oo can say “oh” and a says “ah”."
  },
  Arabic: {
    patterns: [
      [/^(al)/, "al- is Arabic for “the” (algebra, alcohol, alchemy)."],
      // From here on: the 2026 Words of the Champions language guide (p. 77)
      [/(q)(?!u)/, "Arabic often spells the “k” sound q with no u after it (qiyas).", { alts: ["k", "qu", "c"] }],
      [/(([bdfklmnrstwz])\2)/, "Arabic words often double their consonants (Shawwal, fellahin)."],
      [/(ah)$/, "Some Arabic words end in -ah (bismillah), but many don't (halala, Jahiliya).", { alts: ["a", "aa"] }],
      [/[^aeiou](i)[^aeiou]/, "In Arabic words the “ee” sound is usually spelled i (hadith, qiyas).", { sound: /ē/, alts: ["ee", "e", "y"] }]
    ],
    general: "Arabic words often double their consonants and can spell “k” with q. Many reached English through Spanish or Italian, so check whether the word passed through one of those."
  },
  Hebrew: {
    patterns: [
      [/(([bcdfgklmnprstvz])\2)/, "Hebrew words often double their consonants (kapparah, tikkun)."],
      [/(ah)$/, "Many Hebrew words end in -ah (gelilah, genizah).", { alts: ["a", "eh"] }]
    ],
    general: "Hebrew words mostly come from religious life; they often double consonants and end in -ah. Ask for every pronunciation: another one can point to a different but correct spelling."
  },
  Persian: {
    general: "Persian (Farsi) is related to Hindi and Urdu, and many Persian words came through Arabic, Hindi or Sanskrit, so try those languages' patterns."
  },
  Turkish: {
    patterns: [
      [/[^aeiou](i)[^aeiou]/, "In Turkish words the “ee” sound is spelled i.", { sound: /ē/, alts: ["ee", "e", "y"] }],
      [/(ai)/, "In Turkish words the “eye” sound is spelled ai.", { sound: /ī/, alts: ["i", "y", "igh"] }]
    ],
    general: "Turkish isn't related to the big languages that gave English most words. Spell the “ee” sound i and “eye” ai; otherwise keep it simple."
  },
  Japanese: {
    patterns: [
      // The 2026 Words of the Champions language guide (p. 74)
      [/(ei)/, "In Japanese words ei says a long “a” (sensei, Heian).", { sound: /ā/, alts: ["ay", "a", "ai"] }],
      [/[^aeiou](e)$/, "A long “a” at the end of a Japanese word is spelled e (anime, edamame, yosenabe).", { sound: /ā(\s|$)/, alts: ["ay", "ai", "ei"] }],
      [/[^aeiou](i)$/, "In Japanese words the long “e” sound is spelled i (torii, enoki, funori).", { sound: /ē(\s|$)/, alts: ["ee", "e", "y"] }],
      [/(ai)/, "In Japanese words ai says “eye” (zaibatsu, haikai).", { sound: /ī/, alts: ["i", "y", "ie"] }],
      [/[^aeiou](u)[^aeiou]/, "In Japanese words the long “oo” sound is spelled u (tempura, urushiol).", { sound: /ü/, alts: ["oo", "ou", "ew"] }],
      [/(k)/, "Japanese words spell the “k” sound with k, almost never c (kanji, katana, kanban).", { alts: ["c", "ck", "q"] }]
    ],
    general: "Japanese words are spelled the way they sound, one syllable at a time, with clear vowels a, i, u, e, o (karate, tsunami, ramen). The “k” sound is k, ei says “ay” and ai says “eye”."
  },
  Chinese: {
    general: "Chinese and Korean words came into English in many different spellings (pongee, fang shih, tai chi), so there are few safe patterns. Keep it simple and trust your ear."
  },
  Hawaiian: {
    patterns: [
      // The 2026 Words of the Champions language guide (p. 75)
      [/([aeiou]{2})/, "Each vowel is said on its own in Hawaiian and other Pacific words, so spell every vowel you hear (oopuhue, pahoehoe)."],
      [/[^aeiou](e)$/, "A final e says “ay” in Hawaiian and Maori words (wahine).", { sound: /ā(\s|$)/, alts: ["ay", "ai", "a"] }]
    ],
    general: "Hawaiian uses just 12 letters (a, e, i, o, u, h, k, l, m, n, p, w) and every syllable ends in a vowel, so spell each sound: lu-au, la-na-i. The “ee” sound can be e (ape-ape) or i (lokelani)."
  },
  Malay: {
    general: "Malay and Tagalog words are mostly spelled as they sound; Tagalog words can show Spanish spellings and Malay ones Dutch spellings, from their colonial histories."
  },
  Sanskrit: {
    patterns: [
      // The 2026 Words of the Champions language guide (p. 76)
      [/([bdtgkp]h)/, "Sanskrit marks a puff of air with an h after the consonant: bh, dh, th, kh (bhikshuni, kathakali, svarabhakti, ardhamagadhi).",
        { unless: /sh/ }],
      [/[^aeiou](i)(?![aeiou])/, "In Sanskrit words the long “ee” sound is usually spelled i (Devanagari).", { sound: /ē/, alts: ["ee", "e", "y"] }],
      [/(ah)$/, "Some Hindi and Urdu words end in ah for the “ah” sound.", { alts: ["a", "aa"] }]
    ],
    general: "Words from Sanskrit and Hindi often keep a for the “ah” sound (nirvana, mantra, avatar) and i for “ee”; an h after a consonant marks a puff of air (bh, dh, kh)."
  },
  Dravidian: {
    general: "Words from South Indian languages (Tamil, Telugu, Kannada, Malayalam) mostly reached English in very English-looking forms (bandicoot, from Telugu pandikokku), so spell them the way an English speaker would have heard them."
  },
  Slavic: {
    patterns: [
      // The 2026 Words of the Champions language guide (p. 78)
      [/(k)/, "Slavic words (Russian, Polish, Czech) spell the “k” sound with k (chastushka, promyshlennik).", { alts: ["c", "ck", "q"] }],
      [/(a)$/, "The schwa at the end of a Slavic word is often spelled a (purga).", { sound: /ə(\s|$)/, alts: ["e", "uh", "o"] }]
    ],
    general: "Words from Russian, Polish and Czech usually name things from Eastern European life; they spell “k” with k and often a schwa with a."
  },
  African: {
    general: "Only a small number of English words come from African languages, and they share few patterns; Swahili words often show Arabic influence. Study these words one by one."
  },
  "Native American": {
    patterns: [
      // The 2026 Words of the Champions language guide (p. 78)
      [/[^aeiou](e)$/, "Nahuatl words often end in an “ee” sound spelled e (ahuehuete, cacaxte).", { sound: /ē(\s|$)/, alts: ["i", "ee", "y"] }],
      [/[aeiou](ck)$/, "Words from North American languages came through American English, so endings look English (wejack).", { alts: ["k", "c", "ch"] }]
    ],
    general: "Words from North American languages (Algonquian, Ojibwe, Cree) came through American English and look English (wejack, moccasin); words from Central and South American languages (Nahuatl, Quechua, Tupi) came through Spanish or Portuguese (condor, maize, cacao)."
  },
  Eponym: {
    general: "This word comes from the name of a person or place, so it keeps that name's spelling and the patterns of its language (Arthurian, Llullaillaco, cardigan). For names from the United States, memorize them."
  },
  Trademark: {
    general: "This word began as a trademark, so it was made up by a company and follows no language's patterns. Learn it by sight."
  },
  Imitative: {
    general: "This word imitates a sound, so spell it the way it sounds in English (buzz, kazoo, zowie)."
  }
};

// Where each language's rules from the 2026 Words of the Champions language
// guide start in its patterns list (the ones before were here already). The
// Patterns page marks those as "Scripps guide". Add new rules at the end.
const GUIDE_RULES_FROM = {
  Greek: 9, Latin: 8, French: 10, "Old Norse": 1, Italian: 5, Spanish: 5, German: 4, Dutch: 1, Arabic: 1,
  Hebrew: 0, Turkish: 0, Japanese: 0, Hawaiian: 0, Sanskrit: 0, Slavic: 0, "Native American": 0
};

// The Patterns page's names for the tip groups
const ORIGIN_TIP_NAMES = {
  "Old Norse": "Old Norse and Scandinavian", Dutch: "Dutch and Afrikaans", Chinese: "Chinese and Korean",
  Hawaiian: "Hawaiian and Pacific", Malay: "Malay and Tagalog", Sanskrit: "Sanskrit and Hindi",
  Dravidian: "South Indian (Tamil, Telugu, Kannada)", Slavic: "Slavic (Russian, Polish, Czech)",
  African: "Languages of Africa", "Native American": "Languages of the Americas", Eponym: "Words from people or places",
  Trademark: "Trademarks", Imitative: "Imitative words"
};

// Languages that share another's tips
const ORIGIN_TIP_ALIASES = {
  Norwegian: "Old Norse", Swedish: "Old Norse", Danish: "Old Norse", Afrikaans: "Dutch", Yiddish: "German",
  Hindi: "Sanskrit", Bengali: "Sanskrit", Urdu: "Sanskrit", Pali: "Sanskrit", Punjabi: "Sanskrit", Marathi: "Sanskrit",
  Kashmiri: "Sanskrit", "Indo-Aryan": "Sanskrit",
  Tamil: "Dravidian", Telugu: "Dravidian", Kannada: "Dravidian", Malayalam: "Dravidian",
  Korean: "Chinese", Vietnamese: "Chinese",
  Maori: "Hawaiian", Samoan: "Hawaiian", Marquesan: "Hawaiian", Polynesian: "Hawaiian",
  Tagalog: "Malay", Javanese: "Malay", Malagasy: "Malay",
  Russian: "Slavic", Polish: "Slavic", Czech: "Slavic", Ukrainian: "Slavic",
  Swahili: "African", Yoruba: "African", Igbo: "African", Bantu: "African", Kongo: "African", Amharic: "African",
  Setswana: "African", Afar: "African", Krio: "African", Berber: "African",
  Quechua: "Native American", Aymara: "Native American", Taino: "Native American", Guarani: "Native American",
  Arawak: "Native American", Carib: "Native American", Nahuatl: "Native American", Tupi: "Native American",
  Algonquian: "Native American", Ojibwe: "Native American", Cree: "Native American", Mohawk: "Native American",
  "Mi'kmaq": "Native American", Lakota: "Native American", Hopi: "Native American", Choctaw: "Native American",
  Creek: "Native American", Muskogean: "Native American", Iroquoian: "Native American", Athabaskan: "Native American",
  Salishan: "Native American", Montagnais: "Native American", Tsimshian: "Native American", "O'odham": "Native American",
  Tongva: "Native American", Timbira: "Native American", Mayan: "Native American"
};

// Each pattern's regex again with the d flag, for where its letters are
const tipRegexWithIndices = new WeakMap();
function withIndices(re) {
  let copy = tipRegexWithIndices.get(re);
  if (!copy) {
    copy = new RegExp(re.source, re.flags.replace("d", "") + "d");
    tipRegexWithIndices.set(re, copy);
  }
  return copy;
}

/* Tips for this word: { id, lang, letters, text, start, end }. Pattern tips
   for every language in its origin (letters = the matching letters in the
   word, at start..end, the word's letter positions), else the root
   language's general tip (no letters, no start). id names the rule
   ("Greek#0", "Latin#general") so drills and Stats can group words by it.
   At most `limit`. */
function spellingTips(item, limit = 3) {
  const word = letterKey(item?.word);
  if (!word) return [];
  const langs = (item.origin || "").split(",").map(s => s.trim()).filter(Boolean);
  // MW's written pronunciations, with "ow" (au̇) taken out so u̇ only means "oo"
  const sounds = (item.pronunciations || []).map(p => p.written || "").join(" / ").replace(/au̇/g, "aw");
  const tips = [];
  const seen = new Set();
  langs.forEach(lang => {
    const key = ORIGIN_TIP_ALIASES[lang] || lang;
    (ORIGIN_TIPS[key]?.patterns || []).forEach(([re, text, opts = {}], index) => {
      const match = word.match(withIndices(re));
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
      // letterKey keeps one character per letter, so these are the word's positions too
      const [start, end] = match.indices[1] || match.indices[0];
      // alts: sound-alike wrong answers for this rule's drill (patterns.js)
      tips.push({ id: `${key}#${index}`, lang, letters: match[1] || match[0], text: shown, start, end, alts: opts.alts });
    });
  });
  // Otherwise the root language's general tip (the first one listed). A
  // language the word only passed through says little about its spelling.
  const root = langs[0];
  const rootKey = ORIGIN_TIP_ALIASES[root] || root;
  const general = ORIGIN_TIPS[rootKey]?.general;
  if (!tips.length && general) tips.push({ id: `${rootKey}#general`, lang: root, letters: "", text: general });
  return tips.slice(0, limit);
}

/* Letter positions in `word` that a misspelling got wrong (from spellingDiff
   steps): wrong, missing or swapped letters, and the letter an extra one was
   typed next to. */
function mistakePositions(steps) {
  const at = new Set();
  let i = 0;
  steps.forEach(step => {
    const len = [...step.want].length;
    if (step.type === "extra") {
      at.add(Math.max(0, i - 1));
      at.add(i);
    } else if (step.type !== "same") {
      for (let k = 0; k < len; k++) at.add(i + k);
    }
    i += len;
  });
  return at;
}

/* Tips for a misspelled word, the ones whose letters the mistake touched
   first (marked hit: true, "this rule would have helped"). */
function tipsForMistake(item, steps, limit = 2) {
  const tips = spellingTips(item, 99);
  if (!steps) return tips.slice(0, limit);
  const wrong = mistakePositions(steps);
  tips.forEach(tip => {
    if (tip.start === undefined) return;
    for (let k = tip.start; k < tip.end; k++) if (wrong.has(k)) tip.hit = true;
  });
  return [...tips.filter(t => t.hit), ...tips.filter(t => !t.hit)].slice(0, limit);
}

// <li>s for a tips list: "Greek  ph  Greek words spell the “f” sound ph…"
function renderSpellingTips(list, tips) {
  list.replaceChildren(...tips.map(tip => {
    const li = document.createElement("li");
    li.dataset.tip = tip.id || "";
    if (tip.hit) {
      li.classList.add("tip-hit");
      const hit = document.createElement("span");
      hit.className = "tip-hit-label";
      hit.textContent = "This is where it slipped";
      li.append(hit);
    }
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
