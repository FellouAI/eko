import { StreamCallback, TraceSystemOptions } from '../types/index.js';
import { TraceRecorder } from './recorder.js';

/**
 * TraceSystem - Simplified structured logging system
 * 
 * Intercepts eko-core events and pretty-prints them to console
 */
export class TraceSystem {
  private readonly recorder: TraceRecorder;

  constructor(private readonly options: TraceSystemOptions = {}) {
    this.recorder = new TraceRecorder({
      prettyPrint: this.options.prettyPrint !== false,
    });
  }

  enable<T extends object>(ekoInstance: T): T;
  enable<T extends { config?: { callback?: StreamCallback } }>(ekoInstance: T): T;
  enable<T extends object>(ekoInstance: T): T {
    const original = (ekoInstance as any).config?.callback;
    const wrapped: StreamCallback = this.recorder.interceptCallback(original);
    if (!(ekoInstance as any).config) (ekoInstance as any).config = {};
    // merge existing callback methods (including possible HumanCallback methods)
    (ekoInstance as any).config.callback = {
      ...(original as any),
      ...wrapped
    } as StreamCallback;
    return ekoInstance;
  }
}

