// sky.js — one atmosphere for every 67VERSE scene.
//
// The hub and all three modes share a single sky treatment so moving between
// them never changes the world's weather: an azure-overhead gradient fading to
// a pale horizon haze, with a cloud sea far below that gives every scene its
// sense of height. Both helpers are pure geometry — no textures, no fetches.

export const SKY_HIGH = 0x1f7fd6; // deep azure at the zenith
export const SKY_LOW = 0xbfe6fb;  // pale haze at the horizon (also the fog)

const VERTEX_SHADER = `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const FRAGMENT_SHADER = `
  uniform vec3 top; uniform vec3 bottom;
  varying vec3 vDir;
  void main() {
    float h = clamp(vDir.y * 1.3 + 0.28, 0.0, 1.0);
    gl_FragColor = vec4(mix(bottom, top, pow(h, 0.78)), 1.0);
  }`;

/**
 * Inside-out gradient dome. `fog: false` keeps the sky itself out of the fog
 * so the horizon stays a clean blend instead of washing to a flat colour.
 */
export function createSkyDome(THREE, radius = 300) {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(SKY_HIGH) },
      bottom: { value: new THREE.Color(SKY_LOW) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), material);
  dome.name = 'atmosphere:sky-dome';
  dome.userData.perfGroup = 'sky';
  return dome;
}

/**
 * Instanced cloud sea below the playable surface. Placement is deterministic
 * from `seed`, so every player sees the same skyline and a reload never
 * reshuffles it.
 *
 * `layout: 'radial'` rings a single island (hub, arenas); `layout: 'corridor'`
 * runs a band along -z for a course.
 */
export function createCloudSea(THREE, {
  count = 96,
  seed = 20260801,
  layout = 'radial',
  y = -22,
  yJitter = 12,
  radius = 96,
  innerRadius = 18,
  length = 210,
  startZ = 14,
  halfWidth = 66,
  opacity = 0.9,
} = {}) {
  let state = seed >>> 0;
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };

  const mesh = new THREE.InstancedMesh(
    new THREE.SphereGeometry(1, 8, 6),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      opacity,
      depthWrite: false,
    }),
    count,
  );

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  for (let index = 0; index < count; index += 1) {
    const width = 5 + rand() * 10;
    if (layout === 'corridor') {
      position.set(
        (rand() - 0.5) * halfWidth * 2,
        y - rand() * yJitter,
        startZ - (index / count) * length + (rand() - 0.5) * 8,
      );
    } else {
      const angle = rand() * Math.PI * 2;
      const distance = innerRadius + rand() * (radius - innerRadius);
      position.set(Math.cos(angle) * distance, y - rand() * yJitter, Math.sin(angle) * distance);
    }
    matrix.compose(position, rotation, scale.set(width, width * 0.41, width * 0.8));
    mesh.setMatrixAt(index, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = -1;
  mesh.name = 'atmosphere:cloud-sea';
  mesh.userData.perfGroup = 'sky';
  return mesh;
}
