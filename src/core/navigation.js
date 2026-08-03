// navigation.js - the public play menu.
//
// Every mode listed here must be mountable on this device today; the status
// line says what it actually is, not what it will become. 67Show and Creator
// were reachable only through dev routes (?game=show67 / ?game=creator) even
// though both mount and play locally, so nobody using the hub normally could
// find them. They are listed now with status copy that keeps the same honesty:
// local play, no online services implied.
export const FEATURED_MODES = Object.freeze([
  Object.freeze({
    id: 'obstacle',
    name: 'Skyway Sprint',
    icon: 'RACE',
    description: 'Race training rivals across the floating obstacle course.',
    status: 'On this device · Training race',
  }),
  Object.freeze({
    id: 'tag',
    name: 'Tag',
    icon: 'TAG',
    description: 'Stay away from IT, or chase down a runner before time expires.',
    status: 'On this device · Training rivals',
  }),
  Object.freeze({
    id: 'balloon',
    name: 'Balloon Battle',
    icon: 'POP',
    description: 'Dash into rivals, protect your balloons, and be the last floating.',
    status: 'On this device · Training rivals',
  }),
  Object.freeze({
    id: 'skate',
    name: 'Skate Race',
    icon: '67',
    description: 'Board race on the Skyway — faster, lower, first to the line.',
    status: 'On this device · Training race',
  }),
  Object.freeze({
    id: 'show67',
    name: '67 Show',
    icon: 'SHOW',
    description: 'Three rounds back to back — Tag, Balloon Battle, Skyway Sprint — scored as one bracket.',
    status: 'On this device · Local bracket',
  }),
  Object.freeze({
    id: 'squid67',
    name: 'Squid 67',
    icon: 'SQUID',
    description: 'Red light, green light — then the glass bridge. Freeze on red, pick the pane that holds.',
    status: 'On this device · Local gauntlet',
  }),
  Object.freeze({
    id: 'creator',
    name: 'Creator',
    icon: 'MAKE',
    description: 'Build a course from a template, play it back, and keep it on this device.',
    status: 'On this device · Saves locally',
  }),
]);

// Fast-travel targets for the same panel: real, authored places in today's
// hub — the two activity starts plus rebuilt landmarks with exact authored
// coordinates. A spot only teleports; activities still begin at their own
// marker with E / GRAB, so the opt-in contract in design/hub-activities.md
// ("walking past never starts an activity") stays intact. The pre-rebuild
// landmarks (Skyloom Beacon, Ripple Pavilion, Sunstep Terrace) are not listed
// because arrival-rebuild-v1 removed them from the world.
export const HUB_SPOTS = Object.freeze([
  Object.freeze({
    id: 'beacon-line',
    name: 'Beacon Line',
    place: 'Skate Plaza',
    description: 'Five-gate skate run in 24 seconds. Start at the marker with E / GRAB.',
    x: 4,
    z: 7.5,
    // Face the first gate (East Turn, 11.7/-1.6) so the route reads instantly.
    yaw: Math.atan2(11.7 - 4, -1.6 - 7.5),
  }),
  Object.freeze({
    id: 'ripple-steps',
    name: 'Ripple Steps',
    place: 'Water Garden',
    description: 'Jump the three ripple stones, then reach the far bridge. Starts with E / GRAB.',
    x: 11,
    z: 10.5,
    // Face the first ripple stone (8.9/12.8).
    yaw: Math.atan2(8.9 - 11, 12.8 - 10.5),
  }),
  Object.freeze({
    id: 'flow-steps',
    name: 'Flow Steps',
    place: 'Arrival route',
    description: 'The jump steps on the way down to Confluence Plaza.',
    x: -4.5,
    z: 16.5,
    yaw: Math.PI,
  }),
  Object.freeze({
    id: 'skyfold-canopy',
    name: 'Skyfold Canopy',
    place: 'Skypark landmark',
    description: 'The folded canopy over the arrival court.',
    x: 0,
    z: 20,
    yaw: -2.76,
  }),
]);

export function availableFeaturedModes(games) {
  return FEATURED_MODES.flatMap((mode) => {
    const game = games.get(mode.id);
    return game ? [{ ...mode, game }] : [];
  });
}
