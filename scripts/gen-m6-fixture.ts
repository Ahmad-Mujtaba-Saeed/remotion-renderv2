import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

/**
 * Writes fixtures/m6-cards-slides.json — the Tier C card demo (phone_mockup,
 * photo_stack, map_card, headline_ticker) used by the M6 probe-still pass.
 * Media slots use generated data-URI PNGs (the probe bundle server does not
 * serve arbitrary public/ paths — documented in the M1 notes).
 */

// Minimal PNG encoder: solid colour with a contrasting diagonal stripe so
// crops/fits are visually checkable.
const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf: Buffer): number => {
  let c = -1;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
const chunk = (type: string, data: Buffer): Buffer => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};
const png = (w: number, h: number, rgb: [number, number, number], stripe: [number, number, number]): string => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolor
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const on = Math.abs((x + y) % 120) < 26;
      const [r, g, b] = on ? stripe : rgb;
      raw[row + 1 + x * 3] = r;
      raw[row + 2 + x * 3] = g;
      raw[row + 3 + x * 3] = b;
    }
  }
  const out = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${out.toString('base64')}`;
};

const screen = png(360, 640, [38, 52, 84], [217, 89, 112]);
const photoA = png(640, 420, [84, 52, 38], [250, 241, 236]);
const photoB = png(640, 420, [38, 84, 62], [250, 241, 236]);
const photoC = png(420, 640, [60, 44, 90], [250, 241, 236]);

const asset = (uri: string, w: number, h: number) => ({
  url: uri,
  type: 'image',
  width: w,
  height: h,
});

const shotList = {
  project_id: 'm6-cards',
  aspect_ratio: '16:9',
  composition_mode: 'slides',
  captions: { enabled: false },
  font_pack: 'editorial',
  motion_style: 'crisp',
  skin: 'flat',
  sfx: { enabled: true, volume: 1, pack: 'procedural' },
  theme: {
    name: 'glacier',
    label: 'Glacier',
    bg_from: '#F4F8FB',
    bg_to: '#F4F8FB',
    accent: '#3E8FD8',
    accent2: '#2C6FB0',
    text: '#14202B',
    muted: '#7C8B98',
    panel: '#E9F0F6',
  },
  scenes: [
    {
      scene_id: 'c1',
      order: 1,
      duration_seconds: 6,
      narration: { text: 'The app looked like this on launch day.' },
      layout_template: 'phone_mockup',
      transition: 'none',
      style: { kicker: 'THE APP' },
      slots: {
        slot_screen: {
          content_type: 'image',
          frame: 'phone',
          label: 'v1.0',
          camera_move: 'slow_zoom_in',
          asset_ref: asset(screen, 360, 640),
        },
      },
    },
    {
      scene_id: 'c2',
      order: 2,
      duration_seconds: 6,
      narration: { text: 'And the website told the same story.' },
      layout_template: 'phone_mockup',
      transition: 'mask_wipe_diagonal',
      slots: {
        slot_screen: {
          content_type: 'image',
          frame: 'browser',
          label: 'example.com/launch',
          camera_move: 'slow_zoom_in',
          asset_ref: asset(screen, 360, 640),
        },
      },
    },
    {
      scene_id: 'c3',
      order: 3,
      duration_seconds: 9,
      narration: { text: 'Three photos from three eras tell you everything about how far this came.' },
      layout_template: 'photo_stack',
      transition: 'stack_push',
      style: { kicker: 'THREE ERAS' },
      slots: {
        slot_photo_1: { content_type: 'image', label: '1999', asset_ref: asset(photoA, 640, 420) },
        slot_photo_2: { content_type: 'image', label: '2010', asset_ref: asset(photoB, 640, 420) },
        slot_photo_3: { content_type: 'image', label: 'today', asset_ref: asset(photoC, 420, 640) },
      },
    },
    {
      scene_id: 'c4',
      order: 4,
      duration_seconds: 8,
      narration: { text: 'It started in London, but the real market turned out to be Tokyo.' },
      layout_template: 'map_card',
      transition: 'line_sweep',
      style: { kicker: 'THE JOURNEY' },
      slots: {
        slot_map: {
          content_type: 'map',
          heading: 'London To Tokyo',
          region: 'world',
          route: true,
          pins: [
            { label: 'London', lat: 51.5, lon: -0.12 },
            { label: 'Tokyo', lat: 35.68, lon: 139.69 },
          ],
        },
      },
    },
    {
      scene_id: 'c5',
      order: 5,
      duration_seconds: 7,
      narration: { text: 'The press could not agree on anything except that it mattered.' },
      layout_template: 'headline_ticker',
      transition: 'push_up',
      style: { kicker: 'THE REACTION' },
      slots: {
        slot_headlines: {
          content_type: 'headlines',
          heading: 'The Verdict Was Loud',
          items: [
            { text: 'The most important launch of the decade', source: 'WIRED' },
            { text: 'Overhyped, overpriced, oversold', source: 'The Verge' },
            { text: 'I cannot stop using it', source: 'Reddit' },
          ],
        },
      },
    },
    {
      scene_id: 'c6',
      order: 6,
      duration_seconds: 6,
      narration: { text: 'A single pin for the closing europe framing check.' },
      layout_template: 'map_card',
      transition: 'fade',
      slots: {
        slot_map: {
          content_type: 'map',
          heading: 'Where It Lives Now',
          region: 'europe',
          pins: [{ label: 'Berlin', lat: 52.52, lon: 13.4 }],
        },
      },
    },
  ],
};

const out = path.join(__dirname, '..', 'fixtures', 'm6-cards-slides.json');
fs.writeFileSync(out, JSON.stringify(shotList, null, 2));
console.log('wrote', out);

// Expected duration for the frame-exact check: sum(durations)*30 minus
// 17f per active transition (5 of them: c2..c6 all non-none).
const total = 6 + 6 + 9 + 8 + 7 + 6;
console.log('expected frames:', total * 30 - 5 * 17);
