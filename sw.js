/* Tarihin Bilgi Kapısı – çevrimdışı çalışma.
   onbellek.js dosyasını tools/onbellek_olustur.py üretir; içeriği değişince
   tarayıcı bu servis çalışanını kendiliğinden günceller. */
importScripts('onbellek.js');

var KABUK = 'tbk-kabuk-' + self.ONBELLEK.surum;
var GORSEL = 'tbk-gorsel';
var HARITA = 'tbk-harita';
var HARITA_SINIRI = 600;

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(KABUK)
      .then(function (kasa) { return kasa.addAll(self.ONBELLEK.dosyalar); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (adlar) {
      return Promise.all(adlar.map(function (ad) {
        if (ad.indexOf('tbk-kabuk-') === 0 && ad !== KABUK) return caches.delete(ad);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

function agdanAl(istek, kasaAdi, sinir) {
  return fetch(istek).then(function (yanit) {
    if (yanit.ok) {
      var kopya = yanit.clone();
      caches.open(kasaAdi).then(function (kasa) {
        kasa.put(istek, kopya);
        if (sinir) kasa.keys().then(function (k) { if (k.length > sinir) kasa.delete(k[0]); });
      });
    }
    return yanit;
  });
}

// Önce önbellek; yoksa ağdan al ve sakla. Değişmeyen dosyalar (görseller, harita karoları) için.
function onceOnbellek(istek, kasaAdi, sinir) {
  return caches.open(kasaAdi).then(function (kasa) {
    return kasa.match(istek).then(function (kayitli) { return kayitli || agdanAl(istek, kasaAdi, sinir); });
  });
}

// Önbellektekini hemen ver, arka planda yenisini indir. Bir sonraki açılışta güncel hâli gelir.
function onbellekVeYenile(istek, anahtar) {
  return caches.open(KABUK).then(function (kasa) {
    return kasa.match(anahtar || istek).then(function (kayitli) {
      var ag = fetch(istek).then(function (yanit) {
        if (yanit.ok) kasa.put(anahtar || istek, yanit.clone());
        return yanit;
      });
      if (!kayitli) return ag;
      ag.catch(function () { /* çevrimdışı */ });
      return kayitli;
    });
  });
}

self.addEventListener('fetch', function (e) {
  var istek = e.request;
  if (istek.method !== 'GET') return;
  var adres = new URL(istek.url);

  if (adres.origin === self.location.origin) {
    if (istek.mode === 'navigate') e.respondWith(onbellekVeYenile(istek, 'index.html'));
    else if (adres.pathname.indexOf('/assets/gorsel/') !== -1) e.respondWith(onceOnbellek(istek, GORSEL));
    else e.respondWith(onbellekVeYenile(istek));
  } else if (adres.hostname === 'tile.openstreetmap.org') {
    e.respondWith(onceOnbellek(istek, HARITA, HARITA_SINIRI));
  }
});
