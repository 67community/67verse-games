// Reusable, data-driven gameplay widgets for authored local levels.
//
// Descriptions are immutable authoring data. Runtime objects are deliberately
// mutable so a game can attach a Three.js mesh/group without coupling this
// module to rendering.

export const LEVEL_WIDGET_TYPES = Object.freeze([
  'static-platform',
  'moving-platform',
  'sweeper',
  'checkpoint',
  'fall-hazard',
  'goal-zone',
  'score-zone',
]);

const TYPE_SET = new Set(LEVEL_WIDGET_TYPES);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number.`);
  return value;
}

function positive(value, label) {
  finite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be greater than zero.`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

function validatePosition(position, label) {
  const point = position || {};
  finite(point.x ?? 0, `${label}.x`);
  finite(point.y ?? 0, `${label}.y`);
  finite(point.z ?? 0, `${label}.z`);
}

function validateWidget(widget, index) {
  if (!widget || typeof widget !== 'object') {
    throw new TypeError(`widgets[${index}] must be an object.`);
  }
  if (!widget.id || typeof widget.id !== 'string') {
    throw new TypeError(`widgets[${index}].id must be a non-empty string.`);
  }
  if (!TYPE_SET.has(widget.type)) {
    throw new RangeError(`Unsupported level widget type "${widget.type}".`);
  }

  if (widget.type === 'static-platform' || widget.type === 'moving-platform') {
    validatePosition(widget.position, `${widget.id}.position`);
    positive(widget.size?.x, `${widget.id}.size.x`);
    positive(widget.size?.y, `${widget.id}.size.y`);
    positive(widget.size?.z, `${widget.id}.size.z`);
    if (widget.timing) {
      positive(widget.timing.on, `${widget.id}.timing.on`);
      positive(widget.timing.off, `${widget.id}.timing.off`);
      finite(widget.timing.phase ?? 0, `${widget.id}.timing.phase`);
    }
    if (widget.type === 'moving-platform') {
      if (!['x', 'y', 'z'].includes(widget.motion?.axis)) {
        throw new RangeError(`${widget.id}.motion.axis must be x, y, or z.`);
      }
      finite(widget.motion.distance, `${widget.id}.motion.distance`);
      positive(widget.motion.period, `${widget.id}.motion.period`);
      finite(widget.motion.phase ?? 0, `${widget.id}.motion.phase`);
    }
  } else if (widget.type === 'sweeper') {
    validatePosition(widget.position, `${widget.id}.position`);
    positive(widget.length, `${widget.id}.length`);
    positive(widget.width, `${widget.id}.width`);
    finite(widget.speed, `${widget.id}.speed`);
    finite(widget.startAngle ?? 0, `${widget.id}.startAngle`);
  } else if (widget.type === 'checkpoint') {
    if (!['x', 'y', 'z'].includes(widget.trigger?.axis)) {
      throw new RangeError(`${widget.id}.trigger.axis must be x, y, or z.`);
    }
    if (!['positive', 'negative'].includes(widget.trigger?.direction)) {
      throw new RangeError(`${widget.id}.trigger.direction must be positive or negative.`);
    }
    finite(widget.trigger.value, `${widget.id}.trigger.value`);
    validatePosition(widget.spawn, `${widget.id}.spawn`);
  } else if (widget.type === 'fall-hazard') {
    finite(widget.belowY, `${widget.id}.belowY`);
  } else if (widget.type === 'goal-zone') {
    if (widget.shape !== 'line') throw new RangeError(`${widget.id}.shape must be line.`);
    if (!['x', 'y', 'z'].includes(widget.axis)) {
      throw new RangeError(`${widget.id}.axis must be x, y, or z.`);
    }
    if (!['positive', 'negative'].includes(widget.direction)) {
      throw new RangeError(`${widget.id}.direction must be positive or negative.`);
    }
    finite(widget.value, `${widget.id}.value`);
  } else if (widget.type === 'score-zone') {
    if (widget.shape !== 'circle') throw new RangeError(`${widget.id}.shape must be circle.`);
    positive(widget.radius, `${widget.id}.radius`);
  }
}

export function defineLevelDescription({ id, mode, widgets, metadata = {} }) {
  if (!id || typeof id !== 'string') throw new TypeError('Level id must be a non-empty string.');
  if (!mode || typeof mode !== 'string') throw new TypeError('Level mode must be a non-empty string.');
  if (!Array.isArray(widgets)) throw new TypeError('Level widgets must be an array.');
  const ids = new Set();
  widgets.forEach((widget, index) => {
    validateWidget(widget, index);
    if (ids.has(widget.id)) throw new RangeError(`Duplicate level widget id "${widget.id}".`);
    ids.add(widget.id);
  });
  return deepFreeze({ id, mode, widgets: [...widgets], metadata: { ...metadata } });
}

