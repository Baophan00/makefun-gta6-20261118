// PORT VESPER - the hand-authored city. Everything here is static geometry generated once from a
// seed: blocks, sidewalks, buildings, roads, lane rules, the park, the pier and mission landmarks.
// The simulation and the renderer read the same data, so a collision is exactly what you see.

import {
  CITY, CITY_MAP, COLORS, FIELD, LAND_HEIGHT, STREET_NAMES, CROSS_NAMES,
  WORLD_HEIGHT, WORLD_WIDTH,
} from './config.js';

/** mulberry32: the same seed always produces the same traffic, pedestrians and screenshots. */
export function makeRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LABELS = {
  T: ['VESPER TOWER', 'SKYLINE', 'NORTH TOWER'],
  B: ['CIVIC HALL', 'ARCADE', 'WAREHOUSE'],
  S: ['TAXIS', 'GARAGE'],
  Q: ['CAFE', 'BAKERY', 'BARBER', 'FLORIST'],
  M: ['VESPER MART'],
  H: ['HOTEL VESPER'],
};

function building(x, y, w, h, paletteIndex, label, kind) {
  return {
    x, y, w, h,
    color: COLORS.roofs[paletteIndex % COLORS.roofs.length],
    label,
    kind,
    vents: Math.max(1, Math.floor((w * h) / 9000)),
  };
}

/** Fill one block according to its map character. Returns buildings for that block. */
function fillBlock(block, kind, index) {
  const { x, y, w, h } = block;
  const inset = CITY.sidewalk;
  const ix = x + inset;
  const iy = y + inset;
  const iw = w - inset * 2;
  const ih = h - inset * 2;
  const pick = (key, n) => LABELS[key][n % LABELS[key].length];
  const out = [];

  if (kind === 'T') {
    const size = Math.min(iw, ih) - 18;
    out.push(building(ix + (iw - size) / 2, iy + (ih - size) / 2, size, size, index, pick('T', index), 'tower'));
  } else if (kind === 'B') {
    out.push(building(ix + 10, iy + 8, iw - 20, ih - 16, index + 1, pick('B', index), 'block'));
  } else if (kind === 'S') {
    const gap = 14;
    const bw = (iw - gap) / 2;
    out.push(building(ix, iy + 12, bw, ih - 24, index, pick('S', index), 'shop'));
    out.push(building(ix + bw + gap, iy + 12, bw, ih - 24, index + 2, pick('S', index + 1), 'shop'));
  } else if (kind === 'Q') {
    const gap = 10;
    const bw = (iw - gap) / 2;
    const bh = (ih - gap) / 2;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const n = row * 2 + col;
        out.push(building(ix + col * (bw + gap), iy + row * (bh + gap), bw, bh, index + n, pick('Q', index + n), 'shop'));
      }
    }
  } else if (kind === 'M') {
    out.push(building(ix + 6, iy + 10, iw - 12, ih * 0.58, index, pick('M', 0), 'market'));
  } else if (kind === 'H') {
    const gap = 8;
    const bw = (iw - gap * 2) / 3;
    for (let n = 0; n < 3; n += 1) {
      out.push(building(ix + n * (bw + gap), iy + 16, bw, ih - 32, index + n, pick('H', 0), 'hotel'));
    }
  } else if (kind === 'O') {
    out.push(building(ix + iw * 0.56, iy + ih * 0.12, iw * 0.36, ih * 0.36, index, 'STORAGE', 'kiosk'));
  }
  // P is the park: grass and trees, no buildings.
  return out;
}

export function createWorld(seed) {
  const rng = makeRandom(seed);
  const blocks = [];
  const buildings = [];
  const trees = [];
  const lamps = [];

  for (let row = 0; row < CITY.rows; row += 1) {
    for (let col = 0; col < CITY.cols; col += 1) {
      const kind = CITY_MAP[row][col];
      const block = {
        col, row, kind,
        x: col * CITY.cell + CITY.road,
        y: row * CITY.cell + CITY.road,
        w: CITY.block,
        h: CITY.block,
        name: col % 2 === 0 ? CROSS_NAMES[row] : STREET_NAMES[col],
      };
      block.cx = block.x + block.w / 2;
      block.cy = block.y + block.h / 2;
      blocks.push(block);
      for (const b of fillBlock(block, kind, row * 3 + col)) buildings.push(b);

      if (kind === 'P') {
        for (let n = 0; n < 9; n += 1) {
          const tx = block.x + 34 + rng() * (block.w - 68);
          const ty = block.y + 34 + rng() * (block.h - 68);
          if (Math.abs(tx - block.cx) < 30 && Math.abs(ty - block.cy) < 30) continue;
          trees.push({ x: tx, y: ty, r: 11 + rng() * 7, tone: rng() < 0.5 ? 0 : 1 });
        }
      }
    }
  }

  for (let row = 0; row <= CITY.rows; row += 1) {
    for (let col = 0; col <= CITY.cols; col += 1) {
      lamps.push({ x: col * CITY.cell + CITY.road * 0.12, y: row * CITY.cell + CITY.road * 0.12 });
    }
  }

  const pier = { x: 1200, y: LAND_HEIGHT - 12, w: 116, h: 190 };
  const points = {
    spawn: { x: 3 * CITY.cell + CITY.road / 2, y: 2 * CITY.cell + CITY.road / 2 },
    pickup: { x: blocks[4 * CITY.cols + 1].cx, y: blocks[4 * CITY.cols + 1].cy },
    dropoff: { x: pier.x + pier.w / 2, y: pier.y + pier.h - 24 },
    store: { x: blocks[2 * CITY.cols + 2].cx, y: blocks[2 * CITY.cols + 2].cy + 20 },
    safehouse: { x: blocks[4 * CITY.cols + 4].cx, y: blocks[4 * CITY.cols + 4].cy },
  };

  const world = {
    rng, seed, blocks, buildings, trees, lamps, pier, points,
    width: WORLD_WIDTH,
    height: WORLD_HEIGHT,
    landHeight: LAND_HEIGHT,
    roadsV: Array.from({ length: CITY.cols + 1 }, (_, i) => i * CITY.cell),
    roadsH: Array.from({ length: CITY.rows + 1 }, (_, i) => i * CITY.cell),
  };
  return world;
}

