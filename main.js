const { program } = require('commander');
const http = require('http');
const fs = require('fs/promises');
const path = require('path');
const { once } = require('events');
const { randomUUID } = require('crypto');
const superagent = require('superagent');


program
    .helpOption('--help', 'показати довідку')
    .requiredOption('-h, --host <address>', 'адреса, на якій працює сервер')
    .requiredOption('-p, --port <number>', 'порт сервера')
    .requiredOption('-c, --cache <path>', 'шлях до теки з кешованими картинками');

program.parse();
const options = program.opts();

const port = Number(options.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
    program.error(`Помилка: некоректний порт "${options.port}" (очікується число від 1 до 65535)`);
}

const host = options.host;
const cacheDir = path.resolve(options.cache);

const ALLOWED_METHODS = 'GET, PUT, DELETE';
const SOURCE_HEADER = 'X-Image-Source';


function sendText(res, statusCode, message, headers = {}) {
    res.writeHead(statusCode, {
        'Content-Type': 'text/plain; charset=utf-8',
        ...headers,
    });
    res.end(message);
}

function sendImage(res, image, source) {
  res.writeHead(200, {
    'Content-Type': 'image/jpeg',
    'Content-Length': image.length,
    [SOURCE_HEADER]: source,
  });
  res.end(image);
}

function parseCode(url) {
    const { pathname } = new URL(url, 'http://localhost');
    const match = /^\/(\d{3})$/.exec(pathname);
    if (!match) return null;

    const code = Number(match[1]);
    if (code < 100 || code > 599) return null;

    return match[1];
}

function getCachePath(code) {
    return path.join(cacheDir, `${code}.jpg`);
}

async function writeCacheFile(filePath, data) {
  const tmpPath = `${filePath}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(tmpPath, data);
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }
}

async function readFromCache(code) {
  try {
    return await fs.readFile(getCachePath(code));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function fetchFromHttpCat(code) {
  const response = await superagent
    .get(`https://http.cat/${code}`)
    .responseType('blob')
    .timeout({ response: 5000, deadline: 15000 });
  return response.body;
}

function describeFetchError(err) {
  if (err.status) return `http.cat повернув код ${err.status}`;
  if (err.timeout) return 'http.cat не відповів вчасно';
  return `не вдалося з'єднатися з http.cat (${err.code || err.message})`;
}

async function handleGet(res, code) {
  const cached = await readFromCache(code);
  if (cached !== null) {
    sendImage(res, cached, 'cache');
    return;
  }

  let image;
  try {
    image = await fetchFromHttpCat(code);
  } catch (err) {
    sendText(res, 404, `Картинку для коду ${code} не знайдено: ${describeFetchError(err)}\n`);
    return;
  }

  try {
    await writeCacheFile(getCachePath(code), image);
  } catch (err) {
    console.error(`Не вдалося зберегти ${code} у кеш: ${err.message}`);
  }

  sendImage(res, image, 'http.cat');
}

async function handleRequest(req, res) {
    try {
        if (!['GET', 'PUT', 'DELETE'].includes(req.method)) {
            sendText(res, 405, `Метод ${req.method} не підтримується\n`, {
                Allow: ALLOWED_METHODS,
            });
            return;
        }

        const code = parseCode(req.url);
        if (code === null) {
            sendText(res, 400, 'Некоректний шлях: очікується /<код стану HTTP від 100 до 599>, наприклад /404\n');
            return;
        }
        switch (req.method) {
            case 'GET':
                await handleGet(res, code);
                break;
            case 'PUT':
                sendText(res, 501, `PUT ${code}: ще не реалізовано\n`);
                break;
            case 'DELETE':
                sendText(res, 501, `DELETE ${code}: ще не реалізовано\n`);
                break;
        }
    } catch (err) {
        console.error(`Внутрішня помилка: ${err.message}`);
        if (!res.headersSent) {
            sendText(res, 500, 'Внутрішня помилка сервера\n');
        } else {
            res.end();
        }
    }
}

async function main() {
    try {
        await fs.mkdir(cacheDir, { recursive: true });
    } catch (err) {
        console.error(`Не вдалося створити теку кешу: ${err.message}`);
        process.exit(1);
    }

    const server = http.createServer(async (req, res) => {
        await handleRequest(req, res);
    });

    server.listen(port, host);

    try {
        await once(server, 'listening');
        console.log(`Сервер працює на http://${host}:${port}`);
        console.log(`Тека кешу: ${cacheDir}`);
    } catch (err) {
        console.error(`Не вдалося запустити сервер: ${err.message}`);
        process.exit(1);
    }
}

main();