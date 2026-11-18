// PORT VESPER - boot, the fixed-step simulation and the glue between the modules. One frame reads
// input, advances the world in 1/60 s steps, plays the sounds those steps produced and paints.
// The same createGame/step/draw path is used by live play and by the deterministic shot modes.

import {
  CAR, CITY, COLORS, FIELD, PED_LIMIT, PLAYER, POLICE, SAVE_KEY,
  SCREEN, STEP, TRAFFIC_LIMIT, WANTED,
} from './config.js';
import { clampCamera, collideCircle, createWorld, makeRandom, pointInBuilding } from './world.js';
import {
  createCar, createPed, createPlayer, emitParticles, spawnBullet,
  spawnCivilianCar, spawnPoliceCar, updateCar, updatePed,
} from './entities.js';
import { createMission, interact as missionInteract, updateMission } from './mission.js';
import { createRenderer } from './render.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { planShot } from './shots.js';

const IDLE = { moveX: 0, moveY: 0, sprint: false, shoot: false, aimX: 0, aimY: 0, interact: false, enter: false };

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createGame(canvas, options = {}) {
  const seed = Number.isInteger(options.seed) ? options.seed : 7;
  const renderer = createRenderer(canvas);
  const audio = options.silent ? null : createAudio();
  const input = options.silent ? null : createInput(canvas, renderer.toLogical);
  let world;
  let state;

  function freshState() {
    world = createWorld(seed);
    const p = createPlayer(world);
    state = {
      world,
      rng: makeRandom(seed ^ 0x9e3779b9),
      time: 0,
      player: p,
      cars: [],
      peds: [],
      bullets: [],
      particles: [],
      wanted: 0,
      wantedTimer: 0,
      policeTimer: 2,
      trafficTimer: 0.4,
      pedTimer: 0.2,
      mission: createMission(world),
      money: 0,
      camera: clampCamera(world, p.x - FIELD.width / 2, p.y - FIELD.height / 2),
      shake: 0,
      message: '',
      messageTime: 0,
      events: [],
      busted: false,
      saveTimer: 0,
      stats: { shots: 0, cars: 0, jobs: 0 },
    };
    return state;
  }

  function reset() {
    freshState();
    for (let i = 0; i < 14; i += 1) state.peds.push(createPed(world, state.rng));
    return state;
  }

  function say(text, seconds) {
    state.message = text;
    state.messageTime = seconds || 3;
  }

  function addWanted(amount) {
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
    if (state.wanted > 0) state.wantedTimer = WANTED.decayDelay;
  }

  function damagePlayer(amount) {
    if (state.player.hurtCd > 0 || state.busted) return;
    state.player.health = Math.max(0, state.player.health - amount);
    state.player.hurtCd = PLAYER.hurtDelay;
    state.shake = 6;
    state.events.push('hit');
    emitParticles(state, state.player.x, state.player.y, COLORS.red, 6, 60);
    if (state.player.health === 0) {
      state.busted = true;
      state.events.push('busted');
    }
  }

  /** Fill the starting scene for one of the four deterministic screenshot modes. */
  function prepare(scenario) {
    reset();
    const p = state.player;
    if (scenario === 'street') {
      const x = 3 * CITY.cell + CITY.road / 2;
      const y = 3 * CITY.cell + CITY.road * 0.7;
      const car = createCar(world, state.rng, {
        kind: 'civil', x, y, angle: 0, dir: 0, lane: y,
        speed: 150, targetSpeed: 200, color: '#4f6b7a',
      });
      state.cars.push(car);
      p.car = car;
      p.x = x;
      p.y = y;
      p.angle = 0;
      p.ammo = 42;
      state.money = 260;
      for (let i = 0; i < 9; i += 1) state.cars.push(spawnCivilianCar(world, state.rng, p));
      for (let i = 0; i < 18; i += 1) state.peds.push(createPed(world, state.rng));
    } else if (scenario === 'chase') {
      p.x = 4 * CITY.cell + CITY.road / 2;
      p.y = 3 * CITY.cell + CITY.road / 2;
      const car = createCar(world, state.rng, {
        kind: 'civil', x: p.x, y: p.y, angle: 0, dir: 0,
        lane: p.y, speed: 170, targetSpeed: 240, color: '#a8433e',
      });
      state.cars.push(car);
      p.car = car;
      p.ammo = 38;
      state.money = 1240;
      state.wanted = 5;
      state.wantedTimer = 999;
      // Police are placed on the same horizontal road, ahead and behind, so the pursuit reads in
      // a still frame instead of happening just off camera.
      const offsets = [[310, -26], [430, 24], [545, -14], [-285, 22], [-420, -24]];
      for (const [dx, dy] of offsets) {
        state.cars.push(createCar(world, state.rng, {
          kind: 'police', x: p.x + dx, y: p.y + dy,
          angle: Math.atan2(p.y - (p.y + dy), p.x - (p.x + dx)),
          targetSpeed: 250, color: COLORS.policeBody,
        }));
      }
      for (let i = 0; i < 8; i += 1) state.peds.push(createPed(world, state.rng));
    } else if (scenario === 'mission') {
      p.x = world.points.store.x + 72;
      p.y = world.points.store.y + 78;
      p.ammo = 30;
      state.money = 480;
      state.mission.index = 1;
      for (let i = 0; i < 6; i += 1) state.peds.push(createPed(world, state.rng));
    }
    state.camera = clampCamera(world, p.x - FIELD.width / 2, p.y - FIELD.height / 2);
    state.events.length = 0;
    return state;
  }

  function save() {
    const p = state.player;
    return {
      v: 1,
      money: Math.round(state.money),
      health: Math.round(p.health),
      ammo: p.ammo,
      wanted: state.wanted,
      x: Math.round(p.x),
      y: Math.round(p.y),
      missionIndex: state.mission.index,
      completed: state.mission.completed.slice(),
      jobs: state.mission.jobsDone,
    };
  }

  function applySave(data) {
    if (!data || data.v !== 1) return;
    reset();
    const p = state.player;
    p.x = clamp(Number(data.x) || p.x, 20, world.width - 20);
    p.y = clamp(Number(data.y) || p.y, 20, world.landHeight - 20);
    p.health = clamp(Number(data.health) || 100, 1, 100);
    p.ammo = clamp(Number(data.ammo) || 0, 0, 999);
    state.money = Math.max(0, Math.round(Number(data.money) || 0));
    state.wanted = clamp(Number(data.wanted) || 0, 0, WANTED.max);
    state.mission.index = clamp(Number(data.missionIndex) || 0, 0, 2);
    if (Array.isArray(data.completed)) state.mission.completed = data.completed.slice(0, 3);
    state.mission.jobsDone = Number(data.jobs) || 0;
    state.camera = clampCamera(world, p.x - FIELD.width / 2, p.y - FIELD.height / 2);
  }

  function enterOrExit() {
    const p = state.player;
    if (p.car) {
      const car = p.car;
      const side = car.angle + Math.PI / 2;
      const spot = collideCircle(world, car.x + Math.cos(side) * 38, car.y + Math.sin(side) * 38, PLAYER.radius);
      p.x = spot.x;
      p.y = spot.y;
      p.angle = car.angle;
      p.car = null;
      car.speed *= 0.25;
      car.exitCd = 0.8;
      state.events.push('enter');
      say('On foot.');
      return;
    }
    const target = p.nearCar;
    if (!target || target.wrecked) {
      say('No car close enough.');
      return;
    }
    p.car = target;
    p.x = target.x;
    p.y = target.y;
    p.angle = target.angle;
    state.stats.cars += 1;
    if (target.kind === 'police') {
      addWanted(WANTED.stealStars);
      say('Car stolen. Cops are on you!');
      state.events.push('alarm');
    } else {
      say('Engine running.');
    }
    state.events.push('enter');
  }

  function step(dt, command, options = {}) {
    const cmd = command || IDLE;
    state.time += dt;
    state.events.length = 0;
    if (state.messageTime > 0) state.messageTime = Math.max(0, state.messageTime - dt);
    state.shake = Math.max(0, state.shake - dt * 20);
    if (options.frozen || state.busted) return state.events;

    const p = state.player;
    p.fireCd = Math.max(0, p.fireCd - dt);
    p.hurtCd = Math.max(0, p.hurtCd - dt);

    if (p.car) {
      const car = p.car;
      const throttle = -cmd.moveY;
      const steer = cmd.moveX;
      if (throttle > 0) car.speed += CAR.accel * throttle * dt;
      else if (throttle < 0) car.speed -= (car.speed > 10 ? CAR.brake : CAR.reverseAccel) * dt;
      else car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.drag * 26 * dt);
      car.speed = clamp(car.speed, -110, CAR.maxSpeed);
      if (Math.abs(car.speed) > 4) {
        car.angle += steer * CAR.turnRate * dt * Math.min(1, Math.abs(car.speed) / 95) * (car.speed < 0 ? -1 : 1);
      }
      const solved = collideCircle(world, car.x + Math.cos(car.angle) * car.speed * dt, car.y + Math.sin(car.angle) * car.speed * dt, CAR.radius);
      if (solved.hit) {
        if (Math.abs(car.speed) > 80) {
          damagePlayer(Math.min(12, Math.abs(car.speed) * 0.05));
          state.events.push('crash');
        }
        car.speed *= -0.18;
      }
      car.x = solved.x;
      car.y = solved.y;
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.vx = Math.cos(car.angle) * car.speed;
      p.vy = Math.sin(car.angle) * car.speed;
      p.nearCar = null;
    } else {
      let mx = cmd.moveX;
      let my = cmd.moveY;
      const length = Math.hypot(mx, my);
      if (length > 1) {
        mx /= length;
        my /= length;
      }
      const speed = cmd.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
      const solved = collideCircle(world, p.x + mx * speed * dt, p.y + my * speed * dt, PLAYER.radius);
      p.vx = (solved.x - p.x) / dt;
      p.vy = (solved.y - p.y) / dt;
      p.x = solved.x;
      p.y = solved.y;
      p.angle = Math.atan2(cmd.aimY - p.y, cmd.aimX - p.x);
      if (length > 0.1) p.walkPhase += dt * (cmd.sprint ? 17 : 11);
      let nearest = null;
      let best = PLAYER.enterRange;
      for (const car of state.cars) {
        if (car.wrecked || car.exitCd > 0) continue;
        const d = Math.hypot(car.x - p.x, car.y - p.y);
        if (d < best) {
          best = d;
          nearest = car;
        }
      }
      p.nearCar = nearest;
    }

    const originX = p.car ? p.car.x : p.x;
    const originY = p.car ? p.car.y : p.y;
    const aim = Number.isFinite(cmd.aimX) && Number.isFinite(cmd.aimY)
      ? Math.atan2(cmd.aimY - originY, cmd.aimX - originX)
      : p.angle;
    if (cmd.shoot && p.fireCd <= 0) {
      if (p.ammo <= 0) {
        p.fireCd = 0.35;
        state.events.push('dry');
      } else {
        p.ammo -= 1;
        p.fireCd = PLAYER.fireDelay;
        p.shotCount += 1;
        state.stats.shots += 1;
        const spread = (state.rng() - 0.5) * 0.05;
        spawnBullet(state, originX + Math.cos(aim) * 26, originY + Math.sin(aim) * 26, aim + spread, PLAYER.bulletSpeed, 'player');
        p.heat += 1 / WANTED.shotsPerStar;
        while (p.heat >= 1) {
          p.heat -= 1;
          addWanted(1);
        }
        state.shake = Math.max(state.shake, 1.5);
      }
    }

    if (cmd.enter) enterOrExit();
    if (cmd.interact) {
      if (!missionInteract(state.mission, state)) {
        say('Nothing to use here.');
      } else {
        state.events.push('ui');
      }
    }

    // Traffic, pedestrians and emergency response.
    state.trafficTimer -= dt;
    if (state.trafficTimer <= 0) {
      state.trafficTimer = 0.9 + state.rng() * 1.5;
      const count = state.cars.reduce((n, c) => n + (c.kind === 'civil' ? 1 : 0), 0);
      if (count < TRAFFIC_LIMIT) state.cars.push(spawnCivilianCar(world, state.rng, p));
    }
    state.pedTimer -= dt;
    if (state.pedTimer <= 0) {
      state.pedTimer = 0.5 + state.rng() * 1.2;
      if (state.peds.length < PED_LIMIT) state.peds.push(createPed(world, state.rng));
    }
    state.policeTimer -= dt;
    const police = state.cars.filter((c) => c.kind === 'police' && !c.wrecked).length;
    const quota = state.wanted > 0 ? Math.min(6, state.wanted + 1) : 0;
    if (police < quota && state.policeTimer <= 0) {
      state.cars.push(spawnPoliceCar(world, p, state.wanted, state.rng));
      state.policeTimer = POLICE.spawnDelay;
    }

    for (let i = state.cars.length - 1; i >= 0; i -= 1) {
      const car = state.cars[i];
      car.exitCd = Math.max(0, (car.exitCd || 0) - dt);
      updateCar(car, state, dt);
      const distance = Math.hypot(car.x - p.x, car.y - p.y);
      if (car.wrecked || (distance > 2300 && car.kind === 'civil') || (state.wanted === 0 && car.kind === 'police' && distance > 1700)) {
        state.cars.splice(i, 1);
        continue;
      }
      if (car.kind === 'police' && distance < 42 && p.hurtCd <= 0) {
        damagePlayer(11);
        car.speed *= 0.65;
        const angle = Math.atan2(p.y - car.y, p.x - car.x);
        const shove = collideCircle(world, p.x + Math.cos(angle) * 24, p.y + Math.sin(angle) * 24, PLAYER.radius);
        p.x = shove.x;
        p.y = shove.y;
      }
    }
    for (const ped of state.peds) updatePed(ped, state, dt);

    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.x > world.width || b.y < 0 || b.y > world.height || pointInBuilding(world, b.x, b.y);
      if (!dead && b.owner === 'player') {
        for (let j = state.cars.length - 1; j >= 0; j -= 1) {
          const car = state.cars[j];
          if (Math.hypot(car.x - b.x, car.y - b.y) > 28) continue;
          dead = true;
          emitParticles(state, b.x, b.y, COLORS.gold, 5, 55);
          if (car.kind === 'police') {
            car.health -= 22;
            state.events.push('hit');
            if (car.health <= 0) {
              emitParticles(state, car.x, car.y, '#ff9a4d', 20, 170);
              state.cars.splice(j, 1);
              state.money += 90;
              p.money = state.money;
              state.events.push('crash');
              say('Police car down. +$90');
            }
          } else {
            addWanted(1);
            car.wrecked = true;
            emitParticles(state, car.x, car.y, '#ffcb63', 12, 110);
            state.events.push('crash');
          }
          break;
        }
        if (!dead) {
          for (const ped of state.peds) {
            if (ped.down > 0 || Math.hypot(ped.x - b.x, ped.y - b.y) > 11) continue;
            ped.down = 9;
            dead = true;
            addWanted(1);
            state.events.push('hit');
            break;
          }
        }
      } else if (!dead && Math.hypot(p.x - b.x, p.y - b.y) < (p.car ? 27 : 15)) {
        damagePlayer(p.car ? 5 : POLICE.damage);
        dead = true;
      }
      if (dead) state.bullets.splice(i, 1);
    }

    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const particle = state.particles[i];
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.94;
      particle.vy *= 0.94;
      if (particle.life <= 0) state.particles.splice(i, 1);
    }

    if (state.wanted > 0) {
      const hiding = state.mission.active && state.mission.index === 2;
      state.wantedTimer -= dt * (hiding ? 3 : 1);
      if (state.wantedTimer <= 0) {
        state.wanted -= 1;
        state.wantedTimer = state.wanted > 0 ? WANTED.decayStep : 0;
        if (state.wanted === 0) say('The heat is off.');
      }
    }

    updateMission(state.mission, state, dt);
    if (state.events.includes('missionDone')) {
      state.stats.jobs = state.mission.jobsDone;
      p.money = state.money;
    }

    const target = clampCamera(world, p.x - FIELD.width / 2, p.y - FIELD.height / 2);
    const follow = Math.min(1, dt * 7);
    state.camera.x += (target.x - state.camera.x) * follow;
    state.camera.y += (target.y - state.camera.y) * follow;

    state.saveTimer += dt;
    return state.events;
  }

  function draw(screen, ui) {
    renderer.draw(state, screen, ui || { pointerX: FIELD.width / 2, pointerY: FIELD.height / 2, muted: false, hasSave: false });
  }

  function playEvents(events) {
    if (!audio) return;
    const seen = new Set();
    for (const name of events) {
      if (seen.has(name)) continue;
      seen.add(name);
      audio.play(name);
    }
  }

  // A fresh world exists from the moment the game is created, even before "new game" is pressed.
  reset();

  return {
    state: () => state,
    input,
    audio,
    reset,
    prepare,
    applySave,
    save,
    step,
    draw,
    playEvents,
    toggleMute() {
      if (!audio) return false;
      audio.setMuted(!audio.isMuted());
      return audio.isMuted();
    },
  };
}

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && data.v === 1 ? data : null;
  } catch {
    return null;
  }
}

