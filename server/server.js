const http = require('http');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    try {
      const data = JSON.parse(body);
      const { user_id, name, email } = data;

      if (user_id === undefined || name === undefined || email === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required fields: user_id, name, email' }));
        return;
      }

      const filePath = path.join(dataDir, `${user_id}.json`);

      // Check if file already exists
      if (fs.existsSync(filePath)) {
        console.error(`File for user_id ${user_id} already exists.`);
        process.exit(1);
      }

      // 50% chance of being flaky
      const isFlaky = Math.random() < 0.5;

      if (isFlaky) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Flaky server - request failed' }));
        return;
      }

      // Save the file
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'User saved successfully' }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON' }));
    }
  });
});

const PORT = 7676;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
