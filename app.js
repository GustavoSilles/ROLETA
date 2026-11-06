'use strict';

/* =========================================================
   A roleta
   - O resultado é sorteado ANTES do giro; a animação (inclusive
     as pegadinhas) é só teatro que termina exatamente nele.
   ========================================================= */

const TAU = Math.PI * 2;
const STORAGE_KEY = 'roleta-cinema-v1'; // nome antigo mantido pra não perder os dados salvos
const MAX_OPTIONS = 100;

// Ordem pensada pra cores vizinhas contrastarem (e nenhuma brigar com o dourado do "Tudo")
const PALETTE = ['#e63946', '#2a9d8f', '#7b4bc4', '#2f7fd1', '#e76f51', '#06a77d', '#d63a8a', '#118ab2', '#5f9e1c', '#b5532a'];
const CONFETTI_COLORS = ['#ffcc4d', '#ff4d6d', '#4dd6ff', '#7cff6b', '#c77dff', '#ffffff', '#ff9f1c'];

// Fatias especiais: não ficam na lista de opções, são ligadas/desligadas nas chaves do painel
const SPECIALS = {
  // (ids e tipos internos continuam os antigos pra não perder o que já está salvo)
  todos: { id: '__todos', name: 'Tudo', type: 'todos', color: '#ffc93c' },
  nenhum: { id: '__nenhum', name: 'Nada', type: 'nenhum', color: '#3b3b4f' },
  // caiu nela: a roleta gira de novo sozinha (nunca é eliminada)
  again: { id: '__again', name: 'Gira de novo', type: 'again', color: '#1f8a99' },
};

// Linhas de uma lista colada que ligam uma fatia especial em vez de virar opção comum
const SPECIAL_ALIASES = {
  'TUDO': 'includeAll', 'TODAS': 'includeAll', 'TODOS': 'includeAll',
  'NADA': 'includeNone', 'NENHUM': 'includeNone', 'NENHUMA': 'includeNone',
  'GIRA DE NOVO': 'includeAgain', 'GIRAR DE NOVO': 'includeAgain', 'GIRE DE NOVO': 'includeAgain',
};

/* =========================================================
   Ícones (SVG de traço, desenhados à mão num grid 24x24)
   Usam currentColor, então pegam a cor do texto onde estão.
   ========================================================= */
const ICONS = {
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2c1.8.9 3 2.9 3 5.8"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/><path d="M12 7.5V12l3 2"/>',
  undo: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4.5h4.5"/>',
  volume: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  mute: '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.3 2.9 7.9 7 9.5 4.1-1.6 7-5.2 7-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  scissors: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.2 8.2 20 20M8.2 15.8 20 4"/>',
  trophy: '<path d="M8 21h8M12 16.5V21M7 3.5h10V9a5 5 0 0 1-10 0z"/><path d="M7 5.5H4.5a3 3 0 0 0 3 4.4M17 5.5h2.5a3 3 0 0 1-3 4.4"/>',
  star: '<path d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z"/>',
  // barra lateral com setinha (abrir → / fechar ←)
  panelOpen: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/><path d="m13.5 9.5 2.5 2.5-2.5 2.5"/>',
  panelClose: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/><path d="m16 9.5-2.5 2.5 2.5 2.5"/>',
};

function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

// Troca os <i data-icon="nome"></i> do HTML pelos SVGs
function hydrateIcons(root = document) {
  root.querySelectorAll('i[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon, el.className);
  });
}

/* Ilustrações animadas do cartão de resultado (a animação fica no CSS) */

// Mini-roleta de 8 gomos usada pelo Tudo e pelo Nada (a diferença é só a animação no CSS)
function miniWheel(cls) {
  const r = 46;
  const p = (a) => `${(60 + Math.cos(a) * r).toFixed(1)} ${(60 + Math.sin(a) * r).toFixed(1)}`;
  const segs = Array.from({ length: 8 }, (_, i) => {
    const a0 = (i / 8) * TAU - Math.PI / 2;
    const a1 = ((i + 1) / 8) * TAU - Math.PI / 2;
    return `<path class="seg" style="--i:${i}" fill="${PALETTE[i]}" d="M60 60L${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}z"/>`;
  }).join('');
  return `<svg class="art ${cls}" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="ghost" cx="60" cy="60" r="46"/>
      <g class="mini">${segs}</g>
      <circle class="rim" cx="60" cy="60" r="48"/>
      <circle class="hub" cx="60" cy="60" r="7"/>
    </svg>`;
}

const ART = {
  // "Tudo": gomos acendendo em sequência
  todos: miniWheel('art-todos'),
  // "Nada": gomos apagando um a um até a roleta ficar vazia (e voltando)
  nenhum: miniWheel('art-nenhum'),
  // estrela que "estoura" com faíscas
  normal: `<svg class="art art-normal" viewBox="0 0 120 120" aria-hidden="true">
      <g class="sparks">${Array.from({ length: 8 }, (_, i) =>
        `<path d="M60 26V12" transform="rotate(${i * 45 + 22.5} 60 60)"/>`).join('')}</g>
      <path class="core" d="m60 30 8.6 17.6 19.4 2.8-14 13.7 3.3 19.3L60 74.3 42.7 83.4 46 64.1 32 50.4l19.4-2.8z"/>
    </svg>`,
  // troféu com brilho
  winner: `<svg class="art art-winner" viewBox="0 0 120 120" aria-hidden="true">
      <path class="cup" d="M40 24h40v22a20 20 0 0 1-40 0zM40 30H28a12 12 0 0 0 14 17M80 30h12a12 12 0 0 1-14 17M60 66v16M46 96h28M50 82h20l2 14H48z"/>
      <path class="shine" d="M50 30v14"/>
      <circle class="glint g1" cx="90" cy="18" r="3"/><circle class="glint g2" cx="24" cy="62" r="2.5"/>
    </svg>`,
  // tesoura cortando (as lâminas abrem e fecham em volta do pino)
  elim: `<svg class="art art-elim" viewBox="0 0 120 120" aria-hidden="true">
      <g class="blade a"><circle cx="34" cy="34" r="13"/><path d="M44 44 98 98"/></g>
      <g class="blade b"><circle cx="34" cy="86" r="13"/><path d="M44 76 98 22"/></g>
      <circle class="pin" cx="60" cy="60" r="3"/>
    </svg>`,
};


/* ---------- Utilidades ---------- */
const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
// até `max` itens sorteados de uma lista (sem repetir)
const sampleOf = (arr, max) => {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, max);
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ease = {
  linear: (t) => t,
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

/* =========================================================
   Estado
   ========================================================= */
// Primeira visita: roleta vazia (sem opções e sem as fatias TUDO/NADA)
function defaults() {
  return {
    options: [],
    eliminated: [],
    settings: { trickChance: 35, elimination: false, sound: true, includeAll: false, includeNone: false, includeAgain: false },
    players: [],
    history: [],
  };
}

// Dados salvos pela versão antiga tinham "Ver TODOS"/"Ver NENHUM" como opções com tipo.
// Converte: tira essas opções da lista e liga a chave correspondente.
function migrate(s) {
  s.settings = s.settings || {};
  const hadAll = s.options.some((o) => o.type === 'todos');
  const hadNone = s.options.some((o) => o.type === 'nenhum');
  const legacy = s.options.filter((o) => o.type === 'todos' || o.type === 'nenhum').map((o) => o.id);
  if (s.settings.includeAll === undefined) s.settings.includeAll = hadAll;
  if (s.settings.includeNone === undefined) s.settings.includeNone = hadNone;
  s.options = s.options.filter((o) => !legacy.includes(o.id)).map(({ id, name }) => ({ id, name }));
  s.eliminated = (s.eliminated || []).filter((id) => !legacy.includes(id));
  s.history = (s.history || []).map(({ trick, ...h }) => h); // histórico não guarda mais a pegadinha
  return s;
}

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s && Array.isArray(s.options)) {
      const d = defaults();
      migrate(s);
      return { ...d, ...s, settings: { ...d.settings, ...s.settings } };
    }
  } catch (e) { /* ignora dados corrompidos */ }
  return defaults();
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* sem storage */ }
}

let state = load();

// Estado de execução (não salvo)
const rt = {
  rotation: 0,
  lastRot: 0,
  lastIdx: null,
  lastN: 0,
  spinning: false,
  wobble: 0,
  wobbleVel: 0,
  highlightId: null,
  overlayOpen: false,
  currentResult: null,
  // trapaça
  cheatTarget: null,
  tChoosing: false, // escolhendo a opção da trapaça (T apertado)
  cheatArmedUntil: 0,
  blockClickUntil: 0,
  taps: [],
  // arrastar
  dragging: false,
  dragAngle: 0,
  dragSamples: [],
  dragMoved: 0,
};

// Tudo o que vai na roleta: as opções da lista + as fatias especiais que estiverem ligadas
function wheelOptions() {
  const list = state.options.slice();
  if (state.settings.includeAll) list.push(SPECIALS.todos);
  if (state.settings.includeNone) list.push(SPECIALS.nenhum);
  if (state.settings.includeAgain) list.push(SPECIALS.again);
  return list;
}
const activeOptions = () => wheelOptions().filter((o) => !state.eliminated.includes(o.id));

function colorFor(opt) {
  if (opt.type) return SPECIALS[opt.type].color;
  return PALETTE[Math.max(0, state.options.indexOf(opt)) % PALETTE.length];
}

const displayName = (o) => (o.name && o.name.trim()) || '(sem nome)';
const labelFor = (o) => (o.type ? displayName(o).toUpperCase() : displayName(o));

/* =========================================================
   Sons (Web Audio, tudo sintetizado)
   ========================================================= */
