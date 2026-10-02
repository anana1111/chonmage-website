import fs from 'node:fs';
import { readJson } from './validate-events.mjs';
import { mergeSchedule } from './schedule-core.mjs';

export { mergeSchedule } from './schedule-core.mjs';

if (process.argv[1] && process.argv[1].endsWith('merge-events.mjs')) {
  const autoPath = process.argv[2] || 'data/events.auto.json';
  const manualPath = process.argv[3] || 'data/events.manual.json';
  const outputPath = process.argv[4] || 'data/events.json';
  const autoData = readJson(autoPath);
  const manualData = fs.existsSync(manualPath) ? readJson(manualPath) : {};
  const merged = mergeSchedule(autoData, manualData, { warn: (message) => console.warn('::warning::' + message) });
  const text = JSON.stringify(merged, null, 2) + '\n';
  const old = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  if (old !== text) {
    fs.writeFileSync(outputPath, text);
    console.log('updated ' + outputPath);
  } else {
    console.log(outputPath + ' unchanged');
  }
}
