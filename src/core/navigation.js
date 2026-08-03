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
    id: 'creator',
    name: 'Creator',
    icon: 'MAKE',
    description: 'Build a course from a template, play it back, and keep it on this device.',
    status: 'On this device · Saves locally',
  }),
]);

export function availableFeaturedModes(games) {
  return FEATURED_MODES.flatMap((mode) => {
    const game = games.get(mode.id);
    return game ? [{ ...mode, game }] : [];
  });
}
