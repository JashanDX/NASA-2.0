'use strict';
/* ============================================================
   GLOBE — Three.js scene with Earth, Moon and Mars, plus Orbiting Satellite.
   Selected body is large and centered; other bodies orbit on tilted paths.
   Analog connections are curved 3D Bezier lines recomputed dynamically.
   ============================================================ */
const GLOBE = (() => {
  const D2R = Math.PI / 180;
  function ll2v(lat, lon, r) {
    const la = lat * D2R, lo = lon * D2R;
    return new THREE.Vector3(Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)).multiplyScalar(r || 1);
  }
  function v2ll(v) {
    const n = v.clone().normalize();
    return { lat: Math.asin(n.y) / D2R, lon: Math.atan2(-n.z, n.x) / D2R };
  }

  /* ----- 3D Value Noise Generator ----- */
  function mkNoise3() {
    const P = new Uint8Array(512);
    const base = Array.from({ length: 256 }, (_, i) => i);
    let s = 1234567;
    const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [base[i], base[j]] = [base[j], base[i]]; }
    for (let i = 0; i < 512; i++) P[i] = base[i & 255];
    const V = new Float32Array(256).map(() => rnd());
    const sm = t => t * t * (3 - 2 * t), h = (x, y, z) => V[P[P[P[x & 255] + (y & 255)] + (z & 255)]];
    const n3 = (x, y, z) => {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), u), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), u), v),
               l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), u), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), u), v), w);
    };
    return (x, y, z, oct) => {
      let a = 1, f = 1, s2 = 0, nn = 0;
      for (let i = 0; i < oct; i++) { s2 += a * n3(x * f, y * f, z * f); nn += a; a *= .5; f *= 2.1; }
      return s2 / nn;
    };
  }
  const noise = mkNoise3();
  const TW = 1024, TH = 512;

  function eachPixel(cb) {
    const cv = document.createElement('canvas');
    cv.width = TW; cv.height = TH;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(TW, TH);
    for (let y = 0; y < TH; y++) {
      const lat = 90 - (y + .5) / TH * 180, cl = Math.cos(lat * D2R), sl = Math.sin(lat * D2R);
      for (let x = 0; x < TW; x++) {
        const lon = -180 + (x + .5) / TW * 360, X = cl * Math.cos(lon * D2R), Z = -cl * Math.sin(lon * D2R);
        const c = cb(X, sl, Z, lat, lon, x, y);
        const i = (y * TW + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return { cv, ctx };
  }

  const px = (lon) => (lon + 180) / 360 * TW, py = (lat) => (90 - lat) / 180 * TH;

  function blobDeg(ctx, lon, lat, rDeg, col, a, squash) {
    const rx = rDeg / 360 * TW, ry = rDeg / 180 * TH * (squash || 1);
    ctx.save(); ctx.translate(px(lon), py(lat)); ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, col.replace('A', a)); g.addColorStop(1, col.replace('A', 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, 6.3); ctx.fill(); ctx.restore();
  }

  /* ----- Earth: Accurate Stylised Continents ----- */
  const LAND = {
    na: [[-168, 66], [-156, 71], [-130, 70], [-110, 68], [-95, 70], [-82, 69], [-85, 66], [-94, 60], [-90, 57], [-82, 55], [-78, 58], [-77, 62], [-70, 60], [-62, 58], [-56, 52], [-66, 45], [-70, 42], [-76, 36], [-81, 31], [-80, 26], [-83, 29], [-90, 30], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 16], [-83, 10], [-79, 8], [-84, 10], [-92, 14], [-105, 20], [-110, 24], [-114, 31], [-117, 32], [-121, 35], [-124, 40], [-124, 48], [-130, 54], [-140, 60], [-150, 60], [-158, 57], [-165, 54], [-160, 59], [-165, 62]],
    gl: [[-73, 78], [-60, 82], [-30, 83], [-20, 80], [-20, 72], [-30, 68], [-43, 60], [-52, 64], [-55, 70], [-68, 76]],
    sa: [[-78, 8], [-72, 12], [-62, 10], [-52, 5], [-50, 0], [-35, -5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-63, -41], [-65, -47], [-68, -52], [-70, -55], [-74, -52], [-75, -45], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-81, -5], [-80, 0], [-77, 4]],
    eu_asia: [[-9, 37], [-9, 43], [-2, 43.5], [-1, 46], [-4.5, 48.5], [2, 51], [5, 53], [8.5, 54], [8, 57], [10.5, 57.5], [12, 55], [14, 54.5], [20, 55], [21, 57], [24, 59], [28, 60], [22, 60], [21, 63], [25, 65], [21, 65.5], [17, 62], [19, 60], [16, 56], [12, 56], [11, 59], [5, 59], [5, 62], [14, 68], [20, 70], [30, 71], [40, 67], [44, 68], [60, 69], [70, 73], [80, 73], [100, 77], [113, 74], [130, 72], [142, 72], [160, 70], [180, 69], [180, 65], [170, 60], [163, 59], [156, 51], [143, 59], [135, 55], [141, 52], [140, 48], [135, 43], [130, 42], [129, 37], [126, 35], [126, 38], [121, 39], [122, 37], [119, 35], [122, 31], [121, 26], [117, 23], [110, 21], [108, 17], [106, 10], [105, 9], [100, 13], [100, 7], [104, 1.5], [98, 8], [98, 17], [94, 17], [92, 22], [87, 21], [80, 15], [77, 8], [73, 17], [72, 21], [67, 25], [62, 25], [57, 26], [50, 30], [48, 30], [50, 26], [52, 24], [56, 24], [59, 22], [52, 16], [43, 13], [39, 21], [35, 28], [34, 31], [36, 36], [27, 37], [26, 40], [23, 40], [24, 38], [22, 36.5], [21, 38], [19, 41], [14, 45], [12.5, 44.5], [16, 41], [18, 40], [16, 38], [15, 40.5], [12, 42], [10, 44], [7.5, 43.5], [3, 43], [0, 39], [-2, 37], [-5, 36]],
    af: [[-17, 21], [-16, 28], [-9, 31], [-6, 36], [10, 37], [11, 33], [20, 32], [32, 31], [34, 28], [43, 12], [51, 12], [48, 5], [41, -2], [40, -11], [35, -20], [32, -27], [27, -34], [20, -35], [18, -31], [12, -18], [13, -8], [9, -1], [9, 4], [-5, 5], [-13, 8], [-17, 14]],
    au: [[113, -22], [114, -26], [115, -34], [124, -34], [131, -31], [138, -35], [141, -38], [147, -38], [150, -37], [153, -30], [153, -25], [146, -19], [142, -11], [141, -17], [136, -12], [130, -12], [126, -14], [122, -18]],
    ant: [[-180, -90], [-180, -72], [-100, -74], [-60, -65], [-20, -72], [40, -68], [100, -66], [150, -68], [180, -72], [180, -90]]
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

  function earthTexture() {
    const m = document.createElement('canvas'); m.width = TW; m.height = TH;
    const mc = m.getContext('2d'); mc.fillStyle = '#000'; mc.fillRect(0, 0, TW, TH);
    mc.fillStyle = '#fff';
    Object.values(LAND).forEach(poly => {
      mc.beginPath();
      poly.forEach(([lo, la], i) => { i ? mc.lineTo(px(lo), py(la)) : mc.moveTo(px(lo), py(la)); });
      mc.closePath(); mc.fill();
    });
    const mask = mc.getImageData(0, 0, TW, TH).data;
    const t = eachPixel((X, Y, Z, lat, lon, x, y) => {
      const L = mask[(y * TW + x) * 4] / 255;
      const n1 = noise(X * 4, Y * 4, Z * 4, 5), n2 = noise(X * 9 + 5, Y * 9, Z * 9, 3);
      if (L < 0.5) {
        const d = 0.5 + 0.5 * n1;
        const polar = Math.abs(lat) > 76 ? Math.min(1, (Math.abs(lat) - 76) / 6) * (0.6 + 0.4 * n2) : 0;
        const c = [lerp(10, 24, d), lerp(45, 90, d), lerp(110, 185, d)];
        return mix(c, [230, 240, 250], polar);
      }
      const al = Math.abs(lat);
      let arid = Math.max(0, 1 - Math.abs(al - 24) / 14) * (0.55 + 0.7 * n1);
      arid = Math.min(1, arid + (n2 > .62 ? .15 : 0));
      let g = mix([40, 105, 55], [195, 160, 105], arid);
      const mt = n1 > .6 ? (n1 - .6) * 2 : 0;
      g = mix(g, [130, 120, 110], mt * .6);
      const snow = al > 66 ? Math.min(1, (al - 66) / 8) : 0;
      g = mix(g, [240, 245, 252], snow * (0.7 + 0.3 * n2));
      if (lat < -68) g = mix(g, [245, 248, 252], 0.95);
      const e = 0.92 + 0.22 * n2;
      return [g[0] * e, g[1] * e, g[2] * e];
    });
    return t.cv;
  }

  function marsTexture() {
    const t = eachPixel((X, Y, Z, lat) => {
      const n1 = noise(X * 3 + 20, Y * 3, Z * 3, 6), n2 = noise(X * 10, Y * 10 + 7, Z * 10, 4);
      const dark = Math.max(0, Math.min(1, (n1 - .5) * 3.2));
      let c = mix([215, 110, 60], [105, 52, 35], dark * .75);
      const e = .88 + .24 * n2;
      c = [c[0] * e, c[1] * e, c[2] * e];
      const cap = Math.abs(lat) > 82 - 3 * n2 ? 1 : 0;
      return cap ? [242, 242, 248] : c;
    });
    const ctx = t.ctx;
    blobDeg(ctx, 70, 9, 14, 'rgba(50,30,25,A)', .55, .8);
    blobDeg(ctx, -20, 35, 22, 'rgba(60,35,28,A)', .35, .6);
    blobDeg(ctx, 70, -42, 11, 'rgba(235,205,175,A)', .55, 1);
    ctx.strokeStyle = 'rgba(55,28,22,.85)'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(px(-100), py(-8)); ctx.bezierCurveTo(px(-85), py(-12), px(-65), py(-14), px(-45), py(-9)); ctx.stroke();
    return t.cv;
  }

  function moonTexture() {
    const t = eachPixel((X, Y, Z) => {
      const n1 = noise(X * 5 + 3, Y * 5, Z * 5, 6), n2 = noise(X * 22, Y * 22, Z * 22, 3);
      const g = 135 + 58 * (n1 - .5) * 1.6 + 20 * (n2 - .5);
      return [g, g, g * 1.02];
    });
    const ctx = t.ctx;
    const maria = [[-16, 32, 14, .55], [18, 28, 8, .55], [31, 8, 9, .6], [59, 17, 6, .6], [-57, 18, 22, .5], [-17, -21, 10, .5]];
    maria.forEach(([lo, la, r, a]) => blobDeg(ctx, lo, la, r, 'rgba(42,44,52,A)', a, 1));
    return t.cv;
  }

  /* ----- Satellite 3D Procedural Mesh (Matching Design Reference) ----- */
  function createSatellite() {
    const group = new THREE.Group();
    // Central bus
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xcca030, metalness: 0.85, roughness: 0.25, emissive: 0x332205
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.03), bodyMat);
    group.add(body);

    // Solar panels
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x114488, metalness: 0.6, roughness: 0.2, emissive: 0x051530
    });
    const leftPanel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.024, 0.003), panelMat);
    leftPanel.position.set(-0.072, 0, 0);
    const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.024, 0.003), panelMat);
    rightPanel.position.set(0.072, 0, 0);
    group.add(leftPanel);
    group.add(rightPanel);

    // Antenna dish
    const dishMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 });
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.002, 0.008, 16), dishMat);
    dish.position.set(0, 0.02, 0.01);
    dish.rotation.x = Math.PI / 4;
    group.add(dish);

    group.scale.setScalar(1.2);
    return group;
  }

  /* ----- Atmosphere Glow Mesh ----- */
  function atmosphere(color, scale) {
    return new THREE.Mesh(new THREE.SphereGeometry(scale, 48, 32), new THREE.ShaderMaterial({
      uniforms: { c: { value: new THREE.Color(color) } },
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      vertexShader: 'varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform vec3 c;varying vec3 vN;void main(){float i=pow(0.74-dot(vN,vec3(0,0,1.)),3.2);gl_FragColor=vec4(c,1.)*i;}'
    }));
  }

  /* ----- Scene State ----- */
  const S = {
    bodies: {}, main: 'earth', sel: null, links: [], cb: {}, hover: null,
    pan: false, satOrbitAngle: 0, userTouched: false
  };
  const ORBIT = [2.8, 3.55];
  const TILT = 0.22;

  function init(host, cb) {
    S.cb = cb || {}; S.host = host; S.userTouched = false;
    const W = host.clientWidth || 800, H = host.clientHeight || 500;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, W / H, 0.05, 200);
    camera.position.set(0, 1.1, 5.8);
    scene.add(camera);

    scene.add(new THREE.AmbientLight(0x9cb5dc, 0.65));
    const sun = new THREE.DirectionalLight(0xffffff, 1.45);
    sun.position.set(-4, 2.5, 3.5);
    camera.add(sun);
    sun.target.position.set(0, 0, 0);
    scene.add(sun.target);

    const OrbitControlsCtor = (typeof THREE.OrbitControls === 'function')
      ? THREE.OrbitControls
      : function OrbitControlsFallback(cameraObj, domElement) {
          this.object = cameraObj;
          this.domElement = domElement;
          this.enabled = true;
          this.target = new THREE.Vector3();
          this.minDistance = 1.4;
          this.maxDistance = 12;
          this.enableDamping = true;
          this.dampingFactor = 0.08;
          this.autoRotate = true;
          this.autoRotateSpeed = 0.45;
          this.screenSpacePanning = true;
          this.mouseButtons = { LEFT: 0, MIDDLE: 1, RIGHT: 2 };
          this.addEventListener = () => {};
          this.update = () => {
            if (!this.enabled || S.fly) return;
            if (this.autoRotate && !S.userTouched) {
              const offset = this.object.position.clone().sub(this.target);
              const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.autoRotateSpeed * 0.012);
              offset.applyQuaternion(rot);
              this.object.position.copy(this.target.clone().add(offset));
            }
            this.object.lookAt(this.target);
          };
        };

    const controls = new OrbitControlsCtor(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 1.4;
    controls.maxDistance = 12;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.45;
    controls.screenSpacePanning = true;
    controls.addEventListener('start', () => {
      S.userTouched = true;
      controls.autoRotate = false;
      S.cb.rotateState && S.cb.rotateState(false);
    });

    // Starfield
    const sg = new THREE.BufferGeometry();
    const sp = new Float32Array(1800 * 3);
    for (let i = 0; i < 1800; i++) {
      const v = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
      v.multiplyScalar(65 + Math.random() * 35);
      sp.set([v.x, v.y, v.z], i * 3);
    }
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    scene.add(new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xc8ddff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.85
    })));

    // Orbital track lines between planets
    ORBIT.forEach(r => {
      const pts = [];
      for (let i = 0; i <= 128; i++) {
        const a = i / 128 * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * Math.sin(TILT), Math.sin(a) * r));
      }
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: 0x38d8ff, transparent: true, opacity: 0.22 }));
      scene.add(l);
    });

    // Orbiting Satellite over main body
    S.satellite = createSatellite();
    scene.add(S.satellite);

    // Planetary Bodies
    const texFns = { earth: earthTexture, mars: marsTexture, moon: moonTexture };
    ['earth', 'moon', 'mars'].forEach((id, k) => {
      const tex = new THREE.CanvasTexture(texFns[id]());
      tex.anisotropy = 4;
      if (THREE.sRGBEncoding) tex.encoding = THREE.sRGBEncoding;

      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 96, 64),
        new THREE.MeshStandardMaterial({
          map: tex, roughness: 0.92, metalness: 0,
          bumpMap: id === 'earth' ? null : tex, bumpScale: id === 'earth' ? 0 : 0.4
        })
      );
      const group = new THREE.Group();
      group.add(mesh);
      mesh.userData = { body: id, kind: 'body' };

      if (id === 'earth') group.add(atmosphere(0x38a0ff, 1.15));
      if (id === 'mars') group.add(atmosphere(0xff8a50, 1.07));

      const markers = new THREE.Group();
      group.add(markers);
      scene.add(group);

      const b = { id, group, mesh, markers, pm: {}, angle: k * 2.1, radius: ORBIT[k % 2], speed: 0.05 + 0.02 * k };
      S.bodies[id] = b;

      REGIONS.filter(r => r.body === id).forEach(r => {
        const pos = ll2v(r.lat, r.lon, 1.015);
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(0.016, 14, 12),
          new THREE.MeshBasicMaterial({ color: 0x38d8ff })
        );
        m.position.copy(pos);
        m.userData = { kind: 'marker', region: r.id };

        const hit = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
        hit.position.copy(pos);
        hit.userData = { kind: 'marker', region: r.id };

        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.03, 0.036, 32),
          new THREE.MeshBasicMaterial({ color: 0x38d8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.0 })
        );
        ring.position.copy(pos);
        ring.lookAt(pos.clone().multiplyScalar(2));

        markers.add(m); markers.add(hit); markers.add(ring);
        b.pm[r.id] = { dot: m, hit, ring, pos };
      });
    });

    // Links group (Curved 3D analog trajectory lines)
    S.linkGroup = new THREE.Group();
    scene.add(S.linkGroup);

    // Custom scout ping marker
    S.custom = new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), new THREE.MeshBasicMaterial({ color: 0xffd166 }));
    S.custom.visible = false;
    scene.add(S.custom);

    S.scene = scene; S.camera = camera; S.renderer = renderer; S.controls = controls;

    // Raycasting & Interaction
    const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
    S.ray = ray;
    const dom = renderer.domElement;
    let down = null;

    const setM = e => {
      const r = dom.getBoundingClientRect();
      mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(mouse, camera);
    };

    dom.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });

    dom.addEventListener('pointermove', e => {
      setM(e);
      const hits = ray.intersectObjects(Object.values(S.bodies).map(b => b.mesh), false);
      if (hits.length) {
        const o = hits[0].object.userData.body, b = S.bodies[o];
        const local = b.group.worldToLocal(hits[0].point.clone());
        const ll = v2ll(local);
        S.hover = { body: o, lat: ll.lat, lon: ll.lon };
      } else {
        S.hover = null;
      }
      S.cb.hover && S.cb.hover(S.hover);
      const mh = ray.intersectObjects(allHits(), false);
      dom.style.cursor = mh.length ? 'pointer' : (hits.length ? 'crosshair' : 'grab');
    });

    dom.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
      down = null;
      setM(e);
      const mh = ray.intersectObjects(allHits(), false);
      if (mh.length) {
        S.cb.select && S.cb.select(mh[0].object.userData.region);
        return;
      }
      const hits = ray.intersectObjects(Object.values(S.bodies).map(b => b.mesh), false);
      if (hits.length) {
        const id = hits[0].object.userData.body;
        if (id !== S.main) {
          S.cb.body && S.cb.body(id);
          return;
        }
        const b = S.bodies[id], local = b.group.worldToLocal(hits[0].point.clone()), ll = v2ll(local);
        S.cb.pick && S.cb.pick(id, ll.lat, ll.lon);
      }
    });

    function allHits() {
      const out = [];
      Object.values(S.bodies).forEach(b => Object.values(b.pm).forEach(p => out.push(p.hit)));
      return out;
    }

    new ResizeObserver(() => resize()).observe(host);

    let last = performance.now();
    (function loop(t) {
      requestAnimationFrame(loop);
      if (S.paused) return;
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      frame(dt);
    })(last);

    setMain('earth', true);
    return S;
  }

  function resize() {
    if (!S.renderer) return;
    const w = S.host.clientWidth, h = S.host.clientHeight;
    if (!w || !h) return;
    S.renderer.setSize(w, h);
    S.camera.aspect = w / h;
    S.camera.updateProjectionMatrix();
  }

  function frame(dt) {
    const others = Object.values(S.bodies).filter(b => b.id !== S.main);
    Object.values(S.bodies).forEach(b => {
      let tp, ts;
      if (b.id === S.main) {
        tp = new THREE.Vector3(0, 0, 0);
        ts = 1;
      } else {
        const k = others.indexOf(b);
        b.angle += b.speed * dt;
        const r = ORBIT[k];
        tp = new THREE.Vector3(Math.cos(b.angle) * r, Math.sin(b.angle) * r * Math.sin(TILT), Math.sin(b.angle) * r);
        ts = 0.32;
      }
      const f = 1 - Math.pow(0.0015, dt);
      b.group.position.lerp(tp, f);
      const s = lerp(b.group.scale.x, ts, f);
      b.group.scale.setScalar(s);
    });

    // Orbiting Satellite Animation
    if (S.satellite) {
      S.satOrbitAngle += 0.35 * dt;
      const satR = 1.38;
      const satTilt = 0.45;
      const satX = Math.cos(S.satOrbitAngle) * satR;
      const satY = Math.sin(S.satOrbitAngle) * satR * Math.sin(satTilt);
      const satZ = Math.sin(S.satOrbitAngle) * satR * Math.cos(satTilt);
      S.satellite.position.set(satX, satY, satZ);
      S.satellite.lookAt(0, 0, 0);
    }

    // Pulse selected ring
    const t = performance.now() / 1000;
    Object.values(S.bodies).forEach(b => {
      Object.entries(b.pm).forEach(([id, p]) => {
        const on = id === S.sel;
        p.ring.material.opacity = on ? 0.65 + 0.35 * Math.sin(t * 4) : 0;
        const sc = on ? 1 + 0.35 * Math.sin(t * 4) : 1;
        p.ring.scale.setScalar(sc);
      });
    });

    // Links update
    S.links.forEach(l => {
      const bA = S.bodies[REG[l.from].body];
      const bB = S.bodies[REG[l.to].body];
      if (!bA || !bB || !bA.pm[l.from] || !bB.pm[l.to]) return;

      const a = bA.pm[l.from].dot.getWorldPosition(new THREE.Vector3());
      const c = bB.pm[l.to].dot.getWorldPosition(new THREE.Vector3());
      const mid = a.clone().add(c).multiplyScalar(0.5);
      mid.y += 0.45 + a.distanceTo(c) * 0.15;
      const pts = new THREE.QuadraticBezierCurve3(a, mid, c).getPoints(32);
      const arr = l.line.geometry.attributes.position.array;
      pts.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
      l.line.geometry.attributes.position.needsUpdate = true;
      l.line.material.opacity = 0.65 + 0.25 * Math.sin(t * 2.5 + l.phase);
    });

    // Smooth fly-to camera
    if (S.fly) {
      const f = S.fly;
      f.t += dt / 0.85;
      const e = Math.min(1, f.t), k = e * e * (3 - 2 * e);
      S.camera.position.copy(f.from.clone().lerp(f.to, k));
      S.camera.position.setLength(lerp(f.from.length(), f.to.length(), k));
      if (e >= 1) S.fly = null;
    }

    S.controls.update();
    S.renderer.render(S.scene, S.camera);
  }

  function setMain(id, instant) {
    S.main = id;
    if (instant) {
      Object.values(S.bodies).forEach(b => {
        const o = Object.values(S.bodies).filter(x => x.id !== S.main);
        if (b.id === id) {
          b.group.position.set(0, 0, 0);
          b.group.scale.setScalar(1);
        } else {
          const k = o.indexOf(b);
          b.group.position.set(Math.cos(b.angle) * ORBIT[k], 0, Math.sin(b.angle) * ORBIT[k]);
          b.group.scale.setScalar(0.32);
        }
      });
    }
    S.controls.target.set(0, 0, 0);
    S.camera && flyDir(S.camera.position.clone().normalize(), 5.6);
  }

  function flyDir(dir, dist) {
    S.fly = { t: 0, from: S.camera.position.clone(), to: dir.clone().normalize().multiplyScalar(dist) };
  }

  function select(regionId, fly) {
    S.sel = regionId;
    Object.values(S.bodies).forEach(b => {
      Object.entries(b.pm).forEach(([id, p]) => {
        p.dot.material.color.set(id === regionId ? 0xffd166 : 0x38d8ff);
      });
    });
    if (fly && regionId && REG[regionId]) {
      const r = REG[regionId];
      if (r.body !== S.main) setMain(r.body);
      const v = ll2v(r.lat, r.lon, 1);
      flyDir(v.clone().add(new THREE.Vector3(0, 0.12, 0)), 3.0);
      S.controls.autoRotate = false;
      S.cb.rotateState && S.cb.rotateState(false);
    }
  }

  function setLinks(list) {
    S.links.forEach(l => { S.linkGroup.remove(l.line); l.line.geometry.dispose(); });
    S.links = [];
    list.forEach((l, i) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(33 * 3), 3));
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color: l.color || 0x7cf0b5, transparent: true, opacity: 0.7 }));
      line.frustumCulled = false;
      S.linkGroup.add(line);
      S.links.push({ from: l.from, to: l.to, line, phase: i * 1.2 });
    });
  }

  function setCustom(bodyId, lat, lon) {
    if (!bodyId) { S.custom.visible = false; return; }
    const b = S.bodies[bodyId];
    b.group.add(S.custom);
    S.custom.position.copy(ll2v(lat, lon, 1.015));
    S.custom.visible = true;
  }

  function zoom(f) {
    const d = S.camera.position.length() * f;
    S.fly = { t: 0, from: S.camera.position.clone(), to: S.camera.position.clone().setLength(Math.max(1.5, Math.min(10, d))) };
  }

  function reset() {
    S.controls.target.set(0, 0, 0);
    flyDir(new THREE.Vector3(0, 0.15, 1), 5.6);
    S.controls.autoRotate = true;
    S.cb.rotateState && S.cb.rotateState(true);
  }

  function toggleRotate() {
    S.controls.autoRotate = !S.controls.autoRotate;
    return S.controls.autoRotate;
  }

  function togglePan() {
    S.pan = !S.pan;
    const T = THREE.MOUSE || { ROTATE: 0, DOLLY: 1, PAN: 2 };
    S.controls.mouseButtons = S.pan ?
      { LEFT: T.PAN, MIDDLE: T.DOLLY, RIGHT: T.ROTATE } :
      { LEFT: T.ROTATE, MIDDLE: T.DOLLY, RIGHT: T.PAN };
    return S.pan;
  }

  function pause(p) { S.paused = p; if (!p) resize(); }

  return { init, setMain, select, setLinks, setCustom, zoom, reset, toggleRotate, togglePan, pause, resize, S, ll2v };
})();
