'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let j = 0; j < 8; j += 1) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const header = Buffer.from(type, 'ascii');
  const inner = Buffer.concat([header, data]);
  const out = Buffer.alloc(4 + inner.length + 4);
  out.writeUInt32BE(data.length, 0);
  inner.copy(out, 4);
  out.writeUInt32BE(crc32(inner), 4 + inner.length);
  return out;
}

function pngHeader(width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return ihdr;
}

function assemblePng(width, height, rows) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const raw = Buffer.concat(rows);
  const compressed = zlib.deflateSync(raw, { level: 1 });
  return Buffer.concat([
    signature,
    chunk('IHDR', pngHeader(width, height)),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildPng(width, height, [r, g, b]) {
  const row = Buffer.alloc(1 + width * 3);
  row[0] = 0;
  for (let x = 0; x < width; x += 1) {
    row[1 + x * 3] = r;
    row[1 + x * 3 + 1] = g;
    row[1 + x * 3 + 2] = b;
  }
  return assemblePng(width, height, Array.from({ length: height }, () => row));
}

function buildPanelPng(width, height, palette) {
  const rows = [];
  const topLimit = Math.floor(height * 0.14);
  const bottomLimit = Math.floor(height * 0.84);
  const stripeStart = Math.floor(width * 0.68);
  const stripeEnd = Math.floor(width * 0.8);

  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = palette.main;
      if (y < topLimit) color = palette.top;
      else if (y >= bottomLimit) color = palette.bottom;
      if (x >= stripeStart && x <= stripeEnd && y > topLimit && y < bottomLimit) {
        color = palette.stripe;
      }
      row[1 + x * 3] = color[0];
      row[1 + x * 3 + 1] = color[1];
      row[1 + x * 3 + 2] = color[2];
    }
    rows.push(row);
  }

  return assemblePng(width, height, rows);
}

// Fonte única das imagens E2E. O servidor e o preparo de fixtures importam este Map.
const PNG_IMAGES = new Map([
  ['page_001.png', buildPanelPng(800, 1200, {
    top: [70, 12, 12],
    main: [184, 44, 44],
    bottom: [230, 122, 122],
    stripe: [255, 242, 242],
  })],
  ['page_002.png', buildPanelPng(800, 1200, {
    top: [10, 34, 87],
    main: [41, 98, 255],
    bottom: [118, 185, 255],
    stripe: [255, 232, 108],
  })],
  ['avatar.png', buildPng(48, 48, [100, 200, 100])],
  ['banner.png', buildPng(960, 120, [220, 180, 50])],
  ['translated_result_0.png', buildPanelPng(800, 1200, {
    top: [16, 85, 62],
    main: [29, 158, 94],
    bottom: [125, 220, 150],
    stripe: [235, 255, 242],
  })],
  ['translated_result_1.png', buildPanelPng(800, 1200, {
    top: [74, 20, 140],
    main: [144, 73, 255],
    bottom: [236, 157, 255],
    stripe: [255, 239, 120],
  })],
  ['translated_result_default.png', buildPanelPng(800, 1200, {
    top: [34, 78, 120],
    main: [72, 165, 214],
    bottom: [180, 232, 255],
    stripe: [255, 255, 255],
  })],
]);

function writeImagesToDisk(targetDir = path.join(__dirname, 'manga-images')) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const [file, buf] of PNG_IMAGES) {
    fs.writeFileSync(path.join(targetDir, file), buf);
  }
  return [...PNG_IMAGES.keys()];
}

module.exports = {
  PNG_IMAGES,
  buildPng,
  buildPanelPng,
  writeImagesToDisk,
};
