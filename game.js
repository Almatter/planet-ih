import { Room, capacity, chatLimit, cleanName, colors, width, height, position } from './room.js?v=7';
import { backdrops, defaultAmbience, tracks } from './ambience.js';
import { RoomAudio } from './room-audio.js';

const byId = id => document.getElementById(id);
const canvas = byId('field');
const context = canvas.getContext('2d');
const nameInput = byId('name');
const status = byId('status');
const hideNames = byId('hide-names');
const musicEnabled = byId('music-enabled');
const sfxEnabled = byId('sfx-enabled');
const backdropSelect = byId('backdrop');
const trackSelect = byId('track');
const audio = new RoomAudio();
const messageInput = byId('message');
const chatHistory = byId('chat-history');
const chatLog = byId('chat-log');
const chatNotice = byId('chat-notice');
const chatEnd = byId('chat-end');
const pageTitle = document.title;
const keys = new Set();
const bubbles = new Map();
const directions = { w: 'up', a: 'left', s: 'down', d: 'right', arrowup: 'up', arrowleft: 'left', arrowdown: 'down', arrowright: 'right' };
let mode = 'solo';
let room;
let inviteId;
let destination;
let unread = 0;

function setPreference(input, fallback) {
  const key = `planet-ih-${input.id}`;
  try {
    const saved = localStorage.getItem(key);
    input.checked = saved === null ? fallback : saved === 'true';
  } catch {
    input.checked = fallback;
  }
  input.addEventListener('change', () => {
    try {
      localStorage.setItem(key, String(input.checked));
    } catch {
      // Use the in-page setting when the browser disallows storage.
    }
  });
}
setPreference(hideNames, false);
setPreference(musicEnabled, false);
setPreference(sfxEnabled, true);

for (const [select, choices] of [[backdropSelect, backdrops], [trackSelect, tracks]]) {
  for (const [value, label] of Object.entries(choices)) select.add(new Option(label, value));
  select.addEventListener('change', () => {
    if (mode === 'host') room.setAmbience({ backdrop: backdropSelect.value, track: trackSelect.value });
  });
}

function updateAmbience(ambience) {
  const inRoom = mode === 'host' || mode === 'guest';
  canvas.dataset.backdrop = ambience.backdrop;
  backdropSelect.value = ambience.backdrop;
  trackSelect.value = ambience.track;
  byId('room-track').textContent = ambience.track === 'none' ? 'No room music' : `Room track · ${tracks[ambience.track]}`;
  audio.setTrack(inRoom && musicEnabled.checked ? ambience.track : 'none');
}

function unlockAudio() {
  if (musicEnabled.checked || sfxEnabled.checked) void audio.unlock();
}
addEventListener('click', unlockAudio, { capture: true });
addEventListener('keydown', unlockAudio, { capture: true });
musicEnabled.addEventListener('change', () => {
  updateAmbience(room.ambience);
  unlockAudio();
});
sfxEnabled.addEventListener('change', unlockAudio);

function nearChatBottom() {
  return chatHistory.scrollHeight - chatHistory.scrollTop - chatHistory.clientHeight < 28;
}

function updateUnread(count) {
  unread = count;
  document.title = unread ? `(${unread}) ${pageTitle}` : pageTitle;
  chatNotice.hidden = !unread;
  chatNotice.textContent = unread === 1 ? '1 new chat message' : `${unread} new chat messages`;
}

function markChatRead() {
  if (unread && canSeeNewestMessage()) updateUnread(0);
}

function canSeeNewestMessage() {
  if (document.hidden || !nearChatBottom()) return false;
  const end = chatEnd.getBoundingClientRect();
  return end.top >= 0 && end.bottom <= document.documentElement.clientHeight;
}

