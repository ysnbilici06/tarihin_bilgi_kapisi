(function () {
  'use strict';

  var DONEMLER = window.DONEMLER || [];
  var GORSELLER = window.GORSELLER || {};
  var KONULAR = (window.KONULAR || []).slice().sort(function (a, b) { return a.baslangic - b.baslangic; });

  var icerik = document.getElementById('icerik');
  var aramaKutusu = document.getElementById('arama');
  var buyutec = document.getElementById('buyutec');
  var harita = null;
  var ONBELLEK = window.ONBELLEK || null;

  // ---------- Yardımcılar ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function kucuk(s) { return String(s).toLocaleLowerCase('tr'); }

  function konuBul(id) {
    for (var i = 0; i < KONULAR.length; i++) if (KONULAR[i].id === id) return KONULAR[i];
    return null;
  }

  function donemBul(id) {
    for (var i = 0; i < DONEMLER.length; i++) if (DONEMLER[i].id === id) return DONEMLER[i];
    return { ad: '', renk: '#8a3b1f' };
  }

  // Tarayıcı deposu kapalı olabilir (gizli pencere vb.); uygulama onsuz da çalışmalı.
  var depo = {
    oku: function (anahtar, varsayilan) {
      try {
        var ham = localStorage.getItem('tbk:' + anahtar);
        return ham ? JSON.parse(ham) : varsayilan;
      } catch (e) { return varsayilan; }
    },
    yaz: function (anahtar, deger) {
      try { localStorage.setItem('tbk:' + anahtar, JSON.stringify(deger)); } catch (e) { /* yok say */ }
    }
  };

  var favoriler = depo.oku('favoriler', []);
  var okunanlar = depo.oku('okunanlar', []);
  var sonKonu = depo.oku('sonKonu', null);

  function icinde(dizi, id) { return dizi.indexOf(id) !== -1; }

  function degistir(dizi, id, anahtar) {
    var sira = dizi.indexOf(id);
    if (sira === -1) dizi.push(id); else dizi.splice(sira, 1);
    depo.yaz(anahtar, dizi);
    return sira === -1;
  }

  function resim(wiki, yazi, sinif) {
    var g = GORSELLER[wiki];
    if (!g) return '';
    return '<img src="' + esc(g.src) + '" alt="' + esc(yazi || '') + '" loading="lazy"' +
      (sinif ? ' class="' + sinif + '"' : '') + ' data-buyut="' + esc(wiki) + '">';
  }

  function kunyeMetni(g) {
    var parcalar = [];
    if (g.sahip) parcalar.push(esc(g.sahip));
    if (g.lisans) parcalar.push(esc(g.lisans));
    return 'Görsel: ' + (parcalar.join(' · ') || 'Wikimedia Commons') +
      (g.kaynak ? ' · <a href="' + esc(g.kaynak) + '" target="_blank" rel="noopener">Wikimedia Commons</a>' : '');
  }

  function sekil(gorsel) {
    if (!gorsel || !GORSELLER[gorsel.wiki]) return '';
    return '<figure>' + resim(gorsel.wiki, gorsel.yazi) + '<figcaption>' + esc(gorsel.yazi) + '</figcaption></figure>';
  }

  // Metindeki [1] işaretlerini kaynak listesine giden üst simgelere çevirir.
  function paragraf(metin) {
    return esc(metin).replace(/\s*((?:\[\d+\])+)/g, function (_, grup) {
      return '<sup class="atif">' + grup.replace(/\[(\d+)\]/g, '<a href="#kaynak-$1" data-kaynak="$1">[$1]</a>') + '</sup>';
    });
  }

  function favDugmesi(id) {
    var secili = icinde(favoriler, id);
    return '<button class="fav" type="button" data-fav="' + esc(id) + '" aria-pressed="' + secili + '" ' +
      'aria-label="Favorilere ekle veya çıkar" title="Favori">' + (secili ? '♥' : '♡') + '</button>';
  }

  function kart(konu) {
    return '<article class="kart">' +
      '<a href="#/konu/' + esc(konu.id) + '">' +
        '<div class="kart-gorsel">' + resim(konu.kapak, '') + '</div>' +
        '<div class="kart-govde">' +
          '<div class="kart-tarih">' + esc(konu.tarih) + '</div>' +
          '<h3>' + esc(konu.baslik) + '</h3>' +
          '<p>' + esc(konu.ozet) + '</p>' +
        '</div>' +
      '</a>' +
      (icinde(okunanlar, konu.id) ? '<span class="rozet">✓ Okundu</span>' : '') +
      favDugmesi(konu.id) +
    '</article>';
  }

  function konuMetni(konu) {
    var parcalar = [konu.baslik, konu.ozet, konu.tarih, konu.tartisma ? konu.tartisma.baslik + ' ' + konu.tartisma.metin : ''];
    (konu.bolumler || []).forEach(function (b) { parcalar.push(b.baslik, b.metin.join(' ')); });
    (konu.bilgiler || []).forEach(function (b) { parcalar.push(b[1]); });
    (konu.olaylar || []).forEach(function (o) { parcalar.push(o.metin); });
    (konu.galeri || []).forEach(function (g) { parcalar.push(g.yazi); });
    return kucuk(parcalar.join(' '));
  }

  // ---------- Sayfalar ----------
  function anaSayfa() {
    var sorgu = kucuk(aramaKutusu.value.trim());
    if (sorgu) {
      var bulunan = KONULAR.filter(function (k) { return konuMetni(k).indexOf(sorgu) !== -1; });
      return '<div class="sayfa-bas"><h1>Arama sonuçları</h1><p>“' + esc(aramaKutusu.value.trim()) + '” için ' +
        bulunan.length + ' konu bulundu.</p></div>' +
        (bulunan.length ? '<div class="izgara">' + bulunan.map(kart).join('') + '</div>'
          : '<div class="bos">Sonuç bulunamadı. Başka bir kelime deneyin; örneğin “Malazgirt” veya “anayasa”.</div>');
    }

    var kaynakSayisi = 0;
    KONULAR.forEach(function (k) { kaynakSayisi += (k.kaynaklar || []).length; });
    var kapak = GORSELLER['Süleymaniye Camii'] || GORSELLER[KONULAR.length ? KONULAR[0].kapak : ''];

    var html = '<section class="karsilama"' + (kapak ? ' style="background-image:url(\'' + esc(encodeURI(kapak.src)) + '\')"' : '') + '>' +
      '<div class="karsilama-ic">' +
        '<h1>Türk tarihine açılan kapı</h1>' +
        '<p>Bozkırdan Cumhuriyet\'e iki bin yıllık yolculuk: kısa, anlaşılır ve her bilgisi akademik kaynaklara dayalı.</p>' +
        '<div class="sayilar">' +
          '<span><b>' + KONULAR.length + '</b>konu</span>' +
          '<span><b>' + Object.keys(GORSELLER).length + '</b>görsel</span>' +
          '<span><b>' + kaynakSayisi + '</b>akademik kaynak</span>' +
          '<span><b>' + okunanlar.length + '/' + KONULAR.length + '</b>okundu</span>' +
        '</div>' +
      '</div></section>';

    var son = sonKonu && konuBul(sonKonu);
    if (son) {
      html += '<a class="devam" href="#/konu/' + esc(son.id) + '">' + resim(son.kapak, '') +
        '<span><small>Kaldığın yerden devam et</small><strong>' + esc(son.baslik) + '</strong></span><span class="ok">→</span></a>';
    }

    DONEMLER.forEach(function (d) {
      var konular = KONULAR.filter(function (k) { return k.donem === d.id; });
      if (!konular.length) return;
      html += '<section class="donem" style="--renk:' + esc(d.renk) + '">' +
        '<div class="donem-bas"><div class="yil">' + esc(d.yillar) + '</div><h2>' + esc(d.ad) + '</h2><p>' + esc(d.aciklama) + '</p></div>' +
        '<div class="izgara">' + konular.map(kart).join('') + '</div></section>';
    });
    return html;
  }

  function konuSayfasi(konu) {
    var sira = KONULAR.indexOf(konu);
    var onceki = KONULAR[sira - 1];
    var sonraki = KONULAR[sira + 1];
    var kullanilan = [];
    function kaydet(wiki) { if (GORSELLER[wiki] && kullanilan.indexOf(wiki) === -1) kullanilan.push(wiki); }

    kaydet(konu.kapak);
    var html = '<article class="konu">' +
      '<a class="geri" href="#/">← Tüm konular</a>' +
      (GORSELLER[konu.kapak] ? '<div class="konu-kapak">' + resim(konu.kapak, konu.baslik) + '</div>' : '') +
      '<header class="konu-ust">' +
        '<div class="yil">' + esc(donemBul(konu.donem).ad) + ' · ' + esc(konu.tarih) + '</div>' +
        '<h1>' + esc(konu.baslik) + '</h1>' +
        '<p class="ozet">' + esc(konu.ozet) + '</p>' +
        '<div class="eylemler">' +
          '<button class="dugme" type="button" data-fav="' + esc(konu.id) + '" aria-pressed="' + icinde(favoriler, konu.id) + '">' +
            (icinde(favoriler, konu.id) ? '♥ Favorilerde' : '♡ Favorilere ekle') + '</button>' +
          '<button class="dugme" type="button" data-okundu="' + esc(konu.id) + '" aria-pressed="' + icinde(okunanlar, konu.id) + '">' +
            (icinde(okunanlar, konu.id) ? '✓ Okundu' : 'Okundu olarak işaretle') + '</button>' +
          '<a class="dugme" href="#test">Kendini dene ↓</a>' +
        '</div>' +
      '</header>';

    html += '<ul class="bilgiler">' + (konu.bilgiler || []).map(function (b) {
      return '<li><span>' + esc(b[0]) + '</span><b>' + esc(b[1]) + '</b></li>';
    }).join('') + '</ul>';

    (konu.bolumler || []).forEach(function (b) {
      if (b.gorsel) kaydet(b.gorsel.wiki);
      html += '<section class="bolum"><h2>' + esc(b.baslik) + '</h2>' +
        b.metin.map(function (m) { return '<p>' + paragraf(m) + '</p>'; }).join('') +
        sekil(b.gorsel) + '</section>';
    });

    if (konu.tartisma) {
      html += '<aside class="tartisma"><div class="etiket">Tarihçiler ne diyor?</div>' +
        '<h2>' + esc(konu.tartisma.baslik) + '</h2><p>' + paragraf(konu.tartisma.metin) + '</p></aside>';
    }

    var galeri = (konu.galeri || []).filter(function (g) { return GORSELLER[g.wiki]; });
    if (galeri.length) {
      galeri.forEach(function (g) { kaydet(g.wiki); });
      html += '<section class="blok"><h2>Görseller</h2><div class="galeri">' + galeri.map(sekil).join('') + '</div></section>';
    }

    html += '<section class="blok"><h2>Kısaca ne zaman, ne oldu?</h2><ol class="kronoloji">' +
      (konu.olaylar || []).map(function (o) { return '<li><b>' + esc(o.etiket) + '</b>' + esc(o.metin) + '</li>'; }).join('') +
      '</ol></section>';

    html += '<section class="blok" id="test"><h2>Kendini dene</h2>' +
      (konu.test || []).map(function (s, i) {
        return '<div class="soru" data-soru="' + i + '"><h3>' + (i + 1) + '. ' + esc(s.soru) + '</h3>' +
          s.secenekler.map(function (sec, j) {
            return '<button class="secenek" type="button" data-secenek="' + j + '">' + esc(sec) + '</button>';
          }).join('') + '</div>';
      }).join('') + '<div id="test-sonuc"></div></section>';

    html += '<section class="blok"><h2>Kaynaklar</h2><ol class="kaynaklar">' +
      (konu.kaynaklar || []).map(function (k, i) {
        var ara = 'https://scholar.google.com/scholar?q=' + encodeURIComponent(k.yazar.replace(/\(.*?\)/g, '') + ' ' + k.eser);
        return '<li id="kaynak-' + (i + 1) + '">' + esc(k.yazar) + ' (' + esc(k.yil) + '). <em>' + esc(k.eser) + '</em>. ' +
          esc(k.yayin) + '. <a href="' + esc(ara) + '" target="_blank" rel="noopener">Akademik\'te ara ↗</a></li>';
      }).join('') + '</ol>' +
      '<details class="kunye"><summary>Görsel künyeleri (' + kullanilan.length + ')</summary><ul>' +
      kullanilan.map(function (w) { return '<li>' + kunyeMetni(GORSELLER[w]) + '</li>'; }).join('') +
      '</ul></details></section>';

    html += '<nav class="gezinme" aria-label="Konular arası geçiş">' +
      (onceki ? '<a href="#/konu/' + esc(onceki.id) + '"><small>← Önceki konu</small><strong>' + esc(onceki.baslik) + '</strong></a>' : '') +
      (sonraki ? '<a class="sonraki" href="#/konu/' + esc(sonraki.id) + '"><small>Sonraki konu →</small><strong>' + esc(sonraki.baslik) + '</strong></a>' : '') +
      '</nav></article>';
    return html;
  }

  function zamanSayfasi() {
    var html = '<div class="sayfa-bas"><h1>Zaman Çizelgesi</h1><p>Bütün konulardaki olaylar tek bir çizgide. Bir olaya dokunarak konusuna gidin.</p></div><div class="cizelge">';
    DONEMLER.forEach(function (d) {
      var olaylar = [];
      KONULAR.forEach(function (k) {
        if (k.donem !== d.id) return;
        (k.olaylar || []).forEach(function (o) { olaylar.push({ o: o, k: k }); });
      });
      if (!olaylar.length) return;
      olaylar.sort(function (a, b) { return a.o.yil - b.o.yil; });
      html += '<div class="cizelge-donem" style="--renk:' + esc(d.renk) + '">' + esc(d.ad) + '</div>';
      html += olaylar.map(function (x) {
        return '<a class="olay" style="--renk:' + esc(d.renk) + '" href="#/konu/' + esc(x.k.id) + '">' +
          resim(x.k.kapak, '') +
          '<span><b>' + esc(x.o.etiket) + '</b>' + esc(x.o.metin) + '<br><small>' + esc(x.k.baslik) + '</small></span></a>';
      }).join('');
    });
    return html + '</div>';
  }

  function haritaSayfasi() {
    return '<div class="sayfa-bas"><h1>Harita</h1><p>Olayların geçtiği yerler. Bir noktaya dokunarak ayrıntıyı görün.</p></div>' +
      '<p id="harita-not" class="harita-not" hidden>Çevrimdışısınız: haritada yalnızca daha önce baktığınız bölgeler görünür.</p>' +
      '<div id="harita"></div>' +
      '<div class="aciklama-kutusu">' + DONEMLER.map(function (d) {
        return '<span><i style="background:' + esc(d.renk) + '"></i>' + esc(d.ad) + '</span>';
      }).join('') + '</div>';
  }

  function haritaKur() {
    var kutu = document.getElementById('harita');
    if (!window.L) {
      kutu.outerHTML = '<div class="bos">Harita yüklenemedi. Sayfayı yenilemeyi deneyin.</div>';
      return;
    }
    document.getElementById('harita-not').hidden = navigator.onLine !== false;
    harita = L.map(kutu, { scrollWheelZoom: true }).setView([39.5, 55], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12,
      crossOrigin: true, // karolar servis çalışanında saklanabilsin
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> katkıcıları'
    }).addTo(harita);
    KONULAR.forEach(function (k) {
      var renk = donemBul(k.donem).renk;
      (k.yerler || []).forEach(function (y) {
        var simge = L.divIcon({ className: '', html: '<div class="igne" style="background:' + esc(renk) + '"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
        L.marker([y.lat, y.lng], { icon: simge, title: y.ad }).addTo(harita).bindPopup(
          '<div class="balon">' + resim(k.kapak, '') + '<b>' + esc(y.ad) + '</b><p>' + esc(y.not) + '</p>' +
          '<a href="#/konu/' + esc(k.id) + '">' + esc(k.baslik) + ' →</a></div>'
        );
      });
    });
  }

  function favoriSayfasi() {
    var liste = KONULAR.filter(function (k) { return icinde(favoriler, k.id); });
    return '<div class="sayfa-bas"><h1>Favoriler</h1><p>Kalp ile işaretlediğiniz konular burada toplanır.</p></div>' +
      (liste.length ? '<div class="izgara">' + liste.map(kart).join('') + '</div>'
        : '<div class="bos">Henüz favori konunuz yok. Konu kartlarındaki ♡ simgesine dokunarak ekleyebilirsiniz.</div>');
  }

  // ---------- Yönlendirme ----------
  function ciz() {
    var yol = location.hash.replace(/^#\/?/, '').split('/');
    var sayfa = yol[0] || 'ana';

    if (harita) { harita.remove(); harita = null; }

    if (sayfa === 'konu') {
      var konu = konuBul(decodeURIComponent(yol[1] || ''));
      if (konu) {
        icerik.innerHTML = konuSayfasi(konu);
        sonKonu = konu.id;
        depo.yaz('sonKonu', sonKonu);
        document.title = konu.baslik + ' – Tarihin Bilgi Kapısı';
      } else {
        icerik.innerHTML = '<div class="bos">Bu konu bulunamadı. <a href="#/">Tüm konulara dön</a></div>';
      }
      sayfa = 'ana';
    } else if (sayfa === 'zaman') {
      icerik.innerHTML = zamanSayfasi();
      document.title = 'Zaman Çizelgesi – Tarihin Bilgi Kapısı';
    } else if (sayfa === 'harita') {
      icerik.innerHTML = haritaSayfasi();
      document.title = 'Harita – Tarihin Bilgi Kapısı';
      haritaKur();
    } else if (sayfa === 'favoriler') {
      icerik.innerHTML = favoriSayfasi();
      document.title = 'Favoriler – Tarihin Bilgi Kapısı';
    } else {
      sayfa = 'ana';
      icerik.innerHTML = anaSayfa();
      document.title = 'Tarihin Bilgi Kapısı';
    }

    Array.prototype.forEach.call(document.querySelectorAll('.menu a'), function (a) {
      a.classList.toggle('aktif', a.getAttribute('data-sayfa') === sayfa);
    });
    window.scrollTo(0, 0);
  }

  // ---------- Test ----------
  function secenekSecildi(dugme) {
    var kutu = dugme.closest('.soru');
    var konu = konuBul(sonKonu);
    if (!kutu || !konu || kutu.hasAttribute('data-cevap')) return;
    var soru = konu.test[Number(kutu.getAttribute('data-soru'))];
    var secilen = Number(dugme.getAttribute('data-secenek'));
    kutu.setAttribute('data-cevap', secilen === soru.dogru ? 'dogru' : 'yanlis');

    Array.prototype.forEach.call(kutu.querySelectorAll('.secenek'), function (d, i) {
      d.disabled = true;
      if (i === soru.dogru) d.classList.add('dogru');
      else if (i === secilen) d.classList.add('yanlis');
    });
    var aciklama = document.createElement('p');
    aciklama.className = 'aciklama';
    aciklama.textContent = (secilen === soru.dogru ? '✓ Doğru. ' : '✗ Yanlış. ') + soru.aciklama;
    kutu.appendChild(aciklama);

    var cevaplanan = icerik.querySelectorAll('.soru[data-cevap]').length;
    if (cevaplanan === konu.test.length) {
      var dogru = icerik.querySelectorAll('.soru[data-cevap="dogru"]').length;
      document.getElementById('test-sonuc').innerHTML = '<div class="sonuc">Sonuç: ' + dogru + ' / ' + konu.test.length +
        (dogru === konu.test.length ? ' — Harika, hepsi doğru!' : ' — Yanlış yaptıklarınızın açıklamasına göz atın.') + '</div>';
      if (!icinde(okunanlar, konu.id)) {
        degistir(okunanlar, konu.id, 'okunanlar');
        var isaret = icerik.querySelector('[data-okundu]');
        if (isaret) { isaret.setAttribute('aria-pressed', 'true'); isaret.textContent = '✓ Okundu'; }
      }
    }
  }

  // ---------- Olaylar ----------
  function buyut(img) {
    var g = GORSELLER[img.getAttribute('data-buyut')];
    if (!g || !buyutec.showModal) return;
    buyutec.querySelector('img').src = g.src;
    buyutec.querySelector('img').alt = img.alt;
    buyutec.querySelector('figcaption').innerHTML = esc(img.alt) + '<small>' + kunyeMetni(g) + '</small>';
    buyutec.showModal();
  }

  document.addEventListener('click', function (e) {
    var hedef = e.target;

    // Sayfa içi bağlantılar (#test, #kaynak-1) adres çubuğundaki konu yolunu bozmasın.
    var ic = hedef.closest('a[href^="#"]:not([href^="#/"])');
    if (ic) {
      e.preventDefault();
      var yer = document.getElementById(ic.getAttribute('href').slice(1));
      if (yer) yer.scrollIntoView({ block: ic.hasAttribute('data-kaynak') ? 'center' : 'start' });
      return;
    }

    var fav =hedef.closest('[data-fav]');
    if (fav) {
      e.preventDefault();
      var eklendi = degistir(favoriler, fav.getAttribute('data-fav'), 'favoriler');
      fav.setAttribute('aria-pressed', String(eklendi));
      if (fav.classList.contains('fav')) fav.textContent = eklendi ? '♥' : '♡';
      else fav.textContent = eklendi ? '♥ Favorilerde' : '♡ Favorilere ekle';
      if (location.hash.indexOf('favoriler') !== -1) ciz();
      return;
    }

    var okundu = hedef.closest('[data-okundu]');
    if (okundu) {
      var isaretli = degistir(okunanlar, okundu.getAttribute('data-okundu'), 'okunanlar');
      okundu.setAttribute('aria-pressed', String(isaretli));
      okundu.textContent = isaretli ? '✓ Okundu' : 'Okundu olarak işaretle';
      return;
    }

    if (hedef.classList.contains('secenek')) { secenekSecildi(hedef); return; }

    if (hedef.matches('img[data-buyut]') && hedef.closest('figure, .konu-kapak') && !hedef.closest('.buyutec')) {
      buyut(hedef);
      return;
    }

    if (hedef === buyutec || hedef.closest('.buyutec-kapat')) buyutec.close();
  });

  var aramaZamanlayici;
  aramaKutusu.addEventListener('input', function () {
    clearTimeout(aramaZamanlayici);
    aramaZamanlayici = setTimeout(function () {
      if (/^#?\/?$/.test(location.hash)) ciz(); else location.hash = '#/';
    }, 150);
  });

  var kok = document.documentElement;
  var kayitliTema = depo.oku('tema', null);
  kok.setAttribute('data-theme', kayitliTema ||
    (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.getElementById('tema').addEventListener('click', function () {
    var yeni = kok.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    kok.setAttribute('data-theme', yeni);
    depo.yaz('tema', yeni);
  });

  // ---------- Çevrimdışı kullanım ve kurulum ----------
  // Servis çalışanı yalnızca http(s) üzerinde çalışır; dosyadan açılınca bu bölüm gizli kalır.
  function cevrimdisiKur() {
    if (!('serviceWorker' in navigator) || !window.caches || !/^https?:$/.test(location.protocol)) return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* kurulamazsa uygulama yine çalışır */ });

    var kutu = document.getElementById('cevrimdisi');
    var durum = document.getElementById('cevrimdisi-durum');
    var dugme = document.getElementById('cevrimdisi-indir');
    var adresler = Object.keys(GORSELLER).map(function (w) { return GORSELLER[w].src; });
    var boyut = ONBELLEK && ONBELLEK.gorselMB ? ' (yaklaşık ' + ONBELLEK.gorselMB + ' MB)' : '';

    function goster(hazir) {
      var tamam = hazir >= adresler.length;
      durum.textContent = tamam
        ? '✓ Bütün konular ve görseller bu cihazda; internet olmadan da okuyabilirsiniz.'
        : 'Metinler çevrimdışı okunabilir. Görsellerin ' + hazir + ' / ' + adresler.length + ' tanesi bu cihazda.';
      dugme.hidden = tamam;
      dugme.textContent = 'Bütün görselleri indir' + boyut;
      kutu.hidden = false;
    }

    function say(kasa) {
      return kasa.keys().then(function (kayitlar) {
        var kayitli = {};
        kayitlar.forEach(function (k) { kayitli[new URL(k.url).pathname] = true; });
        return adresler.filter(function (a) { return kayitli[new URL(a, location.href).pathname]; }).length;
      });
    }

    caches.open('tbk-gorsel').then(function (kasa) {
      say(kasa).then(goster);
      dugme.addEventListener('click', function () {
        dugme.disabled = true;
        var sira = 0, biten = 0, hata = 0;
        function sonraki() {
          if (sira >= adresler.length) return Promise.resolve();
          var adres = adresler[sira++];
          return kasa.match(adres).then(function (kayit) {
            return kayit || fetch(adres).then(function (yanit) {
              if (!yanit.ok) throw new Error(yanit.status);
              return kasa.put(adres, yanit);
            });
          }).catch(function () { hata++; }).then(function () {
            biten++;
            dugme.textContent = 'İndiriliyor… ' + biten + ' / ' + adresler.length;
            return sonraki();
          });
        }
        Promise.all([sonraki(), sonraki(), sonraki(), sonraki()]).then(function () {
          dugme.disabled = false;
          return say(kasa);
        }).then(function (hazir) {
          goster(hazir);
          if (hata) durum.textContent += ' ' + hata + ' görsel indirilemedi; bağlantınızı kontrol edip yeniden deneyin.';
        });
      });
    }).catch(function () { /* depolama kapalı */ });
  }

  var yukleDugmesi = document.getElementById('yukle');
  var yukleIstemi = null;
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    yukleIstemi = e;
    yukleDugmesi.hidden = false;
  });
  yukleDugmesi.addEventListener('click', function () {
    if (!yukleIstemi) return;
    yukleIstemi.prompt();
    yukleIstemi = null;
    yukleDugmesi.hidden = true;
  });
  window.addEventListener('appinstalled', function () { yukleDugmesi.hidden = true; });

  cevrimdisiKur();
  window.addEventListener('hashchange', ciz);
  ciz();
})();
