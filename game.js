import { Room, capacity, cleanName, colors, width, height, position } from './room.js';

const byId = id => document.getElementById(id);
const canvas = byId('field');
const context = canvas.getContext('2d');
const nameInput = byId('name');
const status = byId('status');
const keys = new Set();
const pointerDirections = new Map();
const directions = { w: 'up', a: 'left', s: 'down', d: 'right', arrowup: 'up', arrowleft: 'left', arrowdown: 'down', arrowright: 'right' };
let mode = 'solo';
let room;
let inviteId;

function setStatus(message) {
  status.textContent = message;
}

function renderRoster() {
  const players = [...room.players.values()];
  byId('count').textContent = `${players.length} ${players.length === 1 ? 'player' : 'players'}`;
  byId('players').replaceChildren(...players.map(player => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = player.color;
    item.append(swatch, player.name + (player === room.local ? ' (you)' : ''));
    return item;
  }));
}

function setMode(next) {
  mode = next;
  byId('mode').textContent = { solo: 'Solo', host: 'Hosting', join: 'Joining', guest: 'In room' }[mode];
  byId('choices').hidden = mode !== 'solo';
  byId('hosting').hidden = mode !== 'host';
  byId('joining').hidden = mode !== 'join';
  byId('leave').hidden = mode === 'solo';
  byId('leave').textContent = mode === 'host' ? 'Close room' : mode === 'join' ? 'Cancel join' : 'Leave room';
  nameInput.disabled = mode === 'join' && (byId('reply').disabled || !byId('answer').hidden) || mode === 'guest';
}

function clearInvite() {
  inviteId = undefined;
  byId('offer').hidden = true;
  byId('invite-code').value = '';
  byId('reply-in').value = '';
  byId('accept').disabled = false;
  byId('cancel-invite').disabled = false;
  byId('invite').disabled = false;
}

function reset(message) {
  room?.close();
  const local = { id: 'local', name: cleanName(nameInput.value) || 'Traveler', color: colors[0], x: width / 2, y: height / 2 };
  room = new Room(local, joined => {
    if (joined && mode === 'join') {
      setMode('guest');
      setStatus('Connected to the room.');
    } else if (joined && mode === 'host') {
      setStatus('Guest connected. Create another invite to add a friend.');
    }
    renderRoster();
  }, (lostHost, id, wasPlaying) => {
    if (lostHost) {
      reset(wasPlaying ? 'The connection to the host ended.' : 'Could not reach the host. Try the same Wi-Fi and ask for a fresh invite.');
      return;
    }
    if (id === inviteId) clearInvite();
    setStatus(wasPlaying ? 'A guest left the room.' : 'Could not reach the guest. Try the same Wi-Fi and make a fresh invite.');
    renderRoster();
  });
  clearInvite();
  byId('offer-in').value = '';
  byId('offer-in').readOnly = false;
  byId('reply-code').value = '';
  byId('answer').hidden = true;
  byId('reply').disabled = false;
  setMode('solo');
  setStatus(message);
  renderRoster();
}

function showJoin(invite = '') {
  setMode('join');
  byId('offer-in').value = invite;
  setStatus(invite ? 'Choose a display name and generate a reply.' : 'Paste an invite link from the host to join.');
}

nameInput.addEventListener('input', () => {
  const requested = cleanName(nameInput.value) || 'Traveler';
  const guestNames = new Set([...room.players.values()].filter(player => player !== room.local).map(player => player.name.toLowerCase()));
  if (guestNames.has(requested.toLowerCase())) {
    setStatus('That display name is already in use.');
    return;
  }
  room.local.name = requested;
  renderRoster();
});
byId('host').addEventListener('click', () => {
  setMode('host');
  setStatus(`Create a separate invite for each friend. Up to ${capacity} players can share the field.`);
});
byId('join').addEventListener('click', () => showJoin());
byId('leave').addEventListener('click', () => reset('Play solo or invite friends to share the field.'));

byId('invite').addEventListener('click', async () => {
  const activeRoom = room;
  byId('invite').disabled = true;
  setStatus('Preparing your invite. This can take a few seconds.');
  try {
    const { id, token } = await activeRoom.offer();
    if (activeRoom !== room) return;
    inviteId = id;
    const url = new URL(location.href);
    url.hash = `invite=${token}`;
    byId('invite-code').value = url.href;
    byId('offer').hidden = false;
    setStatus('Send the link in a private chat and ask your friend to send back their reply code.');
  } catch (error) {
    if (activeRoom !== room) return;
    clearInvite();
    setStatus(error.message);
  }
});

byId('cancel-invite').addEventListener('click', () => {
  const peer = room.guests.get(inviteId);
  if (peer) room.drop(peer);
  clearInvite();
  setStatus('Invite canceled.');
});

byId('accept').addEventListener('click', async () => {
  const activeRoom = room;
  const id = inviteId;
  byId('accept').disabled = true;
  byId('cancel-invite').disabled = true;
  try {
    await activeRoom.accept(id, byId('reply-in').value);
    if (room !== activeRoom || inviteId !== id) return;
    clearInvite();
    if (!activeRoom.players.has(id)) setStatus('Connecting to your guest…');
  } catch (error) {
    if (room !== activeRoom || inviteId !== id) return;
    byId('accept').disabled = false;
    byId('cancel-invite').disabled = false;
    setStatus(error.message);
  }
});

byId('reply').addEventListener('click', async () => {
  const activeRoom = room;
  byId('reply').disabled = true;
  byId('offer-in').readOnly = true;
  setMode('join');
  setStatus('Preparing your reply. This can take a few seconds.');
  try {
    const token = await activeRoom.answer(byId('offer-in').value);
    if (room !== activeRoom || mode !== 'join') return;
    byId('reply-code').value = token;
    byId('answer').hidden = false;
    setStatus('Send the reply code back to the host. Keep this tab open while they connect you.');
  } catch (error) {
    if (room !== activeRoom) return;
    byId('reply').disabled = false;
    byId('offer-in').readOnly = false;
    setMode('join');
    setStatus(error.message);
  }
});

