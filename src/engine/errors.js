// Typed errors the loading screen can explain: which file failed, or why WebGL could not start.

function errorDetail(cause) {
  if (!cause) return '';
  if (typeof cause === 'string') return cause;
  if (cause instanceof Error) return cause.message || cause.name || '';
  if (typeof cause.status === 'number') return 'HTTP ' + cause.status;
  if (typeof cause.type === 'string' && cause.type === 'error') return 'network error';
  if (typeof cause.message === 'string') return cause.message;
  return '';
}

/** An asset (or its JSON body) could not be loaded. `file` is relative to public/marswalk/. */
export class AssetLoadError extends Error {
  constructor(file, cause) {
    const detail = errorDetail(cause);
    super(detail ? 'Could not load ' + file + ' (' + detail + ')' : 'Could not load ' + file, cause === undefined ? undefined : { cause });
    this.name = 'AssetLoadError';
    this.code = 'ASSET_LOAD_FAILED';
    this.file = file;
    this.detail = detail || null;
  }
}

/** WebGL 2 is missing, or the browser refused to create the renderer synchronously. */
export class WebGLUnsupportedError extends Error {
  constructor(message = 'WebGL 2 is not available in this browser.', { cause, detail } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'WebGLUnsupportedError';
    this.code = 'WEBGL2_UNSUPPORTED';
    this.detail = detail || 'The 3D scene needs WebGL 2. Enable hardware acceleration or try a current browser.';
  }
}
