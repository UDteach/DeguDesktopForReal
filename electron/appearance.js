const SIZE_COUNT = 4;

function validSizeIndex(value) {
  return Number.isInteger(value) && value >= 0 && value < SIZE_COUNT;
}

function sizeIndexFor(settings, color) {
  const override = settings.sizeByColor?.[color];
  if (validSizeIndex(override)) return override;
  return validSizeIndex(settings.size) ? settings.size : 1;
}

function validDisplayTarget(value) {
  return value === 'cursor' || value === 'primary' || value === 'all' ||
    (typeof value === 'string' && /^display:-?\d+$/.test(value));
}

function displaysForTarget(target, displays, primaryId, cursorId) {
  if (!displays.length) return [];
  if (target === 'all') return displays;
  const find = (id) => displays.find((display) => String(display.id) === String(id));
  const primary = find(primaryId) || displays[0];
  if (target === 'cursor') return [find(cursorId) || primary];
  if (typeof target === 'string' && target.startsWith('display:')) {
    return [find(target.slice('display:'.length)) || primary];
  }
  return [primary];
}

module.exports = { validSizeIndex, sizeIndexFor, validDisplayTarget, displaysForTarget };
