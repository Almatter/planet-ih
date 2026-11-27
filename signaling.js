const plainPrefix = 'planet-ih-1.';
const deflatePrefix = 'planet-ih-2.';
const packedPrefixes = { offer: ['I.', 'i.'], answer: ['R.', 'r.'] };
const maxSignalSize = 50000;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
const uuidPattern = '[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}';
const uuidCheck = new RegExp(`^${uuidPattern}$`, 'i');
const fingerprintPattern = '(?:[0-9A-F]{2}:){31}[0-9A-F]{2}';

// The order is part of the wire format. Unknown SDP text passes through intact.
const phrases = [
  ' UDP/DTLS/SCTP webrtc-datachannel', ' TCP/DTLS/SCTP webrtc-datachannel',
  'a=extmap-allow-mixed', 'a=msid-semantic: WMS', 'a=ice-options:trickle',
  'a=fingerprint:sha-256 ', 'a=candidate:', 'a=ice-ufrag:', 'a=ice-pwd:',
  'a=max-message-size:', 'a=sctp-port:', 'a=group:BUNDLE ', 'a=setup:actpass',
  'a=setup:active', 'a=setup:passive', 'a=mid:', 'm=application ',
  ' generation 0', ' network-cost ', ' network-id ', ' typ srflx', ' typ host',
  ' typ relay', ' raddr ', ' rport ', ' tcptype ', ' 1 udp ', ' 1 UDP ',
  ' IN IP4 ', ' IN IP6 ', '.local', 'a=sendrecv', 'a=ice-options:',
];
const phraseTokens = new Map(phrases.map((phrase, index) => [phrase, index + 5]));
const escapedPhrases = phrases.map(phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
const ipv4Pattern = '(?:0|[1-9]\\d{0,2})(?:\\.(?:0|[1-9]\\d{0,2})){3}(?![\\d.])';
const parts = new RegExp(`(${escapedPhrases.join('|')})|(${uuidPattern})|(${fingerprintPattern})|(${ipv4Pattern})|(\\d{8,254})|\\x00`, 'g');

function hexBytes(text) {
  const digits = text.replace(/[-:]/g, '');
  return Array.from(digits.match(/../g), pair => Number.parseInt(pair, 16));
}

function hexText(bytes) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0'));
}

function formatUuid(bytes) {
  const text = hexText(bytes).join('');
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}

function pack(id, sdp) {
  const bytes = hexBytes(id);
  let written = 0;
  for (const match of sdp.matchAll(parts)) {
    const [value, phrase, uuid, fingerprint, address, digits] = match;
    const start = match.index;
    bytes.push(...encoder.encode(sdp.slice(written, start)));
    written = start + value.length;
    const octets = address?.split('.').map(Number);
    if (phrase) bytes.push(0, phraseTokens.get(phrase));
    else if (uuid) bytes.push(0, 1, ...hexBytes(uuid));
    else if (fingerprint) bytes.push(0, 2, ...hexBytes(fingerprint));
    else if (octets?.every(octet => octet < 256)) bytes.push(0, 3, ...octets);
    else if (digits) {
      bytes.push(0, 4, digits.length);
      for (let index = 0; index < digits.length; index += 2) {
        bytes.push(Number.parseInt(digits.slice(index, index + 2).padEnd(2, '0'), 16));
      }
    } else if (value === '\0') bytes.push(0, 0);
    else bytes.push(...encoder.encode(value));
  }
  bytes.push(...encoder.encode(sdp.slice(written)));
  return Uint8Array.from(bytes);
}

function unpack(bytes, type) {
  if (bytes.length < 16) throw new Error('Missing invite ID');
  const id = formatUuid(bytes.subarray(0, 16));
  let position = 16;
  let size = 0;
  const lines = [];
  const take = length => {
    if (position + length > bytes.length) throw new Error('Truncated signal');
    position += length;
    return bytes.subarray(position - length, position);
  };
  while (position < bytes.length) {
    let text;
    if (bytes[position] !== 0) {
      const end = bytes.indexOf(0, position);
      text = decoder.decode(take((end < 0 ? bytes.length : end) - position));
    } else {
      const [, token] = take(2);
      if (token === 0) text = '\0';
      else if (token === 1) text = formatUuid(take(16));
      else if (token === 2) text = hexText(take(32)).join(':').toUpperCase();
      else if (token === 3) text = take(4).join('.');
      else if (token === 4) {
        const [length] = take(1);
        text = hexText(take(Math.ceil(length / 2))).join('').slice(0, length);
        if (!/^\d+$/.test(text)) throw new Error('Invalid numeric field');
      } else text = phrases[token - 5];
    }
    if (text === undefined || (size += text.length) > maxSignalSize) throw new Error('Invalid signal');
    lines.push(text);
  }
  return { id, type, sdp: lines.join('') };
}

async function compress(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes, format) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)).getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) return new Uint8Array(await new Blob(chunks).arrayBuffer());
    size += value.length;
    if (size > maxSignalSize) {
      await reader.cancel();
      throw new Error('Signal too large');
    }
    chunks.push(value);
  }
}

function toToken(prefix, bytes) {
  return prefix + btoa(Array.from(bytes, byte => String.fromCharCode(byte)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function encodeSignal(id, { type, sdp }, version = 3) {
  if (version === 3) {
    const [plain, deflated] = packedPrefixes[type];
    const packed = pack(id, sdp);
    if (globalThis.CompressionStream && globalThis.DecompressionStream) {
      try {
        const compressed = await compress(packed, 'deflate-raw');
        if (compressed.length < packed.length) return toToken(deflated, compressed);
      } catch {
        // Keep the packed format on browsers without raw DEFLATE support.
      }
    }
    return toToken(plain, packed);
  }

  const bytes = encoder.encode(JSON.stringify({ id, type, sdp }));
  if (version === 2 && globalThis.CompressionStream) {
    const compressed = await compress(bytes, 'deflate');
    if (compressed.length < bytes.length) return toToken(deflatePrefix, compressed);
  }
  return toToken(plainPrefix, bytes);
}

export async function decodeSignal(input, type) {
  // Discord may copy the visible text, the raw Markdown, or the URL itself.
  const text = input.trim().replace(/^\[[^\]]+\]\(/, '').replace(/\)$/, '')
    .replace(/^[`|<\s]+|[`|>\s]+$/g, '');
  const token = text.slice(text.lastIndexOf('#') + 1).replace(/^invite=/, '');
  const [packed, packedDeflate] = packedPrefixes[type];
  const prefix = [packed, packedDeflate, deflatePrefix, plainPrefix].find(value => token.startsWith(value));
  if ((prefix === packedDeflate || prefix === deflatePrefix) && !globalThis.DecompressionStream) {
    throw new Error('Open this invite or reply in a current browser.');
  }
  try {
    if (!prefix || token.length > maxSignalSize) throw new Error('Invalid signal');
    const base64 = token.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
    const version = prefix === packed || prefix === packedDeflate ? 3 : prefix === deflatePrefix ? 2 : 1;
    let data;
    if (version === 3) data = unpack(prefix === packedDeflate ? await decompress(bytes, 'deflate-raw') : bytes, type);
    else data = JSON.parse(decoder.decode(version === 2 ? await decompress(bytes, 'deflate') : bytes));
    if (data.type !== type || !uuidCheck.test(data.id) || typeof data.sdp !== 'string' || !data.sdp.startsWith('v=0')) throw new Error('Invalid signal');
    return { ...data, version };
  } catch {
    throw new Error(type === 'offer' ? 'Paste the full invite link from the host.' : 'Paste the full reply code from your guest.');
  }
}
