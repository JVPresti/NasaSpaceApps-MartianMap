// Route data (route.json). Ported from docs/marswalk-assets/testbench-reference/main.js (lines 304-306).
// Only the data is kept here: the habitat is placed at the HAB waypoint and the planning-table map draws the waypoints.
// The bench's placeholder planner, route ribbon and waypoint labels are not ported (see issues #15, #16, #29).
export function createRoute(ctx) {
  const { tileH } = ctx.terrain;
  return {
    /** { waypoints: [{ name, x, z }], path?: [[x, z], ...] } */
    data: null,
    slopeDeg(x, z) { const gx = (tileH(x + 2, z) - tileH(x - 2, z)) / 4, gz = (tileH(x, z + 2) - tileH(x, z - 2)) / 4; return Math.atan(Math.hypot(gx, gz)) * 57.2958; },
  };
}
