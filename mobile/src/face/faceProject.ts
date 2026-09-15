import { FACE_VERTS } from './faceMeshData';

export interface ProjectedPoint {
  x: number;
  y: number;
  d: number; // 0..1 depth, used for depth-fade alpha
}

/** Direct port of `faceProject()` from WYRD Mobile.dc.html — projects the 468-point mesh with a
 *  yaw/pitch rotation and fits it into a W×H box with `pad` margin. */
export function faceProject(W: number, H: number, yaw: number, pitch: number, pad: number): ProjectedPoint[] | null {
  const V = FACE_VERTS;
  if (!V || !V.length) return null;
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const pts = V.map((v) => {
    const x1 = v[0] * cy - v[2] * sy, z1 = v[0] * sy + v[2] * cy;
    const y1 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp;
    return { x: x1, y: y1, z: z2 };
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  pts.forEach((p) => {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  });
  const s = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxY - minY));
  const ox = W / 2 - ((minX + maxX) / 2) * s;
  const oy = H / 2 + ((minY + maxY) / 2) * s;
  return pts.map((p) => ({ x: ox + p.x * s, y: oy - p.y * s, d: (p.z - minZ) / (maxZ - minZ || 1) }));
}