function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // Private browsing can refuse storage: the game still plays, it just will not persist.
  }
}

function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear when storage is disabled.
  }
}

/** Entry point used by index.html. Also handles the four URL-selected screenshot scenes. */
export function boot() {
  const canvas = document.getElementById('game');
  const status = document.getElementById('status');
  const params = new URLSearchParams(window.location.search);
  const shotName = params.get('shot');
  const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
  const seed = Number.isInteger(seedParam) ? seedParam : 7;
  const game = createGame(canvas, { seed, silent: Boolean(shotName) && ['start', 'street', 'chase', 'mission'].includes(shotName) });
  // A small read-only handle for debugging and automated checks; the game never depends on it.
  window.__portVesper = game;

  function announce(message) {
    if (status) status.textContent = message;
  }

  if (shotName && ['start', 'street', 'chase', 'mission'].includes(shotName)) {
    const plan = planShot(shotName, seed);
    game.prepare(plan.scenario);
    for (let i = 0; i < plan.steps; i += 1) game.step(STEP, plan.input(i, game.state()));
    let painted = 0;
    function paintShot() {
      game.draw(plan.screen, {
        pointerX: plan.pointerX,
        pointerY: plan.pointerY,
        muted: false,
        hasSave: false,
      });
      painted += 1;
      if (painted < 2) requestAnimationFrame(paintShot);
      else {
        window.__shotReady = true;
        window.__shotName = shotName;
        announce(`${shotName} screenshot ready.`);
      }
    }
    requestAnimationFrame(paintShot);
    // A viewport change resizes (and clears) the canvas: repaint the staged frame after it.
    window.addEventListener('resize', () => {
      painted = 1;
      requestAnimationFrame(paintShot);
    });
    return;
  }

  let hasSave = readSave() !== null;
  let screen = SCREEN.START;
  let last = performance.now();
  let accumulator = 0;
  const input = game.input;

  function begin(fromSave) {
    if (fromSave) {
      const data = readSave();
      if (data) game.applySave(data);
      else game.reset();
    } else {
      game.reset();
      writeSave(game.save());
      hasSave = true;
    }
    if (game.audio) game.audio.unlock();
    screen = SCREEN.PLAY;
    accumulator = 0;
    announce('Playing Port Vesper. Three jobs are waiting.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, 0.25);
    last = now;
    const actions = input.takeActions();
    if (actions.mute) {
      const muted = game.toggleMute();
      announce(muted ? 'Sound muted.' : 'Sound on.');
    }
    if (screen === SCREEN.START) {
      if (actions.restart) {
        clearSave();
        hasSave = false;
        announce('Save cleared.');
      } else if (actions.confirm || actions.click) begin(false);
      else if (actions.continue && hasSave) begin(true);
    } else if (screen === SCREEN.PLAY) {
      if (actions.pause) {
        screen = SCREEN.PAUSED;
        accumulator = 0;
        announce('Paused.');
      } else {
        let interact = actions.interact;
        let enter = actions.confirm;
        while (accumulator >= STEP && screen === SCREEN.PLAY) {
          const snapshot = input.snapshot(game.state().camera);
          snapshot.interact = interact;
          snapshot.enter = enter;
          interact = false;
          enter = false;
          const events = game.step(STEP, snapshot);
          game.playEvents(events);
          if (events.includes('missionDone')) {
            writeSave(game.save());
            announce(game.state().message);
          }
          accumulator -= STEP;
          if (game.state().busted) {
            screen = SCREEN.OVER;
            accumulator = 0;
            announce('Busted. Press Enter to start over.');
            break;
          }
        }
        const data = game.save();
        if (data && game.state().saveTimer > 6) {
          game.state().saveTimer = 0;
          writeSave(data);
        }
      }
    } else if (screen === SCREEN.PAUSED && (actions.pause || actions.confirm || actions.click)) {
      screen = SCREEN.PLAY;
      announce('Playing.');
    } else if (screen === SCREEN.OVER && (actions.confirm || actions.click)) {
      begin(false);
    }

    if (screen !== SCREEN.PLAY) {
      game.step(STEP, IDLE, { frozen: true });
      accumulator = 0;
    }
    if (game.audio) game.audio.update(game.state());
    const pointer = input.snapshot(game.state().camera);
    game.draw(screen, {
      pointerX: pointer.pointerX,
      pointerY: pointer.pointerY,
      muted: game.audio ? game.audio.isMuted() : false,
      hasSave,
    });
    if (screen === SCREEN.PLAY && game.state().messageTime > 0) announce(game.state().message);
  }

  announce('Port Vesper. Press Enter to start.');
  requestAnimationFrame(frame);
}

boot();
