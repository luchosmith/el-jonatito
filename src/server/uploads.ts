import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { HttpError } from './http.ts';

const IMAGE_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/jpeg': { ext: '.jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: '.png', magic: (b) => b.subarray(0, 4).toString('hex') === '89504e47' },
  'image/webp': { ext: '.webp', magic: (b) => b.subarray(8, 12).toString('ascii') === 'WEBP' },
};

const AUDIO_EXT: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
};

export const IMAGE_MIME = Object.keys(IMAGE_TYPES);
export const AUDIO_MIME = Object.keys(AUDIO_EXT);

const baseType = (ct: string | undefined) => (ct ?? '').split(';')[0].trim().toLowerCase();

/** Saves a photo after checking its bytes really are an image. Returns the stored file name. */
export function saveImage(uploadsDir: string, buf: Buffer, contentType: string | undefined): string {
  const t = IMAGE_TYPES[baseType(contentType)];
  if (!t || !t.magic(buf)) throw new HttpError(415, 'Upload a JPG, PNG or WebP photo');
  const file = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${t.ext}`;
  const dir = path.join(uploadsDir, 'images');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}

export function saveAudio(uploadsDir: string, buf: Buffer, contentType: string | undefined): string {
  const ext = AUDIO_EXT[baseType(contentType)];
  if (!ext) throw new HttpError(415, 'Unsupported audio format');
  const file = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
  const dir = path.join(uploadsDir, 'audio');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}
