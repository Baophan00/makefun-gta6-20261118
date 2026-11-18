// PORT VESPER - deterministic screenshot scenes. A plan names the starting scenario, the screen to
// draw, how many fixed steps to run and a scripted control input for each step. Because the world
// and every input come from the seed, the same query always produces the very same frame.

import { FIELD } from './config.js';

export const SHOTS = ['start', 'street', 'chase', 'mission'];

const BASE = {
  moveX: 0, moveY: 0, sprint: false, shoot: false,
  aimX: 0, aimY: 0, interact: false, enter: false,
};

/** The four plans used by ?shot=start|street|chase|mission&seed=7. */
export function planShot(name) {
  if (name === 'chase') {
    return {
      scenario: 'chase',
      screen: 'play',
      steps: 84,
      pointerX: 884,
      pointerY: 344,
      input(index, state) {
        let cop = null;
        for (const car of state.cars) {
          if (car.kind === 'police' && car.x > state.player.x) {
            cop = car;
            break;
          }
        }
        if (!cop) cop = state.cars.find((car) => car.kind === 'police') || null;
        return {
          ...BASE,
          moveX: Math.sin(index / 30) * 0.32,
          moveY: -1,
          shoot: index % 16 < 4,
          aimX: cop ? cop.x : state.player.x + 320,
          aimY: cop ? cop.y : state.player.y - 40,
        };
      },
    };
  }

  if (name === 'mission') {
    return {
      scenario: 'mission',
      screen: 'play',
      steps: 54,
      pointerX: 760,
      pointerY: 380,
      input(index, state) {
        return {
          ...BASE,
          moveX: index < 18 ? -0.35 : 0,
          moveY: index < 18 ? -0.2 : 0,
          sprint: false,
          shoot: false,
          aimX: state.world.points.store.x,
          aimY: state.world.points.store.y,
        };
      },
    };
  }

  if (name === 'street') {
    return {
      scenario: 'street',
      screen: 'play',
      steps: 108,
      pointerX: 810,
      pointerY: 300,
      input(index, state) {
        return {
          ...BASE,
          moveX: 0.35 + Math.sin(index / 46) * 0.22,
          moveY: -0.62,
          sprint: index > 55,
          shoot: false,
          aimX: state.player.x + 280,
          aimY: state.player.y - 140,
        };
      },
    };
  }

  return {
    scenario: 'start',
    screen: 'start',
    steps: 66,
    pointerX: FIELD.width / 2,
    pointerY: FIELD.height / 2,
    input(index, state) {
      return {
        ...BASE,
        moveX: index < 34 ? 0.5 : 0,
        moveY: -0.35,
        aimX: state.player.x + 200,
        aimY: state.player.y - 60,
      };
    },
  };
}
