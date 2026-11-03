const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

async function check() {
  const app = path.join(__dirname, '../src/app');
  const { data, info } = await sharp(path.join(app, 'icon.png')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 512);
  assert.equal(info.height, 512);
  assert.equal(info.channels, 4);
  const bounds = [512, 512, 0, 0];
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const i = (y * 512 + x) * 4;
      if (!data[i + 3]) continue;
      assert.deepEqual([...data.subarray(i, i + 3)], [244, 130, 32], 'Only brand orange allowed');
      assert.ok(Math.hypot(x - 255.5, y - 255.5) < 256, 'Symbol must fit circular crop');
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    }
  }
  assert.ok(bounds[2] > bounds[0], 'Symbol must not be empty');
  assert.ok(Math.min(bounds[0], bounds[1], 511 - bounds[2], 511 - bounds[3]) >= 64, 'Minimum padding 12.5%');
  assert.ok(Math.abs(bounds[0] - (511 - bounds[2])) <= 1, 'Center horizontally');
  assert.ok(Math.abs(bounds[1] - (511 - bounds[3])) <= 1, 'Center vertically');
  const ico = fs.readFileSync(path.join(app, 'favicon.ico'));
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 4);
  for (const [index, size] of [16, 32, 48, 256].entries()) {
    const entry = 6 + index * 16;
    const offset = ico.readUInt32LE(entry + 12);
    const image = ico.subarray(offset, offset + ico.readUInt32LE(entry + 8));
    const metadata = await sharp(image).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.ok(metadata.hasAlpha);
  }
  console.log('PASS: transparent orange symbol, centered, safe padding/circular crop, ICO 16/32/48/256');
}

check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
