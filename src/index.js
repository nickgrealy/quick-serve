const fs = require("fs");
const path = require("path");
const http = require("http");
const sharp = require("sharp");
const { pipeline } = require("stream")
const { getSize } = require("./range");

const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
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
  ".yml": "text/yaml",
  ".mkv": "video/webm",
  ".mov": "video/quicktime",
}

const basedir = process.env.BASEDIR || '/serve'
const portNumber = parseInt(process.env.PORT || '3000');

const respond = (res, statusCode, body) => {
  res.statusCode = statusCode;
  res.write(body)
  res.end()
}

const getMimeType = (filepath) => {
  const ext = path.extname(filepath).toLowerCase();
  return mimeTypes[ext] ? mimeTypes[ext] : 'text/html'
}
const isMediaType = (mimetype) => {
  const isImage = mimetype.startsWith('image');
  const isAudio = mimetype.startsWith('audio');
  const isVideo = mimetype.startsWith('video');
  return { isImage, isAudio, isVideo, isMedia: isImage || isAudio || isVideo }

}

const httpServer = http.createServer(async (req, res) => {
  // get path from url
  console.log(req.url)
  const renderPage = req.url.endsWith('?view=page')
  const gridView = req.url.endsWith('?view=grid')
  const thumbView = req.url.endsWith('?view=thumb')
  const url = new URL(req.url, `http://localhost:${portNumber}`);
  const relpath = decodeURIComponent(url.pathname.replace(/\?.*$/, '')).replace(/\/+/g, '/');
  const filepath = path.join(basedir, relpath);
  const mimeType = getMimeType(filepath)

  if (fs.existsSync(filepath)) {

    const isDirectoryListing = fs.statSync(filepath).isDirectory();

    if (renderPage || isDirectoryListing) {

      // required for rich media
      res.setHeader("Cache-Control", "max-age=60")
      res.setHeader("Content-Type", 'text/html')

      // write title
      res.write(`<html><head>`)
      res.write(`<title>${relpath}</title>`)
      res.write('<style>html,body,main{font-family:sans-serif;padding:0;margin:0;height:100vh;width:100vw;box-sizing:border-box;}</style>')
      res.write('<style>main{padding:10px;gap:10px;display:flex;flex-direction:column;}</style>')
      res.write('<style>section{min-height:1px;height:100%;overflow-y:auto;justify-content:flex-start;align-content:flex-start;}</style>')
      res.write('<style>img.fill,video.fill{max-height:90%;object-fit:contain;}</style>')
      res.write('<style>section.grid{display:flex;flex-wrap:wrap;gap:2px;}.grid img,.grid video,.grid > *{display:flex;justify-content:center;align-items:center;overflow-wrap:anywhere;width:200px;height:200px;object-fit:cover;}.grid > *:hover{background:#eee;}</style>')
      res.write(`</head><body><main>`)
      res.write('<nav>')
      if (gridView) {
        res.write(`<a style="float:right;" href="?">List</a>`)
      } else {
        res.write(`<a style="float:right;" href="?view=grid">Grid</a>`)
      }
      res.write(`<h1>Index of <a href="${encodeURIComponent(path.join(relpath, '..'))}">${relpath}</a></h1>`)
      res.write('<hr>')
      res.write('</nav>')

      // try to handle rich media first
      if (renderPage && mimeType.startsWith('audio')) {
        res.write(`<audio class="fill" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></audio>`)
      } else if (renderPage && mimeType.startsWith('video')) {
        res.write(`<video class="fill" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></video>`)
      } else if (renderPage && mimeType.startsWith('image')) {
        res.write(`<img class="fill" src="/${encodeURIComponent(relpath)}?view=0" />`)
      } else if (isDirectoryListing) {

        res.write(`<section class="${gridView ? 'grid' : ''}">`)
        // list files
        fs.readdirSync(filepath).sort((a, b) => {
          // directories first, then alphabetical
          const adir = fs.statSync(path.join(filepath, a)).isDirectory()
          const bdir = fs.statSync(path.join(filepath, b)).isDirectory()
          const compareCaseInsensitive = a.localeCompare(b, undefined, { sensitivity: 'base' })
          return adir && bdir ? compareCaseInsensitive : adir ? -1 : bdir ? 1 : compareCaseInsensitive
        }).forEach(file => {
          const resolvedFile = path.resolve(filepath, file);
          if (fs.existsSync(resolvedFile)) {
            const isDirectory = fs.statSync(resolvedFile).isDirectory()
            if (isDirectory) {
              res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}">+ ${file}</a><br>`)
            } else {
              // grid view
              const media = isMediaType(getMimeType(file))
              if (gridView && media.isImage) {
                // images
                res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=page"><img loading="lazy" src="/${encodeURIComponent(path.join(relpath, file))}?view=thumb" /></a>`)
              } else if (gridView && media.isVideo) {
                // videos
                res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=page"><video controls loading="lazy"><source src="/${encodeURIComponent(path.join(relpath, file))}?view=0#t=0.1" /></video></a>`)
              } else {
                // everything else
                res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=page">${file}</a><br>`)
              }
            }
          } else {
            res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=page">${file}</a><br>`)
          }
        })
        res.write(`</section>`)
      }
      res.write('</main></body></html>')
      res.end()
    } else {
      // set content type if known...
      const mimetype = getMimeType(filepath);
      const media = isMediaType(mimetype)
      const range = req.headers.range

      if (thumbView && media.isImage) {
        // generate thumbnail
        res.writeHead(200, {
          "Content-Type": mimetype,
          "Cache-Control": "max-age=900"
        })
        sharp(filepath, { failOn: "none" }).rotate().resize(200).jpeg().toBuffer()
          .then(buf => res.end(buf))
          .catch(err => respond(res, 500, "Error reading file: " + err))
        return
      }
      const size = await getSize(filepath);
      if (range) {
        // handle range
        let [start, end] = range.replace(/bytes=/, "").split("-");
        const chunksize = 1024 * 1024 * 0.5 // MB
        start = parseInt(start, 10);
        end = end ? parseInt(end, 10) : Math.min(size - 1, start + chunksize);

        if (!isNaN(start) && isNaN(end)) {
          start = start;
          end = Math.min(size - 1, start + chunksize);
        }
        if (isNaN(start) && !isNaN(end)) {
          start = size - end;
          end = Math.min(size - 1, start + chunksize);
        }

        // Handle unavailable range request
        if (start >= size || end >= size) {
          // Return the 416 Range Not Satisfiable.
          res.writeHead(416, {
            "Content-Range": `bytes */${size}`,
            "Content-Type": mimetype
          });
          return res.end();
        }

        /** Sending Partial Content With HTTP Code 206 */
        res.writeHead(206, {
          "Accept-Ranges": "bytes",
          "Cache-Control": "max-age=900",
          "Content-Type": mimetype,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Content-Length": end - start + 1,
        });

        console.log(`Range: ${start}-${end}/${size}`)

        const readable = fs.createReadStream(filepath, { start: start, end: end });
        pipeline(readable, res, err => {
          respond(res, 500, "Error reading file: " + err)
        });
      } else {
        // stream the entire file
        res.writeHead(200, {
          "Accept-Ranges": "bytes",
          "Cache-Control": "max-age=900",
          "Content-Type": mimetype,
          "Content-Length": size,
        })

        const readable = fs.createReadStream(filepath);
        pipeline(readable, res, err => {
          respond(res, 500, "Error reading file: " + err)
        });
      }
    }
  } else {
    respond(res, 404, "File not found: " + filepath)
  }
});

// start server
httpServer.listen(portNumber, () => console.log(`Server is listening on port ${portNumber} - BASEDIR=${basedir}`));

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