/** The lane coordinate for a direction: vertical roads use x, horizontal roads use y. */
export function laneCoord(dir, index) {
  const r = CITY.road;
  if (dir === 1) return index * CITY.cell + r * 0.30;
  if (dir === 3) return index * CITY.cell + r * 0.70;
  if (dir === 0) return index * CITY.cell + r * 0.70;
  return index * CITY.cell + r * 0.30;
}

export function roadIndex(dir, coord) {
  const max = dir === 1 || dir === 3 ? CITY.cols : CITY.rows;
  return Math.max(0, Math.min(max, Math.floor(coord / CITY.cell)));
}

export function dirVector(dir) {
  if (dir === 0) return { x: 1, y: 0 };
  if (dir === 1) return { x: 0, y: 1 };
  if (dir === 2) return { x: -1, y: 0 };
  return { x: 0, y: -1 };
}

export function pointInWater(world, x, y) {
  if (y < world.landHeight) return false;
  return !(x >= world.pier.x - 8 && x <= world.pier.x + world.pier.w + 8);
}

export function pointInBuilding(world, x, y) {
  for (let i = 0; i < world.buildings.length; i += 1) {
    const b = world.buildings[i];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

/** Push a circle out of every building it overlaps. Also keeps walkers out of the water. */
export function collideCircle(world, x, y, radius) {
  let hit = false;
  for (let i = 0; i < world.buildings.length; i += 1) {
    const b = world.buildings[i];
    if (x + radius < b.x || x - radius > b.x + b.w || y + radius < b.y || y - radius > b.y + b.h) continue;
    const px = Math.max(b.x, Math.min(x, b.x + b.w));
    const py = Math.max(b.y, Math.min(y, b.y + b.h));
    let dx = x - px;
    let dy = y - py;
    let d = Math.hypot(dx, dy);
    if (d > radius) continue;
    if (d < 0.0001) {
      const left = Math.abs(x - b.x);
      const right = Math.abs(b.x + b.w - x);
      const top = Math.abs(y - b.y);
      const bottom = Math.abs(b.y + b.h - y);
      const smallest = Math.min(left, right, top, bottom);
      if (smallest === left) x = b.x - radius;
      else if (smallest === right) x = b.x + b.w + radius;
      else if (smallest === top) y = b.y - radius;
      else y = b.y + b.h + radius;
      d = 1;
      dx = 0;
      dy = 0;
    }
    x += (dx / d) * (radius - d + 0.5);
    y += (dy / d) * (radius - d + 0.5);
    hit = true;
  }
  x = Math.max(radius, Math.min(world.width - radius, x));
  const maxY = pointInWater(world, x, y) ? world.landHeight - radius : world.height - radius;
  y = Math.max(radius, Math.min(maxY, y));
  return { x, y, hit };
}

export function clampCamera(world, x, y) {
  return {
    x: Math.max(0, Math.min(world.width - FIELD.width, x)),
    y: Math.max(0, Math.min(world.height - FIELD.height, y)),
  };
}

/** A point on a road roughly `distance` away from (x,y), used for police reinforcements. */
export function roadSpawn(world, x, y, distance, rng) {
  const angle = rng() * Math.PI * 2;
  const tx = x + Math.cos(angle) * distance;
  const ty = y + Math.sin(angle) * distance;
  if (tx < 0 || tx > world.width || ty < 0 || ty > world.landHeight) {
    return { x: world.roadsV[Math.floor(rng() * world.roadsV.length)] + CITY.road / 2, y: CITY.road / 2 };
  }
  const vertical = Math.abs((tx % CITY.cell) - CITY.road / 2) < Math.abs((ty % CITY.cell) - CITY.road / 2);
  if (vertical) {
    const road = Math.min(CITY.cols, Math.floor(tx / CITY.cell));
    return { x: road * CITY.cell + CITY.road / 2, y: Math.max(CITY.road / 2, Math.min(world.landHeight - CITY.road / 2, ty)) };
  }
  const road = Math.min(CITY.rows, Math.floor(ty / CITY.cell));
  return { x: Math.max(CITY.road / 2, Math.min(world.width - CITY.road / 2, tx)), y: road * CITY.cell + CITY.road / 2 };
}

/** A walking point on the pavement ring of a random city block. */
export function sidewalkPoint(world, rng) {
  const block = world.blocks[Math.floor(rng() * world.blocks.length)];
  const side = Math.floor(rng() * 4);
  const inset = CITY.sidewalk * 0.55;
  const t = 0.1 + rng() * 0.8;
  if (side === 0) return { x: block.x + inset + t * (block.w - inset * 2), y: block.y + inset };
  if (side === 1) return { x: block.x + block.w - inset, y: block.y + inset + t * (block.h - inset * 2) };
  if (side === 2) return { x: block.x + inset + t * (block.w - inset * 2), y: block.y + block.h - inset };
  return { x: block.x + inset, y: block.y + inset + t * (block.h - inset * 2) };
}
