// navigation.js - the deliberately small, honest public play menu.
//
// Other registered games remain available to development hooks, but only the
// three internally playable sprint modes belong in normal hub navigation.
export const FEATURED_MODES = Object.freeze([
  Object.freeze({
    id: 'obstacle',
    name: 'Skyway Sprint',
    icon: '🏁',
    description: 'Race training rivals across the floating obstacle course.',
    status: 'On this device · Training race',
  }),
  Object.freeze({
    id: 'tag',
    name: 'Tag',
    icon: '🏷️',
    description: 'Stay away from IT, or chase down a runner before time expires.',
    status: 'On this device · Training rivals',
  }),
  Object.freeze({
    id: 'balloon',
    name: 'Balloon Battle',
    icon: '🎈',
    description: 'Dash into rivals, protect your balloons, and be the last floating.',
    status: 'On this device · Training rivals',
  }),
]);

export function availableFeaturedModes(games) {
  return FEATURED_MODES.flatMap((mode) => {
    const game = games.get(mode.id);
    return game ? [{ ...mode, game }] : [];
  });
}
