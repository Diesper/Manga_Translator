'use strict';

const path = require('path');
const { PNG_IMAGES, writeImagesToDisk } = require('../fixtures/manga-images');

const outDir = path.join(__dirname, '..', 'fixtures', 'manga-images');
const written = writeImagesToDisk(outDir);

for (const file of written) {
  const buf = PNG_IMAGES.get(file);
  console.log(`OK ${file}: ${buf.length} bytes`);
}
console.log(`Fixtures PNG preparadas: ${written.length} arquivo(s).`);
