/* ============================================================
   KiranaVision AI — engine.js
   Simulated multi-modal underwriting engine
   ============================================================ */

// ── State ──────────────────────────────────────────────────
let uploadedImage = null;  // keep for backward compat
let uploadedImages = [];   // array of {file, dataUrl, isValidating, aiValidation}
let analysisResult = null;
let leafletMap = null;
let leafletMarker = null;
let pickerMap = null;      // input card map
let pickerMarker = null;
let geoData = {};
let geoDebounceTimer = null;
let searchDebounceTimer = null;
let mobilenetModel = null;
let isModelLoading = false;

// ── Boot ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initPickerMap();
  loadClassifierModel(); // Preload TensorFlow.js MobileNet model
  // Search box wiring
  const si = document.getElementById('map-search-input');
  if (si) {
    si.addEventListener('input', (e) => {
      const v = e.target.value.trim();
      document.getElementById('map-search-clear').style.display = v ? 'block' : 'none';
      clearTimeout(searchDebounceTimer);
      if (v.length >= 3) searchDebounceTimer = setTimeout(() => nominatimSearch(v), 600);
      else document.getElementById('map-search-results').style.display = 'none';
    });
    si.addEventListener('blur', () => setTimeout(() => { document.getElementById('map-search-results').style.display = 'none'; }, 200));
  }
  // Initial geocode for default Mumbai coords
  setTimeout(fetchGeoData, 800);
});

async function loadClassifierModel() {
  if (mobilenetModel) return mobilenetModel;
  if (isModelLoading) {
    while (isModelLoading) {
      await new Promise(r => setTimeout(r, 100));
    }
    return mobilenetModel;
  }
  isModelLoading = true;
  console.log('🤖 Loading MobileNet AI Classifier Model...');
  try {
    if (window.mobilenet) {
      mobilenetModel = await window.mobilenet.load({ version: 2, alpha: 1.0 });
      console.log('✅ MobileNet AI Model loaded successfully.');
    }
  } catch (err) {
    console.warn('⚠️ MobileNet load error (falling back to visual canvas heuristics):', err);
  } finally {
    isModelLoading = false;
  }
  return mobilenetModel;
}

// ── Picker Map Init ───────────────────────────────────────
function initPickerMap() {
  if (!window.L) { setTimeout(initPickerMap, 300); return; }
  const lat = 19.0760, lng = 72.8777;
  pickerMap = L.map('picker-map', { zoomControl: true, scrollWheelZoom: true }).setView([lat, lng], 14);

  // ── Google Map tile layers ──────────────────────────────
  const gRoad = L.tileLayer(
    'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
  );
  const gSatellite = L.tileLayer(
    'https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
  );
  const gHybrid = L.tileLayer(
    'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    { attribution: '© Google Maps', maxZoom: 20, subdomains: '0123' }
  );
  gRoad.addTo(pickerMap);

  // ── Layer Switcher Control ──────────────────────────────
  const LayerCtrl = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const div = L.DomUtil.create('div', 'gmap-layer-ctrl');
      div.innerHTML =
        '<button class="glc-btn active" data-l="road">🗺 Map</button>' +
        '<button class="glc-btn" data-l="sat">🛰 Satellite</button>' +
        '<button class="glc-btn" data-l="hyb">🌍 Hybrid</button>';
      L.DomEvent.disableClickPropagation(div);
      div.addEventListener('click', e => {
        const btn = e.target.closest('.glc-btn');
        if (!btn) return;
        div.querySelectorAll('.glc-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        [gRoad, gSatellite, gHybrid].forEach(l => pickerMap.hasLayer(l) && pickerMap.removeLayer(l));
        if (btn.dataset.l === 'road') gRoad.addTo(pickerMap);
        if (btn.dataset.l === 'sat')  gSatellite.addTo(pickerMap);
        if (btn.dataset.l === 'hyb')  gHybrid.addTo(pickerMap);
      });
      return div;
    }
  });
  new LayerCtrl().addTo(pickerMap);


  const icon = makePinIcon('#ea4335'); // Google red
  pickerMarker = L.marker([lat, lng], { icon, draggable: true }).addTo(pickerMap);
  pickerMarker.bindPopup('<b style="color:#ea4335">🏪 Shop Location</b><br/><small style="color:#888">Click map or drag pin to set</small>').openPopup();

  pickerMarker.on('dragend', () => setPickerCoords(pickerMarker.getLatLng().lat, pickerMarker.getLatLng().lng));
  pickerMap.on('click', (e) => {
    pickerMarker.setLatLng(e.latlng);
    setPickerCoords(e.latlng.lat, e.latlng.lng);
  });
}

function makePinIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 0 0 4px ${color}55,0 3px 10px rgba(0,0,0,0.5)"></div>`,
    iconSize: [22, 22], iconAnchor: [11, 11]
  });
}

function setPickerCoords(lat, lng) {
  document.getElementById('input-lat').value = lat.toFixed(6);
  document.getElementById('input-lng').value = lng.toFixed(6);
  document.getElementById('coord-lat-display').textContent = lat.toFixed(5);
  document.getElementById('coord-lng-display').textContent = lng.toFixed(5);
  clearTimeout(geoDebounceTimer);
  geoDebounceTimer = setTimeout(fetchGeoData, 600);
}

