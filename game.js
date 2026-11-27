import { Room, capacity, chatLimit, maxMuteSeconds, cleanName, colors, width, height, position } from './room.js?v=15';
import { avatarArtReady, avatarBounds, avatarOptions, cleanAvatar, drawAvatar, setPublishedAvatarLayout, walkPose } from './avatar.js?v=14';
import { loadAvatarLayout } from './avatar-layout.js?v=14';
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
const avatarEditor = byId('avatar-editor');
const preview = byId('avatar-preview');
const previewContext = preview.getContext('2d');
const previewAngles = document.querySelectorAll('[data-angle]');
const muteDialog = byId('mute-dialog');
const muteTime = byId('mute-time');
const muteUnit = byId('mute-unit');
const pageTitle = document.title;
const keys = new Set();
const bubbles = new Map();
let poses = new Map();
const directions = { w: 'up', a: 'left', s: 'down', d: 'right', arrowup: 'up', arrowleft: 'left', arrowdown: 'down', arrowright: 'right' };
let mode = 'solo';
let room;
let inviteId;
let destination;
let unread = 0;
let mutingId;
let playerAvatar;
let previewAngle = 'south';

function loadProfile() {
  try {
    return JSON.parse(localStorage.getItem('planet-ih-profile'));
  } catch {
    return null;
  }
}

function saveProfile() {
  try {
    localStorage.setItem('planet-ih-profile', JSON.stringify({ name: cleanName(nameInput.value), avatar: playerAvatar }));
  } catch {
    // The profile still applies to the current tab.
  }
}

const profile = loadProfile();
nameInput.value = cleanName(profile?.name);
playerAvatar = cleanAvatar(profile?.avatar);

function updateAvatarPreview() {
  previewContext.clearRect(0, 0, preview.width, preview.height);
  const bounds = avatarBounds({ avatar: playerAvatar, x: 0, y: 0 });
  const zoom = Math.min((preview.width - 38) / (bounds.right - bounds.left), (preview.height - 44) / (bounds.bottom - bounds.top));
  const footY = (preview.height - (bounds.top + bounds.bottom) * zoom) / 2;
  drawAvatar(previewContext, playerAvatar, colors[0], preview.width / 2, footY, previewAngle, 0, zoom);
}

for (const button of previewAngles) {
  button.addEventListener('click', () => {
    previewAngle = button.dataset.angle;
    for (const angle of previewAngles) angle.setAttribute('aria-pressed', String(angle === button));
    preview.setAttribute('aria-label', `${button.textContent} view of your avatar`);
    updateAvatarPreview();
  });
}

for (const [key, choices] of Object.entries(avatarOptions)) {
  const field = document.createElement('div');
  const label = document.createElement('label');
  const select = document.createElement('select');
  select.id = `avatar-${key}`;
  label.htmlFor = select.id;
  const words = key.replace(/([A-Z])/g, ' $1').toLowerCase();
  label.textContent = words.charAt(0).toUpperCase() + words.slice(1);
  for (const value of choices) select.add(new Option(value, value));
  select.value = playerAvatar[key];
  select.addEventListener('change', () => {
    playerAvatar = { ...playerAvatar, [key]: select.value };
    room.local.avatar = playerAvatar;
    saveProfile();
    updateAvatarPreview();
  });
  field.append(label, select);
  byId('avatar-fields').append(field);
}
void avatarArtReady.then(loaded => {
  if (loaded) updateAvatarPreview();
  else setStatus('The avatar art could not load. Refresh to try again.');
});
void loadAvatarLayout().then(layout => {
  setPublishedAvatarLayout(layout);
  updateAvatarPreview();
}).catch(error => console.warn(error.message));

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
  renderChatNotice();
}

