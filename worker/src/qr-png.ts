import QRCode from 'qrcode';

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  const MOD = 65521;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]) % MOD;
    b = (b + a) % MOD;
  }
  return ((b << 16) | a) >>> 0;
}

function writeU32BE(buf: Uint8Array, offset: number, val: number): void {
  buf[offset] = (val >>> 24) & 0xff;
  buf[offset + 1] = (val >>> 16) & 0xff;
  buf[offset + 2] = (val >>> 8) & 0xff;
  buf[offset + 3] = val & 0xff;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  writeU32BE(chunk, 0, data.length);
  for (let i = 0; i < 4; i++) chunk[4 + i] = type.charCodeAt(i);
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.length);
  writeU32BE(chunk, 8 + data.length, crc32(crcInput));
  return chunk;
}

function zlibStore(raw: Uint8Array): Uint8Array {
  const MAX_BLOCK = 65535;
  const numBlocks = Math.max(1, Math.ceil(raw.length / MAX_BLOCK));
  const out = new Uint8Array(2 + numBlocks * 5 + raw.length + 4);
  // Zlib header: CMF=0x78 (deflate, 32K window), FLG=0x01 (no dict, check bits)
  out[0] = 0x78;
  out[1] = 0x01;
  let pos = 2;
  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const isLast = b === numBlocks - 1;
    const len = Math.min(MAX_BLOCK, raw.length - offset);
    out[pos++] = isLast ? 0x01 : 0x00;
    out[pos++] = len & 0xff;
    out[pos++] = (len >>> 8) & 0xff;
    const nlen = ~len & 0xffff;
    out[pos++] = nlen & 0xff;
    out[pos++] = (nlen >>> 8) & 0xff;
    out.set(raw.subarray(offset, offset + len), pos);
    pos += len;
    offset += len;
  }
  writeU32BE(out, pos, adler32(raw));
  return out;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Generates a pure-TypeScript, runtime-agnostic 8-bit greyscale PNG QR code
 * suitable for both Cloudflare Workers V8 edge isolates and Node.js.
 */
export function generateQrPngBase64(text: string, scale = 6, marginModules = 4): string {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const data = qr.modules.data;
  const totalModules = size + marginModules * 2;
  const px = totalModules * scale;

  // Each scanline starts with filter byte 0x00 followed by `px` greyscale bytes
  const raw = new Uint8Array(px * (1 + px));
  let p = 0;
  for (let y = 0; y < px; y++) {
    raw[p++] = 0x00; // Filter: None
    const my = Math.floor(y / scale) - marginModules;
    for (let x = 0; x < px; x++) {
      const mx = Math.floor(x / scale) - marginModules;
      const isDark =
        mx >= 0 && mx < size && my >= 0 && my < size ? Boolean(data[my * size + mx]) : false;
      raw[p++] = isDark ? 7 : 255; // #070707 dark modules on crisp white
    }
  }

  const signature = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = new Uint8Array(13);
  writeU32BE(ihdr, 0, px);
  writeU32BE(ihdr, 4, px);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 0; // Color type: Greyscale
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace: None

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', zlibStore(raw));
  const iendChunk = makeChunk('IEND', new Uint8Array(0));

  const png = new Uint8Array(
    signature.length + ihdrChunk.length + idatChunk.length + iendChunk.length,
  );
  let pos = 0;
  png.set(signature, pos);
  pos += signature.length;
  png.set(ihdrChunk, pos);
  pos += ihdrChunk.length;
  png.set(idatChunk, pos);
  pos += idatChunk.length;
  png.set(iendChunk, pos);

  return uint8ToBase64(png);
}

export function generateQrPngDataUrl(text: string, scale = 6): string {
  return `data:image/png;base64,${generateQrPngBase64(text, scale)}`;
}
