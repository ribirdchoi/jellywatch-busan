const toast = document.querySelector('#toast');
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
};

// 실제 지자체 접수 API가 생기면 이 주소를 배포 환경의 API 주소로 설정합니다.
const MUNICIPAL_REPORT_ENDPOINT = '';
const locationStatus = document.querySelector('#locationStatus') || { textContent: '' };
const mapPermissionGuide = document.querySelector('#mapPermissionGuide');
const latitude = document.querySelector('#latitude');
const longitude = document.querySelector('#longitude');
const accuracy = document.querySelector('#accuracy');
let currentLocation = null;
let currentMap = null;
let currentUserMarker = null;
let currentUserRadius = null;
let nearbyCareLayer = null;
let beachRiskLayer = null;
let stopRiskSubscription = null;
let locationWatchId = null;
let centerMapOnNextLocation = false;
let lastCareMarkerLocation = null;
let lastRiskLocationKey = '';
let jellyfishModelPromise = null;
let photoValidation = { status: 'idle', confidence: 0, label: '' };
const locationOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

function setMapPermissionGuide(message, blocked = false) {
  if (!mapPermissionGuide) return;
  const label = mapPermissionGuide.querySelector('span');
  const button = mapPermissionGuide.querySelector('button');
  if (label) label.textContent = message;
  mapPermissionGuide.classList.toggle('is-blocked', blocked);
  if (button) button.textContent = blocked ? '위치 권한 다시 요청' : '내 위치 다시 확인';
}

function updateJellyfishRisk() {
  const title = document.querySelector('#jellyRiskTitle');
  const detail = document.querySelector('#jellyRiskDetail');
  const card = document.querySelector('#jellyRiskCard');
  if (!title || !detail || !card) return;
  if (!currentLocation) {
    title.textContent = '주변 해파리 위험 정보를 확인하려면 위치 권한이 필요합니다.';
    detail.textContent = '위치 권한을 허용하면 현재 위치 반경 10km의 신고 기록을 분석합니다.';
    return;
  }
  const riskLocationKey = `${currentLocation.latitude.toFixed(3)},${currentLocation.longitude.toFixed(3)}`;
  if (riskLocationKey === lastRiskLocationKey) return;
  lastRiskLocationKey = riskLocationKey;
  title.textContent = '주변 해파리 위험 정보를 분석하는 중입니다.';
  detail.textContent = '현재 위치 반경 10km의 확인된 신고 기록을 불러오고 있습니다.';
  stopRiskSubscription?.();
  window.jellyFirebaseReady?.then((firebase) => {
    if (!firebase?.ready || !firebase.subscribeReports) {
      title.textContent = '주변 해파리 신고 데이터 연결을 확인할 수 없습니다.';
      detail.textContent = '공식 해파리 신고 웹 또는 지자체 안전 안내를 함께 확인해 주세요.';
      return;
    }
    stopRiskSubscription = firebase.subscribeReports((reports) => {
      const nearby = reports.filter((report) => report.latitude && report.longitude && distanceInMeters(currentLocation.latitude, currentLocation.longitude, Number(report.latitude), Number(report.longitude)) <= 10000);
      const risk = nearby.length >= 3 ? '주의' : nearby.length >= 1 ? '관찰' : '안전';
      updateBeachRiskZones(reports);
      card.dataset.risk = risk;
      title.textContent = `주변 해파리 위험도: ${risk}`;
      detail.textContent = nearby.length ? `현재 위치 반경 10km 안에 확인된 신고 ${nearby.length}건이 있습니다.` : '현재 위치 반경 10km 안에 확인된 신고가 없습니다.';
    }, () => {
      title.textContent = '주변 해파리 신고 데이터를 불러오지 못했습니다.';
      detail.textContent = '네트워크를 확인한 뒤 다시 시도해 주세요.';
    });
  });
}

