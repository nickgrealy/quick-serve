const fs = require("fs");
const path = require("path");
const http = require("http");

const basedir = process.env.BASEDIR || '/serve'
const portNumber = parseInt(process.env.PORT || '3000');

const respond = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.end(body)
}

const httpServer = http.createServer((req, res) => {
  // get path from url
  const renderPage = req.url.endsWith('#view')
  const url = new URL(req.url, `http://localhost:${portNumber}`);
  const relpath = decodeURIComponent(url.pathname.replace(/\?.*$/, '')).replace(/\/+/g, '/');
  const filepath = path.join(basedir, relpath);

  // path exists?
  if (fs.existsSync(filepath)) {
    if (fs.statSync(filepath).isDirectory()) {
      // list files
      res.write(`<h1>Index of <a href="${encodeURIComponent(path.join(relpath, '..'))}">${relpath}</a></h1><hr>`)
      fs.readdirSync(filepath).forEach(file => {
        const isDirectory = fs.statSync(path.join(filepath, file)).isDirectory()
        res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}">${isDirectory ? '+' : '-'} ${file}</a><br>`)
      })
      res.end()
    } else {
      // pipe file to response
      const stream = fs.createReadStream(filepath).on("error", (err) => respond(res, 500, "Error reading file: " + err))
      stream.pipe(res);
    }
  } else {
    respond(res, 404, "File not found: " + filepath)
  }
});

// start server
httpServer.listen(portNumber, () => console.log("Server is listening on port " + portNumber));

// exit on error
['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(signal => {
  process.on(signal, () => {
    console.log('Received SIGINT. Shutting down gracefully...');
    httpServer.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
});