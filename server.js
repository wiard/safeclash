const express = require('express');
const path = require('path');

const app = express();
const PORT = 19003;
const API_TOKEN = 'v1.eyJzY29wZSI6ImNvbmR1Y3RvciIsInNlc3Npb25JZCI6InNhZmVjbGFzaC1waXBlbGluZSIsImlzc3VlZEF0SXNvIjoiMjAyNi0wMy0yM1QxNTowMzoyMS4wODZaIiwiZXhwaXJlc0F0SXNvIjoiMjAyNy0wMy0yM1QxNTowMzoyMS4wODZaIn0.UX2BxNzQvGY4l4lXEMaC0cW5DCs1DWlQ0E9ODHvido0';

async function proxyApi(req, res, apiPath) {
  const upstream = `http://127.0.0.1:19001/api/${apiPath}${apiPath.includes('?') ? '&' : '?'}token=${API_TOKEN}`;
  try {
    const r = await fetch(upstream);
    const data = await r.text();
    res.set('Content-Type', r.headers.get('content-type') || 'application/json');
    res.set('Cache-Control', 'public, max-age=30');
    res.status(r.status).send(data);
  } catch (err) {
    res.status(502).json({ error: 'upstream unreachable', detail: err.message });
  }
}

// API proxy — adds token server-side so visitors don't need it
app.use('/api/proxy', async (req, res) => {
  const apiPath = req.url.replace(/^\//, '');
  return proxyApi(req, res, apiPath);
});

app.get('/api/grid/signals/detail', async (req, res) => {
  return proxyApi(req, res, 'grid/signals/detail');
});

app.get('/api/proxy/chip/runs/recent', async (req, res) => proxyApi(req, res, 'chip/runs/recent'));
app.get('/api/proxy/chip/outcomes/recent', async (req, res) => proxyApi(req, res, 'chip/outcomes/recent'));
app.get('/api/proxy/chip/hypotheses/recent', async (req, res) => proxyApi(req, res, 'chip/hypotheses/recent'));
app.get('/api/proxy/chip/summary', async (req, res) => proxyApi(req, res, 'chip/summary'));

app.use(express.static(path.join(__dirname, 'public')));

// SPA-style fallback for /demo -> demo.html
app.get('/demo', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'demo.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SafeClash running on port ${PORT}`);
});
