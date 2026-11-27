export const emptyAvatarLayout = { version: 1, parts: {} };

export const placementLimits = {
  x: [-150, 150], y: [-150, 150], scaleX: [10, 400], scaleY: [10, 400],
  rotation: [-180, 180], order: [-1000, 1000], opacity: [0, 100], clip: [0, 99],
  clipLeft: [0, 99], clipRight: [0, 99], clipBottom: [0, 99],
};

export function validateAvatarLayout(input) {
  if (input?.version !== 1 || !input.parts || typeof input.parts !== 'object' || Array.isArray(input.parts)) {
    throw new Error('Choose a version 1 avatar-layout.json file.');
  }
  const parts = {};
  for (const [key, rule] of Object.entries(input.parts)) {
    if (!/^(south|north|east|west)\/[a-z0-9-]+(?:\/[a-z0-9:-]+(?:\/(Small|Medium|Large))?)?$/.test(key) ||
        !rule || typeof rule !== 'object' || Array.isArray(rule)) throw new Error('The layout contains an invalid part key.');
    const valid = {};
    for (const [field, value] of Object.entries(rule)) {
      if ((field === 'hidden' || field === 'flip') && typeof value === 'boolean') valid[field] = value;
      else if (Object.hasOwn(placementLimits, field) && Number.isFinite(value)) {
        const [minimum, maximum] = placementLimits[field];
        if (value < minimum || value > maximum) throw new Error(`The ${field} value is outside its supported range.`);
        valid[field] = value;
      } else throw new Error('The layout contains an unsupported adjustment.');
    }
    if (Object.keys(valid).length) parts[key] = valid;
  }
  return { version: 1, parts };
}

export async function loadAvatarLayout() {
  const response = await fetch(new URL('./avatar-layout.json', import.meta.url), { cache: 'no-cache' });
  if (!response.ok) throw new Error('Could not load the published avatar layout.');
  return validateAvatarLayout(await response.json());
}

export function placementKeys(part, avatar, direction) {
  const partKey = `${direction}/${part.id}`;
  const artKey = `${partKey}/${part.variant}`;
  return { angle: partKey, art: artKey, body: `${artKey}/${avatar.body}` };
}

export function adjustedPlacement(part, avatar, direction, layout) {
  const keys = placementKeys(part, avatar, direction);
  const values = { x: 0, y: 0, scaleX: 100, scaleY: 100, rotation: 0, order: part.order,
    opacity: 100, clip: (part.visibleFrom ?? 0) * 100, clipLeft: 0, clipRight: 0, clipBottom: 0,
    hidden: part.hidden ?? false, flip: part.flip ?? false,
    ...layout.parts[keys.angle], ...layout.parts[keys.art], ...layout.parts[keys.body] };
  const mirror = direction === 'west' ? -1 : 1;
  return {
    ...part, values, x: part.x + values.x * mirror, y: part.y + values.y,
    width: part.width * values.scaleX / 100, height: part.height * values.scaleY / 100,
    angle: (part.angle ?? 0) + values.rotation * Math.PI / 180 * mirror,
    order: values.order, opacity: values.opacity / 100, visibleFrom: values.clip / 100, hidden: values.hidden, flip: values.flip,
    cropLeft: (mirror < 0 ? values.clipRight : values.clipLeft) / 100,
    cropRight: (mirror < 0 ? values.clipLeft : values.clipRight) / 100,
    cropBottom: values.clipBottom / 100,
  };
}

export function visiblePartRect(part) {
  return {
    left: part.width * ((part.cropLeft ?? 0) - 0.5), top: part.height * (part.visibleFrom ?? 0),
    width: Math.max(0, part.width * (1 - (part.cropLeft ?? 0) - (part.cropRight ?? 0))),
    height: Math.max(0, part.height * (1 - (part.visibleFrom ?? 0) - (part.cropBottom ?? 0))),
  };
}
