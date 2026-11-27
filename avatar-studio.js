import { avatarArtReady, avatarBounds, avatarOptions, avatarParts, avatarScale, cleanAvatar, drawAvatar } from './avatar.js?v=14';
import { emptyAvatarLayout, loadAvatarLayout, placementKeys, placementLimits, validateAvatarLayout, visiblePartRect } from './avatar-layout.js?v=14';

const byId = id => document.getElementById(id);
const canvas = byId('studio-canvas');
const ctx = canvas.getContext('2d');
const layerList = byId('layer-list');
const scopeInput = byId('edit-scope');
const poseInput = byId('studio-pose');
const zoomInput = byId('studio-zoom');
const draftKey = 'planet-ih-avatar-layout-draft';
const fieldLabels = { x: 'X offset', y: 'Y offset', scaleX: 'Width %', scaleY: 'Height %',
  rotation: 'Rotation °', order: 'Draw order', opacity: 'Opacity %', clip: 'Clip top %',
  clipLeft: 'Clip left %', clipRight: 'Clip right %', clipBottom: 'Clip bottom %' };
const partLabels = { 'arm-far': 'Far arm', 'arm-near': 'Near arm', 'arm-left': 'Left arm', 'arm-right': 'Right arm',
  'leg-far': 'Far leg', 'leg-near': 'Near leg', 'leg-left': 'Left leg', 'leg-right': 'Right leg',
  'hair-rear': 'Rear hair', 'eyes-far': 'Far eye' };
const inputs = new Map();
const history = [];
const avatar = readProfile();
let direction = 'south';
let selected = 'head';
let published = emptyAvatarLayout;
let layout = emptyAvatarLayout;
let parts = [];
let camera;
let drag;
let ready = false;

function formatLabel(key) {
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1').toLowerCase();
}

function labelFor(part) {
  return partLabels[part.id] ?? formatLabel(part.id);
}

function readProfile() {
  try { return cleanAvatar(JSON.parse(localStorage.getItem('planet-ih-profile'))?.avatar); }
  catch { return cleanAvatar(); }
}

function status(text) {
  byId('studio-status').textContent = text;
}

function saveDraft() {
  try { localStorage.setItem(draftKey, JSON.stringify(layout)); }
  catch { status('Browser storage is unavailable. Export a copy to keep these adjustments.'); }
}

function remember() {
  history.push(layout);
  if (history.length > 80) history.shift();
  byId('undo').disabled = false;
}

function undo() {
  if (!history.length) return;
  layout = history.pop();
  byId('undo').disabled = !history.length;
  saveDraft();
  render();
}

function replaceDraft(next) {
  remember();
  layout = next;
  saveDraft();
  render();
}

function updateRule(key, patch, record = true) {
  const rule = { ...layout.parts[key], ...patch };
  if (Object.entries(rule).every(([field, value]) => layout.parts[key]?.[field] === value)) return;
  if (record) remember();
  layout = { version: 1, parts: { ...layout.parts, [key]: rule } };
  if (record) saveDraft();
  render(record);
}

function currentPart() {
  return parts.find(part => part.id === selected);
}

function currentKey(part) {
  return placementKeys(part, avatar, direction)[scopeInput.value];
}

