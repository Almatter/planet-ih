import { decodeSignal, encodeSignal } from './signaling.js?v=4';

const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
const playbackDelay = 110;
const gatheringLimit = 30000;
export const colors = ['#baf592', '#ffc375', '#74ddf6', '#f995bd', '#c7afff', '#f8e979', '#6ff0ce', '#ff927e'];
export const capacity = colors.length;
export const width = 720;
export const height = 500;
export const margin = 23;

export function cleanName(value) {
  return typeof value === 'string' ? Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()).slice(0, 18).join('') : '';
}

export function position(x, y) {
  return {
    x: Math.max(margin, Math.min(width - margin, x)),
    y: Math.max(margin, Math.min(height - margin, y)),
  };
}

function gather(connection) {
  if (connection.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const finish = () => {
      clearTimeout(timer);
      connection.removeEventListener('icegatheringstatechange', check);
      resolve();
    };
    const check = () => {
      if (connection.iceGatheringState === 'complete' || connection.signalingState === 'closed') finish();
    };
    const timer = setTimeout(finish, gatheringLimit);
    connection.addEventListener('icegatheringstatechange', check);
  });
}

function exchangeDescription({ type, sdp }) {
  // A peer may have to wait for its partner to return from chat before ICE can connect.
  return { type, sdp: sdp.replace(/^a=end-of-candidates(?:\r?\n|$)/gm, '') };
}

function localSignal(connection) {
  const description = exchangeDescription(connection.localDescription);
  if (!/^a=candidate:/m.test(description.sdp)) {
    throw new Error('The browser could not prepare a network route. Stay on this tab and try again.');
  }
  return description;
}

function send(channel, packet) {
  if (channel?.readyState === 'open' && channel.bufferedAmount < 8192) channel.send(packet);
}

