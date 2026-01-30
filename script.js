// ================= PLUGNPLAY GRID ENGINE =================

// ================= EVENT BUS =================
class EventBus {
  constructor() { this.listeners = {}; }
  on(type, fn, priority = 0) {
    (this.listeners[type] ??= []).push({ fn, priority });
    this.listeners[type].sort((a, b) => b.priority - a.priority);
  }
  emit(type, data) {
    for (const { fn } of this.listeners[type] ?? []) fn(data);
  }
}

// ================= TILE REGISTRY =================
const Tiles = [];
function registerTile(tile) { Tiles.push(tile); }

// Core tiles
registerTile({ id: "wall", name: "Wall", color: "#555", solid: true });
registerTile({ id: "floor", name: "Floor", color: "#aaa", solid: false });

// ================= GRID ENGINE =================
class GridEngine {
  constructor(w, h, tileSize) {
    this.w = w;
    this.h = h;
    this.tileSize = tileSize;

    // Each cell holds ground and actor layers
    this.grid = Array.from({ length: h }, () =>
      Array.from({ length: w }, () => ({ ground: null, actor: null }))
    );

    this.entities = new Map();
    this.systems = [];
    this.bus = new EventBus();
    this.nextId = 1;
  }

  addSystem(sys) { this.systems.push(sys); }

  addEntity(data, x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;

    const id = this.nextId++;
    const e = { id, x, y, ...data };
    this.entities.set(id, e);

    const cell = this.grid[y][x];
    if (e.solid) cell.ground = e;
    else cell.actor = e;

    return id;
  }

  removeEntity(id) {
    const e = this.entities.get(id);
    if (!e) return;

    const cell = this.grid[e.y][e.x];
    if (cell.ground === e) cell.ground = null;
    if (cell.actor === e) cell.actor = null;

    this.entities.delete(id);
  }

  moveEntity(id, dx, dy) {
    const e = this.entities.get(id);
    if (!e) return false;

    const nx = e.x + dx;
    const ny = e.y + dy;
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return false;

    const target = this.grid[ny][nx];
    if (target.ground?.solid) return false;

    const oldCell = this.grid[e.y][e.x];
    if (oldCell.actor === e) oldCell.actor = null;

    e.x = nx;
    e.y = ny;
    target.actor = e;

    this.bus.emit("entityMoved", e);
    return true;
  }

  getEntityAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const cell = this.grid[y][x];
    return cell.actor ?? cell.ground ?? null;
  }

  tick(dt) {
    for (const sys of this.systems) sys.update(this, dt);
    this.bus.emit("afterTick", this);
  }
}

// ================= SYSTEMS =================
const MovementSystem = {
  update(engine) {
    if (input.dx !== 0 || input.dy !== 0) {
      engine.moveEntity(player, input.dx, input.dy);
      input.dx = 0;
      input.dy = 0;
    }
  }
};

// ================= PLUGIN LOADER =================
class PluginLoader {
  constructor(engine, path = "plugins.txt") {
    this.engine = engine;
    this.path = path;
    this.plugins = [];
  }

  async fetchPluginList() {
    try {
      const res = await fetch(this.path);
      const text = await res.text();
      return text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    } catch { return []; }
  }

  async loadPlugin(file) {
    try {
      const module = await import(`./plugins/${file}`);
      if (typeof module.default === "function") {
        module.default(this.engine);
        this.plugins.push(file);
        console.log("Plugin loaded:", file);
      }
    } catch (err) { console.error(`Failed to load plugin ${file}:`, err); }
  }

  async loadAll(saved = []) {
    const files = await this.fetchPluginList();
    for (const f of files) {
      if (saved.length && !saved.includes(f)) continue;
      await this.loadPlugin(f);
    }
  }
}

// ================= BUILT-IN MAP EDITOR + HOTBAR =================
function setupEditor(engine, canvas) {
  let enabled = true;
  let hover = null;
  let selectedTile = Tiles[0];

  // Hotbar container
  const hotbar = document.createElement("div");
  hotbar.style.position = "absolute";
  hotbar.style.bottom = "10px";
  hotbar.style.left = "10px";
  hotbar.style.display = "flex";
  hotbar.style.gap = "4px";
  document.body.appendChild(hotbar);

  function refreshHotbar() {
    hotbar.innerHTML = "";
    Tiles.forEach(tile => {
      const btn = document.createElement("div");
      btn.style.width = "32px";
      btn.style.height = "32px";
      btn.style.backgroundColor = tile.color;
      btn.style.border = tile === selectedTile ? "2px solid #0f0" : "1px solid #000";
      btn.title = tile.name;
      btn.addEventListener("click", () => { selectedTile = tile; refreshHotbar(); });
      hotbar.appendChild(btn);
    });
  }
  refreshHotbar();

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    hover = {
      x: Math.floor((e.clientX - rect.left) / engine.tileSize),
      y: Math.floor((e.clientY - rect.top) / engine.tileSize)
    };
  });

  canvas.addEventListener("mousedown", () => {
    if (!enabled || !hover || !selectedTile) return;

    const cell = engine.grid[hover.y][hover.x];

    // Don't overwrite player (actor layer)
    if (cell.actor) return;

    engine.addEntity({ ...selectedTile }, hover.x, hover.y);
  });

  window.addEventListener("keydown", e => { if (e.key === "e") enabled = !enabled; });

  engine.bus.on("afterTick", () => {
    engine._editorHover = hover;
    engine._editorEnabled = enabled;
  });
}

// ================= RENDERER =================
function render(engine, ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (let y = 0; y < engine.h; y++) {
    for (let x = 0; x < engine.w; x++) {
      const cell = engine.grid[y][x];
      if (cell.ground && cell.ground.color) {
        ctx.fillStyle = cell.ground.color;
        ctx.fillRect(x * engine.tileSize, y * engine.tileSize, engine.tileSize, engine.tileSize);
      }
      if (cell.actor && cell.actor.color) {
        ctx.fillStyle = cell.actor.color;
        ctx.fillRect(x * engine.tileSize, y * engine.tileSize, engine.tileSize, engine.tileSize);
      }
    }
  }

  if (engine._editorEnabled && engine._editorHover) {
    const { x, y } = engine._editorHover;
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(x * engine.tileSize, y * engine.tileSize, engine.tileSize, engine.tileSize);
  }
}

// ================= GAME SETUP =================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const engine = new GridEngine(16, 16, 32);

engine.addSystem(MovementSystem);

setupEditor(engine, canvas);

// Borders
for (let i = 0; i < 16; i++) {
  engine.addEntity({ solid: true, color: "#555" }, i, 0);
  engine.addEntity({ solid: true, color: "#555" }, i, 15);
  engine.addEntity({ solid: true, color: "#555" }, 0, i);
  engine.addEntity({ solid: true, color: "#555" }, 15, i);
}

// Player
const player = engine.addEntity({ color: "#4af" }, 3, 3);

// Input
const input = { dx: 0, dy: 0 };
window.addEventListener("keydown", e => {
  if (e.key === "ArrowUp") input.dx = 0, input.dy = -1;
  if (e.key === "ArrowDown") input.dx = 0, input.dy = 1;
  if (e.key === "ArrowLeft") input.dx = -1, input.dy = 0;
  if (e.key === "ArrowRight") input.dx = 1, input.dy = 0;
});

// Plugin loader
const loader = new PluginLoader(engine);
loader.loadAll([]);

// Main loop
function loop() {
  engine.tick(1);
  MovementSystem.update(engine);
  render(engine, ctx);
  requestAnimationFrame(loop);
}
loop();
