// More species: sharks, rays, oddballs and freshwater fish, each built in code in 3D like the
// original 25 (station.js), so they swim, leap and sit in the crate the same way. Every entry has
// a body plan (kind) and its own colours, pattern and features:
//   kind 'fish'     a bony fish: the common body with options (whiskers, long snouts, armour,
//                   wings, lobed fins, spines, top eyes, teeth, long fins, tail shapes, patterns)
//   kind 'shark'    sharks and the sawfish: pointed snout, tall dorsal, gill slits, heterocercal tail
//   kind 'ray'      manta, stingrays, electric and eagle rays: a flat disc with a tail
//   kind 'horse'    seahorse and pipefish: a ridged tube body with a tube snout
//   kind 'eel'      freshwater eel and oarfish: long ribbon bodies
//   kind 'angler'   anglerfish: huge head and mouth, teeth, the glowing lure
//   kind 'mola'     ocean sunfish: a tall disc with no tail
//   kind 'box'      boxfish and cowfish: a boxy body (cowfish with horns)
//   kind 'spiny'    porcupinefish: a round body covered in long spines
// Fields shared with the original list: id, name, price (coins), kg, len / h / w (model size),
// back / side / belly / fin colours, pat, odds (catch weight; rarer = more stars) and where (only
// caught in that ocean region; without it, in all seas). fresh marks freshwater species.

const F = (o) => ({ fresh: false, ...o });
// how they fight on the line (see fishing.js), by build
const BRUTE = { pull: 0.9, zone: 0.18, speed: 0.7, turn: 2.6, fight: 13, run: true };
const BIG = { pull: 0.75, zone: 0.22, speed: 0.6, turn: 2.4, fight: 10, run: true };
const STRONG = { pull: 0.6, zone: 0.25, speed: 0.6, turn: 2, fight: 8 };
const MID = { pull: 0.45, zone: 0.28, speed: 0.55, turn: 1.8, fight: 6 };
const SMALL = { pull: 0.25, zone: 0.36, speed: 0.45, turn: 1.4, fight: 4 };
const JUMPER = { pull: 0.6, zone: 0.24, speed: 0.75, turn: 1.8, fight: 8, jump: true };
const DARTER = { pull: 0.55, zone: 0.24, speed: 0.9, turn: 1.3, fight: 7, sprint: true };

