# Regional word list review

The regional list has 4,000 unique entries. The audit corrected 92 origin labels and flagged 69 entries for definition or usage issues. The flags include eight placeholder definitions and 25 definitions with unfinished endings.

The audit checked all 4,000 records for completeness and compared the available headwords, senses, and etymologies with the project's Merriam-Webster Collegiate cache. The cache contains entries for 3,164 words, definitions for 3,162, and at least one etymology for 2,584. For entries with thinner coverage, the audit used the previous regional list for comparison and consulted dictionary or subject-matter sources for the findings below. Exact competition senses and origins still require confirmation in cases without adequate source coverage. Scripps uses Merriam-Webster Unabridged as its official dictionary. [Regional JSON](word_list_regional.json) · [Scripps study resources](https://spellingbee.com/study-resources)

## Origin findings

The range of changes runs from missing donor languages, such as Afar in *Ardipithecus* and Yiddish in the chocolate-bread sense of *babka*, to an incorrect root, such as Guarani in *petunia*. The updated labels also identify terms formed from names, such as *Bernoulli effect* and *Zamboni*. The origin overrides record the same labels for future generation. [Origin overrides](origin_overrides.json) · [Smithsonian on Ardipithecus](https://humanorigins.si.edu/evidence/human-fossils/species/ardipithecus-ramidus) · [Merriam-Webster on babka](https://www.merriam-webster.com/dictionary/babka) · [Merriam-Webster on petunia](https://www.merriam-webster.com/dictionary/petunia)

| Entry | How to interpret the origin label |
| --- | --- |
| `azure` | The label records Persian, Arabic, and French. Merriam-Webster identifies Old Spanish as a probable intermediary before French. [Merriam-Webster](https://www.merriam-webster.com/dictionary/azure) |
| `calypso` | The musical sense comes from Trinidad English. A deeper African origin is possible. The mythological name has a separate Greek and Latin history. [Merriam-Webster](https://www.merriam-webster.com/dictionary/calypso) |
| `Deseret` | The recorded source of the proposed state name is the Book of Mormon, where the term is glossed as *honeybee*. The label is `Unknown` because the earlier linguistic derivation is uncertain. [Library of Congress](https://blogs.loc.gov/maps/2016/04/the-state-formerly-known-as-deseret/) |
| `martinoe`, `mediobrome` | The references below establish the meanings. The origin labels are `Unknown` pending confirmation of the word histories. |
| `wahine` | Māori and Hawaiian are parallel sources. [Merriam-Webster](https://www.merriam-webster.com/dictionary/wahine) |
| `azulejo` | The dictionary gives Portuguese or Spanish as alternative routes into English. The app's comma-delimited label lists both. Deeper Arabic derivation is debated. [Merriam-Webster](https://www.merriam-webster.com/dictionary/azulejo) · [Corominas etymological dictionary](https://bibliamedieval.es/bibliateca.es/corominas/DATA/HTML/azulejo.html) |

## Missing definitions

These eight entries display a lookup instruction in place of a definition. Their example sentences also repeat that instruction.

| Entry | Suggested definition | Source |
| --- | --- | --- |
| `amertoy` | Another name for the American toy fox terrier, a small dog breed. | [Contemporary account of the breed and name](https://www.newyorker.com/magazine/1954/08/21/doggy) |
| `as nas` | A traditional Persian card game with betting and ranked hands. | [Research on Persian playing cards](https://www.tandfonline.com/doi/full/10.1080/19369816.2024.2445320) · [Webster dictionary entry for the variant as](https://slovar-vocab.com/english/websters-international-vocab/as-8671551.html) |
| `martinoe` | The common unicorn plant, a flowering plant with long, curved seedpods. | [Royal Horticultural Society](https://www.rhs.org.uk/plants/13923/proboscidea-louisianica/details) |
| `mediobrome` | A photographic printing process that alters a black-and-white print with oil-based pigment. | [French Ministry of Culture photographic process guide](https://www.culture.gouv.fr/mc/content/download/166308/file/Annexe_2_DAF_BORA_PHOTO_AIDE_IDENTIFICATION_V15.pdf?inLanguage=fre-FR&version=2) · [Contemporary spelling bee coverage](https://dc.medill.northwestern.edu/blog/2015/05/29/national-spelling-bee-vanya-shivashankar-makes-finals-by-spelling-consomme-and-mediobrome/) |
| `nymss` | The Egyptian mongoose, also called the ichneumon. | [Webster dictionary entry reproduced under Herpestes](https://slovar-vocab.com/english/animal-names-latin-vocab/herpestes-urva-semitorquatus-6276203.html) |
| `portugais` | A Portuguese oyster. | [U.S. Fish and Wildlife Service fisheries report](https://spo.nmfs.noaa.gov/sites/default/files/pdf-content/mfr1335.pdf) |
| `trillado` | Coffee prepared for market by drying the beans in the sun. | [Scripps Words of the Champions, page 53](https://www.einsteinptsa.org/Doc/2025-2026/2026_wordsofthechampion_final.pdf) |
| `tsukupin` | A traditional sailing canoe from Yap with an outrigger. | [National Museums Scotland](https://www.nms.ac.uk/collections/search/object?entry=331727&page=1&production-place=Yap+Island%2C+Yap+State%2C+Federated+States+of+Micronesia%2C+Caroline+Islands%2C+Micronesia&view=cards) |

## Unfinished definitions

Twenty-three definitions end in “such as” without the examples or subsenses that follow in the dictionary. Two more end in a bare colon. The cached entries preserve the subsenses for many of these words.

- **Keep or paraphrase the complete opening sense** for `airborne`, `assertion`, `bonus`, `capture`, `collar`, `comparison`, `confirmation`, `confrontation`, `daisy`, `deployment`, `elasticity`, `explode`, `galley`, `literally`, `mahogany`, `patience`, `preacher`, `residue`, and `slab`.
- **Use the specific sense shown in the example** for `compelling` (so interesting or convincing that it holds attention), `composite` (of a whole number greater than one that has a divisor other than one and itself), `coverage` (news reporting or broadcast of an event), `invasive` (of a nonnative species that spreads and can cause harm), and `nifty` (clever or ingenious in the example). [Merriam-Webster on composite](https://www.merriam-webster.com/dictionary/composite) · [Merriam-Webster on coverage](https://www.merriam-webster.com/dictionary/coverage) · [U.S. Department of Agriculture on invasive species](https://www.invasivespeciesinfo.gov/what-are-invasive-species)
- **Name both months** for `Jumada`. Its definition ends just before the names *Jumada al-Awwal* and *Jumada al-Thani*. [Merriam-Webster](https://www.merriam-webster.com/dictionary/Jumada)

## Meaning and precision flags

| Entry | Issue and suggested wording |
| --- | --- |
| `adjugate` | The current wording omits the transpose. Define it as the transpose of a square matrix's cofactor matrix. [Duke University linear algebra materials](https://sites.math.duke.edu/education/ccp/materials/linalg/determinants/dete3.html) |
| `ad ignorantiam` | The definition gives only half of the argument from ignorance. It can also claim that something is false because it has yet to be proved true. |
| `anaplasma` | The definition limits the whole genus to bacteria that infect red blood cells. A definition covering the genus should say that its members infect blood cells in people or animals. [Merriam-Webster](https://www.merriam-webster.com/dictionary/anaplasma) |
| `au bleu` | The blue color is associated with treating very fresh fish with vinegar or cooking it in an acidified liquid. The wording currently attributes the color to speed. [Government of Canada terminology database](https://www.btb.termiumplus.gc.ca/tpv2alpha/alpha-eng.html?fchrcrdnm=4&i=&index=frt&lang=eng&sg_kp_wet=249475&srchtxt=bleu) |
| `Bernoulli effect` | Add the conditions for the pressure-speed relationship. In steady flow of an ideal fluid at the same elevation, higher speed corresponds to lower static pressure along a streamline. [NASA Glenn Research Center](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/bernoullis-equation/) |
| `borosilicate` | The standalone noun can name a boron-containing silicate. The example shows its use in *borosilicate glass*. Label the glass as a specific sense. [Merriam-Webster](https://www.merriam-webster.com/dictionary/borosilicate) |
| `coryphée` | The definition presents small solos as a defining duty. The Collegiate sense describes a ballet dancer who performs in a small group apart from the main corps. Rank terminology varies by company. [Merriam-Webster](https://www.merriam-webster.com/dictionary/coryph%C3%A9e) |
| `delta` | Triangular is a common shape. Define the landform by sediment deposited near a river mouth so the wording also covers other delta shapes. [U.S. Geological Survey](https://pubs.usgs.gov/ha/ha730/ch_f/F-text3.html) |
| `ellipse` | “A flattened circle” is a visual analogy. For the mathematical sense, define the curve by the constant sum of the distances to two fixed points. |
| `equinox` | “Everywhere” overstates the equality of daylight and darkness. Define the equinox as either of the two times in the year when the Sun crosses the celestial equator. [U.S. Naval Observatory](https://aa.usno.navy.mil/faq/equinoxes) |
| `fiendishly` | “In an extremely difficult way” makes the adverb sound like a manner of acting. In the example *fiendishly difficult*, it means *extremely*. An additional sense is *in a cruel or wicked way*. [Merriam-Webster](https://www.merriam-webster.com/dictionary/fiendish) |
| `generalization` | The phrase “only a few examples” describes one kind of weak generalization. The general sense is a broad conclusion or statement about a group or class of cases. [Merriam-Webster](https://www.merriam-webster.com/dictionary/generalization) |
| `guapena` | The current definition calls it a freshwater fish. The fish is a marine jackknife fish of the western Atlantic. Review the example against the corrected habitat. [Puerto Rico Department of Natural and Environmental Resources, aquatic nomenclature](https://www.drna.pr.gov/wp-content/uploads/2015/04/Vol.11-Nomenclatura-de-los-organismos-acu%C3%A1ticos-y-marinos-de-PR-e-Islas-V%C3%ADrgenes.pdf) |
| `kyphoplasty` | The wording also describes vertebroplasty. Specify that the procedure creates a space in a fractured vertebra with an inflatable device before filling the space with bone cement. [RadiologyInfo](https://www.radiologyinfo.org/en/info/vertebro) |
| `lay-ups` | Banking the ball off the backboard is common and optional. Define these as close-range basketball shots, usually made while moving toward the basket. [Merriam-Webster](https://www.merriam-webster.com/dictionary/layup) |
| `limaçon` | The heart-shaped and looped forms are particular cases. Define it as a family of curved shapes that includes the cardioid and can have an inner loop. [Merriam-Webster](https://www.merriam-webster.com/dictionary/lima%C3%A7on) |
| `meiosis` | The current wording describes egg and sperm formation as the entire process. Define meiosis by the reduction of the chromosome number by half, then use egg and sperm formation as an example. [National Human Genome Research Institute](https://www.genome.gov/genetics-glossary/Meiosis) |
| `meteor` | The definition uses “shooting star” and “piece of matter” interchangeably. For the sense shown in the example, define the meteor as the streak of light produced when a meteoroid enters the atmosphere. [NASA](https://science.nasa.gov/solar-system/meteors-meteorites/facts/) |
| `Metonic cycle` | Lunar phases recur on approximately the same calendar dates after 19 years. Add the approximation. [National Academies Press](https://www.nationalacademies.org/read/10123/chapter/18) |
| `princeps` | The publishing sense fits the entry. The Roman sense “the title of the first Roman emperor” is too narrow and suggests a formal office. If both senses are retained, describe the Roman use for a leading citizen and its association with Augustus and later emperors. [Oxford Classical Dictionary](https://academic.oup.com/edited-volume/61673/chapter-abstract/550493294) |
| `rebound` | The basketball example is about gaining possession after a missed shot. Include that condition in the definition instead of defining it as catching any ball that bounces. [NCAA basketball statistics rules](https://fs.ncaa.org/Docs/stats/Stats_Manuals/Basketball/2022EZ.pdf) |
| `tenement` | “Run-down” is commonly associated with historical tenement housing, but an apartment building need not be in disrepair to be called a tenement. [Merriam-Webster](https://www.merriam-webster.com/dictionary/tenement) |
| `welding` | The definition restricts welding to heating metal. The broader process joins parts by heat, pressure, or both and can also apply to some plastics. [Merriam-Webster](https://www.merriam-webster.com/dictionary/weld) |

## Definitions and examples that teach different senses

| Entry | Issue |
| --- | --- |
| `Bêche-de-Mer` | The sea-cucumber sense is attested, as is the Pacific pidgin sense. The capitalized headword warrants checking the intended competition sense and the capitalization in its example sentence. [Merriam-Webster](https://www.merriam-webster.com/dictionary/b%C3%AAche-de-mer) |
| `flittern` | Collins gives the bark of a young oak. The list uses it for the young tree itself, which is also historically attested. Confirm the sense expected in the study list. [Collins](https://www.collinsdictionary.com/us/dictionary/english/flittern) |
| `La Tène` | The example uses the term as an adjective for an Iron Age style. The adjective definition fits the existing example. [Merriam-Webster](https://www.merriam-webster.com/dictionary/La%20T%C3%A8ne) |
| `motherumbung` | The field gives only *Acacia cheelii*. Australian botanical references also record the name for *Acacia ixodes*. Confirm the species intended and avoid making the common name exclusive to one species. [Royal Botanic Garden Sydney](https://plantnet.rbgsyd.nsw.gov.au/cgi-bin/NSWfl.pl?lvl=sp&name=Acacia~ixodes&page=wattle) |
| `Shetland` | The entry defines a pony or wool, and the example refers to the islands. Give an example that uses the pony or wool sense, or define the geographic name. [Merriam-Webster](https://www.merriam-webster.com/dictionary/Shetland) |
| `stratosphere` | The definition describes an atmospheric layer. The tuition example uses the figurative sense of an exceptionally high level. [Merriam-Webster](https://www.merriam-webster.com/dictionary/stratosphere) |
| `summoned` | The definition says someone was ordered to come. The example uses *summoned up* to mean brought memories to mind. [Merriam-Webster](https://www.merriam-webster.com/dictionary/summon) |

## Parts of speech and word forms

| Entry | Issue |
| --- | --- |
| `ensued`, `ensconced` | The definitions use infinitives for past forms. For *ensued*, use “followed or happened afterward.” For *ensconced*, use “settled or established in a comfortable or secure place” to fit the existing sentence. |
| `exeunt` | The meaning is accurate. For a speller, “stage direction” describes how the English headword is used. Its Latin source form is a verb meaning “they go out.” [Merriam-Webster](https://www.merriam-webster.com/dictionary/exeunt) |
| `MOOC` | The expansion is correct. The entry is an abbreviation used as a noun, so a label identifying the abbreviation would clarify what learners are seeing. [Merriam-Webster](https://www.merriam-webster.com/dictionary/MOOC) |
| `Quonset`, `Zamboni` | The definitions use trademark wording, while the part-of-speech field says only “noun.” Identify the trademarks consistently with other brand entries in the list. [Merriam-Webster on Quonset](https://www.merriam-webster.com/dictionary/Quonset) · [Merriam-Webster on Zamboni](https://www.merriam-webster.com/dictionary/Zamboni) |
