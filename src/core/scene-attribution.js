// On-demand scene composition inventory for developer performance captures.
// This traverses only visible renderables and never runs in the frame loop.

function triangleCount(geometry) {
  if (!geometry) return 0;
  if (geometry.index) return geometry.index.count / 3;
  return (geometry.attributes?.position?.count || 0) / 3;
}

function drawEstimate(object) {
  if (!object.material) return 0;
  if (Array.isArray(object.material)) {
    return Math.max(1, object.geometry?.groups?.length || object.material.length);
  }
  return 1;
}

function attributionGroup(object) {
  let cursor = object;
  while (cursor) {
    if (cursor.userData?.perfGroup) return cursor.userData.perfGroup;
    if (cursor.userData?.characterInstance) return 'characters';
    cursor = cursor.parent;
  }
  return object.isSprite ? 'labels-ui' : 'unattributed';
}

function materialLabel(material) {
  if (!material) return 'none';
  const color = material.color?.getHexString?.();
  return material.name || `${material.type}${color ? `#${color}` : ''}`;
}

function addMetric(map, key, create) {
  if (!map.has(key)) map.set(key, create());
  return map.get(key);
}

export function analyzeSceneAttribution(scene, { scope = 'scene' } = {}) {
  const groups = new Map();
  const materials = new Map();
  const geometries = new Map();
  const allGeometryIds = new Set();
  const allMaterialIds = new Set();

  scene.traverseVisible((object) => {
    if (!(object.isMesh || object.isSprite || object.isLine || object.isPoints)) return;
    const instances = object.isInstancedMesh ? object.count : 1;
    const baseTriangles = object.isSprite ? 2 : triangleCount(object.geometry);
    const triangles = baseTriangles * instances;
    const draws = drawEstimate(object);
    const groupName = attributionGroup(object);
    const group = addMetric(groups, groupName, () => ({
      group: groupName,
      renderables: 0,
      instances: 0,
      estimatedDraws: 0,
      triangles: 0,
      shadowCasters: 0,
      geometryIds: new Set(),
      materialIds: new Set(),
    }));
    group.renderables += 1;
    group.instances += instances;
    group.estimatedDraws += draws;
    group.triangles += triangles;
    if (object.castShadow) group.shadowCasters += 1;

    if (object.geometry) {
      const geometryId = object.geometry.uuid;
      group.geometryIds.add(geometryId);
      allGeometryIds.add(geometryId);
      const label = object.geometry.name || object.geometry.type || 'Geometry';
      const geometry = addMetric(geometries, geometryId, () => ({
        id: geometryId,
        label,
        objects: 0,
        instances: 0,
        triangles: 0,
        groups: new Set(),
      }));
      geometry.objects += 1;
      geometry.instances += instances;
      geometry.triangles += triangles;
      geometry.groups.add(groupName);
    }

    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of objectMaterials.filter(Boolean)) {
      const materialId = material.uuid;
      group.materialIds.add(materialId);
      allMaterialIds.add(materialId);
      const entry = addMetric(materials, materialId, () => ({
        id: materialId,
        label: materialLabel(material),
        objects: 0,
        estimatedDraws: 0,
        groups: new Set(),
      }));
      entry.objects += 1;
      entry.estimatedDraws += draws / objectMaterials.length;
      entry.groups.add(groupName);
    }
  });

  const cleanGroups = [...groups.values()]
    .map((entry) => ({
      group: entry.group,
      renderables: entry.renderables,
      instances: entry.instances,
      estimatedDraws: entry.estimatedDraws,
      triangles: Math.round(entry.triangles),
      shadowCasters: entry.shadowCasters,
      uniqueGeometries: entry.geometryIds.size,
      uniqueMaterials: entry.materialIds.size,
    }))
    .sort((a, b) => b.estimatedDraws - a.estimatedDraws || b.triangles - a.triangles);
  const cleanMaterials = [...materials.values()]
    .map((entry) => ({
      ...entry,
      estimatedDraws: Number(entry.estimatedDraws.toFixed(2)),
      groups: [...entry.groups].sort(),
    }))
    .sort((a, b) => b.estimatedDraws - a.estimatedDraws || b.objects - a.objects)
    .slice(0, 12);
  const cleanGeometries = [...geometries.values()]
    .map((entry) => ({ ...entry, triangles: Math.round(entry.triangles), groups: [...entry.groups].sort() }))
    .sort((a, b) => b.triangles - a.triangles)
    .slice(0, 12);

  return {
    kind: '67verse-local-scene-attribution',
    scope,
    estimatedDraws: cleanGroups.reduce((sum, entry) => sum + entry.estimatedDraws, 0),
    triangles: cleanGroups.reduce((sum, entry) => sum + entry.triangles, 0),
    renderables: cleanGroups.reduce((sum, entry) => sum + entry.renderables, 0),
    uniqueGeometries: allGeometryIds.size,
    uniqueMaterials: allMaterialIds.size,
    groups: cleanGroups,
    topMaterials: cleanMaterials,
    topGeometries: cleanGeometries,
    caveat: 'Static visible-scene estimate; renderer totals may differ for culling, passes, and shadows.',
  };
}

export function formatAttributionSummary(report, limit = 3) {
  if (!report) return '';
  return report.groups
    .slice(0, limit)
    .map((entry) => `${entry.group} ${entry.estimatedDraws}d/${Math.round(entry.triangles / 1000)}k`)
    .join(' · ');
}
