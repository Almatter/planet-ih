import { avatarTiles } from './avatar-atlas.js?v=9';

const accessoryColors = { Ivory: '#e5d5b6', Gold: '#dcaa66', Chestnut: '#ac7255', Ebony: '#594957',
  Rose: '#d68b91', Teal: '#62aa99', Violet: '#a884bd' };
const accessoryOptions = ['Natural', ...Object.keys(accessoryColors)];
const lipColors = { Rose: '#bd707a', Plum: '#9b638e', Umber: '#85604c', Coral: '#d68872' };

export const avatarOptions = {
  body: ['Small', 'Medium', 'Large'],
  outfit: ['Traveler tunic', 'Tea house apron', 'Scholar robe', 'Knight armor'],
  dye: ['Room color', 'Moss green', 'Burgundy', 'Indigo', 'Ochre'],
  ears: ['Round', 'Elf', 'Cat'],
  earColor: accessoryOptions,
  horns: ['None', 'Antlers', 'Curved'],
  hornColor: accessoryOptions,
  tail: ['None', 'Cat', 'Dragon'],
  tailColor: accessoryOptions,
  wings: ['None', 'Feathered', 'Bat'],
  wingColor: accessoryOptions,
  skin: ['Peach', 'Golden', 'Copper', 'Umber', 'Slate', 'Lavender'],
  eyes: ['Hazel', 'Blue', 'Green', 'Violet', 'Amber'],
  nose: ['Button', 'Straight', 'Broad'],
  mouth: ['Smile', 'Quiet', 'Fang'],
  lipColor: ['Natural', ...Object.keys(lipColors)],
  hair: ['Cropped', 'Side fringe', 'Bob', 'Braids', 'Shaved'],
  hairColor: ['Chestnut', 'Ink', 'Gold', 'Auburn', 'Silver', 'Teal'],
};