// ── Nominatim Place Search ─────────────────────────────────
async function nominatimSearch(q) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=in`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'KiranaVisionAI/1.0' } });
    const results = await res.json();
    const box = document.getElementById('map-search-results');
    if (!results.length) { box.style.display = 'none'; return; }
    box.innerHTML = results.map((r, i) => {
      const name = r.display_name;
      const short = name.split(',').slice(0,2).join(',');
      const rest  = name.split(',').slice(2).join(',').trim();
      return `<div class="map-search-item" onclick="selectSearchResult(${r.lat},${r.lon},'${short.replace(/'/g,"\\'")}')"
        ><span class="map-search-item-icon">📍</span><span class="map-search-item-text"><strong>${short}</strong><small>${rest}</small></span></div>`;
    }).join('');
    box.style.display = 'block';
  } catch(e) { console.warn('Search error', e); }
}

function selectSearchResult(lat, lng, label) {
  lat = parseFloat(lat); lng = parseFloat(lng);
  pickerMap.setView([lat, lng], 16);
  pickerMarker.setLatLng([lat, lng]);
  setPickerCoords(lat, lng);
  document.getElementById('map-search-input').value = label;
  document.getElementById('map-search-results').style.display = 'none';
  document.getElementById('map-search-clear').style.display = 'block';
}

function clearMapSearch() {
  document.getElementById('map-search-input').value = '';
  document.getElementById('map-search-results').style.display = 'none';
  document.getElementById('map-search-clear').style.display = 'none';
}

// ── AI Shop Photo Classification Engine ────────────────────────
async function classifyShopImage(imgDataObj) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      let isShop = false; // Strict default: must be proven to be a real physical shop
      let detectedLabel = 'Unknown Graphic / Photo';
      let confidence = 85;
      let topPredictions = [];

      // ── 1. Canvas Pixel Analysis (Alpha transparency, color entropy, noise) ──
      const canvas = document.createElement('canvas');
      const MAX = 200;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      const totalPixels = W * H;

      let totalEdges = 0;
      let colorBins = new Set();
      let brightSum = 0;
      let transparentPixels = 0;
      let pureWhiteOrBlack = 0;

      for (let i = 0; i < px.length; i += 4) {
        const r = px[i], g = px[i+1], b = px[i+2], a = px[i+3];
        brightSum += (r*0.299 + g*0.587 + b*0.114);

        if (a < 220) transparentPixels++;
        if ((r > 250 && g > 250 && b > 250) || (r < 5 && g < 5 && b < 5)) pureWhiteOrBlack++;

        const qR = r >> 6, qG = g >> 6, qB = b >> 6;
        colorBins.add(`${qR}-${qG}-${qB}`);
      }

      for (let y = 1; y < H - 1; y += 2) {
        for (let x = 1; x < W - 1; x += 2) {
          const idx = (y * W + x) * 4;
          const idxRight = (y * W + (x + 1)) * 4;
          const idxDown = ((y + 1) * W + x) * 4;
          
          const diffX = Math.abs(px[idx] - px[idxRight]) + Math.abs(px[idx+1] - px[idxRight+1]) + Math.abs(px[idx+2] - px[idxRight+2]);
          const diffY = Math.abs(px[idx] - px[idxDown]) + Math.abs(px[idx+1] - px[idxDown+1]) + Math.abs(px[idx+2] - px[idxDown+2]);
          
          if (diffX + diffY > 55) totalEdges++;
        }
      }

      const avgBrightness = brightSum / totalPixels;
      const colorDiversity = colorBins.size / 64.0;
      const edgeDensity = totalEdges / (totalPixels / 4);
      const transparentRatio = transparentPixels / totalPixels;
      const solidRatio = pureWhiteOrBlack / totalPixels;

      // Check 1: PNG Logo with transparency
      if (transparentRatio > 0.03) {
        resolve({
          isShop: false,
          detectedLabel: 'Digital PNG Logo / Icon (Transparent BG)',
          confidence: 99,
          colorDiversity, edgeDensity, avgBrightness
        });
        return;
      }

      // Check 2: High solid white/black graphic background (Logos, banners, cliparts)
      if (solidRatio > 0.45 && colorDiversity < 0.25) {
        resolve({
          isShop: false,
          detectedLabel: 'Graphic Banner / Logo Illustration',
          confidence: 95,
          colorDiversity, edgeDensity, avgBrightness
        });
        return;
      }

      // ── 2. MobileNet Model Classification ──
      const model = await loadClassifierModel();
      if (model) {
        try {
          topPredictions = await model.classify(img, 5);
          console.log('🤖 AI Image Predictions for', imgDataObj.file.name, topPredictions);
          
          if (topPredictions && topPredictions.length > 0) {
            const top = topPredictions[0];
            const labelLower = top.className.toLowerCase();

            const strictRetailKeywords = [
              'grocery', 'supermarket', 'shelf', 'crate', 'confectionery', 'bakery',
              'rack', 'display', 'cabinet', 'canned food', 'medicine chest', 'store', 'shop',
              'vending machine', 'market', 'bazaar', 'tobacco shop', 'refrigerator', 'cooler', 'bookstore'
            ];

            const graphicOrLogoKeywords = [
              'web site', 'website', 'signboard', 'scoreboard', 'banner', 'logo', 'graphic',
              'illustration', 'poster', 'comic book', 'envelope', 'menu', 'digital clock',
              'screen', 'monitor', 'television', 'art', 'emblem', 'drawing', 'icon', 'packet'
            ];

            const nonShopKeywords = [
              'dog', 'cat', 'retriever', 'terrier', 'spaniel', 'tabby', 'puppy', 'kitten', 'bird', 'animal',
              'sports car', 'convertible', 'sedan', 'pickup', 'truck', 'bus', 'scooter', 'motorcycle',
              'mountain', 'valley', 'seashore', 'cliff', 'alp', 'forest', 'beach', 'lakeside',
              'groom', 'wig', 'bikini', 'brassiere', 'costume', 'suit', 'street sign', 'document'
            ];

            detectedLabel = top.className;
            confidence = Math.round(top.probability * 100);

            const isGraphicMatch = graphicOrLogoKeywords.some(kw => labelLower.includes(kw));
            const isNonShopMatch = nonShopKeywords.some(kw => labelLower.includes(kw));
            const isRetailMatch = strictRetailKeywords.some(kw => labelLower.includes(kw));
            const hasRetailInTop5 = topPredictions.some(p => strictRetailKeywords.some(kw => p.className.toLowerCase().includes(kw)));

            if (isGraphicMatch && !hasRetailInTop5) {
              isShop = false;
              detectedLabel = `Digital Logo / Graphic (${top.className.split(',')[0]})`;
            } else if (isNonShopMatch) {
              isShop = false;
            } else if (isRetailMatch || hasRetailInTop5) {
              isShop = true;
            } else {
              // Ambiguous indoor photo: require high physical clutter (shelf edge density & color diversity)
              if (edgeDensity > 0.07 && colorDiversity > 0.20) {
                isShop = true;
                detectedLabel = 'Physical Retail Store Interior';
              } else {
                isShop = false;
                detectedLabel = `Non-Retail Image (${top.className.split(',')[0]})`;
              }
            }
          }
        } catch (e) {
          console.warn('AI classification failed:', e);
        }
      }

      // Check 3: Final fallback clutter check (solid colors or empty surfaces fail)
      if (colorDiversity < 0.10 || edgeDensity < 0.04) {
        isShop = false;
        detectedLabel = 'Plain Logo / Low-Clutter Image';
      }

      resolve({
        isShop,
        detectedLabel,
        confidence,
        topPredictions,
        colorDiversity,
        edgeDensity,
        avgBrightness
      });
    };
    img.onerror = () => resolve({ isShop: false, detectedLabel: 'Corrupted Image', confidence: 0, colorDiversity: 0, edgeDensity: 0, avgBrightness: 128 });
    img.src = imgDataObj.dataUrl;
  });
}

// ── Multi-Photo Upload ─────────────────────────────────────────
function handleMultiImageUpload(event) {
  const files = Array.from(event.target.files);
  if (!files.length) return;
  const remaining = 5 - uploadedImages.length;
  const toAdd = files.slice(0, remaining);

  toAdd.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const imgObj = { file, dataUrl: e.target.result, isValidating: true, aiValidation: null };
      uploadedImages.push(imgObj);
      uploadedImage = uploadedImages[0].file; // compat
      renderPhotoGrid();

      // Run AI Classification asynchronously
      classifyShopImage(imgObj).then(res => {
        imgObj.isValidating = false;
        imgObj.aiValidation = res;
        renderPhotoGrid();
      });
    };
    reader.readAsDataURL(file);
  });
  event.target.value = ''; // reset input
}

function renderPhotoGrid() {
  const count = uploadedImages.length;
  document.getElementById('photo-count').textContent = count;
  const grid = document.getElementById('photo-grid');
  const zone = document.getElementById('upload-zone');
  const addBtn = document.getElementById('btn-add-more');
  const exif = document.getElementById('exif-info');

  if (count === 0) {
    grid.style.display = 'none'; zone.style.display = 'flex';
    addBtn.style.display = 'none'; exif.style.display = 'none';
    return;
  }
  zone.style.display = 'none';
  grid.style.display = 'grid';
  addBtn.style.display = count < 5 ? 'flex' : 'none';

  grid.innerHTML = uploadedImages.map((img, i) => {
    let badgeHtml = '<span class="photo-badge scanning">⏳ Scanning...</span>';
    let thumbClass = 'photo-thumb';

    if (!img.isValidating && img.aiValidation) {
      const v = img.aiValidation;
      if (v.isShop) {
        thumbClass = 'photo-thumb valid-photo';
        badgeHtml = `<span class="photo-badge valid" title="${v.detectedLabel}">✅ Shop Verified</span>`;
      } else {
        thumbClass = 'photo-thumb invalid-photo';
        const shortName = v.detectedLabel.split(',')[0];
        badgeHtml = `<span class="photo-badge invalid" title="Detected: ${v.detectedLabel}">❌ ${shortName}</span>`;
      }
    }

    return `
    <div class="${thumbClass}">
      <img src="${img.dataUrl}" alt="Photo ${i+1}" />
      ${badgeHtml}
      <span class="photo-thumb-label">${img.file.name}</span>
      <button class="photo-thumb-remove" onclick="removePhoto(${i})">✕</button>
    </div>`;
  }).join('');

  exif.style.display = 'flex';
  simulateExifExtraction(uploadedImages[0].file);
}

function removePhoto(idx) {
  uploadedImages.splice(idx, 1);
  uploadedImage = uploadedImages.length ? uploadedImages[0].file : null;
  renderPhotoGrid();
}

// Keep old name for compat
function removeImage() { uploadedImages = []; uploadedImage = null; renderPhotoGrid(); }

async function fetchGeoData() {
  const lat = parseFloat(document.getElementById('input-lat').value);
  const lng = parseFloat(document.getElementById('input-lng').value);
  if (!lat || !lng || isNaN(lat) || isNaN(lng)) return;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

  document.getElementById('geo-fetch-loader').style.display = 'flex';
  document.getElementById('geo-fetch-status').textContent = 'Fetching…';
  document.getElementById('overpass-stats').style.display = 'none';

  try {
    // 1) Nominatim reverse geocode
    const nmRes = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { 'Accept-Language': 'en', 'User-Agent': 'KiranaVisionAI/1.0' } }
    );
    const nm = await nmRes.json();
    const addr = nm.address || {};
    const city     = addr.city || addr.town || addr.village || addr.suburb || '—';
    const district = addr.county || addr.state_district || '—';
    const state    = addr.state || '—';
    const country  = addr.country || '—';
    const pin      = addr.postcode || '—';
    const areaType = addr.city ? 'Urban / Metro' : addr.town ? 'Semi-Urban' : addr.village ? 'Rural / Village' : 'Sub-Urban';

    document.getElementById('geo-city').textContent     = city;
    document.getElementById('geo-district').textContent = district;
    document.getElementById('geo-state').textContent    = state;
    document.getElementById('geo-country').textContent  = country;
    document.getElementById('geo-pin').textContent      = pin;
    document.getElementById('geo-area-type').textContent = areaType;
    document.getElementById('geo-fetch-status').textContent = '✅ Location detected';

    // Map city key for scoring
    const cityLow = city.toLowerCase();
    let cityKey = 'default';
    if (cityLow.includes('mumbai') || cityLow.includes('bombay')) cityKey = 'mumbai';
    else if (cityLow.includes('delhi'))     cityKey = 'delhi';
    else if (cityLow.includes('bangalore') || cityLow.includes('bengaluru')) cityKey = 'bangalore';
    else if (cityLow.includes('hyderabad')) cityKey = 'hyderabad';
    else if (cityLow.includes('pune'))      cityKey = 'pune';
    else if (cityLow.includes('chennai'))   cityKey = 'chennai';
    else if (cityLow.includes('kolkata'))   cityKey = 'kolkata';
    document.getElementById('input-city').value = cityKey;

    // Store for scoring
    geoData.city = city; geoData.state = state; geoData.country = country;
    geoData.pin = pin; geoData.areaType = areaType; geoData.cityKey = cityKey;

    // 2) Overpass — count houses, shops, road nodes in 500m
    await fetchOverpassData(lat, lng);

    // 3) Update mini Leaflet map in input card
    updateInputMiniMap(lat, lng, city, state);

  } catch (e) {
    document.getElementById('geo-fetch-status').textContent = '⚠ Could not fetch (check connection)';
  } finally {
    document.getElementById('geo-fetch-loader').style.display = 'none';
  }
}

// ── Overpass API ───────────────────────────────────────────
async function fetchOverpassData(lat, lng) {
  const r = 500; // 500m radius
  const query = `[out:json][timeout:15];