function constrain(field, value) {
  const [min, max] = placementLimits[field];
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function addControl(parent, id, text, control) {
  const group = document.createElement('div');
  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = text;
  control.id = id;
  group.append(label, control);
  parent.append(group);
}

for (const [key, options] of Object.entries(avatarOptions)) {
  const select = document.createElement('select');
  for (const value of options) select.add(new Option(value, value));
  select.value = avatar[key];
  select.addEventListener('change', () => {
    avatar[key] = select.value;
    render();
  });
  addControl(byId('studio-avatar-fields'), `test-${key}`, formatLabel(key), select);
}

for (const [field, text] of Object.entries(fieldLabels)) {
  const input = document.createElement('input');
  input.type = 'number';
  [input.min, input.max] = placementLimits[field];
  input.step = '0.01';
  let editing = false;
  input.addEventListener('input', () => {
    const part = currentPart();
    if (!part || !Number.isFinite(input.valueAsNumber)) return;
    const value = constrain(field, input.valueAsNumber);
    if (part.values[field] === value) return;
    if (!editing) { remember(); editing = true; }
    updateRule(currentKey(part), { [field]: value }, false);
    saveDraft();
    if (field === 'order') render();
  });
  input.addEventListener('blur', () => { editing = false; render(); });
  input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
  addControl(byId('part-fields'), `part-${field}`, text, input);
  inputs.set(field, input);
}

function drawStage(part) {
  const bodyBounds = avatarBounds({ avatar, x: 0, y: 0 });
  const zoom = Number(zoomInput.value) * canvas.height * 0.64 / (bodyBounds.bottom - bodyBounds.top);
  const scale = avatarScale(avatar) * zoom;
  const footY = canvas.height / 2 - (bodyBounds.top + bodyBounds.bottom) * zoom / 2;
  camera = { x: canvas.width / 2, y: footY, scale, mirror: direction === 'west' ? -1 : 1 };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.strokeStyle = '#8cc7bb42';
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(camera.x, 0); ctx.lineTo(camera.x, canvas.height);
  ctx.moveTo(0, camera.y); ctx.lineTo(canvas.width, camera.y);
  ctx.stroke();
  ctx.restore();
  drawAvatar(ctx, avatar, '#baf592', camera.x, camera.y, direction, Number(poseInput.value), zoom, parts);
  if (!part) return;
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(scale * camera.mirror, scale);
  ctx.translate(part.x, part.y);
  ctx.rotate(part.angle);
  ctx.lineWidth = 2 / scale;
  ctx.strokeStyle = '#a8f6d9';
  ctx.setLineDash(part.hidden ? [5 / scale, 5 / scale] : []);
  const visible = visiblePartRect(part);
  ctx.strokeRect(visible.left, visible.top, visible.width, visible.height);
  ctx.restore();
}

function render(rebuildLayers = true) {
  if (!ready) return;
  parts = avatarParts(avatar, '#baf592', direction, Number(poseInput.value), layout);
  const part = currentPart() ?? parts.find(entry => entry.id === 'head') ?? parts[0];
  selected = part.id;
  if (rebuildLayers) {
    const activeLayer = document.activeElement?.dataset.part;
    layerList.replaceChildren(...parts.slice().reverse().map(layer => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      const order = document.createElement('small');
      button.type = 'button';
      button.dataset.part = layer.id;
      button.setAttribute('aria-pressed', String(layer.id === selected));
      button.textContent = labelFor(layer);
      order.textContent = layer.hidden ? 'Hidden' : String(layer.order);
      button.append(order);
      button.addEventListener('click', () => { selected = layer.id; render(); });
      item.append(button);
      return item;
    }));
    if (activeLayer) layerList.querySelector(`[data-part="${activeLayer}"]`)?.focus({ preventScroll: true });
  }
  byId('part-title').textContent = labelFor(part);
  byId('part-art').textContent = part.name;
  for (const [field, input] of inputs) {
    if (input !== document.activeElement) input.value = String(Math.round(part.values[field] * 100) / 100);
  }
  byId('part-hidden').checked = part.hidden;
  byId('part-flip').checked = part.flip;
  byId('reset-part').disabled = !Object.hasOwn(layout.parts, currentKey(part));
  const keys = placementKeys(part, avatar, direction);
  const narrower = scopeInput.value === 'angle' ? [keys.art, keys.body] : scopeInput.value === 'art' ? [keys.body] : [];
  byId('scope-note').textContent = narrower.some(key => Object.hasOwn(layout.parts, key)) ?
    'A more specific adjustment may override this one.' : 'Applies to the selected viewing angle.';
  byId('send-back').disabled = part === parts[0];
  byId('bring-forward').disabled = part === parts.at(-1);
  drawStage(part);
}

function nudge(x, y) {
  const part = currentPart();
  if (part) updateRule(currentKey(part), { x: constrain('x', part.values.x + x), y: constrain('y', part.values.y + y) });
}

function shiftLayer(move) {
  const part = currentPart();
  const next = parts[parts.indexOf(part) + move];
  if (part && next) updateRule(currentKey(part), { order: constrain('order', next.order + move) });
}

function rigPoint(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left - canvas.clientLeft) * canvas.width / canvas.clientWidth;
  const y = (event.clientY - rect.top - canvas.clientTop) * canvas.height / canvas.clientHeight;
  return { x: (x - camera.x) / camera.scale, y: (y - camera.y) / camera.scale };
}

function containsPoint(part, point) {
  const x = point.x * camera.mirror - part.x;
  const y = point.y - part.y;
  const localX = x * Math.cos(part.angle) + y * Math.sin(part.angle);
  const localY = -x * Math.sin(part.angle) + y * Math.cos(part.angle);
  const visible = visiblePartRect(part);
  return visible.width > 0 && visible.height > 0 && localX >= visible.left && localX <= visible.left + visible.width &&
    localY >= visible.top && localY <= visible.top + visible.height;
}

