// PORT VESPER - the three short jobs. A mission is a tiny state machine: find a marker, press E,
// do the step, collect the payoff. The world never decides what a job is; it only holds markers
// and fires events that the game turns into sound, money and police attention.

const NAMES = ['PACKAGE RUN', 'MARKET HEIST', 'SHAKE THE HEAT'];
const PAY = [320, 680, 460];

export function createMission(world) {
  return {
    index: 0,
    stage: 0,
    active: false,
    timer: 0,
    flash: 0,
    completed: [false, false, false],
    jobsDone: 0,
    points: world.points,
  };
}

/** Where the glowing objective marker sits right now. */
export function markerFor(m, state) {
  const p = m.points;
  if (state.wanted === 0 && m.index === 2 && !m.active) {
    return { x: p.safehouse.x, y: p.safehouse.y, label: 'SAFEHOUSE', locked: true };
  }
  if (!m.active) {
    if (m.index === 0) return { x: p.pickup.x, y: p.pickup.y, label: 'PICKUP', locked: false };
    if (m.index === 1) return { x: p.store.x, y: p.store.y, label: 'VESPER MART', locked: false };
    return { x: p.safehouse.x, y: p.safehouse.y, label: 'SAFEHOUSE', locked: m.completed[2] };
  }
  if (m.index === 0) {
    return m.stage === 0
      ? { x: p.pickup.x, y: p.pickup.y, label: 'COLLECT PARCEL', locked: false }
      : { x: p.dropoff.x, y: p.dropoff.y, label: 'DROP AT PIER', locked: false };
  }
  if (m.index === 1) return { x: p.store.x, y: p.store.y, label: 'CRACK THE SAFE', locked: false };
  return { x: p.safehouse.x, y: p.safehouse.y, label: 'SAFEHOUSE', locked: false };
}

/** The two lines shown in the objective panel, plus the marker's distance for the HUD. */
export function objectiveFor(m, state) {
  const name = NAMES[m.index];
  if (!m.active) {
    const extra = m.index === 2 && state.wanted === 0 ? 'Get wanted first, then come back.' : 'Press E at the glowing marker to start.';
    return { title: `NEXT JOB: ${name}`, detail: extra };
  }
  if (m.index === 0 && m.stage === 1) return { title: name, detail: 'Take the parcel to the pier.' };
  if (m.index === 1 && m.stage === 1) return { title: name, detail: `Cracking the safe... ${Math.ceil(m.timer)}s` };
  if (m.index === 2) return { title: name, detail: state.wanted === 0 ? 'Heat is gone. Job complete.' : 'Lose the police. Stay out of sight.' };
  if (m.index === 1) return { title: name, detail: 'Hold position while the safe opens.' };
  return { title: name, detail: 'Grab the parcel at the marked lot.' };
}

function finish(m, state) {
  const index = m.index;
  const pay = PAY[index] * (m.completed[index] ? 0.5 : 1);
  state.money += Math.round(pay);
  state.player.money = state.money;
  state.events.push('missionDone');
  m.completed[index] = true;
  m.jobsDone += 1;
  m.active = false;
  m.stage = 0;
  m.index = (index + 1) % 3;
  m.flash = 2.5;
  state.message = `JOB COMPLETE  +$${Math.round(pay)}`;
  state.messageTime = 3.5;
  if (index === 2) {
    state.player.health = Math.min(100, state.player.health + 25);
    state.player.ammo += 12;
  }
}

/** E near the current marker. Returns true when a press was consumed. */
export function interact(m, state) {
  const marker = markerFor(m, state);
  const dx = marker.x - state.player.x;
  const dy = marker.y - state.player.y;
  if (Math.hypot(dx, dy) > 92) return false;
  if (marker.locked) {
    state.message = 'Come back when the police are on you.';
    state.messageTime = 2.5;
    state.events.push('denied');
    return true;
  }
  if (!m.active) {
    m.active = true;
    m.stage = 0;
    m.timer = 0;
    state.events.push('missionStart');
    state.message = m.index === 2 ? 'SHAKE THE HEAT started. Lose the cops.' : `${NAMES[m.index]} started.`;
    state.messageTime = 3;
    return true;
  }
  if (m.index === 0) {
    if (m.stage === 0) {
      m.stage = 1;
      state.events.push('pickup');
      state.message = 'Parcel collected. Head for the pier.';
      state.messageTime = 3;
    } else {
      finish(m, state);
    }
    return true;
  }
  if (m.index === 1 && m.stage === 0) {
    m.stage = 1;
    m.timer = 4;
    state.events.push('safeStart');
    state.message = 'Safe opening. Keep an eye out.';
    state.messageTime = 2.5;
    return true;
  }
  return false;
}

export function updateMission(m, state, dt) {
  m.flash = Math.max(0, m.flash - dt);
  if (!m.active) return;
  if (m.index === 1 && m.stage === 1) {
    m.timer -= dt;
    if (m.timer <= 0) {
      state.wanted = Math.max(state.wanted, 3);
      state.wantedTimer = 18;
      state.events.push('alarm');
      state.message = 'ALARM! The cops are coming.';
      state.messageTime = 3;
      finish(m, state);
    }
  } else if (m.index === 2 && state.wanted === 0) {
    finish(m, state);
  }
}
