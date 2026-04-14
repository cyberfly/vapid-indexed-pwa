/**
 * generate-icons.js
 * Creates simple PNG icons for the PWA manifest.
 * Run once with: node generate-icons.js
 *
 * Uses the 'canvas' package to draw a simple icon.
 * Fallback: creates minimal valid PNG files using raw bytes.
 */

const fs   = require('fs');
const path = require('path');

/**
 * createMinimalPng(size)
 * Creates a minimal valid PNG as a Buffer without external dependencies.
 * Uses raw PNG binary format (PNG spec: signature + IHDR + IDAT + IEND chunks).
 *
 * @param {number} size - Width and height in pixels
 * @param {number[]} color - [R, G, B] color array (e.g., [76, 175, 80] for green)
 * @returns {Buffer}
 */
function createMinimalPng(size, color = [76, 175, 80]) {
  // We'll use the 'zlib' built-in to compress image data (required by PNG format)
  const zlib = require('zlib');

  // PNG file signature — all PNG files start with these 8 bytes
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  /**
   * buildChunk(type, data)
   * Builds a PNG chunk: [length][type][data][CRC32]
   */
  function buildChunk(type, data) {
    const typeBuffer = Buffer.from(type, 'ascii');
    const len        = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);

    // CRC32 checksum covers type + data
    const crcData = Buffer.concat([typeBuffer, data]);
    const crc     = crc32(crcData);
    const crcBuf  = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([len, typeBuffer, data, crcBuf]);
  }

  /**
   * crc32(buf)
   * Computes CRC32 checksum (required for PNG chunk validation).
   */
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  // IHDR chunk: image header (width, height, bit depth, color type)
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);  // Width
  ihdrData.writeUInt32BE(size, 4);  // Height
  ihdrData.writeUInt8(8,   8);      // Bit depth: 8 bits per channel
  ihdrData.writeUInt8(2,   9);      // Color type: 2 = RGB
  ihdrData.writeUInt8(0,   10);     // Compression method: 0
  ihdrData.writeUInt8(0,   11);     // Filter method: 0
  ihdrData.writeUInt8(0,   12);     // Interlace method: 0 (none)

  // Build raw image data: for each row, a filter byte (0) + RGB for each pixel
  const rawRows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter byte + 3 bytes per pixel
    row[0] = 0; // Filter type: None
    for (let x = 0; x < size; x++) {
      row[1 + x * 3]     = color[0]; // R
      row[1 + x * 3 + 1] = color[1]; // G
      row[1 + x * 3 + 2] = color[2]; // B
    }
    rawRows.push(row);
  }
  const rawData = Buffer.concat(rawRows);

  // Compress the image data using DEFLATE (required by PNG)
  const compressed = zlib.deflateSync(rawData);

  // IDAT chunk: compressed image data
  // IEND chunk: marks end of file
  return Buffer.concat([
    signature,
    buildChunk('IHDR', ihdrData),
    buildChunk('IDAT', compressed),
    buildChunk('IEND', Buffer.alloc(0))
  ]);
}

// Generate icons
const iconsDir = path.join(__dirname, 'icons');

// Create green (#4CAF50) icons matching our theme color
const greenColor = [76, 175, 80];

fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), createMinimalPng(192, greenColor));
fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), createMinimalPng(512, greenColor));

console.log('✅ Icons created: icons/icon-192.png, icons/icon-512.png');
