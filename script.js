// ================= PLUGNPLAY SCRIPT.JS =================

// ================= ENGINE CORE =================

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

class Engine {
  constructor(w, h, tileSize) {
    this.w = w;
    this.h = h;
    this.tileSize = tileSize;
    this.entities = new Map();
    this.systems = [];
    this.bus = new EventBus();
    this.nextId = 1;
  }

  addEntity(components) {
    const id = this.nextId++;
    this.entities.set(id, { id, components });
    return id;
  }

  addSystem(system) { this.systems.push(system); }

  getEntitiesWith(...names) {
    return [...this.entities.values()].filter(e =>
      names.every(n => e.components[n])
    );
  }

  tick(dt) {
    for (const sys of this.systems) sys.update(this, dt);
    this.bus.emit("afterTick", this);
  }
}

// ================= COMPONENTS =================

const Position = (x, y) => ({ x, y });
const Velocity = (dx, dy) => ({ dx, dy });
const Renderable = (color) => ({ color });
const Solid = () => ({});

// ================= SYSTEMS =================

const MovementSystem = {
  update(engine) {
    for (const e of engine.getEntitiesWith("position", "velocity")) {
      const p = e.components.position;
      const v = e.components.velocity;
      if (v.dx === 0 && v.dy === 0) continue;

      const move = { e, dx: v.dx, dy: v.dy, cancel: false };
      engine.bus.emit("movementIntent", move);
      if (move.cancel) continue;

      const nx = p.x + move.dx;
      const ny = p.y + move.dy;

      if (!isBlocked(engine, nx, ny)) {
        p.x = nx;
        p.y = ny;
        engine.bus.emit("entityMoved", e);
      } else {
        engine.bus.emit("entityBlocked", e);
      }
    }
  }
};

const FrictionSystem = {
  update(engine) {
    for (const e of engine.getEntitiesWith("velocity")) {
      e.components.velocity.dx = 0;
      e.components.velocity.dy = 0;
    }
  }
};

function isBlocked(engine, x, y) {
  if (x < 0 || y < 0 || x >= engine.w || y >= engine.h) return true;
  return engine.getEntitiesWith("position", "solid")
    .some(e => e.components.position.x === x && e.components.position.y === y);
}

// ================= PLUGIN LOADER =================

class PluginLoader {
  constructor(engine, pluginTxtPath = "plugins.txt") {
    this.engine = engine;
    this.pluginTxtPath = pluginTxtPath;
    this.plugins = [];
  }

  async loadAll() {
    const pluginFiles = await this.fetchPluginList();
    for (const file of pluginFiles) {
      try {
        const module = await import(`./plugins/${file}`);
        if (typeof module.default === "function") {
          module.default(this.engine);
          this.plugins.push(file);
        } else {
          console.warn(`Plugin ${file} has no default export`);
        }
      } catch (err) {
        console.error(`Failed to load plugin ${file}:`, err);
      }
    }
    console.log("PlugnPlay loaded plugins:", this.plugins);
  }

  async fetchPluginList() {
    try {
      const res = await fetch(this.pluginTxtPath);
      if (!res.ok) throw new Error(`Cannot fetch ${this.pluginTxtPath}`);
      const text = await res.text();
      return text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
    } catch (err) {
      console.error("Error reading plugins.txt:", err);
      return [];
    }
  }
}

// ================= PLUGINS =================

// --- ICE MECHANIC ---
export function IcePlugin(engine) {
  engine.bus.on("entityMoved", e => {
    if (!e.components.ice) return;
    const v = e.components.velocity;
    e.components._iceDir = { dx: v.dx, dy: v.dy };
  });

  engine.bus.on("afterTick", engine => {
    for (const e of engine.getEntitiesWith("ice", "position")) {
      if (!e.components._iceDir) continue;
      e.components.velocity.dx = e.components._iceDir.dx;
      e.components.velocity.dy = e.components._iceDir.dy;
    }
  });

  engine.bus.on("entityBlocked", e => {
    if (!e.components.ice) return;
    e.components._iceDir = null;
  });
}

// --- MAP EDITOR ---
export function MapEditorPlugin(engine) {
  const canvas = document.getElementById("game");
  let enabled = true;
  let hoverCell = null;

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / engine.tileSize);
    const y = Math.floor((e.clientY - rect.top) / engine.tileSize);
    hoverCell = { x, y };
  });

  canvas.addEventListener("mousedown", () => {
    if (!enabled || !hoverCell) return;
    toggleWall(engine, hoverCell.x, hoverCell.y);
  });

  window.addEventListener("keydown", e => {
    if (e.key === "e") enabled = !enabled;
  });

  engine.bus.on("afterTick", () => {
    engine._editorHover = hoverCell;
    engine._editorEnabled = enabled;
  });
}

function toggleWall(engine, x, y) {
  const existing = engine.getEntitiesWith("position", "solid")
    .find(e => e.components.position.x === x && e.components.position.y === y);

  if (existing) engine.entities.delete(existing.id);
  else engine.addEntity({
    position: Position(x, y),
    solid: Solid(),
    renderable: Renderable("#555")
  });
}

// ================= RENDERER =================

function render(engine, ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  for (const e of engine.entities.values()) {
    const p = e.components.position;
    const r = e.components.renderable;
    if (!p || !r) continue;

    ctx.fillStyle = r.color;
    ctx.fillRect(
      p.x * engine.tileSize,
      p.y * engine.tileSize,
      engine.tileSize,
      engine.tileSize
    );
  }

  if (engine._editorEnabled && engine._editorHover) {
    const { x, y } = engine._editorHover;
    ctx.strokeStyle = "#0f0";
    ctx.lineWidth = 2;
    ctx.strokeRect(
      x * engine.tileSize,
      y * engine.tileSize,
      engine.tileSize,
      engine.tileSize
    );
  }
}

// ================= GAME SETUP =================

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const engine = new Engine(16, 16, 32);

engine.addSystem(MovementSystem);
engine.addSystem(FrictionSystem);

const loader = new PluginLoader(engine);
loader.loadAll().then(() => {
  console.log("PlugnPlay ready, starting loop");

  // Borders
  for (let i = 0; i < 16; i++) {
    engine.addEntity({ position: Position(i, 0), solid: Solid(), renderable: Renderable("#555") });
    engine.addEntity({ position: Position(i, 15), solid: Solid(), renderable: Renderable("#555") });
    engine.addEntity({ position: Position(0, i), solid: Solid(), renderable: Renderable("#555") });
    engine.addEntity({ position: Position(15, i), solid: Solid(), renderable: Renderable("#555") });
  }

  // Player
  const player = engine.addEntity({
    position: Position(3, 3),
    velocity: Velocity(0, 0),
    renderable: Renderable("#4af"),
    ice: true
  });

  // Input
  window.addEventListener("keydown", e => {
    const v = engine.entities.get(player).components.velocity;
    if (e.key === "ArrowUp") v.dy = -1;
    if (e.key === "ArrowDown") v.dy = 1;
    if (e.key === "ArrowLeft") v.dx = -1;
    if (e.key === "ArrowRight") v.dx = 1;
  });

  // Loop
  function loop() {
    engine.tick(1);
    render(engine, ctx);
    requestAnimationFrame(loop);
  }

  loop();
});