function readPacket(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function validPosition(player) {
  return Number.isFinite(player?.x) && Number.isFinite(player?.y);
}

export class Room {
  constructor(local, onChange, onDrop) {
    this.local = local;
    this.onChange = onChange;
    this.onDrop = onDrop;
    this.players = new Map([[local.id, local]]);
    this.guests = new Map();
    this.positionSamples = new Map();
    this.closed = false;
  }

  recordPosition(player, time) {
    if (player.id === this.local.id) return;
    const samples = this.positionSamples.get(player.id) ?? [];
    samples.push({ x: player.x, y: player.y, time });
    if (samples.length > 12) samples.shift();
    this.positionSamples.set(player.id, samples);
  }

  displayPlayers(now) {
    const playbackTime = now - playbackDelay;
    return [...this.players.values()].map(player => {
      const samples = this.positionSamples.get(player.id);
      if (!samples?.length) return player;
      while (samples.length > 1 && samples[1].time <= playbackTime) samples.shift();
      const [from, to] = samples;
      if (!to || playbackTime <= from.time) return { ...player, x: from.x, y: from.y };
      const progress = (playbackTime - from.time) / (to.time - from.time);
      return { ...player, x: from.x + (to.x - from.x) * progress, y: from.y + (to.y - from.y) * progress };
    });
  }

  makePeer(id) {
    if (!globalThis.RTCPeerConnection) {
      throw new Error('Multiplayer needs a current browser on HTTPS or localhost.');
    }
    const connection = new RTCPeerConnection({ iceServers });
    const peer = { id, connection };
    connection.addEventListener('connectionstatechange', () => {
      if (connection.connectionState === 'failed') this.drop(peer, true);
    });
    return peer;
  }

  async offer() {
    if (this.guests.size >= capacity - 1) throw new Error('This room is full.');
    const id = globalThis.crypto?.randomUUID?.();
    if (!id) throw new Error('Hosting needs a current browser on HTTPS or localhost.');
    const peer = this.makePeer(id);
    this.guests.set(id, peer);
    try {
      this.bind(peer, peer.connection.createDataChannel('planet-ih'), true);
      await peer.connection.setLocalDescription(await peer.connection.createOffer());
      await gather(peer.connection);
      if (!this.guests.has(id)) throw new Error('Invite canceled.');
      const token = await encodeSignal(id, localSignal(peer.connection));
      return { id, token };
    } catch (error) {
      this.drop(peer);
      throw error;
    }
  }

  async accept(id, input) {
    const reply = await decodeSignal(input, 'answer');
    const peer = this.guests.get(id);
    if (!peer || reply.id !== id) throw new Error('That reply belongs to a different invite.');
    await peer.connection.setRemoteDescription(exchangeDescription(reply));
  }

  async answer(input) {
    const offer = await decodeSignal(input, 'offer');
    if (this.closed) throw new Error('Join canceled.');
    const peer = this.makePeer(offer.id);
    this.host = peer;
    const { connection } = peer;
    connection.addEventListener('datachannel', ({ channel }) => this.bind(peer, channel, false), { once: true });
    try {
      await connection.setRemoteDescription(exchangeDescription(offer));
      await connection.setLocalDescription(await connection.createAnswer());
      await gather(connection);
      if (this.host !== peer) throw new Error('Join canceled.');
      return await encodeSignal(peer.id, localSignal(connection), offer.version);
    } catch (error) {
      this.drop(peer);
      throw error;
    }
  }

  bind(peer, channel, hosting) {
    peer.channel = channel;
    if (!hosting) channel.addEventListener('open', () => send(channel, JSON.stringify({ type: 'hello', name: this.local.name })));
    channel.addEventListener('message', ({ data }) => {
      const packet = readPacket(data);
      if (hosting) this.receiveGuest(peer, packet);
      else this.receiveHost(peer, packet);
    });
    channel.addEventListener('close', () => this.drop(peer, true));
  }

  receiveGuest(peer, packet) {
    if (!this.guests.has(peer.id)) return;
    const player = this.players.get(peer.id);
    if (packet?.type === 'hello' && !player) {
      const roster = [...this.players.values()];
      const base = cleanName(packet.name) || 'Traveler';
      const names = new Set(roster.map(entry => entry.name.toLowerCase()));
      let name = base;
      for (let number = 2; names.has(name.toLowerCase()); number++) {
        name = `${Array.from(base).slice(0, 15).join('')} ${number}`;
      }
      const color = colors.find(candidate => roster.every(entry => entry.color !== candidate));
      const guest = { id: peer.id, name, color, x: width / 2 + 34 * roster.length, y: height / 2 + 45 };
      this.players.set(peer.id, guest);
      this.recordPosition(guest, performance.now());
      this.onChange(true);
      this.tick();
    }
    if (packet?.type === 'move' && player && validPosition(packet)) {
      Object.assign(player, position(packet.x, packet.y));
      this.recordPosition(player, performance.now());
    }
  }

  receiveHost(peer, packet) {
    if (this.host !== peer || packet?.type !== 'state' || !Array.isArray(packet.players) || packet.players.length > capacity) return;
    const roster = new Map();
    for (const player of packet.players) {
      if (!validPosition(player) || typeof player.id !== 'string' || !colors.includes(player.color) || !cleanName(player.name)) return;
      roster.set(player.id, { id: player.id, name: cleanName(player.name), color: player.color, ...position(player.x, player.y) });
    }
    const assigned = roster.get(peer.id);
    if (!assigned) return;
    const first = this.local.id !== peer.id;
    if (first) {
      Object.assign(this.local, assigned);
    }
    const rosterChanged = roster.size !== this.players.size || [...roster.values()].some(player => this.players.get(player.id)?.name !== player.name);
    roster.set(peer.id, this.local);
    this.players = roster;
    const now = performance.now();
    for (const id of this.positionSamples.keys()) {
      if (!roster.has(id)) this.positionSamples.delete(id);
    }
    for (const player of roster.values()) this.recordPosition(player, now);
    if (first || rosterChanged) this.onChange(first);
  }

  tick() {
    if (this.host && this.local.id === this.host.id) {
      const { x, y } = this.local;
      send(this.host.channel, JSON.stringify({ type: 'move', x, y }));
    }
    if (this.guests.size) {
      const state = JSON.stringify({ type: 'state', players: [...this.players.values()] });
      for (const peer of this.guests.values()) {
        if (this.players.has(peer.id)) send(peer.channel, state);
      }
    }
  }

  drop(peer, notify = false) {
    const wasHost = this.host === peer;
    if (wasHost) this.host = null;
    else if (!this.guests.delete(peer.id)) return;
    const wasPlaying = wasHost ? this.local.id === peer.id : this.players.delete(peer.id);
    this.positionSamples.delete(peer.id);
    peer.connection.close();
    if (notify) this.onDrop(wasHost, peer.id, wasPlaying);
  }

  close() {
    this.closed = true;
    if (this.host) this.drop(this.host);
    for (const peer of this.guests.values()) this.drop(peer);
  }
}
