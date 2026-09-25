/** Development-friendly logger. Warnings and errors are always reported; debug output is dev-only. */
const isDev = import.meta.env.DEV;

export const logger = {
  debug(scope: string, ...args: unknown[]): void {
    if (isDev) console.debug(`[${scope}]`, ...args);
  },
  info(scope: string, ...args: unknown[]): void {
    if (isDev) console.info(`[${scope}]`, ...args);
  },
  warn(scope: string, ...args: unknown[]): void {
    console.warn(`[${scope}]`, ...args);
  },
  error(scope: string, ...args: unknown[]): void {
    console.error(`[${scope}]`, ...args);
  },
};