export const MORE_FISH = [
  // ---------- sharks ----------
  F({ id: 'greatwhite', name: 'Great White Shark', kind: 'shark', price: 220, kg: 900, len: 2.3, h: 0.5, w: 0.42, back: '#5f6b78', side: '#8a96a3', belly: '#f2f4f5', fin: '#56616d', pat: 'sharp', odds: 0.4, fight: BRUTE, tail: 'lunate' }),
  F({ id: 'whaleshark', name: 'Whale Shark', kind: 'shark', price: 260, kg: 1500, len: 2.6, h: 0.52, w: 0.6, back: '#2f4a66', side: '#46617d', belly: '#e7edf2', fin: '#2c445e', pat: 'whale', odds: 0.25, fight: BRUTE, snout: 'flat', tail: 'lunate', ridges: true }),
  F({ id: 'tigershark', name: 'Tiger Shark', kind: 'shark', price: 180, kg: 500, len: 2.2, h: 0.44, w: 0.4, back: '#6d6b58', side: '#9a967c', belly: '#f1efe6', fin: '#646250', pat: 'tiger', odds: 0.6, fight: BRUTE, snout: 'blunt' }),
  F({ id: 'hammerhead', name: 'Hammerhead Shark', kind: 'shark', price: 190, kg: 350, len: 2.2, h: 0.4, w: 0.34, back: '#6b7886', side: '#909cab', belly: '#eef1f4', fin: '#626e7c', pat: 'sharp', odds: 0.5, fight: BRUTE, hammer: true, dorsalH: 1.35 }),
  F({ id: 'bullshark', name: 'Bull Shark', kind: 'shark', price: 150, kg: 180, len: 1.9, h: 0.46, w: 0.42, back: '#6a7177', side: '#959ca2', belly: '#f0f2f3', fin: '#60676d', pat: 'shade', odds: 0.9, fight: BIG, snout: 'blunt' }),
  F({ id: 'nurseshark', name: 'Nurse Shark', kind: 'shark', price: 90, kg: 110, len: 1.9, h: 0.36, w: 0.4, back: '#8a6a45', side: '#a8855b', belly: '#e7d6bd', fin: '#7d603e', pat: 'shade', odds: 1.4, fight: STRONG, snout: 'round', whiskers: 2, roundFins: true, dorsalBack: true }),
  F({ id: 'leopardshark', name: 'Leopard Shark', kind: 'shark', price: 85, kg: 18, len: 1.6, h: 0.3, w: 0.28, back: '#8f8a7c', side: '#b3ad9c', belly: '#f2eee4', fin: '#857f70', pat: 'leopard', odds: 2, fight: STRONG, where: 'americas' }),
  F({ id: 'goblinshark', name: 'Goblin Shark', kind: 'shark', price: 240, kg: 210, len: 2.1, h: 0.36, w: 0.32, back: '#c98f93', side: '#dcaaab', belly: '#f2d9d8', fin: '#bf8287', pat: 'shade', odds: 0.2, fight: BIG, goblin: true, where: 'westpac', roundFins: true }),
  F({ id: 'baskingshark', name: 'Basking Shark', kind: 'shark', price: 210, kg: 1200, len: 2.5, h: 0.5, w: 0.48, back: '#4e5660', side: '#6c757f', belly: '#c9ced3', fin: '#47505a', pat: 'shade', odds: 0.3, fight: BRUTE, gape: true, tail: 'lunate', where: 'north' }),
  F({ id: 'thresher', name: 'Thresher Shark', kind: 'shark', price: 170, kg: 300, len: 2.4, h: 0.42, w: 0.36, back: '#5c5d8a', side: '#8486ad', belly: '#eef0f6', fin: '#55567f', pat: 'sharp', odds: 0.5, fight: BRUTE, thresher: true }),
  F({ id: 'reefshark', name: 'Reef Shark', kind: 'shark', price: 110, kg: 40, len: 1.7, h: 0.34, w: 0.3, back: '#7f8890', side: '#a5adb4', belly: '#f2f4f5', fin: '#737c84', pat: 'shade', odds: 1.6, fight: BIG, tips: '#14181c' }),
  F({ id: 'sawfish', name: 'Sawfish', kind: 'shark', price: 200, kg: 350, len: 2.3, h: 0.26, w: 0.5, back: '#7b7a62', side: '#a3a184', belly: '#f0eee2', fin: '#706f58', pat: 'shade', odds: 0.35, fight: BRUTE, saw: true, flatHead: true }),
  // ---------- rays ----------
  F({ id: 'manta', name: 'Manta Ray', kind: 'ray', price: 200, kg: 1300, len: 1.2, h: 0.12, w: 2.4, back: '#1d2533', side: '#2a3446', belly: '#eef0f3', fin: '#1d2533', pat: 'manta', odds: 0.4, fight: BIG, manta: true }),
  F({ id: 'stingray', name: 'Stingray', kind: 'ray', price: 45, kg: 12, len: 1.0, h: 0.1, w: 0.95, back: '#7a6a4f', side: '#8d7c5e', belly: '#f2ece0', fin: '#6b5c43', pat: 'freckle', odds: 4, fight: STRONG, disc: 'round', whip: 1.3, barb: true }),
  F({ id: 'electricray', name: 'Electric Ray', kind: 'ray', price: 60, kg: 15, len: 0.95, h: 0.14, w: 0.9, back: '#8a5a3a', side: '#a06c48', belly: '#f3e4d4', fin: '#7c5034', pat: 'eyespots', odds: 2.5, fight: MID, disc: 'round', torpedo: true }),
  F({ id: 'eagleray', name: 'Eagle Ray', kind: 'ray', price: 90, kg: 60, len: 1.0, h: 0.12, w: 1.9, back: '#283447', side: '#33405a', belly: '#f2f4f6', fin: '#283447', pat: 'eagle', odds: 1.4, fight: BIG, pointy: true, whip: 1.8 }),
  // ---------- oddballs ----------
  F({ id: 'seahorse', name: 'Seahorse', kind: 'horse', price: 70, kg: 0.02, len: 0.55, h: 0.55, w: 0.1, back: '#e3a33a', side: '#f0bd5a', belly: '#f8dc93', fin: '#f5d27a', pat: 'none', odds: 2, fight: SMALL }),
  F({ id: 'pipefish', name: 'Pipefish', kind: 'horse', price: 30, kg: 0.03, len: 0.8, h: 0.06, w: 0.06, back: '#6b7a3a', side: '#8f9c55', belly: '#d9dcae', fin: '#a5ae6a', pat: 'none', odds: 4, fight: SMALL, pipe: true }),
  F({ id: 'anglerfish', name: 'Anglerfish', kind: 'angler', price: 140, kg: 12, len: 0.9, h: 0.62, w: 0.55, back: '#2b2622', side: '#3d3630', belly: '#5a4f45', fin: '#2b2622', pat: 'none', odds: 0.8, fight: STRONG }),
  F({ id: 'oarfish', name: 'Oarfish', kind: 'eel', price: 230, kg: 270, len: 2.8, h: 0.24, w: 0.06, back: '#c9d2dc', side: '#dfe5ec', belly: '#f2f4f7', fin: '#e8313b', pat: 'oar', odds: 0.25, fight: BIG, oar: true }),
  F({ id: 'molamola', name: 'Ocean Sunfish', kind: 'mola', price: 160, kg: 1000, len: 1.3, h: 1.1, w: 0.3, back: '#7c8794', side: '#a8b2bd', belly: '#e6eaee', fin: '#737e8b', pat: 'mottle', odds: 0.6, fight: BIG }),
  F({ id: 'boxfish', name: 'Boxfish', kind: 'box', price: 35, kg: 0.4, len: 0.55, h: 0.36, w: 0.36, back: '#f2c419', side: '#f5cf2c', belly: '#f8e27a', fin: '#f2c419', pat: 'box', odds: 4, fight: SMALL }),
  F({ id: 'cowfish', name: 'Cowfish', kind: 'box', price: 40, kg: 0.5, len: 0.6, h: 0.36, w: 0.34, back: '#b8b33a', side: '#cfca52', belly: '#efe9a0', fin: '#c5c048', pat: 'cow', odds: 3, fight: SMALL, horns: true }),
  F({ id: 'porcupine', name: 'Porcupinefish', kind: 'spiny', price: 32, kg: 1.5, len: 0.65, h: 0.55, w: 0.5, back: '#8b7a55', side: '#c9b98d', belly: '#f4eedd', fin: '#b8a678', pat: 'dots', odds: 4, fight: MID }),
  F({ id: 'stonefish', name: 'Stonefish', kind: 'fish', price: 75, kg: 2, len: 0.6, h: 0.32, w: 0.3, back: '#6e6152', side: '#8a7b68', belly: '#b9a98f', fin: '#7a6c5a', pat: 'mottle', odds: 1.6, fight: MID, warty: 1, spiny: true, tail: 'round', bigMouth: true, topEyes: 0.6 }),
  F({ id: 'scorpionfish', name: 'Scorpionfish', kind: 'fish', price: 48, kg: 1.2, len: 0.6, h: 0.3, w: 0.2, back: '#b5452f', side: '#d46a4b', belly: '#f2c8b0', fin: '#c25a3f', pat: 'mottle', odds: 3, fight: MID, warty: 0.5, spiny: true, tail: 'round', bigMouth: true, tassels: true }),
  F({ id: 'flyingfish', name: 'Flying Fish', kind: 'fish', price: 26, kg: 0.4, len: 0.6, h: 0.16, w: 0.12, back: '#1d4f9a', side: '#9fb8d6', belly: '#f2f5f8', fin: '#7aa7dc', pat: 'none', odds: 6, fight: DARTER, wings: true, tail: 'fork', lowLobe: true }),
  F({ id: 'mudskipper', name: 'Mudskipper', kind: 'fish', price: 18, kg: 0.05, len: 0.45, h: 0.14, w: 0.13, back: '#6c6a4a', side: '#8f8c64', belly: '#cfcaa8', fin: '#7d7a55', pat: 'blue', odds: 5, fight: SMALL, topEyes: 1, legs: true, tail: 'round', longDorsal: 'sail' }),
  F({ id: 'coelacanth', name: 'Coelacanth', kind: 'fish', price: 320, kg: 80, len: 1.5, h: 0.42, w: 0.3, back: '#283e6b', side: '#34508a', belly: '#4d68a0', fin: '#2a4170', pat: 'coela', odds: 0.15, fight: BIG, lobed: true, tail: 'lobed', where: 'arabian' }),
  F({ id: 'lungfish', name: 'Lungfish', kind: 'fish', price: 95, kg: 20, len: 1.3, h: 0.22, w: 0.2, back: '#5e5a3a', side: '#7c7650', belly: '#c9c09a', fin: '#6a6545', pat: 'mottle', odds: 1, fight: STRONG, fresh: true, lobed: 'thin', tail: 'point', longDorsal: 'rear', where: 'southern' }),
  // ---------- freshwater ----------
  F({ id: 'carp', name: 'Common Carp', kind: 'fish', price: 14, kg: 4, len: 0.9, h: 0.32, w: 0.18, back: '#5b5326', side: '#b38f3c', belly: '#ecd9a4', fin: '#8c6a34', pat: 'scales', odds: 9, fight: STRONG, fresh: true, whiskers: 2, hump: 0.12, longDorsal: 'carp' }),
  F({ id: 'koi', name: 'Koi', kind: 'fish', price: 65, kg: 5, len: 0.85, h: 0.3, w: 0.18, back: '#f05a1a', side: '#f7f2ea', belly: '#fbf8f2', fin: '#f4efe6', pat: 'koi', odds: 2, fight: MID, fresh: true, whiskers: 2, hump: 0.1, longDorsal: 'carp', where: 'westpac', fins: 'flowing' }),
  F({ id: 'goldfish', name: 'Goldfish', kind: 'fish', price: 12, kg: 0.3, len: 0.45, h: 0.28, w: 0.16, back: '#f07a12', side: '#f79a2a', belly: '#fbd27a', fin: '#f6913a', pat: 'none', odds: 6, fight: SMALL, fresh: true, hump: 0.15, fins: 'flowing', tail: 'veil', shine: true }),
  F({ id: 'catfish', name: 'Catfish', kind: 'fish', price: 20, kg: 6, len: 1.1, h: 0.24, w: 0.24, back: '#4a463c', side: '#6a6455', belly: '#d9d3c2', fin: '#4f4a40', pat: 'mottle', odds: 7, fight: STRONG, fresh: true, whiskers: 6, flatHead: true, tail: 'round', smooth: true }),
  F({ id: 'channelcat', name: 'Channel Catfish', kind: 'fish', price: 24, kg: 5, len: 1.0, h: 0.24, w: 0.2, back: '#56606a', side: '#8b949c', belly: '#eef0f1', fin: '#5a636b', pat: 'freckle', odds: 6, fight: STRONG, fresh: true, whiskers: 8, flatHead: true, tail: 'fork', smooth: true, where: 'americas' }),
  F({ id: 'bluecat', name: 'Blue Catfish', kind: 'fish', price: 45, kg: 30, len: 1.4, h: 0.3, w: 0.27, back: '#3e5670', side: '#6c849c', belly: '#e6ecf1', fin: '#40576e', pat: 'none', odds: 2, fight: BIG, fresh: true, whiskers: 8, flatHead: true, tail: 'fork', smooth: true, where: 'americas' }),
  F({ id: 'corydoras', name: 'Corydoras', kind: 'fish', price: 10, kg: 0.01, len: 0.35, h: 0.16, w: 0.12, back: '#8c8a7c', side: '#bdb9a6', belly: '#ece6d2', fin: '#c8c2ae', pat: 'leopard', odds: 6, fight: SMALL, fresh: true, whiskers: 2, hump: 0.2, plates: true, where: 'americas' }),
  F({ id: 'pleco', name: 'Plecostomus', kind: 'fish', price: 22, kg: 1, len: 0.7, h: 0.18, w: 0.2, back: '#4a4232', side: '#6a5e46', belly: '#a99a7c', fin: '#56493a', pat: 'pleco', odds: 4, fight: MID, fresh: true, flatHead: true, plates: true, longDorsal: 'sail', where: 'americas' }),
  F({ id: 'tilapia', name: 'Tilapia', kind: 'fish', price: 9, kg: 0.9, len: 0.6, h: 0.3, w: 0.13, back: '#4f5b4a', side: '#8f9a88', belly: '#e7eadf', fin: '#64705c', pat: 'faintbars', odds: 10, fight: SMALL, fresh: true, hump: 0.15, longDorsal: 'spiny' }),
  F({ id: 'nileperch', name: 'Nile Perch', kind: 'fish', price: 70, kg: 50, len: 1.5, h: 0.38, w: 0.24, back: '#5c6a6e', side: '#c5d0d2', belly: '#f2f5f5', fin: '#6d7b7f', pat: 'none', odds: 1.5, fight: BIG, fresh: true, hump: 0.25, tail: 'round', where: 'arabian' }),
  F({ id: 'niletilapia', name: 'Nile Tilapia', kind: 'fish', price: 11, kg: 1.5, len: 0.65, h: 0.32, w: 0.14, back: '#5a6a5a', side: '#a3ad9c', belly: '#eef0e8', fin: '#c66a5a', pat: 'tailbars', odds: 8, fight: SMALL, fresh: true, hump: 0.15, longDorsal: 'spiny', where: 'arabian' }),
  F({ id: 'largemouth', name: 'Largemouth Bass', kind: 'fish', price: 30, kg: 2.5, len: 0.85, h: 0.3, w: 0.18, back: '#3f5a2c', side: '#8fa264', belly: '#efedd6', fin: '#5b7040', pat: 'bassline', odds: 6, fight: JUMPER, fresh: true, bigMouth: true, longDorsal: 'spiny', where: 'americas' }),
  F({ id: 'smallmouth', name: 'Smallmouth Bass', kind: 'fish', price: 28, kg: 1.8, len: 0.75, h: 0.28, w: 0.16, back: '#5b4a2a', side: '#a8894e', belly: '#ece0c2', fin: '#7a6438', pat: 'bronzebars', odds: 6, fight: JUMPER, fresh: true, longDorsal: 'spiny', where: 'americas' }),
  F({ id: 'trout', name: 'Trout', kind: 'fish', price: 24, kg: 1.2, len: 0.75, h: 0.22, w: 0.14, back: '#3f4f3a', side: '#a8ae8a', belly: '#efeee2', fin: '#6d7258', pat: 'brook', odds: 7, fight: JUMPER, fresh: true, adipose: true }),
  F({ id: 'rainbowtrout', name: 'Rainbow Trout', kind: 'fish', price: 30, kg: 2, len: 0.85, h: 0.24, w: 0.15, back: '#4c6a5a', side: '#c9cdbf', belly: '#f4f2ec', fin: '#8d9a88', pat: 'rainbow', odds: 7, fight: JUMPER, fresh: true, adipose: true }),
  F({ id: 'browntrout', name: 'Brown Trout', kind: 'fish', price: 32, kg: 2.5, len: 0.9, h: 0.24, w: 0.15, back: '#5a4a2a', side: '#b89a5c', belly: '#f2e6c8', fin: '#8a7444', pat: 'browntrout', odds: 5, fight: JUMPER, fresh: true, adipose: true, where: 'north' }),
  F({ id: 'pike', name: 'Northern Pike', kind: 'fish', price: 40, kg: 6, len: 1.2, h: 0.2, w: 0.16, back: '#3e5232', side: '#7d8f5a', belly: '#efecd8', fin: '#8a7a3a', pat: 'pike', odds: 4, fight: DARTER, fresh: true, duck: true, dorsalBack: true, where: 'north' }),
  F({ id: 'muskie', name: 'Muskellunge', kind: 'fish', price: 85, kg: 14, len: 1.45, h: 0.22, w: 0.17, back: '#5a6a4a', side: '#b3b88f', belly: '#f1efe0', fin: '#a07a4a', pat: 'muskie', odds: 1.2, fight: BIG, fresh: true, duck: true, dorsalBack: true, where: 'americas' }),
  F({ id: 'walleye', name: 'Walleye', kind: 'fish', price: 34, kg: 3, len: 0.85, h: 0.22, w: 0.16, back: '#5a5a2e', side: '#b8a65c', belly: '#f2ecd8', fin: '#8a7a44', pat: 'saddles', odds: 5, fight: MID, fresh: true, glowEye: true, longDorsal: 'twin', where: 'americas' }),
  F({ id: 'perch', name: 'Perch', kind: 'fish', price: 12, kg: 0.5, len: 0.5, h: 0.24, w: 0.12, back: '#4e5a26', side: '#b9b04a', belly: '#f4ecd2', fin: '#e0752e', pat: 'perch', odds: 9, fight: SMALL, fresh: true, hump: 0.18, longDorsal: 'twin', redFins: true, where: 'north' }),
  F({ id: 'crappie', name: 'Crappie', kind: 'fish', price: 14, kg: 0.6, len: 0.45, h: 0.3, w: 0.1, back: '#4a5a4a', side: '#c3cbb8', belly: '#f2f4ee', fin: '#9aa58e', pat: 'crappie', odds: 8, fight: SMALL, fresh: true, hump: 0.12, longDorsal: 'spiny', where: 'americas' }),
  F({ id: 'bluegill', name: 'Bluegill', kind: 'fish', price: 10, kg: 0.3, len: 0.4, h: 0.32, w: 0.1, back: '#3a5a62', side: '#8aa08a', belly: '#f2c46a', fin: '#5a7a76', pat: 'bluegill', odds: 10, fight: SMALL, fresh: true, longDorsal: 'spiny', earFlap: true, where: 'americas' }),
  F({ id: 'pumpkinseed', name: 'Sunfish', kind: 'fish', price: 11, kg: 0.25, len: 0.38, h: 0.3, w: 0.1, back: '#5a6a3a', side: '#c9a24a', belly: '#f29a3a', fin: '#a8963e', pat: 'pumpkin', odds: 9, fight: SMALL, fresh: true, longDorsal: 'spiny', earFlap: '#e8392f' }),
  F({ id: 'sturgeon', name: 'Sturgeon', kind: 'fish', price: 150, kg: 120, len: 2.1, h: 0.32, w: 0.3, back: '#5a6068', side: '#8a9098', belly: '#e3e5e8', fin: '#5d636b', pat: 'none', odds: 0.6, fight: BRUTE, fresh: true, scutes: true, whiskers: 4, snoutCone: 0.22, tail: 'hetero', where: 'north' }),
  F({ id: 'paddlefish', name: 'Paddlefish', kind: 'fish', price: 110, kg: 30, len: 1.6, h: 0.28, w: 0.24, back: '#4a5662', side: '#76828e', belly: '#e1e5e9', fin: '#4d5965', pat: 'none', odds: 0.8, fight: BIG, fresh: true, paddle: true, tail: 'hetero', smooth: true, where: 'americas' }),
  F({ id: 'piranha', name: 'Piranha', kind: 'fish', price: 30, kg: 1.5, len: 0.5, h: 0.36, w: 0.14, back: '#5a6270', side: '#a8b0bc', belly: '#e0442e', fin: '#3a3f48', pat: 'spangle', odds: 6, fight: DARTER, fresh: true, hump: 0.2, teeth: true, adipose: true, where: 'americas' }),
  F({ id: 'pacu', name: 'Pacu', kind: 'fish', price: 26, kg: 8, len: 0.8, h: 0.55, w: 0.16, back: '#3e4248', side: '#6a7078', belly: '#d27a4a', fin: '#2e3238', pat: 'none', odds: 5, fight: STRONG, fresh: true, hump: 0.15, adipose: true, where: 'americas' }),
  F({ id: 'arapaima', name: 'Arapaima', kind: 'fish', price: 180, kg: 150, len: 2.2, h: 0.32, w: 0.26, back: '#4a5442', side: '#7a8268', belly: '#d9cfb0', fin: '#7a2a22', pat: 'arapaima', odds: 0.5, fight: BRUTE, fresh: true, flatHead: true, longDorsal: 'rear', tail: 'round', where: 'americas' }),
  F({ id: 'eel', name: 'Freshwater Eel', kind: 'eel', price: 34, kg: 2, len: 1.4, h: 0.1, w: 0.09, back: '#3e3e22', side: '#6a6438', belly: '#d9d0a0', fin: '#4a4828', pat: 'none', odds: 5, fight: MID, fresh: true }),
  F({ id: 'bichir', name: 'Bichir', kind: 'fish', price: 55, kg: 1.5, len: 0.8, h: 0.16, w: 0.15, back: '#5a5a4a', side: '#8a8670', belly: '#d8d2b8', fin: '#6a6650', pat: 'bands', odds: 2, fight: MID, fresh: true, finlets: true, lobed: 'thin', tail: 'round', smooth: true, where: 'atlantic' }),
  F({ id: 'gar', name: 'Gar', kind: 'fish', price: 48, kg: 8, len: 1.5, h: 0.16, w: 0.15, back: '#4e5a3e', side: '#9aa27a', belly: '#ece8d2', fin: '#7a7a4e', pat: 'garspots', odds: 2.5, fight: DARTER, fresh: true, bill: 0.35, jaws: true, dorsalBack: true, tail: 'round', scalesBig: true, where: 'americas' }),
  F({ id: 'bowfin', name: 'Bowfin', kind: 'fish', price: 38, kg: 3, len: 0.9, h: 0.22, w: 0.18, back: '#4a5530', side: '#7d8650', belly: '#dfe0b8', fin: '#4f6a3a', pat: 'bowfin', odds: 3, fight: STRONG, fresh: true, longDorsal: 'full', tail: 'round', where: 'americas' }),
  F({ id: 'snakehead', name: 'Snakehead', kind: 'fish', price: 36, kg: 5, len: 1.0, h: 0.2, w: 0.18, back: '#3a3a2a', side: '#6a6a4a', belly: '#d2cdb0', fin: '#4a4a36', pat: 'snake', odds: 4, fight: STRONG, fresh: true, longDorsal: 'full', tail: 'round', flatHead: true, teeth: true, where: 'arabian' }),
  F({ id: 'mahseer', name: 'Mahseer', kind: 'fish', price: 90, kg: 15, len: 1.2, h: 0.3, w: 0.2, back: '#6a5a2a', side: '#d4ac4a', belly: '#f4e4b0', fin: '#c47a3a', pat: 'bigscales', odds: 1.5, fight: BIG, fresh: true, whiskers: 4, hump: 0.15, thickLips: true, where: 'arabian' }),
  F({ id: 'rohu', name: 'Rohu', kind: 'fish', price: 16, kg: 3, len: 0.9, h: 0.28, w: 0.16, back: '#5a6270', side: '#b8bcc4', belly: '#f2e6e2', fin: '#c46a5a', pat: 'redscales', odds: 9, fight: MID, fresh: true, hump: 0.08, where: 'arabian' }),
  F({ id: 'catla', name: 'Catla', kind: 'fish', price: 18, kg: 4, len: 0.95, h: 0.34, w: 0.18, back: '#4a5260', side: '#a9b0bb', belly: '#eff1f4', fin: '#5a6270', pat: 'scales', odds: 8, fight: MID, fresh: true, bigHead: true, upMouth: true, where: 'arabian' }),
  F({ id: 'mrigal', name: 'Mrigal', kind: 'fish', price: 15, kg: 2, len: 0.85, h: 0.24, w: 0.15, back: '#6a7280', side: '#c3c8d0', belly: '#f4f5f7', fin: '#d08a6a', pat: 'none', odds: 8, fight: MID, fresh: true, whiskers: 2, where: 'arabian' }),
  F({ id: 'walkingcat', name: 'Walking Catfish', kind: 'fish', price: 14, kg: 1, len: 0.7, h: 0.15, w: 0.14, back: '#4a4838', side: '#6e6a52', belly: '#c9c2a2', fin: '#55523e', pat: 'freckle', odds: 6, fight: SMALL, fresh: true, whiskers: 8, flatHead: true, longDorsal: 'full', tail: 'round', smooth: true, where: 'arabian' }),
  F({ id: 'fwstingray', name: 'Freshwater Stingray', kind: 'ray', price: 80, kg: 15, len: 0.9, h: 0.1, w: 0.9, back: '#4a3a2a', side: '#5a4834', belly: '#f0e6d8', fin: '#3e3022', pat: 'ocelli', odds: 1.5, fight: STRONG, fresh: true, disc: 'round', whip: 0.7, barb: true, where: 'americas' }),
];

