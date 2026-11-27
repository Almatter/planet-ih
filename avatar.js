export const avatarOptions = {
  body: ['Small', 'Medium', 'Large'],
  outfit: ['Traveler tunic', 'Tea house apron', 'Scholar robe', 'Knight armor'],
  dye: ['Room color', 'Moss green', 'Burgundy', 'Indigo', 'Ochre'],
  ears: ['Round', 'Elf', 'Cat'],
  horns: ['None', 'Antlers', 'Curved'],
  tail: ['None', 'Cat', 'Dragon'],
  wings: ['None', 'Feathered', 'Bat'],
  skin: ['Peach', 'Golden', 'Copper', 'Umber', 'Slate', 'Lavender'],
  eyes: ['Hazel', 'Blue', 'Green', 'Violet', 'Amber'],
  nose: ['Button', 'Straight', 'Broad'],
  mouth: ['Smile', 'Quiet', 'Fang'],
  hair: ['Cropped', 'Side fringe', 'Bob', 'Braids', 'Shaved'],
  hairColor: ['Chestnut', 'Ink', 'Gold', 'Auburn', 'Silver', 'Teal'],
};

export const defaultAvatar = {
  body: 'Medium', outfit: 'Traveler tunic', dye: 'Room color', ears: 'Round',
  horns: 'None', tail: 'None', wings: 'None', skin: 'Golden', eyes: 'Hazel',
  nose: 'Button', mouth: 'Smile', hair: 'Cropped', hairColor: 'Chestnut',
};

export function cleanAvatar(input) {
  const avatar = { ...defaultAvatar };
  for (const [key, options] of Object.entries(avatarOptions)) {
    if (options.includes(input?.[key])) avatar[key] = input[key];
  }
  return avatar;
}

const bodies = {
  Small: { scale: 0.8, shoulder: 6, head: 5, step: 3, sway: 1, cycle: 12, frames: [0, 2, 0, -2] },
  Medium: { scale: 1.6, shoulder: 7, head: 5, step: 2, sway: 0, cycle: 23, frames: [0, 1, 0, -1] },
  Large: { scale: 2.4, shoulder: 8, head: 6, step: 2, sway: 1, cycle: 39, frames: [0, 1, 2, 0, -1, -2] },
};

const complexions = {
  Peach: ['#fbd0ad', '#cf9179'], Golden: ['#de9b60', '#ad663f'], Copper: ['#b66a4a', '#793b34'],
  Umber: ['#80513c', '#542e2c'], Slate: ['#9baebd', '#65788e'], Lavender: ['#c2a4db', '#8c6caa'],
};
const hairColors = {
  Chestnut: ['#673931', '#a16449'], Ink: ['#272435', '#554b62'], Gold: ['#c98e3b', '#f9d575'],
  Auburn: ['#8c392f', '#d76c4d'], Silver: ['#a5a5b8', '#e8e4ea'], Teal: ['#24666a', '#64b5a2'],
};
const eyeColors = { Hazel: '#523728', Blue: '#276288', Green: '#376237', Violet: '#583c81', Amber: '#805109' };
const dyes = { 'Moss green': '#8fbe76', Burgundy: '#cf6c88', Indigo: '#8b9ee2', Ochre: '#e7ab60' };
const outline = '#251d25';

export function avatarBounds(player) {
  const { scale, shoulder } = bodies[player.avatar.body];
  const headwear = player.avatar.horns !== 'None' ? 36 : player.avatar.ears === 'Cat' ? 34 : 31;
  const reach = player.avatar.wings === 'None' && player.avatar.tail === 'None' ? shoulder + 4 : 16;
  return { left: player.x - reach * scale, right: player.x + reach * scale,
    top: player.y - headwear * scale, bottom: player.y + 4 * scale };
}