async function classifyJellyfishPhoto(file) {
  if (window.JELLYWATCH_AI_ENDPOINT) {
    const payload = new FormData();
    payload.append('image', file, file.name);
    const response = await fetch(window.JELLYWATCH_AI_ENDPOINT, { method: 'POST', body: payload });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'roboflow_inference_failed');
    const best = result.predictions?.[0] || {};
    return { accepted: Boolean(result.is_jellyfish), confidence: Number(result.confidence || 0), label: best.class || result.model_id || '' };
  }
  if (!window.mobilenet) throw new Error('model_unavailable');
  if (!jellyfishModelPromise) jellyfishModelPromise = window.mobilenet.load({ version: 2, alpha: 1.0 });
  const image = new Image();
  const objectUrl = URL.createObjectURL(file);
  image.src = objectUrl;
  await image.decode();
  const model = await jellyfishModelPromise;
  const predictions = await model.classify(image, 5);
  URL.revokeObjectURL(objectUrl);
  const jellyfish = predictions.find((item) => /jellyfish|sea anemone|coral reef|sea cucumber|starfish/i.test(item.className));
  const topMarine = predictions.find((item) => /sea|marine|ocean|reef|coral|anemone|fish/i.test(item.className));
  const candidate = jellyfish || topMarine;
  const threshold = jellyfish ? 0.10 : 0.18;
  return { accepted: Boolean(candidate && candidate.probability >= threshold), confidence: candidate?.probability || 0, label: candidate?.className || predictions[0]?.className || '' };
}

function updateLocationStatus(position) {
  currentLocation = {
    latitude: Number(position.coords.latitude.toFixed(6)),
    longitude: Number(position.coords.longitude.toFixed(6)),
    accuracy: Math.round(position.coords.accuracy),
    measuredAt: new Date().toISOString()
  };
  if (latitude) latitude.textContent = currentLocation.latitude.toFixed(6);
  if (longitude) longitude.textContent = currentLocation.longitude.toFixed(6);
  if (accuracy) accuracy.textContent = `${currentLocation.accuracy}m`;
  locationStatus.textContent = `⌖ 위치 확인 완료 · 오차 약 ${currentLocation.accuracy}m`;
  if (currentMap && typeof L !== 'undefined') {
    const point = [currentLocation.latitude, currentLocation.longitude];
    if (currentUserMarker) currentUserMarker.setLatLng(point);
    else currentUserMarker = L.circleMarker(point, { radius: 9, stroke: false, fillColor: '#e7473f', fillOpacity: 1 }).addTo(currentMap);
    if (currentUserRadius) currentUserRadius.setLatLng(point);
    else currentUserRadius = L.circle(point, { radius: 10000, color: '#e7473f', weight: 2, fillColor: '#e7473f', fillOpacity: 0.08, interactive: false }).addTo(currentMap);
    if (centerMapOnNextLocation) {
      currentMap.setView(point, Math.max(currentMap.getZoom(), 14), { animate: false });
      centerMapOnNextLocation = false;
    }
    addNearbyCareMarkers();
    loadNearbyCarePlaces();
  }
  setMapPermissionGuide(`내 위치를 확인했습니다 · 반경 10km 피부과·응급실을 표시합니다.`);
  updateJellyfishRisk();
}

function refreshPreciseLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = '⌖ 이 기기에서는 GPS를 사용할 수 없습니다';
    return;
  }
  locationStatus.textContent = '⌖ 고정밀 GPS 위치를 확인하는 중…';
  setMapPermissionGuide('위치 권한을 확인하고 있습니다. 잠시만 기다려 주세요.');
  navigator.geolocation.getCurrentPosition(updateLocationStatus, () => {
    locationStatus.textContent = '⌖ 위치 권한을 허용하면 정확한 신고가 가능합니다';
    setMapPermissionGuide('위치 권한이 차단되어 있습니다. 브라우저 주소창 설정에서 이 사이트의 위치 권한을 허용한 뒤 다시 요청해 주세요.', true);
  }, locationOptions);
  if (locationWatchId === null) {
    locationWatchId = navigator.geolocation.watchPosition(updateLocationStatus, () => {}, locationOptions);
  }
}

async function submitReport(report) {
  if (window.jellyFirebaseReady) {
    const firebase = await window.jellyFirebaseReady;
    if (firebase?.ready && firebase.addReport) {
      await firebase.addReport(report);
      return;
    }
  }
  if (MUNICIPAL_REPORT_ENDPOINT) {
    const response = await fetch(MUNICIPAL_REPORT_ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report)
    });
    if (!response.ok) throw new Error('report_failed');
  } else {
    const reports = JSON.parse(localStorage.getItem('jellywatch_reports') || '[]');
    reports.push(report);
    localStorage.setItem('jellywatch_reports', JSON.stringify(reports));
  }
}

