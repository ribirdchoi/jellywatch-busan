const toast = document.querySelector('#toast');
const showToast = (message) => { toast.textContent = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3200); };
let currentLocation = null;
let currentMap = null;
let currentUserMarker = null;
const locationOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
const locationStatus = document.querySelector('#locationStatus');

function updateLocationStatus(position) {
  currentLocation = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: Math.round(position.coords.accuracy) };
  if (locationStatus) locationStatus.textContent = `⌖ 위치 확인 완료 · 정확도 약 ${currentLocation.accuracy}m`;
  if (currentMap && typeof L !== 'undefined') {
    if (currentUserMarker) currentUserMarker.setLatLng([currentLocation.lat, currentLocation.lng]);
    else currentUserMarker = L.circleMarker([currentLocation.lat, currentLocation.lng], { radius: 8, color: '#16313d', fillColor: '#95e7e0', fillOpacity: 1 }).addTo(currentMap);
    currentMap.setView([currentLocation.lat, currentLocation.lng], 16);
  }
}
function refreshPreciseLocation() {
  if (!navigator.geolocation) { if (locationStatus) locationStatus.textContent = '⌖ 이 기기에서는 GPS를 사용할 수 없습니다'; return; }
  if (locationStatus) locationStatus.textContent = '⌖ 고정밀 GPS 위치를 확인하는 중…';
  navigator.geolocation.getCurrentPosition(updateLocationStatus, () => { if (locationStatus) locationStatus.textContent = '⌖ 위치 권한을 허용하면 정확한 신고가 가능합니다'; }, locationOptions);
}

document.querySelector('#photoInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) { document.querySelector('#uploadTitle').textContent = file.name; document.querySelector('#uploadHint').textContent = '사진이 추가되었습니다'; refreshPreciseLocation(); }
});
document.querySelector('#reportForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!currentLocation) { showToast('정확한 위치를 확인한 뒤 다시 신고해 주세요.'); refreshPreciseLocation(); return; }
  showToast(`신고 접수 완료 · 위치 정확도 약 ${currentLocation.accuracy}m`);
  event.target.reset(); document.querySelector('#uploadTitle').textContent = '사진을 추가해주세요'; document.querySelector('#uploadHint').textContent = '촬영 시 GPS 위치도 함께 기록됩니다';
});
document.querySelector('#locateBtn').addEventListener('click', refreshPreciseLocation);
document.querySelector('#mapLocate').addEventListener('click', refreshPreciseLocation);

const beachSpots = [
  { name: '광안리 해수욕장', lat: 35.1532, lng: 129.1188 },
  { name: '해운대 해수욕장', lat: 35.1587, lng: 129.1603 },
  { name: '송정 해수욕장', lat: 35.1789, lng: 129.1990 }
];
const carePlaces = [
  { name: '인제대학교 해운대백병원 응급의료센터', type: '응급실', lat: 35.1741, lng: 129.1839, tel: '051-797-0100' },
  { name: '해운대부민병원 응급실', type: '응급실', lat: 35.1634, lng: 129.1632, tel: '051-602-8000' },
  { name: '수영구보건소', type: '보건소', lat: 35.1456, lng: 129.1130, tel: '051-752-4000' },
  { name: '해운대구보건소', type: '보건소', lat: 35.1632, lng: 129.1635, tel: '051-746-4000' }
];

function initRealMap() {
  const oldMap = document.querySelector('.map-card');
  if (!oldMap || typeof L === 'undefined') return;
  oldMap.innerHTML = '<div id="realMap" aria-label="부산 해안선과 주변 의료시설 지도"></div><div class="map-legend real-legend"><span><i class="dot red"></i>응급실</span><span><i class="dot yellow"></i>보건소</span><span><i class="dot blue"></i>해수욕장</span></div>';
  const map = L.map('realMap', { zoomControl: false }).setView([35.1587, 129.1603], 12); currentMap = map;
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const beachIcon = L.divIcon({ className: 'leaflet-pin beach-pin', html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
  const careIcon = (type) => L.divIcon({ className: `leaflet-pin ${type === '응급실' ? 'hospital-pin' : 'clinic-pin'}`, html: '<span></span>', iconSize: [18, 18], iconAnchor: [9, 9] });
  beachSpots.forEach((spot) => L.marker([spot.lat, spot.lng], { icon: beachIcon }).addTo(map).bindPopup(`<strong>${spot.name}</strong><br>해파리 신고 기준 위치`));
  carePlaces.forEach((place) => L.marker([place.lat, place.lng], { icon: careIcon(place.type) }).addTo(map).bindPopup(`<strong>${place.name}</strong><br>${place.type} · <a href="tel:${place.tel}">${place.tel}</a>`));
  map.on('locationfound', (event) => updateLocationStatus({ coords: { latitude: event.latlng.lat, longitude: event.latlng.lng, accuracy: event.accuracy } }));
  map.on('locationerror', () => showToast('위치 권한을 허용하면 현재 위치를 지도에 표시할 수 있어요.'));
}
initRealMap();
refreshPreciseLocation();