export const defaultAvatar = {
  body: 'Medium', outfit: 'Traveler tunic', dye: 'Room color', ears: 'Round', earColor: 'Natural',
  horns: 'None', hornColor: 'Natural', tail: 'None', tailColor: 'Natural', wings: 'None', wingColor: 'Natural',
  skin: 'Golden', eyes: 'Hazel', nose: 'Button', mouth: 'Smile', lipColor: 'Natural', hair: 'Cropped', hairColor: 'Chestnut',
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

const complexions = { Golden: '#d8965e', Copper: '#b57159', Umber: '#82523e', Slate: '#8fa5b9', Lavender: '#bda3d7' };
const hairColors = { Ink: '#41364c', Gold: '#e7b25b', Auburn: '#b95440', Silver: '#bcbdcc', Teal: '#4ba5a1' };
const eyeColors = { Hazel: '#946446', Blue: '#5896ce', Green: '#76a870', Violet: '#a272bd', Amber: '#d99139' };
const dyes = { 'Moss green': '#8fbe76', Burgundy: '#cf6c88', Indigo: '#8b9ee2', Ochre: '#e7ab60' };
const outfitTiles = { 'Traveler tunic': 'tunic', 'Tea house apron': 'apron', 'Scholar robe': 'robe', 'Knight armor': 'armor' };
const hairTiles = { Cropped: 'cropped', 'Side fringe': 'fringe', Bob: 'bob', Braids: 'braids' };
const atlas = typeof Image === 'function' ? new Image() : null;
const tintedTiles = new Map();

export const avatarArtReady = new Promise(resolve => {
  if (!atlas) {
    resolve(false);
    return;
  }
  atlas.onload = () => resolve(true);
  atlas.onerror = () => resolve(false);
  atlas.src = new URL('./assets/avatar-atlas.png?v=9', import.meta.url).href;
});

export function avatarBounds(player) {
  const { scale, shoulder } = bodies[player.avatar.body];
  const headwear = player.avatar.horns !== 'None' ? 42 : player.avatar.ears === 'Cat' ? 38 : 34;
  const reach = player.avatar.wings === 'None' && player.avatar.tail === 'None' ? shoulder + 4 : 21;
  return { left: player.x - reach * scale, right: player.x + reach * scale,
    top: player.y - headwear * scale, bottom: player.y + 4 * scale };
}

function tintedTile(name, crop, color, layer) {
  const key = `${name}:${color}:${layer}`;
  if (tintedTiles.has(key)) return tintedTiles.get(key);
  const [x, y, width, height] = crop;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(atlas, x, y, width, height, 0, 0, width, height);
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  const target = color.slice(1).match(/../g).map(value => Number.parseInt(value, 16));
  for (let i = 0; i < pixels.length; i += 4) {
    if (!pixels[i + 3]) continue;
    const red = pixels[i];
    const green = pixels[i + 1];
    const blue = pixels[i + 2];
    const light = red * 0.25 + green * 0.58 + blue * 0.17;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    let weight = 0.85;
    if (layer === 'sleeve') weight = Math.floor(i / 4 / width) > height * 0.39 && light > 112 ? 0.85 : 0;
    if (layer === 'cloth') weight = chroma > 29 && light < 203 ? 0.63 : 0.12;
    if (layer === 'eyes') weight = light > 49 && light < 190 && chroma < 79 ? 0.9 : 0;
    if (layer === 'lips') weight = light > 75 && light < 196 && chroma > 25 ? 0.73 : 0;
    const brightness = Math.min(1, light / 165);
    const highlight = Math.max(0, (light - 165) / 90);
    for (let channel = 0; channel < 3; channel++) {
      const pigment = target[channel] * brightness + (255 - target[channel]) * highlight;
      pixels[i + channel] = pixels[i + channel] * (1 - weight) + pigment * weight;
    }
  }
  context.putImageData(image, 0, 0);
  if (tintedTiles.size >= 256) tintedTiles.delete(tintedTiles.keys().next().value);
  tintedTiles.set(key, canvas);
  return canvas;
}

function sprite(context, name, x, y, width, { height, tint, layer, flip = false, angle = 0 } = {}) {
  const crop = avatarTiles[name];
  if (!crop) return;
  const drawHeight = height ?? width * crop[3] / crop[2];
  context.save();
  context.translate(x, y);
  if (angle) context.rotate(angle);
  if (flip) context.scale(-1, 1);
  if (tint) context.drawImage(tintedTile(name, crop, tint, layer), -width / 2, 0, width, drawHeight);
  else context.drawImage(atlas, ...crop, -width / 2, 0, width, drawHeight);
  context.restore();
}

function drawLeg(context, view, side, profile, phase) {
  const lift = Math.max(0, side * phase);
  const bent = profile && lift >= 1;
  sprite(context, bent ? 'leg-bent' : `leg-${view}`, side * (profile ? 1.65 : 2.85), -11.6 - lift * 0.68, profile ? 6.1 : 5.5,
    { height: 11.6, flip: bent || (!profile && side < 0), angle: side * phase * (profile ? 0.13 : 0.036) });
}

function drawArm(context, view, side, spread, bob, phase, skin, profile) {
  sprite(context, profile && side * phase > 1 ? 'arm-bent' : `arm-${view}`, side * spread, -18 - bob, profile ? 5.5 : 5,
    { height: 10.8, tint: skin, layer: 'sleeve', flip: !profile && side > 0, angle: side * phase * 0.13 });
}

function drawFeatures(context, avatar, view, head, bob, skin) {
  const profile = view === 'side';
  const center = profile ? 1.9 : 0;
  const earTint = accessoryColors[avatar.earColor];
  if (avatar.ears !== 'Cat') {
    const ears = profile && avatar.ears === 'Elf' ? 'ear-side' : avatar.ears === 'Elf' ? 'ears-elf' : 'ears-round';
    const single = ears === 'ear-side';
    sprite(context, ears, single ? -head / 2 + 0.5 : 0, -25.3 - bob, single ? 5.1 : head + (avatar.ears === 'Elf' ? 5.2 : 3.5),
      { tint: earTint ?? skin, height: avatar.ears === 'Elf' ? 6.4 : 5.35 });
  }
  sprite(context, `head-${view}`, 0, -31 - bob, head, { height: 12.8, tint: skin });
  if (view !== 'back') {
    sprite(context, profile ? 'eye-side' : 'eyes-front', center, -25.1 - bob, profile ? 4.2 : head * 0.69,
      { height: 3.05, tint: eyeColors[avatar.eyes], layer: 'eyes' });
    const nose = avatar.nose === 'Broad' ? 'nose-broad' : 'nose';
    sprite(context, nose, center + (profile ? 1.65 : 0), -22.85 - bob, avatar.nose === 'Straight' ? 0.98 : 1.4,
      { height: avatar.nose === 'Straight' ? 2.05 : 1.42, tint: skin });
    const mouth = { Smile: 'mouth-smile', Quiet: 'mouth-quiet', Fang: 'mouth-fang' }[avatar.mouth];
    sprite(context, mouth, center + (profile ? 0.75 : 0), -20.95 - bob, profile ? 2.45 : 3.35,
      { tint: lipColors[avatar.lipColor], layer: 'lips' });
  }
  if (avatar.hair !== 'Shaved') sprite(context, `${hairTiles[avatar.hair]}-${view}`, 0, -33 - bob, head + 3.6,
    { tint: hairColors[avatar.hairColor] });
  if (avatar.ears === 'Cat') sprite(context, 'ears-cat', 0, -35.4 - bob, head + 1.4, { height: 8.3, tint: earTint ?? hairColors[avatar.hairColor] });
  if (avatar.horns !== 'None') {
    const antlers = avatar.horns === 'Antlers';
    sprite(context, antlers ? 'antlers' : 'horns', 0, (antlers ? -40.6 : -35.6) - bob, head + (antlers ? 4.8 : 3.8),
      { height: antlers ? 12.8 : 8.5, tint: accessoryColors[avatar.hornColor] });
  }
}

export function drawAvatar(context, avatar, color, x, y, direction = 'south', phase = 0, previewScale = 1) {
  if (!atlas?.naturalWidth) return;
  const body = bodies[avatar.body];
  const scale = body.scale * previewScale;
  const skin = complexions[avatar.skin];
  const view = direction === 'north' ? 'back' : direction === 'south' ? 'front' : 'side';
  const profile = view === 'side';
  const bob = phase ? body.sway * 0.43 : 0;
  const stride = Math.sign(phase) * Math.min(Math.abs(phase), body.step);
  const shoulders = body.shoulder - Number(profile) * 0.75;
  const torso = `${outfitTiles[avatar.outfit]}-${view}`;
  const torsoTint = avatar.dye === 'Room color' ? color : dyes[avatar.dye];
  const wings = avatar.wings === 'Bat' ? 'wings-bat' : 'wings-feathered';
  const wingTint = accessoryColors[avatar.wingColor];

  context.save();
  context.translate(x, y);
  context.scale(direction === 'west' ? -scale : scale, scale);
  context.fillStyle = '#23151d58';
  context.beginPath();
  context.ellipse(0, 0.35, shoulders + 2.25, 2.3, 0, 0, Math.PI * 2);
  context.fill();

  if (avatar.tail !== 'None') sprite(context, avatar.tail === 'Cat' ? 'tail-cat' : 'tail-dragon', 10.2, -16 + stride * 0.36, 15,
    { height: 10.5, tint: accessoryColors[avatar.tailColor] });
  if (avatar.wings !== 'None' && view !== 'back') sprite(context, wings,
    profile ? -3.5 : 0, -23.5 - bob, profile ? 27 : 33, { height: 15.5, tint: wingTint });

  drawLeg(context, view, -1, profile, stride);
  drawLeg(context, view, 1, profile, stride);
  drawArm(context, view, -1, shoulders, bob, stride, skin, profile);
  if (!profile) drawArm(context, view, 1, shoulders, bob, stride, skin, profile);
  sprite(context, 'neck', 0, -21.7 - bob, 6.2, { height: 4.6, tint: skin });
  sprite(context, torso, 0, -19.6 - bob, shoulders * 2 + (profile ? 0.4 : 1.5),
    { height: avatar.outfit === 'Scholar robe' ? 16 : 14.2, tint: torsoTint, layer: 'cloth' });
  if (profile) drawArm(context, view, 1, 2.3, bob, stride, skin, true);
  if (avatar.wings !== 'None' && view === 'back') sprite(context, wings,
    0, -22.8 - bob, 30.5, { height: 14.2, tint: wingTint });
  drawFeatures(context, avatar, view, body.head * 2 + 1.7, bob, skin);
  context.restore();
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
