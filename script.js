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

// ================= GRID ENGINE =================
class GridEngine {
  constructor(w, h, tileSize) {
    this.w = w;
    this.h = h;
    this.tileSize = tileSize;
    this.grid = Array.from({ length: h }, () => Array(w).fill(null));
    this.entities = new Map();
    this.systems = [];
    this.bus = new EventBus();
    this.nextId = 1;
  }

  addSystem(sys) { this.systems.push(sys); }

  addEntity(data, x, y) {
    if (this.grid[y][x]) return null; // prevent overwriting
    const id = this.nextId++;
    const e = { id, x, y, ...data };
    this.entities.set(id, e);
    this.grid[y][x] = e;
    return id;
  }

  removeEntity(id) {
    const e = this.entities.get(id);
    if (!e) return;
    this.grid[e.y][e.x] = null;
    this.entities.delete(id);
  }

  moveEntity(id, dx, dy) {
    const e = this.entities.get(id);
    if (!e) return false;

    const nx = e.x + dx;
    const ny = e.y + dy;
    if (nx < 0 || ny < 0 || nx >= this.w || ny >= this.h) return false;

    const target = this.grid[ny][nx];

    if (target?.solid) {
      this.bus.emit("entityBlocked", e);
      return false;
    }

    this.grid[e.y][e.x] = null;
    e.x = nx;
    e.y = ny;
    this.grid[ny][nx] = e;

    this.bus.emit("entityMoved", e);
    return true;
  }

  getEntityAt(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return this.grid[y][x];
  }

  tick(dt) {
    for (const sys of this.systems) sys.update(this, dt);
    this.bus.emit("afterTick", this);
  }
}

// ================= SYSTEMS =================
const MovementSystem = {
  update(engine) {
    for (const e of engine.entities.values()) {
      if (!e.velocity) continue;
      if (e.velocity.dx === 0 && e.velocity.dy === 0) continue;
      engine.moveEntity(e.id, e.velocity.dx, e.velocity.dy);
      e.velocity.dx = 0; // reset after move
      e.velocity.dy = 0;
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
    } catch {
      return [];
    }
  }

  async loadPlugin(file) {
    try {
      const module = await import(`./plugins/${file}`);
      if (typeof module.default === "function") {
        module.default(this.engine);
        this.plugins.push(file);
        console.log("Plugin loaded:", file);
      }
    } catch (err) {
      console.error(`Failed to load plugin ${file}:`, err);
    }
  }

  async loadAll(saved = []) {
    const files = await this.fetchPluginList();
    for (const f of files) {
      if (saved.length && !saved.includes(f)) continue;
      await this.loadPlugin(f);
    }
  }
}

// ================= BUILT-IN MAP EDITOR =================
function setupEditor(engine, canvas) {
  let enabled = true;
  let hover = null;

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    hover = {
      x: Math.floor((e.clientX - rect.left) / engine.tileSize),
      y: Math.floor((e.clientY - rect.top) / engine.tileSize)
    };
  });

  canvas.addEventListener("mousedown", () => {
    if (!enabled || !hover) return;
    const existing = engine.getEntityAt(hover.x, hover.y);
    if (existing?.solid) {
      engine.removeEntity(existing.id);
    } else {
      engine.addEntity({ solid: true, color: "#555" }, hover.x, hover.y);
    }
  });

  window.addEventListener("keydown", e => {
    if (e.key === "e") enabled = !enabled;
  });

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
      const e = engine.grid[y][x];
      if (!e || !e.color) continue;
      ctx.fillStyle = e.color;
      ctx.fillRect(x * engine.tileSize, y * engine.tileSize, engine.tileSize, engine.tileSize);
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
const player = engine.addEntity({
  color: "#4af",
  velocity: { dx: 0, dy: 0 }
}, 3, 3);

// Input
window.addEventListener("keydown", e => {
  const p = engine.entities.get(player);
  if (!p) return;

  if (e.key === "ArrowUp") p.velocity.dx = 0, p.velocity.dy = -1;
  if (e.key === "ArrowDown") p.velocity.dx = 0, p.velocity.dy = 1;
  if (e.key === "ArrowLeft") p.velocity.dx = -1, p.velocity.dy = 0;
  if (e.key === "ArrowRight") p.velocity.dx = 1, p.velocity.dy = 0;
});

// Plugin system
const loader = new PluginLoader(engine);
loader.loadAll([]);

// Main loop
function loop() {
  engine.tick(1);
  render(engine, ctx);
  requestAnimationFrame(loop);
}
loop();
