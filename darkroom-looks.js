/* Darkroom look library. Each look is colour science (p) plus effects (fx).
   Looks are emulations built for this app; brand and film names describe the
   style being emulated and imply no affiliation. */
(function () {
  'use strict';
  const D = (window.Darkroom = window.Darkroom || {});
  const merge = (a, b) => {
    const o = JSON.parse(JSON.stringify(a || {}));
    for (const k in b || {}) {
      const v = b[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = merge(o[k], v);
      else o[k] = JSON.parse(JSON.stringify(v));
    }
    return o;
  };

  D.CATS = [
    { id: 'fujifilm', name: 'Fujifilm', note: 'Film simulations and X100VI recipes' },
    { id: 'sony', name: 'Sony', note: 'Creative Looks, S-Cinetone and a7 recipes' },
    { id: 'canon', name: 'Canon', note: 'Picture Styles' },
    { id: 'nikon', name: 'Nikon', note: 'Picture Controls and Creative Picture Controls' },
    { id: 'film', name: 'Film Stocks', note: 'Colour negative, slide and black & white' },
    { id: 'instant', name: 'Instant', note: 'Polaroid and Instax, with their frames' },
    { id: 'vintage', name: 'Vintage', note: 'Old prints and alternative processes' },
    { id: 'nostalgic', name: 'Nostalgic', note: 'Disposables, digicams and tape' },
    { id: 'cinematic', name: 'Cinematic', note: 'Motion picture grades' }
  ];

  /* ---------- Fujifilm ---------- */
  const F = {};
  F.provia = { contrast: 8, saturation: 6, curve: { rgb: [[0, 0], [64, 60], [192, 198], [255, 255]] }, hsl: { blue: [0, 6, 0], green: [0, 4, 0] } };
  F.velvia = { contrast: 22, saturation: 26, vibrance: 8, blacks: -8, curve: { rgb: [[0, 0], [64, 54], [192, 204], [255, 255]] }, hsl: { red: [-4, 10, -4], magenta: [-6, 12, 0], green: [6, 12, -8], blue: [4, 16, -12], aqua: [0, 10, -5], yellow: [0, 8, 0] } };
  F.astia = { contrast: -2, saturation: 10, highlights: -12, shadows: 10, curve: { rgb: [[0, 4], [64, 64], [192, 194], [255, 252]] }, hsl: { orange: [2, -6, 6], red: [0, -4, 2], blue: [-3, 12, 6], green: [3, 8, 2], aqua: [0, 10, 4] } };
  F.chrome = { contrast: 12, saturation: -18, highlights: -6, shadows: -6, curve: { rgb: [[0, 6], [48, 40], [128, 126], [200, 204], [255, 250]] }, hsl: { red: [4, -18, -6], orange: [0, -6, 2], yellow: [-8, -24, 0], green: [14, -30, -6], aqua: [-6, -20, -8], blue: [-12, -26, -16], purple: [0, -20, 0], magenta: [0, -20, 0] }, grade: { sh: [195, 10, 0], hi: [42, 8, 0], blend: 55 }, cal: { b: [-6, -12] } };
  F.neg = { contrast: 20, saturation: -10, curve: { rgb: [[0, 14], [52, 40], [128, 130], [200, 212], [255, 246]], r: [[0, 0], [70, 64], [255, 255]], g: [[0, 4], [70, 72], [255, 252]], b: [[0, 10], [128, 126], [255, 236]] }, hsl: { red: [-6, 4, -6], orange: [-2, -6, 0], yellow: [12, -14, 2], green: [18, -14, -8], aqua: [-4, -10, -6], blue: [-14, -12, -10], magenta: [6, 0, 0] }, grade: { sh: [185, 16, 0], hi: [35, 10, 2], blend: 50 } };
  F.nostalgic = { temp: 6, contrast: 4, highlights: -16, shadows: 6, saturation: 4, curve: { rgb: [[0, 4], [64, 60], [128, 130], [200, 204], [255, 246]] }, hsl: { red: [0, 10, -4], orange: [2, 6, 2], yellow: [-8, -4, 0], green: [-12, -10, -4], blue: [-6, -10, -6] }, grade: { hi: [38, 24, 2], mi: [30, 6, 0], sh: [18, 6, 0], blend: 60 } };
  F.reala = { contrast: 16, saturation: 4, curve: { rgb: [[0, 0], [64, 58], [192, 200], [255, 255]] }, hsl: { orange: [2, -2, 2], blue: [0, 6, -2], green: [2, 2, 0] } };
  F.eterna = { contrast: -26, saturation: -34, highlights: -22, shadows: 18, curve: { rgb: [[0, 16], [64, 68], [128, 128], [200, 196], [255, 240]] }, hsl: { orange: [0, -8, 0], green: [10, -22, 0], blue: [-6, -16, 0] }, grade: { sh: [190, 14, 0], hi: [48, 6, 0] } };
  F.acros = { mono: 1, contrast: 14, clarity: 6, curve: { rgb: [[0, 0], [50, 40], [128, 128], [210, 222], [255, 255]] }, bwmix: { red: 4, orange: 6, yellow: 6, blue: -6 } };
  const acrosFx = { grain: 24, grainSize: 18, grainRough: 40 };

  /* ---------- Sony ---------- */
  const S = {};
  S.fl = { temp: -3, tint: -2, contrast: -6, saturation: -30, clarity: 10, curve: { rgb: [[0, 24], [64, 70], [128, 128], [192, 190], [255, 238]] }, grade: { sh: [165, 26, 0], hi: [52, 12, 0], blend: 55 }, hsl: { green: [10, -16, 0], blue: [-10, -20, -6], orange: [-7, -6, 3], red: [2, -6, 0], yellow: [-4, -10, 0] } };
  S.in = { temp: 6, contrast: -28, saturation: -20, highlights: -16, curve: { rgb: [[0, 30], [128, 132], [255, 228]] }, grade: { hi: [46, 14, 0], sh: [215, 8, 0] } };
  S.vv2 = { exposure: 0.15, contrast: 10, saturation: 18, whites: 10, blacks: -4, hsl: { blue: [-3, 8, 0], aqua: [0, 10, 0] } };
  S.bw = { mono: 1, contrast: 10 };
  const C = {};
  C.portrait = { temp: 5, contrast: 2, saturation: 2, texture: -14, hsl: { orange: [2, -4, 10], red: [-3, -2, 4] } };
  const port400 = { temp: 6, contrast: -10, highlights: -16, shadows: 8, saturation: -8, vibrance: 8, curve: { rgb: [[0, 10], [64, 66], [128, 132], [192, 196], [255, 246]] }, hsl: { red: [4, -4, 0], orange: [4, -8, 6], yellow: [-8, -10, 0], green: [-16, -22, -4], aqua: [-6, -12, 0], blue: [-8, -16, 0] }, grade: { hi: [40, 10, 0], sh: [190, 6, 0] } };

  const L = [];
  const add = (cat, id, name, sub, p, fx, extra) => L.push(Object.assign({ id, name, cat, sub, p: p || {}, fx: fx || {} }, extra || {}));

  add('fujifilm', 'fuji-provia', 'Provia', 'Standard', F.provia);
  add('fujifilm', 'fuji-velvia', 'Velvia', 'Vivid', F.velvia);
  add('fujifilm', 'fuji-astia', 'Astia', 'Soft', F.astia);
  add('fujifilm', 'fuji-classic-chrome', 'Classic Chrome', 'Muted documentary', F.chrome);
  add('fujifilm', 'fuji-classic-neg', 'Classic Neg', 'Hard tones, teal shadows', F.neg);
  add('fujifilm', 'fuji-nostalgic-neg', 'Nostalgic Neg', 'Amber highlights', F.nostalgic);
  add('fujifilm', 'fuji-reala-ace', 'Reala Ace', 'Faithful, crisp', F.reala);
  add('fujifilm', 'fuji-pro-neg-hi', 'Pro Neg Hi', 'Portrait', { contrast: 6, saturation: -6, highlights: -6, temp: 3, hsl: { orange: [2, -8, 6], red: [0, -6, 2] } });
  add('fujifilm', 'fuji-pro-neg-std', 'Pro Neg Std', 'Studio, soft', { contrast: -14, saturation: -14, highlights: -10, shadows: 10, hsl: { orange: [2, -10, 6], green: [0, -10, 0] }, curve: { rgb: [[0, 4], [128, 128], [255, 250]] } });
  add('fujifilm', 'fuji-eterna', 'Eterna', 'Cinema', F.eterna);
  add('fujifilm', 'fuji-eterna-bb', 'Eterna Bleach Bypass', 'Gritty, desaturated', { contrast: 32, saturation: -56, clarity: 12, blacks: -5, highlights: -8, curve: { rgb: [[0, 2], [64, 53], [192, 210], [255, 255]] }, grade: { sh: [200, 8, 0] } });
  add('fujifilm', 'fuji-acros', 'Acros', 'Fine-grain monochrome', F.acros, acrosFx);
  add('fujifilm', 'fuji-acros-ye', 'Acros + Ye', 'Yellow filter', merge(F.acros, { bwmix: { yellow: 20, orange: 12, red: 6, blue: -26, aqua: -14 } }), acrosFx);
  add('fujifilm', 'fuji-acros-r', 'Acros + R', 'Red filter, dark skies', merge(F.acros, { bwmix: { red: 36, orange: 26, yellow: 10, blue: -48, aqua: -36, green: -12 } }), acrosFx);
  add('fujifilm', 'fuji-acros-g', 'Acros + G', 'Green filter', merge(F.acros, { bwmix: { green: 32, yellow: 16, orange: -4, red: -18, blue: -10 } }), acrosFx);
  add('fujifilm', 'fuji-monochrome', 'Monochrome', 'Standard B&W', { mono: 1, contrast: 6 });
  add('fujifilm', 'fuji-sepia', 'Sepia', 'Warm monotone', { mono: 1, contrast: 4, grade: { gl: [34, 30, 0], sh: [25, 15, 0] }, curve: { rgb: [[0, 8], [255, 248]] } });
  add('fujifilm', 'x100vi-street-chrome', 'Street Chrome', 'X100VI recipe', merge(F.chrome, { temp: 8, tint: 2, highlights: -14, shadows: -4, clarity: 10 }), { grain: 20, grainSize: 20, grainRough: 45 });
  add('fujifilm', 'x100vi-golden-neg', 'Golden Hour Neg', 'X100VI recipe', merge(F.nostalgic, { temp: 16, shadows: 10 }), { halation: 12, grain: 14, grainSize: 20 });
  add('fujifilm', 'x100vi-night-neon', 'Night Neon', 'X100VI recipe', merge(F.neg, { temp: -14, tint: 4 }), { halation: 30, bloom: 10, grain: 22, grainSize: 22 });
  add('fujifilm', 'x100vi-summer-reala', 'Summer Reala', 'X100VI recipe', merge(F.reala, { exposure: 0.15, highlights: -10, vibrance: 10, temp: 5 }), { grain: 8 });
  add('fujifilm', 'x100vi-cine-eterna', 'Cine Eterna', 'X100VI recipe', merge(F.eterna, { temp: -4, grade: { sh: [185, 22, 0], hi: [40, 14, 0] } }), { vignette: -14, grain: 12 });
  add('fujifilm', 'x100vi-grainy-acros', 'Grainy Acros', 'X100VI recipe', merge(F.acros, { clarity: 10, bwmix: { red: 36, orange: 26, blue: -48, aqua: -36 } }), { grain: 34, grainSize: 22, grainRough: 55, vignette: -12 });

  add('sony', 'sony-st', 'ST', 'Standard', { contrast: 8, saturation: 8, curve: { rgb: [[0, 0], [64, 60], [192, 198], [255, 255]] } });
  add('sony', 'sony-pt', 'PT', 'Portrait', { contrast: -8, saturation: -6, highlights: -8, temp: 4, texture: -12, hsl: { orange: [2, -8, 8], red: [0, -6, 4] } });
  add('sony', 'sony-nt', 'NT', 'Neutral', { contrast: -16, saturation: -26, highlights: -10, shadows: 10 });
  add('sony', 'sony-vv', 'VV', 'Vivid', { contrast: 18, saturation: 22, vibrance: 8, blacks: -8, hsl: { blue: [0, 10, -6], red: [0, 8, 0] } });
  add('sony', 'sony-vv2', 'VV2', 'Vivid, brighter', S.vv2);
  add('sony', 'sony-fl', 'FL', 'Film, calm teal', S.fl);
  add('sony', 'sony-in', 'IN', 'Instant, matte', S.in);
  add('sony', 'sony-sh', 'SH', 'Soft high-key', { exposure: 0.35, contrast: -30, highlights: -12, shadows: 24, saturation: -16, temp: -5, curve: { rgb: [[0, 26], [128, 150], [255, 250]] }, grade: { hi: [195, 6, 0] } });
  add('sony', 'sony-bw', 'BW', 'Black & white', S.bw);
  add('sony', 'sony-se', 'SE', 'Sepia', { mono: 1, contrast: -4, grade: { gl: [36, 34, 0], sh: [28, 12, 0] }, curve: { rgb: [[0, 14], [255, 244]] } });
  add('sony', 'sony-s-cinetone', 'S-Cinetone', 'Picture profile', { contrast: -10, highlights: -26, saturation: -8, curve: { rgb: [[0, 6], [64, 62], [180, 184], [255, 238]] }, hsl: { orange: [3, -4, 5], red: [0, -4, 0], green: [4, -8, 0] }, grade: { mi: [30, 5, 0], sh: [200, 6, 0] } });
  add('sony', 'a7-fl-cinema', 'FL Cinema', 'a7 IV recipe', S.fl, { halation: 14, grain: 16, grainSize: 22, vignette: -10 });
  add('sony', 'a7-soft-film', 'Soft Film', 'a7C II recipe', merge(S.in, { temp: 10 }), { grain: 14, diffusion: 12 });
  add('sony', 'a7-street-mono', 'Street Mono', 'a7 IV recipe', merge(S.bw, { clarity: 16, contrast: 18 }), { grain: 22, grainSize: 22, vignette: -14 });
  add('sony', 'a7-vv2-sunset', 'VV2 Sunset', 'a7 IV recipe', merge(S.vv2, { temp: 14, grade: { hi: [30, 12, 0] } }), { halation: 8 });

  add('canon', 'canon-standard', 'Standard', 'Warm, punchy', { temp: 4, tint: 2, contrast: 12, saturation: 12, hsl: { orange: [2, 6, 2], red: [-2, 8, 0], magenta: [0, 6, 0] }, curve: { rgb: [[0, 0], [64, 58], [192, 200], [255, 255]] } });
  add('canon', 'canon-portrait', 'Portrait', 'Smooth skin', C.portrait);
  add('canon', 'canon-landscape', 'Landscape', 'Vivid greens and blues', { contrast: 14, saturation: 18, sharpen: 25, clarity: 8, hsl: { green: [-5, 20, -4], blue: [0, 20, -8], aqua: [0, 12, -4] } });
  add('canon', 'canon-fine-detail', 'Fine Detail', 'Crisp texture', { contrast: 6, saturation: 4, sharpen: 40, texture: 22 });
  add('canon', 'canon-neutral', 'Neutral', 'Flat for grading', { contrast: -12, saturation: -18 });
  add('canon', 'canon-faithful', 'Faithful', 'Accurate colour', { contrast: -8, saturation: -10, temp: -2 });
  add('canon', 'canon-monochrome', 'Monochrome', 'B&W', { mono: 1, contrast: 8 });
  add('canon', 'r5ii-golden-portrait', 'Golden Portrait', 'R5 Mark II recipe', merge(C.portrait, { temp: 12, grade: { hi: [40, 12, 0] } }), { diffusion: 8, grain: 8 });

  add('nikon', 'nikon-standard', 'Standard', 'Picture Control', { contrast: 10, saturation: 10, hsl: { green: [0, 5, 0], yellow: [-3, 4, 0] } });
  add('nikon', 'nikon-neutral', 'Neutral', 'Picture Control', { contrast: -10, saturation: -15 });
  add('nikon', 'nikon-vivid', 'Vivid', 'Picture Control', { contrast: 20, saturation: 30, vibrance: 6 });
  add('nikon', 'nikon-portrait', 'Portrait', 'Picture Control', { saturation: -5, hsl: { orange: [0, -5, 8] } });
  add('nikon', 'nikon-landscape', 'Landscape', 'Picture Control', { contrast: 12, saturation: 18, hsl: { green: [-5, 12, 0], blue: [0, 18, -4] } });
  add('nikon', 'nikon-flat', 'Flat', 'Picture Control', { contrast: -42, saturation: -30, highlights: -30, shadows: 30 });
  add('nikon', 'nikon-rich-tone', 'Rich Tone Portrait', 'Picture Control', { highlights: -26, shadows: 14, contrast: 4, saturation: 4, hsl: { orange: [0, 0, 5] } });
  add('nikon', 'nikon-dream', 'Dream', 'Creative Picture Control', { exposure: 0.2, contrast: -24, saturation: -10, temp: 6, tint: 8, curve: { rgb: [[0, 26], [128, 140], [255, 248]] }, grade: { hi: [330, 10, 0], sh: [260, 8, 0] } }, { diffusion: 18 });
  add('nikon', 'nikon-morning', 'Morning', 'Creative Picture Control', { exposure: 0.15, temp: -12, contrast: -12, saturation: -8, curve: { rgb: [[0, 18], [255, 252]] }, grade: { hi: [200, 8, 0] } });
  add('nikon', 'nikon-pop', 'Pop', 'Creative Picture Control', { contrast: 24, saturation: 40, vibrance: 12 });
  add('nikon', 'nikon-sunday', 'Sunday', 'Creative Picture Control', { temp: 14, contrast: -10, saturation: 6, curve: { rgb: [[0, 20], [128, 134], [255, 248]] }, grade: { hi: [42, 14, 0] } });
  add('nikon', 'nikon-somber', 'Somber', 'Creative Picture Control', { exposure: -0.2, contrast: 6, saturation: -38, temp: -6, grade: { sh: [215, 10, 0] }, curve: { rgb: [[0, 10], [255, 232]] } });
  add('nikon', 'nikon-dramatic', 'Dramatic', 'Creative Picture Control', { contrast: 34, saturation: -24, clarity: 24, blacks: -10 }, { vignette: -18 });
  add('nikon', 'nikon-bleached', 'Bleached', 'Creative Picture Control', { contrast: 22, saturation: -50, curve: { rgb: [[0, 20], [128, 124], [255, 250]] }, grade: { sh: [40, 6, 0] } });
  add('nikon', 'nikon-melancholic', 'Melancholic', 'Creative Picture Control', { temp: -16, saturation: -40, contrast: -6, curve: { rgb: [[0, 22], [255, 236]] }, grade: { sh: [220, 16, 0], hi: [210, 8, 0] } });
  add('nikon', 'nikon-denim', 'Denim', 'Creative Picture Control', { saturation: -60, contrast: 6, grade: { gl: [215, 32, 0], sh: [220, 20, 0] } });
  add('nikon', 'nikon-toy', 'Toy', 'Creative Picture Control', { contrast: 26, saturation: 30, curve: { b: [[0, 20], [255, 226]] } }, { vignette: -55, vigMid: 30, vigFeather: 40 });
  add('nikon', 'nikon-charcoal', 'Charcoal', 'Creative Picture Control', { mono: 1, contrast: -4, curve: { rgb: [[0, 26], [128, 120], [255, 236]] } }, { grain: 30, grainSize: 30 });

  add('film', 'kodak-portra-400', 'Portra 400', 'Colour negative · ISO 400', port400, { grain: 14, grainSize: 22, grainRough: 45, grainColor: 20, halation: 6 });
  add('film', 'kodak-portra-160', 'Portra 160', 'Colour negative · ISO 160', merge(port400, { temp: 3, saturation: -12, contrast: -12 }), { grain: 8, grainSize: 18, grainColor: 15 });
  add('film', 'kodak-portra-800', 'Portra 800', 'Colour negative · ISO 800', merge(port400, { temp: 8, contrast: -2, saturation: 0 }), { grain: 26, grainSize: 26, grainColor: 25, halation: 12 });
  add('film', 'kodak-ektar-100', 'Ektar 100', 'Colour negative · ISO 100', { contrast: 16, saturation: 20, curve: { rgb: [[0, 0], [64, 58], [192, 202], [255, 255]] }, hsl: { red: [-3, 18, -4], orange: [0, 10, 0], blue: [-5, 16, -6], green: [3, 10, -2], aqua: [0, 10, 0] }, grade: { sh: [210, 6, 0] } }, { grain: 6, grainSize: 14 });
  add('film', 'kodak-gold-200', 'Gold 200', 'Colour negative · ISO 200', { temp: 12, contrast: 6, saturation: 6, curve: { rgb: [[0, 6], [128, 132], [255, 250]] }, hsl: { yellow: [-6, 16, 4], orange: [0, 8, 2], green: [-10, -8, 0], blue: [-6, -12, 0] }, grade: { hi: [45, 16, 0] } }, { grain: 16, grainSize: 22, grainColor: 15 });
  add('film', 'kodak-ultramax-400', 'UltraMax 400', 'Colour negative · ISO 400', { temp: 8, contrast: 10, saturation: 10, hsl: { red: [0, 10, 0], yellow: [-4, 10, 0] }, grade: { sh: [200, 8, 0], hi: [45, 8, 0] } }, { grain: 20, grainSize: 24, grainColor: 20 });
  add('film', 'kodak-colorplus-200', 'ColorPlus 200', 'Colour negative · ISO 200', { temp: 14, tint: 4, contrast: -4, saturation: -10, curve: { rgb: [[0, 16], [128, 130], [255, 244]] }, grade: { hi: [48, 14, 0] } }, { grain: 22, grainSize: 26 });
  add('film', 'kodachrome-64', 'Kodachrome 64', 'Slide · ISO 64', { temp: 5, contrast: 22, saturation: 14, curve: { rgb: [[0, 0], [50, 36], [128, 128], [210, 220], [255, 250]] }, hsl: { red: [-2, 12, -6], orange: [0, 2, 0], yellow: [-8, 6, 0], green: [-10, -6, -6], blue: [4, 14, -16], aqua: [4, 6, -6] } }, { grain: 10, grainSize: 16 });
  add('film', 'ektachrome-e100', 'Ektachrome E100', 'Slide · ISO 100', { temp: -6, contrast: 16, saturation: 12, hsl: { blue: [0, 18, -4], aqua: [0, 12, 0], red: [0, 5, 0] } }, { grain: 5, grainSize: 12 });
  add('film', 'fuji-velvia-50', 'Velvia 50', 'Slide · ISO 50', { contrast: 26, saturation: 34, blacks: -6, curve: { rgb: [[0, 2], [64, 53], [192, 208], [255, 255]] }, hsl: { blue: [4, 20, -16], green: [6, 16, -10], red: [-4, 14, -6], magenta: [-6, 16, 0] } }, { vignette: -12 });
  add('film', 'fuji-superia-400', 'Superia 400', 'Colour negative · ISO 400', { temp: -3, contrast: 10, saturation: 8, hsl: { green: [8, 12, 0] }, grade: { sh: [150, 10, 0], hi: [330, 5, 0] } }, { grain: 20, grainSize: 22, grainColor: 25 });
  add('film', 'fuji-pro-400h', 'Pro 400H', 'Colour negative · ISO 400', { exposure: 0.2, contrast: -16, saturation: -10, highlights: -12, shadows: 12, temp: -6, hsl: { green: [20, -6, 4], blue: [-8, -12, 10], orange: [0, -10, 5] }, grade: { sh: [180, 10, 0] } }, { grain: 14, grainSize: 20 });
  add('film', 'fuji-c200', 'Fujicolor C200', 'Colour negative · ISO 200', { temp: -4, contrast: 4, saturation: -4, hsl: { green: [12, 0, 0] }, curve: { rgb: [[0, 12], [255, 248]] } }, { grain: 22, grainSize: 24 });
  add('film', 'cinestill-800t', 'CineStill 800T', 'Tungsten · halation', { temp: -20, tint: -4, contrast: 6, saturation: -4, hsl: { red: [6, 0, 0] }, grade: { sh: [195, 20, 0], hi: [30, 12, 0] } }, { halation: 60, grain: 24, grainSize: 26, grainColor: 20 });
  add('film', 'cinestill-50d', 'CineStill 50D', 'Daylight · halation', { temp: -2, contrast: 6, saturation: 6 }, { halation: 30, grain: 6, grainSize: 14 });
  add('film', 'lomo-800', 'Lomo 800', 'Colour negative · ISO 800', { temp: 6, contrast: 24, saturation: 26 }, { vignette: -26, grain: 28, grainSize: 28 });
  add('film', 'kodak-tri-x-400', 'Tri-X 400', 'B&W · ISO 400', { mono: 1, contrast: 24, clarity: 12, curve: { rgb: [[0, 2], [64, 51], [192, 214], [255, 255]] }, bwmix: { red: 8, blue: -8 } }, { grain: 36, grainSize: 28, grainRough: 62 });
  add('film', 'ilford-hp5', 'HP5 Plus', 'B&W · ISO 400', { mono: 1, contrast: 12 }, { grain: 30, grainSize: 26, grainRough: 50 });
  add('film', 'ilford-delta-3200', 'Delta 3200', 'B&W · ISO 3200', { mono: 1, contrast: 4, blacks: 10, curve: { rgb: [[0, 18], [255, 244]] } }, { grain: 62, grainSize: 42, grainRough: 60 });

  const pola = { contrast: -18, saturation: -10, texture: -18, curve: { rgb: [[0, 28], [64, 74], [128, 130], [200, 196], [255, 232]], r: [[0, 2], [80, 79], [255, 255]], g: [[0, 6], [128, 129], [255, 252]], b: [[0, 8], [128, 125], [255, 236]] }, grade: { sh: [180, 10, 0], hi: [40, 9, 0] }, hsl: { orange: [-4, 0, 2] } };
  add('instant', 'polaroid-600', 'Polaroid 600', 'Integral film', pola, { diffusion: 14, vignette: -14, grain: 10 }, { frame: 'polaroid' });
  add('instant', 'polaroid-sx70', 'SX-70', 'Dreamy, warm', { temp: 12, contrast: -26, saturation: -26, curve: { rgb: [[0, 34], [128, 134], [255, 228]] }, grade: { hi: [44, 20, 0], sh: [20, 12, 0] } }, { diffusion: 26, vignette: -18, grain: 12 }, { frame: 'polaroid' });
  add('instant', 'polaroid-expired', 'Expired Polaroid', 'Colour shifts, dust', { tint: 12, contrast: -20, saturation: -20, curve: { rgb: [[0, 26], [128, 130], [255, 232]] }, grade: { sh: [200, 22, 0], hi: [330, 16, 0] } }, { dust: 22, leak: 16, leakHue: 340, vignette: -20, grain: 14 }, { frame: 'polaroid' });
  add('instant', 'polaroid-bw', 'Polaroid B&W', 'Integral monochrome', { mono: 1, contrast: -6, curve: { rgb: [[0, 24], [255, 236]] }, grade: { gl: [40, 6, 0] } }, { grain: 14, vignette: -12 }, { frame: 'polaroid' });
  add('instant', 'instax-mini', 'Instax Mini', 'Bright, punchy', { exposure: 0.2, contrast: 12, saturation: 6, temp: -4, highlights: 10 }, { vignette: -10 }, { frame: 'instaxMini' });
  add('instant', 'instax-wide', 'Instax Wide', 'Bright, punchy', { exposure: 0.15, contrast: 12, saturation: 6, temp: -3, highlights: 8 }, { vignette: -10 }, { frame: 'instaxWide' });

  add('vintage', 'print-1960s', '1960s Print', 'Faded magenta-yellow', { temp: 12, tint: 7, contrast: -18, saturation: -30, curve: { rgb: [[0, 34], [128, 132], [255, 226]], b: [[0, 0], [255, 222]], r: [[0, 14], [255, 255]] }, grade: { hi: [40, 24, 0] } }, { dust: 24, grain: 18, vignette: -20 });
  add('vintage', 'slide-1970s', '1970s Slide', 'Warm, rich reds', { temp: 10, contrast: 10, saturation: 6, grade: { hi: [30, 16, 0], sh: [350, 10, 0] } }, { grain: 14, vignette: -15 });
  add('vintage', 'album-1984', 'Album Print ’84', 'Yellowed album print', { temp: 12, contrast: -10, saturation: -14, curve: { rgb: [[0, 22], [255, 240]] }, grade: { hi: [45, 14, 0], sh: [20, 8, 0] } }, { dust: 10, grain: 12, vignette: -10 });
  add('vintage', 'sepia-print', 'Sepia Print', 'Toned silver print', { mono: 1, contrast: -6, grade: { gl: [32, 36, 0], sh: [20, 20, 0] }, curve: { rgb: [[0, 24], [255, 232]] } }, { dust: 18, vignette: -24, grain: 14 });
  add('vintage', 'cyanotype', 'Cyanotype', 'Prussian blue print', { mono: 1, contrast: 12, grade: { sh: [210, 70, 0], mi: [205, 40, 0], hi: [200, 14, 0] }, curve: { rgb: [[0, 20], [255, 245]] } }, { grain: 10, dust: 8 });
  add('vintage', 'tintype', 'Tintype', 'Wet plate', { mono: 1, contrast: 30, clarity: 10, grade: { gl: [30, 14, 0] }, curve: { rgb: [[0, 6], [128, 110], [255, 230]] } }, { vignette: -48, vigMid: 40, diffusion: 12, dust: 20, grain: 18 });
  add('vintage', 'cross-process', 'Cross Process', 'Slide film in C-41', { contrast: 28, saturation: 22, curve: { r: [[0, 0], [64, 42], [192, 222], [255, 255]], g: [[0, 0], [128, 142], [255, 255]], b: [[0, 44], [128, 112], [255, 200]] } }, { grain: 14, vignette: -12 });
  add('vintage', 'expired-film', 'Expired Film', 'Shifted, grainy', { tint: -8, contrast: -12, saturation: -20, curve: { rgb: [[0, 24], [255, 238]] }, grade: { sh: [160, 16, 0], hi: [330, 10, 0] } }, { grain: 30, grainSize: 30, leak: 20, dust: 10 });

  add('nostalgic', 'disposable-flash', 'Disposable Flash', 'Hard flash, date stamp', { exposure: 0.1, contrast: 18, saturation: 10, temp: 4, highlights: 12 }, { vignette: -36, vigMid: 35, ca: 22, grain: 22, grainSize: 24, halation: 10 }, { stamp: 'film' });
  add('nostalgic', 'ccd-digicam', 'CCD Digicam ’04', 'Y2K compact', { temp: -8, tint: 4, contrast: 14, saturation: 12, sharpen: 45, highlights: 15, whites: 15 }, { ca: 10, grain: 12, grainSize: 10, grainColor: 70 }, { stamp: 'digital' });
  add('nostalgic', 'camcorder', 'Camcorder', 'VHS tape', { saturation: -10, contrast: 6, temp: -3 }, { scanlines: 45, tracking: 24, bleed: 42, diffusion: 18, grain: 10, grainColor: 50 }, { stamp: 'camcorder' });
  add('nostalgic', 'webcam-06', 'Webcam ’06', 'Low-light webcam', { tint: -10, temp: -5, contrast: 12, saturation: -10 }, { diffusion: 22, grain: 26, grainSize: 14, grainColor: 80, ca: 8 });
  add('nostalgic', 'summer-99', 'Summer ’99', 'Light leak, warm', { temp: 14, saturation: 8, curve: { rgb: [[0, 20], [128, 136], [255, 248]] }, hsl: { red: [0, 8, 0], orange: [0, 10, 0] } }, { leak: 34, leakHue: 24, leakPos: 10, grain: 18, halation: 12 });
  add('nostalgic', 'point-and-shoot', 'Point & Shoot', '35mm compact', { temp: 8, contrast: 10, saturation: 4 }, { grain: 22, grainSize: 24, vignette: -20 });
  add('nostalgic', 'mall-portrait-90s', '90s Mall Portrait', 'Soft focus, white vignette', { temp: 6, tint: 6, contrast: -10, saturation: -6, curve: { rgb: [[0, 18], [255, 250]] } }, { diffusion: 46, vignette: 32, vigMid: 45, vigRound: 100 });
  add('nostalgic', 'late-night', 'Late Night', 'City glow', { temp: -10, tint: 6, contrast: 14, saturation: 6, grade: { sh: [230, 18, 0], hi: [320, 8, 0] } }, { halation: 28, grain: 26, bloom: 14 });

  add('cinematic', 'teal-orange', 'Teal & Orange', 'Blockbuster grade', { contrast: 12, grade: { sh: [190, 34, 0], hi: [35, 28, 0] }, hsl: { orange: [0, 10, 0], blue: [-20, 0, 0], aqua: [0, 10, 0] } });
  add('cinematic', 'bleach-bypass', 'Bleach Bypass', 'Silver retained', { saturation: -50, contrast: 34, clarity: 20 });
  add('cinematic', 'tungsten-night', 'Tungsten Night', 'Blue night, red glow', { temp: -26, contrast: 8, grade: { sh: [210, 12, 0] } }, { halation: 40, grain: 16 });
  add('cinematic', 'cinema-print', 'Cinema Print', 'Print film emulation', { contrast: 20, saturation: -5, blacks: -8, curve: { rgb: [[0, 4], [64, 56], [192, 204], [255, 246]] }, grade: { sh: [185, 22, 0], hi: [40, 14, 0] } }, { grain: 10, vignette: -10 });
  add('cinematic', 'vision3-500t', 'Vision3 500T', 'Motion picture negative', { temp: -6, contrast: -4, saturation: -6, grade: { sh: [195, 14, 0], hi: [35, 8, 0] } }, { halation: 22, grain: 18, grainSize: 24 });

  D.LOOKS = L;
  const byId = {}; L.forEach((l) => { byId[l.id] = l; });
  D.custom = {};
  D.lookById = (id) => byId[id] || D.custom[id] || null;
})();
