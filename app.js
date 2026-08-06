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
    const icon = L.divIcon({ className: `care-marker ${iconClass}`, html: '<span></span>', iconSize: [24, 24], iconAnchor: [12, 12] });
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
  mapElement.innerHTML = '<div id="realMap" aria-label="부산 해안 지도"></div>';
  currentMap = L.map('realMap').setView([35.1587, 129.1603], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(currentMap);
  addNearbyCareMarkers();
}

initRealMap();
refreshPreciseLocation();
