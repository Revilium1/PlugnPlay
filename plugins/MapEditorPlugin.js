export default function MapEditorPlugin(engine) {
  const canvas = document.getElementById("game");
  let enabled = true;
  let hoverCell = null;

  // Track mouse over grid
  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / engine.tileSize);
    const y = Math.floor((e.clientY - rect.top) / engine.tileSize);
    hoverCell = { x, y };
  });

  // Place/remove walls on click
  canvas.addEventListener("mousedown", () => {
    if (!enabled || !hoverCell) return;
    toggleWall(engine, hoverCell.x, hoverCell.y);
  });

  // Toggle editor mode with "E"
  window.addEventListener("keydown", e => {
    if (e.key === "e") enabled = !enabled;
  });

  // Make hover info available to renderer
  engine.bus.on("afterTick", () => {
    engine._editorHover = hoverCell;
    engine._editorEnabled = enabled;
  });
}

// Helper: add/remove wall entity
function toggleWall(engine, x, y) {
  const existing = engine.getEntitiesWith("position", "solid")
    .find(e => e.components.position.x === x && e.components.position.y === y);

  if (existing) engine.entities.delete(existing.id);
  else engine.addEntity({
    position: { x, y },
    solid: {},
    renderable: { color: "#555" }
  });
}
