import { DurableObject } from 'cloudflare:workers';
import { RuntimeSecretsEnv } from './integrations';
import { PakTelApiEngine, SqlExecutor } from './router';

export interface Env extends RuntimeSecretsEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  PAKTEL_STORE: DurableObjectNamespace;
}

export class PakTelStoreDO extends DurableObject<Env> {
  private readonly engine: PakTelApiEngine;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const executor: SqlExecutor = {
      exec: (query: string, ...bindings: any[]) => {
        const cursor = this.ctx.storage.sql.exec(query, ...bindings);
        return {
          toArray: () => cursor.toArray() as Record<string, any>[],
          one: () => {
            const arr = cursor.toArray() as Record<string, any>[];
            return arr.length ? arr[0] : null;
          },
        };
      },
    };
    this.engine = new PakTelApiEngine(executor);
  }

  async fetch(request: Request): Promise<Response> {
    return this.engine.handle(request, this.env);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const id = env.PAKTEL_STORE.idFromName('global-paktel-store-v1');
      const stub = env.PAKTEL_STORE.get(id);
      return stub.fetch(request);
    }
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response('Pak-Tel Worker active.', { status: 404 });
  },
};