function renderChatNotice() {
  const remaining = room?.muteRemaining() ?? 0;
  const muteAlert = remaining && !canSeeNewestMessage() ? `Chat muted · ${muteLength(remaining)} left` : '';
  const unreadAlert = unread === 1 ? '1 new chat message' : unread ? `${unread} new chat messages` : '';
  const alert = muteAlert || unreadAlert;
  chatNotice.hidden = !alert;
  if (chatNotice.textContent !== alert) chatNotice.textContent = alert;
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

function muteLength(ms) {
  const seconds = Math.ceil(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainder = seconds % 60;
  return [hours && `${hours}h`, minutes && `${minutes}m`, remainder && `${remainder}s`].filter(Boolean).join(' ');
}

function updateMuteLimit() {
  muteTime.max = String(Math.floor(maxMuteSeconds / Number(muteUnit.value)));
}

function openMute(player) {
  mutingId = player.id;
  byId('mute-title').textContent = `Mute ${player.name}`;
  muteTime.value = '';
  muteUnit.value = '60';
  updateMuteLimit();
  muteDialog.showModal();
  muteTime.focus();
}

muteUnit.addEventListener('change', updateMuteLimit);
byId('cancel-mute').addEventListener('click', () => muteDialog.close());
byId('mute-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!event.target.reportValidity()) return;
  const player = room.players.get(mutingId);
  const seconds = Number(muteTime.value) * Number(muteUnit.value);
  muteDialog.close();
  if (mode === 'host' && player && seconds > 0 && room.setMute(player.id, seconds)) {
    setStatus(`${player.name} was muted for ${muteLength(seconds * 1000)}.`);
  }
});

function updateChatAccess() {
  const remaining = room?.muteRemaining() ?? 0;
  const canChat = mode === 'host' || mode === 'guest';
  const disabled = !canChat || remaining > 0;
  if (messageInput.disabled !== disabled) {
    messageInput.disabled = disabled;
    byId('send-chat').disabled = disabled;
  }
  const placeholder = remaining ? 'Chat muted' : canChat ? 'Write a message' : 'Host or join to chat';
  if (messageInput.placeholder !== placeholder) messageInput.placeholder = placeholder;
  byId('mute-notice').hidden = !remaining;
  const countdown = remaining ? `${muteLength(remaining)} remaining.` : '';
  if (byId('mute-countdown').textContent !== countdown) byId('mute-countdown').textContent = countdown;
  renderChatNotice();
}

function showMute(duration) {
  byId('mute-reason').textContent = duration ? `The host muted your chat for ${muteLength(duration)}.` : '';
  byId('chat-status').hidden = true;
  updateChatAccess();
}
setInterval(updateChatAccess, 250);

function renderRoster() {
  const players = [...room.players.values()];
  byId('count').textContent = `${players.length} ${players.length === 1 ? 'player' : 'players'}`;
  byId('players').replaceChildren(...players.map(player => {
    const item = document.createElement('li');
    const swatch = document.createElement('span');
    swatch.className = 'swatch';
    swatch.style.backgroundColor = player.color;
    const name = document.createElement('span');
    name.className = 'player-name';
    name.textContent = player.name + (player === room.local ? ' (you)' : '');
    item.append(swatch, name);
    if (mode === 'host' && player !== room.local) {
      const moderation = document.createElement('span');
      moderation.className = 'moderation';
      const mute = document.createElement('button');
      const muted = Boolean(room.muteRemaining(player.id));
      mute.textContent = muted ? 'Unmute' : 'Mute';
      mute.setAttribute('aria-label', `${mute.textContent} ${player.name}`);
      mute.addEventListener('click', () => {
        if (!room.muteRemaining(player.id)) openMute(player);
        else if (room.setMute(player.id, 0)) setStatus(`${player.name} can chat again.`);
      });
      const kick = document.createElement('button');
      kick.className = 'kick';
      kick.textContent = 'Kick';
      kick.setAttribute('aria-label', `Kick ${player.name}`);
      kick.addEventListener('click', () => {
        room.kick(player.id);
        setStatus(`${player.name} was removed from the room.`);
      });
      moderation.append(mute, kick);
      item.append(moderation);
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
  byId('browser-transfer').hidden = mode !== 'join' || byId('reply').disabled || !byId('browser-invite-fallback').value;
  byId('leave').hidden = mode === 'solo';
  byId('leave').textContent = mode === 'host' ? 'Close room' : mode === 'join' ? 'Cancel join' : 'Leave room';
  byId('room-name').hidden = mode === 'guest';
  nameInput.disabled = mode === 'join' && (byId('reply').disabled || !byId('answer').hidden) || mode === 'guest';
  avatarEditor.hidden = mode === 'host' || mode === 'guest' || (mode === 'join' && byId('reply').disabled);
  const canChat = mode === 'host' || mode === 'guest';
  document.querySelector('.audio-options').hidden = !canChat;
  updateChatAccess();
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
  byId('discord-invite-fallback').value = '';
  byId('discord-invite-fallback').hidden = true;
  byId('reply-in').value = '';
  byId('reply-in').readOnly = false;
  byId('accept').disabled = false;
  byId('cancel-invite').disabled = false;
  byId('cancel-invite').textContent = 'Cancel invite';
  byId('invite').disabled = false;
}

function reset(message) {
  room?.close();
  if (muteDialog.open) muteDialog.close();
  destination = undefined;
  poses.clear();
  bubbles.clear();
  chatLog.replaceChildren();
  updateUnread(0);
  byId('chat-empty').hidden = false;
  byId('chat-status').hidden = true;
  messageInput.value = '';
  updateMessageCount();
  const local = { id: 'local', name: cleanName(nameInput.value) || 'Traveler', color: colors[0], avatar: playerAvatar, x: width / 2, y: height / 2 };
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
  }, showChat, updateAmbience, showMute);
  clearInvite();
  byId('offer-in').value = '';
  byId('offer-in').readOnly = false;
  byId('reply-code').value = '';
  byId('browser-invite-fallback').value = '';
  byId('browser-invite-fallback').hidden = true;
  byId('answer').hidden = true;
  byId('reply').hidden = false;
  byId('reply').textContent = 'Generate reply';
  byId('reply').disabled = false;
  setMode('solo');
  showMute(0);
  setStatus(message);
  renderRoster();
}

function showJoin(invite = '') {
  byId('offer-in').value = invite;
  byId('offer-entry').hidden = Boolean(invite);
  byId('browser-invite-fallback').value = invite ? inviteUrl(invite) : '';
  byId('browser-invite-fallback').hidden = true;
  setMode('join');
  setStatus(invite ? 'Choose a name and avatar, then generate a reply.' : 'Paste an invite link or code from the host to join.');
}

function inviteUrl(token) {
  const url = new URL(location.href);
  url.search = '';
  url.hash = /^[Ii]\./.test(token) ? token : new URLSearchParams({ invite: token }).toString();
  return url.href;
}

nameInput.addEventListener('input', () => {
  const requested = cleanName(nameInput.value) || 'Traveler';
  const guestNames = new Set([...room.players.values()].filter(player => player !== room.local).map(player => player.name.toLowerCase()));
  if (guestNames.has(requested.toLowerCase())) {
    setStatus('That display name is already in use.');
    return;
  }
  room.local.name = requested;
  saveProfile();
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
    byId('invite-code').value = inviteUrl(token);
    byId('discord-invite-fallback').value = '```\n' + token + '\n```';
    byId('offer').hidden = false;
    setStatus('Send the invite in a private chat and ask your friend to send back their reply code.');
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
  ['copy-invite', 'invite-code'], ['discord-invite', 'discord-invite-fallback'],
  ['copy-browser-invite', 'browser-invite-fallback'],
  ['copy-reply', 'reply-code'], ['discord-reply', 'reply-code'],
]) {
  byId(buttonId).addEventListener('click', async () => {
    const field = byId(fieldId);
    let text = field.value;
    if (buttonId === 'discord-reply') text = '```\n' + text + '\n```';
    try {
      await navigator.clipboard.writeText(text);
      const messages = {
        'copy-invite': 'Invite link copied. Send it to one friend.',
        'discord-invite': 'Invite code copied. Your friend can copy it from Discord and paste it under Join room in their browser.',
        'copy-browser-invite': 'Invite copied. Paste it into your browser’s address bar.',
      };
      setStatus(messages[buttonId] ?? 'Reply copied. Send it to the host, then come back to this tab.');
    } catch {
      field.hidden = false;
      field.focus();
      field.select();
      setStatus('Text selected. Use your browser’s copy command.');
    }
  });
}

addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!Object.hasOwn(directions, key) || event.target.closest('input, textarea, select, dialog, #chat-history, [contenteditable]') || event.metaKey || event.ctrlKey || event.altKey) return;
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

function placeLabel(x, bounds, labelWidth, labelHeight, occupied, rows, spacing = labelHeight + 4) {
  const centerX = Math.max(labelWidth / 2 + 5, Math.min(width - labelWidth / 2 - 5, x));
  const left = centerX - labelWidth / 2;
  const right = left + labelWidth;
  for (let row = 0; row < rows; row++) {
    const offset = Math.floor(row / 2) * spacing;
    const top = row % 2 === 0 ? bounds.top - 4 - labelHeight - offset : bounds.bottom + 5 + offset;
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
  const bounds = new Map(players.map(player => [player.id, avatarBounds(player)]));
  const occupied = [...bounds.values()];
  const labelHeight = fontSize + 7;
  context.font = `bold ${fontSize}px system-ui, sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  if (!hideNames.checked) {
    for (const { x, id, name } of players) {
      const labelWidth = context.measureText(name).width + 16;
      const box = placeLabel(x, bounds.get(id), labelWidth, labelHeight, occupied, players.length * 2);
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
    const box = placeLabel(player.x, bounds.get(id), bubble.width, bubbleHeight, occupied, 48, 12);
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
  const currentPoses = new Map();
  for (const { id, avatar, color, x, y } of players) {
    const pose = walkPose(avatar, poses.get(id), x, y, now);
    currentPoses.set(id, pose);
    drawAvatar(context, avatar, color, x, y, pose.direction, pose.phase);
  }
  poses = currentPoses;
  drawOverlays(players, labelSize, now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => room.tick(), 65);
