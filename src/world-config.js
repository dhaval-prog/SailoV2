// Tunables for the living ocean (and the harbour and market): one place to change them.
// Distances in metres, times in seconds, speeds in m/s (1 kn ≈ 0.514 m/s).
export const WILDLIFE = {
  // dolphins: pods are drawn from a shared schedule (the same for every captain on the chart), so they're rare and
  // never come back to the same place twice
  dolphin: {
    cell: 900,             // the sea is split into squares this size; each may hold a pod in a given time slot
    slot: 300,             // a pod's time slot (it swims through its square, then leaves)
    chance: 0.08,          // odds a square holds a pod in a slot
    pod: [2, 5],           // dolphins in a pod
    speed: 4.2,            // cruising on their own
    maxSpeed: 9,           // flat out (a faster boat leaves them behind)
    seen: 450,             // drawn within this distance of your boat
    followRange: 140,      // a pod this close may join a boat…
    followMin: 2.6,        // …at cruising speed (about 5 kn) or more
    followFor: [45, 75],   // then rides along this long before leaving
    keepOff: 5,            // never closer than this to the hull's centre line
    awayFromStation: 350,  // not in the harbour
  },
  // seagulls: a few follow a moving boat, some cross the sky, more gather at fishing spots and Paradise Station
  gull: {
    max: 14,               // gulls drawn at once
    followEvery: [40, 90], // seconds between gulls joining a moving boat
    followFor: [18, 32],
    flockCell: 700, flockSlot: 180, flockChance: 0.25, // passing flocks (shared schedule)
    atSpot: 2,             // gulls over each fishing spot (yours and the local sailors')
    atStation: 6,          // gulls about the harbour
    seen: 380,
  },
  // whales: extremely rare, deep water only, well away from the harbour; they never touch a boat
  whale: {
    cell: 2500, slot: 1200, chance: 0.05,
    awayFromStation: 900, awayFromEdge: 600,
    showAt: [170, 380],    // they surface this far from a boat
    clearOfBoat: 35,       // a boat this close and the whale dives at once
    seen: 420,
    detailAt: 140,         // closer than this, the detailed model (fins, flukes)
  },
  // fish jumping at fishing spots: only a sight, never a catch; the species are the ones that live here
  jumpers: {
    perMinute: 5,          // jumps per spot per minute, by day
    dawnDusk: 1.8, night: 0.6, // more at dawn and dusk, fewer at night
    max: 6,
  },
};

// the Fish Market at Paradise Station: each species' price moves with the time of day and the day's demand, the same
// for every captain (worked out from the clock, not stored); the price paid is the base price × this multiplier
export const MARKET = {
  period: 1800,        // demand drifts smoothly from one half-hour to the next (never jumps)
  swing: 0.22,         // how far demand alone moves a price (±22%)
  daily: 0.12,         // and the time of day (±12%: each species has its own busy hour)
  min: 0.6, max: 1.6,  // a price never goes below 60% or above 160% of its base
  trendOver: 1200,     // rising / falling: compared with 20 minutes ago…
  trendStep: 0.03,     // …by more than 3%
  high: 1.25, low: 0.8, // a price this far from its base is news…
  notifyEvery: 600,    // …told at most once every 10 minutes
};

// the economy's numbers, as the server applies them (econ_cfg() in supabase/migrations/…_sailov2_economy.sql: keep the
// two in step).
export const ECONOMY = {
  fuelPrice: 2,          // coins a litre
  catchGap: 3,           // seconds: at most one fish kept (or released) this often
  release: 0.2,          // releasing a fish pays this share of its base price
};

// the sea's terrain (terrain.js): rocks where the map's buildings are, corals where it's green
export const TERRAIN = {
  cell: 40,              // metres: buildings are counted in squares this size…
  dense: 0.32,           // …and a square this built-up becomes a medium rock
  hugeArea: 3500,        // a footprint this big (m²: a mall, a campus) becomes a huge rock
  // sizes against the boat (the tug: ~10.7 m long, ~10 m tall): a medium rock twice as wide and tall, a huge one three times
  medR: 26, medH: 20,    // radius, height (metres): a medium rock is drawn as a pine island ~5 boat lengths across
  bigR: 40, bigH: 30,    // a huge one (a mall, a campus): a big pine island ~86 m across
  gap: 22,               // metres of open water kept between two rocks, at least
  edge: 14,              // and a lane along every map tile's edge
  startClear: 260,       // no rocks round the harbour where voyages start…
  stationClear: 320,     // …nor round any Paradise Station
  boatPad: 4,            // the boat's own clearance
  coralStep: 16,         // corals: one may grow every this many metres in a green area…
  coralFill: 0.7,        // …this often
  coralsPerArea: 500,    // at most this many per park
  coralMin: 4, coralMax: 9, // metres across
  loadAround: 900,       // map tiles are read this far round the boat
  drawRocks: 650, drawCorals: 420, // and drawn this far (the haze hides more)
  repaint: 120,          // redrawn when the boat has moved this far
};
