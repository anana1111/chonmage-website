import fs from 'node:fs';
import { validateSchedule, validateNews } from './schedule-core.mjs';

export { isDate, isTime, isSafeUrl, isPlaceholderText, validateSchedule, validateNews } from './schedule-core.mjs';

export function readJson(path) {
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

if (process.argv[1] && process.argv[1].endsWith('validate-events.mjs') && process.argv.length > 2) {
  process.argv.slice(2).forEach((path) => {
    const data = readJson(path);
    if (/news\.json$/.test(path)) validateNews(data);
    else validateSchedule(data);
    console.log('validated ' + path);
  });
}
