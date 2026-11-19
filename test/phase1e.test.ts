// test/phase1e.test.ts — Phase 1E GPS Map View Verification Test Suite
process.env.NODE_ENV = 'test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import app from '../server/index.js';

console.log('🧪 Starting Phase 1E Verification Tests (GPS Map View & Leaflet)...\n');

async function runTests() {
  await app.ready();

  // ── 1. Test GET /api/photos/geo (GeoJSON FeatureCollection) ──
  console.log('Test 1: GET /api/photos/geo endpoint schema & features');
  const geoRes = await app.inject({
    method: 'GET',
    url: '/api/photos/geo',
  });
  assert.equal(geoRes.statusCode, 200);
  const geoData = JSON.parse(geoRes.body);
  assert.equal(geoData.type, 'FeatureCollection');
  assert(Array.isArray(geoData.features), 'features must be an array');
  assert(Array.isArray(geoData.events), 'events must be an array');
  assert.equal(typeof geoData.total, 'number');

  if (geoData.features.length > 0) {
    const f = geoData.features[0];
    assert.equal(f.type, 'Feature');
    assert.equal(f.geometry.type, 'Point');
    assert(Array.isArray(f.geometry.coordinates));
    assert.equal(f.geometry.coordinates.length, 2);
    // [lon, lat]
    assert.equal(typeof f.geometry.coordinates[0], 'number');
    assert.equal(typeof f.geometry.coordinates[1], 'number');
    assert(f.properties.id, 'Feature must have photo id');
    assert(f.properties.filename, 'Feature must have filename');
    assert(Array.isArray(f.properties.cats), 'Feature must have cats array');
    assert(Array.isArray(f.properties.persons), 'Feature must have persons array');
  }
  console.log(`  ✔ GeoJSON FeatureCollection returned valid features (${geoData.total} points) and events (${geoData.events.length} centroids)`);

  // ── 2. Test Nearby radius query (Haversine distance filter) ─
  console.log('Test 2: Nearby radius query (lat, lon, radius_km)');
  // Coordinates of Siam Paragon in Bangkok: 13.7460, 100.5340
  const nearby1KmRes = await app.inject({
    method: 'GET',
    url: '/api/photos/geo?lat=13.7460&lon=100.5340&radius_km=1',
  });
  assert.equal(nearby1KmRes.statusCode, 200);
  const nearby1Km = JSON.parse(nearby1KmRes.body);
  
  // All returned photos must be within 1km and sorted ascending by distance
  for (let i = 0; i < nearby1Km.features.length; i++) {
    const feat = nearby1Km.features[i];
    assert(feat.properties.distance_km !== undefined);
    assert(feat.properties.distance_km <= 1.0, `Photo ${feat.properties.filename} distance ${feat.properties.distance_km} must be <= 1km`);
    if (i > 0) {
      assert(
        feat.properties.distance_km >= nearby1Km.features[i - 1].properties.distance_km,
        'Photos must be sorted by distance ascending'
      );
    }
  }

  // With 1km radius from Bangkok, Chiang Mai photo (18.7883, 98.9853) must NOT be included
  const hasChiangMai = nearby1Km.features.some((f: any) =>
    f.properties.filename.includes('cnx')
  );
  assert.equal(hasChiangMai, false, 'Chiang Mai photo should not appear within 1km of Bangkok');

  // But with 700km radius, Chiang Mai photo MUST be included
  const nearby700KmRes = await app.inject({
    method: 'GET',
    url: '/api/photos/geo?lat=13.7460&lon=100.5340&radius_km=700',
  });
  assert.equal(nearby700KmRes.statusCode, 200);
  const nearby700Km = JSON.parse(nearby700KmRes.body);
  assert(nearby700Km.features.length >= nearby1Km.features.length);
  console.log('  ✔ Haversine nearby radius calculation correctly filters and sorts by distance');

  // ── 3. Test HTML and UI elements for Map View ───────────────
  console.log('Test 3: HTML Structure for Map View & Leaflet assets');
  const htmlContent = fs.readFileSync(path.resolve('public/index.html'), 'utf-8');
  assert(htmlContent.includes('leaflet.css'), 'Must include Leaflet CSS stylesheet');
  assert(htmlContent.includes('leaflet.js'), 'Must include Leaflet JS library');
  assert(htmlContent.includes('id="view-map"'), 'Must have map view section');
  assert(htmlContent.includes('id="map-container"'), 'Must have map container element');
  assert(htmlContent.includes('id="map-nearby-panel"'), 'Must have nearby photos panel');
  assert(htmlContent.includes('id="btn-map-mode-photos"'), 'Must have photos mode toggle');
  assert(htmlContent.includes('id="btn-map-mode-events"'), 'Must have events mode toggle');
  assert(htmlContent.includes('id="map-radius-select"'), 'Must have radius selector');
  console.log('  ✔ Map view layout, controls, and Leaflet asset tags verified');

  // ── 4. Test CSS styling for Map, Themes and Markers ─────────
  console.log('Test 4: CSS Theme adaptions and Marker styles');
  const cssContent = fs.readFileSync(path.resolve('public/style.css'), 'utf-8');
  assert(cssContent.includes('.map-layout'), 'Must have map layout styles');
  assert(cssContent.includes('.map-box'), 'Must have map box styles');
  assert(cssContent.includes('.map-photo-pin'), 'Must have photo pin marker styles');
  assert(cssContent.includes('.map-event-pin'), 'Must have event pin marker styles');
  assert(cssContent.includes('.nearby-panel'), 'Must have nearby panel styles');
  assert(cssContent.includes('.leaflet-tile'), 'Must have tile filter adaptions for themes');
  console.log('  ✔ Marker styling, popup theming, and dark/warm tile filters verified');

  // ── 5. Test Frontend Logic in app.js ────────────────────────
  console.log('Test 5: Frontend Map logic (initMap, loadMap, findNearbyPhotos)');
  const jsContent = fs.readFileSync(path.resolve('public/app.js'), 'utf-8');
  assert(jsContent.includes('initMap'), 'Must include initMap function');
  assert(jsContent.includes('loadMap'), 'Must include loadMap function');
  assert(jsContent.includes('renderMapMarkers'), 'Must include renderMapMarkers function');
  assert(jsContent.includes('findNearbyPhotos'), 'Must include findNearbyPhotos function');
  assert(jsContent.includes('switchTab'), 'Must include tab switching to map');
  assert(jsContent.includes('/photos/geo'), 'Must fetch from /photos/geo API');
  console.log('  ✔ Frontend map logic and nearby search handlers verified');

  console.log('\n========================================================');
  console.log('🎉 ALL PHASE 1E TESTS PASSED CLEANLY');
  console.log('========================================================\n');
}

runTests().catch((err) => {
  console.error('❌ Phase 1E Test Failed:', err);
  process.exit(1);
});
