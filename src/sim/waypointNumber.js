/**
 * One numbering for route waypoints on every view (#198).
 *
 * The start of the route (HAB, at the airlock) is 0, and every later waypoint keeps its index in the route, so WP1
 * is 1. Leg k of the cost table ends at waypoint k, so the leg number and the number on the map marker match. The
 * Plan map markers, the Waypoints list, the elevation profile, the cost table and the Walk minimap all read it here.
 */

/**
 * @param {number} index position in `route.waypoints`, 0 for the start
 * @returns {string}
 */
export function waypointNumber(index) {
  return String(index);
}
