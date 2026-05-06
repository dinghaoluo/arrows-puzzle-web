// Arrows - Puzzle Escape: HTML5 Canvas port
"use strict";

// constants
const BG_COLOR = "#fafafc";
const GRID_DOT_COLOR = "#d2d2d7";
const ARROW_COLOR = "#2d3446";
const ARROW_ERROR_COLOR = "#dc3737";
const ARROW_FLY_COLOR = "#b4b9c3";
const HUD_TEXT_COLOR = "#646973";

const ARROW_HEAD_SIZE = 0.82;
const ARROW_BODY_WIDTH_RATIO = 0.32;
const ARROW_BODY_MIN_SCREEN_WIDTH = 0.65;
const ARROW_BODY_MAX_CELL_RATIO = 0.55;
const ARROW_HEAD_TIP_RATIO = 0.62;
const ARROW_HEAD_BACK_RATIO = -0.42;
const ARROW_HEAD_NOTCH_RATIO = -0.18;
const ARROW_HEAD_HALF_WIDTH_RATIO = 0.55;
const ARROW_CORNER_RADIUS_RATIO = 0.22;
const HUD_HEIGHT = 54;
const CELL_SIZE_WORLD = 8;
const DRAG_THRESHOLD = 5;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5.0;
const ZOOM_STEP = 1.15;
const ERROR_FLASH_DURATION = 0.5;
const FLY_OFF_DURATION = 0.6;

const DIRECTION_VECTORS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIRECTION_NAMES = ["up", "down", "left", "right"];
const DIRECTION_ANGLES = { right: 0, up: -Math.PI / 2, left: Math.PI, down: Math.PI / 2 };
const MOVE_DELTAS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };
const PUZZLE_CACHE = new Map();

// phase enum
const Phase = {
  MAIN_MENU: 0,
  PLAYING: 2,
};

// arrow
class Arrow {
  constructor(cells, direction) {
    this.cells = cells;
    this.direction = direction;
    this.alive = true;
    this.errorTimer = 0;
    this.flyProgress = 0;
    this.animatingFlyOff = false;
    this._smoothWorld = null;
  }
  get head() { return this.cells[this.cells.length - 1]; }
  get tail() { return this.cells[0]; }
  smoothWorld(cr) {
    if (this._smoothWorld) return this._smoothWorld;
    const cs = CELL_SIZE_WORLD;
    const centers = this.cells.map(([r, c]) => [c * cs + cs / 2, r * cs + cs / 2]);
    this._smoothWorld = cr > 0 ? smoothPolyline(centers, cr) : centers;
    return this._smoothWorld;
  }
}

// board
class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this._grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
    this._arrows = [];
    this._aliveCount = 0;
  }

  placeArrow(arrow) {
    this._arrows.push(arrow);
    this._aliveCount++;
    for (const [r, c] of arrow.cells) {
      this._grid[r][c] = arrow;
    }
  }

  removeArrow(arrow) {
    if (!arrow.alive) return;
    arrow.alive = false;
    this._aliveCount--;
    for (const [r, c] of arrow.cells) {
      if (this._grid[r][c] === arrow) this._grid[r][c] = null;
    }
  }

  getArrowAt(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const a = this._grid[row][col];
    return (a && a.alive) ? a : null;
  }

  livingArrows() { return this._arrows.filter(a => a.alive); }
  isEmpty() { return this._aliveCount === 0; }

  arrowsInRegion(minR, maxR, minC, maxC) {
    const seen = new Set();
    const result = [];
    const r0 = Math.max(0, minR), r1 = Math.min(this.rows, maxR);
    const c0 = Math.max(0, minC), c1 = Math.min(this.cols, maxC);
    for (let r = r0; r < r1; r++) {
      for (let c = c0; c < c1; c++) {
        const a = this._grid[r][c];
        if (a && a.alive && !seen.has(a)) {
          seen.add(a);
          result.push(a);
        }
      }
    }
    return result;
  }

  isPathClear(arrow) {
    const [dr, dc] = DIRECTION_VECTORS[arrow.direction];
    let [r, c] = arrow.head;
    r += dr; c += dc;
    while (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
      const occ = this._grid[r][c];
      if (occ && occ.alive && !occ.animatingFlyOff) return false;
      r += dr; c += dc;
    }
    return true;
  }
}