new IntersectionObserver(markChatRead).observe(chatEnd);
document.addEventListener('visibilitychange', markChatRead);
chatHistory.addEventListener('scroll', markChatRead, { passive: true });
chatNotice.addEventListener('click', () => {
  chatHistory.scrollTop = chatHistory.scrollHeight;
  byId('chat-title').scrollIntoView({ block: 'center' });
  chatHistory.focus({ preventScroll: true });
  updateUnread(0);
});

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
    if (mode === 'host' && player !== room.local) {
      const kick = document.createElement('button');
      kick.className = 'kick';
      kick.textContent = 'Kick';
      kick.setAttribute('aria-label', `Kick ${player.name}`);
      kick.addEventListener('click', () => {
        room.kick(player.id);
        setStatus(`${player.name} was removed from the room.`);
      });
      item.append(kick);
    }
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
  byId('room-name').hidden = mode === 'guest';
  nameInput.disabled = mode === 'join' && (byId('reply').disabled || !byId('answer').hidden) || mode === 'guest';
  const canChat = mode === 'host' || mode === 'guest';
  document.querySelector('.audio-options').hidden = !canChat;
  messageInput.disabled = !canChat;
  messageInput.placeholder = canChat ? 'Write a message' : 'Host or join to chat';
  byId('send-chat').disabled = !canChat;
  updateAmbience(room?.ambience ?? defaultAmbience);
}

function showChat(entries, silent) {
  const follow = nearChatBottom() ||
    (!silent && entries.some(entry => entry.playerId === room.local.id));
  const incoming = silent ? 0 : entries.filter(entry => entry.playerId !== room.local.id).length;
  const added = document.createDocumentFragment();
  for (const { playerId, name, text, color } of entries) {
    const row = document.createElement('li');
    const author = document.createElement('strong');
    author.textContent = name;
    author.style.color = color;
    row.append(author, ' ', text);
    added.append(row);
    if (!silent) bubbles.set(playerId, { text, expires: performance.now() + 5000 + Array.from(text).length * 45 });
  }
  byId('chat-empty').hidden = true;
  chatLog.append(added);
  if (follow) chatHistory.scrollTop = chatHistory.scrollHeight;
  if (incoming) {
    if (sfxEnabled.checked) audio.chime();
    if (!canSeeNewestMessage()) updateUnread(unread + incoming);
  }
}

function updateMessageCount() {
  const characters = Array.from(messageInput.value);
  if (characters.length > chatLimit) messageInput.value = characters.slice(0, chatLimit).join('');
  byId('chat-count').textContent = `${Math.min(characters.length, chatLimit)} / ${chatLimit}`;
}

messageInput.addEventListener('input', event => {
  if (!event.isComposing) updateMessageCount();
});
messageInput.addEventListener('compositionend', updateMessageCount);
byId('chat-form').addEventListener('submit', event => {
  event.preventDefault();
  if (messageInput.disabled || !messageInput.value.trim()) return;
  const sent = room.say(messageInput.value);
  const chatStatus = byId('chat-status');
  chatStatus.hidden = sent;
  chatStatus.textContent = sent ? '' : 'The connection is busy. Try sending again.';
  if (sent) {
    messageInput.value = '';
    updateMessageCount();
  }
});

function clearInvite() {
  inviteId = undefined;
  byId('offer').hidden = true;
  byId('invite-code').value = '';
  byId('reply-in').value = '';
  byId('reply-in').readOnly = false;
  byId('accept').disabled = false;
  byId('cancel-invite').disabled = false;
  byId('cancel-invite').textContent = 'Cancel invite';
  byId('invite').disabled = false;
}

function reset(message) {
  room?.close();
  destination = undefined;
  bubbles.clear();
  chatLog.replaceChildren();
  updateUnread(0);
  byId('chat-empty').hidden = false;
  byId('chat-status').hidden = true;
  messageInput.value = '';
  updateMessageCount();
  const local = { id: 'local', name: cleanName(nameInput.value) || 'Traveler', color: colors[0], x: width / 2, y: height / 2 };
  room = new Room(local, joined => {
    if (joined && mode === 'join') {
      setMode('guest');
      setStatus('Connected to the room.');
    } else if (joined && mode === 'host') {
      if (room.players.has(inviteId)) clearInvite();
      setStatus('Guest connected. Create another invite to add a friend.');
    }
    renderRoster();
  }, (lostHost, id, wasPlaying, reason) => {
    if (lostHost) {
      if (reason === 'kicked') reset('The host removed you from the room.');
      else reset(wasPlaying ? 'The connection to the host ended.' : 'The browser could not connect to the host. Return to the game and ask for a fresh invite.');
      return;
    }
    if (id === inviteId) clearInvite();
    setStatus(wasPlaying ? 'A guest left the room.' : 'The browser could not connect. Ask your guest to return to the game, then create a fresh invite.');
    renderRoster();
  }, showChat, updateAmbience);
  clearInvite();
  byId('offer-in').value = '';
  byId('offer-in').readOnly = false;
  byId('reply-code').value = '';
  byId('answer').hidden = true;
  byId('reply').hidden = false;
  byId('reply').textContent = 'Generate reply';
  byId('reply').disabled = false;
  setMode('solo');
  setStatus(message);
  renderRoster();
}

