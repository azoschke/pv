// ===== DATA =====
const JOBS = ["Paladin","Warrior","Dragoon","Monk","Ninja","Bard","Black Mage","Summoner","White Mage","Scholar"];

const BOOKS = [
  {
    name: "Book of Skyfire I",
    id: "skyfire1",
    enemies: [
      { name: "Daring Harrier x3", zone: "Mor Dhona", location: "Fogfens (x16.9, y16.4)" },
      { name: "5th Cohort Vanguard x3", zone: "Mor Dhona", location: "Castrum Centri (x10.6, y15.1)" },
      { name: "4th Cohort Hoplomachus x3", zone: "Western Thanalan", location: "Imperial Outpost (x10.5, y6)" },
      { name: "Basilisk x3", zone: "Northern Thanalan", location: "Bluefog (x22.8, y22.9)" },
      { name: "Zanr'ak Pugilist x3", zone: "Southern Thanalan", location: "Zanr'ak (x19, y25)" },
      { name: "Milkroot Cluster x3", zone: "East Shroud", location: "Sylphlands (x24.2, y16.8)" },
      { name: "Giant Logger x3", zone: "Coerthas Central Highlands", location: "Boulder Downs (x13, y25)" },
      { name: "Synthetic Doblyn x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x23, y8)" },
      { name: "Shoalspine Sahagin x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x17, y15)" },
      { name: "2nd Cohort Hoplomachus x3", zone: "Eastern La Noscea", location: "Agelyss Wise (x25, y21)" }
    ],
    dungeons: [
      { boss: "Galvanth the Dominator", location: "The Tam-Tara Deepcroft" },
      { boss: "Isgebind", location: "The Stone Vigil" },
      { boss: "Diabolos", location: "The Lost City of Amdapor" }
    ],
    fates: [
      { name: "Giant Seps", type: "Kill Boss", location: "Coerthas Central Highlands (x8.6, y12)", notes: "" },
      { name: "Make It Rain", type: "Kill Boss", location: "Outer La Noscea (x25, y18)", notes: "" },
      { name: "The Enmity of My Enemy", type: "Defend", location: "East Shroud (x27, y21.6)", notes: "Chain FATE requiring The Enemy of My Enemy to be completed first. Chain is started by talking to Mianne Thousandmalm at Larkscall, East Shroud (x28.2, y20.3)." }
    ],
    leves: [
      { name: "Necrologos: Pale Oblation", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "An Imp Mobile", type: "Maelstrom Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x11.9, y16.8)" },
      { name: "The Awry Salvages", type: "Twin Adder Grand Company", npc: "Eidhart", location: "Mor Dhona - Saint Coinach's Find (x30, y12)" }
    ]
  },
  {
    name: "Book of Skyfire II",
    id: "skyfire2",
    enemies: [
      { name: "Raging Harrier x3", zone: "Mor Dhona", location: "Fogfens (x17, y17)" },
      { name: "Biast x3", zone: "Coerthas Central Highlands", location: "Boulder Downs (x16, y30)" },
      { name: "Natalan Boldwing x3", zone: "Coerthas Central Highlands", location: "Natalan (x33, y18)" },
      { name: "Shoaltooth Sahagin x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x17, y17)" },
      { name: "Shelfscale Reaver x3", zone: "Western La Noscea", location: "Halfstone (x13, y17)" },
      { name: "U'Ghamaro Golem x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x27.5, y7.3)" },
      { name: "Dullahan x3", zone: "North Shroud", location: "Proud Creek (x22.5, y20)" },
      { name: "Sylpheed Sigh x3", zone: "East Shroud", location: "Sylphlands (x29, y17)" },
      { name: "Zahar'ak Archer x3", zone: "Southern Thanalan", location: "Zahar'ak (x25, y21)" },
      { name: "Tempered Gladiator x3", zone: "Southern Thanalan", location: "Zanr'ak (x21.5, y19.6)" }
    ],
    dungeons: [
      { boss: "Aiatar", location: "Brayflox's Longstop" },
      { boss: "Tonberry King", location: "The Wanderer's Palace" },
      { boss: "Ouranos", location: "Copperbell Mines (Hard)" }
    ],
    fates: [
      { name: "Heroes of the 2nd", type: "Kill Enemies", location: "Southern Thanalan (x21, y16)", notes: "" },
      { name: "Breaching South Tidegate", type: "Kill Boss", location: "Western La Noscea (x18, y22)", notes: "Requires Gauging South Tidegate to be successfully completed first." },
      { name: "Air Supply", type: "Kill Enemies", location: "North Shroud (x19, y20)", notes: "Only Airstones and Ixali Swiftbeaks count towards FATE completion." }
    ],
    leves: [
      { name: "Don't Forget to Cry", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "Yellow Is the New Black", type: "Twin Adder Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x12, y16.8)" },
      { name: "The Museum Is Closed", type: "Immortal Flames Grand Company", npc: "Eidhart", location: "Mor Dhona - Saint Coinach's Find (x30, y12)" }
    ]
  },
  {
    name: "Book of Netherfire I",
    id: "netherfire1",
    enemies: [
      { name: "Hexing Harrier x3", zone: "Mor Dhona", location: "Fogfens (x16, y15)" },
      { name: "Gigas Bonze x3", zone: "Mor Dhona", location: "North Silvertear (x27, y9)" },
      { name: "Giant Lugger x3", zone: "Coerthas Central Highlands", location: "Boulder Downs (x13, y27)" },
      { name: "Wild Hog x3", zone: "South Shroud", location: "Urth's Gift (x29, y24)" },
      { name: "Sylpheed Screech x3", zone: "East Shroud", location: "Sylphlands (x28, y15)" },
      { name: "U'Ghamaro Roundsman x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x23, y7)" },
      { name: "Shelfclaw Reaver x3", zone: "Western La Noscea", location: "Halfstone (x13, y17)" },
      { name: "2nd Cohort Laquearius x3", zone: "Eastern La Noscea", location: "Agelyss Wise (x29, y20)" },
      { name: "Zahar'ak Fortune-teller x3", zone: "Southern Thanalan", location: "Zahar'ak (x29, y19)" },
      { name: "Tempered Orator x3", zone: "Southern Thanalan", location: "Zanr'ak (x21, y20)" }
    ],
    dungeons: [
      { boss: "Adjudicator", location: "The Sunken Temple of Qarn" },
      { boss: "Halicarnassus", location: "Haukke Manor (Hard)" },
      { boss: "Mumuepo the Beholden", location: "Halatali (Hard)" }
    ],
    fates: [
      { name: "Another Notch on the Torch", type: "Kill Boss", location: "Mor Dhona (x31, y5)", notes: "" },
      { name: "Everything's Better", type: "Kill Enemies", location: "East Shroud (x23, y14)", notes: "" },
      { name: "Return to Cinder", type: "Kill Boss", location: "Southern Thanalan (x24, y26)", notes: "" }
    ],
    leves: [
      { name: "Circling the Ceruleum", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "If You Put It That Way", type: "Immortal Flames Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x11, y16)" },
      { name: "One Big Problem Solved", type: "Maelstrom Grand Company", npc: "Eidhart", location: "Mor Dhona - Saint Coinach's Find (x30, y12)" }
    ]
  },
  {
    name: "Book of Skyfall I",
    id: "skyfall1",
    enemies: [
      { name: "Mudpuppy x3", zone: "Mor Dhona", location: "Fogfens (x14, y11)" },
      { name: "Lake Cobra x3", zone: "Mor Dhona", location: "North Silvertear (x26, y12)" },
      { name: "Giant Reader x3", zone: "Coerthas Central Highlands", location: "Boulder Downs (x12, y25)" },
      { name: "Shelfscale Sahagin x3", zone: "Western La Noscea", location: "Halfstone (x17, y19)" },
      { name: "Sea Wasp x3", zone: "Western La Noscea", location: "Halfstone (x14, y17)" },
      { name: "U'Ghamaro Quarryman x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x23, y7)" },
      { name: "2nd Cohort Eques x3", zone: "Eastern La Noscea", location: "Agelyss Wise (x29, y21)" },
      { name: "Magitek Vanguard x3", zone: "Northern Thanalan", location: "Raubahn's Push (x17, y17)" },
      { name: "Amalj'aa Lancer x3", zone: "Southern Thanalan", location: "Zanr'ak (x20, y20)" },
      { name: "Sylphlands Sentinel x3", zone: "East Shroud", location: "Sylphlands (x20, y10)" }
    ],
    dungeons: [
      { boss: "Gyges the Great", location: "Copperbell Mines" },
      { boss: "Batraal", location: "Dzemael Darkhold" },
      { boss: "Gobmachine G-VI", location: "Brayflox's Longstop (Hard)" }
    ],
    fates: [
      { name: "Bellyful", type: "Kill Boss", location: "Coerthas Central Highlands (x34, y14)", notes: "" },
      { name: "The King's Justice", type: "Kill Boss", location: "Western La Noscea (x14, y34)", notes: "" },
      { name: "Quartz Coupling", type: "Kill Enemies", location: "Eastern Thanalan (x26, y24)", notes: "" }
    ],
    leves: [
      { name: "Circling the Ceruleum", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "Necrologos: Whispers of the Gem", type: "General", npc: "Voilinaut", location: "Coerthas Central Highlands - Whitebrim Front (x12, y16)" },
      { name: "Go Home to Mama", type: "Maelstrom Grand Company", npc: "Eidhart", location: "Mor Dhona - Saint Coinach's Find (x30, y12)" }
    ]
  },
  {
    name: "Book of Skyfall II",
    id: "skyfall2",
    enemies: [
      { name: "Gigas Bhikkhu x3", zone: "Mor Dhona", location: "North Silvertear (x33, y14)" },
      { name: "5th Cohort Hoplomachus x3", zone: "Mor Dhona", location: "Fogfens (x12, y12)" },
      { name: "Natalan Watchwolf x3", zone: "Coerthas Central Highlands", location: "Natalan (x31, y17)" },
      { name: "Sylph Bonnet x3", zone: "East Shroud", location: "Sylphlands (x26, y13)" },
      { name: "Ked x3", zone: "South Shroud", location: "Urth's Gift (x31.6, y24.3)" },
      { name: "4th Cohort Laquearius x3", zone: "Western Thanalan", location: "Cape Westwind (x10, y6)" },
      { name: "Iron Tortoise x3", zone: "Southern Thanalan", location: "Zanr'ak (x16, y24)" },
      { name: "Shelfeye Reaver x3", zone: "Western La Noscea", location: "Halfstone (x13, y17)" },
      { name: "Sapsa Shelfscale x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x14, y14)" },
      { name: "U'Ghamaro Bedesman x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x23, y8)" }
    ],
    dungeons: [
      { boss: "Graffias", location: "The Thousand Maws of Toto-Rak" },
      { boss: "Anantaboga", location: "Amdapor Keep" },
      { boss: "Halicarnassus", location: "Haukke Manor (Hard)" }
    ],
    fates: [
      { name: "Black and Nburu", type: "Kill Boss", location: "Mor Dhona (x16, y14)", notes: "" },
      { name: "Breaching North Tidegate", type: "Kill Boss", location: "Western La Noscea (x21, y19)", notes: "Requires Gauging North Tidegate to be successfully completed first." },
      { name: "Breaking Dawn", type: "Kill Boss", location: "East Shroud (x32, y14)", notes: "" }
    ],
    leves: [
      { name: "Someone's in the Doghouse", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "Get Off Our Lake", type: "Twin Adder Grand Company", npc: "Eidhart", location: "Mor Dhona - Saint Coinach's Find (x30, y12)" },
      { name: "The Area's a Bit Sketchy", type: "General", npc: "Voilinaut", location: "Coerthas Central Highlands - Whitebrim Front (x12.6, y16.7)" }
    ]
  },
  {
    name: "Book of Netherfall I",
    id: "netherfall1",
    enemies: [
      { name: "Amalj'aa Brigand x3", zone: "Southern Thanalan", location: "Zanr'ak (x20, y21)" },
      { name: "4th Cohort Secutor x3", zone: "Western Thanalan", location: "Cape Westwind (x9, y6)" },
      { name: "5th Cohort Laquearius x3", zone: "Mor Dhona", location: "Fogfens (x12, y12)" },
      { name: "Gigas Sozu x3", zone: "Mor Dhona", location: "North Silvertear (x29, y14)" },
      { name: "Snow Wolf x3", zone: "Coerthas Central Highlands", location: "Boulder Downs (x16, y31.6)" },
      { name: "Sapsa Shelfclaw x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x14, y15)" },
      { name: "U'Ghamaro Priest x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x22, y6)" },
      { name: "Violet Screech x3", zone: "East Shroud", location: "Sylphlands (x24, y14)" },
      { name: "Ixali Windtalon x3", zone: "North Shroud", location: "Proud Creek (x19, y19)" },
      { name: "Lesser Kalong x3", zone: "South Shroud", location: "Urth's Gift (x29, y23)" }
    ],
    dungeons: [
      { boss: "Chimera", location: "Cutter's Cry" },
      { boss: "Siren", location: "Pharos Sirius" },
      { boss: "Diabolos", location: "The Lost City of Amdapor" }
    ],
    fates: [
      { name: "Rude Awakening", type: "Kill Boss", location: "North Shroud (x22, y20)", notes: "" },
      { name: "The Ceruleum Road", type: "Escort", location: "Northern Thanalan (x21, y29)", notes: "Speak with the Wary Merchant at Camp Bluefog to start." },
      { name: "The Four Winds", type: "Kill Boss", location: "Coerthas Central Highlands (x34, y20)", notes: "" }
    ],
    leves: [
      { name: "Got a Gut Feeling about This", type: "General", npc: "Voilinaut", location: "Coerthas Central Highlands (x12, y16)" },
      { name: "Subduing the Subprime", type: "General", npc: "Rurubana", location: "Northern Thanalan (x22, y29)" },
      { name: "Who Writes History", type: "Immortal Flames Grand Company", npc: "Eidhart", location: "Mor Dhona (x30, y12)" }
    ]
  },
  {
    name: "Book of Skywind I",
    id: "skywind1",
    enemies: [
      { name: "Hippogryph x3", zone: "Mor Dhona", location: "North Silvertear (x33, y11)" },
      { name: "5th Cohort Eques x3", zone: "Mor Dhona", location: "Fogfens (x12, y12)" },
      { name: "Natalan Windtalon x3", zone: "Coerthas Central Highlands", location: "Natalan (x34, y22)" },
      { name: "Sapsa Elbst x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x17, y15)" },
      { name: "Trenchtooth Sahagin x3", zone: "Western La Noscea", location: "Halfstone (x20, y20)" },
      { name: "Elite Roundsman x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x25, y8)" },
      { name: "2nd Cohort Secutor x3", zone: "Eastern La Noscea", location: "Agelyss Wise (x25, y21)" },
      { name: "Ahriman x3", zone: "Northern Thanalan", location: "Bluefog (x24, y21)" },
      { name: "Amalj'aa Thaumaturge x3", zone: "Southern Thanalan", location: "Zanr'ak (x18, y19)" },
      { name: "Sylpheed Snarl x3", zone: "East Shroud", location: "Sylphlands (x28, y17)" }
    ],
    dungeons: [
      { boss: "Denn the Orcatoothed", location: "Sastasha" },
      { boss: "Miser's Mistress", location: "The Aurum Vale" },
      { boss: "Mumuepo the Beholden", location: "Halatali (Hard)" }
    ],
    fates: [
      { name: "Surprise", type: "Defend", location: "Upper La Noscea (x26, y18)", notes: "Will Fail if no participation within a minute of spawning, due to death of NPCs. Fate will start shortly after NPCs begin walking along the area. Recommended to camp spawn point." },
      { name: "In Spite of It All", type: "Kill Boss", location: "Central Shroud (x11, y18)", notes: "" },
      { name: "Good to Be Bud", type: "Kill Enemies", location: "Mor Dhona (x13, y12)", notes: "" }
    ],
    leves: [
      { name: "Subduing the Subprime", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "Someone's Got a Big Mouth", type: "Maelstrom Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x11, y16)" },
      { name: "Big, Bad Idea", type: "General", npc: "K'leytai", location: "Mor Dhona - Saint Coinach's Find (x29, y12)" }
    ]
  },
  {
    name: "Book of Skywind II",
    id: "skywind2",
    enemies: [
      { name: "Gigas Shramana x3", zone: "Mor Dhona", location: "North Silvertear (x28, y13)" },
      { name: "5th Cohort Signifer x3", zone: "Mor Dhona", location: "Fogfens (x10, y13)" },
      { name: "Watchwolf x3", zone: "North Shroud", location: "Proud Creek (x19, y19)" },
      { name: "Dreamtoad x3", zone: "East Shroud", location: "Sylphlands (x26, y18)" },
      { name: "Zahar'ak Battle Drake x3", zone: "Southern Thanalan", location: "Zahar'ak (x30, y19)" },
      { name: "Amalj'aa Archer x3", zone: "Southern Thanalan", location: "Zanr'ak (x20, y22)" },
      { name: "4th Cohort Signifer x3", zone: "Western Thanalan", location: "Cape Westwind (x11, y7)" },
      { name: "Elite Priest x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x24, y7)" },
      { name: "Sapsa Shelftooth x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x15, y15)" },
      { name: "Natalan Fogcaller x3", zone: "Coerthas Central Highlands", location: "Natalan (x32, y18 / x34, y20 / x34, y23)" }
    ],
    dungeons: [
      { boss: "Lady Amandine", location: "Haukke Manor" },
      { boss: "Ouranos", location: "Copperbell Mines (Hard)" },
      { boss: "Gobmachine G-VI", location: "Brayflox's Longstop (Hard)" }
    ],
    fates: [
      { name: "Taken", type: "Kill Enemies", location: "Southern Thanalan (x18, y20)", notes: "" },
      { name: "Tower of Power", type: "Kill Enemies", location: "Coerthas Central Highlands (x10.5, y28.6)", notes: "Speak with the House Haillenarte Guard to start." },
      { name: "What Gored Before", type: "Kill Boss", location: "South Shroud (x32, y25)", notes: "" }
    ],
    leves: [
      { name: "Necrologos: Pale Oblation", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "The Bloodhounds of Coerthas", type: "Twin Adder Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x11, y16)" },
      { name: "Put Your Stomp on It", type: "General", npc: "K'leytai", location: "Mor Dhona - Saint Coinach's Find (x29, y12)" }
    ]
  },
  {
    name: "Book of Skyearth I",
    id: "skyearth1",
    enemies: [
      { name: "Violet Sigh x3", zone: "East Shroud", location: "Sylphlands (x24, y13)" },
      { name: "Ixali Boldwing x3", zone: "North Shroud", location: "Proud Creek (x21, y20)" },
      { name: "Amalj'aa Scavenger x3", zone: "Southern Thanalan", location: "Zanr'ak (x20, y21)" },
      { name: "Zahar'ak Pugilist x3", zone: "Southern Thanalan", location: "Zahar'ak (x23, y21)" },
      { name: "Axolotl x3", zone: "Western La Noscea", location: "Sapsa Spawning Grounds (x14, y15)" },
      { name: "Elite Quarryman x3", zone: "Outer La Noscea", location: "U'Ghamaro Mines (x24, y7)" },
      { name: "2nd Cohort Signifer x3", zone: "Eastern La Noscea", location: "Agelyss Wise (x30, y20)" },
      { name: "Natalan Swiftbeak x3", zone: "Coerthas Central Highlands", location: "Natalan (x31, y17)" },
      { name: "5th Cohort Secutor x3", zone: "Mor Dhona", location: "Fogfens (x10, y13)" },
      { name: "Hapalit x3", zone: "Mor Dhona", location: "North Silvertear (x30, y5)" }
    ],
    dungeons: [
      { boss: "Tangata", location: "Halatali" },
      { boss: "Anantaboga", location: "Amdapor Keep" },
      { boss: "Siren", location: "Pharos Sirius" }
    ],
    fates: [
      { name: "The Taste of Fear", type: "Kill Boss", location: "Coerthas Central Highlands (x4.8, y21.8)", notes: "" },
      { name: "The Big Bagoly Theory", type: "Kill Boss", location: "Eastern Thanalan (x30, y25)", notes: "Spawns on the lower level of the map." },
      { name: "Schism", type: "Kill Boss", location: "Outer La Noscea (x25, y16)", notes: "Speak with Storm Private (x23, y16) to begin. All crates must be destroyed before boss appears." }
    ],
    leves: [
      { name: "Don't Forget to Cry", type: "General", npc: "Rurubana", location: "Northern Thanalan - Camp Bluefog (x22, y29)" },
      { name: "Necrologos: The Liminal Ones", type: "General", npc: "K'leytai", location: "Mor Dhona - Saint Coinach's Find (x29, y12)" },
      { name: "No Big Whoop", type: "Immortal Flames Grand Company", npc: "Lodille", location: "Coerthas Central Highlands - Whitebrim Front (x11, y16)" }
    ]
  }
];

