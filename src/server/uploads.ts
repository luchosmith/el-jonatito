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

const MEDIA_TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'video/mp4': { ext: '.mp4', magic: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
  'video/webm': { ext: '.webm', magic: (b) => b.subarray(0, 4).toString('hex') === '1a45dfa3' },
  'audio/mpeg': { ext: '.mp3', magic: (b) => b.subarray(0, 3).toString('ascii') === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) },
  'audio/mp4': { ext: '.m4a', magic: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' },
};

export const IMAGE_MIME = Object.keys(IMAGE_TYPES);
export const MEDIA_MIME = Object.keys(MEDIA_TYPES);
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

/** A video or song for the media corner / a full-screen item (checked by its first bytes). */
export function saveMedia(uploadsDir: string, buf: Buffer, contentType: string | undefined): string {
  const t = MEDIA_TYPES[baseType(contentType)];
  if (!t || !t.magic(buf)) throw new HttpError(415, 'Upload an MP4 or WebM video, or an MP3 / M4A song');
  const file = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${t.ext}`;
  const dir = path.join(uploadsDir, 'media');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, file), buf);
  return file;
}