function decodeArrows(data) {
  if (data.v === 2) {
    const arrows = new Array(data.arrows.length);
    for (let i = 0; i < data.arrows.length; i++) {
      const [dirCode, start, moves] = data.arrows[i];
      const cells = new Array(moves.length + 1);
      let r = Math.floor(start / data.cols);
      let c = start - r * data.cols;
      cells[0] = [r, c];
      for (let j = 0; j < moves.length; j++) {
        const [dr, dc] = MOVE_DELTAS[moves[j]];
        r += dr; c += dc;
        cells[j + 1] = [r, c];
      }
      arrows[i] = new Arrow(cells, DIRECTION_NAMES[dirCode]);
    }
    return arrows;
  }

  return data.arrows.map(ad => new Arrow(ad.cells.map(c => [c[0], c[1]]), ad.dir));
}

function puzzleUrl(level) {
  const pad = String(level).padStart(3, "0");
  return `puzzles/level_${pad}.json`;
}

async function loadPuzzleData(level) {
  if (PUZZLE_CACHE.has(level)) return PUZZLE_CACHE.get(level);
  const resp = await fetch(puzzleUrl(level));
  const data = await resp.json();
  PUZZLE_CACHE.set(level, data);
  return data;
}

function prefetchLevel(level) {
  if (PUZZLE_CACHE.has(level)) return;
  loadPuzzleData(level).catch(() => {});
}

// camera
class Camera {
  constructor() { this.reset(); }

  reset() {
    this.ox = 0; this.oy = 0; this.zoom = 1;
    this._dragging = false;
    this._dragStart = [0, 0];
    this._dragOfs = [0, 0];
    this._dragMoved = 0;
  }

  centerOnGrid(rows, cols, sw, sh) {
    const gw = cols * CELL_SIZE_WORLD;
    const gh = rows * CELL_SIZE_WORLD;
    const availH = sh - HUD_HEIGHT;
    const fit = Math.min(sw / gw, availH / gh) * 0.92;
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fit));
    this.ox = (sw - gw * this.zoom) / 2;
    this.oy = HUD_HEIGHT + (availH - gh * this.zoom) / 2;
  }

  w2s(wx, wy) { return [wx * this.zoom + this.ox, wy * this.zoom + this.oy]; }
  s2w(sx, sy) { return [(sx - this.ox) / this.zoom, (sy - this.oy) / this.zoom]; }

  startDrag(x, y) {
    this._dragging = true;
    this._dragStart = [x, y];
    this._dragOfs = [this.ox, this.oy];
    this._dragMoved = 0;
  }

  updateDrag(x, y) {
    if (!this._dragging) return;
    const dx = x - this._dragStart[0], dy = y - this._dragStart[1];
    this._dragMoved = Math.hypot(dx, dy);
    this.ox = this._dragOfs[0] + dx;
    this.oy = this._dragOfs[1] + dy;
  }

  endDrag() {
    this._dragging = false;
    return this._dragMoved < DRAG_THRESHOLD;
  }

  get isDragging() { return this._dragging; }

  applyZoom(dir, mx, my) {
    const old = this.zoom;
    this.zoom = dir > 0
      ? Math.min(MAX_ZOOM, this.zoom * ZOOM_STEP)
      : Math.max(MIN_ZOOM, this.zoom / ZOOM_STEP);
    const r = this.zoom / old;
    this.ox = mx - (mx - this.ox) * r;
    this.oy = my - (my - this.oy) * r;
  }

  visibleRange(rows, cols, sw, sh) {
    const [wx0, wy0] = this.s2w(0, 0);
    const [wx1, wy1] = this.s2w(sw, sh);
    const cs = CELL_SIZE_WORLD;
    const m = 2;
    return [
      Math.max(0, Math.floor(wy0 / cs) - m),
      Math.min(rows, Math.ceil(wy1 / cs) + m),
      Math.max(0, Math.floor(wx0 / cs) - m),
      Math.min(cols, Math.ceil(wx1 / cs) + m),
    ];
  }
}

// game controller
class GameController {
  constructor() {
    this.phase = Phase.MAIN_MENU;
    this.currentLevel = 1;
    this.board = null;
  }

  async startLevel(level) {
    this.currentLevel = level;
    this.phase = Phase.PLAYING;

    try {
      const data = await loadPuzzleData(level);
      this.board = new Board(data.rows, data.cols);
      const arrows = decodeArrows(data);
      for (const a of arrows) {
        this.board.placeArrow(a);
      }
      prefetchLevel(level + 1);
    } catch (e) {
      console.error("Failed to load level", level, e);
    }
  }

