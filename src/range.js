const fs = require("fs");
const fsPromise = require("fs/promises");

const cache = {}

const getSize = async (filepath) => {
    if (!cache[filepath]) {
        const stats = await fsPromise.stat(filepath)
        cache[filepath] = stats.size
    }
    return cache[filepath]
}

module.exports = {
    getSize
}