export function widgetsByType(level, type) {
  if (!TYPE_SET.has(type)) throw new RangeError(`Unsupported level widget type "${type}".`);
  return level.widgets.filter((widget) => widget.type === type);
}

function platformBounds(position, size) {
  return {
    minX: position.x - size.x / 2,
    maxX: position.x + size.x / 2,
    minZ: position.z - size.z / 2,
    maxZ: position.z + size.z / 2,
    top: position.y + size.y / 2,
  };
}

export function createPlatformRuntime(spec, mesh = null) {
  if (!['static-platform', 'moving-platform'].includes(spec.type)) {
    throw new TypeError(`Expected a platform widget, received "${spec.type}".`);
  }
  const position = {
    x: spec.position?.x ?? 0,
    y: spec.position?.y ?? 0,
    z: spec.position?.z ?? 0,
  };
  return {
    id: spec.id,
    type: spec.type,
    spec,
    origin: { ...position },
    position,
    ...platformBounds(position, spec.size),
    active: true,
    timeLeft: Infinity,
    mesh,
  };
}

export function createSweeperRuntime(spec, group = null) {
  if (spec.type !== 'sweeper') throw new TypeError(`Expected a sweeper widget, received "${spec.type}".`);
  return {
    id: spec.id,
    type: spec.type,
    spec,
    x: spec.position.x,
    y: spec.position.y ?? 0,
    z: spec.position.z,
    len: spec.length,
    width: spec.width,
    speed: spec.speed,
    angle: spec.startAngle ?? 0,
    group,
  };
}

export function stepLevelWidget(runtime, time, dt) {
  if (runtime.type === 'static-platform' || runtime.type === 'moving-platform') {
    const timing = runtime.spec.timing;
    if (timing) {
      const cycle = timing.on + timing.off;
      const tau = ((time + (timing.phase ?? 0)) % cycle + cycle) % cycle;
      runtime.active = tau < timing.on;
      runtime.timeLeft = runtime.active ? timing.on - tau : 0;
    }
    if (runtime.type === 'moving-platform') {
      const motion = runtime.spec.motion;
      const phase = (Math.PI * 2 * time) / motion.period + (motion.phase ?? 0);
      runtime.position[motion.axis] =
        runtime.origin[motion.axis] + motion.distance * Math.sin(phase);
      Object.assign(runtime, platformBounds(runtime.position, runtime.spec.size));
      if (runtime.mesh?.position) {
        runtime.mesh.position.set(runtime.position.x, runtime.position.y, runtime.position.z);
      }
    }
    return runtime;
  }
  if (runtime.type === 'sweeper') {
    runtime.angle += runtime.speed * dt;
    if (runtime.group?.rotation) runtime.group.rotation.y = runtime.angle;
    return runtime;
  }
  return runtime;
}

export function samplePlatformGround(platforms, x, z, fromY, pitY = -100) {
  let top = pitY;
  let box = null;
  for (const platform of platforms) {
    if (!platform.active) continue;
    if (x < platform.minX || x > platform.maxX || z < platform.minZ || z > platform.maxZ) continue;
    if (platform.top > fromY + 0.01) continue;
    if (platform.top > top) {
      top = platform.top;
      box = platform;
    }
  }
  return { y: top, box };
}

function passedLine(axis, direction, value, point) {
  const coordinate = point?.[axis];
  if (!Number.isFinite(coordinate)) return false;
  return direction === 'negative' ? coordinate < value : coordinate > value;
}

export function checkpointTriggered(checkpoint, point) {
  if (checkpoint.type !== 'checkpoint') return false;
  return passedLine(
    checkpoint.trigger.axis,
    checkpoint.trigger.direction,
    checkpoint.trigger.value,
    point,
  );
}

export function fallHazardTriggered(hazard, point) {
  return hazard.type === 'fall-hazard' && Number.isFinite(point?.y) && point.y < hazard.belowY;
}

export function goalZoneTriggered(goal, point) {
  return goal.type === 'goal-zone'
    && goal.shape === 'line'
    && passedLine(goal.axis, goal.direction, goal.value, point);
}

export function scoreZoneOverlap(zone, a, b = { x: 0, z: 0 }) {
  if (zone.type !== 'score-zone' || zone.shape !== 'circle') return false;
  const dx = (a?.x ?? Infinity) - (b?.x ?? 0);
  const dz = (a?.z ?? Infinity) - (b?.z ?? 0);
  return dx * dx + dz * dz <= zone.radius * zone.radius;
}
