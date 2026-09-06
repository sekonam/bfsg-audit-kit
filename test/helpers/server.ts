import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import type { AddressInfo } from 'node:net';

/**
 * Minimal static file server for fixtures.
 *
 * Exists so that no test ever makes a network call to a third party. Every
 * scan in this repository runs against files in `test/fixtures`.
 */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

export interface FixtureServer {
  readonly origin: string;
  readonly requests: string[];
  close(): Promise<void>;
}

export async function startFixtureServer(rootDir: string): Promise<FixtureServer> {
  const root = resolve(rootDir);
  const requests: string[] = [];

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push(url.pathname);

    // Path traversal guard: fixtures only.
    const candidate = resolve(join(root, normalize(url.pathname)));
    if (!candidate.startsWith(root)) {
      res.writeHead(403).end('forbidden');
      return;
    }

    let filePath = candidate;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, 'index.html');
    } catch {
      /* fall through to the read attempt below */
    }

    try {
      const body = await readFile(filePath);
      res.writeHead(200, {
        'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream',
        'Content-Length': body.byteLength,
      });
      res.end(body);
    } catch {
      res
        .writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        .end(
          '<!doctype html><html lang="de"><head><title>404</title></head><body><h1>Nicht gefunden</h1></body></html>',
        );
    }
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address() as AddressInfo;

  return {
    origin: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) =>
        server.close((error) => (error ? rejectClose(error) : resolveClose())),
      ),
  };
}
