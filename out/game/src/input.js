// PORT VESPER - keyboard and mouse. Held keys are read every frame; one-shot presses are queued as
// small action flags so a tap between two frames is never dropped or counted twice.

const KEY_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyM', 'KeyP', 'Escape', 'Enter', 'KeyC', 'KeyR',
]);

export function createInput(canvas, toLogical) {
  const keys = new Set();
  const actions = { confirm: false, interact: false, mute: false, pause: false, continue: false, restart: false, click: false };
  let pointer = { x: 640, y: 360 };
  let firing = false;

  function movePointer(event) {
    pointer = toLogical(event.clientX, event.clientY);
  }

  window.addEventListener('keydown', (event) => {
    if (!KEY_CODES.has(event.code)) return;
    event.preventDefault();
    keys.add(event.code);
    if (event.repeat) return;
    if (event.code === 'Space' || event.code === 'Enter') actions.confirm = true;
    else if (event.code === 'KeyE') actions.interact = true;
    else if (event.code === 'KeyM') actions.mute = true;
    else if (event.code === 'KeyP' || event.code === 'Escape') actions.pause = true;
    else if (event.code === 'KeyC') actions.continue = true;
    else if (event.code === 'KeyR') actions.restart = true;
  });

  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });

  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
  });

  canvas.addEventListener('pointermove', movePointer);
  canvas.addEventListener('pointerdown', (event) => {
    movePointer(event);
    if (event.button === 0) {
      firing = true;
      actions.click = true;
    }
    event.preventDefault();
  });
  window.addEventListener('pointerup', () => { firing = false; });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The current control state, with the mouse translated into world coordinates. */
    snapshot(camera) {
      const left = keys.has('KeyA') || keys.has('ArrowLeft');
      const right = keys.has('KeyD') || keys.has('ArrowRight');
      const up = keys.has('KeyW') || keys.has('ArrowUp');
      const down = keys.has('KeyS') || keys.has('ArrowDown');
      return {
        moveX: (right ? 1 : 0) - (left ? 1 : 0),
        moveY: (down ? 1 : 0) - (up ? 1 : 0),
        sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
        shoot: firing,
        aimX: camera.x + pointer.x,
        aimY: camera.y + pointer.y,
        pointerX: pointer.x,
        pointerY: pointer.y,
      };
    },
    /** Staged presses since the previous call; calling clears them. */
    takeActions() {
      const taken = { ...actions };
      for (const key of Object.keys(actions)) actions[key] = false;
      return taken;
    },
  };
}
