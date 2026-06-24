// Minimal dependency-free static server for local preview/testing.
// Serves the orz-mdhtml project dir over HTTP. Absolute root, no process.cwd().
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8137;
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    let fp = path.join(ROOT, urlPath);
    if (!fp.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    fs.stat(fp, (err, st) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      if (st.isDirectory()) fp = path.join(fp, 'index.html');
      fs.readFile(fp, (err2, buf) => {
        if (err2) {
          res.writeHead(404);
          return res.end('not found');
        }
        res.writeHead(200, { 'content-type': TYPES[path.extname(fp)] || 'application/octet-stream' });
        res.end(buf);
      });
    });
  })
  .listen(PORT, () => console.log('serving ' + ROOT + ' on http://localhost:' + PORT));
