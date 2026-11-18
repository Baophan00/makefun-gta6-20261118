// PORT VESPER - moving things: cars, pedestrians, bullets and sparks. Traffic follows the lane
// rules from world.js and turns at junctions; police steer straight at the player. Everything is
// plain data so the renderer never has to know how a thing got where it is.

import { CAR, CITY, COLORS, LAND_HEIGHT, POLICE, WORLD_WIDTH } from './config.js';
import {
  collideCircle, dirVector, laneCoord, roadIndex, roadSpawn, sidewalkPoint,
} from './world.js';

function angleForDir(dir) {
  return dir === 0 ? 0 : dir === 1 ? Math.PI / 2 : dir === 2 ? Math.PI : -Math.PI / 2;
}

export function createPlayer(world) {
  return {
    x: world.points.spawn.x,
    y: world.points.spawn.y,
    angle: -Math.PI / 2,
    vx: 0,
    vy: 0,
    health: 100,
    ammo: 64,
    fireCd: 0,
    hurtCd: 0,
    walkPhase: 0,
    car: null,
    nearCar: null,
    nearMarker: false,
    money: 0,
    heat: 0,
    shotCount: 0,
  };
}

export function createCar(world, rng, options) {
  const kind = options.kind || 'civil';
  const dir = options.dir ?? Math.floor(rng() * 4);
  const lane = options.lane ?? laneCoord(dir, Math.floor(rng() * (dir % 2 ? CITY.cols : CITY.rows)));
  return {
    kind,
    x: options.x,
    y: options.y,
    angle: options.angle ?? angleForDir(dir),
    dir,
    lane,
    laneTarget: lane,
    speed: options.speed ?? 0,
    targetSpeed: options.targetSpeed ?? (kind === 'police' ? POLICE.baseSpeed : 120),
    color: options.color ?? COLORS.civilian[Math.floor(rng() * COLORS.civilian.length)],
    health: kind === 'police' ? 60 : 30,
    turnCooldown: 0,
    turnedAt: -1,
    shootTimer: 0.8 + rng() * POLICE.shootDelay,
    sirenPhase: rng() * Math.PI * 2,
    life: 0,
    wrecked: false,
  };
}

/** Spawn civilian traffic just outside the player's view on a road heading toward them. */
export function spawnCivilianCar(world, rng, player) {
  const vertical = rng() < 0.5;
  let dir;
  let x;
  let y;
  let lane;
  if (vertical) {
    dir = rng() < 0.5 ? 1 : 3;
    const col = Math.max(0, Math.min(CITY.cols, Math.floor(player.x / CITY.cell) + Math.floor(rng() * 3) - 1));
    lane = laneCoord(dir, col);
    x = lane;
    y = dir === 1 ? player.y - 760 : player.y + 760;
    y = Math.max(-120, Math.min(LAND_HEIGHT + 120, y));
  } else {
    dir = rng() < 0.5 ? 0 : 2;
    const row = Math.max(0, Math.min(CITY.rows, Math.floor(player.y / CITY.cell) + Math.floor(rng() * 3) - 1));
    lane = laneCoord(dir, row);
    y = lane;
    x = dir === 0 ? player.x - 980 : player.x + 980;
    x = Math.max(-120, Math.min(WORLD_WIDTH + 120, x));
  }
  const speed = CAR.civilianSpeed[0] + rng() * (CAR.civilianSpeed[1] - CAR.civilianSpeed[0]);
  return createCar(world, rng, {
    kind: 'civil', dir, lane, x, y, speed,
    targetSpeed: speed, angle: angleForDir(dir),
  });
}

export function spawnPoliceCar(world, player, wanted, rng) {
  const spot = roadSpawn(world, player.x, player.y, 560 + rng() * 220, rng);
  const car = createCar(world, rng, {
    kind: 'police',
    x: spot.x,
    y: spot.y,
    angle: Math.atan2(player.y - spot.y, player.x - spot.x),
    targetSpeed: POLICE.baseSpeed + wanted * POLICE.speedPerStar,
    color: COLORS.policeBody,
  });
  car.speed = car.targetSpeed * 0.7;
  return car;
}

export function createPed(world, rng) {
  const spot = sidewalkPoint(world, rng);
  return {
    x: spot.x,
    y: spot.y,
    dir: Math.floor(rng() * 4),
    speed: 46 + rng() * 34,
    angle: 0,
    phase: rng() * 6,
    color: COLORS.civilian[Math.floor(rng() * COLORS.civilian.length)],
    skin: rng() < 0.35 ? '#7a4f39' : rng() < 0.6 ? '#c88d61' : '#e6b98f',
    turnTimer: 1 + rng() * 3,
    flee: 0,
    down: 0,
  };
}

