(function () {
  const card = document.querySelector('.map-card');
  if (!card || typeof L === 'undefined') return;
  const map = L.map(card).setView([35.1587, 129.1603], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
  const layer = L.layerGroup().addTo(map), userLayer = L.layerGroup().addTo(map), places = [];
  let user = null;
  const radius = 1000;
  const status = document.createElement('p'); status.className = 'care-filter-note';
  const button = document.createElement('button'); button.type = 'button'; button.className = 'care-locate-btn'; button.textContent = '내 위치 다시 확인하기';
  card.insertAdjacentElement('afterend', status); status.insertAdjacentElement('afterend', button);
  card.insertAdjacentHTML('afterend', '<div class="care-map-legend"><span><i class="care-legend-icon hospital-legend-icon"></i><b>주요 병원</b></span><span><i class="care-legend-icon health-legend-icon"></i><b>보건소</b></span></div>');
  const distance = (a,b) => { const r=Math.PI/180, dLat=(b.lat-a.lat)*r, dLng=(b.lng-a.lng)*r; const x=Math.sin(dLat/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLng/2)**2; return 6371000*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x)); };
  const icon = (type) => L.divIcon({ className: `care-marker ${type === '병원' ? 'hospital-pin' : 'health-center-pin'}`, html:'<span aria-hidden="true"></span>', iconSize:[32,32], iconAnchor:[16,16] });
  function draw() {
    layer.clearLayers(); if (!user) return;
    const nearby=places.filter((p)=>distance(user,p)<=radius);
    nearby.forEach((p)=>{ const meters=Math.round(distance(user,p)); const open=p.type==='병원'||(new Date().getDay()>0&&new Date().getDay()<6&&new Date().getHours()>=9&&new Date().getHours()<18); L.marker([p.lat,p.lng],{icon:icon(p.type)}).addTo(layer).bindPopup(`<div class="care-popup"><strong>${p.name}</strong><span class="care-type">${p.type}</span><b class="open-status ${open?'is-open':'is-closed'}">${open?'현재 운영 중':'현재 운영 종료'}</b><small>${p.address||'주소 정보 없음'}</small><small>내 위치에서 ${meters}m</small></div>`); });
    status.textContent=`내 위치 기준 반경 1km 이내 주요 병원·보건소 ${nearby.length}곳을 표시하고 있습니다.`;
  }
  function locate() {
    if (!navigator.geolocation) { status.textContent='이 기기에서는 위치 기능을 사용할 수 없습니다.'; return; }
    status.textContent='위치 권한을 확인하는 중입니다…'; button.disabled=true;
    navigator.geolocation.getCurrentPosition((pos)=>{ user={lat:pos.coords.latitude,lng:pos.coords.longitude}; userLayer.clearLayers(); L.marker([user.lat,user.lng],{icon:L.divIcon({className:'user-location-marker',html:'<span></span>',iconSize:[34,34],iconAnchor:[17,17]})}).addTo(userLayer); L.circle([user.lat,user.lng],{radius,color:'#e7473f',fillColor:'#e7473f',fillOpacity:.06,weight:1}).addTo(userLayer); map.setView([user.lat,user.lng],15); draw(); button.disabled=false; button.textContent='내 위치 다시 확인하기'; },()=>{ user=null; layer.clearLayers(); userLayer.clearLayers(); status.textContent='위치 권한이 차단되어 있습니다. 브라우저 주소창에서 이 사이트의 위치 권한을 허용한 뒤 다시 시도해 주세요.'; button.disabled=false; button.textContent='위치 권한 다시 요청하기'; },{enableHighAccuracy:true,maximumAge:0,timeout:15000});
  }
  button.addEventListener('click',locate); locate();
  const query='[out:json][timeout:25];(nwr[amenity=hospital](35.02,128.95,35.28,129.25);nwr[healthcare=centre](35.02,128.95,35.28,129.25););out center tags;';
  fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`).then((r)=>r.json()).then((data)=>{ data.elements.forEach((e)=>{ const t=e.tags||{}, center=t.healthcare==='centre'||t.public_healthcare==='yes'; places.push({lat:e.lat??e.center?.lat,lng:e.lon??e.center?.lon,name:t['name:ko']||t.name||(center?'보건소':'병원'),type:center?'보건소':'병원',address:t['addr:full']||t['addr:street']||''}); }); draw(); }).catch(()=>{ status.textContent='주요 병원·보건소 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'; });
}());
