// Arrows - Puzzle Escape: HTML5 Canvas port
"use strict";

const BG_COLOR = "#fafafc";
const GRID_DOT_COLOR = "#d2d2d7";
const ARROW_COLOR = "#2d3446";
const ARROW_ERROR_COLOR = "#dc3737";
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
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 5.0;

const DIRECTION_VECTORS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
const DIRECTION_NAMES = ["up", "down", "left", "right"];
const DIRECTION_ANGLES = { right: 0, up: -Math.PI / 2, left: Math.PI, down: Math.PI / 2 };
const MOVE_DELTAS = { U: [-1, 0], D: [1, 0], L: [0, -1], R: [0, 1] };

class Arrow {
  constructor(cells, direction) {
    this.cells = cells;
    this.direction = direction;
    this.alive = true;
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

class Board {
  constructor(rows, cols) {
    this.rows = rows;
    this.cols = cols;
    this._grid = Array.from({ length: rows }, () => new Array(cols).fill(null));
    this._arrows = [];
  }
  placeArrow(arrow) {
    this._arrows.push(arrow);
    for (const [r, c] of arrow.cells) this._grid[r][c] = arrow;
  }
  getArrowAt(row, col) {
    if (row < 0 || row >= this.rows || col < 0 || col >= this.cols) return null;
    const a = this._grid[row][col];
    return (a && a.alive) ? a : null;
  }
  arrowsInRegion(minR, maxR, minC, maxC) {
    const seen = new Set();
    const result = [];
    for (let r = Math.max(0, minR); r < Math.min(this.rows, maxR); r++) {
      for (let c = Math.max(0, minC); c < Math.min(this.cols, maxC); c++) {
        const a = this._grid[r][c];
        if (a && a.alive && !seen.has(a)) { seen.add(a); result.push(a); }
      }
    }
    return result;
  }
}

class Camera {
  constructor() { this.reset(); }
  reset() { this.ox = 0; this.oy = 0; this.zoom = 1; }
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
    window.addEventListener("resize", () => { this._resize(); markDirty(); });
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
  cellSize() { return Math.max(1, CELL_SIZE_WORLD * this.camera.zoom); }

  render(board, level) {
    if (level !== this._cameraLevel && board) {
      this._cameraLevel = level;
      this.camera.centerOnGrid(board.rows, board.cols, this._w, this._h);
    }
    const ctx = this.ctx;
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, this._w, this._h);
    if (!board) return;
    const cam = this.camera;
    const cs = CELL_SIZE_WORLD;
    const screenCs = this.cellSize();
    const [minR, maxR, minC, maxC] = cam.visibleRange(board.rows, board.cols, this._w, this._h);

    const dotSize = Math.max(0.5, cam.zoom * 0.3);
    ctx.fillStyle = GRID_DOT_COLOR;
    for (let r = minR; r < maxR; r++) {
      for (let c = minC; c < maxC; c++) {
        if (board._grid[r][c]) continue;
        const [sx, sy] = cam.w2s(c * cs + cs / 2, r * cs + cs / 2);
        ctx.beginPath();
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const bw = arrowBodyWidth(screenCs);
    const crWorld = cs * ARROW_CORNER_RADIUS_RATIO;
    const headSize = screenCs * ARROW_HEAD_SIZE;
    const arrows = board.arrowsInRegion(minR, maxR, minC, maxC);
    for (const arrow of arrows) {
      if (!arrow.alive) continue;
      const useSmooth = screenCs >= 8;
      const wp = arrow.smoothWorld(useSmooth ? crWorld : 0);
      const sp = wp.map(([wx, wy]) => cam.w2s(wx, wy));
      ctx.strokeStyle = ARROW_COLOR;
      ctx.lineWidth = bw;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.stroke();
      const [hr, hc] = arrow.head;
      const [hx, hy] = cam.w2s(hc * cs + cs / 2, hr * cs + cs / 2);
      drawArrowhead(ctx, hx, hy, headSize, arrow.direction, ARROW_COLOR, 1);
    }
  }
}

const canvas = document.getElementById("game");
const renderer = new Renderer(canvas);
let board = null;
let needsRender = true;
function markDirty() { needsRender = true; }

fetch(puzzleUrl(1)).then(r => r.json()).then(data => {
  board = new Board(data.rows, data.cols);
  for (const a of decodeArrows(data)) board.placeArrow(a);
  markDirty();
});

function gameLoop() {
  if (needsRender) {
    renderer.render(board, 1);
    needsRender = false;
  }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
