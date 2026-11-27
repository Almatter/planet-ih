const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }];
const prefix = 'planet-ih-1.';
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

function encode(id, description) {
  const bytes = new TextEncoder().encode(JSON.stringify({ id, type: description.type, sdp: description.sdp }));
  return prefix + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decode(input, type) {
  const fragments = input.trim().split('#');
  const token = fragments.at(-1).replace(/^invite=/, '');
  try {
    if (token.length > 50000 || !token.startsWith(prefix)) throw new Error();
    const base64 = token.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (data.type !== type || !/^[a-f0-9-]{36}$/.test(data.id) || typeof data.sdp !== 'string' || !data.sdp.startsWith('v=0')) throw new Error();
    return data;
  } catch {
    throw new Error(type === 'offer' ? 'Paste the full invite link from the host.' : 'Paste the full reply code from your guest.');
  }
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
    const timer = setTimeout(finish, 12000);
    connection.addEventListener('icegatheringstatechange', check);
  });
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
  }

  makePeer(id) {
    if (!globalThis.RTCPeerConnection || !crypto.randomUUID) {
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
    const peer = this.makePeer(id);
    this.guests.set(id, peer);
    try {
      this.bind(peer, peer.connection.createDataChannel('planet-ih'), true);
      await peer.connection.setLocalDescription(await peer.connection.createOffer());
      await gather(peer.connection);
      if (!this.guests.has(id)) throw new Error('Invite canceled.');
      return { id, token: encode(id, peer.connection.localDescription) };
    } catch (error) {
      this.drop(peer);
      throw error;
    }
  }

  async accept(id, input) {
    const reply = decode(input, 'answer');
    const peer = this.guests.get(id);
    if (!peer || reply.id !== id) throw new Error('That reply belongs to a different invite.');
    await peer.connection.setRemoteDescription({ type: reply.type, sdp: reply.sdp });
    if (this.guests.has(id) && peer.channel.readyState !== 'open') {
      peer.timer = setTimeout(() => this.drop(peer, true), 30000);
    }
  }

  async answer(input) {
    const offer = decode(input, 'offer');
    const peer = this.makePeer(offer.id);
    this.host = peer;
    const { connection } = peer;
    connection.addEventListener('datachannel', ({ channel }) => this.bind(peer, channel, false), { once: true });
    try {
      await connection.setRemoteDescription({ type: offer.type, sdp: offer.sdp });
      await connection.setLocalDescription(await connection.createAnswer());
      await gather(connection);
      if (this.host !== peer) throw new Error('Join canceled.');
      return encode(peer.id, connection.localDescription);
    } catch (error) {
      this.drop(peer);
      throw error;
    }
  }

  bind(peer, channel, hosting) {
    peer.channel = channel;
    channel.addEventListener('open', () => {
      clearTimeout(peer.timer);
      if (hosting) {
        peer.timer = setTimeout(() => this.drop(peer, true), 10000);
        return;
      }
      send(channel, JSON.stringify({ type: 'hello', name: this.local.name }));
      peer.timer = setTimeout(() => this.drop(peer, true), 10000);
    });
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
      clearTimeout(peer.timer);
      const roster = [...this.players.values()];
      const base = cleanName(packet.name) || 'Traveler';
      const names = new Set(roster.map(entry => entry.name.toLowerCase()));
      let name = base;
      for (let number = 2; names.has(name.toLowerCase()); number++) {
        name = `${Array.from(base).slice(0, 15).join('')} ${number}`;
      }
      const color = colors.find(candidate => roster.every(entry => entry.color !== candidate));
      this.players.set(peer.id, { id: peer.id, name, color, x: width / 2 + 34 * roster.length, y: height / 2 + 45 });
      this.onChange(true);
      this.tick();
    }
    if (packet?.type === 'move' && player && validPosition(packet)) {
      Object.assign(player, position(packet.x, packet.y));
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
      clearTimeout(peer.timer);
      Object.assign(this.local, assigned);
    }
    const rosterChanged = roster.size !== this.players.size || [...roster.values()].some(player => this.players.get(player.id)?.name !== player.name);
    roster.set(peer.id, this.local);
    this.players = roster;
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
    clearTimeout(peer.timer);
    peer.connection.close();
    if (notify) this.onDrop(wasHost, peer.id, wasPlaying);
  }

  close() {
    if (this.host) this.drop(this.host);
    for (const peer of this.guests.values()) this.drop(peer);
  }
}