/** Move a civilian car along its lane, turning at junctions with a fixed random chance. */
function updateTraffic(car, world, rng, dt, cars) {
  const vertical = car.dir === 1 || car.dir === 3;
  const along = vertical ? car.y : car.x;
  const index = vertical ? Math.floor(along / CITY.cell) : Math.floor(along / CITY.cell);
  const center = index * CITY.cell + CITY.road / 2;
  const forward = dirVector(car.dir);

  if (car.turnCooldown <= 0 && Math.abs(along - center) < Math.max(10, car.speed * dt)) {
    car.turnCooldown = 0.8;
    if (rng() < 0.22) {
      const nextIndex = roadIndex(car.dir, along);
      if (vertical) {
        car.dir = rng() < 0.5 ? 0 : 2;
        car.laneTarget = laneCoord(car.dir, nextIndex);
        car.y = center;
        car.lane = center;
      } else {
        car.dir = rng() < 0.5 ? 1 : 3;
        car.laneTarget = laneCoord(car.dir, nextIndex);
        car.x = center;
        car.lane = center;
      }
      car.angle = angleForDir(car.dir);
    }
  }
  car.turnCooldown = Math.max(0, car.turnCooldown - dt);
  car.lane += (car.laneTarget - car.lane) * Math.min(1, dt * 5);

  // Slow down for a car ahead in the same stream.
  let wanted = car.targetSpeed;
  for (let i = 0; i < cars.length; i += 1) {
    const other = cars[i];
    if (other === car || other.wrecked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const ahead = dx * forward.x + dy * forward.y;
    const side = Math.abs(dx * -forward.y + dy * forward.x);
    if (ahead > 8 && ahead < 78 && side < 26) wanted = Math.min(wanted, other.speed * 0.92);
  }
  car.speed += (wanted - car.speed) * Math.min(1, dt * 2.2);

  const v = dirVector(car.dir);
  car.x += v.x * car.speed * dt;
  car.y += v.y * car.speed * dt;
  if (car.dir === 1 || car.dir === 3) car.x = car.lane;
  else car.y = car.lane;

  if (car.x < -180 || car.x > WORLD_WIDTH + 180 || car.y < -180 || car.y > LAND_HEIGHT + 180) car.wrecked = true;
}

export function updateCar(car, state, dt) {
  const { world, player, rng } = state;
  car.life += dt;
  if (car.kind === 'civil') {
    updateTraffic(car, world, rng, dt, state.cars);
    return;
  }

  const target = player.car && player.car !== car ? player.car : player;
  const desired = Math.atan2(target.y - car.y, target.x - car.x);
  let diff = desired - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = Math.max(-CAR.turnRate * dt, Math.min(CAR.turnRate * dt, diff * 2.2));
  car.angle += turn;
  car.speed += (car.targetSpeed - car.speed) * Math.min(1, dt * 1.8);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  const solved = collideCircle(world, car.x, car.y, CAR.radius);
  if (solved.hit) {
    car.speed *= 0.35;
    car.angle += diff >= 0 ? 0.35 : -0.35;
    car.x = solved.x;
    car.y = solved.y;
  }
  car.sirenPhase += dt * 9;

  if (state.wanted >= 2 && !player.car) {
    car.shootTimer -= dt;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const distance = Math.hypot(dx, dy);
    if (car.shootTimer <= 0 && distance < POLICE.shootRange) {
      car.shootTimer = POLICE.shootDelay + rng() * 0.7;
      const jitter = (rng() - 0.5) * 0.22;
      spawnBullet(state, car.x, car.y, Math.atan2(dy, dx) + jitter, 560, 'police');
      state.events.push('policeShot');
    }
  }
}

export function updatePed(ped, state, dt) {
  const { world, player, rng } = state;
  if (ped.down > 0) {
    ped.down -= dt;
    return;
  }
  const dx = player.x - ped.x;
  const dy = player.y - ped.y;
  const distance = Math.hypot(dx, dy);
  if (state.wanted >= 2 && distance < 250) ped.flee = 2.2;
  let vx;
  let vy;
  if (ped.flee > 0) {
    ped.flee -= dt;
    const inv = 1 / Math.max(1, distance);
    vx = -dx * inv;
    vy = -dy * inv;
    ped.angle = Math.atan2(vy, vx);
  } else {
    ped.turnTimer -= dt;
    if (ped.turnTimer <= 0) {
      ped.turnTimer = 1.5 + rng() * 3.5;
      if (rng() < 0.35) ped.dir = (ped.dir + (rng() < 0.5 ? 1 : 3)) % 4;
    }
    const v = dirVector(ped.dir);
    vx = v.x;
    vy = v.y;
    ped.angle = Math.atan2(vy, vx);
  }
  const step = ped.speed * (ped.flee > 0 ? 1.9 : 1) * dt;
  const solved = collideCircle(world, ped.x + vx * step, ped.y + vy * step, 8);
  if (solved.hit && ped.flee <= 0) {
    ped.dir = (ped.dir + (rng() < 0.5 ? 1 : 3)) % 4;
    const v = dirVector(ped.dir);
    const retry = collideCircle(world, ped.x + v.x * step, ped.y + v.y * step, 8);
    ped.x = retry.x;
    ped.y = retry.y;
  } else {
    ped.x = solved.x;
    ped.y = solved.y;
  }
  ped.phase += dt * (ped.flee > 0 ? 14 : 7);
}

export function spawnBullet(state, x, y, angle, speed, owner) {
  state.bullets.push({
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life: owner === 'police' ? 1.05 : 1.25,
    owner,
    angle,
  });
  state.events.push(owner === 'police' ? 'policeShot' : 'shot');
}

export function emitParticles(state, x, y, color, count, spread = 90) {
  for (let i = 0; i < count; i += 1) {
    const angle = state.rng() * Math.PI * 2;
    const speed = spread * (0.3 + state.rng() * 0.7);
    const life = 0.25 + state.rng() * 0.45;
    state.particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life,
      maxLife: life,
      color,
      size: 2 + state.rng() * 3,
    });
  }
}
