// WYRD's own 3D view of "the world" — opened by the open_world_map tool (see server.js callLLM),
// or by clicking a marker directly. Built on the same Three.js instance already loaded for
// BRAIN_3D/FACE, plus the OrbitControls addon loaded in index.html right before this file.
(function () {
  const modal = document.getElementById('worldMapModal');
  const canvas = document.getElementById('worldMapCanvas');
  const wrap = document.getElementById('worldMapCanvasWrap');
  const closeBtn = document.getElementById('closeWorldMapBtn');
  const infoPanel = document.getElementById('worldMapInfo');
  if (!modal || !canvas) return;

  const RADIUS = 5;

  let renderer, scene, camera, controls, markerGroup;
  let countries = [];
  let raycaster, mouse;
  let initialized = false;
  let running = false; // gates the render loop so it fully stops while the modal is closed —
                        // otherwise this scene keeps rendering forever in the background,
                        // competing with the FACE canvas and BRAIN_3D iframe for every frame

  function latLngToVec3(lat, lng, radius) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lng + 180) * (Math.PI / 180);
    return new THREE.Vector3(
      -radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.cos(phi),
      radius * Math.sin(phi) * Math.sin(theta)
    );
  }

  function initScene() {
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
    camera.position.set(0, 0, 13);

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    // capped at 2x — an uncapped ratio on a 3x-DPI screen renders 9x the pixels per frame for no
    // visible gain, and was the main reason drag rotation felt laggy instead of snappy
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    scene.add(new THREE.AmbientLight(0x88ffaa, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(5, 3, 5);
    scene.add(sun);

    const earthTex = new THREE.TextureLoader().load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg');
    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({ map: earthTex, shininess: 5 })
    );
    scene.add(globe);

    // faint green wireframe shell just outside the surface — ties the globe back to WYRD's own
    // terminal-green visual language instead of looking like a bare stock-photo earth
    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.015, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ff41, wireframe: true, transparent: true, opacity: 0.06 })
    );
    scene.add(shell);

    markerGroup = new THREE.Group();
    scene.add(markerGroup);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    // higher dampingFactor = the camera catches up to your drag faster (less perceived lag)
    // while still easing to a stop instead of snapping — 0.08 was smoothing over too many
    // frames and read as sluggish; rotateSpeed bumped so a given drag distance turns further
    controls.dampingFactor = 0.18;
    controls.rotateSpeed = 1.15;
    controls.minDistance = 7;
    controls.maxDistance = 24;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.4;
    controls.addEventListener('start', () => { controls.autoRotate = false; });

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    canvas.addEventListener('click', onCanvasClick);
    window.addEventListener('resize', resize);
    resize();
  }

  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (!w || !h || !renderer) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  function animate() {
    if (!running) return; // loop fully stops here — no queued frame left dangling
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  function startLoop() {
    if (running) return;
    running = true;
    animate();
  }

  function stopLoop() {
    running = false;
  }

  async function loadCountries() {
    if (countries.length) return countries;
    try {
      const res = await fetch('/api/world/countries');
      countries = await res.json();
    } catch (err) {
      countries = [];
    }
    const markerGeo = new THREE.SphereGeometry(0.06, 8, 8);
    countries.forEach((c) => {
      const marker = new THREE.Mesh(markerGeo, new THREE.MeshBasicMaterial({ color: 0x00ff88 }));
      marker.position.copy(latLngToVec3(c.lat, c.lng, RADIUS + 0.03));
      marker.userData.country = c;
      markerGroup.add(marker);
    });
    return countries;
  }

  function onCanvasClick(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(markerGroup.children);
    if (hits.length) selectCountry(hits[0].object.userData.country);
  }

  // Smoothly moves the camera to look at a given lat/lng on the globe, rather than snapping —
  // this is the "guided fly-to" half of navigation (the other half, free drag/zoom, is handled
  // by OrbitControls above). Called both when the model itself picks a country via
  // open_world_map's focus_country, and when the user clicks a marker directly.
  //
  // TODO(human): implement the camera tween.
  // - Compute the target point on the globe surface for (lat, lng) via latLngToVec3(lat, lng, RADIUS).
  // - Animate camera.position (and controls.target, which should stay {0,0,0} — the globe center)
  //   from its current position toward a point further out along that same direction, e.g.
  //   latLngToVec3(lat, lng, CURRENT_DISTANCE_FROM_CENTER), over ~800-1200ms.
  // - Disable controls.autoRotate for the duration (it's already off after any drag, but a fly-to
  //   triggered by chat happens with no prior drag).
  // - Use requestAnimationFrame + an eased t (e.g. 1 - Math.pow(1 - t, 3)) rather than a linear lerp,
  //   so the motion doesn't feel robotic — camera.position.lerpVectors(start, end, eased) per frame.
  function flyTo(lat, lng) {
    // placeholder so selectCountry() still runs before this is implemented
    controls.autoRotate = false;
  }

  async function selectCountry(country) {
    flyTo(country.lat, country.lng);
    infoPanel.innerHTML = `<div class="world-map-info-loading">reading ${country.name}...</div>`;
    try {
      const res = await fetch(`/api/world/country/${country.cca3}`);
      const info = await res.json();
      renderInfo(info);
    } catch (err) {
      infoPanel.innerHTML = `<div class="world-map-info-empty">couldn't reach live data for ${country.name} right now</div>`;
    }
  }

  function renderInfo(info) {
    const weather = info.weather ? `${Math.round(info.weather.tempC)}&deg;C at the capital right now` : 'weather unavailable';
    infoPanel.innerHTML = `
      <div class="world-map-info-title">${info.flag ? info.flag + ' ' : ''}${info.name}</div>
      <div class="world-map-info-row"><span>Capital</span><span>${info.capital || '—'}</span></div>
      <div class="world-map-info-row"><span>Region</span><span>${info.subregion || info.region || '—'}</span></div>
      <div class="world-map-info-row"><span>Languages</span><span>${(info.languages || []).join(', ') || '—'}</span></div>
      <div class="world-map-info-row"><span>Currency</span><span>${(info.currencies || []).join(', ') || '—'}</span></div>
      <div class="world-map-info-row"><span>Live weather</span><span>${weather}</span></div>
    `;
  }

  function findCountryByName(name) {
    if (!name) return null;
    const n = name.trim().toLowerCase();
    return countries.find((c) => c.name.toLowerCase() === n) || countries.find((c) => c.name.toLowerCase().includes(n));
  }

  async function open(focusCountryName) {
    modal.classList.remove('hidden');
    if (!initialized) { initialized = true; initScene(); }
    startLoop();
    setTimeout(resize, 50);
    await loadCountries();
    const match = findCountryByName(focusCountryName);
    if (match) selectCountry(match);
    else infoPanel.innerHTML = '<div class="world-map-info-empty">click a country marker to read what WYRD knows about it</div>';
  }

  function close() {
    modal.classList.add('hidden');
    stopLoop();
  }

  if (closeBtn) closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  window.WorldMap = { open };
})();