function showJoin(invite = '') {
  setMode('join');
  byId('offer-in').value = invite;
  byId('offer-entry').hidden = Boolean(invite);
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
    url.search = '';
    url.hash = token;
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
    byId('reply-in').readOnly = true;
    byId('cancel-invite').disabled = false;
    byId('cancel-invite').textContent = 'Cancel connection';
    setStatus('Connecting. Ask your friend to return to the game tab after sending their reply.');
  } catch (error) {
    if (room !== activeRoom || inviteId !== id) return;
    byId('accept').disabled = false;
    byId('cancel-invite').disabled = false;
    setStatus(error.message);
  }
});

byId('reply').addEventListener('click', async () => {
  const activeRoom = room;
  nameInput.blur();
  byId('offer-in').blur();
  byId('reply').disabled = true;
  byId('offer-in').readOnly = true;
  byId('reply').textContent = 'Generating reply…';
  setMode('join');
  setStatus('Preparing your reply. This can take a few seconds.');
  try {
    const token = await activeRoom.answer(byId('offer-in').value);
    if (room !== activeRoom || mode !== 'join') return;
    byId('reply-code').value = token;
    byId('answer').hidden = false;
    byId('reply').hidden = true;
    setStatus('Copy the reply, send it to the host, then come back to this tab.');
  } catch (error) {
    if (room !== activeRoom) return;
    byId('reply').disabled = false;
    byId('offer-in').readOnly = false;
    setMode('join');
    setStatus(error.message);
  } finally {
    if (activeRoom === room) byId('reply').textContent = 'Generate reply';
  }
});

