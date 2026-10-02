import fs from 'node:fs';
import { readJson, validateSchedule, isTime } from './validate-events.mjs';

const clone = (value) => JSON.parse(JSON.stringify(value));

function compareTime(a, b) {
  const toMinutes = (value) => {
    if (!isTime(value)) return Number.POSITIVE_INFINITY;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  };
  return toMinutes(a.time) - toMinutes(b.time);
}

function mergeObject(base, override) {
  const result = clone(base || {});
  Object.entries(override || {}).forEach(([key, value]) => {
    if (value === null) delete result[key];
    else result[key] = clone(value);
  });
  return result;
}

export function mergeSchedule(autoData, manualData) {
  validateSchedule(autoData);
  if (!manualData || typeof manualData !== 'object') return clone(autoData);

  const manualDate = typeof manualData.date === 'string' ? manualData.date : autoData.date;
  if (manualDate < autoData.date) return clone(autoData);

  if (manualDate > autoData.date) {
    if (!manualData.replacement) return clone(autoData);
    const replacement = clone(manualData.replacement);
    replacement.source = mergeObject(replacement.source, {
      type: replacement.source?.type || 'manual',
      mode: 'manual',
      url: replacement.source?.url || replacement.latestXUrl,
    });
    validateSchedule(replacement);
    replacement.events.sort(compareTime);
    return replacement;
  }

  const result = clone(autoData);
  Object.entries(manualData.fields || {}).forEach(([key, value]) => {
    if (value === null) delete result[key];
    else result[key] = clone(value);
  });
  result.ringGame = mergeObject(result.ringGame, manualData.ringGame);

  const overrides = manualData.events || {};
  const outputEvents = [];
  result.events.forEach((event) => {
    const override = event.id ? overrides[event.id] : null;
    if (override?.hidden) return;
    const merged = override ? mergeObject(event, override) : event;
    delete merged.hidden;
    outputEvents.push(merged);
  });

  (manualData.extraEvents || []).forEach((event) => {
    if (!event.hidden) outputEvents.push(clone(event));
  });

  result.events = outputEvents.sort(compareTime);
  const hasManual = Object.keys(manualData.fields || {}).length ||
    Object.keys(manualData.ringGame || {}).length ||
    Object.keys(overrides).length ||
    (manualData.extraEvents || []).length;
  if (hasManual) result.source = mergeObject(result.source, { mode: 'merged' });

  validateSchedule(result);
  return result;
}

if (process.argv[1] && process.argv[1].endsWith('merge-events.mjs')) {
  const autoPath = process.argv[2] || 'data/events.auto.json';
  const manualPath = process.argv[3] || 'data/events.manual.json';
  const outputPath = process.argv[4] || 'data/events.json';
  const autoData = readJson(autoPath);
  const manualData = fs.existsSync(manualPath) ? readJson(manualPath) : {};
  const merged = mergeSchedule(autoData, manualData);
  const text = JSON.stringify(merged, null, 2) + '\n';
  const old = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (old !== text) {
    fs.writeFileSync(outputPath, text);
    console.log('updated ' + outputPath);
  } else {
    console.log(outputPath + ' unchanged');
  }
}