  handleClick(row, col) {
    if (this.phase !== Phase.PLAYING || !this.board) return;
    const arrow = this.board.getArrowAt(row, col);
    if (!arrow || !arrow.alive || arrow.animatingFlyOff) return;

    if (this.board.isPathClear(arrow)) {
      arrow.animatingFlyOff = true;
      arrow.flyProgress = 0;
    } else {
      arrow.errorTimer = ERROR_FLASH_DURATION;
    }
  }

  update(dt) {
    if (!this.board) return false;
    let anyAnim = false;
    for (const a of this.board._arrows) {
      if (!a.alive) continue;
      if (a.errorTimer > 0) { a.errorTimer = Math.max(0, a.errorTimer - dt); anyAnim = true; }
      if (a.animatingFlyOff) {
        a.flyProgress += dt / FLY_OFF_DURATION;
        if (a.flyProgress >= 1) {
          a.animatingFlyOff = false;
          this.board.removeArrow(a);
        }
        anyAnim = true;
      }
    }
    return anyAnim;
  }
}

// drawing helpers
function smoothPolyline(centers, cr) {
  if (centers.length <= 2 || cr <= 0) return centers;
  const result = [centers[0]];
  for (let i = 1; i < centers.length - 1; i++) {
    const [px, py] = centers[i - 1];
    const [cx, cy] = centers[i];
    const [nx, ny] = centers[i + 1];
    const dxi = cx - px, dyi = cy - py;
    const dxo = nx - cx, dyo = ny - cy;
    const inLen = Math.hypot(dxi, dyi), outLen = Math.hypot(dxo, dyo);
    if (inLen < 1e-9 || outLen < 1e-9) { result.push([cx, cy]); continue; }
    const cross = dxi * dyo - dyi * dxo;
    if (Math.abs(cross) < 1e-6 * inLen * outLen) { result.push([cx, cy]); continue; }
    const r = Math.min(cr, inLen * 0.45, outLen * 0.45);
    const bx0 = cx - (dxi / inLen) * r, by0 = cy - (dyi / inLen) * r;
    const bx2 = cx + (dxo / outLen) * r, by2 = cy + (dyo / outLen) * r;
    const n = Math.max(6, Math.floor(r / 2));
    for (let s = 0; s <= n; s++) {
      const t = s / n, u = 1 - t;
      result.push([u * u * bx0 + 2 * u * t * cx + t * t * bx2,
                    u * u * by0 + 2 * u * t * cy + t * t * by2]);
    }
  }
  result.push(centers[centers.length - 1]);
  return result;
}