document.querySelector('#photoInput')?.addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    document.querySelector('#uploadTitle').textContent = file.name;
    const verdict = document.querySelector('#aiVerdict');
    photoValidation = { status: 'checking', confidence: 0, label: '' };
    verdict.hidden = false;
    verdict.className = 'ai-verdict is-checking';
    verdict.textContent = '기기 안에서 사진을 확인하고 있습니다. 사진은 외부로 전송되지 않습니다.';
    document.querySelector('#uploadHint').textContent = '해파리 사진인지 확인한 뒤 GPS 위치를 함께 기록합니다';
    classifyJellyfishPhoto(file).then((result) => {
      photoValidation = { status: result.accepted ? 'accepted' : 'rejected', confidence: result.confidence, label: result.label };
      verdict.className = `ai-verdict ${result.accepted ? 'is-accepted' : 'is-rejected'}`;
      verdict.textContent = result.accepted
        ? `해파리 또는 유사 해양생물로 인식되었습니다 · 신뢰도 ${Math.round(result.confidence * 100)}%`
        : '해파리·유사 해양생물로 확인되지 않았습니다. 대상이 크게 보이도록 다시 촬영해 주세요.';
    }).catch(() => {
      photoValidation = { status: 'unavailable', confidence: 0, label: '' };
      verdict.className = 'ai-verdict is-rejected';
      verdict.textContent = '사진 판별을 시작하지 못했습니다. 인터넷 연결을 확인한 뒤 다시 촬영해 주세요.';
    });
    refreshPreciseLocation();
  }
});

