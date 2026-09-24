import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export interface Config {
  port: number;
  dataDir: string;
  dbFile: string;
  uploadsDir: string;
  seedDir: string;
  webDist: string;
  tokenSecret: string;
  testMode: boolean;
  /** Location for weather + season. */
  lat: number;
  lon: number;
  hemisphere: 'north' | 'south';
  placeName: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dataDir = path.resolve(ROOT, env.DATA_DIR ?? 'data');
  const testMode = env.TEST_MODE === '1';
  const tokenSecret = env.TOKEN_SECRET ?? (testMode ? 'test-secret' : '');
  if (!tokenSecret) {
    throw new Error('TOKEN_SECRET must be set (a long random string). See README.');
  }
  return {
    port: Number(env.PORT ?? 8080),
    dataDir,
    dbFile: path.join(dataDir, env.DB_FILE ?? 'jonatito.sqlite'),
    uploadsDir: path.join(dataDir, 'uploads'),
    seedDir: path.join(ROOT, 'seed'),
    webDist: path.join(ROOT, 'web', 'dist'),
    tokenSecret,
    testMode,
    lat: Number(env.LAT ?? 40.71),
    lon: Number(env.LON ?? -74.01),
    hemisphere: env.HEMISPHERE === 'south' ? 'south' : 'north',
    placeName: env.PLACE_NAME ?? 'Home',
  };
}