function drawArrowhead(ctx, cx, cy, size, direction, color, alpha) {
  if (size < 2) return;
  const angle = DIRECTION_ANGLES[direction];
  const raw = arrowHeadPoints(size);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < raw.length; i++) {
    const [px, py] = raw[i];
    const rx = px * Math.cos(angle) - py * Math.sin(angle);
    const ry = px * Math.sin(angle) + py * Math.cos(angle);
    if (i === 0) ctx.moveTo(cx + rx, cy + ry);
    else ctx.lineTo(cx + rx, cy + ry);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function arrowHeadPoints(size) {
  return [
    [size * ARROW_HEAD_TIP_RATIO, 0],
    [size * ARROW_HEAD_BACK_RATIO, -size * ARROW_HEAD_HALF_WIDTH_RATIO],
    [size * ARROW_HEAD_NOTCH_RATIO, 0],
    [size * ARROW_HEAD_BACK_RATIO, size * ARROW_HEAD_HALF_WIDTH_RATIO],
  ];
}

function arrowBodyWidth(screenCellSize) {
  const scaledWidth = Math.max(ARROW_BODY_MIN_SCREEN_WIDTH, screenCellSize * ARROW_BODY_WIDTH_RATIO);
  const separationCap = Math.max(0.45, screenCellSize * ARROW_BODY_MAX_CELL_RATIO);
  return Math.min(scaledWidth, separationCap);
}

// renderer
class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.camera = new Camera();
    this._cameraLevel = -1;
    this._dpr = 1;
    this._w = 0;
    this._h = 0;
    this._resize();
    window.addEventListener("resize", () => { this._resize(); if (typeof markDirty === "function") markDirty(); });
  }

  _resize() {
    this._dpr = window.devicePixelRatio || 1;
    this._w = window.innerWidth;
    this._h = window.innerHeight;
    this.canvas.width = this._w * this._dpr;
    this.canvas.height = this._h * this._dpr;
    this.ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
  }

  get width() { return this._w; }
  get height() { return this._h; }

  cellSize() {
    return Math.max(1, CELL_SIZE_WORLD * this.camera.zoom);
  }

  cellCenter(row, col) {
    const cs = CELL_SIZE_WORLD;
    return this.camera.w2s(col * cs + cs / 2, row * cs + cs / 2);
  }

  screenToCell(x, y, board) {
    if (!board) return null;
    const [wx, wy] = this.camera.s2w(x, y);
    const col = Math.floor(wx / CELL_SIZE_WORLD);
    const row = Math.floor(wy / CELL_SIZE_WORLD);

    if (row >= 0 && row < board.rows && col >= 0 && col < board.cols) {
      if (board.getArrowAt(row, col)) return [row, col];
    }

    return null;
  }

  ensureCamera(ctrl) {
    if (ctrl.phase === Phase.MAIN_MENU) {
      this._cameraLevel = -1;
      return;
    }
    if (ctrl.currentLevel !== this._cameraLevel && ctrl.board) {
      this._cameraLevel = ctrl.currentLevel;
      this.camera.centerOnGrid(ctrl.board.rows, ctrl.board.cols, this._w, this._h);
    }
  }

  render(ctrl) {
    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this._w, this._h);

    this.ensureCamera(ctrl);

    if (ctrl.phase === Phase.MAIN_MENU) {
      this._drawMainMenu(ctx);
    } else {
      if (ctrl.board) {
        this._drawGridDots(ctx, ctrl);
        this._drawArrows(ctx, ctrl);
      }
    }
  }

  _drawMainMenu(ctx) {
    ctx.fillStyle = ARROW_COLOR;
    ctx.textAlign = "center";
    ctx.font = "bold 38px Arial, sans-serif";
    ctx.fillText("Arrows", this._w / 2, this._h / 2 - 30);
    ctx.font = "20px Arial, sans-serif";
    ctx.fillStyle = HUD_TEXT_COLOR;
    ctx.fillText("Puzzle Escape", this._w / 2, this._h / 2 + 10);
    ctx.font = "15px Arial, sans-serif";
    ctx.fillText("Tap to start", this._w / 2, this._h / 2 + 50);
  }

  _drawGridDots(ctx, ctrl) {
    const cs = this.cellSize();
    if (cs < 3) return;
    const [minR, maxR, minC, maxC] = this.camera.visibleRange(
      ctrl.board.rows, ctrl.board.cols, this._w, this._h
    );
    const visibleCells = (maxR - minR) * (maxC - minC);
    if (visibleCells > 40000) return;
    const dotR = Math.max(0.45, cs * 0.055);
    const csW = CELL_SIZE_WORLD;
    const z = this.camera.zoom, ox = this.camera.ox, oy = this.camera.oy;
    const hcs = csW / 2;
    ctx.fillStyle = GRID_DOT_COLOR;
    ctx.beginPath();
    for (let r = minR; r < maxR; r++) {
      for (let c = minC; c < maxC; c++) {
        if (ctrl.board._grid[r][c]) continue;
        const sx = (c * csW + hcs) * z + ox;
        const sy = (r * csW + hcs) * z + oy;
        ctx.moveTo(sx + dotR, sy);
        ctx.arc(sx, sy, dotR, 0, Math.PI * 2);
      }
    }
    ctx.fill();
  }

  _drawArrows(ctx, ctrl) {
    const screenCs = CELL_SIZE_WORLD * this.camera.zoom;
    const cs = Math.max(1, screenCs);
    const headSize = screenCs * ARROW_HEAD_SIZE;
    const crWorld = CELL_SIZE_WORLD * ARROW_CORNER_RADIUS_RATIO;
    const bw = arrowBodyWidth(screenCs);
    const cam = this.camera;
    const csW = CELL_SIZE_WORLD;
    const z = cam.zoom, oox = cam.ox, ooy = cam.oy;
    const hcs = csW / 2;

    const [minR, maxR, minC, maxC] = cam.visibleRange(
      ctrl.board.rows, ctrl.board.cols, this._w, this._h
    );
    const arrows = ctrl.board.arrowsInRegion(minR, maxR, minC, maxC);

    const useSmooth = cs >= 8;
    const drawHeads = headSize >= 3;

    ctx.strokeStyle = ARROW_COLOR;
    ctx.lineWidth = bw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();

    const headBuf = drawHeads ? [] : null;

    for (const arrow of arrows) {
      if (arrow.animatingFlyOff) continue;
      const cells = arrow.cells;
      if (useSmooth) {
        const wpts = arrow.smoothWorld(crWorld);
        ctx.moveTo(wpts[0][0] * z + oox, wpts[0][1] * z + ooy);
        for (let i = 1; i < wpts.length; i++) {
          ctx.lineTo(wpts[i][0] * z + oox, wpts[i][1] * z + ooy);
        }
        if (drawHeads) {
          const last = wpts[wpts.length - 1];
          headBuf.push(last[0] * z + oox, last[1] * z + ooy, arrow.direction);
        }
      } else {
        ctx.moveTo((cells[0][1] * csW + hcs) * z + oox, (cells[0][0] * csW + hcs) * z + ooy);
        for (let i = 1; i < cells.length; i++) {
          ctx.lineTo((cells[i][1] * csW + hcs) * z + oox, (cells[i][0] * csW + hcs) * z + ooy);
        }
        if (drawHeads) {
          const lc = cells[cells.length - 1];
          headBuf.push((lc[1] * csW + hcs) * z + oox, (lc[0] * csW + hcs) * z + ooy, arrow.direction);
        }
      }
    }
    ctx.stroke();

    if (drawHeads && headBuf.length > 0) {
      ctx.fillStyle = ARROW_COLOR;
      ctx.beginPath();
      for (let i = 0; i < headBuf.length; i += 3) {
        this._addHeadPath(ctx, headBuf[i], headBuf[i + 1], headSize, headBuf[i + 2]);
      }
      ctx.fill();
    }
  }

  _addHeadPath(ctx, cx, cy, size, direction) {
    const angle = DIRECTION_ANGLES[direction];
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const raw = arrowHeadPoints(size);
    const rx0 = raw[0][0] * cos - raw[0][1] * sin;
    const ry0 = raw[0][0] * sin + raw[0][1] * cos;
    ctx.moveTo(cx + rx0, cy + ry0);
    for (let i = 1; i < 4; i++) {
      const rx = raw[i][0] * cos - raw[i][1] * sin;
      const ry = raw[i][0] * sin + raw[i][1] * cos;
      ctx.lineTo(cx + rx, cy + ry);
    }
    ctx.closePath();
  }
}