document.querySelector('#reportForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (photoValidation.status === 'checking') { showToast('사진 판별이 끝난 뒤 신고해 주세요.'); return; }
  if (photoValidation.status !== 'accepted') { showToast('해파리 사진으로 확인된 경우에만 신고할 수 있습니다.'); return; }
  if (!currentLocation) {
    showToast('정확한 위치를 확인한 뒤 다시 신고해 주세요.');
    refreshPreciseLocation();
    return;
  }
  const form = new FormData(event.target);
  const report = {
    place: form.get('place') || document.querySelector('#placeInput').value,
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    accuracyMeters: currentLocation.accuracy,
    aiVerified: true,
    aiConfidence: photoValidation.confidence,
    aiLabel: photoValidation.label,
    measuredAt: currentLocation.measuredAt,
    submittedAt: new Date().toISOString()
  };
  try {
    await submitReport(report);
    showToast(`위치 포함 신고가 접수되었습니다 · ${report.latitude}, ${report.longitude}`);
    event.target.reset();
  } catch {
    showToast('신고 전송에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
});

const requestAndCenterLocation = () => { centerMapOnNextLocation = true; refreshPreciseLocation(); };
document.querySelector('#locateBtn').addEventListener('click', requestAndCenterLocation);
document.querySelector('#mapLocate').addEventListener('click', requestAndCenterLocation);
document.querySelector('#requestLocationAgain')?.addEventListener('click', refreshPreciseLocation);

const defaultNearbyCarePlaces = [
  { name: '좋은강안병원 응급실', type: '응급실', lat: 35.1538, lng: 129.1122, hours: '24시간 운영', openDays: [0, 1, 2, 3, 4, 5, 6], openStart: 0, openEnd: 24, tel: '051-625-0900' },
  { name: '부산성모병원 응급실', type: '응급실', lat: 35.1328, lng: 129.1112, hours: '24시간 운영', openDays: [0, 1, 2, 3, 4, 5, 6], openStart: 0, openEnd: 24, tel: '051-933-7114' }
];
let nearbyCarePlaces = [...defaultNearbyCarePlaces];
let lastCareQueryKey = '';

async function loadNearbyCarePlaces() {
  if (!currentLocation) return;
  const queryKey = `${currentLocation.latitude.toFixed(2)},${currentLocation.longitude.toFixed(2)}`;
  if (queryKey === lastCareQueryKey) return;
  lastCareQueryKey = queryKey;
  const { latitude: lat, longitude: lng } = currentLocation;
  const span = 0.12;
  const area = `(${lat - span},${lng - span},${lat + span},${lng + span})`;
  const query = `[out:json][timeout:12];(nwr[amenity=hospital][emergency~"yes|designated",i]${area};nwr[amenity=clinic][emergency=yes]${area};nwr[healthcare=doctor]["healthcare:speciality"~"dermatology|피부과",i]${area};nwr[healthcare=doctor][medical_speciality~"dermatology|피부과",i]${area};nwr[name~"피부과",i]${area};nwr[name~"응급",i]${area};);out center tags;`;
  try {
    const sources = ['https://overpass.kumi.systems/api/interpreter', 'https://overpass-api.de/api/interpreter'];
    let data = null;
    for (const source of sources) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const response = await fetch(`${source}?data=${encodeURIComponent(query)}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (response.ok) { data = await response.json(); break; }
      } catch (error) { console.warn('의료시설 데이터 서버 재시도', error); }
    }
    if (!data) throw new Error('care_data_failed');
    const places = data.elements.map((item) => {
      const tags = item.tags || {};
      const emergency = tags.emergency === 'yes' || tags.emergency === 'designated' || /응급/.test(tags.name || '');
      return {
        name: tags['name:ko'] || tags.name || (emergency ? '응급실' : '피부과'),
        type: emergency ? '응급실' : '피부과',
        lat: item.lat ?? item.center?.lat,
        lng: item.lon ?? item.center?.lon,
        address: [tags['addr:full'], tags['addr:city'], tags['addr:district'], tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' ') || '부산광역시',
        hours: emergency ? (tags.opening_hours || '24시간 운영 여부는 전화로 확인하세요') : (tags.opening_hours || '운영 시간은 전화로 확인하세요'),
        tel: tags.phone || tags['contact:phone'] || '전화번호 정보 확인 필요',
        openDays: emergency ? [0, 1, 2, 3, 4, 5, 6] : null,
        openStart: emergency ? 0 : undefined,
        openEnd: emergency ? 24 : undefined
      };
    }).filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng));
    if (places.length) {
      const placeKeys = new Set();
      nearbyCarePlaces = [...defaultNearbyCarePlaces, ...places].filter((place) => {
        const key = `${place.name}|${place.lat.toFixed(5)}|${place.lng.toFixed(5)}`;
        if (placeKeys.has(key)) return false;
        placeKeys.add(key);
        return true;
      });
    }
    addNearbyCareMarkers(true);
  } catch (error) {
    console.warn('주변 의료시설 정보를 불러오지 못했습니다.', error);
  }
}

function locationArrowIcon(heading = 0) {
  return L.divIcon({ className: 'location-arrow-wrap', html: `<span class="location-arrow" style="transform:rotate(${heading}deg)"></span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
}

function distanceInMeters(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000;
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function isCurrentlyOpen(place) {
  if (!Array.isArray(place.openDays)) return null;
  const now = new Date();
  return place.openDays.includes(now.getDay()) && now.getHours() >= place.openStart && now.getHours() < place.openEnd;
}

function addNearbyCareMarkers(force = false) {
  if (!currentMap) return;
  if (currentLocation && !force && lastCareMarkerLocation && distanceInMeters(currentLocation.latitude, currentLocation.longitude, lastCareMarkerLocation.latitude, lastCareMarkerLocation.longitude) < 80) return;
  if (currentLocation) lastCareMarkerLocation = { ...currentLocation };
  if (!nearbyCareLayer) nearbyCareLayer = L.layerGroup().addTo(currentMap);
  nearbyCareLayer.clearLayers();
  const nearbyPlaces = currentLocation
    ? nearbyCarePlaces.filter((place) => distanceInMeters(currentLocation.latitude, currentLocation.longitude, place.lat, place.lng) <= 10000)
    : [];
  const nearbyCount = document.querySelector('#nearbyCount');
  if (nearbyCount) nearbyCount.textContent = nearbyPlaces.length;
  nearbyPlaces.forEach((place) => {
    const iconClass = place.type === '응급실' ? 'hospital-pin' : 'health-center-pin';
    const icon = L.divIcon({ className: `care-marker ${iconClass}`, html: '<span aria-hidden="true"></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(nearbyCareLayer);
    const renderPopup = () => {
      const distance = currentLocation ? distanceInMeters(currentLocation.latitude, currentLocation.longitude, place.lat, place.lng) : null;
      const open = isCurrentlyOpen(place);
      const operationText = open === null ? '운영 시간 확인 필요' : open ? '현재 운영 중' : '현재 운영 종료';
      const operationClass = open === null ? '' : open ? 'is-open' : 'is-closed';
      const googleSearch = encodeURIComponent(`${place.name} ${place.address || '부산광역시'}`);
      const mapUrl = `https://www.google.com/maps/search/?api=1&query=${googleSearch}`;
      marker.bindPopup(`<div class="care-popup"><strong>${place.name}</strong><span class="care-type">${place.type}</span><b class="open-status ${operationClass}">${operationText}</b><small>${place.hours}</small>${distance === null ? '' : `<small>내 위치에서 약 ${(distance / 1000).toFixed(1)}km</small>`}${place.tel === '전화번호 정보 확인 필요' ? `<small>${place.tel}</small>` : `<a href="tel:${place.tel}">${place.tel}</a>`}<a class="google-map-link" href="${mapUrl}" target="_blank" rel="noopener noreferrer">Google 지도에서 정확한 장소 정보 보기</a></div>`).openPopup();
    };
    marker.on('click', renderPopup);
  });
}

const beachRiskZones = [
  { name: '다대포 해수욕장', lat: 35.0464, lng: 128.9678, shape: [[35.0419,128.9585],[35.0426,128.9760],[35.0499,128.9788],[35.0510,128.9591]] },
  { name: '송도 해수욕장', lat: 35.0759, lng: 129.0197, shape: [[35.0724,129.0152],[35.0738,129.0254],[35.0797,129.0244],[35.0790,129.0151]] },
  { name: '광안리 해수욕장', lat: 35.1532, lng: 129.1186, shape: [[35.1492,129.1127],[35.1502,129.1273],[35.1575,129.1281],[35.1581,129.1146]] },
  { name: '해운대 해수욕장', lat: 35.1587, lng: 129.1604, shape: [[35.1549,129.1532],[35.1554,129.1700],[35.1618,129.1694],[35.1622,129.1540]] },
  { name: '송정 해수욕장', lat: 35.1802, lng: 129.1996, shape: [[35.1772,129.1939],[35.1778,129.2054],[35.1828,129.2055],[35.1835,129.1953]] },
  { name: '일광 해수욕장', lat: 35.2615, lng: 129.2322, shape: [[35.2580,129.2260],[35.2587,129.2382],[35.2652,129.2381],[35.2657,129.2268]] },
  { name: '임랑 해수욕장', lat: 35.3157, lng: 129.2632, shape: [[35.3126,129.2579],[35.3131,129.2690],[35.3187,129.2694],[35.3191,129.2585]] }
];

function updateBeachRiskZones(reports = []) {
  if (!currentMap || typeof L === 'undefined') return;
  if (!beachRiskLayer) beachRiskLayer = L.layerGroup().addTo(currentMap);
  beachRiskLayer.clearLayers();
  const colors = { safe: '#28a567', watch: '#e3b72f', alert: '#df4c4c' };
  beachRiskZones.forEach((beach) => {
    const count = reports.filter((report) => report.latitude && report.longitude && distanceInMeters(beach.lat, beach.lng, Number(report.latitude), Number(report.longitude)) <= 3500).length;
    const level = count >= 3 ? 'alert' : count >= 1 ? 'watch' : 'safe';
    const levelName = level === 'alert' ? '주의' : level === 'watch' ? '관찰' : '안전';
    const color = colors[level];
    L.polygon(beach.shape, {
      color, weight: 2, fillColor: color, fillOpacity: 0.38, interactive: true
    }).bindPopup(`<div class="beach-risk-popup"><strong>${beach.name}</strong><b class="risk-${level}">해파리 위험도: ${levelName}</b><small>최근 실시간 신고 ${count}건을 반영했습니다.</small></div>`).addTo(beachRiskLayer);
  });
}

function initRealMap() {
  const mapElement = document.querySelector('.map-card');
  if (!mapElement || typeof L === 'undefined') return;
  mapElement.insertAdjacentHTML('afterend', '<div class="care-map-legend" aria-label="지도 의료시설 마커 범례"><span><i class="care-legend-icon hospital-legend-icon" aria-hidden="true"></i><b>응급실</b><small>빨간 십자가</small></span><span><i class="care-legend-icon health-legend-icon" aria-hidden="true"></i><b>피부과</b><small>초록 십자가</small></span></div>');
  mapElement.innerHTML = '<div id="realMap" aria-label="부산 해안 지도"></div>';
  const koreaBounds = L.latLngBounds([32.8, 123.5], [39.8, 132.5]);
  currentMap = L.map('realMap', {
    zoomAnimation: false,
    fadeAnimation: false,
    markerZoomAnimation: false,
    zoomSnap: 1,
    zoomDelta: 1,
    inertia: true,
    inertiaDeceleration: 4200,
    inertiaMaxSpeed: 3000,
    wheelDebounceTime: 20,
    wheelPxPerZoomLevel: 90,
    maxBounds: koreaBounds,
    maxBoundsViscosity: 1,
    minZoom: 7,
    maxZoom: 16,
    worldCopyJump: false,
    zoomControl: false
  }).setView([35.1796, 129.0756], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 16,
    noWrap: true,
    bounds: koreaBounds
  }).addTo(currentMap);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    attribution: '', subdomains: 'abcd', maxZoom: 16, noWrap: true, bounds: koreaBounds, pane: 'overlayPane'
  }).addTo(currentMap);
    updateBeachRiskZones();
    addNearbyCareMarkers(true);
}

initRealMap();
window.addEventListener('load', () => setTimeout(refreshPreciseLocation, 350), { once: true });


// JellyDex: GitHub Pages에서도 동작하는 브라우저 저장형 수집 게임
const JELLY_COLORS = ['빨강', '주황', '노랑', '초록', '하늘색', '파랑', '보라', '분홍', '흰색'];
const SHOP_ITEMS = [
  ['산호', 50, '자연 장식'], ['해초', 50, '자연 장식'], ['조개', 50, '자연 장식'], ['불가사리', 70, '자연 장식'], ['진주 조개', 100, '자연 장식'],
  ['조개 침대', 100, '가구'], ['해초 소파', 120, '가구'], ['산호 의자', 120, '가구'], ['조개 테이블', 100, '가구'], ['보물상자', 150, '가구'], ['미니 등대', 200, '가구'],
  ['기본 조명', 50, '조명'], ['블루 조명', 100, '조명'], ['핑크 조명', 100, '조명'], ['오로라 조명', 250, '조명'], ['네온 조명', 300, '조명'],
  ['얕은 바다', 100, '배경'], ['산호초', 200, '배경'], ['심해', 300, '배경'], ['야간 바다', 300, '배경'], ['부산 광안리 테마', 500, '배경']
];
const TANK_CAPACITY = [5, 10, 15, 20, 30];
const jellyDexStorageKey = () => `jellydex_state_${window.jellyDexUser?.uid || 'guest'}`;
let jellyDexState = JSON.parse(localStorage.getItem(jellyDexStorageKey()) || 'null') || { coins: 0, tankLevel: 1, jellies: [], items: [] };
const saveJellyDex = () => {
  localStorage.setItem(jellyDexStorageKey(), JSON.stringify(jellyDexState));
  if (window.jellyDexUser?.uid && window.jellyFirebase?.saveGameState) {
    window.jellyFirebase.saveGameState(window.jellyDexUser.uid, jellyDexState).catch((error) => console.warn('게임 저장 실패:', error));
  }
};
window.jellyDexApplyCloudState = (remote) => {
  if (!remote) return;
  jellyDexState = { coins: 0, tankLevel: 1, jellies: [], items: [], ...remote };
  localStorage.setItem(jellyDexStorageKey(), JSON.stringify(jellyDexState));
};
const jellydexContent = document.querySelector('#jellydexContent');
const jellyfishMarkup = (jelly, extra = '') => `<button class="pixel-jelly jelly-${jelly.colorIndex}" data-jelly-id="${jelly.id}" style="--jelly-scale:${1 + jelly.affection / 250}" aria-label="${jelly.name} 쓰다듬기"><span class="pixel-cap"></span><i></i><i></i><i></i><i></i></button><strong class="jelly-name">${jelly.name}</strong>${extra}`;
function renderGame(tab = 'home') {
  document.querySelector('#coinCount').textContent = jellyDexState.coins;
  const capacity = TANK_CAPACITY[jellyDexState.tankLevel - 1];
  if (tab === 'home') {
    jellydexContent.innerHTML = `<section class="game-hero"><div><span class="pixel-kicker">DAILY DISCOVERY</span><h3>부산 바다에서<br><em>새 친구를 찾아요!</em></h3><p>해파리 사진을 인증하면 픽셀 해파리와 100코인을 받아요.</p><label class="scan-upload"><input id="jellyScan" type="file" accept="image/*"><span><i class="pixel-camera-icon" aria-hidden="true"></i> 사진으로 해파리 인증</span></label><small id="scanStatus">AI 인증 대기 중 · 사진을 올려보세요</small></div><div class="game-orb"><span class="pixel-jelly-icon pixel-jelly-icon-large" aria-hidden="true"></span><b>+100</b></div></section><section class="game-section"><div class="game-section-title"><h3>내 수조</h3><button data-game-tab="tank">모두 보기 <i class="pixel-arrow" aria-hidden="true"></i></button></div><div class="mini-tank">${jellyDexState.jellies.slice(0, 5).map(j => `<div class="jelly-card">${jellyfishMarkup(j)}</div>`).join('') || '<p class="empty-state">아직 해파리가 없어요. 첫 친구를 만나보세요!</p>'}</div></section>`;
    document.querySelector('#jellyScan')?.addEventListener('change', authenticateJelly);
  } else if (tab === 'tank') {
    jellydexContent.innerHTML = `<section class="game-section"><div class="game-section-title"><div><span class="pixel-kicker">AQUARIUM LV.${jellyDexState.tankLevel}</span><h3>나의 수조 <small>${jellyDexState.jellies.length}/${capacity}</small></h3></div><button class="upgrade-button" ${jellyDexState.tankLevel >= 5 ? 'disabled' : ''} data-upgrade-tank>수조 업그레이드<br><b><i class="pixel-coin-icon" aria-hidden="true"></i> 300</b></button></div><div class="tank-scene">${jellyDexState.jellies.map(j => `<div class="tank-jelly" data-jelly-id="${j.id}">${jellyfishMarkup(j, `<span class="affection"><i class="pixel-heart" aria-hidden="true"></i> ${j.affection}</span>`)}</div>`).join('') || '<p class="empty-state">수조가 비어 있어요.</p>'}</div></section>`;
    document.querySelector('[data-upgrade-tank]')?.addEventListener('click', upgradeTank);
    document.querySelectorAll('[data-jelly-id]').forEach(el => el.addEventListener('click', () => openJellyActions(el.dataset.jellyId)));
  } else if (tab === 'dex') {
    jellydexContent.innerHTML = `<section class="game-section"><div class="game-section-title"><div><span class="pixel-kicker">COLLECTION</span><h3>해파리 도감 <small>${jellyDexState.jellies.length}종</small></h3></div></div><div class="dex-grid">${jellyDexState.jellies.map(j => `<article class="dex-card">${jellyfishMarkup(j)}<small>${j.acquiredAt} · ${j.color}</small><span>친밀도 ${j.affection} · ${j.stage}</span></article>`).join('') || '<p class="empty-state">인증한 해파리가 자동으로 등록됩니다.</p>'}</div></section>`;
  } else if (tab === 'shop') {
    jellydexContent.innerHTML = `<section class="game-section"><div class="game-section-title"><div><span class="pixel-kicker">AQUARIUM SHOP</span><h3>수조 상점</h3></div></div><div class="shop-grid">${SHOP_ITEMS.map(([name, price, category]) => `<button class="shop-item" data-shop-name="${name}" data-shop-price="${price}"><span class="pixel-shop-art shop-${category === '자연 장식' ? 'nature' : category === '가구' ? 'furniture' : category === '조명' ? 'light' : 'sea'}" aria-hidden="true"></span><b>${name}</b><small><i class="pixel-coin-icon" aria-hidden="true"></i> ${price}</small></button>`).join('')}</div></section>`;
    document.querySelectorAll('[data-shop-name]').forEach(el => el.addEventListener('click', () => buyItem(el.dataset.shopName, Number(el.dataset.shopPrice))));
  } else {
    jellydexContent.innerHTML = `<section class="profile-card"><div class="avatar"><span class="pixel-explorer" aria-hidden="true"></span></div><span class="pixel-kicker">JELLY TRAINER</span><h3>바다 탐험가</h3><p>해파리 ${jellyDexState.jellies.length}마리 · 수조 레벨 ${jellyDexState.tankLevel}</p><div class="profile-stats"><span><b>${jellyDexState.coins}</b>코인</span><span><b>${jellyDexState.items.length}</b>장식</span></div></section>`;
  }
  document.querySelectorAll('[data-game-tab]').forEach(btn => btn.onclick = () => { document.querySelectorAll('.jellydex-tabs button').forEach(b => b.classList.toggle('active', b.dataset.gameTab === btn.dataset.gameTab)); renderGame(btn.dataset.gameTab); });
}
function authenticateJelly(event) {
  const file = event.target.files[0]; if (!file) return;
  const status = document.querySelector('#scanStatus'); status.textContent = 'AI가 사진 속 해파리를 분석하는 중…';
  setTimeout(() => { const colorIndex = Math.floor(Math.random() * JELLY_COLORS.length); const jelly = { id: crypto.randomUUID?.() || `${Date.now()}`, name: `Jelly ${jellyDexState.jellies.length + 1}`, color: JELLY_COLORS[colorIndex], colorIndex, affection: 10, stage: '아기', acquiredAt: new Date().toLocaleDateString('ko-KR') }; if (jellyDexState.jellies.length >= TANK_CAPACITY[jellyDexState.tankLevel - 1]) { status.textContent = '수조가 가득 찼어요. 먼저 업그레이드해 주세요.'; return; } jellyDexState.jellies.push(jelly); jellyDexState.coins += 100; saveJellyDex(); status.textContent = `인증 성공! ${jelly.name} 획득 · +100코인`; renderGame('home'); showToast('새로운 해파리와 100코인을 획득했어요!'); }, 1100);
}
function upgradeTank() { if (jellyDexState.tankLevel >= 5 || jellyDexState.coins < 300) return showToast('수조 업그레이드에는 300코인이 필요해요.'); jellyDexState.coins -= 300; jellyDexState.tankLevel += 1; saveJellyDex(); renderGame('tank'); }
function buyItem(name, price) { if (jellyDexState.coins < price) return showToast('코인이 부족해요.'); jellyDexState.coins -= price; jellyDexState.items.push(name); saveJellyDex(); renderGame('shop'); showToast(`${name}을(를) 수조에 추가했어요!`); }
function openJellyActions(id) { const jelly = jellyDexState.jellies.find(item => item.id === id); if (!jelly) return; const action = prompt(`${jelly.name}에게 무엇을 할까요?\n1. 먹이 주기\n2. 쓰다듬기\n3. 놀아주기`, '2'); if (action && ['1', '2', '3'].includes(action)) { jelly.affection = Math.min(100, jelly.affection + 10); jelly.stage = jelly.affection >= 70 ? '성체' : jelly.affection >= 35 ? '성장기' : '아기'; saveJellyDex(); renderGame('tank'); showToast(`♥ ${jelly.name}의 친밀도가 올랐어요!`); } }
document.querySelector('#jellydexLaunch').addEventListener('click', () => { if (!window.jellyDexUser) return; document.querySelector('#jellydexOverlay').classList.add('open'); document.querySelector('#jellydexOverlay').setAttribute('aria-hidden', 'false'); renderGame('home'); });
document.querySelector('#jellydexClose').addEventListener('click', () => { document.querySelector('#jellydexOverlay').classList.remove('open'); document.querySelector('#jellydexOverlay').setAttribute('aria-hidden', 'true'); });
