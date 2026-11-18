// PORT VESPER - drawing only. A top-down camera follows the player across the authored city; the
// view is exactly the browser window in CSS pixels, so no letterbox or stretched text. Everything
// is canvas paths and text, so the game stays self-contained and the shot modes use this same draw
// path as live play.

import { CITY, COLORS, FIELD, FONT, MONO, SCREEN, WANTED } from './config.js';
import { markerFor, objectiveFor } from './mission.js';

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function star(ctx, cx, cy, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    FIELD.width = Math.max(640, Math.round(window.innerWidth));
    FIELD.height = Math.max(420, Math.round(window.innerHeight));
    canvas.width = Math.round(FIELD.width * dpr);
    canvas.height = Math.round(FIELD.height * dpr);
    view.dpr = dpr;
    // One logical unit is one CSS pixel: the whole canvas is the playfield, with no bars.
    view.scale = dpr;
    view.ox = 0;
    view.oy = 0;
  }

  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(FIELD.width, clientX - rect.left)),
      y: Math.max(0, Math.min(FIELD.height, clientY - rect.top)),
    };
  }

  let fontCache = '';
  function font(size, weight, family) {
    const value = `${weight || ''} ${size}px ${family || FONT}`.trim();
    if (value !== fontCache) {
      ctx.font = value;
      fontCache = value;
    }
  }

  function text(value, x, y, size, color, align, weight, family) {
    font(size, weight, family);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.fillText(value, x, y);
  }

  function panel(x, y, w, h, alpha) {
    ctx.fillStyle = `rgba(9, 15, 22, ${alpha === undefined ? 0.8 : alpha})`;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawCity(state) {
    const world = state.world;
    const cam = state.camera;
    const t = state.time;
    const left = cam.x - 60;
    const right = cam.x + FIELD.width + 60;
    const top = cam.y - 60;
    const bottom = cam.y + FIELD.height + 60;
    const shake = state.shake > 0 ? state.shake : 0;
    const sx = shake ? Math.sin(t * 71) * shake : 0;
    const sy = shake ? Math.cos(t * 83) * shake : 0;
    ctx.save();
    ctx.translate(-cam.x + sx, -cam.y + sy);

    ctx.fillStyle = COLORS.land;
    ctx.fillRect(0, 0, world.width, world.landHeight);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, world.landHeight, world.width, world.height - world.landHeight);
    ctx.fillStyle = COLORS.waterDeep;
    ctx.fillRect(0, world.landHeight + 46, world.width, world.height - world.landHeight - 46);

    // Water ripples: a slow, deterministic sine that needs no image or texture.
    ctx.strokeStyle = 'rgba(150,215,225,0.16)';
    ctx.lineWidth = 2;
    for (let y = world.landHeight + 22; y < world.height; y += 32) {
      ctx.beginPath();
      for (let x = Math.max(0, left - 40); x < Math.min(world.width, right + 40); x += 22) {
        const wave = y + Math.sin(x * 0.018 + t * 1.6 + y * 0.07) * 4;
        if (x === Math.max(0, left - 40)) ctx.moveTo(x, wave);
        else ctx.lineTo(x, wave);
      }
      ctx.stroke();
    }

    ctx.fillStyle = COLORS.road;
    for (const x of world.roadsV) ctx.fillRect(x, 0, CITY.road, world.landHeight);
    for (const y of world.roadsH) ctx.fillRect(0, y, world.width, CITY.road);
    ctx.fillStyle = COLORS.intersection;
    for (const x of world.roadsV) {
      for (const y of world.roadsH) {
        if (x + CITY.road < left || x > right || y + CITY.road < top || y > bottom) continue;
        ctx.fillRect(x, y, CITY.road, CITY.road);
      }
    }

    // Pavement rings and buildings.
    for (const block of world.blocks) {
      if (block.x + block.w < left || block.x > right || block.y + block.h < top || block.y > bottom) continue;
      ctx.fillStyle = COLORS.curb;
      ctx.fillRect(block.x - 4, block.y - 4, block.w + 8, block.h + 8);
      ctx.fillStyle = block.kind === 'P' ? COLORS.park : COLORS.sidewalk;
      ctx.fillRect(block.x, block.y, block.w, block.h);
      if (block.kind === 'P') {
        ctx.fillStyle = COLORS.parkPath;
        ctx.fillRect(block.x, block.cy - 9, block.w, 18);
        ctx.fillRect(block.cx - 9, block.y, 18, block.h);
        ctx.beginPath();
        ctx.arc(block.cx, block.cy, 27, 0, Math.PI * 2);
        ctx.fillStyle = '#7cb3c4';
        ctx.fill();
        ctx.strokeStyle = COLORS.parkPath;
        ctx.lineWidth = 4;
        ctx.stroke();
      }
      if (block.kind === 'O') {
        ctx.fillStyle = '#5b6168';
        ctx.fillRect(block.x + 26, block.y + 26, block.w - 52, block.h - 52);
        ctx.strokeStyle = 'rgba(240,230,190,0.45)';
        ctx.lineWidth = 1;
        for (let n = 1; n < 4; n += 1) {
          ctx.beginPath();
          ctx.moveTo(block.x + 26 + n * ((block.w - 52) / 4), block.y + 34);
          ctx.lineTo(block.x + 26 + n * ((block.w - 52) / 4), block.y + block.h - 34);
          ctx.stroke();
        }
      }
    }

    for (const b of world.buildings) {
      if (b.x + b.w < left || b.x > right || b.y + b.h < top || b.y > bottom) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 7, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(20,24,28,0.35)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b.x + 0.75, b.y + 0.75, b.w - 1.5, b.h - 1.5);
      ctx.fillStyle = COLORS.roofDetail;
      ctx.fillRect(b.x + 9, b.y + 9, b.w - 18, Math.min(16, b.h * 0.14));
      for (let n = 0; n < b.vents; n += 1) {
        const vx = b.x + 16 + ((n * 47) % Math.max(20, b.w - 40));
        const vy = b.y + 34 + ((n * 61) % Math.max(20, b.h - 56));
        ctx.fillStyle = 'rgba(40,44,48,0.35)';
        ctx.fillRect(vx, vy, 12, 10);
      }
      if (b.kind === 'market') {
        const stripes = 10;
        const sw = b.w / stripes;
        for (let n = 0; n < stripes; n += 1) {
          ctx.fillStyle = n % 2 ? '#d94f48' : '#f2e6ce';
          ctx.fillRect(b.x + n * sw, b.y + b.h - 14, sw, 14);
        }
      }
      if (b.w > 78 && b.h > 62) {
        text(b.label, b.x + b.w / 2, b.y + b.h * 0.62, b.kind === 'tower' ? 15 : 14, 'rgba(255,255,255,0.78)', 'center', 'bold');
      }
    }

    // Lane dashes and crosswalks.
    ctx.strokeStyle = COLORS.roadLine;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    ctx.setLineDash([20, 24]);
    for (const x of world.roadsV) {
      if (x + CITY.road < left || x > right) continue;
      ctx.beginPath();
      ctx.moveTo(x + CITY.road / 2, Math.max(0, top));
      ctx.lineTo(x + CITY.road / 2, Math.min(world.landHeight, bottom));
      ctx.stroke();
    }
    for (const y of world.roadsH) {
      if (y + CITY.road < top || y > bottom) continue;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, left), y + CITY.road / 2);
      ctx.lineTo(Math.min(world.width, right), y + CITY.road / 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    ctx.fillStyle = COLORS.crosswalk;
    for (const x of world.roadsV) {
      if (x + CITY.road < left || x > right) continue;
      for (const y of world.roadsH) {
        if (y + CITY.road < top || y > bottom) continue;
        for (let n = 0; n < 7; n += 1) {
          const offset = 8 + n * 16;
          ctx.globalAlpha = 0.55;
          ctx.fillRect(x + offset, y + 6, 8, 16);
          ctx.fillRect(x + offset, y + CITY.road - 22, 8, 16);
          ctx.fillRect(x + 6, y + offset, 16, 8);
          ctx.fillRect(x + CITY.road - 22, y + offset, 16, 8);
        }
        ctx.globalAlpha = 1;
      }
    }

    // Street lamps at the junction corners.
    for (const lamp of world.lamps) {
      if (lamp.x < left || lamp.x > right || lamp.y < top || lamp.y > bottom) continue;
      ctx.fillStyle = 'rgba(255,224,150,0.18)';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#c9b98a';
      ctx.beginPath();
      ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const tree of world.trees) {
      if (tree.x < left || tree.x > right || tree.y < top || tree.y > bottom) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.ellipse(tree.x + 4, tree.y + 5, tree.r, tree.r * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = tree.tone ? COLORS.treeLight : COLORS.tree;
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(tree.x - tree.r * 0.3, tree.y - tree.r * 0.3, tree.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }

    // The pier and a small boat on the water.
    const pier = world.pier;
    ctx.fillStyle = COLORS.pierDark;
    ctx.fillRect(pier.x - 5, pier.y - 5, pier.w + 10, pier.h + 10);
    ctx.fillStyle = COLORS.pier;
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.strokeStyle = 'rgba(60,40,20,0.35)';
    ctx.lineWidth = 1;
    for (let y = pier.y + 8; y < pier.y + pier.h; y += 14) {
      ctx.beginPath();
      ctx.moveTo(pier.x, y);
      ctx.lineTo(pier.x + pier.w, y);
      ctx.stroke();
    }
    const boatX = 1830 + Math.sin(t * 0.3) * 60;
    const boatY = world.landHeight + 120 + Math.cos(t * 0.4) * 12;
    ctx.fillStyle = '#e5ddc8';
    roundRect(ctx, boatX, boatY, 64, 20, 8);
    ctx.fill();
    ctx.fillStyle = '#6f93a1';
    ctx.fillRect(boatX + 22, boatY - 12, 20, 12);

    // Street names, drawn only where they might be visible.
    ctx.globalAlpha = 0.45;
    for (const x of world.roadsV) {
      if (x + CITY.road < left || x > right) continue;
      const index = Math.round(x / CITY.cell);
      const y = Math.max(top + 30, Math.min(bottom - 30, Math.round(cam.y / CITY.cell) * CITY.cell + CITY.road / 2));
      ctx.save();
      ctx.translate(x + CITY.road / 2, y);
      ctx.rotate(-Math.PI / 2);
      text(CITY_NAMES[index % CITY_NAMES.length], 0, 0, 16, '#e6e2cd', 'center', 'bold');
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    drawActors(state, left, right, top, bottom);
    ctx.restore();
  }

  const CITY_NAMES = ['VESPER', 'MARINA', 'GRAND', 'CINDER', 'NORTH', 'DOCK', 'EAST', 'BAY'];

  function drawActors(state, left, right, top, bottom) {
    const t = state.time;
    for (const ped of state.peds) {
      if (ped.x < left || ped.x > right || ped.y < top || ped.y > bottom) continue;
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.scale(1.3, 1.3);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(2, 3, 9, 0, Math.PI * 2);
      ctx.fill();
      if (ped.down > 0) {
        ctx.fillStyle = ped.color;
        ctx.fillRect(-9, -4, 18, 8);
      } else {
        const swing = Math.sin(ped.phase) * 3;
        ctx.strokeStyle = '#2d3340';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-3, 5); ctx.lineTo(-4 + swing, 11);
        ctx.moveTo(3, 5); ctx.lineTo(4 - swing, 11);
        ctx.stroke();
        ctx.fillStyle = ped.color;
        roundRect(ctx, -7, -7, 14, 14, 4);
        ctx.fill();
        ctx.fillStyle = ped.skin;
        ctx.beginPath();
        ctx.arc(0, -10, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    for (const car of state.cars) {
      if (car.x + 40 < left || car.x - 40 > right || car.y + 40 < top || car.y - 40 > bottom) continue;
      ctx.save();
      ctx.translate(car.x, car.y);
      ctx.rotate(car.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      roundRect(ctx, -25, -13, 52, 30, 7);
      ctx.fill();
      ctx.fillStyle = car.color;
      roundRect(ctx, -27, -15, 54, 30, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,16,22,0.55)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COLORS.glass;
      roundRect(ctx, -9, -12, 19, 24, 4);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.fillRect(12, -11, 9, 22);
      ctx.fillStyle = '#ffe9a8';
      ctx.fillRect(25, -10, 4, 5);
      ctx.fillRect(25, 5, 4, 5);
      ctx.fillStyle = '#a8443e';
      ctx.fillRect(-29, -10, 3, 5);
      ctx.fillRect(-29, 5, 3, 5);
      if (car.kind === 'police') {
        ctx.fillStyle = COLORS.policeTrim;
        ctx.fillRect(-6, -15, 12, 30);
        ctx.fillStyle = '#2d3f55';
        ctx.fillRect(-27, -15, 54, 3);
        ctx.fillRect(-27, 12, 54, 3);
        const flash = Math.sin(car.sirenPhase) > 0;
        ctx.fillStyle = flash ? COLORS.policeBlue : 'rgba(76,157,255,0.22)';
        ctx.beginPath(); ctx.arc(-3, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = flash ? 'rgba(255,90,85,0.22)' : COLORS.policeRed;
        ctx.beginPath(); ctx.arc(3, 0, 6, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = flash ? COLORS.policeBlue : COLORS.policeRed;
        ctx.beginPath(); ctx.arc(0, 0, 46, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    const player = state.player;
    if (!player.car && !(player.hurtCd > 0 && Math.floor(t * 14) % 2 === 0)) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.scale(1.15, 1.15);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(3, 4, 13, 0, Math.PI * 2);
      ctx.fill();
      const swing = Math.sin(player.walkPhase) * 4;
      ctx.strokeStyle = '#303745';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-4, 6); ctx.lineTo(-5 + swing, 14);
      ctx.moveTo(4, 6); ctx.lineTo(5 - swing, 14);
      ctx.stroke();
      ctx.fillStyle = COLORS.playerDark;
      roundRect(ctx, -10, -10, 20, 19, 5);
      ctx.fill();
      ctx.fillStyle = COLORS.player;
      roundRect(ctx, -9, -11, 18, 17, 5);
      ctx.fill();
      ctx.rotate(player.angle);
      ctx.strokeStyle = '#2a2f38';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(24, 0);
      ctx.stroke();
      ctx.fillStyle = '#f2c46b';
      ctx.beginPath();
      ctx.arc(0, -2, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.lineCap = 'round';
    for (const b of state.bullets) {
      ctx.strokeStyle = b.owner === 'police' ? '#ff8d7a' : '#ffe28a';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;

    const marker = markerFor(state.mission, state);
    const pulse = Math.sin(t * 4) * 4;
    ctx.save();
    ctx.translate(marker.x, marker.y);
    ctx.strokeStyle = marker.locked ? 'rgba(190,200,205,0.75)' : COLORS.marker;
    ctx.fillStyle = marker.locked ? 'rgba(150,160,166,0.22)' : 'rgba(255,208,90,0.24)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 28 + pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.rotate(Math.PI / 4 + t * 0.8);
    ctx.fillStyle = marker.locked ? '#aeb8bc' : COLORS.marker;
    ctx.fillRect(-9, -9, 18, 18);
    ctx.restore();
    if (marker.x >= left && marker.x <= right) {
      text(marker.label, marker.x, marker.y - 52 - pulse, 17, marker.locked ? '#d6dee1' : '#ffe6a3', 'center', 'bold');
    }
  }

  function drawMinimap(state) {
    const x = FIELD.width - 234;
    const y = 58;
    const w = 216;
    const h = 176;
    panel(x, y, w, h);
    text('PORT VESPER', x + 10, y + 10, 14, COLORS.hudMuted, 'left', 'bold', MONO);
    const ix = x + 8;
    const iy = y + 24;
    const iw = w - 16;
    const ih = h - 32;
    const world = state.world;
    const scale = Math.min(iw / world.width, ih / world.height);
    const offX = ix + (iw - world.width * scale) / 2;
    const offY = iy + (ih - world.height * scale) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    ctx.fillStyle = COLORS.land;
    ctx.fillRect(offX, offY, world.width * scale, world.landHeight * scale);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(offX, offY + world.landHeight * scale, world.width * scale, (world.height - world.landHeight) * scale);
    ctx.fillStyle = COLORS.roadDark;
    for (const rx of world.roadsV) ctx.fillRect(offX + rx * scale, offY, CITY.road * scale, world.landHeight * scale);
    for (const ry of world.roadsH) ctx.fillRect(offX, offY + ry * scale, world.width * scale, CITY.road * scale);
    ctx.fillStyle = 'rgba(30,35,40,0.55)';
    for (const b of world.buildings) {
      if (b.kind === 'kiosk') continue;
      ctx.fillRect(offX + (b.x + 4) * scale, offY + (b.y + 4) * scale, Math.max(1, (b.w - 8) * scale), Math.max(1, (b.h - 8) * scale));
    }
    const marker = markerFor(state.mission, state);
    ctx.fillStyle = COLORS.marker;
    ctx.beginPath();
    ctx.arc(offX + marker.x * scale, offY + marker.y * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      ctx.fillStyle = COLORS.policeBlue;
      ctx.fillRect(offX + car.x * scale - 2, offY + car.y * scale - 2, 4, 4);
    }
    ctx.save();
    ctx.translate(offX + state.player.x * scale, offY + state.player.y * scale);
    ctx.rotate(state.player.car ? state.player.car.angle : state.player.angle);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.moveTo(7, 0); ctx.lineTo(-5, -5); ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /** A small always-on control card under the radar. Each line is one action, in plain words. */
  function drawHelp() {
    const x = FIELD.width - 234;
    const y = 244;
    panel(x, y, 216, 112, 0.76);
    text('CONTROLS', x + 10, y + 22, 14, COLORS.gold, 'left', 'bold', MONO);
    const lines = [
      'WASD  MOVE / DRIVE',
      'SHIFT  SPRINT',
      'SPACE  CAR IN / OUT',
      'E  JOB   CLICK  SHOOT',
      'P  PAUSE   M  MUTE',
    ];
    lines.forEach((line, index) => {
      text(line, x + 10, y + 44 + index * 16, 14, '#f2efe6', 'left', 'bold', MONO);
    });
  }

  function drawHud(state, ui, screen) {
    ctx.textBaseline = 'alphabetic';
    const player = state.player;

    panel(18, 18, 272, 106);
    text(`$${state.money}`, 32, 58, 32, COLORS.gold, 'left', 'bold');
    text('HEALTH', 32, 88, 14, COLORS.hudMuted, 'left', 'bold', MONO);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(88, 78, 114, 12);
    ctx.fillStyle = player.health > 45 ? COLORS.green : COLORS.red;
    ctx.fillRect(88, 78, Math.max(0, Math.min(1, player.health / 100)) * 114, 12);
    text(`${player.ammo} AMMO`, 290, 90, 18, COLORS.hudText, 'right', 'bold', MONO);
    text('PORT VESPER', 32, 110, 13, 'rgba(255,255,255,0.6)', 'left', 'bold', MONO);

    const starX = FIELD.width - 250;
    text('WANTED', FIELD.width - 18, 16, 15, COLORS.hudMuted, 'right', 'bold', MONO);
    for (let i = 0; i < WANTED.max; i += 1) {
      const cx = starX + i * 32 + 10;
      star(ctx, cx, 38, 13, 5, 5);
      ctx.fillStyle = i < state.wanted ? COLORS.gold : 'rgba(255,255,255,0.16)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    drawMinimap(state);
    drawHelp();

    const objective = objectiveFor(state.mission, state);
    const marker = markerFor(state.mission, state);
    const distance = Math.round(Math.hypot(marker.x - player.x, marker.y - player.y) / 10) * 10;
    panel(18, FIELD.height - 114, 470, 96);
    text(objective.title, 34, FIELD.height - 84, 16, COLORS.gold, 'left', 'bold', MONO);
    text(objective.detail, 34, FIELD.height - 52, 20, COLORS.hudText, 'left', 'bold');
    text(`${distance}m`, 470, FIELD.height - 52, 19, '#dfe6e8', 'right', 'bold', MONO);

    if (player.car) {
      panel(FIELD.width - 200, FIELD.height - 100, 182, 82);
      const speed = Math.round(Math.abs(player.car.speed) * 0.42);
      text(`${speed}`, FIELD.width - 112, FIELD.height - 48, 40, COLORS.hudText, 'center', 'bold', MONO);
      text('MPH', FIELD.width - 48, FIELD.height - 52, 15, COLORS.hudMuted, 'left', 'bold', MONO);
      text(player.car.speed < -1 ? 'REVERSE' : 'DRIVE', FIELD.width - 112, FIELD.height - 28, 13, COLORS.gold, 'center', 'bold', MONO);
    }

    if (screen === SCREEN.PLAY) {
      const cx = ui.pointerX;
      const cy = ui.pointerY;
      ctx.strokeStyle = 'rgba(10,15,20,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = COLORS.hudText;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy); ctx.lineTo(cx - 11, cy);
      ctx.moveTo(cx + 11, cy); ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15); ctx.lineTo(cx, cy - 11);
      ctx.moveTo(cx, cy + 11); ctx.lineTo(cx, cy + 15);
      ctx.stroke();
    }

    if (state.messageTime > 0 && state.message) {
      const width = Math.max(280, state.message.length * 12 + 60);
      panel(FIELD.width / 2 - width / 2, 122, width, 46, 0.88);
      text(state.message, FIELD.width / 2, 151, 22, COLORS.gold, 'center', 'bold');
    }

    if (state.time < 14 && screen === SCREEN.PLAY) {
      ctx.globalAlpha = Math.min(1, (14 - state.time) / 2);
      text('WASD DRIVE   SPACE CAR   E JOB   SHIFT RUN   CLICK SHOOT', FIELD.width / 2, FIELD.height - 18, 17, '#e9e6d8', 'center', 'bold', MONO);
      ctx.globalAlpha = 1;
    }
    if (ui.muted) text('MUTED', FIELD.width - 30, FIELD.height - 18, 14, COLORS.hudMuted, 'right', 'bold', MONO);
  }

  function drawOverlay(state, screen, ui) {
    const cy = FIELD.height / 2;
    ctx.fillStyle = screen === SCREEN.OVER ? 'rgba(30,6,8,0.72)' : 'rgba(6,11,18,0.78)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN.PAUSED) {
      text('PAUSED', FIELD.width / 2, cy - 10, 76, COLORS.hudText, 'center', 'bold');
      text('PRESS P OR ESC TO RESUME', FIELD.width / 2, cy + 44, 21, COLORS.hudMuted, 'center', 'bold', MONO);
      return;
    }
    if (screen === SCREEN.OVER) {
      text('BUSTED', FIELD.width / 2, cy - 58, 88, '#f06a60', 'center', 'bold');
      text('The city took its cut. You kept the lesson.', FIELD.width / 2, cy - 4, 22, COLORS.hudMuted, 'center');
      text(`CASH ON HAND  $${state.money}`, FIELD.width / 2, cy + 46, 24, COLORS.gold, 'center', 'bold', MONO);
      text('PRESS ENTER TO START OVER', FIELD.width / 2, cy + 110, 21, COLORS.hudText, 'center', 'bold', MONO);
      return;
    }
    text('PORT', FIELD.width / 2, cy - 152, 82, '#f5e2b4', 'center', 'bold');
    text('VESPER', FIELD.width / 2, cy - 64, 100, '#f5c65f', 'center', 'bold');
    text('AN OPEN-WORLD CRIME SANDBOX', FIELD.width / 2, cy - 18, 19, '#b7c4c8', 'center', 'bold', MONO);
    panel(FIELD.width / 2 - 350, cy + 26, 700, 184, 0.78);
    const lines = [
      'WASD / ARROWS     WALK AND DRIVE',
      'SHIFT             SPRINT ON FOOT',
      'MOUSE + CLICK     AIM AND SHOOT',
      'SPACE             ENTER OR EXIT A CAR',
      'E                 TAKE ON A MARKED JOB',
      'P PAUSE     M MUTE     R RESET SAVE',
    ];
    lines.forEach((line, index) => {
      text(line, FIELD.width / 2 - 318, cy + 58 + index * 27, 17, index === 5 ? COLORS.hudMuted : '#e9e6d8', 'left', 'bold', MONO);
    });
    const blink = Math.floor(state.time * 2) % 2 === 0;
    text(blink ? 'PRESS ENTER TO HIT THE STREETS' : ' ', FIELD.width / 2, cy + 246, 27, COLORS.gold, 'center', 'bold');
    if (ui.hasSave) text('C  CONTINUE SAVED GAME', FIELD.width / 2, cy + 285, 19, '#c9d6d8', 'center', 'bold', MONO);
    text('THREE JOBS. FIVE STARS. ONE CITY.', FIELD.width / 2, FIELD.height - 18, 15, 'rgba(255,255,255,0.55)', 'center', 'bold', MONO);
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    resize,
    toLogical,
    /** Paint one complete frame: the city through the camera, then the HUD, then any overlay. */
    draw(state, screen, ui) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#0a0e14';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(view.ox, view.oy);
      ctx.scale(view.scale, view.scale);
      ctx.beginPath();
      ctx.rect(0, 0, FIELD.width, FIELD.height);
      ctx.clip();
      drawCity(state);
      // The title screen owns the frame; gameplay HUD would compete with its own copy.
      if (screen !== SCREEN.START) drawHud(state, ui, screen);
      if (screen !== SCREEN.PLAY) drawOverlay(state, screen, ui);
      ctx.restore();
    },
  };
}
