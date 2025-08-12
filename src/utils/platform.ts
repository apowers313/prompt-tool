import os from 'os';
import path from 'path';

export function getHomePath(): string {
  return os.homedir();
}

export function getConfigPaths(): string[] {
  const platform = getPlatform();
  const paths = [process.cwd()];

  switch (platform) {
    case 'win32':
      if (process.env.APPDATA) {
        paths.push(path.join(process.env.APPDATA, 'prompt-tool'));
      }
      break;
    case 'darwin':
      paths.push(
        path.join(getHomePath(), 'Library', 'Application Support', 'prompt-tool'),
        path.join(getHomePath(), '.config', 'prompt-tool')
      );
      break;
    case 'linux':
    default:
      const configHome = process.env.XDG_CONFIG_HOME || path.join(getHomePath(), '.config');
      paths.push(path.join(configHome, 'prompt-tool'));
      break;
  }

  return paths;
}

export function getPlatform(): NodeJS.Platform {
  return process.platform;
}

export function isWindows(): boolean {
  return getPlatform() === 'win32';
}

export function isMacOS(): boolean {
  return getPlatform() === 'darwin';
}

export function isLinux(): boolean {
  return getPlatform() === 'linux';
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\n');
}

export function getUsername(): string {
  return os.userInfo().username;
}