for (const [buttonId, fieldId] of [
  ['copy-invite', 'invite-code'], ['discord-invite', 'invite-code'],
  ['copy-reply', 'reply-code'], ['discord-reply', 'reply-code'],
]) {
  byId(buttonId).addEventListener('click', async () => {
    const field = byId(fieldId);
    const isInvite = fieldId === 'invite-code';
    let text = field.value;
    if (buttonId === 'discord-invite') text = `[Join Planet IH](${text})`;
    if (buttonId === 'discord-reply') text = '```\n' + text + '\n```';
    try {
      await navigator.clipboard.writeText(text);
      setStatus(isInvite ? 'Invite copied. Send it to one friend.' : 'Reply copied. Send it to the host, then come back to this tab.');
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
  destination = undefined;
});
addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
canvas.addEventListener('click', event => {
  const bounds = canvas.getBoundingClientRect();
  destination = position((event.clientX - bounds.left) * width / bounds.width, (event.clientY - bounds.top) * height / bounds.height);
});
addEventListener('blur', () => keys.clear());
addEventListener('pagehide', () => {
  audio.setTrack('none');
  room.close();
});
addEventListener('pageshow', event => {
  if (event.persisted) reset('Play solo or invite friends to share the field.');
});

function move(active, seconds) {
  const { x, y } = room.local;
  const dx = destination ? destination.x - x : Number(active.has('right')) - Number(active.has('left'));
  const dy = destination ? destination.y - y : Number(active.has('down')) - Number(active.has('up'));
  const length = Math.hypot(dx, dy);
  const step = 185 * seconds;
  if (destination && length <= step) {
    Object.assign(room.local, destination);
    destination = undefined;
    return;
  }
  if (!dx && !dy) return;
  const distance = step / length;
  Object.assign(room.local, position(x + dx * distance, y + dy * distance));
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

function placeLabel(x, y, labelWidth, labelHeight, occupied, rows, spacing = labelHeight + 4) {
  const centerX = Math.max(labelWidth / 2 + 5, Math.min(width - labelWidth / 2 - 5, x));
  const left = centerX - labelWidth / 2;
  const right = left + labelWidth;
  for (let row = 0; row < rows; row++) {
    const offset = Math.floor(row / 2) * spacing;
    const top = row % 2 === 0 ? y - 20 - labelHeight - offset : y + 22 + offset;
    const bottom = top + labelHeight;
    if (top < 5 || bottom > height - 5 || occupied.some(box => left < box.right && right > box.left && top < box.bottom && bottom > box.top)) continue;
    const box = { left, right, top, bottom, centerX };
    occupied.push(box);
    return box;
  }
}

function wrapMessage(text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = '';
    for (const char of word) {
      if (line && context.measureText(line + char).width > maxWidth) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 4) {
    lines.length = 4;
    const last = Array.from(lines[3]);
    while (last.length && context.measureText(last.join('') + '…').width > maxWidth) last.pop();
    lines[3] = last.join('').trimEnd() + '…';
  }
  return lines;
}

function drawOverlays(players, fontSize, now) {
  const occupied = players.map(({ x, y }) => ({ left: x - 16, top: y - 16, right: x + 17, bottom: y + 19 }));
  const labelHeight = fontSize + 7;
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (!hideNames.checked) {
    for (const { x, y, name } of players) {
      const labelWidth = context.measureText(name).width + 16;
      const box = placeLabel(x, y, labelWidth, labelHeight, occupied, players.length * 2);
      if (!box) continue;
      context.fillStyle = '#2b1c14';
      context.fillRect(box.left, box.top, labelWidth, labelHeight);
      context.fillStyle = '#fff1db';
      context.fillText(name, box.centerX, box.top + labelHeight / 2);
    }
  }

  context.font = `${fontSize}px system-ui, sans-serif`;
  const lineHeight = fontSize + 6;
  for (const [id, bubble] of bubbles) {
    if (bubble.expires <= now) {
      bubbles.delete(id);
      continue;
    }
    const player = players.find(entry => entry.id === id);
    if (!player) continue;
    if (bubble.fontSize !== fontSize) {
      bubble.fontSize = fontSize;
      bubble.lines = wrapMessage(bubble.text, 340);
      bubble.width = Math.max(...bubble.lines.map(line => context.measureText(line).width)) + 28;
    }
    const bubbleHeight = bubble.lines.length * lineHeight + 15;
    const box = placeLabel(player.x, player.y, bubble.width, bubbleHeight, occupied, 48, 12);
    if (!box) continue;
    const above = box.bottom < player.y;
    const edge = above ? box.bottom : box.top;
    const tailX = Math.max(box.left + 15, Math.min(box.right - 15, player.x));
    context.fillStyle = '#fff1d9';
    context.beginPath();
    context.roundRect(box.left, box.top, bubble.width, bubbleHeight, 8);
    context.fill();
    context.beginPath();
    context.moveTo(tailX - 7, edge);
    context.lineTo(tailX, edge + (above ? 8 : -8));
    context.lineTo(tailX + 7, edge);
    context.fill();
    context.fillStyle = '#261810';
    bubble.lines.forEach((line, index) => context.fillText(line, box.centerX, box.top + 7 + (index + 0.5) * lineHeight));
  }
}

reset('Play solo or invite friends to share the field.');
function openInviteFromUrl() {
  const fragment = location.hash.slice(1);
  const incoming = /^[Ii]\./.test(fragment) ? fragment : new URLSearchParams(fragment).get('invite');
  if (!incoming) return;
  history.replaceState(null, '', location.pathname + location.search);
  if (mode === 'solo' || (mode === 'join' && !byId('reply').disabled)) showJoin(incoming);
  else setStatus('Open this invite in a new tab or leave the current room first.');
}
openInviteFromUrl();
addEventListener('hashchange', openInviteFromUrl);
let labelSize = 19;
new ResizeObserver(([entry]) => {
  labelSize = Math.max(19, Math.min(32, Math.round(13 * width / entry.contentRect.width)));
}).observe(canvas);
let lastFrame = performance.now();
function frame(now) {
  move(new Set(Array.from(keys, key => directions[key])), Math.min(0.05, Math.max(0, (now - lastFrame) / 1000)));
  lastFrame = now;
  context.clearRect(0, 0, width, height);
  const players = room.displayPlayers(now).sort((a, b) => a.y - b.y);
  for (const player of players) drawPlayer(player);
  drawOverlays(players, labelSize, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => room.tick(), 65);
