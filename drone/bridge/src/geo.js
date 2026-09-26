// Small geodesy helpers for the distances the safety layer needs (tens to hundreds of metres).

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Great-circle (haversine) distance in metres between two lat/lon points in degrees. */
function distanceMeters(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The point [northM] metres north and [eastM] metres east of [origin] (flat-earth, fine at this scale). */
function offsetMeters(origin, northM, eastM) {
  return {
    lat: origin.lat + (northM / EARTH_RADIUS_M) * (180 / Math.PI),
    lon: origin.lon + (eastM / (EARTH_RADIUS_M * Math.cos(toRad(origin.lat)))) * (180 / Math.PI),
  };
}

module.exports = { distanceMeters, offsetMeters };
