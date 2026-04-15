export default function IcePlugin(engine) {
  engine.registerBlock({
    name: "Ice Floor",
    color: "#4af",
    layer: "background",
    create: (x, y) => ({
      position: { x, y },
      renderable: { color: "#4af" },
      iceFloor: {}
    })
  });

  function isOnIce(entity) {
    const p = entity.components.position;
    return engine.getEntitiesWith("position", "iceFloor")
      .some(tile => tile.components.position.x === p.x && tile.components.position.y === p.y);
  }

  engine.bus.on("entityMoved", entity => {
    if (!entity.components.velocity || !entity.components.position) return;

    const v = entity.components.velocity;
    if (v.dx !== 0 || v.dy !== 0) {
      entity.components._iceDir = isOnIce(entity)
        ? { dx: v.dx, dy: v.dy }
        : null;
    }
  });

  engine.bus.on("afterTick", engine => {
    for (const entity of engine.getEntitiesWith("velocity", "position")) {
      const dir = entity.components._iceDir;
      if (!dir) continue;
      if (isOnIce(entity)) {
        entity.components.velocity.dx = dir.dx;
        entity.components.velocity.dy = dir.dy;
      } else {
        entity.components._iceDir = null;
      }
    }
  });

  engine.bus.on("entityBlocked", entity => {
    if (!entity.components.position || !entity.components.velocity) return;
    if (isOnIce(entity)) {
      entity.components._iceDir = null;
    }
  });
}