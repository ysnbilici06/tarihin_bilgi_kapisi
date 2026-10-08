"""Çevrimdışı çalışma için onbellek.js dosyasını üretir.

Kullanım:  python tools/onbellek_olustur.py

Uygulamanın çekirdek dosyalarını (sayfa, stil, betikler, veriler, simgeler)
listeler ve içeriklerinden bir sürüm damgası çıkarır. Servis çalışanı (sw.js)
bu listeyi kurulumda önbelleğe alır; damga değişince eski önbelleği siler.
Kod ya da veri dosyalarını değiştirdikten sonra yeniden çalıştırın.
Görseller listeye girmez; görüntülendikçe ya da kullanıcı isteyince indirilir.
"""
import hashlib
import json
import pathlib
import sys

KOK = pathlib.Path(__file__).resolve().parent.parent
CIKTI = KOK / "onbellek.js"
KALIPLAR = ["index.html", "manifest.webmanifest", "css/*.css", "js/*.js", "data/*.js",
            "assets/leaflet/*", "assets/simge/*"]


def main():
    dosyalar = sorted({y.relative_to(KOK).as_posix() for k in KALIPLAR for y in KOK.glob(k) if y.is_file()})
    damga = hashlib.sha1()
    for ad in dosyalar:
        damga.update(ad.encode("utf-8"))
        damga.update((KOK / ad).read_bytes())
    gorsel_mb = round(sum(y.stat().st_size for y in (KOK / "assets" / "gorsel").glob("*")) / 1e6)
    veri = {"surum": damga.hexdigest()[:10], "gorselMB": gorsel_mb, "dosyalar": dosyalar + ["onbellek.js"]}
    CIKTI.write_text("self.ONBELLEK = " + json.dumps(veri, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"onbellek.js yazıldı: sürüm {veri['surum']}, {len(dosyalar)} dosya, görseller ≈ {gorsel_mb} MB")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
