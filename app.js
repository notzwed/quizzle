const app = document.getElementById('app');
const STORAGE_KEY = 'quizzly_profiles_v3';

const WORDS = {
  it: [
    'amore', 'carta', 'vento', 'piano', 'sogno', 'treno', 'lampo', 'fiore', 'nervo', 'scala',
    'luogo', 'campo', 'grano', 'stile', 'fonte', 'saldo', 'mente', 'prova', 'notte', 'colpo',
    'bravo', 'curva', 'degno', 'tetto', 'bello', 'viale', 'sedia', 'farsi', 'marea', 'firma'
  ].map((w) => w.slice(0, 5)),
  en: [
    'stone', 'flame', 'crane', 'plain', 'dream', 'track', 'light', 'grace', 'sword', 'cloud',
    'shore', 'brain', 'pride', 'sweep', 'frost', 'quick', 'vital', 'mango', 'bloom', 'trace',
    'north', 'smart', 'charm', 'lemon', 'scale', 'solid', 'wrist', 'crown', 'baker', 'tiger'
  ].map((w) => w.slice(0, 5))
};

const MATH_TYPES = [
  'linear-seq',
  'pair-equation',
  'equation-system',
  'arithmetic-expression',
  'exponent-expression',
  'triangle-relations',
  'squares-grid',
  'center-missing',
  'staircase-grid',
  'digit-grid-row',
  'octagon-balance',
  'overlap-count',
  'progression-chain',
  'cross-sum',
  'ring-ops'
];
const MAX_MATH_INPUT_LENGTH = 12;
const MAX_MATH_ANSWER = 10 ** MAX_MATH_INPUT_LENGTH - 1;

const state = {
  screen: 'main',
  animate: true,
  toast: '',
  toastKey: 0,
  install: {
    show: false,
    deferredPrompt: null,
    ios: false
  },
  profiles: loadProfiles(),
  currentPlayer: '',
  wordle: {
    level: 1,
    language: null,
    answer: '',
    guesses: [],
    status: 'playing'
  },
  math: {
    level: 1,
    mode: 'progress',
    replayLevel: null,
    challenge: null,
    input: ''
  }
};

state.currentPlayer = state.profiles.current || Object.keys(state.profiles.players)[0] || 'Player 1';
ensurePlayer(state.currentPlayer);
syncStateFromProfile();

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

function initInstallPrompt() {
  state.install.ios = isIOS();
  if (!isStandalone()) {
    state.install.show = true;
  }
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.install.deferredPrompt = event;
  if (!isStandalone()) {
    state.install.show = true;
    render();
  }
});

window.addEventListener('appinstalled', () => {
  state.install.show = false;
  state.install.deferredPrompt = null;
  render();
});

function createDefaultProfile() {
  return {
    wordleLevel: 1,
    mathLevel: 1,
    mathHistory: {},
    lastMathTypes: [],
    mathNonce: 1,
    stats: {
      wordleSolved: 0,
      mathSolved: 0,
      hintsUsed: 0
    },
    settings: {
      reduceMotion: false
    }
  };
}

function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.players) return parsed;
    }
  } catch {}

  return {
    current: 'Player 1',
    players: { 'Player 1': createDefaultProfile() }
  };
}

function saveProfiles() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.profiles));
}

function ensurePlayer(name) {
  if (!state.profiles.players[name]) state.profiles.players[name] = createDefaultProfile();
  normalizeProfile(state.profiles.players[name]);
}

function normalizeProfile(profile) {
  if (!profile.mathHistory) profile.mathHistory = {};
  if (!Array.isArray(profile.lastMathTypes)) profile.lastMathTypes = [];
  if (typeof profile.mathNonce !== 'number') profile.mathNonce = 1;
  if (!profile.stats) profile.stats = { wordleSolved: 0, mathSolved: 0, hintsUsed: 0 };
  if (typeof profile.stats.wordleSolved !== 'number') profile.stats.wordleSolved = 0;
  if (typeof profile.stats.mathSolved !== 'number') profile.stats.mathSolved = 0;
  if (typeof profile.stats.hintsUsed !== 'number') profile.stats.hintsUsed = 0;
  if (!profile.settings) profile.settings = { reduceMotion: false };
  if (typeof profile.settings.reduceMotion !== 'boolean') profile.settings.reduceMotion = false;
}

function getProfile() {
  ensurePlayer(state.currentPlayer);
  return state.profiles.players[state.currentPlayer];
}

function syncStateFromProfile() {
  const p = getProfile();
  state.wordle.level = p.wordleLevel;
  state.math.level = p.mathLevel;
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 1000000;
  }
  return hash;
}