canvas.addEventListener('pointerdown', event => {
  if (!camera || event.button !== 0) return;
  canvas.focus({ preventScroll: true });
  const point = rigPoint(event);
  const active = currentPart();
  const part = active && containsPoint(active, point) ? active : parts.findLast(layer => !layer.hidden && containsPoint(layer, point));
  if (!part) return;
  selected = part.id;
  drag = { pointer: event.pointerId, point, x: part.values.x, y: part.values.y, key: currentKey(part), started: false };
  canvas.setPointerCapture(event.pointerId);
  render();
});
canvas.addEventListener('pointermove', event => {
  if (drag?.pointer !== event.pointerId) return;
  const point = rigPoint(event);
  const x = constrain('x', drag.x + point.x - drag.point.x);
  const y = constrain('y', drag.y + point.y - drag.point.y);
  if (!drag.started) {
    if (x === drag.x && y === drag.y) return;
    remember();
    drag.started = true;
  }
  updateRule(drag.key, { x, y }, false);
});
for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(eventName, event => {
  if (drag?.pointer !== event.pointerId) return;
  if (drag.started) saveDraft();
  drag = undefined;
});
canvas.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault(); undo(); return;
  }
  const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!delta) return;
  event.preventDefault();
  nudge(...delta.map(value => value * (event.shiftKey ? 2 : 0.25)));
});

const angleButtons = document.querySelectorAll('[data-angle]');
for (const button of angleButtons) button.addEventListener('click', () => {
  direction = button.dataset.angle;
  for (const angle of angleButtons) angle.setAttribute('aria-pressed', String(button === angle));
  render();
});
[scopeInput, poseInput, zoomInput].forEach(input => input.addEventListener('change', () => render()));
for (const button of document.querySelectorAll('[data-nudge]')) button.addEventListener('click', event => {
  nudge(...button.dataset.nudge.split(',').map(value => Number(value) * (event.shiftKey ? 2 : 0.25)));
});
for (const [id, field] of [['part-hidden', 'hidden'], ['part-flip', 'flip']]) {
  byId(id).addEventListener('change', event => {
    const part = currentPart();
    if (part) updateRule(currentKey(part), { [field]: event.target.checked });
  });
}
byId('undo').addEventListener('click', undo);
byId('send-back').addEventListener('click', () => shiftLayer(-1));
byId('bring-forward').addEventListener('click', () => shiftLayer(1));
byId('reset-part').addEventListener('click', () => {
  const part = currentPart();
  if (part) {
    const next = { version: 1, parts: { ...layout.parts } };
    delete next.parts[currentKey(part)];
    replaceDraft(next);
  }
});
byId('published').addEventListener('click', () => {
  replaceDraft(published);
  status('Published layout loaded into the editor. You can undo this change.');
});

const importFile = byId('import-file');
byId('import').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async () => {
  try {
    const file = importFile.files[0];
    if (!file) return;
    replaceDraft(validateAvatarLayout(JSON.parse(await file.text())));
    status('Layout imported as a draft. Export it to commit your changes.');
  } catch (error) { status(error.message); }
  finally { importFile.value = ''; }
});
byId('export').addEventListener('click', () => {
  const ordered = Object.fromEntries(Object.entries(layout.parts).sort(([a], [b]) => a.localeCompare(b)));
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, parts: ordered }, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.download = 'avatar-layout.json';
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status('Exported avatar-layout.json. Replace the file in the project root and commit it when ready.');
});

const layoutPromise = loadAvatarLayout().catch(() => null);
const [artLoaded, publishedFile] = await Promise.all([avatarArtReady, layoutPromise]);
if (publishedFile) published = publishedFile;
byId('published').disabled = !publishedFile;
byId('export').disabled = !artLoaded;
byId('import').disabled = !artLoaded;
layout = published;
let draftRecovered = false;
try {
  const saved = localStorage.getItem(draftKey);
  if (saved) { layout = validateAvatarLayout(JSON.parse(saved)); draftRecovered = true; }
} catch {
  // Leave the published layout in place if the saved draft is unavailable.
}
ready = artLoaded;
status(!artLoaded ? 'The avatar atlas could not load. Refresh to retry.' : draftRecovered ? 'Your saved draft is open.' :
  publishedFile ? 'Editing a draft of the published layout.' : 'Editing the built-in layout. The published file could not load.');
render();
