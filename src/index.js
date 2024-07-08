const fs = require("fs");
const fsPromise = require("fs/promises");
const path = require("path");
const http = require("http");
const sharp = require("sharp");
const { pipeline } = require("stream")

const cache = {}

const getSize = async (filepath) => {
  if (!cache[filepath]) {
    const stats = await fsPromise.stat(filepath)
    cache[filepath] = stats.size
  }
  return cache[filepath]
}

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
  ".weba": "audio/webm",
  ".ogg": "video/ogg",
  ".ogv": "video/ogg",
  ".oga": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".mpeg": "video/mpeg",
  ".mid": "audio/midi",
  ".midi": "audio/midi",
  ".wav": "audio/wav",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  ".yml": "text/yaml",
  ".mkv": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/mp4",
  ".avi": "video/x-msvideo",
}

const css = `
html,body,main{padding:0;margin:0;height:100vh;width:100vw;box-sizing:border-box;}
*{font-family:sans-serif;font-size:20px;}
main{padding:10px;gap:10px;display:flex;flex-direction:column;}
section{min-height:1px;height:100%;overflow-y:auto;justify-content:flex-start;align-content:flex-start;}
img.fill,video.fill{max-height:90%;object-fit:contain;}
a{cursor:pointer;flex-grow:1;padding:2px;}
.no-grow{flex-grow:0 !important;}
h1{display:inline-block;}
.grid{display:flex;flex-wrap:wrap;gap:2px;}
.grid > .row,
.grid > .row > a,
.grid img,
.grid video{display:flex;justify-content:center;align-items:center;text-align:center;overflow-wrap:anywhere;width:200px;height:200px;object-fit:cover;}
.grid > .row{box-sizing:border-box;background:#eee;border:1px solid #ccc;padding:10px;}
.row:hover{background:#ddd !important;}
.list{display:flex;flex-direction:column;gap:2px;}
.list > .row{display:flex;flex-direction:row;justify-content:space-between;align-items:center;}
.list > .row > a{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
@media screen and (max-width: 1200px) {
  .hide-mobile{display:none;}
}
.grid .hide-mobile{display:none;}
.error{border:1px solid red !important;background:pink !important;}
`

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

// convert bytes to human readable format
const humanFileSize = (bytes, si = false) => {
  const thresh = si ? 1000 : 1024;
  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }
  const units = si
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10;
  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);
  return bytes.toFixed(0) + ' ' + units[u];
}

// GUARD: operation not supported on socket
const safeStat = async (filepath) => {
  try {
    return fsPromise.stat(filepath)
  } catch (err) {
    return { isDirectory: false, size: 0 }
  }
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

    const isDirectoryListing = (await safeStat(filepath)).isDirectory();

    if (renderPage || isDirectoryListing) {

      // required for rich media
      res.setHeader("Cache-Control", "max-age=60")
      res.setHeader("Content-Type", 'text/html')

      // write title
      res.write(`<html><head>`)
      res.write('<meta name="viewport" content="width=device-width, height=device-height, initial-scale=1.0, minimum-scale=1.0">')
      res.write(`<title>${relpath}</title>`)
      res.write(`<style>${css}</style>`)
      res.write(`</head><body><main>`)
      res.write('<nav>')
      res.write(`<div class="list"><div class="row">`)
      res.write(`<h1>Index of <a href="${encodeURIComponent(path.join(relpath, '..'))}?view=${gridView ? 'grid' : 'list'}">${relpath}</a></h1>`)
      if (gridView) {
        res.write(`<a class="no-grow" href="?">List</a>`)
      } else {
        res.write(`<a class="no-grow" href="?view=grid">Grid</a>`)
      }
      res.write('</div></div>')
      res.write('<hr>')
      res.write('</nav>')

      // try to handle rich media first
      if (renderPage && mimeType.startsWith('audio')) {
        res.write(`<audio class="fill" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></audio>`)
      } else if (renderPage && mimeType.startsWith('video')) {
        res.write(`<video class="fill" autoplay controls preload="metadata"><source src="/${encodeURIComponent(relpath)}?view=0" type="${mimeType}"></video>`)
      } else if (renderPage && mimeType.startsWith('image')) {
        res.write(`<img class="fill" src="/${encodeURIComponent(relpath)}?view=${gridView ? 'grid' : 'list'}" />`)
      } else if (isDirectoryListing) {
        // list directories
        res.write(`<section class="${gridView ? 'grid' : 'list'}">`)
        try {
          const entries = fs.readdirSync(filepath);
          /** @type {Object<string, fs.Stats>} */
          const statsByFile = entries.reduce((prev, curr) => {
            prev[curr] = fs.statSync(path.join(filepath, curr))
            return prev
          }, {})
          await Promise.all(Object.values(statsByFile))
          // list files
          entries.sort((a, b) => {
            // directories first, then alphabetical
            const adir = statsByFile[a].isDirectory()
            const bdir = statsByFile[b].isDirectory()
            const compareCaseInsensitive = a.localeCompare(b, undefined, { sensitivity: 'base' })
            return adir && bdir ? compareCaseInsensitive : adir ? -1 : bdir ? 1 : compareCaseInsensitive
          }).forEach(file => {
            if (statsByFile[file].isDirectory()) {
              // directory
              res.write(`<div class="row">`)
              res.write(`<a href="/${encodeURIComponent(path.join(relpath, file))}?view=${gridView ? 'grid' : 'list'}">+ ${file}</a>`)
              res.write(`<span class="hide-mobile">${statsByFile[file].mtime.toISOString().substring(0, 10)}</span>`)
              res.write(`</div>`)
            } else {
              // grid view
              const media = isMediaType(getMimeType(file))
              if (gridView && media.isImage) {
                // images
                res.write(`<div class="row"><a href="/${encodeURIComponent(path.join(relpath, file))}?view=page"><img loading="lazy" src="/${encodeURIComponent(path.join(relpath, file))}?view=thumb" /></a></div>`)
              } else if (gridView && media.isVideo) {
                // videos
                res.write(`<div class="row"><a href="/${encodeURIComponent(path.join(relpath, file))}?view=page"><video controls loading="lazy"><source src="/${encodeURIComponent(path.join(relpath, file))}?view=0#t=0.1" /></video></a></div>`)
              } else {
                // everything else
                if (gridView) {
                  res.write(`<div class="row"><a href="/${encodeURIComponent(path.join(relpath, file))}?view=page">${file}</a></div>`)
                } else {
                  res.write(`<div class="row">
                  <a href="/${encodeURIComponent(path.join(relpath, file))}?view=page">${file}</a>
                  <span class="hide-mobile">${humanFileSize(statsByFile[file].size, true)}
                  /
                  ${statsByFile[file].mtime.toISOString().substring(0, 10)}</span>
                  </div>`)
                }
              }
            }
          })
          if (entries.length === 0) {
            res.write(`<div class="row error">Empty directory.</div>`)
          }
        } catch (err) {
          res.write(`<div class="row error">Permission denied: ${err.message}</div>`)
        }
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
        // inspired by: https://github.com/phoenixinfotech1984/node-content-range
        let [start, end] = range.replace(/bytes=/, "").split("-");
        const chunksize = typeof process.env.CHUNK_SIZE_BYTES === 'string' ? parseInt(process.env.CHUNK_SIZE_BYTES) : (1024 * 1024 * 5) // MB
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

        const readable = fs.createReadStream(filepath, {
          flags: 'r',
          start: start,
          end: end,
          highWaterMark: 256 * 1024
        });
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