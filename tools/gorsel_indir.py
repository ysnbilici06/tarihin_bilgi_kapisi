"""Konularda adı geçen görselleri Wikipedia / Wikimedia Commons'tan indirir.

Kullanım:  python tools/gorsel_indir.py

data/konular-*.js dosyalarındaki "kapak" ve "wiki" alanlarını okur, her madde
için sayfanın ana görselini assets/gorsel/ klasörüne indirir ve künye
bilgileriyle (eser sahibi, lisans, kaynak) birlikte data/gorseller.js dosyasına
yazar. Daha önce indirilenleri atlar.

Anahtar biçimleri:
  "Madde adı"            -> tr.wikipedia.org maddesinin ana görseli
  "en:Article name"      -> en.wikipedia.org maddesinin ana görseli
  "dosya:Dosya adı.jpg"  -> doğrudan Wikimedia Commons dosyası
"""
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import onbellek_olustur

KOK = pathlib.Path(__file__).resolve().parent.parent
VERI = KOK / "data"
HEDEF = KOK / "assets" / "gorsel"
CIKTI = VERI / "gorseller.js"
UA = "TarihinBilgiKapisi/1.0 (egitim amacli yerel uygulama; python-urllib)"
GENISLIK = 960

sys.stdout.reconfigure(encoding="utf-8")


def api(alan, **parametreler):
    parametreler.update(format="json", formatversion="2")
    adres = f"https://{alan}/w/api.php?" + urllib.parse.urlencode(parametreler)
    istek = urllib.request.Request(adres, headers={"User-Agent": UA})
    for deneme in range(6):
        try:
            with urllib.request.urlopen(istek, timeout=30) as yanit:
                return json.load(yanit)
        except urllib.error.HTTPError as hata:
            if hata.code != 429 or deneme == 5:
                raise
            # Wikimedia API'si hız sınırı koyar; söylediği süre kadar bekle.
            time.sleep(int(hata.headers.get("Retry-After") or 10) + 2)


def parcala(liste, boyut=50):
    for i in range(0, len(liste), boyut):
        yield liste[i:i + boyut]


def indir(adres, yol):
    istek = urllib.request.Request(adres, headers={"User-Agent": UA})
    for deneme in range(4):
        try:
            with urllib.request.urlopen(istek, timeout=60) as yanit:
                yol.write_bytes(yanit.read())
            return
        except urllib.error.HTTPError as hata:
            if hata.code != 429 or deneme == 3:
                raise
            time.sleep(5 * (deneme + 1))


def konulari_oku():
    konular = []
    for dosya in sorted(VERI.glob("konular-*.js")):
        metin = dosya.read_text(encoding="utf-8")
        govde = metin[metin.index("concat(") + 7: metin.rindex(");")]
        konular.extend(json.loads(govde))
    return konular


def anahtarlar(konular):
    sirali = []
    for konu in konular:
        adaylar = [konu.get("kapak")]
        adaylar += [b["gorsel"]["wiki"] for b in konu.get("bolumler", []) if b.get("gorsel")]
        adaylar += [g["wiki"] for g in konu.get("galeri", [])]
        for aday in adaylar:
            if aday and aday not in sirali:
                sirali.append(aday)
    return sirali


def dosya_adi(anahtar):
    cevrim = str.maketrans("çğıöşüÇĞİÖŞÜâîûÂÎÛ", "cgiosuCGIOSUaiuAIU")
    sade = anahtar.translate(cevrim).lower()
    return re.sub(r"[^a-z0-9]+", "-", sade).strip("-")[:60]


def etiketsiz(deger):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", deger or ""))).strip()


def kunyeler(dosyalar, alan):
    """Dosya adı -> {kucuk, sahip, lisans, kaynak}; tek istekte en çok 50 dosya."""
    sonuc = {}
    for grup in parcala(dosyalar):
        veri = api(alan, action="query", titles="|".join("File:" + d for d in grup),
                   prop="imageinfo", iiprop="url|extmetadata", iiurlwidth=str(GENISLIK))["query"]
        asil = {n["to"]: n["from"] for n in veri.get("normalized", [])}
        for sayfa in veri["pages"]:
            bilgi = (sayfa.get("imageinfo") or [None])[0]
            if not bilgi:
                continue
            ad = asil.get(sayfa["title"], sayfa["title"]).split(":", 1)[1]
            ek = bilgi.get("extmetadata", {})
            sonuc[ad] = {
                "kucuk": bilgi.get("thumburl") or bilgi["url"],
                "sahip": etiketsiz(ek.get("Artist", {}).get("value"))[:140],
                "lisans": etiketsiz(ek.get("LicenseShortName", {}).get("value")),
                "kaynak": bilgi.get("descriptionurl", ""),
            }
        time.sleep(1)
    return sonuc


