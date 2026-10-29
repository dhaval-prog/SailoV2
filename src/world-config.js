// Tunables for the living ocean (and, as they arrive, the harbour, market and combat): one place to change them.
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