// ===== LOCALSTORAGE HELPERS =====
const LS_JOB = 'trialsOfBraves_selectedJob';
const LS_BOOK = 'trialsOfBraves_activeBook';
const LS_THEME = 'trialsOfBraves_theme';

function getChecksKey(job) {
  return 'trialsOfBraves_checks_' + job;
}

function loadChecks(job) {
  try {
    return JSON.parse(localStorage.getItem(getChecksKey(job))) || {};
  } catch { return {}; }
}

function saveChecks(job, checks) {
  localStorage.setItem(getChecksKey(job), JSON.stringify(checks));
}

function loadSetting(key, fallback) {
  return localStorage.getItem(key) || fallback;
}

function saveSetting(key, val) {
  localStorage.setItem(key, val);
}

// ===== TASK ID HELPERS =====
function taskId(bookId, category, index) {
  return bookId + '_' + category + '_' + index;
}

function countBookTasks(book) {
  return book.enemies.length + book.dungeons.length + book.fates.length + book.leves.length;
}

function countBookChecked(book, checks) {
  let count = 0;
  const cats = [
    { key: 'enemy', arr: book.enemies },
    { key: 'dungeon', arr: book.dungeons },
    { key: 'fate', arr: book.fates },
    { key: 'leve', arr: book.leves }
  ];
  cats.forEach(c => {
    c.arr.forEach((_, i) => {
      if (checks[taskId(book.id, c.key, i)]) count++;
    });
  });
  return count;
}

