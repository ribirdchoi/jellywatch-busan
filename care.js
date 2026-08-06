(function () {
  const mapCard = document.querySelector('.map-card');
  if (!mapCard || typeof L === 'undefined') return;

  const BUSAN_BBOX = '35.02,128.95,35.28,129.25';
  const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
  const toRad = value => value * Math.PI / 180;
  const distance = (a, b) => {
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const isHealthCenter = tags => tags.healthcare === 'centre' || tags.healthcare === 'clinic' || tags.amenity === 'clinic' || tags.public_healthcare === 'yes';
  const normalize = element => {
    const tags = element.tags || {};
    return {
      lat: element.lat ?? element.center?.lat,
      lng: element.lon ?? element.center?.lon,
      name: tags.name || tags['name:ko'] || (isHealthCenter(tags) ? '보건소' : '병원'),
      type: isHealthCenter(tags) ? '보건소' : '병원',
      tel: tags.phone || tags['contact:phone'] || '',
      address: tags['addr:full'] || [tags['addr:city'], tags['addr:district'], tags['addr:street']].filter(Boolean).join(' ')
    };
  };

  mapCard.innerHTML = '<div id="realMapDynamic" aria-label="부산 해안권 병원 및 보건소 지도"></div>';
  const map = L.map('realMapDynamic').setView([35.1587, 129.1603], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let allPlaces = [];
  let reportLocation = null;
  let locationReady = false;

  const render = places => {
    layer.clearLayers();
    places.forEach(place => {
      if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return;
      const cls = place.type === '병원' ? 'hospital-pin' : 'health-center-pin';
      const icon = L.divIcon({ className: `care-marker ${cls}`, html: '<span aria-hidden="true"></span>', iconSize: [32, 32], iconAnchor: [16, 16] });
      const marker = L.marker([place.lat, place.lng], { icon }).addTo(layer);
      marker.bindPopup(`<div class="care-popup"><strong>${place.name}</strong><span class="care-type">${place.type}</span>${place.address ? `<small>${place.address}</small>` : ''}${place.tel ? `<a href="tel:${place.tel}">${place.tel}</a>` : ''}</div>`);
    });
  };
  const updateFilter = () => {
    if (!reportLocation) return render(allPlaces);
    const nearby = allPlaces.filter(place => distance(reportLocation, place) <= 1000);
    render(nearby);
    const note = document.querySelector('.care-filter-note');
    if (note) note.textContent = `신고 위치 기준 반경 1km 이내 ${nearby.length}곳 표시 중`;
  };
  const loadPlaces = async () => {
    const query = `[out:json][timeout:25];(nwr[amenity=hospital](${BUSAN_BBOX});nwr[amenity=clinic](${BUSAN_BBOX});nwr[healthcare=centre](${BUSAN_BBOX});nwr[public_healthcare=yes](${BUSAN_BBOX}););out center tags;`;
    try {
      const response = await fetch(`${OVERPASS_URL}?data=${encodeURIComponent(query)}`);
      const data = await response.json();
      allPlaces = data.elements.map(normalize).filter(place => Number.isFinite(place.lat) && Number.isFinite(place.lng));
      updateFilter();
      const note = document.querySelector('.care-filter-note');
      if (note) note.textContent = `부산 해안권 병원·보건소 ${allPlaces.length}곳 표시 중`;
    } catch {
      const note = document.querySelector('.care-filter-note');
      if (note) note.textContent = '의료시설 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
    }
  };

  mapCard.insertAdjacentHTML('afterend', '<div class="care-map-legend"><span><i class="care-legend-icon hospital-legend-icon"></i><b>병원</b><small>빨간 십자가</small></span><span><i class="care-legend-icon health-legend-icon"></i><b>보건소</b><small>초록 십자가</small></span><small class="care-filter-note">의료시설 정보를 불러오는 중…</small></div>');
  const requestLocation = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(position => {
      reportLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      locationReady = true;
      map.setView([reportLocation.lat, reportLocation.lng], 15);
      const note = document.querySelector('.care-filter-note');
      if (note) note.textContent = '현재 위치 확인 완료 · 반경 1km 이내 시설만 표시합니다.';
      resolve(true);
    }, () => resolve(false), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
  document.querySelector('#reportForm')?.addEventListener('submit', event => {
    navigator.geolocation?.getCurrentPosition(position => {
      reportLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
      map.setView([reportLocation.lat, reportLocation.lng], 15);
      updateFilter();
    }, () => updateFilter(), { enableHighAccuracy: true, timeout: 10000 });
  }, true);
  (async () => {
    const found = await requestLocation();
    const note = document.querySelector('.care-filter-note');
    if (!found && note) note.textContent = '위치 권한이 없어 부산 해안권 전체 시설을 표시합니다.';
    await loadPlaces();
    if (locationReady) updateFilter();
  })();
}());