def ana_gorseller(basliklar, alan):
    """Madde başlığı -> ana görselin dosya adı."""
    sonuc = {}
    for grup in parcala(basliklar):
        veri = api(alan, action="query", titles="|".join(grup), redirects="1",
                   prop="pageimages", piprop="name", pilimit="50")["query"]
        hedef = {b: b for b in grup}
        for adim in veri.get("normalized", []) + veri.get("redirects", []):
            for baslik, simdiki in hedef.items():
                if simdiki == adim["from"]:
                    hedef[baslik] = adim["to"]
        gorsel = {s["title"]: s.get("pageimage") for s in veri["pages"]}
        for baslik, son in hedef.items():
            if gorsel.get(son):
                sonuc[baslik] = gorsel[son]
        time.sleep(1)
    return sonuc


def coz(anahtarlar_):
    """Anahtar -> künye sözlüğü. Bulunamayanlar sonuçta yer almaz."""
    dosya = {a: a[6:] for a in anahtarlar_ if a.startswith("dosya:")}
    for dil in ("tr", "en"):
        secili = [a for a in anahtarlar_ if not a.startswith("dosya:") and a.startswith("en:") == (dil == "en")]
        bulunan = ana_gorseller([a[3:] if dil == "en" else a for a in secili], f"{dil}.wikipedia.org")
        for a in secili:
            ad = bulunan.get(a[3:] if dil == "en" else a)
            if ad:
                dosya[a] = ad
    bilgi = kunyeler(sorted(set(dosya.values())), "commons.wikimedia.org")
    # Commons'ta olmayan dosyalar ilgili Vikipedi'ye yerel yüklenmiş olabilir.
    for dil in ("tr", "en"):
        kalan = sorted({d for a, d in dosya.items() if d not in bilgi and a.startswith("en:") == (dil == "en")})
        if kalan:
            bilgi.update(kunyeler(kalan, f"{dil}.wikipedia.org"))
    return {a: bilgi[d] for a, d in dosya.items() if d in bilgi}


def main():
    HEDEF.mkdir(parents=True, exist_ok=True)
    mevcut = {}
    if CIKTI.exists():
        metin = CIKTI.read_text(encoding="utf-8")
        mevcut = json.loads(metin[metin.index("{"): metin.rindex("}") + 1])

    sonuc, eksik = {}, []
    tumu = anahtarlar(konulari_oku())
    for anahtar in tumu:
        eski = mevcut.get(anahtar)
        if eski and (KOK / eski["src"]).exists():
            sonuc[anahtar] = eski
    yeni = [a for a in tumu if a not in sonuc]
    cozulen = coz(yeni) if yeni else {}
    for anahtar in yeni:
        bilgi = cozulen.get(anahtar)
        try:
            if not bilgi:
                raise LookupError("görsel bulunamadı")
            uzanti = pathlib.PurePosixPath(urllib.parse.urlparse(bilgi["kucuk"]).path).suffix.lower()
            yol = HEDEF / (dosya_adi(anahtar) + (uzanti or ".jpg"))
            indir(bilgi["kucuk"], yol)
            sonuc[anahtar] = {
                "src": yol.relative_to(KOK).as_posix(),
                "sahip": bilgi["sahip"],
                "lisans": bilgi["lisans"],
                "kaynak": bilgi["kaynak"],
            }
            print("tamam :", anahtar)
        except Exception as hata:  # tek bir görsel tüm indirmeyi durdurmasın
            eksik.append(anahtar)
            print("EKSİK :", anahtar, "->", hata)
        time.sleep(0.3)

    CIKTI.write_text("window.GORSELLER = " + json.dumps(sonuc, ensure_ascii=False, indent=1) + ";\n",
                     encoding="utf-8")
    print(f"\n{len(sonuc)} görsel hazır, {len(eksik)} eksik.")
    for anahtar in eksik:
        print("  -", anahtar)
    onbellek_olustur.main()


if __name__ == "__main__":
    main()