// ===== RENDERING =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderEnemiesTable(book, checks, job) {
  let rows = book.enemies.map((e, i) => {
    const id = taskId(book.id, 'enemy', i);
    const checked = checks[id] ? 'checked' : '';
    const cls = checks[id] ? 'checked' : '';
    return '<tr class="' + cls + '">' +
      '<td class="td-check"><input type="checkbox" data-id="' + id + '" ' + checked + '></td>' +
      '<td class="td-num">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(e.name) + '</td>' +
      '<td>' + escapeHtml(e.zone) + '</td>' +
      '<td>' + escapeHtml(e.location) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="category"><h3 class="category-title">Enemies</h3>' +
    '<table class="task-table"><thead><tr>' +
    '<th></th><th>#</th><th>Name</th><th>Zone</th><th>Location</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderDungeonsTable(book, checks, job) {
  let rows = book.dungeons.map((d, i) => {
    const id = taskId(book.id, 'dungeon', i);
    const checked = checks[id] ? 'checked' : '';
    const cls = checks[id] ? 'checked' : '';
    return '<tr class="' + cls + '">' +
      '<td class="td-check"><input type="checkbox" data-id="' + id + '" ' + checked + '></td>' +
      '<td class="td-num">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(d.boss) + '</td>' +
      '<td>' + escapeHtml(d.location) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="category"><h3 class="category-title">Dungeons</h3>' +
    '<table class="task-table"><thead><tr>' +
    '<th></th><th>#</th><th>Target Boss</th><th>Location</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderFatesTable(book, checks, job) {
  let rows = book.fates.map((f, i) => {
    const id = taskId(book.id, 'fate', i);
    const checked = checks[id] ? 'checked' : '';
    const cls = checks[id] ? 'checked' : '';
    const notesHtml = f.notes ? '<div class="notes">' + escapeHtml(f.notes) + '</div>' : '';
    return '<tr class="' + cls + '">' +
      '<td class="td-check"><input type="checkbox" data-id="' + id + '" ' + checked + '></td>' +
      '<td class="td-num">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(f.name) + notesHtml + '</td>' +
      '<td>' + escapeHtml(f.type) + '</td>' +
      '<td>' + escapeHtml(f.location) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="category"><h3 class="category-title">FATEs</h3>' +
    '<table class="task-table"><thead><tr>' +
    '<th></th><th>#</th><th>Name</th><th>Type</th><th>Location</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderLevesTable(book, checks, job) {
  let rows = book.leves.map((l, i) => {
    const id = taskId(book.id, 'leve', i);
    const checked = checks[id] ? 'checked' : '';
    const cls = checks[id] ? 'checked' : '';
    return '<tr class="' + cls + '">' +
      '<td class="td-check"><input type="checkbox" data-id="' + id + '" ' + checked + '></td>' +
      '<td class="td-num">' + (i + 1) + '</td>' +
      '<td>' + escapeHtml(l.name) + '</td>' +
      '<td>' + escapeHtml(l.type) + '</td>' +
      '<td>' + escapeHtml(l.npc) + '</td>' +
      '<td>' + escapeHtml(l.location) + '</td>' +
      '</tr>';
  }).join('');
  return '<div class="category"><h3 class="category-title">Leves</h3>' +
    '<table class="task-table"><thead><tr>' +
    '<th></th><th>#</th><th>Name</th><th>Type</th><th>NPC</th><th>Location</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function renderBooks() {
  const job = document.getElementById('job-select').value;
  const checks = loadChecks(job);
  const activeBookId = loadSetting(LS_BOOK, '');
  const container = document.getElementById('books-container');

  let totalTasks = 0;
  let totalChecked = 0;

  let html = '';
  BOOKS.forEach(book => {
    const bookTotal = countBookTasks(book);
    const bookChecked = countBookChecked(book, checks);
    totalTasks += bookTotal;
    totalChecked += bookChecked;

    const isActive = activeBookId === book.id;
    const isComplete = bookChecked === bookTotal;
    const pct = bookTotal > 0 ? Math.round((bookChecked / bookTotal) * 100) : 0;

    html += '<div class="book' + (isActive ? ' active' : '') + '" data-book-id="' + book.id + '">';
    html += '<div class="book-header" data-book-id="' + book.id + '">';
    html += '<div class="book-header-left">';
    html += '<span class="book-check' + (isComplete ? ' completed' : '') + '">' + (isComplete ? '&#10003;' : '&#9744;') + '</span>';
    html += '<span class="book-name">' + escapeHtml(book.name) + '</span>';
    html += '</div>';
    html += '<div class="book-header-right">';
    html += '<span class="book-progress-text">' + bookChecked + ' / ' + bookTotal + '</span>';
    html += '<div class="book-progress-bar"><div class="book-progress-bar-fill" style="width:' + pct + '%"></div></div>';
    html += '<span class="book-expand-icon">&#9660;</span>';
    html += '</div>';
    html += '</div>';

    html += '<div class="book-body">';
    html += renderEnemiesTable(book, checks, job);
    html += renderDungeonsTable(book, checks, job);
    html += renderFatesTable(book, checks, job);
    html += renderLevesTable(book, checks, job);
    html += '</div>';
    html += '</div>';
  });

  container.innerHTML = html;

  // Update overall progress
  const overallPct = totalTasks > 0 ? Math.round((totalChecked / totalTasks) * 100) : 0;
  document.getElementById('overall-progress-text').textContent = totalChecked + ' / ' + totalTasks;
  document.getElementById('overall-progress-fill').style.width = overallPct + '%';

  // Bind book header clicks
  container.querySelectorAll('.book-header').forEach(header => {
    header.addEventListener('click', function() {
      const bookId = this.getAttribute('data-book-id');
      const current = loadSetting(LS_BOOK, '');
      const newActive = current === bookId ? '' : bookId;
      saveSetting(LS_BOOK, newActive);
      renderBooks();
    });
  });

  // Bind checkbox changes
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', function(e) {
      e.stopPropagation();
      const id = this.getAttribute('data-id');
      const currentJob = document.getElementById('job-select').value;
      const currentChecks = loadChecks(currentJob);
      if (this.checked) {
        currentChecks[id] = true;
      } else {
        delete currentChecks[id];
      }
      saveChecks(currentJob, currentChecks);
      renderBooks();
    });
  });
}

// ===== THEME =====
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (theme === 'dark') {
    icon.innerHTML = '&#9788;';
    text.textContent = 'Light';
  } else {
    icon.innerHTML = '&#9790;';
    text.textContent = 'Dark';
  }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
  // Populate job selector
  const jobSelect = document.getElementById('job-select');
  JOBS.forEach(job => {
    const opt = document.createElement('option');
    opt.value = job;
    opt.textContent = job;
    jobSelect.appendChild(opt);
  });

  // Restore saved job
  const savedJob = loadSetting(LS_JOB, JOBS[0]);
  if (JOBS.includes(savedJob)) {
    jobSelect.value = savedJob;
  } else {
    jobSelect.value = JOBS[0];
  }

  // Job change handler
  jobSelect.addEventListener('change', function() {
    saveSetting(LS_JOB, this.value);
    renderBooks();
  });

  // Theme
  const savedTheme = loadSetting(LS_THEME, 'light');
  applyTheme(savedTheme);

  document.getElementById('theme-toggle').addEventListener('click', function() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    saveSetting(LS_THEME, next);
    applyTheme(next);
  });

  // Initial render
  renderBooks();
});