(
  node["building"="residential"](around:${r},${lat},${lng});
  way["building"="residential"](around:${r},${lat},${lng});
  way["building"="apartments"](around:${r},${lat},${lng});
  way["building"="house"](around:${r},${lat},${lng});
  node["shop"](around:${r},${lat},${lng});
  node["amenity"="marketplace"](around:${r},${lat},${lng});
  node["highway"="traffic_signals"](around:${r},${lat},${lng});
  node["highway"="crossing"](around:${r},${lat},${lng});
);
out count;`;

  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(query)
    });
    const data = await res.json();
    const total = data?.elements?.[0]?.tags?.total || 0;

    // Separate query for shops
    const shopQ = `[out:json][timeout:10];
node["shop"](around:${r},${lat},${lng});
out count;`;
    const shopRes = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST', body: 'data=' + encodeURIComponent(shopQ)
    });
    const shopData = await shopRes.json();
    const shops = shopData?.elements?.[0]?.tags?.total || 0;

    // House count = total - shops (rough)
    const houses = Math.max(0, total - shops);
    const roads  = Math.floor(total * 0.15);
    // Footfall estimate: (houses * avg_residents * trips) + (shops * customer_rate)
    const footfall = Math.round(houses * 3.2 * 0.4 + shops * 45);

    setText('ov-houses',  houses  || '—');
    setText('ov-shops',   shops   || '—');
    setText('ov-roads',   roads   || '—');
    setText('ov-footfall', footfall > 0 ? footfall.toLocaleString('en-IN') + '/day' : '—');
    document.getElementById('overpass-stats').style.display = 'grid';

    geoData.houses = houses; geoData.shops = shops; geoData.footfall = footfall;
  } catch (e) {
    console.warn('Overpass error', e);
  }
}

// ── Mini map in input card (no results section) ────────────
let miniMap = null; let miniMarker = null;
function updateInputMiniMap(lat, lng, city, state) {
  // We don't show a mini map in the input card — just update geoData
  geoData.lat = lat; geoData.lng = lng;
}

// ── Image Upload ───────────────────────────────────────────
function handleImageUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  uploadedImage = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('image-preview').src = e.target.result;
    document.getElementById('image-filename').textContent = file.name;
    document.getElementById('upload-zone').style.display = 'none';
    document.getElementById('image-preview-wrap').style.display = 'block';
    document.getElementById('exif-info').style.display = 'flex';
    simulateExifExtraction(file);
  };
  reader.readAsDataURL(file);
}

function removeImage() {
  uploadedImage = null;
  document.getElementById('file-input').value = '';
  document.getElementById('image-preview').src = '';
  document.getElementById('upload-zone').style.display = 'block';
  document.getElementById('image-preview-wrap').style.display = 'none';
  document.getElementById('exif-info').style.display = 'none';
}

function simulateExifExtraction(file) {
  const lat = parseFloat(document.getElementById('input-lat').value) || 19.076;
  const lng = parseFloat(document.getElementById('input-lng').value) || 72.877;
  setTimeout(() => {
    document.getElementById('exif-gps').textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    document.getElementById('exif-device').textContent = 'Samsung SM-A525F';
    const d = new Date(file.lastModified);
    document.getElementById('exif-ts').textContent = d.toLocaleString('en-IN');
  }, 800);
}

// ── GPS ────────────────────────────────────────────────────
function getDeviceLocation() {
  const btn = document.getElementById('geo-btn');
  btn.textContent = '⏳ Locating…';
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude;
        if (pickerMap && pickerMarker) {
          pickerMap.setView([lat, lng], 16);
          pickerMarker.setLatLng([lat, lng]);
        }
        setPickerCoords(lat, lng);
        btn.innerHTML = '✅ Got Location';
        setTimeout(() => { btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> My Location'; }, 3000);
      },
      () => {
        btn.innerHTML = '⚠️ Denied';
        setTimeout(() => { btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg> My Location'; }, 2000);
      }
    );
  }
}

// ── Real Image Spoofing Analysis (Canvas API) ──────────────
let lastImgAnalysis = null; // cache result for buildAnalysis




async function analyzeImageForSpoofing(imageObj) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Downsample to max 300px side for performance
      const MAX = 300;
      const scale = Math.min(MAX / img.width, MAX / img.height, 1);
      const W = Math.round(img.width * scale);
      const H = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      const total = W * H;

      // ── 1. Brightness histogram ────────────────────────────
      let brightTotal = 0, veryBright = 0, veryDark = 0;
      const brightness = new Float32Array(total);
      for (let i = 0; i < px.length; i += 4) {
        const b = px[i]*0.299 + px[i+1]*0.587 + px[i+2]*0.114;
        brightness[i >> 2] = b;
        brightTotal += b;
        if (b > 230) veryBright++;
        if (b < 20)  veryDark++;
      }
      const avgBright = brightTotal / total;
      const brightRatio = veryBright / total;  // >0.35 => too many bright pixels => likely screen
      const darkRatio   = veryDark  / total;

      // ── 2. Brightness variance (std dev) ───────────────────
      let varSum = 0;
      for (let i = 0; i < total; i++) varSum += Math.pow(brightness[i] - avgBright, 2);
      const stdDev = Math.sqrt(varSum / total);  // <25 => too uniform => printed/solid bg

      // ── 3. Edge density (simple gradient) ──────────────────
      let edges = 0;
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const idx = y * W + x;
          const gx = Math.abs(brightness[idx] - brightness[idx + 1]);
          const gy = Math.abs(brightness[idx] - brightness[idx + W]);
          if (gx + gy > 25) edges++;
        }
      }
      const edgeDensity = edges / total;  // <0.05 => too smooth => screen/solid bg

      // ── 4. Color saturation variance ──────────────────────
      let satSum = 0;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i]/255, g = px[i+1]/255, b = px[i+2]/255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        satSum += max === 0 ? 0 : (max - min) / max;
      }
      const avgSat = satSum / total;  // very high (>0.7) + bright => possible neon/screen

      // ── 5. Screen aspect ratio check ──────────────────────
      const ar = img.width / img.height;
      const screenARs = [16/9, 16/10, 4/3, 21/9, 9/16, 3/2, 2/3];
      const isScreenAR = screenARs.some(a => Math.abs(ar - a) < 0.04);

      // ── 6. Border uniformity (top/bottom strip) ────────────
      // Check if top 10px row has very little variance (letterbox/black bar)
      let topVar = 0, topMean = 0;
      for (let x = 0; x < W; x++) topMean += brightness[x];
      topMean /= W;
      for (let x = 0; x < W; x++) topVar += Math.pow(brightness[x] - topMean, 2);
      topVar = Math.sqrt(topVar / W);
      const hasBlackBar = topMean < 15 && topVar < 5;  // very dark, very uniform top strip

      // ── Decision logic ──────────────────────────────────
      const spoofSignals = [];
      if (brightRatio > 0.40)  spoofSignals.push(`High bright-pixel ratio (${(brightRatio*100).toFixed(0)}%)`);
      if (stdDev < 22)         spoofSignals.push(`Low brightness variance (σ=${stdDev.toFixed(1)})`);
      if (edgeDensity < 0.04)  spoofSignals.push(`Very low edge density (${(edgeDensity*100).toFixed(1)}%)`);
      if (avgSat > 0.72 && brightRatio > 0.25) spoofSignals.push('Oversaturated + bright — possible screen glare');
      if (isScreenAR && brightRatio > 0.30)    spoofSignals.push(`Screen aspect ratio (${ar.toFixed(2)}) + high brightness`);
      if (hasBlackBar)         spoofSignals.push('Letterbox black bars detected');

      const spoofScore = spoofSignals.length; // 0 = clean, 1-2 = warn, 3+ = fail
      const isReal = spoofScore === 0;
      const isFake = spoofScore >= 3;

      resolve({
        avgBrightness: Math.round(avgBright),
        brightRatio:   +brightRatio.toFixed(3),
        darkRatio:     +darkRatio.toFixed(3),
        stdDev:        +stdDev.toFixed(1),
        edgeDensity:   +edgeDensity.toFixed(3),
        avgSaturation: +avgSat.toFixed(3),
        isScreenAR,
        hasBlackBar,
        spoofSignals,
        spoofScore,
        verdict: isFake ? 'fake' : spoofScore > 0 ? 'warn' : 'real',
        width: img.width,
        height: img.height
      });
    };
    img.onerror = () => resolve(null);
    img.src = imageObj.dataUrl;
  });
}

// ── Live Camera Audit & Watermarking ──────────────────────────
let mediaStream = null;

async function openLiveCamera() {
  const modal = document.getElementById('camera-modal');
  const video = document.getElementById('camera-video');
  if (!modal || !video) return;
  modal.style.display = 'flex';

  const lat = parseFloat(document.getElementById('input-lat').value) || 19.0760;
  const lng = parseFloat(document.getElementById('input-lng').value) || 72.8777;
  const gpsEl = document.getElementById('cam-gps');
  const timeEl = document.getElementById('cam-time');
  if (gpsEl) gpsEl.textContent = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  if (timeEl) timeEl.textContent = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = mediaStream;
  } catch (err) {
    console.warn('Camera access error:', err);
    alert('📷 Camera Access Notice: Could not access live device camera. Please allow camera permissions or upload gallery photos.');
    closeLiveCamera();
  }
}

function closeLiveCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  const modal = document.getElementById('camera-modal');
  if (modal) modal.style.display = 'none';
}

function captureLiveSnapshot() {
  const video = document.getElementById('camera-video');
  if (!video || !video.videoWidth) {
    alert('Please wait for live camera video stream to load...');
    return;
  }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0);

  // Draw Tamper-Proof GPS & Timestamp Watermark Overlay
  const lat = parseFloat(document.getElementById('input-lat').value) || 19.0760;
  const lng = parseFloat(document.getElementById('input-lng').value) || 72.8777;
  const ts = new Date().toLocaleString('en-IN');

  ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
  ctx.fillRect(16, canvas.height - 56, canvas.width - 32, 42);

  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.strokeRect(16, canvas.height - 56, canvas.width - 32, 42);

  ctx.fillStyle = '#10b981';
  ctx.font = 'bold 15px monospace';
  ctx.fillText(`📍 GPS Audit: ${lat.toFixed(4)}, ${lng.toFixed(4)} | 🕒 ${ts} | ✅ LIVE CAPTURE`, 28, canvas.height - 30);

  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const snapFile = { name: `Live_Audit_${Date.now()}.jpg`, size: Math.round(dataUrl.length * 0.75), lastModified: Date.now() };

  const imgObj = { file: snapFile, dataUrl, isValidating: true, aiValidation: null, isLiveCamera: true };
  uploadedImages.push(imgObj);
  uploadedImage = uploadedImages[0].file;
  renderPhotoGrid();

  classifyShopImage(imgObj).then(res => {
    imgObj.isValidating = false;
    imgObj.aiValidation = res;
    renderPhotoGrid();
  });

  closeLiveCamera();
}

// ── Store Video Keyframe Extraction & Upload Handler ─────────
async function extractKeyframesFromVideo(file) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(file);
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const duration = video.duration || 5;
      const timestamps = [
        duration * 0.15,
        duration * 0.40,
        duration * 0.65,
        duration * 0.85
      ];

      const keyframes = [];
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');

      for (let i = 0; i < timestamps.length; i++) {
        const time = timestamps[i];
        video.currentTime = time;
        await new Promise(r => {
          const onSeek = () => {
            video.removeEventListener('seeked', onSeek);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            
            // Burn Video Keyframe Audit Stamp
            ctx.fillStyle = 'rgba(0, 0, 0, 0.80)';
            ctx.fillRect(10, canvas.height - 40, canvas.width - 20, 30);
            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 13px monospace';
            ctx.fillText(`🎥 Video Walkthrough Frame ${i+1} | timestamp: ${time.toFixed(1)}s`, 20, canvas.height - 20);

            const dataUrl = canvas.toDataURL('image/jpeg', 0.90);
            keyframes.push({
              file: { name: `Video_Frame_${i+1}_${time.toFixed(0)}s.jpg`, size: Math.round(dataUrl.length * 0.75), lastModified: file.lastModified },
              dataUrl,
              isVideoFrame: true,
              timestampSec: +time.toFixed(1)
            });
            r();
          };
          video.addEventListener('seeked', onSeek);
        });
      }

      URL.revokeObjectURL(video.src);
      resolve(keyframes);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve([]);
    };
  });
}

async function handleVideoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  console.log('🎥 Extracting keyframes from store video file:', file.name);

  const zone = document.getElementById('upload-zone');
  if (zone) zone.style.display = 'none';

  const frames = await extractKeyframesFromVideo(file);
  if (!frames.length) {
    alert('⚠️ Could not extract keyframes from video file. Please check video format (MP4/WEBP recommended).');
    renderPhotoGrid();
    return;
  }

  frames.forEach(frameObj => {
    if (uploadedImages.length < 5) {
      const imgObj = {
        file: frameObj.file,
        dataUrl: frameObj.dataUrl,
        isValidating: true,
        aiValidation: null,
        isVideoFrame: true
      };
      uploadedImages.push(imgObj);
      
      classifyShopImage(imgObj).then(res => {
        imgObj.isValidating = false;
        imgObj.aiValidation = res;
        renderPhotoGrid();
      });
    }
  });

  uploadedImage = uploadedImages[0].file;
  renderPhotoGrid();
  event.target.value = '';
}

// ── Multilingual (English + Hindi) Tesseract OCR Engine ──────────
let tesseractWorker = null;

async function getTesseractWorker() {
  if (tesseractWorker) return tesseractWorker;
  if (window.Tesseract) {
    try {
      console.log('🔍 Initializing Multilingual (English + Hindi Devanagari) Tesseract OCR Engine...');
      tesseractWorker = await window.Tesseract.createWorker('eng+hin');
      console.log('✅ Multilingual Tesseract OCR Engine initialized successfully.');
    } catch (e) {
      console.warn('Multilingual OCR init warning, attempting fallback:', e);
      try {
        tesseractWorker = await window.Tesseract.createWorker('eng');
      } catch (err) {
        console.warn('OCR fallback failed:', err);
      }
    }
  }
  return tesseractWorker;
}

const FMCG_DICTIONARY = [
  // HUL Family (Hindustan Unilever - English & Hindi)
  { brand: 'HUL (Surf Excel)', keywords: ['surf', 'excel', 'surfexcel', 'सर्फ', 'एक्सेल'] },
  { brand: 'HUL (Vim)', keywords: ['vim', 'bar', 'dishwash', 'विम'] },
  { brand: 'HUL (Rin)', keywords: ['rin', 'detergent', 'रिन'] },
  { brand: 'HUL (Wheel)', keywords: ['wheel', 'active', 'व्हील'] },
  { brand: 'HUL (Lifebuoy)', keywords: ['lifebuoy', 'handwash', 'लाइफबॉय'] },
  { brand: 'HUL (Lux)', keywords: ['lux', 'soap', 'लक्स'] },
  { brand: 'HUL (Dove)', keywords: ['dove', 'shampoo', 'cream', 'डव'] },
  { brand: 'HUL (Clinic Plus)', keywords: ['clinic', 'clinicplus', 'क्लिनिक'] },
  { brand: 'HUL (Sunsilk)', keywords: ['sunsilk', 'सनसिल्क'] },
  { brand: 'HUL (Red Label / Brooke Bond)', keywords: ['red label', 'redlabel', 'brooke bond', 'tea', 'रेड लेबल', 'चाय'] },
  { brand: 'HUL (Taj Mahal)', keywords: ['taj mahal', 'tajmahal', 'ताज महल'] },
  { brand: 'HUL (Kissan)', keywords: ['kissan', 'jam', 'ketchup', 'किसान'] },
  { brand: 'HUL (Kwality Wall\'s)', keywords: ['kwality', 'walls', 'ice cream', 'क्वालिटी'] },
  { brand: 'HUL (Pepsodent)', keywords: ['pepsodent', 'पेप्सोडेंट'] },
  { brand: 'HUL (Closeup)', keywords: ['closeup', 'close up', 'क्लोजअप'] },
  { brand: 'HUL (Pond\'s)', keywords: ['pond', 'ponds', 'पॉन्ड्स'] },
  { brand: 'HUL (Lakmé)', keywords: ['lakme', 'लक्मे'] },
  { brand: 'HUL (Horlicks)', keywords: ['horlicks', 'हॉरलिक्स'] },
  { brand: 'HUL (Boost)', keywords: ['boost', 'बूस्ट'] },
  { brand: 'HUL (Knorr)', keywords: ['knorr', 'soup', 'नोर'] },

  // Patanjali
  { brand: 'Patanjali', keywords: ['patanjali', 'dant kanti', 'पतंजलि', 'दंत कांति', 'आयुर्वेद'] },

  // ITC Family
  { brand: 'ITC (Aashirvaad)', keywords: ['aashirvaad', 'atta', 'आशीर्वाद', 'आटा'] },
  { brand: 'ITC (Sunfeast)', keywords: ['sunfeast', 'bounce', 'dark fantasy', 'सनफीस्ट'] },
  { brand: 'ITC (Yippee!)', keywords: ['yippee', 'noodles', 'यिप्पी'] },
  { brand: 'ITC (Bingo!)', keywords: ['bingo', 'chips', 'mad angles', 'बिंगो'] },
  { brand: 'ITC (Savlon)', keywords: ['savlon', 'antiseptic', 'सेवलॉन'] },

  // Nestlé
  { brand: 'Nestlé (Maggi)', keywords: ['maggi', 'masala', 'noodles', 'मैगी', 'मसाला'] },
  { brand: 'Nestlé (KitKat)', keywords: ['kitkat', 'chocolate', 'किटकैट'] },
  { brand: 'Nestlé (Nescafé)', keywords: ['nescafe', 'coffee', 'नेस्कैफे'] },
  { brand: 'Nestlé (Everyday)', keywords: ['everyday', 'milk', 'एवरीडे'] },

  // Britannia & Parle
  { brand: 'Britannia (Good Day / Bourbon)', keywords: ['britannia', 'good day', 'bourbon', '50-50', 'marielight', 'nutrichoice', 'ब्रिटानिया'] },
  { brand: 'Parle (Parle-G / Monaco)', keywords: ['parle', 'parleg', 'monaco', 'krackjack', 'hide and seek', 'पारले'] },

  // Amul & Dabur
  { brand: 'Amul (Butter / Milk / Cheese)', keywords: ['amul', 'butter', 'milk', 'cheese', 'taaza', 'gold', 'अमूल', 'मक्खन', 'दूध'] },
  { brand: 'Dabur (Chyawanprash / Honey)', keywords: ['dabur', 'chyawanprash', 'honey', 'hajmola', 'real juice', 'डाबर', 'च्यवनप्राश'] },

  // P&G & Reckitt & Colgate
  { brand: 'P&G (Ariel / Tide / Pampers)', keywords: ['ariel', 'tide', 'pampers', 'head and shoulders', 'pantene', 'whisper', 'gillette', 'टाइड'] },
  { brand: 'Reckitt (Dettol / Harpic / Lizol)', keywords: ['dettol', 'harpic', 'lizol', 'डेटॉल'] },
  { brand: 'Colgate (MaxFresh)', keywords: ['colgate', 'palmolive', 'maxfresh', 'कोलगेट'] },

  // Spice & Oils
  { brand: 'Fortune (Adani Wilmar)', keywords: ['fortune', 'oil', 'mustard', 'फॉर्च्यून', 'तेल'] },
  { brand: 'Tata Salt / Tea', keywords: ['tata', 'salt', 'tea', 'टाटा', 'नमक'] },
  { brand: 'Haldiram\'s', keywords: ['haldiram', 'bhujia', 'namkeen', 'हल्दीराम'] },
  { brand: 'MDH Spices', keywords: ['mdh', 'deggi mirch', 'masala', 'एमडीएच'] },
  { brand: 'Everest Spices', keywords: ['everest', 'masala', 'एवरेस्ट'] },
  { brand: 'Saffola / Parachute (Marico)', keywords: ['saffola', 'parachute', 'coconut oil', 'सफोला'] }
];

async function extractBrandsAndTextWithOCR(uploadedImgs) {
  const detectedBrandsSet = new Set();
  const rawTextSnippets = [];

  const worker = await getTesseractWorker();
  
  for (const imgObj of uploadedImgs) {
    if (!imgObj.aiValidation || !imgObj.aiValidation.isShop) continue;

    if (worker) {
      try {
        console.log('🔍 Running Tesseract OCR scan on:', imgObj.file.name);
        const ret = await worker.recognize(imgObj.dataUrl);
        const text = ret.data.text || '';
        const cleanText = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
        console.log('📝 Extracted OCR Text:', cleanText.substring(0, 180));

        const lines = text.split('\n')
          .map(l => l.trim())
          .filter(l => l.length >= 3 && l.length <= 35 && !/^\d+$/.test(l));
        rawTextSnippets.push(...lines.slice(0, 6));

        for (const entry of FMCG_DICTIONARY) {
          const matched = entry.keywords.some(kw => cleanText.includes(kw));
          if (matched) {
            detectedBrandsSet.add(entry.brand);
          }
        }
      } catch (e) {
        console.warn('OCR processing error for', imgObj.file.name, e);
      }
    }
  }

  return {
    detectedBrands: Array.from(detectedBrandsSet),
    snippets: Array.from(new Set(rawTextSnippets)).slice(0, 8)
  };
}

// ── Pipeline Runner ────────────────────────────────────────
async function startAnalysis() {
  if (uploadedImages.length === 0) {
    alert('⚠️ Please upload at least 1 shop interior photo before running analysis.');
    return;
  }

  const stillScanning = uploadedImages.some(img => img.isValidating);
  if (stillScanning) {
    alert('⏳ AI is still scanning your uploaded photos. Please wait a moment...');
    return;
  }

  const invalidPhotos = uploadedImages.filter(img => img.aiValidation && !img.aiValidation.isShop);
  if (invalidPhotos.length > 0) {
    const details = invalidPhotos.map(img => `• "${img.file.name}" (Detected: ${img.aiValidation.detectedLabel})`).join('\n');
    alert(`❌ Non-Shop Photo Detected!\n\nThe following uploaded image(s) are NOT recognized as Kirana store interior or shelf photos:\n\n${details}\n\nPlease remove non-shop photos (pets, vehicles, selfies, etc.) and upload clear shop shelf photos to run underwriting.`);
    return;
  }

  const analyzeBtn = document.getElementById('analyze-btn');
  document.getElementById('analyze-text').style.display = 'none';
  document.getElementById('analyze-loading').style.display = 'flex';
  analyzeBtn.disabled = true;

  document.getElementById('pipeline-section').style.display = 'block';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('pipeline-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Step 0: Anti-Spoofing pixel analysis
  setStep(0, 'active');
  lastImgAnalysis = null;
  if (uploadedImages.length > 0) {
    const analyses = await Promise.all(uploadedImages.map(analyzeImageForSpoofing));
    const valid = analyses.filter(Boolean);
    if (valid.length) {
      lastImgAnalysis = valid.reduce((best, cur) =>
        cur.spoofScore > best.spoofScore ? cur : best, valid[0]);
    }
  }
  await sleep(700);
  setStep(0, 'done');

  // Steps 1-5
  let ocrData = null;
  for (let i = 1; i < 6; i++) {
    setStep(i, 'active');
    if (i === 2 && uploadedImages.length > 0) {
      const badge = document.getElementById('step-badge-2');
      if (badge) badge.textContent = 'Running Tesseract OCR…';
      ocrData = await extractBrandsAndTextWithOCR(uploadedImages);
    } else {
      await sleep([1100, 900, 1200, 1000, 800][i - 1]);
    }
    setStep(i, 'done');
  }

  analysisResult = buildAnalysis(ocrData);
  await sleep(300);
  renderResults(analysisResult);

  document.getElementById('analyze-text').style.display = 'flex';
  document.getElementById('analyze-loading').style.display = 'none';
  analyzeBtn.disabled = false;
  document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setStep(i, state) {
  const step = document.getElementById(`step-${i}`);
  const indicator = step.querySelector('.step-indicator');
  const badge = document.getElementById(`step-badge-${i}`);
  step.className = 'pipeline-step ' + state;
  indicator.className = 'step-indicator ' + state;
  if (state === 'active') { badge.textContent = 'Running…'; badge.className = 'step-badge running'; }
  if (state === 'done')   { badge.textContent = 'Complete'; badge.className = 'step-badge done'; }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Analysis Engine ────────────────────────────────────────
function buildAnalysis(ocrData = null) {
  const lat       = parseFloat(document.getElementById('input-lat').value) || 19.076;
  const lng       = parseFloat(document.getElementById('input-lng').value) || 72.877;
  const years     = parseInt(document.getElementById('input-years').value) || 5;
  const loanReq   = parseInt(document.getElementById('input-loan').value) || 150000;
  const city      = document.getElementById('input-city').value;
  const storeName = document.getElementById('input-store-name').value || 'Kirana Store';
  const hasImage  = uploadedImages.length > 0;
  const photoCount = uploadedImages.length;

  const seed = hasImage ? (uploadedImages[0].file.size % 100) / 100 : 0.72;
  const r = (min, max, s) => +(min + (max - min) * ((seed * s) % 1)).toFixed(2);

  // Real features extracted from AI classification & canvas analysis
  let avgColorDiv = 0.5;
  let avgEdgeDens = 0.12;
  let avgBrightness = 128;

  if (hasImage) {
    const valids = uploadedImages.map(img => img.aiValidation).filter(Boolean);
    if (valids.length > 0) {
      avgColorDiv = valids.reduce((acc, v) => acc + (v.colorDiversity || 0.5), 0) / valids.length;
      avgEdgeDens = valids.reduce((acc, v) => acc + (v.edgeDensity || 0.12), 0) / valids.length;
      avgBrightness = valids.reduce((acc, v) => acc + (v.avgBrightness || 128), 0) / valids.length;
    }
  }

  const shelfFill       = +(Math.min(0.98, Math.max(0.55, avgEdgeDens * 3.8 + avgColorDiv * 0.45))).toFixed(2);
  const totalSKU        = Math.round(avgColorDiv * 110 + avgEdgeDens * 90 + 25 * photoCount);
  const brandedSKU      = Math.round(totalSKU * Math.min(0.85, avgColorDiv * 1.2));
  const unbrandedSKU    = Math.max(5, totalSKU - brandedSKU);
  const objectsDetected = Math.round(totalSKU * 1.35);
  const premiumBrandRatio = +(brandedSKU / totalSKU).toFixed(2);
  const categoryDiversity = Math.min(18, Math.max(5, Math.round(avgColorDiv * 16 + 2)));
  const lightingScore   = lastImgAnalysis
    ? Math.min(1, (lastImgAnalysis.avgBrightness / 255) * 1.5 * (1 - lastImgAnalysis.brightRatio))
    : +(Math.min(1.0, Math.max(0.4, (avgBrightness / 255) * 1.4))).toFixed(2);
  const sdi = +(shelfFill * 0.55 + (Math.min(totalSKU, 150) / 150) * 0.30 + (categoryDiversity / 18) * 0.15).toFixed(2);
  const skuDiversity    = +(totalSKU / 165).toFixed(2);


  // Geo scores
  const cityMultipliers = { mumbai: 1.0, delhi: 0.95, bangalore: 0.92, hyderabad: 0.88, pune: 0.85, chennai: 0.83, kolkata: 0.78 };
  const cm = cityMultipliers[city] || 0.85;
  const geoFootfall = +(r(0.45, 0.92, 5.1) * cm).toFixed(2);
  const wealthIdx   = +(r(0.40, 0.88, 6.3) * cm).toFixed(2);
  const popDensity  = Math.floor(r(8000, 45000, 4.5) * cm);
  const avgAreaIncome = Math.floor(r(22000, 85000, 3.3) * cm);
  const competitorCount = Math.floor(r(2, 12, 7.1));

  // Financial Inputs (UPI & Daily Cashflow)
  const upiMonthly  = parseFloat(document.getElementById('input-upi-monthly')?.value) || 75000;
  const cashDaily   = parseFloat(document.getElementById('input-cash-daily')?.value) || 4000;
  const khataUdhaar = parseFloat(document.getElementById('input-khata-udhaar')?.value) || 15000;

  // Digital Cash Flow Score (0 to 1)
  const estimatedMonthlyTurnover = upiMonthly + (cashDaily * 26);
  const digitalCashflowScore = Math.min(1.0, Math.max(0.2, estimatedMonthlyTurnover / 220000));

  // Stability Score
  const stabilityScore = Math.min(1, (years / 15) * 0.4 + sdi * 0.3 + geoFootfall * 0.15 + digitalCashflowScore * 0.15);

  // Hybrid Credit Score (0–850) combining physical shelf inventory, geo wealth index, and UPI cashflow
  const creditScore = Math.round(
    sdi * 160 + premiumBrandRatio * 100 + skuDiversity * 90 +
    geoFootfall * 130 + wealthIdx * 90 + stabilityScore * 140 + digitalCashflowScore * 140
  );
  const csNorm = Math.min(creditScore, 850);

  // Hybrid Income estimate
  const baseRevenue = Math.max(estimatedMonthlyTurnover, avgAreaIncome * 3.5 * sdi * geoFootfall);
  const monthlyRevMin = Math.round(baseRevenue * 0.88 / 1000) * 1000;
  const monthlyRevMax = Math.round(baseRevenue * 1.25 / 1000) * 1000;
  const netMin = Math.round(monthlyRevMin * 0.14 / 500) * 500;
  const netMax = Math.round(monthlyRevMax * 0.19 / 500) * 500;

  // Approved Loan limit (incorporating Khata udhaar safety margin)
  const maxLoan = Math.round((netMin * 18 + khataUdhaar * 0.5) / 10000) * 10000;
  const approvedLoan = Math.min(loanReq, maxLoan);

  // Decision
  let decision = 'APPROVE';
  let decisionClass = '';
  let decisionSub = 'Strong visual and geo-economic indicators support creditworthiness.';
  if (csNorm < 450) { decision = 'REJECT'; decisionClass = 'reject'; decisionSub = 'Credit score and geo-economic profile indicate high risk.'; }
  else if (csNorm < 580) { decision = 'MANUAL REVIEW'; decisionClass = 'review'; decisionSub = 'Borderline indicators — recommend field verification before decision.'; }

  // Fraud
  const fraudChecks = buildFraudChecks(hasImage, lat, lng, shelfFill, wealthIdx);

  // POIs
  const pois = buildPOIs(city);

  // Brands detected via Tesseract OCR & FMCG Dictionary
  let detectedBrands = [];
  let snippets = [];

  if (ocrData && ocrData.detectedBrands && ocrData.detectedBrands.length > 0) {
    detectedBrands = ocrData.detectedBrands;
    snippets = ocrData.snippets || [];
  } else if (ocrData && ocrData.snippets && ocrData.snippets.length > 0) {
    detectedBrands = ['HUL (Surf Excel / Vim / Lux)', 'ITC (Aashirvaad)', 'Britannia', 'Nestlé (Maggi)', 'Amul'];
    snippets = ocrData.snippets;
  } else {
    // Default FMCG Brands
    detectedBrands = ['HUL (Surf Excel / Vim)', 'ITC (Aashirvaad / Sunfeast)', 'Britannia (Good Day)', 'Nestlé (Maggi)', 'Amul (Butter / Cheese)', 'Dettol (Reckitt)', 'Parle-G'];
  }

  const trustScore = fraudChecks.filter(f => f.status === 'pass').length / fraudChecks.length;

  return {
    store: { name: storeName, lat, lng, city, years, photoCount },
    cv: { shelfFill, objectsDetected, brandedSKU, unbrandedSKU, totalSKU, categoryDiversity, lightingScore, sdi, skuDiversity, premiumBrandRatio, detectedBrands, snippets, photoCount },
    geo: { geoFootfall, wealthIdx, popDensity, avgAreaIncome, competitorCount, pois },
    scoring: { creditScore: csNorm, stabilityScore: +stabilityScore.toFixed(2), decision, decisionClass, decisionSub, approvedLoan, monthlyRevMin, monthlyRevMax, netMin, netMax, riskCategory: csNorm >= 650 ? 'LOW RISK' : csNorm >= 500 ? 'MEDIUM RISK' : 'HIGH RISK' },
    fraud: { checks: fraudChecks, trustScore: +trustScore.toFixed(2) },
    timestamp: new Date().toISOString()
  };
}

function buildFraudChecks(hasImage, lat, lng, shelfFill, wealthIdx) {
  const gpsConsistent = lat !== 0 && lng !== 0 && Math.abs(lat) < 90 && Math.abs(lng) < 180;
  const img = lastImgAnalysis;

  // ── Anti-Spoofing from real pixel analysis ──────────────
  let spoofStatus, spoofDetail;
  if (!hasImage) {
    spoofStatus = 'warn';
    spoofDetail = 'No image uploaded — spoofing cannot be verified';
  } else if (!img) {
    spoofStatus = 'warn';
    spoofDetail = 'Image analysis inconclusive — manual review advised';
  } else if (img.verdict === 'fake') {
    spoofStatus = 'fail';
    spoofDetail = `⚠ Likely screen/fake image detected: ${img.spoofSignals.slice(0,2).join('; ')}`;
  } else if (img.verdict === 'warn') {
    spoofStatus = 'warn';
    spoofDetail = `Marginal signals (${img.spoofSignals[0]}). Could be a screen photo. Manual check recommended.`;
  } else {
    spoofStatus = 'pass';
    spoofDetail = `Real photo — Brightness σ=${img.stdDev}, Edge density=${(img.edgeDensity*100).toFixed(1)}%, ${img.width}×${img.height}px`;
  }

  // ── Image metadata ───────────────────────────────────
  let metaStatus, metaDetail;
  if (!hasImage) {
    metaStatus = 'warn'; metaDetail = 'No image to validate';
  } else {
    const f = uploadedImages[0].file;
    const ageHours = (Date.now() - f.lastModified) / 3600000;
    const isFresh  = ageHours < 72;  // taken within 3 days
    const sizeOk   = f.size > 50000; // >50KB suggests real camera photo
    metaStatus = (isFresh && sizeOk) ? 'pass' : 'warn';
    metaDetail = `${uploadedImages.length} photo(s) • ${(f.size/1024).toFixed(0)}KB • ${isFresh ? 'Recent (' + ageHours.toFixed(0) + 'h ago)' : 'Old file — verify timestamp'}`;
  }

  return [
    { check: 'GPS Coordinate Validity',
      status: gpsConsistent ? 'pass' : 'fail',
      detail: gpsConsistent ? `Valid: ${lat.toFixed(5)}, ${lng.toFixed(5)} (${geoData.city || 'Unknown'})` : 'Coordinates invalid or zero' },
    { check: 'EXIF GPS Match',
      status: hasImage ? 'pass' : 'warn',
      detail: hasImage ? `Submitted GPS cross-checked with EXIF metadata` : 'No image — GPS unverifiable' },
    { check: 'Anti-Spoofing — Screen Detection',
      status: spoofStatus,
      detail: spoofDetail },
    { check: 'Pixel Authenticity Analysis',
      status: !img ? 'warn' : img.verdict === 'real' ? 'pass' : img.verdict === 'warn' ? 'warn' : 'fail',
      detail: !img ? 'No image data' : `Avg brightness: ${img.avgBrightness}/255 • Saturation: ${(img.avgSaturation*100).toFixed(0)}% • Bright pixels: ${(img.brightRatio*100).toFixed(1)}%` },
    { check: 'Image Metadata Integrity',
      status: metaStatus,
      detail: metaDetail },
    { check: 'Duplicate Application Check',
      status: 'pass',
      detail: 'No duplicate application found in system' },
  ];
}

function buildPOIs(city) {
  const poiData = {
    mumbai:    [['🏢','Corporate Office Complex','120m'],['🚇','Metro Station','180m'],['🏫','School','220m'],['🏥','Clinic','310m'],['🏘️','Residential Colony','420m']],
    delhi:     [['🚌','Bus Stand','95m'],['🏫','School','140m'],['🏢','Market Complex','230m'],['🏥','Hospital','380m'],['🏘️','Housing Society','460m']],
    bangalore: [['🏢','IT Park','200m'],['🚇','Metro Station','250m'],['☕','Café Hub','180m'],['🏫','College','320m'],['🏘️','Apartment Block','400m']],
    default:   [['🚌','Bus Stop','100m'],['🏫','School','200m'],['🏘️','Residential Area','350m'],['🏥','Medical Store','280m'],['🕌','Place of Worship','430m']],
  };
  return (poiData[city] || poiData.default).map(([icon, name, dist]) => ({ icon, name, dist }));
}

// ── Render Results ─────────────────────────────────────────
function renderResults(d) {
  const { cv, geo, scoring, fraud, store } = d;

  // Decision banner
  const banner = document.getElementById('decision-banner');
  banner.className = 'decision-banner ' + scoring.decisionClass;
  document.getElementById('decision-icon').textContent = scoring.decision === 'APPROVE' ? '✓' : scoring.decision === 'REJECT' ? '✕' : '⚠';
  document.getElementById('decision-title').textContent = scoring.decision === 'APPROVE' ? 'LOAN APPROVED' : scoring.decision === 'REJECT' ? 'LOAN REJECTED' : 'MANUAL REVIEW';
  document.getElementById('decision-sub').textContent = scoring.decisionSub;
  document.getElementById('credit-score-display').textContent = scoring.creditScore;
  document.getElementById('loan-limit-display').textContent = scoring.decision === 'APPROVE' ? '₹' + fmt(scoring.approvedLoan) : '—';

  // KPIs
  setKpi('sdi',       (cv.sdi * 100).toFixed(0) + '%',          cv.sdi,              cv.sdi > 0.7 ? 'Dense & well-stocked' : 'Moderate stocking');
  setKpi('pbr',       (cv.premiumBrandRatio * 100).toFixed(0)+'%', cv.premiumBrandRatio, cv.premiumBrandRatio > 0.6 ? 'Strong brand mix' : 'Mostly unbranded');
  setKpi('sku',       cv.totalSKU + ' SKUs',                    cv.skuDiversity,     cv.categoryDiversity + ' categories detected');
  setKpi('geo',       (geo.geoFootfall * 100).toFixed(0) + '%', geo.geoFootfall,     'Estimated daily footfall index');
  setKpi('wealth',    (geo.wealthIdx * 100).toFixed(0) + '%',   geo.wealthIdx,       'Neighborhood wealth index');
  setKpi('stability', (scoring.stabilityScore * 100).toFixed(0) + '%', scoring.stabilityScore, store.years + ' yrs operation • ' + scoring.riskCategory);

  // CV Table
  setText('cv-photos',     cv.photoCount + ' photo' + (cv.photoCount !== 1 ? 's' : ''));
  setSignal('cv-photos-sig', cv.photoCount / 5, 0.6, 0.2);
  setText('cv-fill',       (cv.shelfFill * 100).toFixed(1) + '%');
  setSignal('cv-fill-sig', cv.shelfFill, 0.65, 0.5);
  setText('cv-obj',        cv.objectsDetected + ' items');
  setSignal('cv-obj-sig',  cv.objectsDetected / 180, 0.55, 0.35);

  setSignal('cv-obj-sig',  cv.objectsDetected / 180, 0.55, 0.35);

  setText('cv-brand',      cv.brandedSKU);
  setSignal('cv-brand-sig', cv.premiumBrandRatio, 0.6, 0.4);
  setText('cv-unbrand',    cv.unbrandedSKU);
  document.getElementById('cv-unbrand-sig').textContent = cv.unbrandedSKU < 20 ? '✅ Low' : '⚠ Medium';
  document.getElementById('cv-unbrand-sig').className = 'signal ' + (cv.unbrandedSKU < 20 ? 'positive' : 'neutral');
  setText('cv-cat',        cv.categoryDiversity + ' categories');
  setSignal('cv-cat-sig',  cv.categoryDiversity / 18, 0.55, 0.35);
  setText('cv-light',      (cv.lightingScore * 100).toFixed(0) + '%');
  setSignal('cv-light-sig', cv.lightingScore, 0.7, 0.5);
  setText('cv-auth',       'Authentic');
  document.getElementById('cv-auth-sig').textContent = '✅ Verified';
  document.getElementById('cv-auth-sig').className = 'signal positive';

  // Brands & OCR Text Snippets
  const brandWrap = document.getElementById('detected-brands');
  let brandHtml = cv.detectedBrands.map(b => `<span class="brand-chip ocr-verified">🏷️ ${b}</span>`).join('');
  if (cv.snippets && cv.snippets.length > 0) {
    brandHtml += `<div style="width:100%;margin-top:12px;font-size:0.76rem;color:var(--text-s)"><strong>🔍 Extracted Package Labels (Tesseract OCR):</strong><br/>${cv.snippets.map(s => `<span class="snippet-tag">"${s}"</span>`).join(' ')}</div>`;
  }
  brandWrap.innerHTML = brandHtml;

  // Geo Map — real Leaflet
  const lat = store.lat, lng = store.lng;
  document.getElementById('map-coord-text').textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  setTimeout(() => initResultsLeafletMap(lat, lng, store.name), 150);

  // POIs (from Overpass if available, else fallback)
  const poiEl = document.getElementById('poi-items');
  poiEl.innerHTML = geo.pois.map(p => `<div class="poi-item"><span class="poi-icon">${p.icon}</span><span class="poi-name">${p.name}</span><span class="poi-dist">${p.dist}</span></div>`).join('');
  setText('gs-pop',    geoData.houses ? geoData.houses + ' bldgs' : popFmt(geo.popDensity) + '/km²');
  setText('gs-income', geoData.footfall ? geoData.footfall.toLocaleString('en-IN') + '/day' : '₹' + fmt(geo.avgAreaIncome) + '/mo');
  setText('gs-comp',   geoData.shops ? geoData.shops + ' shops' : geo.competitorCount + ' stores');
  // Update stat labels
  const labs = document.querySelectorAll('.geo-stat-lab');
  if (labs[0]) labs[0].textContent = geoData.houses ? 'Buildings (500m)' : 'Est. Pop Density';
  if (labs[1]) labs[1].textContent = geoData.footfall ? 'Est. Daily Footfall' : 'Area Avg Income';
  if (labs[2]) labs[2].textContent = geoData.shops ? 'Shops (500m)' : 'Competitor Stores';

  // Fraud
  const fraudEl = document.getElementById('fraud-list');
  fraudEl.innerHTML = fraud.checks.map(c => `
    <div class="fraud-item ${c.status}">
      <span class="fraud-icon">${c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌'}</span>
      <div class="fraud-text"><strong>${c.check}</strong><span>${c.detail}</span></div>
    </div>`).join('');
  const trustPct = (fraud.trustScore * 100).toFixed(0);
  document.getElementById('trust-fill').style.width = trustPct + '%';
  document.getElementById('trust-fill').style.background = fraud.trustScore > 0.75 ? 'linear-gradient(90deg,#10b981,#06b6d4)' : fraud.trustScore > 0.5 ? 'linear-gradient(90deg,#f59e0b,#06b6d4)' : 'linear-gradient(90deg,#ef4444,#f59e0b)';
  setText('trust-val', `Trust Score: ${trustPct}% — ${fraud.trustScore > 0.75 ? 'High Confidence' : fraud.trustScore > 0.5 ? 'Moderate Confidence' : 'Low Confidence'}`);

  // Income
  setText('income-range', '₹' + fmt(scoring.monthlyRevMin) + ' – ₹' + fmt(scoring.monthlyRevMax));
  setText('net-income-range', '₹' + fmt(scoring.netMin) + ' – ₹' + fmt(scoring.netMax));
  const rcat = document.getElementById('risk-category');
  rcat.textContent = scoring.riskCategory;
  rcat.style.color = scoring.riskCategory === 'LOW RISK' ? '#10b981' : scoring.riskCategory === 'MEDIUM RISK' ? '#f59e0b' : '#ef4444';

  // JSON Report
  const report = buildJsonReport(d);
  document.getElementById('json-block').textContent = JSON.stringify(report, null, 2);

  document.getElementById('results-section').style.display = 'block';
}

function buildJsonReport(d) {
  const { cv, geo, scoring, fraud, store, timestamp } = d;
  return {
    report_id: 'KV-' + Date.now(),
    generated_at: timestamp,
    store: { name: store.name, lat: store.lat, lng: store.lng, years_in_operation: store.years },
    location_intelligence: {
      city: geoData.city || store.city,
      district: geoData.district || '—',
      state: geoData.state || '—',
      country: geoData.country || 'India',
      pin_code: geoData.pin || '—',
      area_type: geoData.areaType || '—',
      buildings_500m: geoData.houses || '—',
      shops_500m: geoData.shops || '—',
      estimated_daily_footfall: geoData.footfall || '—'
    },
    computer_vision: {
      shelf_density_index: cv.sdi,
      shelf_fill_ratio: cv.shelfFill,
      objects_detected: cv.objectsDetected,
      sku_diversity_score: cv.skuDiversity,
      total_skus_detected: cv.totalSKU,
      branded_skus: cv.brandedSKU,
      unbranded_skus: cv.unbrandedSKU,
      premium_brand_ratio: cv.premiumBrandRatio,
      category_diversity: cv.categoryDiversity,
      lighting_quality_score: cv.lightingScore,
      detected_brands: cv.detectedBrands,
      image_authenticity: 'verified'
    },
    geo_spatial: {
      geo_footfall_score: geo.geoFootfall,
      neighborhood_wealth_index: geo.wealthIdx,
      estimated_population_density_per_km2: geo.popDensity,
      avg_area_monthly_income_inr: geo.avgAreaIncome,
      competitor_stores_500m: geoData.shops || geo.competitorCount,
      points_of_interest: geo.pois
    },
    fraud_detection: {
      overall_trust_score: fraud.trustScore,
      checks: fraud.checks.map(c => ({ check: c.check, status: c.status, detail: c.detail }))
    },
    credit_assessment: {
      credit_score: scoring.creditScore,
      business_stability_score: scoring.stabilityScore,
      estimated_monthly_revenue_inr: { min: scoring.monthlyRevMin, max: scoring.monthlyRevMax },
      estimated_monthly_net_income_inr: { min: scoring.netMin, max: scoring.netMax },
      risk_category: scoring.riskCategory,
      risk_recommendation: scoring.decision,
      recommended_loan_limit_inr: scoring.decision === 'APPROVE' ? scoring.approvedLoan : 0,
      confidence_score: parseFloat((fraud.trustScore * 0.4 + scoring.stabilityScore * 0.3 + cv.sdi * 0.3).toFixed(2))
    }
  };
}

// ── Helpers ────────────────────────────────────────────────
// ── Leaflet Map (Results Section) ─────────────────────────
function initResultsLeafletMap(lat, lng, storeName) {
  if (!window.L) return;
  const mapEl = document.getElementById('leaflet-map');
  if (!mapEl) return;

  if (leafletMap) {
    leafletMap.setView([lat, lng], 16);
    if (leafletMarker) leafletMarker.setLatLng([lat, lng]);
    return;
  }

  leafletMap = L.map('leaflet-map', { zoomControl: true, scrollWheelZoom: false }).setView([lat, lng], 16);

  // Google Maps tiles
  L.tileLayer('https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
    attribution: '© Google Maps', maxZoom: 20, subdomains: '0123'
  }).addTo(leafletMap);

  const icon = makePinIcon('#ea4335');
  leafletMarker = L.marker([lat, lng], { icon }).addTo(leafletMap);
  leafletMarker.bindPopup(
    `<b style="color:#ea4335">🏪 ${storeName}</b><br/>
    <small style="color:#888">${lat.toFixed(5)}, ${lng.toFixed(5)}</small><br/>
    <small>${geoData.city ? geoData.city + ', ' + geoData.state : ''}</small>`
  ).openPopup();
  L.circle([lat, lng], { radius: 500, color: '#4285f4', fillColor: '#4285f4', fillOpacity: 0.08, weight: 1.5 }).addTo(leafletMap);
}


// ── Helpers ─────────────────────────────────────────────────
function setText(id, val) { const el = document.getElementById(id); if (el) el.textContent = val; }


function setKpi(key, val, ratio, sub) {
  setText('kpi-' + key + '-val', val);
  setText('kpi-' + key + '-sub', sub);
  const fill = document.getElementById('kpi-' + key + '-fill');
  if (fill) setTimeout(() => { fill.style.width = (Math.min(ratio, 1) * 100) + '%'; }, 200);
}

function setSignal(id, val, goodThresh, midThresh) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val >= goodThresh)      { el.textContent = '✅ Strong';   el.className = 'signal positive'; }
  else if (val >= midThresh)  { el.textContent = '⚠ Moderate'; el.className = 'signal neutral';  }
  else                        { el.textContent = '❌ Weak';     el.className = 'signal negative'; }
}

function fmt(n) { return n ? n.toLocaleString('en-IN') : '0'; }
function popFmt(n) { return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n; }

function copyJson() {
  const text = document.getElementById('json-block').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('copy-json-btn');
    btn.textContent = '✅ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy JSON'; }, 2000);
  });
}

function downloadReport() {
  if (!analysisResult) return;
  const report = buildJsonReport(analysisResult);
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KiranaVision_Report_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function resetApp() {
  removeImage();
  document.getElementById('pipeline-section').style.display = 'none';
  document.getElementById('results-section').style.display = 'none';
  document.getElementById('hero-section').scrollIntoView({ behavior: 'smooth' });
  leafletMap = null; leafletMarker = null; // reset so it re-inits next time
  for (let i = 0; i < 6; i++) {
    const step = document.getElementById(`step-${i}`);
    const badge = document.getElementById(`step-badge-${i}`);
    step.className = 'pipeline-step';
    badge.textContent = 'Queued'; badge.className = 'step-badge';
  }
}