for (const [buttonId, fieldId] of [['copy-invite', 'invite-code'], ['copy-reply', 'reply-code']]) {
  byId(buttonId).addEventListener('click', async () => {
    const field = byId(fieldId);
    try {
      await navigator.clipboard.writeText(field.value);
      setStatus(buttonId === 'copy-invite' ? 'Invite copied. Send it to one friend.' : 'Reply copied. Send it back to the host.');
    } catch {
      field.focus();
      field.select();
      setStatus('Text selected. Use your browser’s copy command.');
    }
  });
}

addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!Object.hasOwn(directions, key) || event.target.closest('input, textarea, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
  event.preventDefault();
  keys.add(key);
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
for (const button of document.querySelectorAll('[data-move]')) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    pointerDirections.set(event.pointerId, button.dataset.move);
    button.toggleAttribute('data-held', true);
  });
  const release = event => {
    pointerDirections.delete(event.pointerId);
    button.toggleAttribute('data-held', [...pointerDirections.values()].includes(button.dataset.move));
  };
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, release);
  button.addEventListener('click', event => {
    if (!event.detail) move(new Set([button.dataset.move]), 0.1);
  });
}
addEventListener('blur', () => {
  keys.clear();
  pointerDirections.clear();
  document.querySelectorAll('[data-held]').forEach(button => button.removeAttribute('data-held'));
});
addEventListener('pagehide', () => room.close());
addEventListener('pageshow', event => {
  if (event.persisted) reset('Play solo or invite friends to share the field.');
});

function move(active, seconds) {
  const dx = Number(active.has('right')) - Number(active.has('left'));
  const dy = Number(active.has('down')) - Number(active.has('up'));
  if (!dx && !dy) return;
  const distance = 185 * seconds / Math.hypot(dx, dy);
  const { x, y } = room.local;
  Object.assign(room.local, position(x + dx * distance, y + dy * distance));
}

function makeField() {
  const field = document.createElement('canvas');
  field.width = width;
  field.height = height;
  const ground = field.getContext('2d');
  ground.fillStyle = '#203930';
  ground.fillRect(0, 0, width, height);
  for (let y = 0; y < height; y += 40) {
    for (let x = 0; x < width; x += 40) {
      ground.fillStyle = (x + y) % 80 === 0 ? '#27453a' : '#29483c';
      ground.fillRect(x + 1, y + 1, 39, 39);
    }
  }
  ground.fillStyle = '#365b47';
  for (let index = 1; index < 105; index++) {
    const x = (index * 397) % (width - 20) + 8;
    const y = (index * index * 79) % (height - 20) + 8;
    ground.fillRect(x, y, 2, 6);
    ground.fillRect(x + 4, y - 3, 2, 8);
    ground.fillRect(x + 8, y + 1, 2, 5);
  }
  ground.strokeStyle = '#52735b';
  ground.lineWidth = 2;
  ground.strokeRect(8, 8, width - 16, height - 16);
  return field;
}

function drawPlayer(player) {
  const { x, y, color } = player;
  context.fillStyle = '#10221e';
  context.fillRect(x - 13, y - 11, 29, 29);
  context.fillStyle = color;
  context.fillRect(x - 14, y - 14, 28, 28);
  context.fillStyle = '#ffffff55';
  context.fillRect(x - 14, y - 14, 28, 4);
}

function drawLabels(players, fontSize) {
  const occupied = players.map(({ x, y }) => ({ left: x - 15, top: y - 15, right: x + 15, bottom: y + 18 }));
  const labelHeight = fontSize + 7;
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  for (const { x, y, name } of players) {
    const labelWidth = context.measureText(name).width + 16;
    const centerX = Math.max(labelWidth / 2 + 4, Math.min(width - labelWidth / 2 - 4, x));
    const left = centerX - labelWidth / 2;
    const right = left + labelWidth;
    for (let row = 0; row < players.length * 2; row++) {
      const offset = Math.floor(row / 2) * (labelHeight + 3);
      const top = row % 2 === 0 ? y - 18 - labelHeight - offset : y + 21 + offset;
      const bottom = top + labelHeight;
      if (top < 4 || bottom > height - 4 || occupied.some(box => left < box.right && right > box.left && top < box.bottom && bottom > box.top)) continue;
      occupied.push({ left, right, top, bottom });
      context.fillStyle = '#10221e';
      context.fillRect(left, top, labelWidth, labelHeight);
      context.fillStyle = '#f4f8f3';
      context.fillText(name, centerX, top + labelHeight / 2);
      break;
    }
  }
}

reset('Play solo or invite friends to share the field.');
const incoming = new URLSearchParams(location.hash.slice(1)).get('invite');
if (incoming) {
  showJoin(incoming);
  history.replaceState(null, '', location.pathname + location.search);
}
const field = makeField();
let labelSize = 19;
new ResizeObserver(([entry]) => {
  labelSize = Math.max(19, Math.min(32, Math.round(13 * width / entry.contentRect.width)));
}).observe(canvas);
let lastFrame = performance.now();
function frame(now) {
  move(new Set([...Array.from(keys, key => directions[key]), ...pointerDirections.values()]), Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)));
  lastFrame = now;
  context.drawImage(field, 0, 0);
  const players = [...room.players.values()].sort((a, b) => a.y - b.y);
  for (const player of players) drawPlayer(player);
  drawLabels(players, labelSize);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => room.tick(), 65);
