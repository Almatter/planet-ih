import { avatarTiles } from './avatar-atlas.js?v=14';
import { adjustedPlacement, emptyAvatarLayout, visiblePartRect } from './avatar-layout.js?v=14';

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
  sideEyes: ['Two eyes', 'Narrow far eye', 'Near eye only'],
  nose: ['Button', 'Straight', 'Broad'],
  mouth: ['Smile', 'Quiet', 'Fang'],
  lipColor: ['Natural', ...Object.keys(lipColors)],
  hair: ['Cropped', 'Side fringe', 'Bob', 'Braids', 'Shaved'],
  hairColor: ['Chestnut', 'Ink', 'Gold', 'Auburn', 'Silver', 'Teal'],
};

export const defaultAvatar = {
  body: 'Medium', outfit: 'Traveler tunic', dye: 'Room color', ears: 'Round', earColor: 'Natural',
  horns: 'None', hornColor: 'Natural', tail: 'None', tailColor: 'Natural', wings: 'None', wingColor: 'Natural',
  skin: 'Golden', eyes: 'Hazel', sideEyes: 'Two eyes', nose: 'Button', mouth: 'Smile', lipColor: 'Natural', hair: 'Cropped', hairColor: 'Chestnut',
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
const layerOrders = { tail: 10, wings: 20, 'leg-left': 30, 'leg-far': 30, 'leg-right': 40, 'leg-near': 40,
  'arm-left': 50, 'arm-far': 50, 'arm-right': 60, neck: 70, outfit: 80, 'arm-near': 90, 'hair-rear': 97,
  ears: 100, head: 110, 'eyes-far': 119, eyes: 120, nose: 130, mouth: 140, hair: 150, horns: 170 };
const atlas = typeof Image === 'function' ? new Image() : null;
const tintedTiles = new Map();
let publishedLayout = emptyAvatarLayout;

export function setPublishedAvatarLayout(layout) {
  publishedLayout = layout;
}

export function avatarScale(avatar) {
  return bodies[avatar.body].scale;
}

export const avatarArtReady = new Promise(resolve => {
  if (!atlas) {
    resolve(false);
    return;
  }
  atlas.onload = () => resolve(true);
  atlas.onerror = () => resolve(false);
  atlas.src = new URL('./assets/avatar-atlas.png?v=14', import.meta.url).href;
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

function sprite(context, part) {
  const { name, x, y, width, height: drawHeight, tint, layer, flip = false, angle = 0, opacity = 1 } = part;
  const crop = avatarTiles[name];
  context.save();
  context.globalAlpha *= opacity;
  context.translate(x, y);
  if (angle) context.rotate(angle);
  if (part.visibleFrom || part.cropLeft || part.cropRight || part.cropBottom) {
    const visible = visiblePartRect(part);
    context.beginPath();
    context.rect(visible.left, visible.top, visible.width, visible.height);
    context.clip();
  }
  if (flip) context.scale(-1, 1);
  if (tint) context.drawImage(tintedTile(name, crop, tint, layer), -width / 2, 0, width, drawHeight);
  else context.drawImage(atlas, ...crop, -width / 2, 0, width, drawHeight);
  context.restore();
}

function drawLeg(add, view, side, profile, phase) {
  const lift = Math.max(0, side * phase);
  const bent = profile && lift >= 1;
  const id = profile ? (side < 0 ? 'leg-far' : 'leg-near') : (side < 0 ? 'leg-left' : 'leg-right');
  add(id, bent ? 'leg-bent' : `leg-${view}`, side * (profile ? 1.65 : 2.85), -11.6 - lift * 0.68, profile ? 6.1 : 5.5,
    { height: 11.6, flip: bent || (!profile && side < 0), angle: side * phase * (profile ? 0.13 : 0.036) });
}

function drawArm(add, view, x, swing, bob, skin, foreground = false) {
  const profile = view === 'side';
  const id = profile ? (foreground ? 'arm-near' : 'arm-far') : (x < 0 ? 'arm-left' : 'arm-right');
  add(id, profile && foreground && swing > 1 ? 'arm-bent' : `arm-${view}`, x, -17.7 - bob, profile ? 4.75 : 4.3,
    { height: 10.8, tint: skin, layer: 'sleeve', flip: !profile && x > 0,
      angle: swing * 0.1, visibleFrom: foreground ? 0.46 : 0 });
}

function drawTail(add, avatar, view, stride) {
  if (avatar.tail === 'None') return;
  // Both painted tails have their root on the left. Reverse the profile so the root meets the back hip.
  const profile = view === 'side';
  const back = view === 'back';
  add('tail', avatar.tail === 'Cat' ? 'tail-cat' : 'tail-dragon', profile ? -9.7 : back ? 6.5 : 9.7,
    (back ? -14.9 : -19.4) + stride * 0.32, back ? 13.5 : 15,
    { height: back ? 9.8 : 10.5, flip: profile, tint: accessoryColors[avatar.tailColor] });
}

function drawFeatures(add, avatar, view, head, bob, skin) {
  const profile = view === 'side';
  const center = profile ? 1.9 : 0;
  const twoEyes = profile && avatar.sideEyes !== 'Near eye only';
  const earTint = accessoryColors[avatar.earColor];
  if (avatar.ears !== 'Cat') {
    const elf = avatar.ears === 'Elf';
    const ears = profile ? (elf ? 'ear-side' : 'ear-round-side') : (elf ? 'ears-elf' : 'ears-round');
    add('ears', ears, profile ? -head / 2 + (elf ? 0.5 : 1.1) : 0, -25.3 - bob,
      profile ? (elf ? 5.1 : 3.15) : head + (elf ? 5.2 : 3.5),
      { tint: earTint ?? skin, height: elf ? 6.4 : profile ? 4.85 : 5.35 });
  }
  add('head', `head-${view}`, 0, -31 - bob, head, { height: 12.8, tint: skin });
  if (view !== 'back') {
    const iris = eyeColors[avatar.eyes];
    if (twoEyes) {
      const narrow = avatar.sideEyes === 'Narrow far eye';
      add('eyes-far', narrow ? 'eye-far-narrow' : 'eye-far', head * 0.397, -24.45 - bob, narrow ? 1.38 : 1.6,
        { height: narrow ? 2.05 : 2.55, tint: iris, layer: 'eyes' });
    }
    add('eyes', profile ? 'eye-side' : 'eyes-front', center, -25.1 - bob,
      profile ? (twoEyes ? 3.35 : 4.2) : head * 0.69, { height: 3.05, tint: iris, layer: 'eyes' });
    const nose = `nose-${view}-${avatar.nose.toLowerCase()}`;
    const noseSize = { Button: [1.26, 1.24], Straight: [1.02, 1.72], Broad: [1.65, 1.3] }[avatar.nose];
    // Existing layouts identify Button and Straight as "nose" and Broad as "nose-broad".
    const variant = avatar.nose === 'Broad' ? 'nose-broad' : 'nose';
    add('nose', nose, center + (profile ? 1.41 : 0), -22.85 - bob, noseSize[0] + (profile ? 0.24 : 0),
      { height: noseSize[1] + (profile ? 0.19 : 0), tint: skin, variant });
    const mouth = { Smile: 'mouth-smile', Quiet: 'mouth-quiet', Fang: 'mouth-fang' }[avatar.mouth];
    add('mouth', mouth, center + (profile ? 0.75 : 0), -20.95 - bob, profile ? 2.45 : 3.35,
      { tint: lipColors[avatar.lipColor], layer: 'lips' });
  }
  if (avatar.hair !== 'Shaved') {
    const hair = `${hairTiles[avatar.hair]}-${view}`;
    const tint = hairColors[avatar.hairColor];
    add('hair-rear', hair, 0, -33 - bob, head + 3.6, { tint, hidden: true });
    add('hair', hair, 0, -33 - bob, head + 3.6, { tint });
  }
  if (avatar.ears === 'Cat') add('ears', 'ears-cat', 0, -35.4 - bob, head + 1.4, { height: 8.3, tint: earTint ?? hairColors[avatar.hairColor] });
  if (avatar.horns !== 'None') {
    const antlers = avatar.horns === 'Antlers';
    add('horns', antlers ? 'antlers' : 'horns', 0, (antlers ? -40.6 : -35.6) - bob, head + (antlers ? 4.8 : 3.8),
      { height: antlers ? 12.8 : 8.5, tint: accessoryColors[avatar.hornColor] });
  }
}

export function avatarParts(avatar, color, direction = 'south', phase = 0, layout = publishedLayout) {
  const body = bodies[avatar.body];
  const skin = complexions[avatar.skin];
  const view = direction === 'north' ? 'back' : direction === 'south' ? 'front' : 'side';
  const profile = view === 'side';
  const bob = phase ? body.sway * 0.43 : 0;
  const stride = Math.sign(phase) * Math.min(Math.abs(phase), body.step);
  const shoulders = body.shoulder - Number(profile) * 0.75;
  const torsoWidth = shoulders * 2 + (profile ? 0.4 : 1.5);
  const torso = `${outfitTiles[avatar.outfit]}-${view}`;
  const torsoTint = avatar.dye === 'Room color' ? color : dyes[avatar.dye];
  const wings = avatar.wings === 'Bat' ? 'wings-bat' : 'wings-feathered';
  const wingTint = accessoryColors[avatar.wingColor];
  const parts = [];
  const add = (id, name, x, y, width, options = {}) => {
    const crop = avatarTiles[name];
    const height = options.height ?? width * crop[3] / crop[2];
    const variant = options.variant ?? (id.startsWith('arm-') || id === 'neck' ? `${view}:${outfitTiles[avatar.outfit]}` : id.startsWith('leg-') ? view : name);
    const order = view === 'back' && id === 'tail' ? 92 : view === 'back' && id === 'wings' ? 96 :
      name === 'ears-cat' ? 160 : layerOrders[id];
    const part = { ...options, id, name, variant, x, y, width, height, order };
    parts.push(adjustedPlacement(part, avatar, direction, layout));
  };

  if (view !== 'back') drawTail(add, avatar, view, stride);
  if (avatar.wings !== 'None' && view !== 'back') add('wings', wings,
    profile ? -3.5 : 0, -23.5 - bob, profile ? 27 : 33, { height: 15.5, tint: wingTint });

  drawLeg(add, view, -1, profile, stride);
  drawLeg(add, view, 1, profile, stride);
  if (profile) drawArm(add, view, torsoWidth * 0.14, -stride, bob, skin);
  else {
    const sleeve = torsoWidth * 0.34;
    drawArm(add, view, -sleeve, -stride, bob, skin);
    drawArm(add, view, sleeve, stride, bob, skin);
  }
  add('neck', 'neck', 0, -21.7 - bob, 6.2, { height: 4.6, tint: skin });
  add('outfit', torso, 0, -19.6 - bob, torsoWidth,
    { height: avatar.outfit === 'Scholar robe' ? 16 : 14.2, tint: torsoTint, layer: 'cloth' });
  if (profile) drawArm(add, view, -torsoWidth * 0.24, stride, bob, skin, true);
  if (view === 'back') drawTail(add, avatar, view, stride);
  if (avatar.wings !== 'None' && view === 'back') add('wings', wings,
    0, -22.8 - bob, 30.5, { height: 14.2, tint: wingTint });
  drawFeatures(add, avatar, view, body.head * 2 + 1.7, bob, skin);
  return parts.sort((a, b) => a.order - b.order);
}

export function drawAvatar(context, avatar, color, x, y, direction = 'south', phase = 0, previewScale = 1, placements) {
  if (!atlas?.naturalWidth) return;
  const scale = avatarScale(avatar) * previewScale;
  const profile = direction === 'east' || direction === 'west';
  context.save();
  context.translate(x, y);
  context.scale(direction === 'west' ? -scale : scale, scale);
  context.fillStyle = '#23151d58';
  context.beginPath();
  context.ellipse(0, 0.35, bodies[avatar.body].shoulder + 2.25 - Number(profile) * 0.75, 2.3, 0, 0, Math.PI * 2);
  context.fill();
  for (const part of placements ?? avatarParts(avatar, color, direction, phase)) {
    if (!part.hidden && part.opacity) sprite(context, part);
  }
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
