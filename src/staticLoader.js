import { promises as fs } from 'fs';

export async function loadStatics(paths) {
  return Promise.all([
    fs.readFile(paths.index, 'utf-8').catch(() => null),
    fs.readFile(paths.configHtml, 'utf-8').catch(() => null),
    fs.readFile(paths.favicon).catch(() => null),
  ]);
}
