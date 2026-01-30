// ================= ICE PLUGIN =================
export default function IcePlugin(engine) {
  // Register the ice tile so it appears in the editor hotbar
  registerTile({
    id: "ice",
    name: "Ice",
    color: "#0af",  // light blue
    solid: false,
    pluginOrigin: "IcePlugin"
  });

  // Optional: add behavior for ice (sliding) using event bus
  engine.bus.on("entityMoved", e => {
    if (!e.ice) return;

    // Keep sliding in last move direction until blocked
    const lastDir = e._iceDir;
    if (lastDir) {
      engine.moveEntity(e.id, lastDir.dx, lastDir.dy);
    }
  });

  // Example: mark any player on ice to slide
  const player = [...engine.entities.values()].find(ent => ent.color === "#4af");
  if (player) player.ice = true;
}