export function walkPose(avatar, previous, x, y, now) {
  const body = bodies[avatar.body];
  const dx = x - (previous?.x ?? x);
  const dy = y - (previous?.y ?? y);
  const distance = Math.hypot(dx, dy);
  const moving = distance > 0.14 && distance < 110;
  const direction = moving ? (Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south')) : previous?.direction ?? 'south';
  const lastMove = moving ? now : previous?.lastMove ?? -Infinity;
  const progress = (now - lastMove < 120 ? previous?.progress ?? 0 : 0) + (moving ? distance : 0);
  const phase = now - lastMove < 120 ? body.frames[Math.floor(progress / body.cycle * body.frames.length) % body.frames.length] : 0;
  return { x, y, direction, lastMove, progress: progress % body.cycle, phase };
}

function drawBackGear(rect, avatar, dye, sway) {
  if (avatar.wings === 'Feathered') {
    rect(-15, -23, 30, 5, outline);
    rect(-14, -22, 28, 3, '#e8d8bc');
    rect(-15, -19, 9, 6, outline);
    rect(6, -19, 9, 6, outline);
    rect(-14, -19, 9, 4, '#fff2d1');
    rect(5, -19, 9, 4, '#fff2d1');
    rect(-12, -15, 8, 3, '#bca6a5');
    rect(4, -15, 8, 3, '#bca6a5');
  }
  if (avatar.wings === 'Bat') {
    for (const side of [-1, 1]) {
      const x = side < 0 ? -16 : 6;
      rect(x, -23, 10, 3, outline);
      rect(x + 1, -20, 8, 7, '#604469');
      rect(x + (side < 0 ? 4 : 0), -17, 6, 5, '#93617f');
      rect(x + (side < 0 ? 0 : 8), -24, 2, 7, outline);
    }
  }
  if (avatar.tail !== 'None') {
    const dragon = avatar.tail === 'Dragon';
    rect(4, -10, 8, 4, outline);
    rect(8, -10 + sway, 5, 3, dragon ? '#629274' : dye);
    rect(11, -14 + sway, 3, 6, outline);
    rect(12, -14 + sway, dragon ? 4 : 2, 3, dragon ? '#9ac18b' : dye);
  }
}

function drawHead(rect, avatar, body, profile, back, skin, shade, hair, sheen) {
  const head = body.head;
  if (avatar.horns === 'Antlers') {
    for (const side of [-1, 1]) {
      rect(side * 7 - 1, -35, 2, 8, '#e3c198');
      rect(side * 5 - 1, -32, 2, 5, '#a77956');
      rect(side * 8 - 1, -34, 2, 3, '#f1d6a6');
    }
  } else if (avatar.horns === 'Curved') {
    rect(-8, -34, 3, 8, '#d3b28d'); rect(5, -34, 3, 8, '#d3b28d');
    rect(-8, -34, 2, 2, '#fff1ce'); rect(6, -34, 2, 2, '#fff1ce');
  }
  for (const side of [-1, 1]) {
    if (profile && side === 1) continue;
    const earX = side < 0 ? -head - 3 : head;
    const tall = avatar.ears === 'Cat';
    const pointed = avatar.ears === 'Elf';
    rect(earX, tall ? -32 : -25, pointed ? 4 : 3, tall ? 8 : 5, outline);
    rect(earX + 1, tall ? -30 : pointed ? -25 : -24, pointed ? 3 : 2, tall ? 5 : 3, tall ? hair : shade);
    if (tall) rect(earX + 1, -29, 1, 3, '#da9299');
  }
  rect(-head, -30, head * 2, 12, outline);
  rect(-head - 1, -27, head * 2 + 2, 7, outline);
  rect(-head + 1, -28, head * 2 - 2, 9, back && avatar.hair !== 'Shaved' ? hair : skin);
  if (avatar.hair !== 'Shaved') {
    rect(-head + 1, -30, head * 2 - 2, back ? 10 : 4, hair);
    rect(-head + 2, -29, head * 2 - 4, 1, sheen);
    if (avatar.hair === 'Side fringe') rect(-head + 1, -27, 3, 4, hair);
    if (avatar.hair === 'Bob' || avatar.hair === 'Braids') {
      rect(-head, -27, 2, 9, hair); rect(head - 2, -27, 2, 9, hair);
      if (avatar.hair === 'Braids') {
        rect(-head - 1, -20, 2, 6, sheen); rect(head - 1, -20, 2, 6, sheen);
      }
    }
  }
  if (back) return;
  const eyes = eyeColors[avatar.eyes];
  rect(profile ? 2 : -3, -25, 2, 2, eyes);
  if (!profile) rect(2, -25, 2, 2, eyes);
  const noseX = profile ? 4 : 0;
  rect(noseX, -23, avatar.nose === 'Broad' ? 2 : 1, avatar.nose === 'Straight' ? 2 : 1, shade);
  const mouthX = profile ? 2 : -1;
  rect(mouthX, -21, avatar.mouth === 'Quiet' ? 2 : 3, 1, '#743c47');
  if (avatar.mouth === 'Smile') rect(mouthX + 1, -20, 2, 1, '#a25658');
  if (avatar.mouth === 'Fang') rect(mouthX + 2, -21, 1, 2, '#fff0d1');
}

export function drawAvatar(context, avatar, color, x, y, direction = 'south', phase = 0, previewScale = 1) {
  const body = bodies[avatar.body];
  const scale = body.scale * previewScale;
  const dye = dyes[avatar.dye] ?? color;
  const [skin, shade] = complexions[avatar.skin];
  const [hair, sheen] = hairColors[avatar.hairColor];
  const back = direction === 'north';
  const profile = direction === 'east' || direction === 'west';
  const bob = phase ? body.sway : 0;
  const stride = Math.sign(phase) * Math.min(Math.abs(phase), body.step);
  const shoulder = body.shoulder - Number(profile);
  const rect = (left, top, width, height, fill) => {
    context.fillStyle = fill;
    context.fillRect(left, top, width, height);
  };

  context.save();
  context.translate(Math.round(x), Math.round(y));
  context.scale(scale * (direction === 'west' ? -1 : 1), scale);
  context.fillStyle = '#23151d59';
  context.beginPath();
  context.ellipse(0, 0, shoulder + 2, 2.8, 0, 0, Math.PI * 2);
  context.fill();
  drawBackGear(rect, avatar, dye, phase);
  for (const side of [-1, 1]) {
    const footX = side * 3 - 2 + (profile ? side * stride : 0);
    const rise = Math.min(0, side * stride);
    rect(footX, -9 + rise, 5, 9, outline);
    rect(footX + 1, -8 + rise, 3, 5, '#624748');
    rect(footX + (profile ? 1 : 0), -3 + rise, 5, 3, '#372831');
    rect(footX + 1, -3 + rise, 2, 1, '#ad8262');
  }
  const hem = avatar.outfit === 'Scholar robe' ? 17 : 13;
  rect(-shoulder, -19 - bob, shoulder * 2, hem, outline);
  rect(-shoulder + 1, -18 - bob, shoulder * 2 - 2, hem - 2, dye);
  for (const side of [-1, 1]) {
    const armX = side < 0 ? -shoulder - 2 : shoulder - 1;
    const armY = -17 - bob + side * stride;
    rect(armX, armY, 3, 9, outline);
    rect(armX + 1, armY + 1, 2, 5, dye);
    rect(armX + 1, armY + 6, 2, 2, skin);
  }
  if (!back && avatar.outfit === 'Tea house apron') {
    rect(-3, -16 - bob, 6, 9, '#f1d9ad'); rect(-2, -10 - bob, 4, 2, '#bd996e');
  } else if (avatar.outfit === 'Knight armor') {
    rect(-shoulder + 1, -17 - bob, shoulder * 2 - 2, 3, '#a5aebd');
    rect(-3, -14 - bob, 6, 4, '#d4dbe0'); rect(-2, -13 - bob, 4, 1, '#637588');
  } else {
    rect(-shoulder + 1, -10 - bob, shoulder * 2 - 2, 2, '#513a3c');
    if (!back) rect(-1, -10 - bob, 2, 2, '#f3c881');
  }
  if (back && avatar.wings !== 'None') {
    rect(-2, -18 - bob, 4, 7, outline);
    rect(-1, -17 - bob, 2, 4, avatar.wings === 'Bat' ? '#93617f' : '#e8d8bc');
  }
  context.translate(profile ? 1 : 0, -bob);
  drawHead(rect, avatar, body, profile, back, skin, shade, hair, sheen);
  context.restore();
}
