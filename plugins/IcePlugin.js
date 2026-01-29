export default function IcePlugin(engine) {
  // Keep track of sliding direction per ice entity
  engine.bus.on("entityMoved", e => {
    if (!e.components.ice) return;
    const v = e.components.velocity;
    e.components._iceDir = { dx: v.dx, dy: v.dy };
  });

  // Restore velocity after friction system runs
  engine.bus.on("afterTick", engine => {
    for (const e of engine.getEntitiesWith("ice", "position")) {
      if (!e.components._iceDir) continue;
      e.components.velocity.dx = e.components._iceDir.dx;
      e.components.velocity.dy = e.components._iceDir.dy;
    }
  }, 10); // priority to run after friction

  // Stop sliding when blocked
  engine.bus.on("entityBlocked", e => {
    if (!e.components.ice) return;
    e.components._iceDir = null;
  });
}