const sfx = {
  ctx: null,
  noiseBuf: null,
  lastClack: 0,

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  ok() { return state.settings.sound && this.ensure(); },

  tone(freq, dur, o = {}) {
    const c = this.ctx;
    const t = c.currentTime + (o.when || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    const v = o.vol ?? 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + (o.attack || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  },

  noise(dur, o = {}) {
    const c = this.ctx;
    const t = c.currentTime + (o.when || 0);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.value = o.freq || 2000;
    f.Q.value = o.q || 1;
    const g = c.createGain();
    g.gain.setValueAtTime(o.vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(c.destination);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  },

  // vol de 0 a 1: mais fraco quando a roleta passa devagar
  clack(vol = 1) {
    if (!this.ok()) return;
    const now = performance.now();
    if (now - this.lastClack < 28) return;
    this.lastClack = now;
    this.noise(0.035, { freq: 3200, q: 2, vol: 0.35 * vol });
    this.tone(1400, 0.03, { type: 'square', vol: 0.03 * vol });
  },

  fanfare(big) {
    if (!this.ok()) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, i) => this.tone(f, 0.18, { type: 'square', vol: 0.08, when: i * 0.11, filter: 3000 }));
    notes.forEach((f) => this.tone(f, big ? 1.6 : 1.0, { type: 'sawtooth', vol: 0.05, when: 0.46, filter: 2500 }));
    this.noise(1.2, { ftype: 'highpass', freq: 5000, vol: 0.25, when: 0.46 });
    if (big) {
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) =>
        this.tone(f, 0.25, { type: 'square', vol: 0.06, when: 1.0 + i * 0.1, filter: 4000 }));
      this.noise(1.4, { ftype: 'highpass', freq: 5000, vol: 0.25, when: 1.4 });
    }
  },

  // "Nada": notas descendo (espelho da cascata do "Tudo") e um "fuup" sumindo no fim
  descend(n) {
    if (!this.ok()) return;
    const scale = [1318.5, 1174.66, 1046.5, 880, 783.99, 659.25, 587.33, 523.25];
    const count = clamp(n, 3, 8);
    for (let i = 0; i < count; i++) this.tone(scale[i], 0.3, { type: 'triangle', vol: 0.08, when: i * 0.09 });
    const end = count * 0.09 + 0.05;
    this.tone(440, 0.55, { type: 'sine', vol: 0.12, slideTo: 110, when: end });
  },

  whoop(up) {
    if (!this.ok()) return;
    this.tone(up ? 300 : 900, 0.4, { type: 'triangle', vol: 0.15, slideTo: up ? 900 : 250 });
  },
  pop() {
    if (!this.ok()) return;
    this.tone(700, 0.15, { type: 'sine', vol: 0.2, slideTo: 150 });
  },
  // "toc" de madeira: a seta batendo no pino sem conseguir passar
  knock() {
    if (!this.ok()) return;
    this.tone(260, 0.09, { type: 'triangle', vol: 0.22, slideTo: 150 });
    this.noise(0.05, { ftype: 'lowpass', freq: 1200, q: 1, vol: 0.25 });
  },

  // Carga do botão: um "motor" que acelera (fica mais agudo, mais aberto e treme mais rápido)
  chargeNodes: null,
  chargeStart() {
    if (!this.ok()) return;
    const c = this.ctx;
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 110;
    const sub = c.createOscillator();
    sub.type = 'square';
    sub.frequency.value = 55;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    f.Q.value = 6;
    // tremolo: um LFO balança o volume, e acelera conforme a força
    const trem = c.createGain();
    trem.gain.value = 1;
    const lfo = c.createOscillator();
    lfo.frequency.value = 6;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    lfo.connect(depth).connect(trem.gain);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.12);
    osc.connect(f);
    sub.connect(f);
    f.connect(trem).connect(g).connect(c.destination);
    osc.start(t);
    sub.start(t);
    lfo.start(t);
    this.chargeNodes = { osc, sub, f, lfo, g };
  },
  chargeUpdate(lvl) {
    const n = this.chargeNodes;
    if (!n) return;
    const t = this.ctx.currentTime;
    n.osc.frequency.setTargetAtTime(110 + lvl * 440, t, 0.05);
    n.sub.frequency.setTargetAtTime(55 + lvl * 220, t, 0.05);
    n.f.frequency.setTargetAtTime(500 + lvl * 3500, t, 0.05);
    n.lfo.frequency.setTargetAtTime(6 + lvl * 18, t, 0.05);
    n.g.gain.setTargetAtTime(0.05 + lvl * 0.06, t, 0.05);
  },
  chargeMax() {
    if (!this.ok()) return;
    this.tone(1568, 0.35, { type: 'sine', vol: 0.12 });
    this.tone(2093, 0.45, { type: 'sine', vol: 0.1, when: 0.07 });
  },
  chargeStop(released, lvl = 0) {
    const n = this.chargeNodes;
    this.chargeNodes = null;
    if (n) {
      const t = this.ctx.currentTime;
      n.g.gain.cancelScheduledValues(t);
      n.g.gain.setTargetAtTime(0.0001, t, 0.03);
      for (const o of [n.osc, n.sub, n.lfo]) o.stop(t + 0.25);
    }
    // "whoosh" ao soltar: ruído com filtro varrendo do grave pro agudo, mais alto quanto mais força
    if (released && this.ok()) {
      const c = this.ctx;
      const t = c.currentTime;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(300, t);
      bp.frequency.exponentialRampToValueAtTime(2800, t + 0.45);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12 + lvl * 0.3, t + 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      src.connect(bp).connect(g).connect(c.destination);
      src.start(t);
      src.stop(t + 0.55);
    }
  },

  // "Tudo": cascata de notas subindo (uma por opção, de 3 a 8) e um acorde no fim
  cascade(n) {
    if (!this.ok()) return;
    const scale = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];
    const count = clamp(n, 3, 8);
    for (let i = 0; i < count; i++) this.tone(scale[i], 0.35, { type: 'triangle', vol: 0.09, when: i * 0.09 });
    const end = count * 0.09 + 0.05;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => this.tone(f, 1.1, { type: 'triangle', vol: 0.06, when: end }));
    this.noise(0.6, { ftype: 'highpass', freq: 6000, vol: 0.08, when: end });
  },

  // fogos: assobio subindo + estouro grave com estalinhos depois
  launch() {
    if (!this.ok()) return;
    this.tone(500, 0.7, { type: 'sine', vol: 0.025, slideTo: 1400 });
  },
  boom() {
    if (!this.ok()) return;
    this.noise(0.5, { ftype: 'lowpass', freq: 500, q: 0.7, vol: 0.35 });
    for (let i = 0; i < 6; i++) this.noise(0.03, { freq: 4000, q: 3, vol: 0.08, when: 0.25 + Math.random() * 0.6 });
  },
};

/* =========================================================
   Efeitos (confete, fogos de artifício, chuva)
   ========================================================= */
const FW_COLORS = ['#ffd36b', '#ff5d7a', '#5ee0ff', '#a6ff6b', '#c99bff', '#ffffff', '#ffa04d'];

