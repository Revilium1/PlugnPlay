// ================= EVENT BUS =================
class EventBus {
  constructor() { this.listeners = {}; }
  on(type, fn) { (this.listeners[type] ??= []).push(fn); }
  off(type, fn) {
    this.listeners[type] = (this.listeners[type] ?? []).filter(f => f !== fn);
  }
  emit(type, data) {
    for (const fn of this.listeners[type] ?? []) fn(data);
  }
}

// ================= TILE REGISTRY =================
const Tiles = new Map();

function registerTile(tile) {
  Tiles.set(tile.id, Object.freeze(tile));
}

// Core tiles
registerTile({ id: "floor", name: "Floor", color: "#222", solid: false, friction: 1 });
registerTile({ id: "wall",  name: "Wall",  color: "#555", solid: true  });

// ================= GRID ENGINE =================
class GridEngine {
  constructor(w, h, tileSize) {
    this.w = w;
    this.h = h;
    this.tileSize = tileSize;

    // GRID = TILE IDS
    this.grid = Array.from({ length: h }, () =>
      Array(w).fill("floor")
    );

    // ACTORS (player, enemies)
    this.actors = new Map();

    this.systems = [];
    this.bus = new EventBus();

    this.editor = { enabled: true, hover: null };
  }

  addSystem(sys) {
    this.systems.push(sys);
  }

  addActor(id, actor) {
    this.actors.set(id, actor);
  }

  getTile(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    return Tiles.get(this.grid[y][x]);
  }

  setTile(x, y, tileId) {
    if (!Tiles.has(tileId)) return;
    this.grid[y][x] = tileId;
  }

  moveActor(actor, dx, dy) {
    const nx = actor.x + dx;
    const ny = actor.y + dy;

    const tile = this.getTile(nx, ny);
    if (!tile || tile.solid) return false;

    actor.x = nx;
    actor.y = ny;
    actor.dx = dx;
    actor.dy = dy;

    this.bus.emit("actorMoved", actor);
    return true;
  }

  tick(dt) {
    for (const sys of this.systems) sys.update(this, dt);
  }
}

// ================= SYSTEMS =================
const PlayerInputSystem = {
  update(engine) {
    const p = engine.actors.get("player");
    if (!p) return;

    if (p.input.dx || p.input.dy) {
      engine.moveActor(p, p.input.dx, p.input.dy);
      p.input.dx = p.input.dy = 0;
    }
  }
};

const IceSystem = {
  update(engine) {
    for (const actor of engine.actors.values()) {
      const tile = engine.getTile(actor.x, actor.y);
      if (tile?.friction === 0 && (actor.dx || actor.dy)) {
        engine.moveActor(actor, actor.dx, actor.dy);
      }
    }
  }
};

// ================= EDITOR =================
function setupEditor(engine, canvas) {
  let selectedTile = [...Tiles.values()][0];

  const bar = document.createElement("div");
  Object.assign(bar.style, {
    position: "absolute",
    bottom: "10px",
    left: "10px",
    display: "flex",
    gap: "4px"
  });
  document.body.appendChild(bar);

  function refresh() {
    bar.innerHTML = "";
    Tiles.forEach(tile => {
      const b = document.createElement("div");
      Object.assign(b.style, {
        width: "32px",
        height: "32px",
        background: tile.color,
        border: tile === selectedTile ? "2px solid #0f0" : "1px solid #000"
      });
      b.onclick = () => { selectedTile = tile; refresh(); };
      bar.appendChild(b);
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
    const { x, y } = engine.editor.hover;
    engine.setTile(x, y, selectedTile.id);
  };

  window.onkeydown = e => {
    if (e.key === "e") engine.editor.enabled = !engine.editor.enabled;
  };
}

// ================= RENDERER =================
function render(engine, ctx) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Tiles
  for (let y = 0; y < engine.h; y++) {
    for (let x = 0; x < engine.w; x++) {
      const tile = Tiles.get(engine.grid[y][x]);
      ctx.fillStyle = tile.color;
      ctx.fillRect(
        x * engine.tileSize,
        y * engine.tileSize,
        engine.tileSize,
        engine.tileSize
      );
    }
  }

  // Actors
  for (const actor of engine.actors.values()) {
    ctx.fillStyle = actor.color;
    ctx.fillRect(
      actor.x * engine.tileSize,
      actor.y * engine.tileSize,
      engine.tileSize,
      engine.tileSize
    );
  }

  // Editor hover
  if (engine.editor.enabled && engine.editor.hover) {
    const { x, y } = engine.editor.hover;
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

const engine = new GridEngine(16, 16, 32);

engine.addSystem(PlayerInputSystem);
engine.addSystem(IceSystem);
setupEditor(engine, canvas);

// Borders
for (let i = 0; i < 16; i++) {
  engine.setTile(i, 0, "wall");
  engine.setTile(i, 15, "wall");
  engine.setTile(0, i, "wall");
  engine.setTile(15, i, "wall");
}

// Player
engine.addActor("player", {
  x: 3,
  y: 3,
  dx: 0,
  dy: 0,
  color: "#4af",
  input: { dx: 0, dy: 0 }
});

// Input
window.onkeydown = e => {
  const p = engine.actors.get("player");
  if (!p) return;
  if (e.key === "ArrowUp") p.input.dy = -1;
  if (e.key === "ArrowDown") p.input.dy = 1;
  if (e.key === "ArrowLeft") p.input.dx = -1;
  if (e.key === "ArrowRight") p.input.dx = 1;
};

// ================= MAIN LOOP =================
(function loop() {
  engine.tick(1);
  render(engine, ctx);
  requestAnimationFrame(loop);
})();
