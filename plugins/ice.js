export default function IcePlugin(engine) {

  // 👇 Auto-add ice to player(s)
  for (const e of engine.getEntitiesWith("velocity", "position")) {
    // You can refine this condition later (tag system, player flag, etc.)
    e.components.ice = {};
  }

  // If entities can be added later, catch them too
  engine.bus.on("entityAdded", e => {
    if (e.components.velocity && e.components.position) {
      e.components.ice = {};
    }
  });

  // Store direction on move
  engine.bus.on("entityMoved", e => {
    if (!e.components.ice) return;

    const v = e.components.velocity;
    if (v.dx !== 0 || v.dy !== 0) {
      e.components._iceDir = { dx: v.dx, dy: v.dy };
    }
  });

  // Reapply movement after friction
  engine.bus.on("afterTick", engine => {
    for (const e of engine.getEntitiesWith("ice", "position")) {
      const dir = e.components._iceDir;
      if (!dir) continue;

      e.components.velocity.dx = dir.dx;
      e.components.velocity.dy = dir.dy;
    }
  });

  // Stop when hitting wall
  engine.bus.on("entityBlocked", e => {
    if (!e.components.ice) return;
    e.components._iceDir = null;
  });
}