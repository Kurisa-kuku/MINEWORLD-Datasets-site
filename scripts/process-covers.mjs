#!/usr/bin/env node
/**
 * Convert a local cover image to the catalog's 1280x720 WebP and 640x360
 * thumbnail, and point an existing dataset JSON at the new files.
 *
 * Usage:
 *   node scripts/process-covers.mjs <dataset-slug> <path-to-image>
 *
 * The GitHub submission workflow performs the same conversion automatically
 * for images dragged into the Issue Form.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

const [slug, source] = process.argv.slice(2);
if (!slug || !source) {
  console.log('Usage: node scripts/process-covers.mjs <dataset-slug> <path-to-image>');
  console.log('Example: node scripts/process-covers.mjs skyblock-demo ./cover.png');
  process.exit(1);
}
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
  console.error('Invalid dataset slug.');
  process.exit(1);
}

const root = process.cwd();
const covers = path.join(root, 'public', 'covers');
const buffer = await readFile(path.resolve(source));
if (buffer.byteLength > 2 * 1024 * 1024) {
  console.error(`Cover is ${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB.`);
  process.exit(1);
}
const metadata = await sharp(buffer).metadata();
if (!metadata.width || !metadata.height) {
  console.error('Could not read image dimensions.');
  process.exit(1);
}
const ratio = metadata.width / metadata.height;
if (Math.abs(ratio - 16 / 9) > 0.05) {
  console.warn(`Warning: image is ${metadata.width}x${metadata.height} (${ratio.toFixed(2)}:1); it will be cropped to 16:9.`);
}

const coverRel = `/covers/${slug}.webp`;
const thumbRel = `/covers/${slug}-thumb.webp`;
await sharp(buffer)
  .rotate()
  .resize(1280, 720, { fit: 'cover', position: 'attention' })
  .webp({ quality: 84, effort: 4 })
  .toFile(path.join(covers, `${slug}.webp`));
await sharp(buffer)
  .rotate()
  .resize(640, 360, { fit: 'cover', position: 'attention' })
  .webp({ quality: 82, effort: 4 })
  .toFile(path.join(covers, `${slug}-thumb.webp`));
console.log(`Wrote public${coverRel} and public${thumbRel}`);

const datasetFile = path.join(root, 'data', 'datasets', `${slug}.json`);
try {
  const data = JSON.parse(await readFile(datasetFile, 'utf8'));
  data.cover = coverRel;
  data.coverThumb = thumbRel;
  await writeFile(datasetFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  console.log(`Updated ${path.relative(root, datasetFile)}`);
} catch (error) {
  if (error.code === 'ENOENT') {
    console.log('No matching dataset JSON yet; files are ready for a new listing.');
  } else {
    throw error;
  }
}
void otherCovers;
