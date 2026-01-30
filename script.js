// ================= PLUGNPLAY GRID ENGINE =================

// ================= EVENT BUS =================
class EventBus {
  constructor() { this.listeners = {}; }

  on(type, fn, priority = 0) {
    (this.listeners[type] ??= []).push({ fn, priority });
    this.listeners[type].sort((a, b) => b.priority - a.priority);
  }

  off(type, fn) {
    this.listeners[type] =
      (this.listeners[type] ?? []).filter(l => l.fn !== fn);
  }

  emit(type, data) {
    for (const { fn } of this.listeners[type] ?? []) fn(data);
  }
}

// ================= TILE REGISTRY =================
const Tiles = new Map();

function registerTile(tile) {
  // tile = { id, name, color, solid }
  if (!tile.id) throw new Error("Tile requires id");
  Tiles.set(tile.id, Object.freeze({ ...tile }));
}

// core tile
registerTile({ id: "wall", name: "Wall", color: "#555", solid: true });

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

    this.editor = { enabled: true, hover: null };
  }

  addSystem(sys) { this.systems.push(sys); }

  addEntity(data, x, y) {
    if (this.grid[y][x]?.locked) return null;

    if (this.grid[y][x]) this.removeEntity(this.grid[y][x].id);

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

  tick(dt) {
    for (const sys of this.systems) sys.update(this, dt);
    this.bus.emit("afterTick", this);
  }
}

// ================= SYSTEMS =================
const MovementSystem = {
  update(engine) {
    for (const e of engine.entities.values()) {
      if (!e.input) continue;
      if (e.input.dx || e.input.dy) {
        engine.moveEntity(e.id, e.input.dx, e.input.dy);
        e.input.dx = 0;
        e.input.dy = 0;
      }
    }
  }
};

// ================= PLUGIN LOADER =================
class PluginLoader {
  constructor(engine, path = "plugins.txt") {
    this.engine = engine;
    this.path = path;
    this.plugins = new Map(); // file → cleanup fn
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
    if (this.plugins.has(file)) return;

    const module = await import(`./plugins/${file}`);
    const cleanup = module.default?.(this.engine);
    this.plugins.set(file, cleanup ?? null);
    console.log("Plugin loaded:", file);
  }

  unloadPlugin(file) {
    const cleanup = this.plugins.get(file);
    if (typeof cleanup === "function") cleanup();
    this.plugins.delete(file);
    console.log("Plugin unloaded:", file);
  }

  async loadAll(saved = []) {
    const files = await this.fetchPluginList();
    const enabled = saved.length ? saved : files;

    for (const f of files) {
      if (enabled.includes(f)) await this.loadPlugin(f);
    }
    savePlugins([...this.plugins.keys()]);
  }
}

// ================= PLUGIN GUI =================
async function setupPluginGUI(loader) {
  const gui = document.getElementById("plugin-list");
  gui.innerHTML = "";

  const files = await loader.fetchPluginList();
  const saved = getSavedPlugins();

  files.forEach(file => {
    const row = document.createElement("div");
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = saved.includes(file);

    cb.onchange = async () => {
      let enabled = getSavedPlugins();
      if (cb.checked) {
        await loader.loadPlugin(file);
        enabled.push(file);
      } else {
        loader.unloadPlugin(file);
        enabled = enabled.filter(p => p !== file);
      }
      savePlugins(enabled);
    };

    row.append(cb, document.createTextNode(" " + file));
    gui.appendChild(row);
  });
}

// ================= EDITOR =================
function setupEditor(engine, canvas) {
  const hotbar = document.createElement("div");
  Object.assign(hotbar.style, {
    position: "absolute",
    bottom: "10px",
    left: "10px",
    display: "flex",
    gap: "4px"
  });
  document.body.appendChild(hotbar);

  let selectedTile = [...Tiles.values()][0];

  function refresh() {
    hotbar.innerHTML = "";
    Tiles.forEach(tile => {
      const b = document.createElement("div");
      Object.assign(b.style, {
        width: "32px",
        height: "32px",
        background: tile.color,
        border: tile === selectedTile ? "2px solid #0f0" : "1px solid #000"
      });
      b.onclick = () => { selectedTile = tile; refresh(); };
      hotbar.appendChild(b);
    });
  }
  refresh();

  canvas.onmousemove = e => {
    const r = canvas.getBoundingClientRect();
    engine.editor.hover = {
      x: Math.floor((e.clientX - r.left) / engine.tileSize),
      y: Math.floor((e.clientY - r.top) / engine.tileSize)
    };
  };

  canvas.onmousedown = () => {
    if (!engine.editor.enabled || !engine.editor.hover) return;
    engine.addEntity({
      tileId: selectedTile.id,
      color: selectedTile.color,
      solid: selectedTile.solid
    }, engine.editor.hover.x, engine.editor.hover.y);
  };

  window.onkeydown = e => {
    if (e.key === "e") engine.editor.enabled = !engine.editor.enabled;
  };
}

// ================= RENDERER =================
function render(engine, ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const e of engine.entities.values()) {
    if (!e.color) continue;
    ctx.fillStyle = e.color;
    ctx.fillRect(
      e.x * engine.tileSize,
      e.y * engine.tileSize,
      engine.tileSize,
      engine.tileSize
    );
  }

  const h = engine.editor.hover;
  if (engine.editor.enabled && h) {
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      h.x * engine.tileSize,
      h.y * engine.tileSize,
      engine.tileSize,
      engine.tileSize
    );
  }
}

// ================= STORAGE =================
const getSavedPlugins = () =>
  JSON.parse(localStorage.getItem("plugnplay_enabled_plugins") ?? "[]");

const savePlugins = list =>
  localStorage.setItem("plugnplay_enabled_plugins", JSON.stringify(list));

// ================= GAME SETUP =================
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const engine = new GridEngine(16, 16, 32);

engine.addSystem(MovementSystem);
setupEditor(engine, canvas);

// borders
for (let i = 0; i < 16; i++) {
  engine.addEntity({ solid: true, color: "#555", locked: true }, i, 0);
  engine.addEntity({ solid: true, color: "#555", locked: true }, i, 15);
  engine.addEntity({ solid: true, color: "#555", locked: true }, 0, i);
  engine.addEntity({ solid: true, color: "#555", locked: true }, 15, i);
}

// player
const playerId = engine.addEntity({
  color: "#4af",
  input: { dx: 0, dy: 0 },
  locked: true
}, 3, 3);

// input
window.onkeydown = e => {
  const p = engine.entities.get(playerId);
  if (!p) return;
  if (e.key === "ArrowUp") p.input.dy = -1;
  if (e.key === "ArrowDown") p.input.dy = 1;
  if (e.key === "ArrowLeft") p.input.dx = -1;
  if (e.key === "ArrowRight") p.input.dx = 1;
};

// plugins
const loader = new PluginLoader(engine);
(async () => {
  await loader.loadAll(getSavedPlugins());
  await setupPluginGUI(loader);
})();

// loop
(function loop() {
  engine.tick(1);
  render(engine, ctx);
  requestAnimationFrame(loop);
})();
