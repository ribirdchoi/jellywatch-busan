const toast = document.querySelector('#toast');
const showToast = (message) => {
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3200);
};

// 실제 지자체 접수 API가 생기면 이 주소를 배포 환경의 API 주소로 설정합니다.
const MUNICIPAL_REPORT_ENDPOINT = '';
const locationStatus = document.querySelector('#locationStatus');
const latitude = document.querySelector('#latitude');
const longitude = document.querySelector('#longitude');
const accuracy = document.querySelector('#accuracy');
let currentLocation = null;
let currentMap = null;
let currentUserMarker = null;
let currentLocationArrow = null;
let locationWatchId = null;
const locationOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };

function updateLocationStatus(position) {
  currentLocation = {
    latitude: Number(position.coords.latitude.toFixed(6)),
    longitude: Number(position.coords.longitude.toFixed(6)),
    accuracy: Math.round(position.coords.accuracy),
    measuredAt: new Date().toISOString()
  };
  latitude.textContent = currentLocation.latitude.toFixed(6);
  longitude.textContent = currentLocation.longitude.toFixed(6);
  accuracy.textContent = `${currentLocation.accuracy}m`;
  locationStatus.textContent = `⌖ 위치 확인 완료 · 오차 약 ${currentLocation.accuracy}m`;
  if (currentMap && typeof L !== 'undefined') {
    const point = [currentLocation.latitude, currentLocation.longitude];
    const heading = Number.isFinite(position.coords.heading) ? position.coords.heading : 0;
    if (currentLocationArrow) {
      currentLocationArrow.setLatLng(point);
      currentLocationArrow.setIcon(locationArrowIcon(heading));
    } else {
      currentLocationArrow = L.marker(point, { icon: locationArrowIcon(heading), zIndexOffset: 1000 }).addTo(currentMap);
    }
    if (currentUserMarker) currentUserMarker.setLatLng(point);
    else currentUserMarker = L.circleMarker(point, { radius: 8, color: '#16313d', fillColor: '#95e7e0', fillOpacity: 1 }).addTo(currentMap);
    currentMap.setView(point, 16);
  }
}

function refreshPreciseLocation() {
  if (!navigator.geolocation) {
    locationStatus.textContent = '⌖ 이 기기에서는 GPS를 사용할 수 없습니다';
    return;
  }
  locationStatus.textContent = '⌖ 고정밀 GPS 위치를 확인하는 중…';
  navigator.geolocation.getCurrentPosition(updateLocationStatus, () => {
    locationStatus.textContent = '⌖ 위치 권한을 허용하면 정확한 신고가 가능합니다';
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

document.querySelector('#photoInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    document.querySelector('#uploadTitle').textContent = file.name;
    document.querySelector('#uploadHint').textContent = '사진이 추가되었습니다 · GPS 위치를 함께 기록합니다';
    refreshPreciseLocation();
  }
});

document.querySelector('#reportForm').addEventListener('submit', async (event) => {
  event.preventDefault();
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

document.querySelector('#locateBtn').addEventListener('click', refreshPreciseLocation);
document.querySelector('#mapLocate').addEventListener('click', refreshPreciseLocation);

const nearbyCarePlaces = [
  { name: '광안리 보건소', type: '보건소', lat: 35.1539, lng: 129.1185, hours: '평일 09:00–18:00', openDays: [1, 2, 3, 4, 5], openStart: 9, openEnd: 18, tel: '051-000-0000' },
  { name: '수영구 보건소', type: '보건소', lat: 35.1456, lng: 129.1130, hours: '평일 09:00–18:00', openDays: [1, 2, 3, 4, 5], openStart: 9, openEnd: 18, tel: '051-752-4000' },
  { name: '좋은강안병원', type: '병원', lat: 35.1538, lng: 129.1122, hours: '24시간 응급실 운영', openDays: [0, 1, 2, 3, 4, 5, 6], openStart: 0, openEnd: 24, tel: '051-625-0900' },
  { name: '부산성모병원', type: '병원', lat: 35.1328, lng: 129.1112, hours: '24시간 응급실 운영', openDays: [0, 1, 2, 3, 4, 5, 6], openStart: 0, openEnd: 24, tel: '051-933-7114' }
];

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
  const now = new Date();
  return place.openDays.includes(now.getDay()) && now.getHours() >= place.openStart && now.getHours() < place.openEnd;
}

function addNearbyCareMarkers() {
  if (!currentMap) return;
  nearbyCarePlaces.forEach((place) => {
    const iconClass = place.type === '병원' ? 'hospital-pin' : 'health-center-pin';
    const icon = L.divIcon({ className: `care-marker ${iconClass}`, html: '<span aria-hidden="true"></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
    const marker = L.marker([place.lat, place.lng], { icon }).addTo(currentMap);
    const renderPopup = () => {
      const distance = currentLocation ? distanceInMeters(currentLocation.latitude, currentLocation.longitude, place.lat, place.lng) : null;
      const open = isCurrentlyOpen(place);
      marker.bindPopup(`<div class="care-popup"><strong>${place.name}</strong><span class="care-type">${place.type}</span><b class="open-status ${open ? 'is-open' : 'is-closed'}">${open ? '현재 운영 중' : '현재 운영 종료'}</b><small>${place.hours}</small>${distance === null ? '' : `<small>내 위치에서 약 ${(distance / 1000).toFixed(1)}km</small>`}<a href="tel:${place.tel}">${place.tel}</a></div>`).openPopup();
    };
    marker.on('click', renderPopup);
  });
}

function initRealMap() {
  const mapElement = document.querySelector('.map-card');
  if (!mapElement || typeof L === 'undefined') return;
  mapElement.insertAdjacentHTML('afterend', '<div class="care-map-legend" aria-label="지도 의료시설 마커 범례"><span><i class="care-legend-icon hospital-legend-icon" aria-hidden="true"></i><b>병원</b><small>빨간 십자가</small></span><span><i class="care-legend-icon health-legend-icon" aria-hidden="true"></i><b>보건소</b><small>초록 십자가</small></span></div>');
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
    worldCopyJump: false
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
  L.circle([35.1796, 129.0756], { radius: 30000, color: '#477e98', weight: 2, fillColor: '#78b9cc', fillOpacity: 0.22, interactive: false }).addTo(currentMap);
  addNearbyCareMarkers();
}


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
