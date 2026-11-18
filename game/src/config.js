// PORT VESPER - shared tuning, geometry and colours. FIELD is the live viewport in CSS pixels:
// the renderer resizes it to the window so the canvas fills the screen with no letterboxing.
// The city itself is much larger and the camera shows only a window onto it. Every number used by
// more than one module lives here so a change never desynchronises simulation and drawing.

export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;

// The city is a hand-authored grid: seven columns and six rows of city blocks, each separated by
// a wide road, with a waterfront strip south of the last road.
export const CITY = {
  cols: 7,
  rows: 6,
  cell: 400,
  road: 120,
  block: 280,
  sidewalk: 26,
  waterHeight: 300,
};

export const WORLD_WIDTH = CITY.cols * CITY.cell + CITY.road;
export const LAND_HEIGHT = CITY.rows * CITY.cell + CITY.road;
export const WORLD_HEIGHT = LAND_HEIGHT + CITY.waterHeight;

// One character per city block, left to right, top to bottom. T=tall tower, B=large block,
// S=split pair, Q=four small shops, M=the market, P=park, O=open lot, H=hotel row.
export const CITY_MAP = [
  'TSBQHBT',
  'BQOSTSB',
  'QSMBTOQ',
  'TBQHSMB',
  'SOBTPOQ',
  'HTBQMSB',
];

export const STREET_NAMES = ['VESPER AVE', 'MARINA AVE', 'GRAND AVE', 'CINDER AVE', 'NORTH AVE', 'DOCK AVE', 'EAST AVE'];
export const CROSS_NAMES = ['HARBOR ST', 'MARKET ST', 'PALM ST', 'CENTRAL ST', 'IRON ST', 'BAY ST', 'SOUTH ST'];

export const PLAYER = {
  radius: 13,
  walkSpeed: 195,
  sprintSpeed: 320,
  maxHealth: 100,
  startAmmo: 64,
  fireDelay: 0.14,
  bulletSpeed: 980,
  interactRange: 90,
  enterRange: 68,
  hurtDelay: 0.7,
};

export const CAR = {
  radius: 23,
  accel: 270,
  reverseAccel: 150,
  brake: 380,
  drag: 1.05,
  maxSpeed: 285,
  turnRate: 2.5,
  civilianSpeed: [95, 155],
};

export const WANTED = {
  max: 5,
  shotsPerStar: 4,
  stealStars: 2,
  decayDelay: 18,
  decayStep: 15,
};

export const POLICE = {
  baseSpeed: 205,
  speedPerStar: 17,
  spawnDelay: 4.2,
  shootRange: 430,
  shootDelay: 1.7,
  damage: 9,
};

export const TRAFFIC_LIMIT = 16;
export const PED_LIMIT = 26;

export const COLORS = {
  land: '#7d8b80',
  landDark: '#68776d',
  road: '#3a4049',
  roadDark: '#32373e',
  intersection: '#424850',
  roadLine: '#e5cf94',
  crosswalk: '#d8d9ce',
  sidewalk: '#b9b6a8',
  curb: '#8c8e80',
  water: '#225b75',
  waterDeep: '#1a4b63',
  foam: '#7fc1d0',
  park: '#568555',
  parkPath: '#c3b99b',
  tree: '#356b45',
  treeLight: '#4f8a55',
  pier: '#9a7650',
  pierDark: '#6d5138',
  roofs: ['#c7b196', '#b6a2a0', '#a5b1bd', '#c2b389', '#9daaa2', '#cdb99c', '#ada4b4'],
  roofShade: '#7e7567',
  roofDetail: '#8c8375',
  glass: '#5c7480',
  player: '#f0a13b',
  playerDark: '#b96b1e',
  policeBody: '#26384d',
  policeTrim: '#e8eef5',
  policeBlue: '#4c9dff',
  policeRed: '#ff5a55',
  civilian: ['#d6d2c4', '#6c8b9e', '#a85650', '#c8a24c', '#7c9a72', '#8e7ca3', '#d0a58e', '#4f6b7a'],
  marker: '#ffd05a',
  hudPanel: 'rgba(9, 15, 22, 0.80)',
  hudText: '#f6f1e4',
  hudMuted: '#a9b6bb',
  gold: '#ffce57',
  red: '#ef6158',
  green: '#79d38c',
  skyGlow: '#e8a35c',
};

export const FONT = 'Trebuchet MS, Verdana, sans-serif';
export const MONO = 'Courier New, monospace';
export const SAVE_KEY = 'portvesper.save.v1';

export const SCREEN = {
  START: 'start',
  PLAY: 'play',
  PAUSED: 'paused',
  OVER: 'over',
};
