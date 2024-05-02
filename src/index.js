const fs = require("fs");
const path = require("path");
const http = require("http");

const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".css": "text/css",
  ".js": "text/javascript",
  ".html": "text/html",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".zip": "application/zip",
  ".tar": "application/x-tar",
  ".gz": "application/gzip",
  ".bz2": "application/x-bzip2",
  ".xz": "application/x-xz",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "video/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".yml": "text/yaml"
}

const basedir = process.env.BASEDIR || '/serve'
const portNumber = parseInt(process.env.PORT || '3000');

const respond = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.end(body)
}

const httpServer = http.createServer((req, res) => {
  // get path from url
  console.log(req.url)
  const renderPage = req.url.endsWith('?view=1')
  const url = new URL(req.url, `http://localhost:${portNumber}`);
  const relpath = decodeURIComponent(url.pathname.replace(/\?.*$/, '')).replace(/\/+/g, '/');
  const filepath = path.join(basedir, relpath);
  const ext = path.extname(filepath).toLowerCase();
  const mimeType = mimeTypes[ext] ? mimeTypes[ext] : 'text/html'

  // required for rich media
  res.setHeader("Content-Type", 'text/html')

  if (fs.existsSync(filepath)) {
    // try to handle rich media first
    if (renderPage && mimeType.startsWith('audio')) {
      respond(res, 200, `<html><head><title>${relpath}</title></head><body>
        <h1>${relpath}</h1>
        <audio width="100%" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></audio>
      </body></html>`)
    } else if (renderPage && mimeType.startsWith('video')) {
      respond(res, 200, `<html><head><title>${relpath}</title></head><body>
        <h1>${relpath}</h1>
        <video width="100%" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></video>
      </body></html>`)
    } else if (renderPage && mimeType.startsWith('image')) {
      respond(res, 200, `<html><head><title>${relpath}</title></head><body>
        <h1>${relpath}</h1>
        <img width="100%" src="/${encodeURIComponent(relpath)}?view=0" />
      </body></html>`)
    } else if (fs.statSync(filepath).isDirectory()) {
      // list files
      res.write(`<h1>Index of <a href="${encodeURIComponent(path.join(relpath, '..'))}">${relpath}</a></h1><hr>`)
      fs.readdirSync(filepath).forEach(file => {
        const resolvedFile = path.resolve(filepath, file);
        if (fs.existsSync(resolvedFile)) {
          const isDirectory = fs.statSync(resolvedFile).isDirectory()
          if (isDirectory) {
            res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}">+ ${file}</a><br>`)
          } else {
            res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=1">- ${file}</a><br>`)
          }
        } else {
          res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=1">? ${file}</a><br>`)
        }
      })
      res.end()
    } else {
      // pipe file to response
      const ext = path.extname(filepath).toLowerCase();
      // if image extension, set content type
      if (mimeTypes[ext]) res.setHeader("Content-Type", mimeTypes[ext])
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