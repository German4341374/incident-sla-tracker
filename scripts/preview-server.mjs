import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const port = Number(process.env.PREVIEW_PORT ?? 3200);
const publicRoot = join(import.meta.dirname, '..', 'public');
const assets = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
  ['/styles.css', 'styles.css'],
  ['/app.js', 'app.js'],
]);
const now = Date.now();
const sampleIncidents = [
  {
    id: 'preview-critical-checkout',
    title: 'Checkout API returns intermittent 502 errors',
    description: 'Customers receive gateway errors while completing card payments.',
    priority: 'CRITICAL',
    status: 'IN_PROGRESS',
    assignee: 'Maya Chen',
    createdAt: new Date(now - 4 * 3_600_000).toISOString(),
    slaDeadline: new Date(now - 2 * 3_600_000).toISOString(),
    resolvedAt: null,
    isOverdue: true,
    statusHistory: [],
  },
  {
    id: 'preview-notifications',
    title: 'Notification worker queue is delayed',
    description: 'Email notifications are delivered approximately twenty minutes late.',
    priority: 'HIGH',
    status: 'OPEN',
    assignee: 'Maya Chen',
    createdAt: new Date(now - 3 * 3_600_000).toISOString(),
    slaDeadline: new Date(now + 5 * 3_600_000).toISOString(),
    resolvedAt: null,
    isOverdue: false,
    statusHistory: [],
  },
  {
    id: 'preview-analytics',
    title: 'Analytics export produces incomplete CSV',
    description: 'Rows after the first ten thousand records are missing from generated exports.',
    priority: 'MEDIUM',
    status: 'OPEN',
    assignee: 'Priya Singh',
    createdAt: new Date(now - 28 * 3_600_000).toISOString(),
    slaDeadline: new Date(now - 4 * 3_600_000).toISOString(),
    resolvedAt: null,
    isOverdue: true,
    statusHistory: [],
  },
  {
    id: 'preview-search',
    title: 'Search results use stale customer names',
    description: 'Recently renamed customer accounts retain the previous name in search results.',
    priority: 'LOW',
    status: 'OPEN',
    assignee: 'Liam Walker',
    createdAt: new Date(now - 18 * 3_600_000).toISOString(),
    slaDeadline: new Date(now + 54 * 3_600_000).toISOString(),
    resolvedAt: null,
    isOverdue: false,
    statusHistory: [],
  },
  {
    id: 'preview-sso',
    title: 'SSO login loops for enterprise tenant',
    description: 'SAML callback redirects the affected tenant back to the login page.',
    priority: 'HIGH',
    status: 'IN_PROGRESS',
    assignee: 'Noah Williams',
    createdAt: new Date(now - 11 * 3_600_000).toISOString(),
    slaDeadline: new Date(now - 3 * 3_600_000).toISOString(),
    resolvedAt: null,
    isOverdue: true,
    statusHistory: [],
  },
];

const json = (response, body, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  if (url.pathname === '/api/dashboard') {
    return json(response, {
      total: 15,
      open: 9,
      overdue: 3,
      closed: 3,
      averageResolutionHours: 11.9,
    });
  }
  if (url.pathname === '/api/incidents') {
    return json(response, {
      items: sampleIncidents,
      pagination: { page: 1, limit: 20, total: 15, pages: 1 },
    });
  }
  const asset = assets.get(url.pathname);
  if (!asset) return json(response, { error: { code: 'NOT_FOUND', message: 'Not found' } }, 404);
  const content = await readFile(join(publicRoot, asset));
  const contentType =
    extname(asset) === '.css'
      ? 'text/css; charset=utf-8'
      : extname(asset) === '.js'
        ? 'text/javascript; charset=utf-8'
        : 'text/html; charset=utf-8';
  response.writeHead(200, { 'content-type': contentType });
  response.end(content);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`UI preview available at http://127.0.0.1:${port}`);
});