function seededRandom(seed) {
  let value = seed % 2147483647;
  if (value <= 0) value += 2147483646;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function randRange(rand, min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function shuffle(list, rand) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function computeTier(level) {
  // Keep difficulty growth bounded so very high levels remain playable indefinitely.
  return Math.min(24, 1 + Math.floor((level - 1) / 4));
}

function setScreen(screen, animate = true) {
  const profile = getProfile();
  state.screen = screen;
  state.animate = animate && !profile.settings.reduceMotion;
  render();
}

function showToast(message) {
  state.toast = message;
  state.toastKey += 1;
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pickByLevel(list, level, offset = 0) {
  const rand = seededRandom(level * 971 + offset * 131 + hashText(state.currentPlayer));
  return list[Math.floor(rand() * list.length)];
}

function setupWordleRound() {
  const lang = state.wordle.language || 'it';
  state.wordle.answer = pickByLevel(WORDS[lang], state.wordle.level, lang === 'it' ? 1 : 2);
  state.wordle.guesses = [];
  state.wordle.status = 'playing';
}

function triesAllowed(level) {
  return Math.max(3, 6 - Math.floor((level - 1) / 8));
}

function evaluateWordleGuess(guess, answer) {
  const result = Array(guess.length).fill('miss');
  const answerChars = answer.split('');
  const guessChars = guess.split('');
  const used = Array(answerChars.length).fill(false);

  for (let i = 0; i < guessChars.length; i += 1) {
    if (guessChars[i] === answerChars[i]) {
      result[i] = 'hit';
      used[i] = true;
    }
  }

  for (let i = 0; i < guessChars.length; i += 1) {
    if (result[i] === 'hit') continue;
    const idx = answerChars.findIndex((c, pos) => c === guessChars[i] && !used[pos]);
    if (idx !== -1) {
      result[i] = 'close';
      used[idx] = true;
    }
  }

  return result;
}

function buildMathOptions(answer, tier, rand) {
  const spread = Math.max(3, Math.floor(tier * 1.8));
  const deltas = [-1, 1, -2, 2, -3, 3, -spread, spread, -(spread + 2), spread + 2, -(spread + 5), spread + 5];
  const options = [answer];

  while (options.length < 4) {
    const d = deltas[randRange(rand, 0, deltas.length - 1)];
    const candidate = answer + d;
    if (candidate >= 0 && !options.includes(candidate)) options.push(candidate);
  }

  return shuffle(options, rand);
}

function unlockedMathTypes(level) {
  const tier = computeTier(level);
  return MATH_TYPES.slice(0, Math.min(MATH_TYPES.length, 4 + Math.floor(tier / 2)));
}

function chooseMathType(level, profile, rand, forReplay = false) {
  const unlocked = unlockedMathTypes(level);
  if (forReplay) return unlocked[level % unlocked.length];

  const recent = profile.lastMathTypes || [];
  let pool = unlocked.filter((t) => !recent.includes(t));
  if (!pool.length) pool = unlocked;

  const type = pool[randRange(rand, 0, pool.length - 1)];
  profile.lastMathTypes = [...recent, type].slice(-3);
  return type;
}

function buildLinearSeq(level, tier, rand) {
  const variant = randRange(rand, 0, 2);

  if (variant === 0) {
    const start = randRange(rand, 2, 10 + tier);
    const step = randRange(rand, 2, 8 + Math.floor(tier / 2));
    const seq = [start, start + step, start + step * 2, start + step * 3];
    return {
      type: 'linear-seq',
      answer: start + step * 4,
      choices: buildMathOptions(start + step * 4, tier, rand),
      hint: 'Constant difference',
      data: { text: `${seq.join(', ')}, ?` }
    };
  }

  if (variant === 1) {
    const start = randRange(rand, 3, 8 + tier);
    const d1 = randRange(rand, 1, 4 + Math.floor(tier / 3));
    const d2 = randRange(rand, 1, 3 + Math.floor(tier / 4));
    const seq = [start];
    for (let i = 1; i < 5; i += 1) {
      const d = i % 2 === 1 ? d1 : d2;
      seq.push(seq[i - 1] + d);
    }
    return {
      type: 'linear-seq',
      answer: seq[4],
      choices: buildMathOptions(seq[4], tier, rand),
      hint: 'Two-step alternating pattern',
      data: { text: `${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, ?` }
    };
  }

  const start = randRange(rand, 1, 8 + tier);
  const d0 = randRange(rand, 2, 6 + Math.floor(tier / 2));
  const accel = randRange(rand, 1, 3);
  const seq = [start];
  let d = d0;
  for (let i = 1; i < 5; i += 1) {
    seq.push(seq[i - 1] + d);
    d += accel;
  }
  return {
    type: 'linear-seq',
    answer: seq[4],
    choices: buildMathOptions(seq[4], tier, rand),
    hint: 'Growing difference',
    data: { text: `${seq[0]}, ${seq[1]}, ${seq[2]}, ${seq[3]}, ?` }
  };
}

function buildPairEquation(level, tier, rand) {
  const variant = randRange(rand, 0, 3);
  const k = randRange(rand, 2, 5 + Math.floor(tier / 2));
  const rows = [];

  const calc = (a, b) => {
    if (variant === 0) return a * a + b;
    if (variant === 1) return a * b + a + b;
    if (variant === 2) return a * b + k;
    return (a + b) * (a - 1);
  };

  for (let i = 0; i < 4; i += 1) {
    const a = randRange(rand, 2, 9 + Math.floor(tier / 2));
    const b = randRange(rand, 2, 9 + Math.floor(tier / 2));
    rows.push({ a, b, r: calc(a, b) });
  }

  return {
    type: 'pair-equation',
    answer: rows[3].r,
    choices: buildMathOptions(rows[3].r, tier, rand),
    hint: variant === 2 ? `a*b + ${k}` : 'Same rule in all lines',
    data: { rows }
  };
}

function buildEquationSystem(level, tier, rand) {
  const b = randRange(rand, 2, 9 + Math.floor(tier / 2));
  const ratio = randRange(rand, 2, 6 + Math.floor(tier / 3));
  const a = b * ratio;

  const s1 = a + b;
  const s2 = a - b;

  const askVariant = randRange(rand, 0, 2);
  const askText = askVariant === 0 ? 'A / B = ?' : askVariant === 1 ? 'A * B = ?' : 'A + B = ?';
  const answer = askVariant === 0 ? a / b : askVariant === 1 ? a * b : a + b;

  return {
    type: 'equation-system',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Solve A and B first',
    data: { lines: [`A + B = ${s1}`, `A - B = ${s2}`, askText] }
  };
}

function buildArithmeticExpression(level, tier, rand) {
  const variant = randRange(rand, 0, 3);
  const a = randRange(rand, 2, 9 + Math.floor(tier / 2));
  const b = randRange(rand, 2, 9 + Math.floor(tier / 2));
  const c = randRange(rand, 2, 9 + Math.floor(tier / 2));

  let expression = '';
  let answer = 0;

  if (variant === 0) {
    const top = a + b * c;
    const d = randRange(rand, 2, Math.max(2, top - 1));
    expression = `${a} + ${b} * ${c} - ${d} = ?`;
    answer = top - d;
  } else if (variant === 1) {
    const top = (a + b) * c;
    const d = randRange(rand, 2, Math.max(2, top - 1));
    expression = `(${a} + ${b}) * ${c} - ${d} = ?`;
    answer = top - d;
  } else if (variant === 2) {
    const d = randRange(rand, 2, 9 + Math.floor(tier / 2));
    const m = b * c;
    const top = m / b + a;
    const safeD = Math.min(d, Math.max(2, top - 1));
    expression = `${m} / ${b} + ${a} - ${safeD} = ?`;
    answer = top - safeD;
  } else {
    const left = a * b;
    const right = c * randRange(rand, 2, 9 + Math.floor(tier / 2));
    const top = Math.max(left, right);
    const bottom = Math.min(left, right);
    expression = `${top} - ${bottom} = ?`;
    answer = top - bottom;
  }

  return {
    type: 'arithmetic-expression',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Operator precedence matters',
    data: { expression }
  };
}

function buildExponentExpression(level, tier, rand) {
  const variant = randRange(rand, 0, 2);
  let expression = '';
  let answer = 0;

  if (variant === 0) {
    const a = randRange(rand, 3, 6);
    const b = randRange(rand, 1, a - 1);
    const exp = randRange(rand, 2, 4);
    const base = a * a - b * b;
    answer = base ** exp;
    expression = `(${a}^2 - ${b}^2)^${exp} = ?`;
  } else if (variant === 1) {
    const a = randRange(rand, 2, 5);
    const b = randRange(rand, 2, 4);
    const c = randRange(rand, 1, 3);
    answer = a ** b + c ** b;
    expression = `${a}^${b} + ${c}^${b} = ?`;
  } else {
    const a = randRange(rand, 2, 6);
    const b = randRange(rand, 2, 5);
    const c = randRange(rand, 1, 3);
    answer = (a + b) ** c;
    expression = `(${a} + ${b})^${c} = ?`;
  }

  if (answer > 999999) {
    answer %= 100000;
    expression = `${expression.replace('= ?', ' mod 100000 = ?')}`;
  }

  return {
    type: 'exponent-expression',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Powers first',
    data: { expression }
  };
}

function triangleRuleResult(rule, a, b, k) {
  if (rule === 0) return a + b + k;
  if (rule === 1) return 2 * b - a;
  if (rule === 2) return a * b - k;
  return a + (b - a) * 2;
}

function buildTriangleRelations(level, tier, rand) {
  const rule = randRange(rand, 0, 3);
  const k = randRange(rand, 1, 6);

  const t1 = { a: randRange(rand, 2, 9), b: randRange(rand, 6, 14) };
  const t2 = { a: randRange(rand, 3, 10), b: randRange(rand, 7, 15) };
  const t3 = { a: randRange(rand, 2, 10), b: randRange(rand, 6, 15) };

  t1.c = triangleRuleResult(rule, t1.a, t1.b, k);
  t2.c = triangleRuleResult(rule, t2.a, t2.b, k);
  t3.c = triangleRuleResult(rule, t3.a, t3.b, k);

  return {
    type: 'triangle-relations',
    answer: t3.c,
    choices: buildMathOptions(t3.c, tier, rand),
    hint: rule === 0 ? `a + b + ${k}` : 'Apply same triangle rule',
    data: { t1, t2, t3 }
  };
}

function buildSquaresGrid(level, tier, rand) {
  const missing = randRange(rand, 1, 9);
  const nums = [];
  for (let i = 1; i <= 9; i += 1) {
    if (i !== missing) nums.push(i * i);
  }
  return {
    type: 'squares-grid',
    answer: missing * missing,
    choices: buildMathOptions(missing * missing, tier, rand),
    hint: 'Perfect squares',
    data: { cells: shuffle([...nums, null], rand) }
  };
}

function buildCenterMissing(level, tier, rand) {
  const all = shuffle(Array.from({ length: 9 }, (_, i) => (i + 1) ** 2), rand);
  const answer = all[4];
  const cells = [...all];
  cells[4] = null;

  return {
    type: 'center-missing',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Center belongs to same set',
    data: { cells }
  };
}

function buildStaircaseGrid(level, tier, rand) {
  const r1 = randRange(rand, 20, 45);
  const r2 = randRange(rand, 9, 18);
  const r3 = randRange(rand, 2, 8);

  const top = [randRange(rand, 35, 80), 0, 0, 0];
  top[1] = top[0] - r1;
  top[2] = top[1] - r2;
  top[3] = top[2] - r3;

  const row2 = [top[0] - top[1], top[1] - top[2], top[2] - top[3]];
  const row3 = [row2[0] - row2[1], row2[1] - row2[2]];
  const row4 = [row3[0] - row3[1]];

  const missingSpot = randRange(rand, 0, 2);
  const answer = missingSpot === 0 ? row2[2] : missingSpot === 1 ? row3[1] : row4[0];

  return {
    type: 'staircase-grid',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Each lower cell uses left-right',
    data: { top, row2, row3, row4, missingSpot }
  };
}

function digitFeatures(n, variant) {
  if (variant === 0) return [n, n % 3, n % 2, Math.floor(n / 2)];
  if (variant === 1) {
    const ds = String(n).split('').reduce((acc, x) => acc + Number(x), 0);
    return [n, ds, n % 2, ds % 3];
  }
  const ones = n.toString(2).split('').filter((x) => x === '1').length;
  return [n, ones, n % 4, n - Math.floor(n / 2)];
}

function buildDigitGridRow(level, tier, rand) {
  const variant = randRange(rand, 0, 2);
  const n1 = randRange(rand, 2, 6);
  const step = randRange(rand, 1, 3);
  const nums = [n1, n1 + step, n1 + step * 2, n1 + step * 3];

  const rows = nums.map((n) => digitFeatures(n, variant));
  const missingCol = randRange(rand, 0, 3);
  const answer = rows[3][missingCol];
  rows[3][missingCol] = null;

  return {
    type: 'digit-grid-row',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Last row follows same column logic',
    data: { rows }
  };
}

function buildOctagon(level, tier, rand) {
  const top = randRange(rand, 5, 12 + tier);
  const rightTop = randRange(rand, 5, 12 + tier);
  const rightBottom = randRange(rand, 5, 12 + tier);
  const leftBottom = randRange(rand, 5, 12 + tier);

  const leftTop = top + leftBottom;
  const left = leftTop + leftBottom;
  const bottom = rightTop * rightBottom;
  const right = rightTop + rightBottom;

  return {
    type: 'octagon-balance',
    answer: right,
    choices: buildMathOptions(right, tier, rand),
    hint: 'Neighbors define sides',
    data: { labels: [top, rightTop, null, rightBottom, bottom, leftBottom, left, leftTop] }
  };
}

function buildOverlap(level, tier, rand) {
  const count = rand() > 0.5 ? 3 : 4;
  const answer = count * count + 1;

  return {
    type: 'overlap-count',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Count all zones',
    data: { count }
  };
}

function buildProgressionChain(level, tier, rand) {
  const start = randRange(rand, 3, 8 + tier);
  const d0 = randRange(rand, 1, 3 + Math.floor(tier / 3));
  const accel = randRange(rand, 1, 2 + Math.floor(tier / 4));
  const seq = [start];
  let d = d0;

  for (let i = 1; i < 5; i += 1) {
    seq.push(seq[i - 1] + d);
    d += accel;
  }

  return {
    type: 'progression-chain',
    answer: seq[4],
    choices: buildMathOptions(seq[4], tier, rand),
    hint: 'Difference increments',
    data: { seq: seq.slice(0, 4) }
  };
}

function buildCrossSum(level, tier, rand) {
  const left = randRange(rand, 3, 12 + Math.floor(tier / 2));
  const right = randRange(rand, 3, 12 + Math.floor(tier / 2));
  const verticalMin = Math.max(8, left - right + 2);
  const up = randRange(rand, Math.max(4, Math.floor(verticalMin / 2)), 20 + tier);
  let down = randRange(rand, 4, 15 + Math.floor(tier / 2));
  let center = up + down - left + right;
  if (center < 1) {
    down += 1 - center;
    center = up + down - left + right;
  }

  return {
    type: 'cross-sum',
    answer: center,
    choices: buildMathOptions(center, tier, rand),
    hint: 'Vertical and horizontal combine',
    data: { up, left, right, down }
  };
}

function buildRingOps(level, tier, rand) {
  const limit = 9 + Math.floor(tier / 2);
  const a = randRange(rand, 2, limit);
  const b = randRange(rand, 2, limit);
  const maxSub = Math.max(2, a * b - 1);
  const sub = randRange(rand, 2, Math.min(limit, maxSub));
  const values = [
    a,
    b,
    randRange(rand, 2, limit),
    randRange(rand, 2, limit),
    sub,
    randRange(rand, 2, limit)
  ];
  const answer = a * b - sub;

  return {
    type: 'ring-ops',
    answer,
    choices: buildMathOptions(answer, tier, rand),
    hint: 'Link top pair and lower-left',
    data: { values }
  };
}

function buildMathByType(type, level, tier, rand) {
  if (type === 'linear-seq') return buildLinearSeq(level, tier, rand);
  if (type === 'pair-equation') return buildPairEquation(level, tier, rand);
  if (type === 'equation-system') return buildEquationSystem(level, tier, rand);
  if (type === 'arithmetic-expression') return buildArithmeticExpression(level, tier, rand);
  if (type === 'exponent-expression') return buildExponentExpression(level, tier, rand);
  if (type === 'triangle-relations') return buildTriangleRelations(level, tier, rand);
  if (type === 'squares-grid') return buildSquaresGrid(level, tier, rand);
  if (type === 'center-missing') return buildCenterMissing(level, tier, rand);
  if (type === 'staircase-grid') return buildStaircaseGrid(level, tier, rand);
  if (type === 'digit-grid-row') return buildDigitGridRow(level, tier, rand);
  if (type === 'octagon-balance') return buildOctagon(level, tier, rand);
  if (type === 'overlap-count') return buildOverlap(level, tier, rand);
  if (type === 'progression-chain') return buildProgressionChain(level, tier, rand);
  if (type === 'cross-sum') return buildCrossSum(level, tier, rand);
  return buildRingOps(level, tier, rand);
}

function hasRenderableMathData(challenge) {
  if (!challenge || typeof challenge !== 'object' || !challenge.data) return false;
  const { type, data } = challenge;

  if (type === 'linear-seq') return typeof data.text === 'string' && data.text.length > 0;
  if (type === 'pair-equation') return Array.isArray(data.rows) && data.rows.length >= 4;
  if (type === 'equation-system') return Array.isArray(data.lines) && data.lines.length >= 2;
  if (type === 'arithmetic-expression' || type === 'exponent-expression') {
    return typeof data.expression === 'string' && data.expression.length > 0;
  }
  if (type === 'triangle-relations') return Boolean(data.t1 && data.t2 && data.t3);
  if (type === 'squares-grid' || type === 'center-missing') return Array.isArray(data.cells) && data.cells.length === 9;
  if (type === 'staircase-grid' || type === 'digit-grid-row') return Array.isArray(data.rows) && data.rows.length === 4;
  if (type === 'octagon-balance') return Array.isArray(data.ring) && data.ring.length === 8;
  if (type === 'overlap-count') return typeof data.count === 'number';
  if (type === 'progression-chain') return Array.isArray(data.values) && data.values.length === 5;
  if (type === 'cross-sum') {
    return (
      typeof data.up === 'number' &&
      typeof data.down === 'number' &&
      typeof data.left === 'number' &&
      typeof data.right === 'number'
    );
  }
  if (type === 'ring-ops') return Array.isArray(data.values) && data.values.length === 6;
  return false;
}

function isMathChallengeValid(challenge) {
  if (!challenge || typeof challenge !== 'object') return false;
  if (!MATH_TYPES.includes(challenge.type)) return false;
  if (!Number.isInteger(challenge.answer) || challenge.answer < 0 || challenge.answer > MAX_MATH_ANSWER) return false;
  if (!Array.isArray(challenge.choices) || challenge.choices.length !== 4) return false;
  if (!challenge.choices.includes(challenge.answer)) return false;
  if (!challenge.choices.every((choice) => Number.isInteger(choice) && choice >= 0)) return false;
  return hasRenderableMathData(challenge);
}

function generateMathChallenge(level, forReplay = false) {
  const profile = getProfile();
  const tier = computeTier(level);
  const nonce = forReplay ? 1 : profile.mathNonce;
  const seed = level * 1543 + hashText(state.currentPlayer) * 17 + nonce * 131;
  const rand = seededRandom(seed);

  const type = chooseMathType(level, profile, rand, forReplay);
  const challenge = buildMathByType(type, level, tier, rand);

  const safeChallenge = isMathChallengeValid(challenge)
    ? challenge
    : buildLinearSeq(level, tier, seededRandom(seed + 911));

  if (!forReplay) profile.mathNonce += 1;
  return safeChallenge;
}

function getOrCreateMathLevel(level, forReplay = false) {
  const profile = getProfile();
  const existing = profile.mathHistory[level];
  const invalidExisting = existing && !isMathChallengeValid(existing);

  if (!existing || invalidExisting) {
    profile.mathHistory[level] = generateMathChallenge(level, forReplay);
    saveProfiles();
  }
  return profile.mathHistory[level];
}

function initMathRoundProgress() {
  const p = getProfile();
  state.math.mode = 'progress';
  state.math.replayLevel = null;
  state.math.level = p.mathLevel;
  state.math.challenge = getOrCreateMathLevel(state.math.level, false);
  state.math.input = '';
}

function initMathReplay(level) {
  state.math.mode = 'replay';
  state.math.replayLevel = level;
  state.math.level = level;
  state.math.challenge = getOrCreateMathLevel(level, true);
  state.math.input = '';
}

function mathDisplayLevel() {
  if (state.math.mode === 'replay') return `Level ${state.math.level} | Replay`;
  return `Level ${state.math.level}`;
}

function toastMarkup() {
  if (!state.toast) return '<div class="toast"></div>';
  return `<div class="toast show" data-toast-key="${state.toastKey}">${escapeHtml(state.toast)}</div>`;
}

function renderMain() {
  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="main-panel">
        <div class="main-shell">
          <div class="menu-right">
            <button class="icon-btn side" data-action="go-settings" aria-label="Settings">
              <img src="icons/Quizzly (1).svg" alt="" class="side-icon" />
            </button>
            <button class="icon-btn side" data-action="go-achievements" aria-label="Achievements">
              <img src="icons/Quizzly.svg" alt="" class="side-icon" />
            </button>
          </div>
        </div>
        <div class="core menu-core">
          <div class="hero-title">Quizzle</div>
          <div class="hero-sub">Dev c3rry</div>
          <div class="menu-buttons menu-style">
            <button class="main-btn game-pill" data-action="go-math">
              <span class="play-outline"></span>
              <span>Math Riddles</span>
            </button>
            <button class="main-btn game-pill" data-action="go-wordle">
              <span class="play-outline"></span>
              <span>Wordle</span>
            </button>
          </div>
        </div>
      </div>
      ${toastMarkup()}
      ${installPromptMarkup()}
    </section>
  `;
}

function installPromptMarkup() {
  if (!state.install.show) return '';
  const hint = state.install.ios
    ? 'Tap Share and then "Add to Home Screen".'
    : 'Tap install to add Quizzle to your home screen.';
  return `
    <div class="install-overlay" data-action="noop">
      <div class="install-modal">
        <div class="install-title">Add Quizzle to Home</div>
        <div class="install-hint">${hint}</div>
        <button class="install-btn" data-action="install-app">Install Quizzle</button>
      </div>
    </div>
  `;
}

function renderSettings() {
  const profile = getProfile();
  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-main">&lsaquo;</button>
        <div class="level">Settings</div>
        <span></span>
      </div>
      <div class="core">
        <button class="player-btn" data-action="toggle-motion">
          <span>Reduced Motion</span>
          <span class="player-meta">${profile.settings.reduceMotion ? 'ON' : 'OFF'}</span>
        </button>
        <div class="settings-note">Developer: c3rry</div>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderAchievements() {
  const profile = getProfile();
  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-main">&lsaquo;</button>
        <div class="level">Achievements</div>
        <span></span>
      </div>
      <div class="core">
        <div class="achievement-card">
          <div class="achievement-row"><span>Math Solved</span><strong>${profile.stats.mathSolved}</strong></div>
          <div class="achievement-row"><span>Wordle Solved</span><strong>${profile.stats.wordleSolved}</strong></div>
          <div class="achievement-row"><span>Hints Used</span><strong>${profile.stats.hintsUsed}</strong></div>
        </div>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderProfiles() {
  const players = Object.entries(state.profiles.players)
    .map(([name, profile]) => {
      const active = name === state.currentPlayer ? 'active' : '';
      return `
        <button class="player-btn ${active}" data-action="switch-player" data-player="${escapeHtml(name)}">
          <span>${escapeHtml(name)}</span>
          <span class="player-meta">W ${profile.wordleLevel} | M ${profile.mathLevel}</span>
        </button>
      `;
    })
    .join('');

  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-main">&lsaquo;</button>
        <div class="level">Players</div>
        <span></span>
      </div>
      <div class="core">
        <div class="players-list">${players}</div>
        <form id="player-form" class="player-form">
          <input id="player-input" class="player-input" maxlength="14" autocomplete="off" placeholder="New player" />
          <button class="enter-btn" type="submit">ADD</button>
        </form>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderWordleLanguage() {
  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-main">&lsaquo;</button>
        <div class="level">Wordle</div>
        <span></span>
      </div>
      <div class="core">
        <div class="lang-row">
          <button class="choice-btn" data-action="set-wordle-lang" data-lang="it">Italiano</button>
          <button class="choice-btn" data-action="set-wordle-lang" data-lang="en">English</button>
        </div>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderWordle() {
  const maxTries = triesAllowed(state.wordle.level);
  const rows = [];

  for (let r = 0; r < maxTries; r += 1) {
    const guess = state.wordle.guesses[r];
    const evaluation = guess ? evaluateWordleGuess(guess, state.wordle.answer) : null;
    const letters = guess ? guess.split('') : Array(5).fill('');
    const cells = letters
      .map((letter, i) => {
        const cls = evaluation ? evaluation[i] : '';
        return `<div class="tile ${cls}">${escapeHtml(letter)}</div>`;
      })
      .join('');
    rows.push(`<div class="wordle-row">${cells}</div>`);
  }

  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="go-wordle-lang">&lsaquo;</button>
        <div class="level">Level ${state.wordle.level}</div>
        <span></span>
      </div>
      <div class="core">
        <div class="wordle-board">${rows.join('')}</div>
        <form id="wordle-form" class="wordle-input-wrap">
          <input class="wordle-input" id="wordle-input" maxlength="5" autocomplete="off" />
          <button class="enter-btn" type="submit">ENTER</button>
        </form>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderMath() {
  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-main">&lsaquo;</button>
        <div class="level">${mathDisplayLevel()}</div>
        <button class="icon-btn" data-action="go-math-levels">&#9638;</button>
      </div>
      <div class="core math-core">
        <div class="math-puzzle">
          <canvas id="math-canvas" class="math-canvas"></canvas>
        </div>
        <div class="answer-strip">
          <input class="answer-input" id="math-answer-input" placeholder="Answer" inputmode="numeric" maxlength="${MAX_MATH_INPUT_LENGTH}" value="${state.math.input}" />
          <button class="answer-btn" data-action="math-clear">&#10005;</button>
          <button class="help-btn" data-action="math-hint" aria-label="Hint">
            <img src="icons/Quizzly (2).svg" alt="" class="hint-icon" />
          </button>
          <button class="enter-btn" data-action="math-submit">ENTER</button>
        </div>
        <div class="numpad">
          ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
            .map((d) => `<button class="key" data-action="math-digit" data-digit="${d}">${d}</button>`)
            .join('')}
        </div>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function renderMathLevels() {
  const profile = getProfile();
  const unlocked = Math.max(1, profile.mathLevel - 1);
  const buttons = Array.from({ length: unlocked }, (_, i) => i + 1)
    .map((lvl) => `<button class="lvl-btn" data-action="replay-level" data-level="${lvl}">${lvl}</button>`)
    .join('');

  return `
    <section class="screen ${state.animate ? 'transition' : ''}">
      <div class="topbar">
        <button class="icon-btn" data-action="back-math">&lsaquo;</button>
        <div class="level">Math Levels</div>
        <button class="icon-btn" data-action="continue-math">&#9654;</button>
      </div>
      <div class="core">
        <div class="levels-grid">${buttons}</div>
      </div>
      ${toastMarkup()}
    </section>
  `;
}

function drawGrid3(ctx, w, h, cells) {
  const size = Math.min(w, h) * 0.64;
  const x = (w - size) / 2;
  const y = (h - size) / 2;
  const cell = size / 3;

  ctx.strokeStyle = '#707784';
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 3; i += 1) {
    ctx.beginPath();
    ctx.moveTo(x, y + cell * i);
    ctx.lineTo(x + size, y + cell * i);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + cell * i, y);
    ctx.lineTo(x + cell * i, y + size);
    ctx.stroke();
  }

  ctx.fillStyle = '#dce1e8';
  ctx.font = `${Math.floor(cell * 0.34)}px Inter`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  cells.forEach((v, i) => {
    const cx = x + (i % 3) * cell + cell / 2;
    const cy = y + Math.floor(i / 3) * cell + cell / 2;
    ctx.fillText(v === null ? '?' : String(v), cx, cy);
  });
}

function drawMathChallenge(challenge, ctx, w, h) {
  const textScale = 1.2;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1e232b';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#707784';
  ctx.fillStyle = '#dce1e8';
  ctx.lineWidth = 1.6;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (challenge.type === 'squares-grid' || challenge.type === 'center-missing') {
    drawGrid3(ctx, w, h, challenge.data.cells);
    return;
  }

  if (challenge.type === 'linear-seq') {
    ctx.font = `${Math.floor(Math.min(w, h) * 0.11 * textScale)}px Inter`;
    ctx.fillText(challenge.data.text, w / 2, h / 2);
    return;
  }

  if (challenge.type === 'pair-equation') {
    ctx.font = `${Math.floor(Math.min(w, h) * 0.11 * textScale)}px Inter`;
    const startY = h * 0.28;
    const gap = h * 0.14;
    challenge.data.rows.forEach((row, i) => {
      const r = i === 3 ? '?' : row.r;
      ctx.fillText(`${row.a}, ${row.b} = ${r}`, w / 2, startY + i * gap);
    });
    return;
  }

  if (challenge.type === 'equation-system') {
    const lines = challenge.data.lines;
    ctx.font = `${Math.floor(Math.min(w, h) * 0.12 * textScale)}px Inter`;
    const startY = h * 0.40;
    const gap = h * 0.13;
    lines.forEach((line, i) => {
      ctx.fillText(line, w / 2, startY + i * gap);
    });
    return;
  }

  if (challenge.type === 'arithmetic-expression' || challenge.type === 'exponent-expression') {
    ctx.font = `${Math.floor(Math.min(w, h) * 0.12 * textScale)}px Inter`;
    ctx.fillText(challenge.data.expression, w / 2, h / 2);
    return;
  }

  if (challenge.type === 'triangle-relations') {
    const { t1, t2, t3 } = challenge.data;
    const positions = [
      [w * 0.28, h * 0.34],
      [w * 0.68, h * 0.34],
      [w * 0.48, h * 0.63]
    ];
    const tris = [t1, t2, t3];

    ctx.font = `${Math.floor(Math.min(w, h) * 0.10 * textScale)}px Inter`;

    tris.forEach((t, idx) => {
      const [cx, cy] = positions[idx];
      const size = Math.min(w, h) * 0.08;
      ctx.beginPath();
      ctx.moveTo(cx - size, cy - size * 0.6);
      ctx.lineTo(cx + size, cy - size * 0.6);
      ctx.lineTo(cx, cy + size);
      ctx.closePath();
      ctx.stroke();

      ctx.fillText(String(t.a), cx - size * 1.4, cy - size * 1.2);
      ctx.fillText(String(t.b), cx + size * 1.4, cy - size * 1.2);
      ctx.fillText(idx < 2 ? String(t.c) : '?', cx, cy + size * 1.9);
    });
    return;
  }

  if (challenge.type === 'staircase-grid') {
    const { top, row2, row3, row4, missingSpot } = challenge.data;
    const cell = Math.min(w, h) * 0.12;
    const startX = w * 0.18;
    const startY = h * 0.28;

    function box(x, y, text) {
      ctx.strokeRect(x, y, cell, cell);
      ctx.fillText(text, x + cell / 2, y + cell / 2);
    }

    ctx.font = `${Math.floor(cell * 0.48)}px Inter`;
    for (let i = 0; i < 4; i += 1) box(startX + i * cell, startY, String(top[i]));
    for (let i = 0; i < 3; i += 1) {
      const t = missingSpot === 0 && i === 2 ? '?' : String(row2[i]);
      box(startX + (i + 1) * cell, startY + cell, t);
    }
    for (let i = 0; i < 2; i += 1) {
      const t = missingSpot === 1 && i === 1 ? '?' : String(row3[i]);
      box(startX + (i + 2) * cell, startY + cell * 2, t);
    }
    box(startX + cell * 3, startY + cell * 3, missingSpot === 2 ? '?' : String(row4[0]));
    return;
  }

  if (challenge.type === 'digit-grid-row') {
    const rows = challenge.data.rows;
    const size = Math.min(w, h) * 0.64;
    const x = (w - size) / 2;
    const y = (h - size) / 2;
    const cell = size / 4;

    ctx.lineWidth = 1.4;
    for (let r = 0; r <= 4; r += 1) {
      ctx.beginPath();
      ctx.moveTo(x, y + r * cell);
      ctx.lineTo(x + size, y + r * cell);
      ctx.stroke();
    }
    for (let c = 0; c <= 4; c += 1) {
      ctx.beginPath();
      ctx.moveTo(x + c * cell, y);
      ctx.lineTo(x + c * cell, y + size);
      ctx.stroke();
    }

    ctx.font = `${Math.floor(cell * 0.48)}px Inter`;
    rows.forEach((row, r) => {
      row.forEach((val, c) => {
        ctx.fillText(val === null ? '?' : String(val), x + c * cell + cell / 2, y + r * cell + cell / 2);
      });
    });
    return;
  }

  if (challenge.type === 'octagon-balance') {
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.min(w, h) * 0.22;

    const verts = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = (-Math.PI / 2) + (i * Math.PI) / 4;
      verts.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }

    ctx.beginPath();
    ctx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i += 1) ctx.lineTo(verts[i].x, verts[i].y);
    ctx.closePath();
    ctx.stroke();

    ctx.font = `${Math.floor(r * 0.38)}px Inter`;
    challenge.data.labels.forEach((label, i) => {
      const angle = (-Math.PI / 2) + (i * Math.PI) / 4;
      const lr = r * 1.38;
      ctx.fillText(label === null ? '?' : String(label), cx + Math.cos(angle) * lr, cy + Math.sin(angle) * lr);
    });
    return;
  }

  if (challenge.type === 'overlap-count') {
    const unit = Math.min(w, h) * 0.16;
    const refX = w * 0.30;
    const refY = h * 0.28;

    ctx.strokeRect(refX - unit / 2, refY - unit / 2, unit, unit);
    ctx.beginPath();
    ctx.moveTo(refX, refY - unit / 2);
    ctx.lineTo(refX, refY + unit / 2);
    ctx.moveTo(refX - unit / 2, refY);
    ctx.lineTo(refX + unit / 2, refY);
    ctx.stroke();

    ctx.font = `${Math.floor(unit * 0.4)}px Inter`;
    ctx.textAlign = 'left';
    ctx.fillText('= 5', refX + unit, refY);

    const sx = w * 0.36;
    const sy = h * 0.62;
    const main = unit * 1.12;
    const count = challenge.data.count;

    if (count === 3) {
      ctx.strokeRect(sx - main / 2, sy - main / 2, main, main);
      ctx.strokeRect(sx - main * 0.88, sy - main * 0.14, main, main);
      ctx.strokeRect(sx - main * 0.12, sy - main * 0.86, main, main);
    } else {
      const offsets = [
        [-0.8, -0.6],
        [0.0, -0.6],
        [-0.4, 0.0],
        [0.4, 0.0]
      ];
      offsets.forEach(([ox, oy]) => {
        ctx.strokeRect(sx + ox * main, sy + oy * main, main, main);
      });
    }

    ctx.textAlign = 'left';
    ctx.fillText('= ?', sx + main * 1.4, sy + main * 0.2);
    return;
  }

  if (challenge.type === 'progression-chain') {
    const seq = challenge.data.seq;
    const spacing = w * 0.17;
    const startX = w / 2 - spacing * 2;
    const y = h / 2;

    ctx.font = `${Math.floor(Math.min(w, h) * 0.11 * textScale)}px Inter`;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      const x = startX + i * spacing;
      ctx.fillText(i < 4 ? String(seq[i]) : '?', x, y);
      if (i < 4) {
        ctx.beginPath();
        ctx.moveTo(x + spacing * 0.30, y);
        ctx.lineTo(x + spacing * 0.70, y);
        ctx.stroke();
      }
    }
    return;
  }

  if (challenge.type === 'cross-sum') {
    const { up, left, right, down } = challenge.data;
    const cx = w / 2;
    const cy = h / 2;
    const d = Math.min(w, h) * 0.22;

    ctx.font = `${Math.floor(Math.min(w, h) * 0.12 * textScale)}px Inter`;
    ctx.fillText(String(up), cx, cy - d);
    ctx.fillText(String(left), cx - d, cy);
    ctx.fillText('?', cx, cy);
    ctx.fillText(String(right), cx + d, cy);
    ctx.fillText(String(down), cx, cy + d);

    ctx.strokeStyle = '#5d6573';
    ctx.beginPath();
    ctx.moveTo(cx - d * 0.65, cy);
    ctx.lineTo(cx + d * 0.65, cy);
    ctx.moveTo(cx, cy - d * 0.65);
    ctx.lineTo(cx, cy + d * 0.65);
    ctx.stroke();
    return;
  }

  const values = challenge.data.values;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.24;
  ctx.font = `${Math.floor(Math.min(w, h) * 0.11)}px Inter`;
  for (let i = 0; i < 6; i += 1) {
    const angle = (-Math.PI / 2) + (i * Math.PI) / 3;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    ctx.fillText(String(values[i]), x, y);
  }
  ctx.fillText('?', cx, cy);
}

function drawMathPuzzle() {
  if (state.screen !== 'math' || !state.math.challenge) return;
  const canvas = document.getElementById('math-canvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawMathChallenge(state.math.challenge, ctx, w, h);
}

function render() {
  if (state.screen === 'main') app.innerHTML = renderMain();
  if (state.screen === 'settings') app.innerHTML = renderSettings();
  if (state.screen === 'achievements') app.innerHTML = renderAchievements();
  if (state.screen === 'profiles') app.innerHTML = renderProfiles();
  if (state.screen === 'wordle-lang') app.innerHTML = renderWordleLanguage();
  if (state.screen === 'wordle') app.innerHTML = renderWordle();
  if (state.screen === 'math') app.innerHTML = renderMath();
  if (state.screen === 'math-levels') app.innerHTML = renderMathLevels();

  if (state.screen === 'math') drawMathPuzzle();
  state.animate = false;

  const activeToast = app.querySelector('.toast.show');
  if (activeToast) {
    activeToast.addEventListener(
      'animationend',
      () => {
        state.toast = '';
        render();
      },
      { once: true }
    );
  }
}

app.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;
  if (action === 'noop') return;

  if (action === 'go-profiles') setScreen('profiles', true);
  if (action === 'go-settings') setScreen('settings', true);
  if (action === 'go-achievements') setScreen('achievements', true);
  if (action === 'back-main') setScreen('main', true);
  if (action === 'social-inst' || action === 'social-x' || action === 'social-tk') showToast('Coming soon');

  if (action === 'install-app') {
    if (state.install.deferredPrompt) {
      state.install.deferredPrompt.prompt();
      state.install.deferredPrompt.userChoice.finally(() => {
        state.install.deferredPrompt = null;
      });
      return;
    }
    if (state.install.ios) {
      showToast('Use Share > Add to Home Screen');
      return;
    }
    showToast('Install prompt not available');
    return;
  }

  if (action === 'toggle-motion') {
    const profile = getProfile();
    profile.settings.reduceMotion = !profile.settings.reduceMotion;
    saveProfiles();
    render();
  }

  if (action === 'switch-player') {
    const chosen = target.dataset.player;
    ensurePlayer(chosen);
    state.currentPlayer = chosen;
    state.profiles.current = chosen;
    syncStateFromProfile();
    saveProfiles();
    setScreen('main', true);
  }

  if (action === 'go-wordle') setScreen('wordle-lang', true);
  if (action === 'go-wordle-lang') setScreen('wordle-lang', true);

  if (action === 'set-wordle-lang') {
    state.wordle.language = target.dataset.lang;
    syncStateFromProfile();
    setupWordleRound();
    setScreen('wordle', true);
  }

  if (action === 'go-math') {
    syncStateFromProfile();
    initMathRoundProgress();
    saveProfiles();
    setScreen('math', true);
  }

  if (action === 'go-math-levels') setScreen('math-levels', true);
  if (action === 'back-math') setScreen('math', true);

  if (action === 'continue-math') {
    initMathRoundProgress();
    setScreen('math', true);
  }

  if (action === 'replay-level') {
    initMathReplay(Number(target.dataset.level));
    setScreen('math', true);
  }

  if (action === 'math-digit') {
    if (state.math.input.length < MAX_MATH_INPUT_LENGTH) {
      state.math.input += target.dataset.digit;
      render();
    }
  }

  if (action === 'math-clear') {
    state.math.input = '';
    render();
  }

  if (action === 'math-hint') {
    getProfile().stats.hintsUsed += 1;
    saveProfiles();
    showToast(state.math.challenge.hint || 'Look for the hidden rule');
  }

  if (action === 'math-submit') {
    if (!state.math.input.length) {
      showToast('Try again');
      return;
    }

    const value = Number(state.math.input);
    if (value === state.math.challenge.answer) {
      if (state.math.mode === 'progress') {
        const profile = getProfile();
        profile.mathLevel += 1;
        profile.stats.mathSolved += 1;
        state.math.level = profile.mathLevel;
        initMathRoundProgress();
        saveProfiles();
        state.animate = true;
        render();
      } else {
        showToast('Solved');
        setScreen('math-levels', true);
      }
      return;
    }

    showToast('Try again');
  }
});

app.addEventListener('input', (event) => {
  if (event.target.id !== 'math-answer-input') return;
  const clean = event.target.value.replace(/\D/g, '').slice(0, MAX_MATH_INPUT_LENGTH);
  state.math.input = clean;
  event.target.value = clean;
});

app.addEventListener('submit', (event) => {
  if (event.target.id === 'wordle-form') {
    event.preventDefault();
    const input = document.getElementById('wordle-input');
    const guess = input.value.trim().toLowerCase();

    if (!/^[a-zA-Z]{5}$/.test(guess)) {
      input.value = '';
      showToast('Try again');
      return;
    }

    const finalGuess = guess.slice(0, 5);
    state.wordle.guesses.push(finalGuess);
    input.value = '';

    if (finalGuess === state.wordle.answer) {
      state.wordle.level += 1;
      const profile = getProfile();
      profile.wordleLevel = Math.max(profile.wordleLevel, state.wordle.level);
      profile.stats.wordleSolved += 1;
      saveProfiles();
      setupWordleRound();
      state.animate = true;
      render();
      return;
    }

    if (state.wordle.guesses.length >= triesAllowed(state.wordle.level)) {
      setupWordleRound();
      state.animate = true;
      render();
    } else {
      render();
    }

    showToast('Try again');
    return;
  }

  if (event.target.id === 'player-form') {
    event.preventDefault();
    const input = document.getElementById('player-input');
    const raw = input.value.trim();
    if (!raw) return;

    const name = raw.replace(/\s+/g, ' ').slice(0, 14);
    ensurePlayer(name);
    state.currentPlayer = name;
    state.profiles.current = name;
    syncStateFromProfile();
    saveProfiles();
    input.value = '';
    setScreen('main', true);
  }
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const blocked =
    event.key === 'F12' ||
    (event.ctrlKey && event.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
    (event.ctrlKey && key === 'u');

  if (blocked) {
    event.preventDefault();
    showToast('Not available');
  }
});

initInstallPrompt();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      if (reg && reg.update) reg.update();
    } catch {}
  });
}

render();
