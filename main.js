const { program } = require('commander');
const fs = require('fs/promises');
const path = require('path');

// -h у commander за замовчуванням зайнято довідкою,
// тому залишаємо для довідки лише довгу форму --help
program
  .helpOption('--help', 'показати довідку')
  .requiredOption('-h, --host <address>', 'адреса, на якій працює сервер')
  .requiredOption('-p, --port <number>', 'порт сервера')
  .requiredOption('-c, --cache <path>', 'шлях до теки з кешованими картинками');

program.parse();
const options = program.opts();

// Перевірка порту: ціле число від 1 до 65535
const port = Number(options.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  program.error(`Помилка: некоректний порт "${options.port}" (очікується число від 1 до 65535)`);
}

const host = options.host;
const cacheDir = path.resolve(options.cache);

async function main() {
  try {
    // recursive: true — створює теку разом з усіма батьківськими
    // і не дає помилку, якщо тека вже існує
    await fs.mkdir(cacheDir, { recursive: true });
    console.log(`Тека кешу: ${cacheDir}`);
  } catch (err) {
    console.error(`Не вдалося створити теку кешу: ${err.message}`);
    process.exit(1);
  }
}

main();