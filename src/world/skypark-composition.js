const freezePoint = ([x, z]) => Object.freeze([x, z]);

const defineRoute = (route) => Object.freeze({
  ...route,
  nodes: Object.freeze(route.nodes.map(freezePoint)),
});

export const SKYPARK_ROUTES = Object.freeze([
  defineRoute({
    id: 'arrival-court',
    name: 'Arrival Court',
    purpose: 'Frame the first ten seconds from spawn to the civic plaza.',
    signal: 'ceramic',
    width: 7.2,
    nodes: [[0, 28], [0, 18]],
  }),
  defineRoute({
    id: 'play-lozenges',
    name: 'Play Lozenges',
    purpose: 'Keep Play centered and readable without painting a stripe across the plaza.',
    signal: 'yellow',
    width: 6.8,
    primary: true,
    nodes: [[0, 18], [0, 7.2], [0, -25]],
  }),
  defineRoute({
    id: 'creator-terrace',
    name: 'Creator Terrace',
    purpose: 'Give making a distinct left-hand destination on the plaza perimeter.',
    signal: 'coral',
    width: 4.2,
    nodes: [[0, 7.2], [-13, 10.2]],
  }),
  defineRoute({
    id: 'echo-commons',
    name: 'Echo Commons',
    purpose: 'Give social play a distinct right-hand garden room.',
    signal: 'aqua',
    width: 4.2,
    nodes: [[0, 7.2], [12.5, 10.5]],
  }),
  defineRoute({
    id: 'flow-steps',
    name: 'Flow Steps',
    purpose: 'Teach jumping on the left edge of the arrival court.',
    signal: 'coral',
    width: 3.9,
    nodes: [[0, 24], [-6.3, 19.1]],
  }),
]);

export const SKYPARK_LANDMARKS = Object.freeze([
  Object.freeze({
    id: 'skyfold-canopy',
    name: 'Skyfold Canopy',
    district: 'Confluence Plaza',
    routeId: 'play-lozenges',
    purpose: 'Anchor arrival with one original civic sculpture while preserving the Play sightline.',
    silhouette: 'Three asymmetric folded ceramic fins holding one suspended gold lozenge.',
    position: freezePoint([-5.3, 6.8]),
  }),
]);

export function skyparkRouteSegments(route) {
  if (!route?.nodes || route.nodes.length < 2) return [];
  return route.nodes.slice(1).map((end, index) => Object.freeze({
    start: route.nodes[index],
    end,
  }));
}

export function validateSkyparkComposition({
  routes = SKYPARK_ROUTES,
  landmarks = SKYPARK_LANDMARKS,
} = {}) {
  const issues = [];
  const routeIds = new Set();
  const landmarkIds = new Set();

  for (const route of routes) {
    if (!route.id || routeIds.has(route.id)) issues.push(`duplicate or missing route id: ${route.id || 'unknown'}`);
    routeIds.add(route.id);
    if (!route.name || !route.purpose) issues.push(`route ${route.id || 'unknown'} is not intentionally named`);
    if (!Array.isArray(route.nodes) || route.nodes.length < 2) issues.push(`route ${route.id || 'unknown'} needs two nodes`);
  }
  for (const landmark of landmarks) {
    if (!landmark.id || landmarkIds.has(landmark.id)) {
      issues.push(`duplicate or missing landmark id: ${landmark.id || 'unknown'}`);
    }
    landmarkIds.add(landmark.id);
    if (!landmark.name || !landmark.purpose || !landmark.silhouette) {
      issues.push(`landmark ${landmark.id || 'unknown'} is missing authored intent`);
    }
    if (!routeIds.has(landmark.routeId)) {
      issues.push(`landmark ${landmark.id || 'unknown'} has no connected route`);
    }
  }
  if (!routes.some((route) => route.primary && route.id === 'play-lozenges')) {
    issues.push('the unobstructed first-play lozenge route is missing');
  }
  return Object.freeze(issues);
}

export function skyparkCompositionSnapshot() {
  return Object.freeze({
    landmarkIds: Object.freeze(SKYPARK_LANDMARKS.map(({ id }) => id)),
    routeIds: Object.freeze(SKYPARK_ROUTES.map(({ id }) => id)),
    primaryRouteId: SKYPARK_ROUTES.find(({ primary }) => primary)?.id || null,
    validationIssues: validateSkyparkComposition(),
  });
}