// ===================================================================================================
// builders
// ===================================================================================================
export function buildSpecies(THREE, f, H) {
  const { fishShape, ss, rnd2 } = H, V3 = THREE.Vector3;
  const C = h => new THREE.Color(h), dk = C('#0c1418');
  // cheap smooth pseudo-noise (sums of sines), about -1..1
  const nz = (x, y, z, s = 1) => (Math.sin(x * 7.1 * s + Math.sin(y * 5.3 * s) * 1.7) * Math.sin(y * 6.7 * s + Math.sin(z * 4.9 * s) * 1.9) + Math.sin(z * 8.3 * s + x * 3.1 * s) * 0.5) / 1.5;
  const std = (opts = {}) => new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0.18, ...opts });
  const finMat = (col = f.fin, op = 0.88) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.5, side: THREE.DoubleSide, transparent: op < 1, opacity: op });
  const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); (parent || g).add(m); return m; };
  const g = new THREE.Group(), L = f.len, Hh = f.h, Wd = f.w;
  const cB = C(f.back), cS = C(f.side), cL = C(f.belly);

  // countershaded colour for a body vertex (y in -1..1 of the local section)
  const shade = (c, y, hard = false) => { if (hard) { if (y > 0.05) c.lerpColors(cS, cB, ss(0.05, 0.6, y)); else c.lerpColors(cL, cS, ss(-0.05, 0.05, y)); return c; }
    if (y > 0.15) c.lerpColors(cS, cB, ss(0.15, 0.75, y)); else c.lerpColors(cL, cS, ss(-0.6, 0.15, y)); return c; };

  // patterns painted on a body vertex: x along the body (-1 tail .. 1 head), y up, z side
  const paint = (c, x, y, z, pat) => {
    const top = y > -0.1, s = (a, b) => Math.sin(a) * Math.sin(b);
    switch (pat) {
      case 'whale': if (y > -0.2 && s(x * 40, y * 30 + z * 9) > 0.78) c.lerp(C('#f4f1e6'), 0.85); if (y > -0.2 && Math.abs(Math.sin(x * 20)) < 0.06) c.lerp(C('#dfe6ea'), 0.5); break;
      case 'tiger': if (y > -0.15 && Math.sin(x * 34 + Math.sin(y * 6) * 1.4) > 0.55) c.lerp(C('#3a3626'), 0.45); break;
      case 'leopard': if (y > -0.35 && s(x * 30 + z * 6, y * 26) > 0.6) c.lerp(dk, 0.6); if (y > 0.3 && Math.sin(x * 14) > 0.75) c.lerp(dk, 0.4); break;
      case 'freckle': if (top && s(x * 55 + z * 17, y * 49 - z * 23) > 0.7) c.lerp(dk, 0.5); break;
      case 'mottle': { const n = nz(x * 2.2, y * 2.2, z * 2.2, 1.4); if (n > 0.25) c.lerp(dk, 0.35); else if (n < -0.4) c.lerp(C('#f0e6d0'), 0.25); break; }
      case 'blue': if (top && s(x * 50, y * 40 + z * 13) > 0.78) c.lerp(C('#6fd0ff'), 0.85); break;
      case 'coela': if (nz(x * 1.6 + 3, y * 1.6, z * 1.6, 1.8) > 0.55) c.lerp(C('#e8eef6'), 0.8); break;
      case 'scales': if (Math.abs(Math.sin(x * 46 + Math.abs(y) * 10)) < 0.1 || Math.abs(Math.sin(y * 18 + x * 6)) < 0.08) c.multiplyScalar(0.8); break;
      case 'bigscales': if (Math.abs(Math.sin(x * 30 + Math.abs(y) * 8)) < 0.12 || Math.abs(Math.sin(y * 12 + x * 4)) < 0.1) c.lerp(C('#6a4a1a'), 0.35); break;
      case 'redscales': if (Math.abs(Math.sin(x * 40 + Math.abs(y) * 9)) < 0.12) c.lerp(C('#c4504a'), 0.45); break;
      case 'koi': { const n = nz(x * 1.3 + 1, y * 1.6, z * 0.7, 1.5); if (y > -0.2 && n > 0.0) c.lerp(C('#f05a1a'), 0.95); if (y > 0 && n < -0.55) c.lerp(C('#141414'), 0.85); break; }
      case 'faintbars': if (y > -0.4 && Math.sin(x * 22) > 0.6) c.lerp(dk, 0.18); break;
      case 'tailbars': if (y > -0.4 && Math.sin(x * 22) > 0.6) c.lerp(dk, 0.2); if (x < -0.6 && Math.sin(y * 16) > 0.4) c.lerp(C('#c4504a'), 0.4); break;
      case 'bassline': if (y > -0.2 && y < 0.25 && nz(x * 3, y * 2, z, 2) > -0.1) c.lerp(C('#1e2e14'), 0.6); break;
      case 'bronzebars': if (y > -0.5 && Math.sin(x * 26) > 0.5) c.lerp(C('#3a2a12'), 0.4); break;
      case 'brook': if (top && s(x * 46, y * 38 + z * 7) > 0.72) c.lerp(C(y > 0.25 ? '#e8dcaa' : '#d9473a'), 0.75); if (y > 0.35 && Math.sin(x * 30 + y * 12) > 0.6) c.lerp(dk, 0.3); break;
      case 'rainbow': if (Math.abs(y - 0.02) < 0.16) c.lerp(C('#e46a8a'), 0.7); if (top && s(x * 60, y * 52 + z * 9) > 0.78) c.lerp(dk, 0.7); break;
      case 'browntrout': if (top && s(x * 44, y * 36 + z * 11) > 0.74) c.lerp(C(y > 0.1 ? '#2a1e10' : '#c23a2a'), 0.8); break;
      case 'pike': if (y > -0.35 && s(x * 36 + y * 9, y * 24) > 0.62) c.lerp(C('#e6e2b0'), 0.65); break;
      case 'muskie': if (y > -0.4 && Math.sin(x * 30 + Math.sin(y * 9) * 1.2) > 0.4) c.lerp(C('#3e4a2e'), 0.55); break;
      case 'saddles': if (y > 0.05 && Math.sin(x * 16) > 0.45) c.lerp(C('#2e2a14'), 0.45); break;
      case 'perch': if (y > -0.45 && Math.sin(x * 21) > 0.45) c.lerp(C('#24301a'), 0.6); break;
      case 'crappie': if (y > -0.4 && nz(x * 3.5, y * 3.5, z * 2, 2.2) > 0.2) c.lerp(C('#1e2a1e'), 0.55); break;
      case 'bluegill': if (y > -0.3 && Math.sin(x * 20) > 0.55) c.lerp(C('#24343a'), 0.35); break;
      case 'pumpkin': if (y > -0.2 && s(x * 40, y * 34) > 0.6) c.lerp(C('#e8a23a'), 0.6); if (x > 0.45 && Math.sin(y * 30 + x * 18) > 0.7) c.lerp(C('#3ab0d8'), 0.75); break;
      case 'spangle': if (y > -0.3 && s(x * 64 + z * 19, y * 58 - z * 13) > 0.8) c.lerp(C('#f2f6fa'), 0.7); break;
      case 'arapaima': if (x < 0 && Math.abs(Math.sin(x * 34 + Math.abs(y) * 9)) < 0.18) c.lerp(C('#b8382a'), 0.75 * ss(0, -0.6, x)); break;
      case 'bands': if (Math.sin(x * 18 + y * 2) > 0.55) c.lerp(dk, 0.5); break;
      case 'garspots': if (s(x * 34 + z * 9, y * 28) > 0.72) c.lerp(dk, 0.6); break;
      case 'bowfin': if (nz(x * 3, y * 3, z * 2, 2) > 0.3) c.lerp(dk, 0.3); if (Math.hypot(x + 0.72, y - 0.18) < 0.1 && Math.abs(z) > 0.3) c.copy(dk); else if (Math.hypot(x + 0.72, y - 0.18) < 0.15 && Math.abs(z) > 0.3) c.lerp(C('#e8b83a'), 0.8); break;
      case 'snake': if (y > -0.3 && nz(x * 3.2, y * 2.4, z * 1.5, 2) > 0.15) c.lerp(dk, 0.55); break;
      case 'pleco': { const n = Math.sin(x * 60 + Math.sin(y * 14) * 2) * Math.sin(y * 40 + z * 12); if (n > 0.55) c.lerp(C('#e0c890'), 0.5); break; }
      case 'sharp': break;
      case 'shade': break;
      case 'oar': if (y > -0.6 && Math.sin(x * 70 + y * 6) > 0.85) c.lerp(C('#4a5868'), 0.6); if (y > -0.4 && s(x * 90, y * 20) > 0.82) c.lerp(dk, 0.6); break;
      case 'dots': if (y > -0.15 && Math.sin(x * 22) * Math.sin(z * 22 + x * 5) > 0.55) c.lerp(C('#3a2c16'), 0.7); break;
      case 'box': if (s(x * 34, y * 30 + z * 30) > 0.7) c.lerp(C('#141414'), 0.85); break;
      case 'cow': if (s(x * 38, y * 34 + z * 34) > 0.72) c.lerp(C('#3a8ad8'), 0.85); break;
      case 'manta': break;
      case 'bars': if (y > 0.2 && Math.sin(x * 26 + Math.sin(y * 5 + z * 3) * 2.2) > 0.25) c.lerp(dk, 0.7); break;
      case 'lines': if (y > -0.5 && Math.abs(Math.sin(y * 17)) > 0.9) c.lerp(dk, 0.45); break;
      case 'tailspot': if (Math.hypot(x + 0.72, y) < 0.12 && Math.abs(z) > 0.25) c.lerp(dk, 0.85); break;
      case 'danio': if (y > -0.55 && y < 0.55 && Math.abs(Math.sin(y * 13)) > 0.75) c.lerp(C('#2a3a9a'), 0.8); break;
      case 'clown': { const b = [0.55, 0.0, -0.6].reduce((m, bx) => Math.min(m, Math.abs(x - bx)), 9); if (b < 0.1) c.set('#f8f8f4'); else if (b < 0.13) c.set('#141414'); break; }
      case 'parrot': if (Math.abs(Math.sin(x * 40 + Math.abs(y) * 9)) < 0.12) c.lerp(C('#f2a0c0'), 0.5); if (x > 0.6 && Math.sin(y * 24 + x * 10) > 0.6) c.lerp(C('#f29a3a'), 0.6); break;
      case 'surgeon': if (x < -0.55 && x > -0.75 && y < 0.1 && y > -0.25) c.lerp(C('#f2d21a'), 0.9); if (Math.sin(y * 30 + x * 4) > 0.85) c.lerp(dk, 0.5); break;
      case 'butterfly': if (Math.abs(x - 0.55) < 0.08 && y > -0.6) c.set('#141414'); else if (y > 0.05 && x < 0.4) c.lerp(C('#f2d22a'), 0.85); if (Math.hypot(x + 0.4, y - 0.45) < 0.12 && Math.abs(z) > 0.2) c.set('#141414'); break;
      case 'goat': if (Math.abs(y - 0.02) < 0.09) c.lerp(C('#f2c41a'), 0.85); break;
      case 'grunt': if (y > -0.5 && Math.abs(Math.sin(y * 14 + x * 1.5)) > 0.82) c.lerp(C('#3a6ad8'), 0.75); break;
      case 'snook': if (Math.abs(y - 0.08) < 0.035) c.lerp(dk, 0.85); break;
      case 'bluelines': if (y > -0.4 && y < 0.5 && Math.abs(Math.sin(y * 12)) > 0.9) c.lerp(C('#3a8ae8'), 0.8); break;
      case 'grouper': if (s(x * 38 + z * 9, y * 32) > 0.62) c.lerp(C('#e8d4b8'), 0.6); else if (nz(x * 2, y * 2, z, 2) > 0.3) c.lerp(dk, 0.3); break;
      case 'archer': if (y > -0.1 && Math.abs(Math.sin(x * 9 + 0.6)) > 0.85) c.lerp(C('#1a1a14'), 0.85); break;
      case 'wrasse': if (Math.abs(y - 0.05) < 0.13 && x < 0.95) c.lerp(C('#141418'), 0.9 * ss(0.95, 0.2, x)); break;
      case 'charspots': if (y > -0.4 && s(x * 44, y * 36 + z * 11) > 0.74) c.lerp(C(y > 0.2 ? '#e8e4d8' : '#f07a5a'), 0.8); break;
      default: break;
    }
    return c;
  };

  // a body from a deformed sphere: prof(u) gives { h, w, y } multipliers along the length (u 0 tail .. 1 head)
  const bodyGeo = (len, hh, ww, prof, colour, segs = 64) => {
    const geo = new THREE.SphereGeometry(1, segs, Math.round(segs / 2)), p = geo.attributes.position, col = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (x + 1) / 2, q = prof(u, y, z);
      p.setXYZ(i, x * len / 2 + (q.dx || 0), (y * q.h + (q.y || 0)) * hh / 2, z * q.w * ww / 2);
      colour(c, x, y, z, u); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); return geo;
  };
  const eyes = (x, y, z, r, iris = '#d9c98e', glow = false) => {
    const im = new THREE.MeshStandardMaterial({ color: iris, metalness: 0.5, roughness: 0.25, emissive: glow ? iris : '#000', emissiveIntensity: glow ? 0.6 : 0 }), pm = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.05 });
    [-1, 1].forEach(s => { mesh(new THREE.SphereGeometry(r, 14, 10), im, x, y, s * z); mesh(new THREE.SphereGeometry(r * 0.62, 12, 8), pm, x + r * 0.1, y, s * (z + r * 0.5)); });
  };
  const cone = (r, h, mat, x, y, z, rx = 0, ry = 0, rz = 0, seg = 8, parent) => { const m = mesh(new THREE.ConeGeometry(r, h, seg), mat, x, y, z, parent); m.rotation.set(rx, ry, rz); return m; };
  const whiskers = (n, x, y, len, mat) => { for (let k = 0; k < n; k++) { const s = k % 2 ? 1 : -1, row = Math.floor(k / 2), a = 0.5 + row * 0.35;
    const curve = new THREE.QuadraticBezierCurve3(new V3(x, y - row * Hh * 0.05, s * Wd * 0.12), new V3(x + len * 0.3, y - len * 0.25 - row * 0.02, s * (Wd * 0.25 + len * 0.3 * a)), new V3(x - len * 0.15, y - len * (0.55 + row * 0.15), s * (Wd * 0.3 + len * 0.55 * a)));
    mesh(new THREE.TubeGeometry(curve, 10, Math.max(0.004, Hh * 0.018), 5), mat); } };

  if (f.kind === 'shark') buildShark(); else if (f.kind === 'ray') buildRay(); else if (f.kind === 'horse') buildHorse(); else if (f.kind === 'eel') buildEel();
  else if (f.kind === 'angler') buildAngler(); else if (f.kind === 'mola') buildMola(); else if (f.kind === 'box') buildBox(); else if (f.kind === 'spiny') buildSpiny(); else if (f.kind === 'blob') buildBlob(); else buildBony();
  if (f.photo) photophores();
  return g;

  // ---------------------------------------------------------------------------------------- sharks
  function buildShark() {
    const flat = f.flatHead, prof = u => {
      let h = 0.22 + 0.78 * ss(0, 0.42, u), w = 0.2 + 0.8 * ss(0, 0.4, u);
      if (f.snout === 'flat') { h *= 1 - 0.35 * ss(0.8, 1, u); w *= 1 - 0.05 * ss(0.85, 1, u); }
      else if (f.snout === 'blunt' || f.snout === 'round') { h *= 1 - 0.45 * ss(0.82, 1, u); w *= 1 - 0.35 * ss(0.82, 1, u); }
      else { h *= 1 - 0.65 * ss(0.72, 1, u); w *= 1 - 0.6 * ss(0.72, 1, u); }
      if (flat) { w *= 1 + 0.3 * ss(0.5, 0.9, u); h *= 1 - 0.25 * ss(0.6, 1, u); }
      return { h, w, y: 0.12 * ss(0.75, 1, u) };
    };
    const geo = bodyGeo(L, Hh, Wd, prof, (c, x, y, z, u) => { shade(c, y, f.pat === 'sharp'); paint(c, x, y, z, f.pat);
      if (u > 0.68 && u < 0.8 && Math.abs(z) > 0.55 && y > -0.35 && y < 0.35 && Math.abs(Math.sin(u * 140)) < (f.gape ? 0.3 : 0.16)) c.multiplyScalar(0.55); // gill slits
      if (u > 0.93 && y < -0.1) c.multiplyScalar(0.7);
      if (f.collar && u > 0.66 && u < 0.72 && y < 0.2) c.set('#1a1410'); }); // cookiecutter: the dark collar
    mesh(geo, std({ vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    const fm = finMat(f.fin, 1), dh = Hh * 0.95 * (f.dorsalH || 1), tip = f.tips ? finMat(f.tips, 1) : fm, R = f.roundFins;
    // first dorsal: a swept triangle (rounded for nurse / goblin)
    const dx = f.dorsalBack ? -0.12 * L : 0.06 * L;
    const d1 = mesh(fishShape(R ? [[dx + 0.12 * L, 0], [dx + 0.02 * L, dh * 0.7, dx + 0.12 * L, dh * 0.8], [dx - 0.1 * L, 0.02, dx - 0.06 * L, dh * 0.5]] : [[dx + 0.13 * L, 0], [dx - 0.02 * L, dh, dx + 0.06 * L, dh * 0.7], [dx - 0.04 * L, dh * 0.85], [dx - 0.1 * L, 0.02, dx - 0.07 * L, dh * 0.3]]), tip, 0, Hh * 0.42);
    d1.renderOrder = 1;
    mesh(fishShape([[-0.22 * L, 0], [-0.27 * L, dh * 0.3], [-0.32 * L, 0.01]]), fm, 0, Hh * 0.2);
    mesh(fishShape([[-0.24 * L, 0], [-0.29 * L, -dh * 0.25], [-0.33 * L, -0.01]]), fm, 0, -Hh * 0.2);
    // pectorals: big swept wings, down and back
    [-1, 1].forEach(s => { const pg = fishShape(R ? [[0, 0], [-0.2 * L, -0.04 * L, -0.12 * L, 0.02], [-0.1 * L, -0.02 * L], [0.03 * L, -0.02 * L]] : [[0, 0], [-0.24 * L, -0.02 * L], [-0.16 * L, -0.06 * L, -0.12 * L, -0.02 * L], [0.05 * L, -0.03 * L]]);
      const pm = mesh(pg, tip, 0.18 * L, -Hh * 0.3, s * Wd * 0.38); pm.rotation.set(s * -1.25, s * -0.35, -0.25);
      const pv = mesh(fishShape([[0, 0], [-0.08 * L, -0.02 * L], [-0.03 * L, -0.03 * L]]), fm, -0.12 * L, -Hh * 0.34, s * Wd * 0.18); pv.rotation.set(s * -1.1, 0, -0.2); });
    // tail: heterocercal (upper lobe longer); lunate for the big pelagics; a whip for the thresher
    const tg = new THREE.Group(); tg.name = 'tail'; tg.position.x = -L / 2 + L * 0.05; g.add(tg);
    const up = f.thresher ? L * 0.95 : L * (f.tail === 'lunate' ? 0.32 : 0.34), lo = f.tail === 'lunate' ? up * 0.8 : up * 0.45;
    const tl = mesh(fishShape(f.thresher ? [[0.02 * L, -0.04 * Hh], [-up, Hh * 0.9, -up * 0.5, Hh * 0.2], [-up * 0.98, Hh * 0.98], [0.03 * L, Hh * 0.14, -up * 0.5, Hh * 0.4], [-0.12 * L, -Hh * 0.5], [-0.05 * L, -Hh * 0.08]]
      : [[0.02 * L, -0.05 * Hh], [-up * 0.55, up * 0.85, -up * 0.2, up * 0.4], [-up * 0.62, up * 0.82], [-up * 0.25, 0.02, -up * 0.4, up * 0.3], [-lo * 0.55, -lo * 0.75, -lo * 0.25, -lo * 0.25], [-lo * 0.5, -lo * 0.78], [0.02 * L, 0.05 * Hh, -lo * 0.15, -lo * 0.2]]), fm, 0, 0, 0, tg);
    tl.rotation.z = f.thresher ? 0 : 0.08;
    // eyes, nostrils / mouth
    const ex = L / 2 * (f.snout === 'flat' ? 0.86 : 0.72), ey = Hh * (f.snout === 'flat' ? 0.02 : 0.1), ez = Wd / 2 * (f.snout === 'flat' ? 0.82 : 0.5);
    if (!f.hammer) eyes(ex, ey, ez, Hh * 0.045, '#1b1b1b');
    if (f.gape || f.snout === 'flat') { const mo = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI * 0.35, Math.PI * 0.3), std({ color: '#1a1416', side: THREE.DoubleSide }), L / 2 * 0.93, -Hh * 0.06, 0); mo.scale.set(L * 0.05, Hh * 0.35, Wd * 0.42); mo.rotation.z = -Math.PI / 2; }
    if (f.whiskers) whiskers(f.whiskers, L / 2 * 0.96, -Hh * 0.1, Hh * 0.35, fm);
    if (f.hammer) { const hm = mesh(new THREE.CapsuleGeometry(Hh * 0.07, Wd * 2.1, 6, 12), std({ color: f.back, roughness: 0.55 }), L / 2 * 0.9, Hh * 0.06, 0); hm.rotation.x = Math.PI / 2; hm.scale.set(1.6, 1, 0.55); eyes(L / 2 * 0.9, Hh * 0.08, Wd * 1.25, Hh * 0.05, '#1b1b1b'); }
    if (f.goblin) { const bl = cone(Hh * 0.13, L * 0.22, std({ color: '#d9a2a4', roughness: 0.5 }), L / 2 + L * 0.08, Hh * 0.12, 0, 0, 0, -Math.PI / 2, 12); bl.scale.set(1, 1, 0.55);
      const jaw = mesh(new THREE.BoxGeometry(L * 0.12, Hh * 0.06, Wd * 0.5), std({ color: '#b4787c' }), L / 2 * 0.95, -Hh * 0.18, 0); jaw.rotation.z = -0.35;
      for (let k = 0; k < 7; k++) cone(0.006, Hh * 0.06, std({ color: '#f6f0e6' }), L / 2 * 0.9 + k * 0.012, -Hh * 0.13, (k - 3) * Wd * 0.06, Math.PI, 0, 0, 4); }
    if (f.saw) { const sm = std({ color: f.side, roughness: 0.5 }), sl = L * 0.4, saw = mesh(new THREE.BoxGeometry(sl, Hh * 0.06, Wd * 0.26), sm, L / 2 + sl / 2 - L * 0.03, Hh * 0.02, 0);
      void saw; const tm = std({ color: '#f2eee2' }); for (let k = 0; k < 18; k++) [-1, 1].forEach(s => cone(0.006, Wd * 0.09, tm, L / 2 + k * sl / 18, Hh * 0.02, s * Wd * 0.17, s * Math.PI / 2, 0, 0, 4)); }
    if (f.ridges) [-1, 0, 1].forEach(r => { const rg = mesh(new THREE.CapsuleGeometry(Hh * 0.012, L * 0.6, 4, 6), std({ color: f.side }), 0, Hh * (r === 0 ? 0.47 : 0.36), r * Wd * 0.25); rg.rotation.z = Math.PI / 2; });
  }

  // ------------------------------------------------------------------------------------------ rays
  function buildRay() {
    // the disc (top view outline in x / z), extruded thin with soft edges; texture painted on a canvas
    const S = Wd, s = new THREE.Shape(), hl = L / 2;
    if (f.disc === 'round') { s.ellipse(0, 0, hl * 1.02, S / 2, 0, Math.PI * 2, false, 0); }
    else { // wings: pointed tips (manta / eagle ray)
      const tipX = f.manta ? -0.05 * L : -0.1 * L, front = f.pointy ? hl * 1.05 : hl * 0.85;
      s.moveTo(front, 0); s.quadraticCurveTo(hl * 0.6, S * 0.18, tipX + 0.04 * L, S / 2); s.quadraticCurveTo(-hl * 0.25, S * 0.26, -hl, S * 0.05);
      s.lineTo(-hl, -S * 0.05); s.quadraticCurveTo(-hl * 0.25, -S * 0.26, tipX + 0.04 * L, -S / 2); s.quadraticCurveTo(hl * 0.6, -S * 0.18, front, 0); }
    const T = Hh, geo = new THREE.ExtrudeGeometry(s, { depth: T * 0.35, bevelEnabled: true, bevelThickness: T * 0.32, bevelSize: Math.min(S, L) * 0.06, bevelSegments: 4, curveSegments: 40 });
    geo.translate(0, 0, -T * 0.175);
    // canvas texture in shape coordinates
    const cv = document.createElement('canvas'); cv.width = cv.height = 256; const x2 = cv.getContext('2d'); const ext = Math.max(L, S) * 1.2;
    x2.fillStyle = f.back; x2.fillRect(0, 0, 256, 256);
    const px = v => (v / ext + 0.5) * 256, dot = (x, y, r, col) => { x2.fillStyle = col; x2.beginPath(); x2.arc(px(x), px(y), r, 0, 7); x2.fill(); };
    let sd = 11; const rr = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    if (f.pat === 'freckle') for (let k = 0; k < 160; k++) dot((rr() - 0.5) * ext, (rr() - 0.5) * ext, 1.5 + rr() * 2, 'rgba(40,28,16,.55)');
    if (f.pat === 'eagle') for (let k = 0; k < 140; k++) dot((rr() - 0.5) * ext, (rr() - 0.5) * ext, 2 + rr() * 2.5, 'rgba(240,244,248,.9)');
    if (f.pat === 'ocelli') for (let k = 0; k < 40; k++) { const x = (rr() - 0.5) * ext * 0.8, y = (rr() - 0.5) * ext * 0.8, r = 5 + rr() * 4; dot(x, y, r, '#f2a23a'); dot(x, y, r * 0.55, '#2a1e14'); }
    if (f.pat === 'eyespots') [[0.1, 0.2], [0.1, -0.2]].forEach(([x, y]) => { dot(x * L, y * S, 18, '#1a1410'); dot(x * L, y * S, 11, '#5aa0c8'); dot(x * L, y * S, 6, '#1a1410'); });
    if (f.pat === 'manta') { x2.fillStyle = 'rgba(240,244,248,.85)'; [[1, 1], [1, -1]].forEach(([, sgn]) => { x2.beginPath(); x2.ellipse(px(0.05 * L), px(sgn * S * 0.18), 26, 12, sgn * 0.5, 0, 7); x2.fill(); }); }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(1 / ext, 1 / ext); tex.offset.set(0.5, 0.5);
    const top = std({ map: tex, roughness: 0.6, metalness: 0.05 }), rim = std({ color: f.side, roughness: 0.6 });
    const disc = mesh(geo, [top, rim]); disc.rotation.x = -Math.PI / 2; // shape y -> world -z, extrude z -> world y
    // the pale belly: a slightly smaller copy just underneath
    const belly = mesh(new THREE.ShapeGeometry(s, 40), std({ color: f.belly, roughness: 0.6, side: THREE.DoubleSide }), 0, -T * 0.52, 0); belly.rotation.x = -Math.PI / 2; belly.scale.setScalar(0.96);
    // a raised back down the middle
    const back = mesh(new THREE.SphereGeometry(1, 24, 12), std({ color: f.back, roughness: 0.6 }), 0.02 * L, T * 0.2, 0); back.scale.set(L * 0.38, T * 1.1, Math.min(S * 0.22, L * 0.3));
    // tail
    const tg = new THREE.Group(); tg.name = 'tail'; tg.position.x = -hl * 0.9; g.add(tg);
    const tm = std({ color: f.back, roughness: 0.6 });
    if (f.torpedo) { const tb = mesh(new THREE.CapsuleGeometry(T * 0.45, L * 0.3, 6, 10), tm, -L * 0.2, 0, 0, tg); tb.rotation.z = Math.PI / 2;
      [-0.1, -0.24].forEach(x => mesh(fishShape([[0, 0], [-0.05 * L, T * 1.6], [-0.1 * L, 0]]), finMat(f.back, 1), x * L - 0.05, T * 0.3, 0, tg));
      mesh(fishShape([[0, 0], [-0.12 * L, T * 1.8, -0.1 * L, T * 0.6], [-0.12 * L, -T * 1.8], [0, 0]]), finMat(f.back, 1), -L * 0.4, 0, 0, tg); }
    else { const wl = L * (f.whip || (f.manta ? 0.45 : 1)), wh = cone(T * 0.18, wl, tm, -wl / 2, 0, 0, 0, 0, Math.PI / 2, 6, tg); void wh;
      if (f.barb) cone(T * 0.06, L * 0.12, std({ color: '#d8d0bc' }), -wl * 0.3, T * 0.18, 0, 0, 0, Math.PI / 2, 4, tg); }
    // eyes on top, and the manta's cephalic fins
    eyes(hl * (f.disc === 'round' ? 0.45 : 0.7), T * 0.55, Math.min(S, L) * (f.manta ? 0.34 : 0.12), T * 0.28, f.manta ? '#1b1b1b' : '#c9b98e');
    if (f.manta) [-1, 1].forEach(s2 => { const cf = mesh(new THREE.CylinderGeometry(T * 0.3, T * 0.4, L * 0.22, 10, 1, true, 0, Math.PI), std({ color: f.back, side: THREE.DoubleSide, roughness: 0.6 }), hl * 0.95, 0, s2 * S * 0.11); cf.rotation.z = -Math.PI / 2; cf.rotation.x = s2 * 0.6; });
    if (f.pointy) { const hd = mesh(new THREE.SphereGeometry(1, 16, 10), std({ color: f.back, roughness: 0.6 }), hl * 0.95, T * 0.05, 0); hd.scale.set(L * 0.14, T * 0.9, L * 0.12); }
  }

  // ---------------------------------------------------------------------------- seahorse / pipefish
  function tubeBody(curve, radius, colour, segs = 90, ridge = 0) {
    const R0 = 1, geo = new THREE.TubeGeometry(curve, segs, R0, 14, false), p = geo.attributes.position, n = geo.attributes.normal, col = [], c = new THREE.Color(), P = new V3();
    for (let i = 0; i <= segs; i++) { const u = i / segs; curve.getPointAt(u, P); const r = radius(u) * (1 + (ridge ? ridge * Math.max(0, Math.sin(u * segs * 0.5 * Math.PI)) : 0));
      for (let j = 0; j <= 14; j++) { const k = i * 15 + j; p.setXYZ(k, P.x + (p.getX(k) - P.x) * r, P.y + (p.getY(k) - P.y) * r, P.z + (p.getZ(k) - P.z) * r);
        colour(c, u, n.getY(k), n.getZ(k)); col.push(c.r, c.g, c.b); } }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); return mesh(geo, std({ vertexColors: true, roughness: 0.45 }));
  }
  function buildHorse() {
    const colour = (c, u, ny) => { shade(c, ny * 0.8); if (Math.sin(u * 160) > 0.7) c.multiplyScalar(0.82); return c; };
    if (f.dragon) { // leafy seadragon: a long, gently curved body hung with leaf-shaped lobes
      const cv = new THREE.CatmullRomCurve3([new V3(-L * 0.48, -L * 0.18, 0), new V3(-L * 0.3, -L * 0.04, 0), new V3(-L * 0.08, L * 0.03, 0), new V3(L * 0.14, L * 0.04, 0), new V3(L * 0.28, L * 0.1, 0)]);
      tubeBody(cv, u => Hh * 0.5 * (0.2 + 0.8 * ss(0, 0.55, u)) * (1 + 0.3 * Math.exp(-Math.pow((u - 0.6) / 0.15, 2))), colour, 110, 0.18);
      const hm = std({ color: f.side, roughness: 0.45 }); const hd = cv.getPointAt(1);
      cone(Hh * 0.18, L * 0.2, hm, hd.x + L * 0.1, hd.y + L * 0.01, 0, 0, 0, -Math.PI / 2 - 0.1, 10);
      const lm = finMat(f.fin, 0.92), leaf = (sz) => fishShape([[0, 0], [sz * 0.5, sz * 0.5, sz * 0.6, sz * 0.15], [sz * 0.15, sz], [-sz * 0.25, sz * 0.6, -sz * 0.35, sz * 0.25]]);
      [[0.2, 1, 0.12], [0.35, -1, 0.16], [0.5, 1, 0.14], [0.62, -1, 0.18], [0.72, 1, 0.13], [0.82, -1, 0.1], [0.9, 1, 0.09], [0.06, -1, 0.1]].forEach(([u, sg, sz]) => {
        const P = cv.getPointAt(u); [-1, 1].forEach(side => { const lf = mesh(leaf(L * sz), lm, P.x, P.y + sg * Hh * 0.3, side * Hh * 0.2); lf.rotation.set(side * 0.5, side * 0.3, sg > 0 ? 0.3 : Math.PI - 0.3); }); });
      const t = new THREE.Object3D(); t.name = 'tail'; g.add(t);
      eyes(hd.x - L * 0.01, hd.y + Hh * 0.18, Hh * 0.38, Hh * 0.16, '#3a2a10'); return; }
    if (f.pipe) { // straight and thin, with a tube snout and a little fan tail
      const cv = new THREE.CatmullRomCurve3([new V3(-L / 2, 0, 0), new V3(-L * 0.1, 0.01, 0), new V3(L * 0.3, 0, 0), new V3(L / 2 - L * 0.08, 0.005, 0)]);
      tubeBody(cv, u => Hh * 0.5 * (0.35 + 0.65 * ss(0, 0.5, u)) * (1 - 0.25 * ss(0.85, 1, u)), colour, 90, 0.12);
      cone(Hh * 0.18, L * 0.1, std({ color: f.side }), L / 2 - L * 0.02, 0.005, 0, 0, 0, -Math.PI / 2, 8);
      const t = mesh(fishShape([[0, 0], [-L * 0.06, Hh * 0.6, -L * 0.05, 0], [-L * 0.06, -Hh * 0.6]]), finMat(f.fin), -L / 2, 0, 0); t.name = 'tail';
      mesh(fishShape([[0, 0], [-L * 0.06, Hh * 0.6], [-L * 0.12, 0]]), finMat(f.fin), -L * 0.05, Hh * 0.4, 0);
      eyes(L / 2 - L * 0.1, Hh * 0.18, Wd * 0.4, Hh * 0.18); return; }
    // seahorse: upright, the head at the top facing +x, the tail curled below
    const S = L, pts = [];
    for (let k = 0; k <= 14; k++) { const a = k / 14 * Math.PI * 1.6, r = S * 0.12 * (1 - k / 18); pts.push(new V3(S * 0.06 + Math.sin(a) * r * -1, -S * 0.5 + S * 0.14 - Math.cos(a) * r, 0)); }
    pts.reverse(); [[0.02, -0.12], [-0.06, 0.05], [-0.04, 0.2], [0.03, 0.3]].forEach(([x, y]) => pts.push(new V3(x * S, y * S, 0)));
    const cv = new THREE.CatmullRomCurve3(pts);
    tubeBody(cv, u => S * 0.1 * (0.12 + 0.88 * ss(0.15, 0.62, u)) * (1 + 0.35 * Math.exp(-Math.pow((u - 0.75) / 0.1, 2))) * (1 - 0.35 * ss(0.92, 1, u)), colour, 110, 0.14);
    // head: a sphere angled forward with the long snout, and a coronet
    const hm = std({ color: f.side, roughness: 0.45 }), head = mesh(new THREE.SphereGeometry(S * 0.075, 18, 14), hm, S * 0.06, S * 0.33, 0); head.scale.set(1.2, 0.9, 0.8);
    const sn = cone(S * 0.035, S * 0.2, hm, S * 0.19, S * 0.31, 0, 0, 0, -Math.PI / 2 - 0.15, 10); sn.scale.set(1, 1, 0.8);
    mesh(new THREE.CylinderGeometry(S * 0.022, S * 0.022, S * 0.012, 10), std({ color: '#3a2a14' }), S * 0.29, S * 0.296, 0).rotation.z = Math.PI / 2 - 0.15;
    cone(S * 0.03, S * 0.07, hm, S * 0.04, S * 0.4, 0, 0, 0, 0.25, 6);
    const fin = mesh(fishShape([[0, 0], [-S * 0.08, S * 0.04, -S * 0.06, S * 0.08], [-S * 0.01, S * 0.1]]), finMat(f.fin, 0.7), -S * 0.07, S * 0.02, 0); fin.name = 'tail';
    eyes(S * 0.1, S * 0.345, S * 0.045, S * 0.018, '#2a2010');
  }

  // ------------------------------------------------------------------------------- eel / oarfish
  function buildEel() {
    const wav = (k, a) => new V3(-L / 2 + k * L, Math.sin(k * 5) * a, Math.sin(k * 7 + 1) * L * 0.04);
    const pts = []; for (let k = 0; k <= 10; k++) pts.push(wav(k / 10, f.oar ? 0.03 : 0.02));
    const cv = new THREE.CatmullRomCurve3(pts);
    const colour = (c, u, ny, nzv) => { shade(c, ny); paint(c, u * 2 - 1, ny, nzv, f.pat); return c; };
    tubeBody(cv, u => (f.oar ? Hh * 0.5 : Hh * 0.5) * (0.12 + 0.88 * ss(0, 0.35, u)) * (1 - 0.45 * ss(0.9, 1, u)), colour, 140);
    if (f.gulper) { // a tiny body behind an enormous hinged mouth, and a whip tail with a glowing tip
      const P = cv.getPointAt(0.97), mm = std({ color: '#1a1a22', side: THREE.DoubleSide, roughness: 0.7 });
      const jaw = (sgn) => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.quadraticCurveTo(L * 0.12, sgn * Hh * 2.2, L * 0.3, sgn * Hh * 1.6); sh.lineTo(L * 0.3, 0); sh.closePath(); return new THREE.ShapeGeometry(sh, 10); };
      [-1, 1].forEach(sg => mesh(jaw(sg), mm, P.x - L * 0.08, P.y, 0));
      const sac = mesh(new THREE.SphereGeometry(1, 20, 14), std({ color: '#2a2a34', roughness: 0.6, side: THREE.DoubleSide }), P.x + L * 0.06, P.y - Hh * 0.6, 0); sac.scale.set(L * 0.13, Hh * 1.6, Hh * 1.4);
      const T0 = cv.getPointAt(0); mesh(new THREE.SphereGeometry(Hh * 0.18, 10, 8), new THREE.MeshStandardMaterial({ color: '#ff6ab0', emissive: '#ff4aa0', emissiveIntensity: 1.6 }), T0.x, T0.y, T0.z);
      eyes(P.x - L * 0.06, P.y + Hh * 0.3, Hh * 0.25, Hh * 0.12, '#1b1b1b');
    } else if (f.electric) { // no dorsal: one long anal fin ripples the whole length of the belly
      const bot = []; for (let k = 0; k <= 30; k++) { const u = 0.04 + k / 30 * 0.76, P = cv.getPointAt(u), r = Hh * 0.5 * (0.12 + 0.88 * ss(0, 0.35, u)); bot.push([P.x, P.y - r * 0.85]); }
      const fs = [...bot, ...[...bot].reverse().map(([x, y], i) => [x, y - Hh * 0.35 * Math.sin((1 - i / 30) * Math.PI * 0.9 + 0.1)])]; mesh(fishShape(fs), finMat(f.fin, 0.8));
      const P = cv.getPointAt(0.96); eyes(P.x, P.y + Hh * 0.18, Hh * 0.3, Hh * 0.06);
    } else if (f.ribbon) { // electric blue with a yellow fin and jaw, and flared nostrils
      const top = []; for (let k = 0; k <= 30; k++) { const u = 0.05 + k / 30 * 0.85, P = cv.getPointAt(u); top.push([P.x, P.y + Hh * 0.42]); }
      mesh(fishShape([...top, ...[...top].reverse().map(([x, y]) => [x, y + Hh * 0.45])]), finMat(f.fin, 0.95));
      const P = cv.getPointAt(0.97), ym = std({ color: '#f2d21a' }); cone(Hh * 0.35, L * 0.06, ym, P.x + L * 0.02, P.y - Hh * 0.18, 0, 0, 0, -Math.PI / 2, 8);
      [-1, 1].forEach(sg => { const fl = cone(Hh * 0.35, Hh * 0.6, ym, P.x + L * 0.04, P.y + Hh * 0.45, sg * Hh * 0.2, sg * 0.4, 0, -0.6, 8); fl.scale.set(1, 1, 0.5); });
      eyes(P.x - L * 0.01, P.y + Hh * 0.2, Hh * 0.35, Hh * 0.12, '#f2d21a');
    } else if (f.garden) { // pale with black spots; it stands up out of the sand in an S
      g.children[0].geometry.dispose(); g.remove(g.children[0]);
      const sc = new THREE.CatmullRomCurve3([new V3(0, -L * 0.45, 0), new V3(0.02 * L, -L * 0.15, 0), new V3(-0.04 * L, L * 0.12, 0), new V3(0.05 * L, L * 0.32, 0), new V3(0.14 * L, L * 0.4, 0)]);
      tubeBody(sc, u => Hh * 0.5 * (0.5 + 0.5 * ss(0, 0.2, u)) * (1 - 0.3 * ss(0.9, 1, u)), (c, u, ny, nzv) => { shade(c, ny * 0.4); if (Math.sin(u * 90) * Math.sin(nzv * 9) > 0.5) c.lerp(dk, 0.8); return c; }, 90);
      const P = sc.getPointAt(0.97); eyes(P.x, P.y + Hh * 0.15, Hh * 0.4, Hh * 0.18);
      mesh(new THREE.CylinderGeometry(L * 0.12, L * 0.16, L * 0.04, 20), std({ color: '#e8dcb8', roughness: 0.9 }), 0, -L * 0.45, 0); // its patch of sand
    } else if (f.oar) { // flattened ribbon: squash sideways
      g.children[0].scale.z = 0.35;
      // the red dorsal fin all down the back, and the crest plumes at the head
      const shape = []; for (let k = 0; k <= 30; k++) { const u = k / 30, P = cv.getPointAt(u); shape.push([P.x, P.y + Hh * 0.42 + Hh * 0.16 * (0.5 + 0.5 * Math.sin(u * 90))]); }
      for (let k = 30; k >= 0; k--) { const u = k / 30, P = cv.getPointAt(u); shape.push([P.x, P.y + Hh * 0.38]); }
      mesh(fishShape(shape), finMat('#e8313b', 0.9));
      const pm = finMat('#e8313b', 0.95); for (let k = 0; k < 6; k++) { const P = cv.getPointAt(0.95 - k * 0.012); const pl = mesh(fishShape([[0, 0], [-0.04 * L, Hh * (1.4 + k * 0.3)], [-0.02 * L, 0]]), pm, P.x, P.y + Hh * 0.4, 0); pl.rotation.z = 0.5 - k * 0.12; }
      const P = cv.getPointAt(0.96); eyes(P.x + L * 0.01, P.y + Hh * 0.06, Hh * 0.12, Hh * 0.08, '#d9d0b0');
      const pv = finMat('#e8313b', 0.9); [-1, 1].forEach(s => { const r = mesh(new THREE.CylinderGeometry(0.004, 0.003, L * 0.18, 4), pv, P.x - L * 0.06, P.y - Hh * 0.5, s * Hh * 0.08); r.rotation.z = 1.2; });
    } else { // eel: the dorsal and anal fins run back and join round the tail
      const top = [], bot = []; for (let k = 0; k <= 30; k++) { const u = k / 30 * 0.62, P = cv.getPointAt(u), r = Hh * 0.5 * (0.12 + 0.88 * ss(0, 0.35, u)); top.push([P.x, P.y + r * 0.9 + Hh * 0.22 * ss(0, 0.2, u)]); bot.push([P.x, P.y - r * 0.9 - Hh * 0.18 * ss(0, 0.2, u)]); }
      const fs = [...top, ...[...bot].reverse()]; mesh(fishShape(fs), finMat(f.fin, 0.85));
      const P = cv.getPointAt(0.95); eyes(P.x, P.y + Hh * 0.12, Hh * 0.2, Hh * 0.08);
      [-1, 1].forEach(s => { const pec = mesh(fishShape([[0, 0], [-0.04 * L, Hh * 0.2, -0.03 * L, Hh * 0.3], [-0.03 * L, -Hh * 0.1]]), finMat(f.fin), cv.getPointAt(0.86).x, cv.getPointAt(0.86).y - Hh * 0.05, s * Hh * 0.42); pec.rotation.y = s * 0.5; });
    }
    const t = new THREE.Object3D(); t.name = 'tail'; g.add(t);
  }

  // ------------------------------------------------------------------------------------ anglerfish
  function buildAngler() {
    const round = f.round || f.frog;
    const geo = bodyGeo(L, Hh, Wd, (u, y) => { if (round) return { h: 0.5 + 0.5 * ss(0, 0.4, u), w: 0.5 + 0.5 * ss(0, 0.4, u), y: 0 }; const head = ss(0.25, 0.75, u); return { h: 0.35 + 0.65 * head * (y < 0 ? 1.1 : 1), w: 0.3 + 0.7 * head, y: 0 }; },
      (c, x, y, z) => { c.lerpColors(cS, cB, ss(-0.3, 0.6, y)); if (nz(x * 3, y * 3, z * 3, 2) > 0.4) c.multiplyScalar(0.75); });
    mesh(geo, std({ vertexColors: true, roughness: 0.7, metalness: 0.05 }));
    // the gaping mouth: a dark wedge across the front, ringed with needle teeth
    const mo = mesh(new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.2), std({ color: '#120c0a', side: THREE.DoubleSide, roughness: 0.9 }), L / 2 * 0.92, -Hh * 0.02, 0); mo.scale.set(L * 0.08, Hh * 0.42, Wd * 0.48); mo.rotation.z = -Math.PI / 2 + 0.25;
    if (f.frog) { const p = g.children[0].geometry.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.09 * (nz(p.getX(i) * 12, p.getY(i) * 12, p.getZ(i) * 12, 1.4) + 0.3); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } g.children[0].geometry.computeVertexNormals();
      [-1, 1].forEach(s2 => { const arm = mesh(new THREE.CapsuleGeometry(Hh * 0.06, Hh * 0.3, 4, 8), std({ color: f.side, roughness: 0.6 }), L * 0.12, -Hh * 0.42, s2 * Wd * 0.42); arm.rotation.set(s2 * 0.4, 0, 0.5);
        const hand = mesh(fishShape([[0, 0], [-0.08 * L, -Hh * 0.12, -0.02 * L, -Hh * 0.18], [-0.1 * L, 0]]), finMat(f.fin, 1), L * 0.06, -Hh * 0.62, s2 * Wd * 0.5); hand.rotation.y = s2 * 0.3; }); }
    if (f.bumps) { const bm = std({ color: f.side, roughness: 0.6 }), UP2 = new V3(0, 1, 0); for (let k = 0; k < 70; k++) { const n = new V3(rnd2() * 2 - 1, rnd2() * 2 - 1, rnd2() * 2 - 1).normalize(); if (n.x > 0.7) continue;
      const m = mesh(new THREE.ConeGeometry(Hh * 0.03, Hh * 0.08, 5), bm, n.x * L / 2, n.y * Hh / 2, n.z * Wd / 2); m.quaternion.setFromUnitVectors(UP2, n); } }
    const tm = std({ color: '#efe8d8', roughness: 0.3 });
    if (!f.frog) for (let k = 0; k < 16; k++) { const a = (k / 15 - 0.5) * 2.2, z = Math.sin(a) * Wd * 0.4, xx = L / 2 * 0.9 - (1 - Math.cos(a)) * L * 0.08;
      cone(0.008, Hh * (0.12 + (k % 3) * 0.04), tm, xx, Hh * 0.16, z, Math.PI, 0, 0, 4); cone(0.008, Hh * (0.14 + (k % 2) * 0.05), tm, xx + 0.01, -Hh * 0.2, z, 0, 0, 0, 4); }
    // the lure: a thin rod from the forehead, a glowing bulb at the end
    const rod = new THREE.QuadraticBezierCurve3(new V3(L * 0.22, Hh * 0.42, 0), new V3(L * 0.4, Hh * 0.95, 0), new V3(L * 0.62, Hh * 0.7, 0));
    mesh(new THREE.TubeGeometry(rod, 12, 0.008, 5), std({ color: '#4a3a30' }));
    mesh(new THREE.SphereGeometry(Hh * 0.08, 14, 10), f.frog ? std({ color: '#f2f0e0', roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: '#c8fff4', emissive: '#7ff0e0', emissiveIntensity: 1.6, roughness: 0.2 }), L * 0.62, Hh * 0.66, 0); // frogfish: a little white tassel, not a light
    const t = mesh(fishShape([[0, 0], [-L * 0.16, Hh * 0.3, -L * 0.12, 0], [-L * 0.16, -Hh * 0.3]]), finMat(f.fin), -L / 2 + L * 0.04, 0, 0); t.name = 'tail';
    [-1, 1].forEach(s => { const p = mesh(fishShape([[0, 0], [-0.12 * L, Hh * 0.12, -0.1 * L, 0], [-0.08 * L, -Hh * 0.16]]), finMat(f.fin), 0, -Hh * 0.1, s * Wd * 0.4); p.rotation.y = s * 0.6; });
    eyes(L * 0.26, Hh * 0.26, Wd * 0.3, Hh * 0.035, '#a8a088');
  }

  // --------------------------------------------------------------------------------- ocean sunfish
  function buildMola() {
    const geo = bodyGeo(L, Hh, Wd, (u) => ({ h: 0.78 + 0.22 * ss(0, 0.35, u) * (1 - 0.35 * ss(0.85, 1, u)), w: 0.6 + 0.4 * ss(0, 0.5, u), y: 0 }),
      (c, x, y, z) => { shade(c, y); paint(c, x, y, z, f.pat); });
    mesh(geo, std({ vertexColors: true, roughness: 0.6, metalness: 0.05 }));
    const fm = finMat(f.fin, 1);
    // tall dorsal and anal fins swept back, set well toward the rear
    mesh(fishShape([[-0.1 * L, 0], [-0.3 * L, Hh * 0.78, -0.14 * L, Hh * 0.5], [-0.42 * L, Hh * 0.7], [-0.4 * L, 0]]), fm, 0, Hh * 0.36);
    mesh(fishShape([[-0.1 * L, 0], [-0.3 * L, -Hh * 0.78, -0.14 * L, -Hh * 0.5], [-0.42 * L, -Hh * 0.7], [-0.4 * L, 0]]), fm, 0, -Hh * 0.36);
    // the clavus: a scalloped frill where a tail would be
    const cl = []; for (let k = 0; k <= 16; k++) { const a = -Math.PI / 2 + k / 16 * Math.PI; cl.push([-Math.cos(a) * L * 0.1 - (k % 2 ? L * 0.035 : 0), Math.sin(a) * Hh * 0.42]); } cl.push([L * 0.06, Hh * 0.42], [L * 0.06, -Hh * 0.42]);
    const t = mesh(fishShape(cl), fm, -L / 2 + L * 0.02, 0, 0); t.name = 'tail';
    mesh(new THREE.TorusGeometry(Hh * 0.04, Hh * 0.012, 8, 14), std({ color: '#3a3a3a' }), L / 2 * 0.98, -Hh * 0.02, 0).rotation.y = Math.PI / 2;
    [-1, 1].forEach(s => { const p = mesh(fishShape([[0, 0], [-0.08 * L, Hh * 0.08], [-0.06 * L, -Hh * 0.06]]), fm, L * 0.18, -Hh * 0.02, s * Wd * 0.3); p.rotation.y = s * 0.5; });
    eyes(L / 2 * 0.72, Hh * 0.1, Wd * 0.38, Hh * 0.05);
  }

  // -------------------------------------------------------------------------------- boxfish / cowfish
  function buildBox() {
    const geo = new THREE.SphereGeometry(1, 48, 32), p = geo.attributes.position, col = [], c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const u = (x + 1) / 2;
      // push the cross-section toward a rounded square, the back end tapering into the tail stalk
      const m = Math.max(Math.abs(y), Math.abs(z), 1e-3), k = 0.55 * ss(0.15, 0.4, u) * (1 - 0.35 * ss(0.85, 1, u));
      y = y * (1 - k) + (y / m) * Math.hypot(y, z) * k; z = z * (1 - k) + (z / m) * Math.hypot(y, z) * k;
      const taper = 0.35 + 0.65 * ss(0, 0.32, u);
      p.setXYZ(i, x * L / 2, y * taper * Hh / 2 * (y < 0 ? 1.08 : 1), z * taper * Wd / 2);
      shade(c, y); paint(c, x, y, z, f.pat); col.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals(); mesh(geo, std({ vertexColors: true, roughness: 0.35 }));
    const fm = finMat(f.fin, 0.8);
    const t = mesh(fishShape([[L * 0.02, 0], [-L * 0.2, Hh * 0.35, -L * 0.24, 0], [-L * 0.2, -Hh * 0.35]]), fm, -L / 2 + L * 0.06, 0, 0); t.name = 'tail';
    mesh(fishShape([[0, 0], [-0.08 * L, Hh * 0.22], [-0.12 * L, 0]]), fm, -0.12 * L, Hh * 0.42);
    mesh(fishShape([[0, 0], [-0.08 * L, -Hh * 0.22], [-0.12 * L, 0]]), fm, -0.12 * L, -Hh * 0.42);
    [-1, 1].forEach(s => { const pc = mesh(fishShape([[0, 0], [-0.08 * L, Hh * 0.12], [-0.05 * L, -Hh * 0.1]]), fm, L * 0.2, -Hh * 0.05, s * Wd * 0.48); pc.rotation.y = s * 0.6; });
    mesh(new THREE.TorusGeometry(Hh * 0.04, Hh * 0.02, 8, 12), std({ color: '#e28a6a' }), L / 2 * 0.99, -Hh * 0.08, 0).rotation.y = Math.PI / 2;
    if (f.horns) { const hm = std({ color: f.side }); [-1, 1].forEach(s => { cone(Hh * 0.05, Hh * 0.35, hm, L * 0.38, Hh * 0.38, s * Wd * 0.2, 0, 0, -1.25, 8); cone(Hh * 0.04, Hh * 0.28, hm, -L * 0.32, -Hh * 0.3, s * Wd * 0.25, 0, 0, 2.4, 8); }); }
    eyes(L / 2 * 0.6, Hh * 0.18, Wd * 0.42, Hh * 0.08);
  }

  // -------------------------------------------------------------------------------- porcupinefish
  function buildSpiny() {
    const geo = bodyGeo(L, Hh, Wd, () => ({ h: 1, w: 1 }), (c, x, y, z) => { shade(c, y); paint(c, x, y, z, f.pat); });
    mesh(geo, std({ vertexColors: true, roughness: 0.4 }));
    const spM = std({ color: '#efe3b8', roughness: 0.6 }), sp = new THREE.ConeGeometry(0.014, 0.12, 5), UP = new V3(0, 1, 0);
    for (let k = 0; k < 140; k++) { const n = new V3(rnd2() * 2 - 1, rnd2() * 2 - 1, rnd2() * 2 - 1).normalize(); if (n.x > 0.85 || n.x < -0.85) continue;
      const m = mesh(sp, spM, n.x * L / 2, n.y * Hh / 2, n.z * Wd / 2); m.quaternion.setFromUnitVectors(UP, new V3(n.x / L, n.y / Hh, n.z / Wd).normalize()); m.translateY(0.05); }
    const fm = finMat(f.fin, 0.85);
    const t = mesh(fishShape([[0, 0], [-L * 0.14, Hh * 0.25, -L * 0.16, 0], [-L * 0.14, -Hh * 0.25]]), fm, -L / 2 + L * 0.02, 0, 0); t.name = 'tail';
    [-1, 1].forEach(s => { const pc = mesh(fishShape([[0, 0], [-0.08 * L, Hh * 0.12], [-0.06 * L, -Hh * 0.1]]), fm, L * 0.2, 0, s * Wd * 0.48); pc.rotation.y = s * 0.6; });
    eyes(L / 2 * 0.62, Hh * 0.12, Wd * 0.36, Hh * 0.11, '#3a8a4a');
  }

  // ------------------------------------------------------------------------------------ blobfish
  function buildBlob() { // a soft, sagging pink body with a drooping nose and a sad mouth
    const geo = bodyGeo(L, Hh, Wd, (u, y) => ({ h: (0.3 + 0.7 * ss(0, 0.55, u)) * (y < 0 ? 1.15 : 0.9), w: 0.3 + 0.7 * ss(0, 0.5, u), y: -0.18 * ss(0.5, 1, u) * (y > 0 ? 1 : 0.4) }),
      (c, x, y, z) => { c.lerpColors(cL, cB, ss(-0.5, 0.6, y)); if (nz(x * 4, y * 4, z * 4, 1.2) > 0.5) c.multiplyScalar(0.94); }, 56);
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); if (y < 0) p.setY(i, y * (1 + 0.25 * Math.sin((x / L + 0.5) * Math.PI))); } geo.computeVertexNormals();
    mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, emissive: '#3a1414', emissiveIntensity: 0.25 }));
    const nm = new THREE.MeshStandardMaterial({ color: f.back, roughness: 0.5, emissive: '#3a1414', emissiveIntensity: 0.25 });
    const nose = mesh(new THREE.SphereGeometry(1, 20, 14), nm, L * 0.45, -Hh * 0.02, 0); nose.scale.set(L * 0.12, Hh * 0.3, Wd * 0.22);
    const mo = mesh(new THREE.TorusGeometry(Wd * 0.2, Hh * 0.025, 6, 20, Math.PI), std({ color: '#b86a6a' }), L * 0.42, -Hh * 0.3, 0); mo.rotation.set(0, Math.PI / 2, 0);
    const fm = finMat(f.fin, 0.85), t = mesh(fishShape([[0, 0], [-L * 0.16, Hh * 0.22, -L * 0.14, 0], [-L * 0.16, -Hh * 0.22]]), fm, -L / 2 + L * 0.04, -Hh * 0.05, 0); t.name = 'tail';
    [-1, 1].forEach(s => { const pc = mesh(fishShape([[0, 0], [-0.12 * L, Hh * 0.1], [-0.1 * L, -Hh * 0.14]]), fm, L * 0.05, -Hh * 0.15, s * Wd * 0.45); pc.rotation.y = s * 0.6; });
    eyes(L * 0.34, Hh * 0.12, Wd * 0.3, Hh * 0.05, '#2a1a1a');
  }

  // photophores: two rows of small lights along the belly (deep-sea fish, the cookiecutter's glow)
  function photophores() {
    const gm = new THREE.MeshStandardMaterial({ color: f.photo, emissive: f.photo, emissiveIntensity: 1.8, roughness: 0.3 }), n = Math.round(10 + L * 10), dotR = Math.max(0.004, Hh * 0.035);
    for (let k = 0; k < n; k++) { const u = 0.12 + k / (n - 1) * 0.72, x = (u - 0.5) * L, prof = 0.3 + 0.7 * ss(0, 0.5, u);
      const yb = -Hh / 2 * prof * (f.keel ? 1 + 1.1 * Math.sin(Math.min(1, u * 1.25) * Math.PI) * ss(0.15, 0.55, u) : 1) * 0.92;
      [-1, 1].forEach(s => { mesh(new THREE.SphereGeometry(dotR, 6, 4), gm, x, yb * 0.92, s * Wd / 2 * prof * 0.42); mesh(new THREE.SphereGeometry(dotR * 0.8, 6, 4), gm, x, yb * 0.55, s * Wd / 2 * prof * 0.8); }); }
  }

  // ------------------------------------------------------------------------------------ bony fish
  function buildBony() {
    const prof = (u, y) => {
      let h = 0.3 + 0.7 * ss(0, 0.5, u), w = h;
      if (f.flatHead) { w *= 1 + 0.25 * ss(0.6, 0.95, u); h *= 1 - 0.25 * ss(0.7, 1, u); }
      if (f.bigHead) { h *= 1 + 0.12 * ss(0.6, 0.85, u); w *= 1 + 0.12 * ss(0.6, 0.85, u); }
      if (f.duck) { h *= 1 - 0.45 * ss(0.8, 1, u); w *= 1 - 0.15 * ss(0.8, 1, u); }
      if (f.snoutCone) { h *= 1 - 0.5 * ss(0.82, 1, u); w *= 1 - 0.5 * ss(0.82, 1, u); }
      const hump = y > 0 ? 1 + (f.hump || 0) * Math.sin(u * Math.PI) : 1;
      if (f.keel && y < 0) h *= 1 + 1.3 * Math.sin(Math.min(1, u * 1.25) * Math.PI) * ss(0.15, 0.55, u); // hatchetfish: the deep, thin belly
      if (f.swallow && y < 0) { const b = Math.exp(-Math.pow((u - 0.48) / 0.16, 2)); h *= 1 + 1.6 * b; w *= 1 + 1.2 * b; } // a whole meal in the stomach
      if (f.knife && y < 0) h *= 1 + 0.2 * ss(0.3, 0.7, u); // featherbacks: the belly deepens toward the long anal fin
      return { h: h * hump, w, y: f.flatHead && y < 0 ? 0.15 * ss(0.6, 1, u) : 0 };
    };
    const geo = bodyGeo(L, Hh, Wd, prof, (c, x, y, z, u) => { shade(c, y); paint(c, x, y, z, f.pat);
      if (Math.abs(u - 0.78) < 0.012 && !f.smooth) c.multiplyScalar(0.6); if (u > 0.8) c.multiplyScalar(0.94);
      if (f.plates && u < 0.78 && (Math.abs(Math.sin(x * 30)) < 0.07 || Math.abs(y) < 0.03)) c.multiplyScalar(0.72); }); // armour plate seams
    if (f.warty) { const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + f.warty * 0.12 * (nz(x * 9, y * 9, z * 9, 1.6) + 0.3);
      p.setXYZ(i, x, y * k, z * k); } geo.computeVertexNormals(); }
    const glass = !!f.glass;
    mesh(geo, std({ vertexColors: true, metalness: f.shine ? 0.45 : f.smooth ? 0.05 : 0.22, roughness: f.smooth ? 0.55 : 0.28, transparent: glass, opacity: glass ? (f.glass === 'pink' ? 0.72 : 0.42) : 1, depthWrite: !glass }));
    if (glass) { // see-through: the spine, ribs and a silvery gut show inside
      const bm = std({ color: f.glass === 'pink' ? '#d89a98' : '#e8eef0', roughness: 0.4 }); const sp = mesh(new THREE.CylinderGeometry(Hh * 0.025, Hh * 0.015, L * 0.82, 6), bm, -L * 0.04, Hh * 0.04, 0); sp.rotation.z = Math.PI / 2;
      for (let k = 0; k < 9; k++) { const r = mesh(new THREE.CylinderGeometry(Hh * 0.008, Hh * 0.008, Hh * 0.6, 4), bm, L * 0.22 - k * L * 0.06, -Hh * 0.08, 0); r.rotation.z = 0.25; }
      mesh(new THREE.SphereGeometry(Hh * 0.22, 14, 10), std({ color: '#c8d4dc', metalness: 0.7, roughness: 0.2 }), L * 0.12, -Hh * 0.12, 0).scale.set(1.6, 1, 0.7); }
    const fm = finMat(f.redFins ? '#e0752e' : f.fin, f.fins === 'flowing' ? 0.7 : 0.88), Hd = Hh * (f.fins === 'flowing' ? 0.4 : 0.32);
    // tail
    const Lt = L * (f.tail === 'veil' ? 0.38 : f.tail === 'lobed' ? 0.2 : 0.22), T = Hh * (f.tail === 'veil' ? 1.1 : 0.78);
    const tailPts = f.tail === 'round' ? [[L * 0.03, -0.08 * T], [-Lt * 0.9, -T * 0.42, -Lt * 0.6, -T * 0.55], [-Lt, T * 0.42, -Lt * 1.25, 0], [L * 0.03, 0.08 * T, -Lt * 0.6, T * 0.55]]
      : f.tail === 'point' ? [[L * 0.03, -0.1 * T], [-Lt * 1.3, 0], [L * 0.03, 0.1 * T]]
      : f.tail === 'lobed' ? [[L * 0.03, -0.06 * T], [-Lt * 0.8, -T * 0.6], [-Lt * 0.75, -T * 0.08], [-Lt * 1.15, 0, -Lt, -0.05], [-Lt * 0.75, T * 0.08], [-Lt * 0.8, T * 0.6], [L * 0.03, 0.06 * T]]
      : f.tail === 'hetero' ? [[L * 0.03, -0.05 * T], [-Lt * 0.6, -T * 0.4], [-Lt * 0.3, 0.02, -Lt * 0.4, -T * 0.05], [-Lt * 1.3, T * 0.75], [L * 0.03, 0.12 * T, -Lt * 0.5, T * 0.2]]
      : f.tail === 'veil' ? [[L * 0.03, -0.06 * T], [-Lt, -T * 0.6, -Lt * 0.6, -T * 0.7], [-Lt * 0.8, 0, -Lt * 1.15, -T * 0.2], [-Lt, T * 0.6, -Lt * 1.15, T * 0.2], [L * 0.03, 0.06 * T, -Lt * 0.6, T * 0.7]]
      : f.tail === 'lunate' ? [[L * 0.03, -0.05 * T], [-Lt * 0.9, -T * 0.75, -Lt * 0.3, -T * 0.45], [-Lt * 0.55, 0, -Lt * 0.75, -T * 0.4], [-Lt * 0.9, T * 0.75, -Lt * 0.75, T * 0.4], [L * 0.03, 0.05 * T, -Lt * 0.3, T * 0.45]]
      : f.tail === 'trunc' ? [[L * 0.03, -0.08 * T], [-Lt * 0.85, -T * 0.5, -Lt * 0.4, -T * 0.5], [-Lt * 0.9, T * 0.5, -Lt * 1.0, 0], [L * 0.03, 0.08 * T, -Lt * 0.4, T * 0.5]]
      : f.knife ? [[L * 0.03, -0.05 * T], [-Lt * 0.5, -T * 0.25, -Lt * 0.4, 0], [-Lt * 0.5, T * 0.25], [L * 0.03, 0.05 * T]]
      : f.lowLobe ? [[L * 0.03, -0.06 * T], [-Lt * 1.25, -T * 0.7], [-Lt * 0.4, 0, -Lt * 0.6, -T * 0.2], [-Lt * 0.95, T * 0.5], [L * 0.03, 0.06 * T]]
      : [[L * 0.03, -0.06 * T], [-Lt, -T * 0.55], [-Lt, T * 0.55, -Lt * 0.45, 0], [L * 0.03, 0.06 * T]];
    const tail = mesh(fishShape(tailPts), fm, -L / 2 + L * 0.04, f.tail === 'hetero' ? Hh * 0.05 : 0, 0); tail.name = 'tail';
    // dorsal fins
    const top = Hh / 2 * 0.88 * (1 + (f.hump || 0));
    const ld = f.longDorsal;
    if (ld === 'full') mesh(fishShape([[0.28 * L, 0], [0.2 * L, Hd * 0.7], [-0.4 * L, Hd * 0.6], [-0.42 * L, -0.01]]), fm, 0, top * 0.95);
    else if (ld === 'rear') mesh(fishShape([[-0.05 * L, 0], [-0.12 * L, Hd * 0.8], [-0.42 * L, Hd * 0.5], [-0.44 * L, 0]]), fm, 0, top * 0.8);
    else if (ld === 'sail') mesh(fishShape([[0.22 * L, 0], [0.12 * L, Hd * 1.8, 0.24 * L, Hd * 1.6], [-0.12 * L, Hd * 0.7], [-0.18 * L, 0]]), fm, 0, top * 0.92);
    else if (ld === 'carp') mesh(fishShape([[0.16 * L, 0], [0.1 * L, Hd * 1.1], [-0.25 * L, Hd * 0.35], [-0.28 * L, 0]]), fm, 0, top * 0.92);
    else if (ld === 'twin') { mesh(fishShape([[0.2 * L, 0], [0.12 * L, Hd * 1.1], [-0.02 * L, Hd * 0.4], [-0.02 * L, 0]]), fm, 0, top * 0.92); mesh(fishShape([[-0.05 * L, 0], [-0.1 * L, Hd * 0.85], [-0.26 * L, Hd * 0.3], [-0.26 * L, 0]]), fm, 0, top * 0.85); }
    else if (ld === 'spiny' || f.spiny) { const sm = finMat(f.fin, 0.7), x0 = 0.22 * L, x1 = -0.2 * L, n = 10;
      const pts = [[x0, 0]]; for (let k = 0; k <= n; k++) { const x = x0 + (x1 - x0) * k / n, hk = Hd * (k < n * 0.5 ? 1.25 : 0.95) * (0.7 + 0.3 * Math.sin(k / n * Math.PI)); pts.push([x + 0.012 * L, hk * 0.75], [x, hk]); } pts.push([x1 - 0.06 * L, 0]); mesh(fishShape(pts), sm, 0, top * 0.92); }
    else if (ld === 'none') { /* no dorsal fin */ }
    else if (f.tinyDorsal) mesh(fishShape([[0.02 * L, 0], [-0.02 * L, Hd * 0.6], [-0.08 * L, 0]]), fm, 0, top * 0.98);
    else if (!f.dorsalBack) mesh(fishShape([[0.17 * L, 0], [0.07 * L, Hd], [-0.17 * L, 0.02, -0.04 * L, Hd * 0.55]]), fm, 0, top);
    if (f.dorsalBack) mesh(fishShape([[-0.2 * L, 0], [-0.28 * L, Hd * 0.9], [-0.36 * L, 0]]), fm, 0, top * 0.75);
    if (f.adipose) mesh(fishShape([[-0.26 * L, 0], [-0.29 * L, Hd * 0.35, -0.26 * L, Hd * 0.3], [-0.33 * L, 0]]), fm, 0, top * 0.62);
    if (f.finlets) for (let k = 0; k < 9; k++) mesh(fishShape([[0, 0], [-0.01 * L, Hd * 0.6], [-0.05 * L, 0]]), fm, 0.18 * L - k * 0.065 * L, top * 0.95, 0);
    // anal fin
    if (f.knife) mesh(fishShape([[0.2 * L, 0], [0.1 * L, -Hd * 0.9], [-0.5 * L, -Hd * 0.5], [-0.52 * L, 0]]), fm, 0, -Hh / 2 * 0.7); // the long, rippling anal fin
    else if (ld !== 'full') mesh(fishShape([[-0.05 * L, 0], [-0.14 * L, -Hd * 0.6], [-0.3 * L, -0.01, -0.22 * L, -Hd * 0.35]]), fm, 0, -Hh / 2 * 0.75);
    else mesh(fishShape([[0.02 * L, 0], [-0.04 * L, -Hd * 0.5], [-0.4 * L, -Hd * 0.45], [-0.42 * L, 0]]), fm, 0, -Hh / 2 * 0.85);
    // pectorals: normal, wings (flying fish), legs (mudskipper), lobes (coelacanth, lungfish, bichir)
    [-1, 1].forEach(s => {
      if (f.chimaera) { const wg = mesh(fishShape([[0, 0], [-0.32 * L, -0.06 * L, -0.12 * L, 0.06 * L], [-0.3 * L, -0.12 * L], [-0.02 * L, -0.06 * L]]), finMat(f.fin, 0.85), 0.2 * L, -Hh * 0.12, s * Wd * 0.45); wg.rotation.set(s * -1.0, s * -0.25, -0.1); return; }
      if (f.wings) { const wg = mesh(fishShape([[0, 0], [-0.5 * L, 0.12 * L, -0.25 * L, 0.2 * L], [-0.62 * L, 0.02 * L], [-0.05 * L, -0.03 * L]]), finMat('#b8d4f2', 0.8), 0.22 * L, Hh * 0.08, s * Wd * 0.45); wg.rotation.set(s * -0.55, s * -0.2, 0.05); return; }
      if (f.lobed) { const thin = f.lobed === 'thin', lb = mesh(new THREE.CapsuleGeometry(Hh * (thin ? 0.04 : 0.07), L * (thin ? 0.16 : 0.12), 4, 8), std({ color: f.side, roughness: 0.6 }), 0.2 * L, -Hh * 0.18, s * Wd * 0.5); lb.rotation.set(s * 0.9, 0, 1.1);
        const lf = mesh(fishShape([[0, 0], [-0.1 * L, Hh * 0.12, -0.06 * L, Hh * 0.14], [-0.1 * L, -Hh * 0.08]]), fm, 0.13 * L, -Hh * 0.32, s * Wd * 0.62); lf.rotation.y = s * 0.7;
        if (!thin) { const pl = mesh(new THREE.CapsuleGeometry(Hh * 0.06, L * 0.08, 4, 8), std({ color: f.side, roughness: 0.6 }), -0.08 * L, -Hh * 0.38, s * Wd * 0.25); pl.rotation.set(s * 0.6, 0, 1.3);
          mesh(fishShape([[0, 0], [-0.1 * L, Hd * 0.6], [-0.18 * L, 0]]), finMat(f.fin), -0.12 * L, top * 0.7); }
        return; }
      if (f.legs) { const lg = mesh(new THREE.CapsuleGeometry(Hh * 0.08, L * 0.12, 4, 8), std({ color: f.side, roughness: 0.6 }), 0.18 * L, -Hh * 0.42, s * Wd * 0.48); lg.rotation.set(s * 0.6, 0, 0.6);
        const ft = mesh(fishShape([[0, 0], [-0.1 * L, -Hh * 0.18, -0.02 * L, -Hh * 0.25], [-0.12 * L, 0]]), fm, 0.14 * L, -Hh * 0.55, s * Wd * 0.6); ft.rotation.y = s * 0.4; return; }
      const pec = mesh(fishShape([[0, 0], [-0.17 * L, -0.06 * Hh, -0.12 * L, 0.06 * Hh], [-0.02 * L, -0.05 * Hh]]), fm, 0.24 * L, -0.1 * Hh, s * Wd / 2 * 0.82); pec.rotation.y = s * 0.45;
      const pel = mesh(fishShape([[0, 0], [-0.1 * L, -0.12 * Hh], [-0.06 * L, -0.02 * Hh]]), fm, 0.05 * L, -Hh * 0.4, s * Wd * 0.2); pel.rotation.y = s * 0.3;
    });
    // head features
    const eyeX = L / 2 * (f.topEyes ? 0.74 : 0.7), eyeY = f.topEyes ? Hh * (0.3 + 0.12 * f.topEyes) : Hh * 0.08, eyeZ = Wd / 2 * (f.topEyes ? 0.45 : 0.9);
    if (!f.dome) eyes(eyeX, eyeY, eyeZ, Hh * (f.topEyes ? 0.11 * f.topEyes + 0.04 : f.glowEye ? 0.1 : f.bigEye ? 0.13 : 0.075), f.glowEye ? '#f0f0c0' : f.redEye ? '#d8302a' : f.redFins ? '#e8b030' : '#d9c98e', !!f.glowEye);
    if (f.earFlap) [-1, 1].forEach(s => { const e = mesh(new THREE.CircleGeometry(Hh * 0.09, 14), std({ color: '#141a22', side: THREE.DoubleSide }), L * 0.24, Hh * 0.05, s * Wd * 0.48); e.rotation.y = s * 0.2; if (typeof f.earFlap === 'string') { const r = mesh(new THREE.RingGeometry(Hh * 0.06, Hh * 0.09, 14), std({ color: f.earFlap, side: THREE.DoubleSide }), L * 0.24, Hh * 0.05, s * (Wd * 0.48 + 0.001)); r.rotation.y = s * 0.2; } });
    if (f.whiskers) whiskers(f.whiskers, L / 2 * 0.94, -Hh * (f.flatHead ? 0.05 : 0.1), Hh * (f.flatHead ? 0.9 : f.snoutCone ? 0.35 : 0.4), finMat(f.fin, 1));
    if (f.bigMouth) { const m = mesh(new THREE.BoxGeometry(L * 0.06, Hh * 0.04, Wd * 0.7), std({ color: '#2a1a14' }), L / 2 * 0.92, -Hh * 0.04, 0); m.rotation.z = -0.3; }
    if (f.thickLips) { const lp = mesh(new THREE.TorusGeometry(Hh * 0.07, Hh * 0.035, 8, 14), std({ color: '#c4945a' }), L / 2 * 0.98, -Hh * 0.08, 0); lp.rotation.y = Math.PI / 2; lp.scale.set(1, 0.7, 1); }
    if (f.upMouth) { const m = mesh(new THREE.BoxGeometry(L * 0.05, Hh * 0.03, Wd * 0.5), std({ color: '#2a2a2a' }), L / 2 * 0.95, Hh * 0.12, 0); m.rotation.z = 0.6; }
    if (f.teeth) { const tm = std({ color: '#f4f0e4' }); for (let k = 0; k < 7; k++) cone(0.006, Hh * 0.08, tm, L / 2 * 0.96 - Math.abs(k - 3) * 0.008, -Hh * 0.08, (k - 3) * Wd * 0.09, 0, 0, 0, 4); }
    if (f.bill) { const bm = std({ color: f.back, roughness: 0.4 }), bl = mesh(new THREE.ConeGeometry(Hh * 0.12, L * f.bill, 10), bm, L / 2 + L * f.bill / 2 - L * 0.04, 0, 0); bl.rotation.z = -Math.PI / 2; bl.scale.set(1, 1, 0.8);
      if (f.jaws) { const tm = std({ color: '#f4f0e4' }); for (let k = 0; k < 10; k++) [-1, 1].forEach(s => cone(0.004, Hh * 0.05, tm, L / 2 + k * L * f.bill * 0.08, -Hh * 0.03, s * Hh * 0.05 * (1 - k / 12), Math.PI, 0, 0, 4)); } }
    if (f.paddle) { const pm = std({ color: f.side, roughness: 0.5 }), ps = new THREE.Shape(); ps.moveTo(0, -Wd * 0.12); ps.quadraticCurveTo(L * 0.3, -Wd * 0.22, L * 0.42, -Wd * 0.18); ps.quadraticCurveTo(L * 0.48, 0, L * 0.42, Wd * 0.18); ps.quadraticCurveTo(L * 0.3, Wd * 0.22, 0, Wd * 0.12); ps.closePath();
      const pd = mesh(new THREE.ExtrudeGeometry(ps, { depth: Hh * 0.04, bevelEnabled: false }), pm, L / 2 * 0.92, Hh * 0.0, 0); pd.rotation.x = -Math.PI / 2; }
    if (f.snoutCone) cone(Hh * 0.16, L * f.snoutCone, std({ color: f.side, roughness: 0.5 }), L / 2 + L * f.snoutCone * 0.35, -Hh * 0.04, 0, 0, 0, -Math.PI / 2 - 0.1, 10);
    if (f.scutes) { const sm = std({ color: '#d8dade', roughness: 0.4 }); for (let k = 0; k < 13; k++) { const x = L * 0.36 - k * L * 0.06; cone(Hh * 0.04, Hh * 0.1, sm, x, Hh * 0.46 * (1 - Math.abs(x / L) * 0.6), 0, 0, 0, 0, 4); [-1, 1].forEach(s => cone(Hh * 0.03, Hh * 0.08, sm, x, Hh * 0.02, s * Wd * 0.47 * (1 - Math.abs(x / L) * 0.8), s * Math.PI / 2, 0, 0, 4)); } }
    // (corydoras / pleco armour is in the 'plates' look of their colouring)
    const glow = col => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.5, roughness: 0.3 });
    const front = L / 2 * 0.95;
    if (f.fangs) { const tm = std({ color: '#f2f0e8', roughness: 0.25, metalness: 0.1 }), n = f.fangs, fl = Hh * (f.fangLen || 0.5);
      for (let k = 0; k < n; k++) { const zz = (k / (n - 1) - 0.5) * Wd * 0.6, up = k % 2 === 0, len = fl * (0.6 + 0.4 * Math.abs(Math.sin(k * 2.3)));
        cone(0.006 + Hh * 0.015, len, tm, front + 0.004, up ? -Hh * 0.04 - len * 0.3 : Hh * 0.04 + len * 0.3, zz, up ? 0 : Math.PI, 0, up ? -0.25 : 0.25, 5); } }
    if (f.gape) { const mo = mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI * (0.5 - 0.15 * f.gape), Math.PI * 0.3 * f.gape), std({ color: '#140a0c', side: THREE.DoubleSide, roughness: 0.9 }), front - L * 0.02, -Hh * 0.04, 0); mo.scale.set(L * 0.06, Hh * (0.35 + 0.5 * f.gape), Wd * 0.45); mo.rotation.z = -Math.PI / 2 + 0.2;
      if (f.gape >= 1) { const jaw = mesh(new THREE.CylinderGeometry(Hh * 0.025, Hh * 0.02, L * 0.22, 6), std({ color: f.side }), front - L * 0.04, -Hh * 0.38, 0); jaw.rotation.z = Math.PI / 2 - 0.55; } } // loosejaw: the jaw with no floor
    if (f.chinLure) { const c2 = new THREE.QuadraticBezierCurve3(new V3(front - L * 0.05, -Hh * 0.38, 0), new V3(front - L * 0.05, -Hh * 1.4, 0), new V3(front + L * 0.12, -Hh * 1.9, 0)); mesh(new THREE.TubeGeometry(c2, 12, 0.004, 4), std({ color: f.fin }));
      mesh(new THREE.SphereGeometry(Hh * 0.09, 10, 8), glow(f.photo || '#7ff0ff'), front + L * 0.12, -Hh * 1.9, 0); }
    if (f.dorsalLure) { const c2 = new THREE.QuadraticBezierCurve3(new V3(L * 0.22, Hh * 0.45, 0), new V3(L * 0.35, Hh * 1.8, 0), new V3(L * 0.55, Hh * 1.1, 0)); mesh(new THREE.TubeGeometry(c2, 12, 0.004, 4), std({ color: f.fin }));
      mesh(new THREE.SphereGeometry(Hh * 0.08, 10, 8), glow(f.photo || '#7ff0ff'), L * 0.55, Hh * 1.1, 0); }
    if (f.redLight) [-1, 1].forEach(s => { mesh(new THREE.SphereGeometry(Hh * 0.09, 10, 8), glow('#ff2a2a'), L * 0.32, -Hh * 0.02, s * Wd * 0.42).scale.set(1.4, 0.8, 0.5); });
    if (f.dome) { mesh(new THREE.SphereGeometry(Hh * 0.55, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#dff4ff', transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.1, depthWrite: false }), L * 0.26, Hh * 0.3, 0).scale.set(1.4, 1.1, 0.9);
      [-1, 1].forEach(s => { const e = mesh(new THREE.CylinderGeometry(Hh * 0.08, Hh * 0.08, Hh * 0.35, 12), glow('#4af06a'), L * 0.27, Hh * 0.5, s * Wd * 0.14); e.material.emissiveIntensity = 0.6; }); }
    if (f.tripod) { const rm = std({ color: f.fin, roughness: 0.5 }); [-1, 1].forEach(s => { const r = mesh(new THREE.CylinderGeometry(0.004, 0.004, L * 0.7, 4), rm, L * 0.12, -Hh * 0.5 - L * 0.3, s * Wd * 0.25); r.rotation.set(s * 0.12, 0, 0.35); });
      const tr = mesh(new THREE.CylinderGeometry(0.004, 0.004, L * 0.6, 4), rm, -L * 0.55, -Hh * 0.2 - L * 0.24, 0); tr.rotation.z = -0.75;
      [-1, 1].forEach(s => { const p2 = mesh(new THREE.CylinderGeometry(0.003, 0.003, L * 0.4, 4), rm, L * 0.15, Hh * 0.6, s * Wd * 0.45); p2.rotation.set(s * 0.5, 0, -0.9); }); }
    if (f.beak) { const bm = std({ color: f.back, roughness: 0.35 }), bl = L * f.beak;
      if (f.beakLower) { const b2 = cone(Hh * 0.08, bl, std({ color: '#e85a3a' }), front + bl / 2, -Hh * 0.12, 0, 0, 0, -Math.PI / 2, 8); b2.scale.set(1, 1, 0.7); }
      else { [0.03, -0.03].forEach(dy => { const b2 = cone(Hh * 0.1, bl, bm, front + bl / 2, dy * Hh * 4, 0, 0, 0, -Math.PI / 2, 8); b2.scale.set(1, 1, 0.7); }); } }
    if (f.parrotBeak) { const pb = mesh(new THREE.SphereGeometry(Hh * 0.14, 14, 10), std({ color: '#e8f0ea', roughness: 0.3 }), front + L * 0.02, -Hh * 0.06, 0); pb.scale.set(0.8, 1, 1.1); }
    if (f.tubeSnout) cone(Hh * 0.06, L * f.tubeSnout * 2, std({ color: f.side }), front + L * f.tubeSnout, Hh * 0.02, 0, 0, 0, -Math.PI / 2, 10);
    if (f.sucker) { const sk = mesh(new THREE.CylinderGeometry(1, 1, 1, 20), std({ color: '#5a5e66', roughness: 0.6 }), L * 0.28, Hh * 0.46, 0); sk.scale.set(L * 0.16, Hh * 0.05, Wd * 0.34);
      for (let k = 0; k < 10; k++) mesh(new THREE.BoxGeometry(0.003, Hh * 0.06, Wd * 0.55), std({ color: '#2a2e34' }), L * 0.16 + k * L * 0.026, Hh * 0.48, 0); }
    if (f.suckerMouth) mesh(new THREE.TorusGeometry(Hh * 0.06, Hh * 0.025, 8, 14), std({ color: '#c4a08a' }), front - L * 0.02, -Hh * 0.32, 0).rotation.x = Math.PI / 2;
    if (f.ocelli) [-1, 1].forEach(s => { for (let k = 0; k < 6; k++) { const x = -0.05 * L - k * 0.07 * L; mesh(new THREE.CircleGeometry(Hh * 0.07, 14), std({ color: '#f4f4f0', side: THREE.DoubleSide }), x, -Hh * 0.18, s * Wd * 0.47);
      mesh(new THREE.CircleGeometry(Hh * 0.05, 14), std({ color: '#141414', side: THREE.DoubleSide }), x, -Hh * 0.18, s * (Wd * 0.47 + 0.002)); } });
    if (f.tassels) { const tm = finMat(f.fin, 1); for (let k = 0; k < 5; k++) cone(0.006, Hh * 0.12, tm, L * 0.32 - k * L * 0.06, Hh * 0.38, (k % 2 ? 1 : -1) * Wd * 0.3, 0, 0, 0, 4); }
    if (f.scalesBig) { /* gar: diamond scales come from the pattern */ }
  }
}