// input handling
function setupInput(canvas, renderer, ctrl) {
  function handlePointerDown(x, y) {
    const phase = ctrl.phase;
    if (phase === Phase.MAIN_MENU) {
      ctrl.startLevel(1);
      return;
    }
    if (phase === Phase.PLAYING) {
      renderer.camera.startDrag(x, y);
    }
  }

  function handlePointerUp(x, y) {
    if (renderer.camera.isDragging) {
      const wasDrag = renderer.camera._dragMoved >= DRAG_THRESHOLD;
      renderer.camera.endDrag();
      if (!wasDrag && ctrl.phase === Phase.PLAYING && ctrl.board) {
        const cell = renderer.screenToCell(x, y, ctrl.board);
        if (cell) ctrl.handleClick(cell[0], cell[1]);
      }
    }
  }

  function handlePointerMove(x, y) {
    if (renderer.camera.isDragging) {
      renderer.camera.updateDrag(x, y);
    }
  }

  // mouse
  canvas.addEventListener("mousedown", (e) => {
    handlePointerDown(e.clientX, e.clientY); markDirty();
  });
  canvas.addEventListener("mousemove", (e) => {
    handlePointerMove(e.clientX, e.clientY); if (renderer.camera.isDragging) markDirty();
  });
  canvas.addEventListener("mouseup", (e) => {
    handlePointerUp(e.clientX, e.clientY); markDirty();
  });

  // wheel zoom
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (ctrl.phase === Phase.PLAYING) {
      renderer.camera.applyZoom(e.deltaY < 0 ? 1 : -1, e.clientX, e.clientY);
    }
    markDirty();
  }, { passive: false });
}

// game loop
const canvas = document.getElementById("game");
const ctrl = new GameController();
const renderer = new Renderer(canvas);
let needsRender = true;
function markDirty() { needsRender = true; }

setupInput(canvas, renderer, ctrl);

let lastTime = 0;
function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
  lastTime = timestamp;
  const hasAnim = ctrl.update(dt);
  if (hasAnim) needsRender = true;
  if (needsRender) {
    renderer.render(ctrl);
    needsRender = false;
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