const fx = {
  c: $('#fx'),
  ctx: null,
  w: 0,
  h: 0,
  parts: [],
  launches: [], // fogos agendados: { at, x, ty, color, color2, shape }
  drewLastFrame: false,

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.c.width = this.w * dpr;
    this.c.height = this.h * dpr;
    this.ctx = this.c.getContext('2d');
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  confetti(n) {
    for (let i = 0; i < n; i++) {
      const fromTop = i % 3 === 0;
      this.parts.push({
        kind: 'conf',
        x: fromTop ? rand(0, this.w) : this.w / 2 + rand(-60, 60),
        y: fromTop ? rand(-200, -10) : this.h * 0.5,
        vx: fromTop ? rand(-2, 2) : rand(-15, 15),
        vy: fromTop ? rand(0, 3) : rand(-22, -6),
        w: rand(6, 11),
        h: rand(8, 16),
        rot: rand(0, TAU),
        vr: rand(-0.3, 0.3),
        color: pick(CONFETTI_COLORS),
      });
    }
  },

  // Agenda n fogos espalhados ao longo de `spanMs`
  fireworks(n, spanMs) {
    const now = performance.now();
    for (let i = 0; i < n; i++) {
      const color = pick(FW_COLORS);
      this.launches.push({
        at: now + (i * spanMs) / n + rand(0, 180),
        x: this.w * rand(0.12, 0.88),
        ty: this.h * rand(0.12, 0.42),
        color,
        color2: Math.random() < 0.4 ? pick(FW_COLORS) : color,
        shape: pick(['ball', 'ball', 'ring', 'willow']),
      });
    }
  },

  // "Tudo": etiquetas com o nome de cada opção saem voando da borda da roleta
  // (círculo de raio `radius` em volta de ox, oy), pra fora, em 3 ondas
  burst(items, ox, oy, radius = 0) {
    if (!items.length) return;
    // com muitas opções, sorteia algumas: no máximo 12 etiquetas por onda (36 no total)
    const sprites = sampleOf(items, 18).map(({ text, color }) => this.pillSprite(text, color));
    const perWave = clamp(items.length * 3, 10, 12);
    for (let w = 0; w < 3; w++) {
      setTimeout(() => {
        for (let i = 0; i < perWave; i++) {
          const a = rand(0, TAU);
          const sp = rand(6, 15);
          this.parts.push({
            kind: 'pill', x: ox + Math.cos(a) * radius, y: oy + Math.sin(a) * radius,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 4,
            rot: rand(-0.4, 0.4), vr: rand(-0.06, 0.06),
            s: sprites[(i + w) % sprites.length],
          });
        }
      }, w * 380);
    }
  },

  // "Nada": o contrário do burst. As etiquetas aparecem longe, em volta da roleta, e são
  // puxadas pra dentro dela, acelerando, girando, encolhendo e sumindo na borda (raio `radius`)
  implode(items, ox, oy, radius) {
    if (!items.length) return;
    // com muitas opções, sorteia algumas: no máximo 10 etiquetas por onda (30 no total)
    const sprites = sampleOf(items, 15).map(({ text, color }) => this.pillSprite(text, color));
    const perWave = clamp(items.length * 3, 8, 10);
    for (let w = 0; w < 3; w++) {
      setTimeout(() => {
        for (let i = 0; i < perWave; i++) {
          const a = rand(0, TAU);
          // nasce um pouco fora da roleta, mas sempre dentro da tela
          let d = radius * rand(1.25, 1.85);
          const maxX = Math.abs(Math.cos(a)) > 0.01 ? (Math.cos(a) > 0 ? this.w - 30 - ox : ox - 30) / Math.abs(Math.cos(a)) : Infinity;
          const maxY = Math.abs(Math.sin(a)) > 0.01 ? (Math.sin(a) > 0 ? this.h - 20 - oy : oy - 20) / Math.abs(Math.sin(a)) : Infinity;
          d = Math.max(radius * 1.1, Math.min(d, maxX, maxY));
          this.parts.push({
            kind: 'sink', ox, oy, radius, d0: d,
            x: ox + Math.cos(a) * d, y: oy + Math.sin(a) * d,
            rot: rand(-0.5, 0.5), vr: rand(-0.04, 0.04),
            pull: rand(0.006, 0.011), scale: 1, age: 0,
            s: sprites[(i + w) % sprites.length],
          });
        }
      }, w * 380);
    }
  },

  // Etiqueta pré-desenhada (texto em canvas é barato, mas assim fica mais barato ainda)
  pillSprite(text, color) {
    const dpr = window.devicePixelRatio || 1;
    const fs = 15;
    const h = 30;
    const font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`;
    const meas = document.createElement('canvas').getContext('2d');
    meas.font = font;
    const label = text.length > 22 ? text.slice(0, 21) + '…' : text;
    const w = Math.ceil(meas.measureText(label).width + 26);
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((w + 4) * dpr);
    cv.height = Math.ceil((h + 4) * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    c.translate(2, 2);
    c.beginPath();
    c.roundRect(0, 0, w, h, h / 2);
    c.fillStyle = color;
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = 'rgba(255,255,255,.4)';
    c.stroke();
    c.font = font;
    c.fillStyle = '#fff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,.35)';
    c.shadowBlur = 2;
    c.fillText(label, w / 2, h / 2 + 1);
    return { cv, w: w + 4, h: h + 4 };
  },

  explode(r) {
    const n = r.shape === 'ring' ? 56 : r.shape === 'willow' ? 70 : 84;
    const base = Math.min(this.w, this.h) / 95; // tamanho do estouro acompanha a tela
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r.shape === 'ring' ? 0 : rand(-0.1, 0.1));
      const sp = r.shape === 'ring' ? base * 0.75 : base * rand(0.25, 0.95);
      this.parts.push({
        kind: 'spark',
        x: r.x, y: r.y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1,
        decay: r.shape === 'willow' ? rand(0.006, 0.009) : rand(0.011, 0.017),
        grav: r.shape === 'willow' ? 0.07 : 0.045,
        color: i % 2 ? r.color : r.color2,
      });
    }
    this.parts.push({ kind: 'flash', x: r.x, y: r.y, life: 1, color: r.color });
    sfx.boom();
  },

  update(k, now) {

    // lança os fogos que chegaram na hora
    if (this.launches.length) {
      const due = this.launches.filter((l) => l.at <= now);
      this.launches = this.launches.filter((l) => l.at > now);
      for (const l of due) {
        const g = 0.22;
        this.parts.push({
          kind: 'rocket', x: l.x, y: this.h + 10, vx: rand(-0.6, 0.6),
          vy: -Math.sqrt(2 * g * (this.h + 10 - l.ty)), g, ...l,
        });
        sfx.launch();
      }
    }

    for (const p of this.parts) {
      switch (p.kind) {
        case 'conf':
          p.vy = Math.min(p.vy + 0.45 * k, 6);
          p.vx *= Math.pow(0.985, k);
          p.x += (p.vx + Math.sin(p.rot) * 0.6) * k;
          p.y += p.vy * k;
          p.rot += p.vr * k;
          break;
        case 'pill':
          p.vy = Math.min(p.vy + 0.32 * k, 9);
          p.vx *= Math.pow(0.99, k);
          p.x += p.vx * k;
          p.y += p.vy * k;
          p.rot += p.vr * k;
          break;
        case 'sink': {
          // anda uma fração da distância até o centro, e essa fração vai aumentando (acelera)
          p.age += k;
          p.pull = Math.min(0.2, p.pull * Math.pow(1.035, k));
          const f = Math.min(1, p.pull * k);
          p.x += (p.ox - p.x) * f;
          p.y += (p.oy - p.y) * f;
          const dist = Math.hypot(p.x - p.ox, p.y - p.oy);
          // tamanho cheio no caminho; só encolhe na reta final, sumindo na borda da roleta
          p.scale = clamp((dist - p.radius) / (p.radius * 0.35), 0, 1);
          p.rot += p.vr * k * (1 + (1 - p.scale) * 8); // rodopia ao ser engolida
          if (p.scale <= 0.02) p.dead = true;
          break;
        }
        case 'rocket':
          p.vy += p.g * k;
          p.x += p.vx * k;
          p.y += p.vy * k;
          if (p.vy >= -0.6) { this.explode(p); p.dead = true; }
          break;
        case 'spark': {
          const drag = Math.pow(0.955, k);
          p.vx *= drag;
          p.vy = p.vy * drag + p.grav * k;
          p.x += p.vx * k;
          p.y += p.vy * k;
          p.life -= p.decay * k;
          if (p.life <= 0) p.dead = true;
          break;
        }
        case 'flash':
          p.life -= 0.12 * k;
          if (p.life <= 0) p.dead = true;
          break;
        default: // chuva
          p.x += p.vx * k;
          p.y += p.vy * k;
      }
    }
    this.parts = this.parts.filter((p) => !p.dead && p.y < this.h + 80);
    if (this.parts.length > 2000) this.parts.splice(0, this.parts.length - 2000);
  },

  draw() {
    const c = this.ctx;
    if (!this.parts.length) {
      // nada na tela: limpa uma última vez e para de mexer no canvas
      if (this.drewLastFrame) c.clearRect(0, 0, this.w, this.h);
      this.drewLastFrame = false;
      return;
    }
    this.drewLastFrame = true;
    const dpr = window.devicePixelRatio || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, this.w, this.h);

    // confete e etiquetas: posiciona cada um direto (sem save/restore)
    for (const p of this.parts) {
      if (p.kind !== 'conf' && p.kind !== 'pill' && p.kind !== 'sink') continue;
      const sc = p.kind === 'sink' ? p.scale : 1; // etiqueta sendo sugada encolhe
      const cos = Math.cos(p.rot) * dpr * sc;
      const sin = Math.sin(p.rot) * dpr * sc;
      c.setTransform(cos, sin, -sin, cos, p.x * dpr, p.y * dpr);
      if (p.kind !== 'conf') {
        // a etiqueta sugada surge suave (age) e some junto com o tamanho (scale)
        c.globalAlpha = p.kind === 'sink' ? Math.min(1, p.scale * 1.6, p.age / 10) : 1;
        c.drawImage(p.s.cv, -p.s.w / 2, -p.s.h / 2, p.s.w, p.s.h);
        c.globalAlpha = 1;
      } else {
        c.fillStyle = p.color;
        c.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot * 1.3)) + 1);
      }
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // fogos: modo "lighter" faz as luzes somarem e brilharem onde se cruzam
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (const p of this.parts) {
      if (p.kind === 'rocket') {
        c.globalAlpha = 1;
        c.strokeStyle = '#ffe9b0';
        c.lineWidth = 2.5;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 3, p.y - p.vy * 3);
        c.stroke();
      } else if (p.kind === 'spark') {
        // no fim da vida, as faíscas piscam (efeito de "crepitar")
        c.globalAlpha = p.life < 0.3 ? (Math.random() < 0.5 ? p.life * 2 : 0.1) : Math.min(1, p.life * 1.4);
        c.strokeStyle = p.color;
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x - p.vx * 2.2, p.y - p.vy * 2.2);
        c.stroke();
      } else if (p.kind === 'flash') {
        c.globalAlpha = p.life * 0.6;
        c.fillStyle = p.color;
        c.beginPath();
        c.arc(p.x, p.y, 30 * (1.4 - p.life), 0, TAU);
        c.fill();
      }
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  },
};

/* =========================================================
   Desenho da roleta
   ========================================================= */
const wheel = $('#wheel');
const wctx = wheel.getContext('2d');
let W = 0;

function resizeWheel() {
  const size = $('#wheelWrap').clientWidth;
  if (!size) return;
  const dpr = window.devicePixelRatio || 1;
  wheel.width = size * dpr;
  wheel.height = size * dpr;
  wheel.style.width = size + 'px';
  wheel.style.height = size + 'px';
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  W = size;
  buildWheelCache();
}

const HUB_RATIO = 0.1; // raio do pino central em relação ao raio da roleta
const BULBS = 24;      // lâmpadas no aro

/* ---------- Peças fixas pré-desenhadas ----------
   O aro de madeira (com veios, nós e relevo) e o pino de latão das divisórias não mudam
   de um quadro pro outro: são desenhados uma vez em canvases separados e só "carimbados". */
const wheelCache = { rim: null, peg: null, pegSize: 0, pegR: 0 };

function buildWheelCache() {
  const dpr = window.devicePixelRatio || 1;
  const { m, R } = geom();
  const rimR = R + m * 0.55;
  const depth = rimR - R;

  // números "aleatórios" com semente fixa: os veios saem sempre iguais
  let seed = 20251105;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.round(W * dpr);
  const c = cv.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, (W / 2) * dpr, (W / 2) * dpr);
  const ring = () => {
    c.beginPath();
    c.arc(0, 0, rimR, 0, TAU);
    c.arc(0, 0, R - 1, 0, TAU, true);
  };

  // base: madeira média, mais escura nas bordas
  const base = c.createRadialGradient(0, 0, R, 0, 0, rimR);
  base.addColorStop(0, '#4e2810');
  base.addColorStop(0.45, '#8a5226');
  base.addColorStop(0.8, '#7a4520');
  base.addColorStop(1, '#4a2510');
  ring();
  c.fillStyle = base;
  c.fill();

  c.save();
  ring();
  c.clip();

  // veios: anéis ondulados, uns escuros e uns claros
  for (let k = 0; k < 80; k++) {
    const r = R + depth * rnd();
    const amp = 0.4 + rnd() * 1.8;
    const f1 = 3 + Math.floor(rnd() * 6);
    const f2 = 9 + Math.floor(rnd() * 10);
    const p1 = rnd() * TAU;
    const p2 = rnd() * TAU;
    c.beginPath();
    const steps = 360;
    for (let s = 0; s <= steps; s++) {
      const a = (s / steps) * TAU;
      const rr = r + Math.sin(a * f1 + p1) * amp + Math.sin(a * f2 + p2) * amp * 0.35;
      if (s === 0) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    const dark = rnd() < 0.65;
    c.strokeStyle = dark ? `rgba(40,16,4,${0.12 + rnd() * 0.3})` : `rgba(235,175,110,${0.06 + rnd() * 0.14})`;
    c.lineWidth = 0.5 + rnd() * 1.6;
    c.stroke();
  }

  // nós da madeira
  for (let k = 0; k < 4; k++) {
    const a = rnd() * TAU;
    const r = R + depth * (0.3 + rnd() * 0.4);
    c.save();
    c.translate(Math.cos(a) * r, Math.sin(a) * r);
    c.rotate(a + Math.PI / 2);
    for (let j = 3; j >= 1; j--) {
      c.beginPath();
      c.ellipse(0, 0, depth * 0.11 * j, depth * 0.045 * j, 0, 0, TAU);
      c.strokeStyle = `rgba(35,14,3,${0.18 + 0.1 * (3 - j)})`;
      c.lineWidth = 1;
      c.stroke();
    }
    c.beginPath();
    c.ellipse(0, 0, depth * 0.07, depth * 0.03, 0, 0, TAU);
    c.fillStyle = 'rgba(35,14,3,.55)';
    c.fill();
    c.restore();
  }

  // luz vindo de cima/esquerda
  const light = c.createLinearGradient(-rimR, -rimR, rimR, rimR);
  light.addColorStop(0, 'rgba(255,225,180,.22)');
  light.addColorStop(0.5, 'rgba(255,225,180,0)');
  light.addColorStop(1, 'rgba(0,0,0,.28)');
  c.fillStyle = light;
  c.fillRect(-rimR, -rimR, rimR * 2, rimR * 2);
  c.restore();

  // relevo: as fatias "afundam" no aro, e a borda de fora tem uma quina
  const edge = (r, w, color) => {
    c.beginPath();
    c.arc(0, 0, r, 0, TAU);
    c.lineWidth = w;
    c.strokeStyle = color;
    c.stroke();
  };
  edge(R + 1.5, 4, 'rgba(0,0,0,.55)');
  edge(R + 4, 1, 'rgba(255,210,150,.22)');
  edge(rimR - 0.75, 1.5, 'rgba(20,8,2,.9)');
  edge(rimR - 2.75, 1, 'rgba(255,210,150,.16)');

  // soquetes das lâmpadas (a lâmpada acesa/apagada é desenhada por cima a cada quadro)
  const br = R + m * 0.28;
  for (let i = 0; i < BULBS; i++) {
    const a = (i / BULBS) * TAU;
    c.beginPath();
    c.arc(Math.cos(a) * br, Math.sin(a) * br, m * 0.17, 0, TAU);
    c.fillStyle = '#2b1407';
    c.fill();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,205,150,.22)';
    c.stroke();
  }
  wheelCache.rim = cv;

  // pino de latão na ponta de cada divisória
  const pr = Math.max(3, R * 0.03);
  const size = Math.ceil(pr * 2 + 4);
  const ps = document.createElement('canvas');
  ps.width = ps.height = Math.round(size * dpr);
  const pc = ps.getContext('2d');
  pc.setTransform(dpr, 0, 0, dpr, (size / 2) * dpr, (size / 2) * dpr);
  const pg = pc.createRadialGradient(-pr * 0.35, -pr * 0.35, pr * 0.1, 0, 0, pr);
  pg.addColorStop(0, '#fff3c8');
  pg.addColorStop(0.45, '#e0ad45');
  pg.addColorStop(1, '#7a4f0e');
  pc.beginPath();
  pc.arc(0, 0, pr, 0, TAU);
  pc.fillStyle = pg;
  pc.fill();
  pc.lineWidth = 1;
  pc.strokeStyle = '#3f2606';
  pc.stroke();
  Object.assign(wheelCache, { peg: ps, pegSize: size, pegR: pr });
}

function geom() {
  const m = W * 0.075;
  const R = W / 2 - m;
  return { m, R, cx: W / 2, cy: W / 2 };
}

function fitText(c, text, max) {
  if (c.measureText(text).width <= max) return text;
  let s = text;
  while (s.length > 1 && c.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

// Medidas das divisórias e do disco central, conforme o número de fatias:
//  - bw: grossura da ripa (fina quando há muitas fatias)
//  - r0: onde as ripas começam (antes disso elas se encostariam)
//  - plateR: raio do disco de madeira do centro, que cobre até onde as ripas começam
function dividerGeom(R, seg) {
  const bw = clamp(R * seg * 0.1, 1.2, R * 0.024);
  const r0 = Math.max(R * HUB_RATIO, (bw * 2) / seg);
  const plateR = Math.max(R * HUB_RATIO * 1.4, r0);
  return { bw, r0, plateR };
}

// Tamanho da letra e texto (cortado com "…" se precisar) de cada nome na roleta.
// Calculado uma vez por nome/tamanho de roleta/número de fatias e guardado: medir texto a cada
// quadro, com até ~100 fatias, pesaria.
const labelCache = new Map();
function labelLayout(c, label, R, seg) {
  const key = `${W}|${seg.toFixed(5)}|${label}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  if (labelCache.size > 600) labelCache.clear();

  const halfSin = Math.sin(Math.min(seg / 2, Math.PI / 2));
  const outer = R - 14; // onde o texto termina (perto da borda)
  // a letra acompanha a espessura da fatia: de 9px (muitas fatias) até 24px (poucas)
  let size = Math.round(clamp(R * halfSin * 0.55, 9, 24));
  // até onde o texto pode ir em direção ao centro sem ficar mais alto que a fatia
  const maxWidthFor = (s) => {
    const rMin = Math.max(dividerGeom(R, seg).plateR + 6, (s * 1.15) / (2 * halfSin));
    return Math.max(20, Math.min(R * 0.76, outer - rMin));
  };
  const fontFor = (s) => `800 ${s}px "Segoe UI", system-ui, sans-serif`;
  c.font = fontFor(size);
  // nome comprido: diminui a letra (ganha espaço) antes de cortar
  while (size > 9 && c.measureText(label).width > maxWidthFor(size)) {
    size -= 1;
    c.font = fontFor(size);
  }
  const result = { font: fontFor(size), text: fitText(c, label, maxWidthFor(size)) };
  labelCache.set(key, result);
  return result;
}

// Texturas das fatias especiais (criadas uma vez só)
const patterns = {};
function slicePattern(c, type) {
  if (patterns[type]) return patterns[type];
  const tile = document.createElement('canvas');
  tile.width = tile.height = 16;
  const tc = tile.getContext('2d');
  tc.lineCap = 'square';
  if (type === 'again') {
    // "Gira de novo": bolinhas (diferente das listras do Tudo e da hachura do Nada)
    tc.fillStyle = 'rgba(255,255,255,.2)';
    for (const [x, y] of [[4, 4], [12, 12]]) {
      tc.beginPath();
      tc.arc(x, y, 2.2, 0, TAU);
      tc.fill();
    }
    patterns[type] = c.createPattern(tile, 'repeat');
    return patterns[type];
  }
  if (type === 'todos') {
    tc.strokeStyle = 'rgba(255,255,255,.22)';
    tc.lineWidth = 5;
  } else {
    tc.strokeStyle = 'rgba(0,0,0,.28)';
    tc.lineWidth = 2;
  }
  // diagonal que "emenda" com os vizinhos do ladrilho
  for (const off of [-16, 0, 16]) {
    tc.beginPath();
    tc.moveTo(off, 16);
    tc.lineTo(off + 16, 0);
    tc.stroke();
  }
  patterns[type] = c.createPattern(tile, 'repeat');
  return patterns[type];
}


function drawWheel(t) {
  if (!W) return;
  const c = wctx;
  const list = activeOptions();
  const n = list.length;
  const { m, R, cx, cy } = geom();
  c.clearRect(0, 0, W, W);

  c.save();
  c.translate(cx, cy);

  // Aro de madeira (pré-desenhado em buildWheelCache)
  if (wheelCache.rim) c.drawImage(wheelCache.rim, -cx, -cy, W, W);

  // Fatias (giram)
  c.save();
  c.rotate(rt.rotation);
  if (n === 0) {
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.fillStyle = '#2a2140';
    c.fill();
  } else {
    const seg = TAU / n;
    for (let i = 0; i < n; i++) {
      const o = list[i];
      const a0 = i * seg;
      const slicePath = () => {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, R, a0, a0 + seg);
        c.closePath();
      };
      slicePath();
      c.fillStyle = colorFor(o);
      c.fill();

      // Fatias especiais: só a textura (listras no Tudo, hachura no Nada), sem animação
      if (o.type) {
        c.save();
        c.clip();
        c.fillStyle = slicePattern(c, o.type);
        c.fillRect(-R, -R, R * 2, R * 2);
        c.restore();
        slicePath();
      }

      c.lineWidth = 2;
      c.strokeStyle = 'rgba(0,0,0,.35)';
      c.stroke();
      if (rt.highlightId === SPECIALS.todos.id) {
        // caiu no "Tudo": todas as fatias acendem, uma luz correndo em volta
        const k = (Math.sin(t / 110 - i * 1.1) + 1) / 2;
        c.fillStyle = `rgba(255,255,255,${0.04 + 0.3 * k * k})`;
        c.fill();
      } else if (rt.highlightId) {
        c.fillStyle = o.id === rt.highlightId
          ? `rgba(255,255,255,${0.18 + 0.12 * Math.sin(t / 140)})`
          : 'rgba(0,0,0,.5)';
        c.fill();
      }

      c.save();
      c.rotate(a0 + seg / 2);
      c.textAlign = 'right';
      c.textBaseline = 'middle';
      const L = labelLayout(c, labelFor(o), R, seg);
      c.font = L.font;
      c.fillStyle = o.type === 'todos' ? '#3a2200' : o.type === 'nenhum' ? '#b4b4c8' : '#fff';
      // sombra no texto custa caro: com muitas fatias, desliga
      c.shadowColor = 'rgba(0,0,0,.45)';
      c.shadowBlur = o.type || n > 30 ? 0 : 4;
      c.fillText(L.text, R - 14, 0);
      c.restore();
    }

    // Brilho
    const sh = c.createRadialGradient(0, 0, R * 0.1, 0, 0, R);
    sh.addColorStop(0, 'rgba(255,255,255,.15)');
    sh.addColorStop(0.7, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.25)');
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.fillStyle = sh;
    c.fill();

    // Divisórias: ripas de madeira com relevo + pino de latão na ponta (é nele que a seta bate).
    // Com muitas fatias, as ripas e os pinos afinam (ver dividerGeom).
    const { bw, r0, plateR } = dividerGeom(R, seg);
    const pegK = wheelCache.peg ? Math.min(1, (R * seg * 0.45) / (wheelCache.pegR * 2)) : 1;
    const wood = c.createLinearGradient(0, -bw / 2, 0, bw / 2);
    wood.addColorStop(0, '#d8a066');
    wood.addColorStop(0.35, '#9a5f2c');
    wood.addColorStop(1, '#4a250c');
    for (let i = 0; i < n; i++) {
      c.save();
      c.rotate(i * seg);
      c.fillStyle = 'rgba(25,10,2,.75)'; // contorno/sombra da ripa
      c.fillRect(r0, -bw / 2 - 1, R - r0, bw + 2);
      c.fillStyle = wood;
      c.fillRect(r0, -bw / 2, R - r0, bw);
      c.fillStyle = 'rgba(255,225,180,.28)'; // veio claro ao longo da ripa
      c.fillRect(r0, -bw * 0.18, R - r0, Math.max(0.6, bw * 0.12));
      if (wheelCache.peg) {
        const s = wheelCache.pegSize * pegK;
        c.drawImage(wheelCache.peg, R - wheelCache.pegR * 1.7 * pegK - s / 2, -s / 2, s, s);
      }
      c.restore();
    }

    // Disco de madeira no centro: cobre a região onde as fatias ficam finas demais
    // (com muitas fatias, as pontinhas se espremiam e viravam um anel colorido)
    const plate = c.createRadialGradient(0, 0, R * HUB_RATIO, 0, 0, plateR);
    plate.addColorStop(0, '#5a3015');
    plate.addColorStop(0.6, '#8a5226');
    plate.addColorStop(1, '#6a3a18');
    c.beginPath();
    c.arc(0, 0, plateR, 0, TAU);
    c.fillStyle = plate;
    c.fill();
    // veios em anel (é um círculo, então não muda com o giro)
    for (const [k, a] of [[0.55, 0.22], [0.72, 0.16], [0.86, 0.2]]) {
      c.beginPath();
      c.arc(0, 0, R * HUB_RATIO + (plateR - R * HUB_RATIO) * k, 0, TAU);
      c.lineWidth = 1;
      c.strokeStyle = `rgba(40,16,4,${a})`;
      c.stroke();
    }
    c.beginPath();
    c.arc(0, 0, plateR, 0, TAU);
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(25,10,2,.85)';
    c.stroke();
    c.beginPath();
    c.arc(0, 0, plateR - 2.5, 0, TAU);
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,210,150,.2)';
    c.stroke();
  }
  c.restore();

  // Lâmpadas do aro (não giram)
  const br = R + m * 0.28;
  for (let i = 0; i < BULBS; i++) {
    const ang = (i / BULBS) * TAU;
    const lit = rt.spinning
      ? (i + Math.floor(t / 80)) % 3 === 0
      : (i + Math.floor(t / 550)) % 2 === 0;
    c.beginPath();
    c.arc(Math.cos(ang) * br, Math.sin(ang) * br, m * 0.12, 0, TAU);
    c.fillStyle = lit ? '#fff3c4' : '#6b4a12';
    c.shadowColor = '#ffd76a';
    c.shadowBlur = lit ? 12 : 0;
    c.fill();
  }
  c.shadowBlur = 0;

  // Miolo: só um pino dourado decorativo (não é botão)
  const hr = R * HUB_RATIO;
  const hg = c.createRadialGradient(-hr * 0.3, -hr * 0.3, hr * 0.1, 0, 0, hr);
  hg.addColorStop(0, '#fff1b8');
  hg.addColorStop(1, '#d18a00');
  c.beginPath();
  c.arc(0, 0, hr, 0, TAU);
  c.fillStyle = hg;
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = '#5a2d00';
  c.stroke();
  // anel interno, pra parecer o eixo da roleta
  c.beginPath();
  c.arc(0, 0, hr * 0.45, 0, TAU);
  c.lineWidth = 2;
  c.strokeStyle = 'rgba(90, 45, 0, 0.55)';
  c.stroke();

  if (n === 0) {
    c.fillStyle = '#fff';
    c.font = `700 ${R * 0.08}px "Segoe UI", sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('Adicione opções no painel', 0, R * 0.4);
  }
  c.restore();

  drawPointer(c, cx, m, R, t);
}

// Seta em formato de "lingueta" DURA: cabeça redonda presa num eixo, ponta afinando pra baixo.
// Ela só GIRA no eixo (rt.wobble), nunca entorta.
//  w = raio da cabeça; py = altura do eixo; len = distância do eixo até a ponta.
//  A ponta termina na altura do centro dos pinos, pra que eles a empurrem quando passam.
function pointerGeom() {
  const { m, R, cx, cy } = geom();
  const w = m * 0.34;
  const py = m * 0.42;
  const n = Math.max(1, activeOptions().length);
  const seg = TAU / n;
  const basePegR = wheelCache.pegR || R * 0.03;
  const pegK = Math.min(1, (R * seg * 0.45) / (basePegR * 2));
  const pegR = basePegR * pegK;
  const rp = R - basePegR * 1.7 * pegK;    // raio onde ficam os centros dos pinos
  const rc = pegR + 2.5;                    // raio do pino + folga da ponta da seta
  const s = rp * seg;                       // distância entre dois pinos, na altura da ponta
  const L0 = cy - rp - py;                  // comprimento com a ponta na altura do centro dos pinos
  // Quanto a ponta "entra" no caminho dos pinos. Pinos longe (poucas fatias): entra bastante.
  // Pinos colados (muitas fatias): só raspa, pra seta se soltar de um pino antes do próximo
  // chegar e conseguir ficar reta entre eles.
  const eng = clamp((0.36 * s) ** 2 / (2 * L0), 0.6, rc);
  const e = rc - eng;                       // a ponta fica "e" acima do centro dos pinos
  const len = Math.max(w * 1.8, L0 - e);
  // distância (horizontal, do pino até o eixo da seta) em que o pino SOLTA a seta inclinada,
  // e em que um pino chegando ENCOSTA na seta reta. A seta tem tamanho mínimo, então ela pode
  // entrar mais fundo que o planejado: usa o quanto entra de verdade (L0 - len).
  const eReal = L0 - len;
  const dRel = Math.sqrt(Math.max(0, (len + rc) ** 2 - L0 ** 2));
  const dTouch = Math.sqrt(Math.max(0, rc * rc - eReal * eReal));
  return { cx, cy, py, w, len, rp, rc, seg, s, dRel, dTouch };
}

function drawPointer(c, cx, m, R, t) {
  const { py, w: h, len } = pointerGeom();
  // ângulo dos pontos onde as laterais retas encostam na cabeça (tangentes)
  const phi = Math.acos(Math.min(0.99, h / len));
  c.save();
  c.translate(cx, py);
  c.rotate(rt.wobble);

  // corpo
  c.beginPath();
  c.moveTo(0, len);
  c.arc(0, 0, h, Math.PI / 2 - phi, Math.PI / 2 + phi, true);
  c.closePath();
  c.shadowColor = 'rgba(0,0,0,.55)';
  c.shadowBlur = 8;
  c.shadowOffsetY = 3;
  const g = c.createLinearGradient(-h, 0, h, 0);
  g.addColorStop(0, '#ff6b7d');
  g.addColorStop(0.45, '#e0263f');
  g.addColorStop(1, '#86101f');
  c.fillStyle = g;
  c.fill();
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  c.lineJoin = 'round';
  c.lineWidth = 1.5;
  c.strokeStyle = '#4d0612';
  c.stroke();

  // reflexo do lado esquerdo
  c.save();
  c.clip();
  c.beginPath();
  c.ellipse(-h * 0.38, h * 0.05, h * 0.26, h * 0.85, 0.22, 0, TAU);
  c.fillStyle = 'rgba(255,255,255,.22)';
  c.fill();
  c.restore();

  // eixo: rebite de latão
  const sr = h * 0.42;
  const sg = c.createRadialGradient(-sr * 0.35, -sr * 0.35, sr * 0.1, 0, 0, sr);
  sg.addColorStop(0, '#fff4c8');
  sg.addColorStop(0.5, '#d9a531');
  sg.addColorStop(1, '#6e470a');
  c.beginPath();
  c.arc(0, 0, sr, 0, TAU);
  c.fillStyle = sg;
  c.fill();
  c.lineWidth = 1;
  c.strokeStyle = '#3f2606';
  c.stroke();
  c.beginPath();
  c.arc(0, 0, sr * 0.55, 0, TAU);
  c.strokeStyle = 'rgba(90,55,10,.45)';
  c.stroke();

  // Indicador secreto da trapaça (bolinha no centro do rebite):
  //  - piscando: escolhendo (apertou T, ou depois dos 3 toques no ponteiro)
  //  - fixa: opção escolhida, o próximo giro vai cair nela
  const showDot = cheatReady() ? Math.floor(t / 250) % 2 === 0 : !!rt.cheatTarget;
  if (showDot) {
    c.beginPath();
    c.arc(0, 0, 1.2, 0, TAU);
    c.fillStyle = 'rgba(0,0,0,.45)';
    c.fill();
  }
  c.restore();
}

/* =========================================================
   Loop principal (desenho, "clack", ponteiro, efeitos)
   ========================================================= */
let lastT = performance.now();

/* ---------- Seta DURA x pinos ----------
   A seta é rígida e só gira no eixo. A ponta anda num arco em volta do eixo; o pino é um
   círculo. A ponta nunca pode entrar no círculo do pino:
     1) o pino chega e empurra a ponta: a seta gira (inteira) pro lado;
     2) girando, a ponta sobe no arco e desliza por cima do pino;
     3) quando a ponta fica alta o bastante, o pino passa por baixo dela e a seta volta
        pro centro pela mola, suave.
   O ângulo vem da geometria (arco da ponta x círculo do pino), então não tem pulo e a ponta
   nunca atravessa o pino, nem com a roleta parada.
   Rápido demais (o pino passa de um quadro pro outro), a seta leva só o tranco da mola. */
rt.contacts = new Map(); // pinos encostando na seta: índice do pino -> lado da ponta (+1 direita, -1 esquerda)

function frame(t) {
  const dt = Math.min(50, t - lastT);
  lastT = t;
  const k = dt / 16.67;
  const dRot = rt.rotation - rt.lastRot;

  // limites pro ângulo da ponta (theta = -wobble; theta > 0 = ponta pra direita)
  let thetaMin = -Infinity;
  let thetaMax = Infinity;

  const n = activeOptions().length;
  if (n > 0 && W) {
    const pg = pointerGeom();
    const seg = pg.seg;
    const L = pg.len;
    const fast = Math.abs(dRot) * pg.rp > pg.rc; // o pino andou mais que um raio num quadro

    // "clack" quando um pino passa pela seta (som mais fraco quanto mais devagar)
    const idx = Math.floor((-Math.PI / 2 - rt.rotation) / seg);
    if (rt.lastN === n && rt.lastIdx !== null && idx !== rt.lastIdx) {
      sfx.clack(clamp(Math.abs(dRot) / 0.05, 0.12, 1));
      if (fast) {
        rt.wobble = clamp(-0.42 * Math.sign(dRot), -0.6, 0.6);
        rt.wobbleVel = 0;
      }
    }
    rt.lastIdx = idx;
    rt.lastN = n;

    if (fast) {
      rt.contacts.clear();
    } else {
      const theta = -rt.wobble;
      const j0 = Math.round((-Math.PI / 2 - rt.rotation) / seg);
      const seen = new Set();
      for (let j = j0 - 3; j <= j0 + 3; j++) {
        const a = rt.rotation + j * seg;
        const px = pg.rp * Math.cos(a);                 // centro do pino, relativo ao eixo da seta
        const py = pg.cy + pg.rp * Math.sin(a) - pg.py;
        const D = Math.hypot(px, py);
        if (D >= L + pg.rc || D <= L - pg.rc) continue;  // o arco da ponta não alcança esse pino
        // ângulos da ponta que entrariam no pino: (phi - psi, phi + psi)
        const phi = Math.atan2(px, py);
        const psi = Math.acos(clamp((L * L + D * D - pg.rc * pg.rc) / (2 * L * D), -1, 1));
        seen.add(j);
        if (!rt.contacts.has(j)) rt.contacts.set(j, theta >= phi ? 1 : -1); // de que lado a ponta está
        if (rt.contacts.get(j) > 0) thetaMin = Math.max(thetaMin, phi + psi);
        else thetaMax = Math.min(thetaMax, phi - psi);
      }
      for (const j of [...rt.contacts.keys()]) if (!seen.has(j)) rt.contacts.delete(j);
    }
  }
  rt.lastRot = rt.rotation;

  // mola da seta (volta pro centro suave) + os pinos segurando, se estiverem encostados
  rt.wobbleVel += (-0.12 * rt.wobble - 0.32 * rt.wobbleVel) * k;
  rt.wobble += rt.wobbleVel * k;
  if (thetaMin > thetaMax) thetaMax = thetaMin;            // apertada entre dois pinos: segue o que empurra
  const wMin = -thetaMax;                                   // theta = -wobble
  const wMax = -thetaMin;
  if (rt.wobble > wMax) { rt.wobble = wMax; if (rt.wobbleVel > 0) rt.wobbleVel = 0; }
  if (rt.wobble < wMin) { rt.wobble = wMin; if (rt.wobbleVel < 0) rt.wobbleVel = 0; }

  drawWheel(t);
  fx.update(k, t);
  fx.draw();
  requestAnimationFrame(frame);
}

/* =========================================================
   Animação do giro
   ========================================================= */
function tween(from, to, dur, easing, onProgress) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    function step(now) {
      const p = Math.min(1, (now - t0) / dur);
      rt.rotation = from + (to - from) * easing(p);
      if (onProgress) onProgress(p);
      if (p < 1) requestAnimationFrame(step);
      else resolve();
    }
    requestAnimationFrame(step);
  });
}

const narrator = $('#narrator');
function say(text) {
  narrator.textContent = text;
  narrator.classList.remove('pop');
  void narrator.offsetWidth; // reinicia a animação
  narrator.classList.add('pop');
}

function setBusy(b) {
  rt.spinning = b;
  const btn = $('#spinBtn');
  btn.disabled = b;
  btn.textContent = b ? 'GIRANDO...' : 'GIRAR!';
  document.body.classList.toggle('busy', b);
}

function startSuspense() {
  document.body.classList.add('suspense');
}
function stopSuspense() {
  document.body.classList.remove('suspense');
}

/**
 * Gira a roleta.
 * opts.dir: 1 = horário, -1 = anti-horário
 * opts.power: velocidade do arremesso (rad/s), se veio do arrastar
 * opts.exclude: id de opção que não pode sair (usado no veto)
 */
async function spin(opts = {}) {
  if (rt.spinning || rt.overlayOpen) return;
  const list = activeOptions();
  const real = list.filter((o) => o.type !== 'again'); // "Gira de novo" sozinho não decide nada
  if (real.length < 2) {
    if (state.settings.elimination && real.length === 1) say(`Só sobrou ${displayName(real[0])}! Restaure as opções.`);
    else say('Coloque pelo menos 2 opções!');
    return;
  }
  sfx.ensure();
  setBusy(true);

  const dir = opts.dir || 1;
  const n = list.length;
  const seg = TAU / n;

  // 1) Sorteia o resultado (ou usa a trapaça)
  let k;
  const cheatIdx = rt.cheatTarget ? list.findIndex((o) => o.id === rt.cheatTarget) : -1;
  rt.cheatTarget = null;
  if (cheatIdx >= 0) {
    k = cheatIdx;
  } else {
    let pool = list.map((_, i) => i);
    if (opts.exclude) {
      const filtered = pool.filter((i) => list[i].id !== opts.exclude);
      if (filtered.length) pool = filtered;
    }
    k = pick(pool);
  }

  // 2) Decide se vai ter pegadinha
  //    slide  = Escorregada: quase para e escorrega pra fatia seguinte
  //    back   = Volta pra trás (2 versões, ver abaixo)
  //    shake  = Tremedeira: treme em cima da divisória
  //    extra  = Embalada: quase para e ganha fôlego de novo, andando várias fatias
  const tricks = ['slide', 'back', 'shake'];
  if (n >= 4) tricks.push('extra'); // a Embalada precisa de fatias pra andar
  const trick = Math.random() * 100 < state.settings.trickChance ? pick(tricks) : null;
  // Escorregada: às vezes, depois de escorregar pra próxima fatia, volta pra que já ia cair (e fica nela)
  const slideBack = trick === 'slide' && Math.random() < 0.4;
  const extraSlices = trick === 'extra' ? Math.floor(rand(2, Math.min(6, n - 1) + 1)) : 0;
  // Física (não é pegadinha): às vezes chega fraca na divisória, bate no pino, não passa e volta
  const bounce = !trick && Math.random() < 0.35;
  // A roleta tem que parar com a seta RETA, sem encostar em pino nenhum: senão a seta fica
  // inclinada apontando pra fatia vizinha. gMin = quão longe da divisória (em fração da fatia)
  // o ponto final precisa estar. Fatias largas: quase nada; muitas fatias finas: perto do meio.
  //  gBehind: longe o bastante do pino que acabou de passar, pra ele soltar a seta;
  //  gAhead:  longe o bastante do pino da frente, pra ele não encostar.
  const pgEnd = pointerGeom();
  const margin = 0.6; // px de folga
  const gBehind = (pgEnd.dRel + margin) / pgEnd.s;   // pino que acabou de passar
  const gAhead = (pgEnd.dTouch + margin) / pgEnd.s;  // pino que vem a seguir
  // no bounce, distância (em fatias) entre o ponto final e o pino: ~20% da fatia, no máx. ~5°,
  // mas sempre longe o bastante pra seta voltar a ficar reta
  const bounceD = Math.min(0.48, Math.max(Math.min(0.2, 0.09 / seg), gAhead - 0.01));
  // Tremedeira: treme na divisória de entrada (termina andando pra frente) ou na de saída (voltando)
  const shakeAtEntry = Math.random() < 0.5;
  // o último movimento termina pra frente ou voltando? Muda qual pino acabou de passar.
  const endsBackward = slideBack || trick === 'back' || (trick === 'shake' && !shakeAtEntry);

  // 3) Posições. "u" = quantas fatias ANTES do ponto final (no sentido do giro).
  //    g = quanto da fatia final já foi percorrido ao parar.
  let g;
  if (slideBack) g = 0.7;                    // o resultado é a fatia onde ela ia parar
  else if (trick === 'slide') g = 0.22;
  else if (bounce) g = 1 - bounceD - 0.01;   // termina pertinho da divisória de saída
  else if (trick) g = 0.5;
  else g = rand(0.15, 0.85);
  // longe dos pinos (seta reta): o pino que acabou de passar precisa ter soltado a seta
  // (gBehind) e o próximo não pode encostar (gAhead). Muitas fatias: sobra uma faixa estreita.
  if (!bounce) {
    const lo = endsBackward ? gAhead : gBehind;
    const hi = 1 - (endsBackward ? gBehind : gAhead);
    if (lo > hi) g = (lo + hi) / 2;
    else g = clamp(g, Math.min(Math.max(0.15, lo), hi), Math.max(Math.min(0.85, hi), lo));
  }
  const f = dir === 1 ? 1 - g : g;
  const aFinal = (k + f) * seg;              // ângulo sob o ponteiro, no "espaço da roleta"
  const aAt = (u) => aFinal + dir * u * seg;

  let u1 = 0;
  let shakeSeq = null;
  if (slideBack) u1 = 0.08;                          // quase para na fatia (que vai ser o resultado)
  else if (trick === 'slide') u1 = g + 0.3;          // quase para na fatia anterior
  else if (trick === 'back') u1 = -(1 - g) - 0.4;    // passa da fatia e para na seguinte
  else if (trick === 'extra') u1 = g + extraSlices - 0.5 + rand(-0.15, 0.15); // quase para várias fatias antes
  else if (bounce) u1 = -bounceD;                    // encosta no pino da divisória de saída
  else if (trick === 'shake') {
    const atEntry = shakeAtEntry;
    const uB = atEntry ? g : g - 1;                  // divisória de entrada ou de saída
    const side = atEntry ? 1 : -1;                   // lado "errado" da divisória
    shakeSeq = [-0.12, 0.1, -0.08, 0.07, -0.05].map((d) => uB + side * d);
    u1 = uB + side * 0.15;
  }

  // 4) Primeira parada (com várias voltas antes)
  const power = opts.power || null;
  const turns = power ? clamp(2 + power * 0.3, 3, 10) : rand(4.5, 6.5);
  const dur1 = power ? clamp(3500 + power * 150, 4000, 7500) : rand(5000, 6000);
  const a1 = aAt(u1);
  const base = -Math.PI / 2 - a1;
  const cur = rt.rotation;
  const minDist = turns * TAU;
  const R1 = dir === 1
    ? base + Math.ceil((cur + minDist - base) / TAU) * TAU
    : base + Math.floor((cur - minDist - base) / TAU) * TAU;
  const rotAt = (u) => R1 - (aAt(u) - a1);

  narrator.textContent = ''; // sem falas durante o giro
  let suspenseOn = false;
  await tween(cur, R1, dur1, ease.outQuart, (p) => {
    if (!suspenseOn && p > 0.5) {
      suspenseOn = true;
      startSuspense();
    }
  });

  // 5) Pegadinhas
  if (trick === 'slide' && slideBack) {
    // ia parar em A, escorrega pra B... e volta pra A
    const almost = rotAt(u1 - 0.04);
    await tween(R1, almost, 800, ease.linear);
    const next = rotAt(-(1 - g) - 0.25);   // um pouco pra dentro da próxima fatia
    await tween(almost, next, 1300, ease.inOut);
    await wait(600);
    await tween(next, rotAt(0), 1200, ease.inOut);
  } else if (trick === 'slide') {
    // ia parar em A e escorrega pra B
    const almost = rotAt(u1 - 0.04);
    await tween(R1, almost, 800, ease.linear);
    await tween(almost, rotAt(0), 1500, ease.inOut);
  } else if (trick === 'back') {
    // passou da fatia, parou na seguinte... e volta
    await wait(1000);
    await tween(R1, rotAt(0), 1300, ease.inOut);
  } else if (trick === 'extra') {
    // quase para... e embala de novo, andando várias fatias
    const almost = rotAt(u1 - 0.04);
    await tween(R1, almost, 700, ease.linear);
    await tween(almost, rotAt(0), 900 + extraSlices * 260, ease.inOut);
  } else if (bounce) {
    // bateu no pino sem força pra passar: o pino entorta a seta (contato no frame()),
    // a roleta volta um pouquinho e assenta
    sfx.knock();
    const back = rotAt(bounceD * 0.35);
    await tween(R1, back, 260, ease.outCubic);
    await tween(back, rotAt(0), 420, ease.inOut);
  } else if (trick === 'shake') {
    let prev = R1;
    for (const u of shakeSeq) {
      const next = rotAt(u);
      await tween(prev, next, 230, ease.inOut);
      prev = next;
    }
    await tween(prev, rotAt(0), 550, ease.outCubic);
  }

  rt.rotation = rotAt(0);
  stopSuspense();
  setBusy(false);
  finish(list[k], trick);
}

/* =========================================================
   Resultado
   ========================================================= */
function pushHistory(opt, tag) {
  state.history.unshift({ name: displayName(opt), type: opt.type || null, t: Date.now(), tag: tag || null });
  state.history = state.history.slice(0, 10);
  save();
  renderHistory();
}

function finish(opt, trick) {
  rt.highlightId = opt.id;
  rt.currentResult = opt;
  if (navigator.vibrate) navigator.vibrate([60, 40, 60]);

  // "Gira de novo": sem cartão; avisa, destaca a fatia por um instante e gira sozinha
  // (nunca é eliminada, nem no modo eliminação)
  if (opt.type === 'again') {
    say('Gira de novo!');
    sfx.pop();
    setTimeout(() => {
      rt.highlightId = null;
      spin();
    }, 1300);
    return;
  }

  if (state.settings.elimination) {
    pushHistory(opt, 'eliminado');
    showEliminated(opt, trick);
  } else {
    pushHistory(opt);
    showResult(opt, { trick });
  }
}

function showResult(opt, { trick = null, final = false } = {}) {
  rt.highlightId = opt.id;
  rt.currentResult = opt;
  say(displayName(opt));

  // Título neutro pra todos os resultados (Tudo/Nada não são "bons" nem "ruins")
  const title = final ? 'Sobrou só um!' : 'A roleta escolheu';
  // opções que entram no "Tudo" (as que ainda estão na roleta; se nenhuma, todas da lista)
  const allOpts = state.options.filter((o) => !state.eliminated.includes(o.id));
  const tudoOpts = allOpts.length ? allOpts : state.options;
  // Etiquetas das opções no cartão: no máximo 12; o resto vira uma etiqueta "+N"
  const MAX_CHIPS = 12;
  const many = tudoOpts.length > MAX_CHIPS;
  const chipsHtml = (cls) => `<div class="chips ${cls}">${tudoOpts
    .slice(0, MAX_CHIPS)
    .map((o) => `<span class="chip" style="--c:${colorFor(o)}">${esc(displayName(o))}</span>`)
    .join('')}${many ? `<span class="chip chip-more">+${tudoOpts.length - MAX_CHIPS}</span>` : ''}</div>`;
  let sub, art;
  let extra = '';
  if (opt.type === 'todos') {
    sub = many ? `Valem todas as ${tudoOpts.length} opções:` : 'Valem todas as opções:';
    extra = chipsHtml('');
    art = ART.todos;
  } else if (opt.type === 'nenhum') {
    sub = many ? `Não vale nenhuma das ${tudoOpts.length} opções:` : 'Não vale nenhuma opção:';
    extra = chipsHtml('off');
    art = ART.nenhum;
  } else {
    sub = 'Tá decidido!';
    art = final ? ART.winner : ART.normal;
  }

  // No modo eliminação, o vencedor final não pode ser vetado (o veto lá serve pra salvar opções)
  const canVeto = !state.settings.elimination;
  const vetoBtns = canVeto ? vetoButtons('ban', 'veta') : '';
  const vetoHint = canVeto ? vetoHintHtml('vetar') : '';

  openOverlay(
    opt.type || 'normal',
    `${art}
     <h2 class="result-title" id="resultTitle">${title}</h2>
     <div class="result-name">${esc(displayName(opt))}</div>
     <p>${sub}</p>
     ${extra}
     <div class="actions"><button class="btn-ok" data-act="ok">${opt.type === 'nenhum' ? 'Ok' : 'Bora!'}</button>${vetoBtns}</div>
     ${vetoHint}`
  );

  if (opt.type === 'todos') {
    // "Tudo": as próprias opções saem voando da roleta, cada uma com a cor da sua fatia
    sfx.cascade(tudoOpts.length);
    const r = wheel.getBoundingClientRect();
    fx.burst(tudoOpts.map((o) => ({ text: displayName(o), color: colorFor(o) })), r.left + r.width / 2, r.top + r.height / 2, r.width * 0.4);
  } else if (opt.type === 'nenhum') {
    // "Nada": as opções são sugadas pra dentro da roleta e somem
    sfx.descend(tudoOpts.length);
    const r = wheel.getBoundingClientRect();
    fx.implode(tudoOpts.map((o) => ({ text: displayName(o), color: colorFor(o) })), r.left + r.width / 2, r.top + r.height / 2, r.width * 0.42);
  } else if (final) {
    sfx.fanfare(true);
    fx.confetti(200);
    fx.fireworks(4, 1800);
  } else {
    sfx.fanfare(false);
    fx.confetti(180);
  }
}

// Botões de veto dos jogadores que ainda têm veto (mesmo botão, texto muda conforme o modo)
function vetoButtons(iconName, verb) {
  const vetoers = state.players.filter((p) => p.veto);
  if (!vetoers.length) return '';
  return `<div class="veto-group">${vetoers
    .map((p) => `<button class="btn-veto${verb === 'salva' ? ' btn-save' : ''}" data-act="veto" data-player="${p.id}">${icon(iconName)} ${esc(p.name)} ${verb}</button>`)
    .join('')}</div>`;
}
const vetoHintHtml = (verb) =>
  state.players.length === 0 ? `<p class="small">Quer poder ${verb}? Cadastre jogadores no painel.</p>` : '';

function showEliminated(opt, trick) {
  say(`${displayName(opt)} saiu!`);
  sfx.pop();
  // No modo eliminação, o veto vira "salvamento": a opção não sai e a roleta gira de novo
  openOverlay(
    'elim',
    `${ART.elim}
     <h2 class="result-title" id="resultTitle">Eliminado!</h2>
     <div class="result-name">${esc(displayName(opt))}</div>
     <p>Esse sai da roleta.</p>
     <div class="actions"><button class="btn-ok" data-act="ok">${icon('scissors')} Tirar da roleta</button>${vetoButtons('shield', 'salva')}</div>
     ${vetoHintHtml('salvar')}`,
    () => {
      if (!state.eliminated.includes(opt.id)) state.eliminated.push(opt.id);
      save();
      renderOptions();
      sfx.pop();
      // "Gira de novo" não conta: o vencedor é a última opção de verdade
      const rest = activeOptions().filter((o) => o.type !== 'again');
      if (rest.length === 1) {
        pushHistory(rest[0], 'vencedor');
        setTimeout(() => showResult(rest[0], { final: true }), 450);
      } else {
        say(`Faltam ${rest.length}. Gira de novo!`);
      }
    }
  );
}

/* ---------- Overlay ---------- */
const overlay = $('#overlay');
const resultCard = $('#resultCard');
let overlayOnClose = null;

function openOverlay(kind, html, onClose) {
  resultCard.className = 'result-card ' + kind;
  resultCard.innerHTML = html;
  // reinicia a animação de entrada
  resultCard.style.animation = 'none';
  void resultCard.offsetWidth;
  resultCard.style.animation = '';
  overlay.classList.remove('hidden');
  rt.overlayOpen = true;
  overlayOnClose = onClose || null;
  const ok = resultCard.querySelector('[data-act="ok"]');
  if (ok) ok.focus();
}

function closeOverlay() {
  if (!rt.overlayOpen) return;
  overlay.classList.add('hidden');
  rt.overlayOpen = false;
  rt.highlightId = null;
  const cb = overlayOnClose;
  overlayOnClose = null;
  if (cb) cb();
}

overlay.addEventListener('click', (e) => {
  if (e.target === overlay) { closeOverlay(); return; }
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  if (btn.dataset.act === 'ok') closeOverlay();
  else if (btn.dataset.act === 'veto') useVeto(btn.dataset.player);
});

// Veto: no modo normal, descarta o resultado e gira de novo.
// No modo eliminação ("salvar"), a opção sorteada NÃO sai da roleta e gira de novo.
// Nos dois casos, a opção vetada/salva fica de fora só do próximo giro.
function useVeto(playerId) {
  const p = state.players.find((x) => x.id === playerId);
  if (!p || !p.veto || !rt.currentResult) return;
  const saving = resultCard.classList.contains('elim');
  p.veto = false;
  if (state.history[0]) state.history[0].tag = saving ? 'salvo' : 'vetado';
  save();
  const target = rt.currentResult;
  overlayOnClose = null; // não executa a eliminação
  closeOverlay();
  renderPlayers();
  renderHistory();
  say(saving ? `${p.name} salvou ${displayName(target)}!` : `${p.name} vetou!`);
  sfx.whoop(false);
  setTimeout(() => spin({ exclude: target.id }), 800);
}

/* =========================================================
   Painel: opções, configurações, jogadores, histórico
   ========================================================= */
const cheatReady = () => rt.tChoosing || performance.now() < rt.cheatArmedUntil;

// Escolheu uma opção: para de piscar (mesmo com o T ainda apertado).
// Clicar na opção que já estava escolhida desmarca.
function armCheat(id) {
  rt.cheatTarget = rt.cheatTarget === id ? null : id;
  rt.tChoosing = false;
  rt.cheatArmedUntil = 0;
  rt.blockClickUntil = performance.now() + 500;
}

function renderOptions() {
  const ul = $('#optionList');
  ul.innerHTML = '';
  for (const opt of state.options) {
    const li = document.createElement('li');
    li.className = 'opt-row' + (state.eliminated.includes(opt.id) ? ' eliminated' : '');

    const sw = document.createElement('span');
    sw.className = 'swatch';
    sw.style.background = colorFor(opt);

    const input = document.createElement('input');
    input.type = 'text';
    input.value = opt.name;
    input.maxLength = 40;
    input.title = 'Clique pra renomear';
    input.setAttribute('aria-label', 'Nome da opção (editável)');
    input.addEventListener('input', () => { opt.name = input.value; save(); });

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.title = 'Remover';
    del.setAttribute('aria-label', `Remover ${displayName(opt)}`);
    del.innerHTML = icon('x');
    del.addEventListener('click', () => {
      state.options = state.options.filter((o) => o.id !== opt.id);
      state.eliminated = state.eliminated.filter((id) => id !== opt.id);
      if (rt.cheatTarget === opt.id) rt.cheatTarget = null;
      save();
      renderOptions();
    });

    // Trapaça secreta: segurando T (ou depois do toque triplo no ponteiro), clicar numa opção arma ela
    const grab = (e) => {
      if (!cheatReady()) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'pointerdown') armCheat(opt.id);
    };
    li.addEventListener('pointerdown', grab, true);
    li.addEventListener('mousedown', grab, true);
    li.addEventListener('click', (e) => {
      if (performance.now() < rt.blockClickUntil) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    li.dataset.id = opt.id;
    li.append(sw, input, del);
    ul.appendChild(li);
  }
  // Estado vazio / quase vazio: diz o que falta
  if (!state.options.length) {
    ul.innerHTML = '<li class="empty">Adicione pelo menos 2 opções pra girar.</li>';
  } else if (activeOptions().length < 2 && !state.settings.elimination) {
    ul.insertAdjacentHTML('beforeend', '<li class="empty">Falta mais 1 opção pra girar.</li>');
  }
  $('#clearOptionsBtn').classList.toggle('hidden', !state.options.length);
  $('#restoreBtn').classList.toggle('hidden', state.eliminated.length === 0);
  const total = wheelOptions().length;
  const active = activeOptions().length;
  $('#optionCount').textContent = state.eliminated.length
    ? `${active} de ${total} na roleta`
    : `${total} ${total === 1 ? 'fatia' : 'fatias'}`;
  // fatias especiais eliminadas aparecem riscadas nas chaves
  $('#allToggle').closest('.toggle').classList.toggle('eliminated', state.eliminated.includes(SPECIALS.todos.id));
  $('#noneToggle').closest('.toggle').classList.toggle('eliminated', state.eliminated.includes(SPECIALS.nenhum.id));
}

function renderPlayers() {
  const ul = $('#playerList');
  ul.innerHTML = '';
  const left = state.players.filter((p) => p.veto).length;
  $('#playerCount').textContent = state.players.length ? `${left}/${state.players.length} vetos` : 'opcional';
  if (!state.players.length) {
    ul.innerHTML = '<li class="empty">Ninguém cadastrado ainda.</li>';
    return;
  }
  for (const p of state.players) {
    const li = document.createElement('li');
    li.className = 'player-row';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = p.name;
    const st = document.createElement('span');
    st.className = p.veto ? 'veto-on' : 'veto-off';
    st.innerHTML = p.veto ? `${icon('ban')} tem veto` : 'veto usado';
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon-btn';
    del.title = 'Remover';
    del.setAttribute('aria-label', `Remover ${p.name}`);
    del.innerHTML = icon('x');
    del.addEventListener('click', () => {
      state.players = state.players.filter((x) => x.id !== p.id);
      save();
      renderPlayers();
    });
    li.append(name, st, del);
    ul.appendChild(li);
  }
}

function renderHistory() {
  const ul = $('#historyList');
  ul.innerHTML = '';
  $('#historyCount').textContent = state.history.length ? `${state.history.length}` : 'vazio';
  $('#clearHistoryBtn').classList.toggle('hidden', !state.history.length);
  if (!state.history.length) {
    ul.innerHTML = '<li class="empty">Nenhum sorteio ainda.</li>';
    return;
  }
  for (const h of state.history) {
    const li = document.createElement('li');
    li.className = 'hist-row';
    const time = document.createElement('time');
    time.textContent = new Date(h.t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = h.name;
    li.append(time, name);
    if (h.tag) {
      const tg = document.createElement('span');
      tg.className = 'tag ' + h.tag;
      tg.textContent = h.tag;
      li.appendChild(tg);
    }
    ul.appendChild(li);
  }
}

// "Personalidade" da roleta conforme a chance de enganar
function trickMood(v) {
  if (v === 0) return 'Santinha, nunca engana';
  if (v <= 25) return 'De vez em quando apronta';
  if (v <= 50) return 'Malandrinha';
  if (v <= 75) return 'Não confie nela';
  if (v < 100) return 'Trambiqueira';
  return 'Engana sempre!';
}

// Atualiza o texto, o número e a cor (dourado → vermelho) da malandragem
function syncTrickUI() {
  const v = state.settings.trickChance;
  $('#trickChance').value = v;
  $('#trickVal').textContent = v + '%';
  $('#trickMood').textContent = trickMood(v);
  $('#trickChance').closest('.field').style.setProperty('--mal', (v / 100).toFixed(2));
}

function syncSettings() {
  syncTrickUI();
  $('#elimToggle').checked = state.settings.elimination;
  $('#allToggle').checked = state.settings.includeAll;
  $('#noneToggle').checked = state.settings.includeNone;
  $('#againToggle').checked = state.settings.includeAgain;
  syncMute();
}

function syncMute() {
  const b = $('#muteBtn');
  const on = state.settings.sound;
  b.innerHTML = icon(on ? 'volume' : 'mute');
  b.classList.toggle('off', !on);
  b.setAttribute('aria-label', on ? 'Desligar sons' : 'Ligar sons');
  b.title = on ? 'Desligar sons' : 'Ligar sons';
}

function renderAll() {
  renderOptions();
  renderPlayers();
  renderHistory();
  syncSettings();
}

/* ---------- Eventos do painel ---------- */
// Uma opção por linha (vírgula pode fazer parte do nome)
const splitList = (text) => text.split(/[\r\n]+/).map((s) => s.trim()).filter(Boolean);

// "Gira de novo", "gira de novo!", "GIRÁ DE NOVO" -> "GIRA DE NOVO" (pra reconhecer os especiais)
const normalizeAlias = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

// Adiciona várias opções de uma vez (respeitando o máximo).
// Linhas "TUDO", "NADA" ou "GIRA DE NOVO" ligam a fatia especial em vez de virar opção comum.
function addOptions(lines) {
  let turnedOn = false;
  const names = [];
  for (const line of lines) {
    const key = SPECIAL_ALIASES[normalizeAlias(line)];
    if (key) {
      if (!state.settings[key]) { state.settings[key] = true; turnedOn = true; }
    } else {
      names.push(line);
    }
  }
  if (turnedOn) { save(); syncSettings(); renderOptions(); }
  if (!names.length) return 0;
  const room = MAX_OPTIONS - state.options.length;
  if (room <= 0) { say(`Máximo de ${MAX_OPTIONS} opções!`); return 0; }
  const added = names.slice(0, room).map((n) => ({ id: uid(), name: n.slice(0, 40) }));
  state.options.push(...added);
  save();
  renderOptions();
  if (names.length > added.length) say(`Máximo de ${MAX_OPTIONS} opções!`);
  return added.length;
}

// Campo de novas opções: cresce junto com o texto, sem limite (quem rola é o painel)
const newOption = $('#newOption');
function fitNewOption() {
  newOption.style.height = 'auto';
  newOption.style.height = newOption.scrollHeight + 2 + 'px';
}
newOption.addEventListener('input', fitNewOption);

// Enter quebra a linha; Ctrl+Enter (ou Cmd+Enter no Mac) adiciona
newOption.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    $('#addOptionForm').requestSubmit();
  }
});

$('#addOptionForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const names = splitList(newOption.value);
  if (!names.length) return;
  addOptions(names);
  newOption.value = '';
  fitNewOption();
  newOption.focus();
});

// Limpar todas as opções
$('#clearOptionsBtn').addEventListener('click', () => {
  state.options = [];
  state.eliminated = state.eliminated.filter((id) => id.startsWith('__')); // mantém só as fatias TUDO/NADA
  rt.cheatTarget = null;
  save();
  renderOptions();
});

$('#restoreBtn').addEventListener('click', () => {
  state.eliminated = [];
  save();
  renderOptions();
  say('Opções de volta na roleta!');
});

$('#trickChance').addEventListener('input', (e) => {
  state.settings.trickChance = Number(e.target.value);
  syncTrickUI();
  save();
});

$('#elimToggle').addEventListener('change', (e) => {
  state.settings.elimination = e.target.checked;
  if (!e.target.checked) state.eliminated = [];
  save();
  renderOptions();
  say(e.target.checked ? 'Modo eliminação ligado!' : 'Modo normal.');
});

// Chaves das fatias especiais
function bindSpecialToggle(sel, key, special, onMsg) {
  $(sel).addEventListener('change', (e) => {
    state.settings[key] = e.target.checked;
    if (!e.target.checked) {
      state.eliminated = state.eliminated.filter((id) => id !== special.id);
      if (rt.cheatTarget === special.id) rt.cheatTarget = null;
    }
    save();
    renderOptions();
    say(e.target.checked ? onMsg : `${special.name} saiu da roleta`);
  });
}
bindSpecialToggle('#allToggle', 'includeAll', SPECIALS.todos, 'Fatia "Tudo" na roleta!');
bindSpecialToggle('#noneToggle', 'includeNone', SPECIALS.nenhum, 'Fatia "Nada" na roleta!');
bindSpecialToggle('#againToggle', 'includeAgain', SPECIALS.again, 'Fatia "Gira de novo" na roleta!');

$('#muteBtn').addEventListener('click', () => {
  state.settings.sound = !state.settings.sound;
  if (state.settings.sound) { sfx.ensure(); sfx.pop(); }
  save();
  syncMute();
});

$('#addPlayerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#newPlayer');
  const name = input.value.trim();
  if (!name) return;
  state.players.push({ id: uid(), name, veto: true });
  input.value = '';
  save();
  renderPlayers();
  input.focus();
});

$('#resetVetosBtn').addEventListener('click', () => {
  state.players.forEach((p) => { p.veto = true; });
  save();
  renderPlayers();
});

$('#clearHistoryBtn').addEventListener('click', () => {
  state.history = [];
  save();
  renderHistory();
});

/* ---------- Segurar pra carregar a força do giro ---------- */
// Toque rápido = giro normal. Segurando, a força enche em ~1,8s; ao soltar, gira proporcional.
const TAP_MS = 180;       // menos que isso conta como toque rápido
const CHARGE_MS = 1800;   // tempo de 0 até a força máxima
const charge = { active: false, source: null, t0: 0, level: 0, baseRot: 0, stage: 0, step: 0, raf: 0 };
const spinBtn = $('#spinBtn');

function startCharge(source) {
  if (charge.active || rt.spinning || rt.overlayOpen || rt.dragging) return;
  if (activeOptions().length < 2) { spin(); return; } // spin() já avisa o que falta
  sfx.ensure();
  Object.assign(charge, { active: true, source, t0: performance.now(), level: 0, baseRot: rt.rotation, stage: 0, step: 0 });
  spinBtn.classList.add('charging');
  sfx.chargeStart();

  const tick = (now) => {
    if (!charge.active) return;
    const held = now - charge.t0;
    const raw = clamp((held - TAP_MS) / CHARGE_MS, 0, 1);
    const lvl = 1 - Math.pow(1 - raw, 1.6); // enche mais rápido no começo
    charge.level = lvl;

    // A roleta "puxa pra trás" como um estilingue (e treme quando está quase no máximo)
    const jitter = lvl > 0.6 ? (Math.random() - 0.5) * 0.025 * lvl : 0;
    rt.rotation = charge.baseRot - lvl * 0.4 + jitter;

    // Botão enche, cresce e treme
    spinBtn.style.setProperty('--charge', lvl.toFixed(3));
    if (held > TAP_MS) {
      const s = 1 + lvl * 3;
      spinBtn.style.transform = `translate(${(Math.random() - 0.5) * s}px, ${(Math.random() - 0.5) * s}px) scale(${1 + lvl * 0.07})`;
      const stage = lvl >= 1 ? 3 : lvl > 0.5 ? 2 : 1;
      if (stage !== charge.stage) {
        charge.stage = stage;
        spinBtn.textContent = ['', 'SEGURA...', 'MAIS FORTE!', 'MÁXIMO!'][stage];
        say(['', 'Segura...', 'Mais forte!', 'FORÇA MÁXIMA!'][stage]);
        if (stage === 3) { spinBtn.classList.add('maxed'); sfx.chargeMax(); }
      }
      // vibração curtinha a cada 25% (celular)
      const step = Math.floor(lvl * 4);
      if (step > charge.step) { charge.step = step; if (navigator.vibrate) navigator.vibrate(12); }
    }
    sfx.chargeUpdate(lvl);
    charge.raf = requestAnimationFrame(tick);
  };
  charge.raf = requestAnimationFrame(tick);
}

function resetChargeUI() {
  spinBtn.classList.remove('charging', 'maxed');
  spinBtn.style.transform = '';
  spinBtn.style.setProperty('--charge', '0');
  spinBtn.textContent = 'GIRAR!';
}

function releaseCharge(cancel = false) {
  if (!charge.active) return;
  charge.active = false;
  cancelAnimationFrame(charge.raf);
  const held = performance.now() - charge.t0;
  const lvl = charge.level;
  resetChargeUI();
  if (cancel) {
    sfx.chargeStop(false);
    tween(rt.rotation, charge.baseRot, 300, ease.outCubic);
    say('Pronto pra girar?');
    return;
  }
  const tap = held < TAP_MS || lvl < 0.02;
  sfx.chargeStop(!tap, lvl);
  // força 10..30 → de ~5 voltas em 5s até 10 voltas em 7,5s
  spin(tap ? {} : { power: 10 + lvl * 20 });
}

spinBtn.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  spinBtn.setPointerCapture(e.pointerId);
  startCharge('pointer');
});
spinBtn.addEventListener('pointerup', () => { if (charge.source === 'pointer') releaseCharge(); });
spinBtn.addEventListener('pointercancel', () => { if (charge.source === 'pointer') releaseCharge(true); });
spinBtn.addEventListener('contextmenu', (e) => e.preventDefault()); // segurar no celular não abre menu
// Enter com o botão focado (clique de teclado, sem ponteiro) gira normal
spinBtn.addEventListener('click', (e) => { if (e.detail === 0 && !charge.active) spin(); });

/* ---------- Teclado ---------- */
const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA');

window.addEventListener('keydown', (e) => {
  const isT = e.key === 't' || e.key === 'T';
  if (isTyping(e.target)) {
    // Num campo de texto, um T normal é só digitação. Mas se o T ficar SEGURADO
    // (tecla repetindo), é a trapaça: desfaz o "t" digitado e sai do campo.
    if (isT && e.repeat && (e.target.type === 'text' || e.target.tagName === 'TEXTAREA')) {
      e.preventDefault();
      const el = e.target;
      const pos = el.selectionStart;
      if (pos > 0 && el.value[pos - 1].toLowerCase() === 't') {
        el.value = el.value.slice(0, pos - 1) + el.value.slice(pos);
        el.dispatchEvent(new Event('input'));
      }
      el.blur();
      rt.tChoosing = true;
    }
    return;
  }
  // Cada aperto NOVO do T volta a piscar pra escolher (a repetição da tecla segurada não conta,
  // senão continuaria piscando depois de já ter escolhido)
  if (isT && !e.repeat) rt.tChoosing = true;
  // Esc cancela a trapaça inteira (modo de escolha + opção marcada) e a roleta volta ao normal
  if (e.key === 'Escape' && (cheatReady() || rt.cheatTarget)) {
    rt.tChoosing = false;
    rt.cheatArmedUntil = 0;
    rt.cheatTarget = null;
    return;
  }
  if (e.key === 'Escape' && rt.overlayOpen) { closeOverlay(); return; }
  // Espaço: segurar carrega a força, soltar gira (igual ao botão)
  if (e.code === 'Space' && !rt.overlayOpen) {
    if (e.target.tagName === 'BUTTON' && e.target.id !== 'spinBtn') return;
    e.preventDefault();
    if (!e.repeat) startCharge('key');
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' && charge.source === 'key' && charge.active) {
    e.preventDefault();
    releaseCharge();
  }
  // Soltou o T sem escolher: continua piscando por mais 6s pra dar tempo de clicar
  if ((e.key === 't' || e.key === 'T') && rt.tChoosing) {
    rt.tChoosing = false;
    rt.cheatArmedUntil = performance.now() + 6000;
  }
});
window.addEventListener('blur', () => {
  rt.tChoosing = false;
  releaseCharge(true); // trocou de janela segurando: cancela sem girar
});

/* ---------- Arrastar a roleta ---------- */
function localPoint(e) {
  const r = wheel.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

wheel.addEventListener('pointerdown', (e) => {
  if (rt.spinning || rt.overlayOpen) return;
  const p = localPoint(e);
  const { cx, cy } = geom();

  // Toque no ponteiro: 3 toques rápidos armam a trapaça (no celular)
  const pg = pointerGeom();
  if (Math.hypot(p.x - pg.cx, p.y - (pg.py + pg.len / 2)) < Math.max(pg.w * 1.5, 24)) {
    const now = performance.now();
    rt.taps = rt.taps.filter((t) => now - t < 900);
    rt.taps.push(now);
    if (rt.taps.length >= 3) {
      rt.taps = [];
      rt.cheatArmedUntil = now + 6000; // volta a piscar: escolha (de novo) uma opção
    }
    return;
  }

  // Trapaça: enquanto a bolinha pisca, clicar numa fatia da roleta escolhe essa opção
  if (cheatReady()) {
    const { R } = geom();
    const dist = Math.hypot(p.x - cx, p.y - cy);
    const list = activeOptions();
    if (list.length && dist <= R && dist > R * HUB_RATIO) {
      const seg = TAU / list.length;
      const a = (((Math.atan2(p.y - cy, p.x - cx) - rt.rotation) % TAU) + TAU) % TAU;
      armCheat(list[Math.floor(a / seg) % list.length].id);
    }
    return; // não arrasta nem gira enquanto escolhe
  }

  sfx.ensure();
  rt.dragging = true;
  wheel.setPointerCapture(e.pointerId);
  rt.dragAngle = Math.atan2(p.y - cy, p.x - cx);
  rt.dragSamples = [{ t: performance.now(), r: rt.rotation }];
  rt.dragMoved = 0;
  rt.dragStart = p;
});

wheel.addEventListener('pointermove', (e) => {
  if (!rt.dragging) return;
  const p = localPoint(e);
  const { cx, cy } = geom();
  const ang = Math.atan2(p.y - cy, p.x - cx);
  let d = ang - rt.dragAngle;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  rt.rotation += d;
  rt.dragAngle = ang;
  rt.dragMoved += Math.abs(d);
  const now = performance.now();
  rt.dragSamples.push({ t: now, r: rt.rotation });
  rt.dragSamples = rt.dragSamples.filter((s) => now - s.t < 120);
});

function endDrag(e) {
  if (!rt.dragging) return;
  rt.dragging = false;
  const now = performance.now();
  const s = rt.dragSamples.filter((x) => now - x.t < 120);
  let v = 0;
  if (s.length >= 2) {
    const a = s[0];
    const b = s[s.length - 1];
    const dt = (b.t - a.t) / 1000;
    if (dt > 0.01) v = (b.r - a.r) / dt;
  }
  if (Math.abs(v) > 3) {
    spin({ dir: Math.sign(v), power: Math.abs(v) });
    return;
  }
  // clicar no meio da roleta NÃO gira: só o botão, o Espaço ou arrastar com força
}
wheel.addEventListener('pointerup', endDrag);
wheel.addEventListener('pointercancel', () => { rt.dragging = false; });

/* =========================================================
   Início
   ========================================================= */
/* ---------- Painel lateral (abre/fecha) ---------- */
// Tela larga: o painel fica ao lado da roleta e o site lembra se você deixou aberto ou fechado.
// Tela estreita (celular): o painel abre por cima, e sempre começa fechado.
const isWide = () => window.matchMedia('(min-width: 1000px)').matches;

function setPanel(open, { remember = true } = {}) {
  document.body.classList.toggle('panel-open', open);
  $('#panelOpen').setAttribute('aria-expanded', String(open));
  if (remember && isWide()) {
    state.settings.panelOpen = open;
    save();
  }
}

$('#panelOpen').addEventListener('click', () => {
  setPanel(true);
  $('#panelClose').focus();
});
$('#panelClose').addEventListener('click', () => {
  setPanel(false);
  $('#panelOpen').focus();
});
$('#panelBackdrop').addEventListener('click', () => setPanel(false));
window.addEventListener('keydown', (e) => {
  // Esc fecha o painel no celular (no computador ele é uma barra fixa, fecha pelo botão)
  if (e.key === 'Escape' && !isWide() && document.body.classList.contains('panel-open') && !rt.overlayOpen) {
    setPanel(false);
  }
});

function onResize() {
  resizeWheel();
  fx.resize();
}
window.addEventListener('resize', onResize);
if (window.ResizeObserver) new ResizeObserver(resizeWheel).observe($('#wheelWrap'));

document.body.classList.add('no-anim');
setPanel(isWide() ? state.settings.panelOpen !== false : false, { remember: false });

hydrateIcons();
renderAll();
if (state.players.length) $('#playersCard').open = true;
onResize();
requestAnimationFrame(frame);
// libera as transições depois dos primeiros quadros (evita o painel "deslizar" ao carregar a página)
requestAnimationFrame(() => requestAnimationFrame(() => document.body.classList.remove('no-anim')));
