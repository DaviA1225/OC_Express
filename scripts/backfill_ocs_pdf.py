"""
Backfill dos PDFs de OC: troca o logo gigante (44MP) embarcado por uma versao
reduzida, IN-PLACE, sem alterar o conteudo do documento (texto/layout).

Estrategia: para cada XObject de imagem com largura > 2000px, recompoe a imagem
sobre fundo branco (usando o /SMask como alfa), reduz para ~1100px e regrava o
stream como DeviceRGB/Flate, removendo o SMask. Todo o resto do PDF — inclusive
o content stream que desenha a pagina — permanece intacto.

Uso:
  python scripts/backfill_ocs_pdf.py dryrun [N]   # processa N (default 5) p/ pasta local, valida, NAO sobe
  python scripts/backfill_ocs_pdf.py run          # processa todos com backup + upload (upsert)

Le SUPABASE_URL / SUPABASE_SERVICE_KEY do .env.
"""
import io
import os
import sys
import zlib
import json
import pathlib
import urllib.request

import pikepdf
from PIL import Image

BUCKET = "ocs-pdf"
MAXW = 2000          # so mexe em imagens maiores que isso (o logo tem 14110px)
TARGET_W = 1100      # largura final do logo
ROOT = pathlib.Path(__file__).resolve().parent.parent
ORIG = ROOT / "backfill" / "originais"
PROC = ROOT / "backfill" / "processados"


def env():
    url = key = None
    for line in (ROOT / ".env").read_text(encoding="utf-8").splitlines():
        if line.startswith("SUPABASE_URL="):
            url = line.split("=", 1)[1].strip()
        elif line.startswith("SUPABASE_SERVICE_KEY="):
            key = line.split("=", 1)[1].strip()
    return url, key


URL, KEY = env()
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}


def api(method, path, data=None, headers=None, raw=False):
    req = urllib.request.Request(URL + path, data=data, method=method)
    for k, v in {**H, **(headers or {})}.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req) as r:
        body = r.read()
    return body if raw else json.loads(body)


def list_objects(limit=5000):
    body = json.dumps({"prefix": "", "limit": limit, "offset": 0,
                       "sortBy": {"column": "name", "order": "asc"}}).encode()
    objs = api("POST", f"/storage/v1/object/list/{BUCKET}", data=body,
               headers={"Content-Type": "application/json"})
    return [o for o in objs if o.get("metadata")]


def download(name):
    return api("GET", f"/storage/v1/object/{BUCKET}/{name}", raw=True)


def upload(name, data):
    api("POST", f"/storage/v1/object/{BUCKET}/{name}", data=data,
        headers={"Content-Type": "application/pdf", "x-upsert": "true"})


def shrink_pdf(pdf_bytes):
    """Retorna (novo_bytes, n_imgs_trocadas). Levanta se algo falhar."""
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    trocadas = 0
    for obj in pdf.objects:
        try:
            if obj.get("/Subtype") != pikepdf.Name.Image:
                continue
            if int(obj.get("/Width", 0)) <= MAXW:
                continue
        except Exception:
            continue
        base = pikepdf.PdfImage(obj).as_pil_image().convert("RGB")
        # compoe sobre branco usando o SMask (alfa), se houver
        if "/SMask" in obj:
            alpha = pikepdf.PdfImage(obj.SMask).as_pil_image().convert("L")
            if alpha.size != base.size:
                alpha = alpha.resize(base.size, Image.LANCZOS)
            canvas = Image.new("RGB", base.size, (255, 255, 255))
            canvas.paste(base, mask=alpha)
            base = canvas
        # reduz
        if base.width > TARGET_W:
            base.thumbnail((TARGET_W, 100000), Image.LANCZOS)
        raw = base.tobytes()
        obj.write(zlib.compress(raw, 9), filter=pikepdf.Name.FlateDecode)
        obj.Width, obj.Height = base.width, base.height
        obj.ColorSpace = pikepdf.Name.DeviceRGB
        obj.BitsPerComponent = 8
        for k in ("/SMask", "/Decode", "/DecodeParms"):
            if k in obj:
                del obj[k]
        trocadas += 1
    out = io.BytesIO()
    pdf.save(out)
    return out.getvalue(), trocadas


def page_contents(pdf_bytes):
    """Bytes dos content streams de todas as paginas (prova de fidelidade)."""
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    chunks = []
    for page in pdf.pages:
        c = page.obj.get("/Contents")
        streams = c if isinstance(c, pikepdf.Array) else [c]
        for s in streams:
            chunks.append(bytes(s.read_bytes()))
    return b"\x00".join(chunks), len(pdf.pages)


def dryrun(n):
    ORIG.mkdir(parents=True, exist_ok=True)
    PROC.mkdir(parents=True, exist_ok=True)
    objs = list_objects()
    alvo = [o for o in objs if o["metadata"]["size"] > 100_000][:n]
    print(f"{len(objs)} PDFs no bucket; testando {len(alvo)}\n")
    ok = True
    for o in alvo:
        name = o["name"]
        orig = download(name)
        (ORIG / name).write_bytes(orig)
        novo, ntroca = shrink_pdf(orig)
        (PROC / name).write_bytes(novo)
        # validacao de fidelidade: content streams identicos e mesmo nº de paginas
        c1, p1 = page_contents(orig)
        c2, p2 = page_contents(novo)
        fiel = (c1 == c2) and (p1 == p2)
        ok = ok and fiel and ntroca >= 1
        print(f"  {name}: {len(orig)/1024:6.0f}KB -> {len(novo)/1024:5.1f}KB "
              f"| imgs trocadas={ntroca} | paginas {p1}->{p2} "
              f"| conteudo identico={'SIM' if fiel else 'NAO !!!'}")
    print(f"\nRESULTADO: {'TUDO FIEL E REDUZIDO [OK]' if ok else 'FALHOU - revisar [X]'}")
    print(f"originais em {ORIG}\nprocessados em {PROC}")


def run():
    ORIG.mkdir(parents=True, exist_ok=True)
    log = open(ROOT / "backfill" / "run.log", "a", encoding="utf-8")
    objs = list_objects()
    big = [o for o in objs if o["metadata"]["size"] > 100_000]
    print(f"{len(objs)} PDFs no bucket; {len(big)} a processar (>100KB)", flush=True)
    done = skip = fail = 0
    antes = depois = 0
    for i, o in enumerate(big, 1):
        name = o["name"]
        try:
            orig = download(name)
            (ORIG / name).write_bytes(orig)            # backup local ANTES de sobrescrever
            novo, ntroca = shrink_pdf(orig)
            if ntroca < 1:                              # nada grande p/ trocar -> nao mexe
                skip += 1
                continue
            c1, p1 = page_contents(orig)
            c2, p2 = page_contents(novo)
            if not (c1 == c2 and p1 == p2):             # fidelidade quebrou -> NAO sobe
                fail += 1
                log.write(f"FIDELIDADE FALHOU (nao enviado): {name}\n")
                continue
            upload(name, novo)
            done += 1
            antes += len(orig)
            depois += len(novo)
        except Exception as e:
            fail += 1
            log.write(f"ERRO {name}: {e!r}\n")
        if i % 50 == 0:
            log.flush()
            print(f"  {i}/{len(big)}  ok={done} pulados={skip} falhas={fail}", flush=True)
    log.close()
    print(f"\nFIM: processados={done} pulados={skip} falhas={fail}")
    if done:
        print(f"economia: {antes/1024/1024:.0f}MB -> {depois/1024/1024:.1f}MB "
              f"({antes/depois:.1f}x)")
    # confere o tamanho total do bucket pos-backfill
    tot = sum(x["metadata"]["size"] for x in list_objects())
    print(f"bucket ocs-pdf agora: {tot/1024/1024:.1f}MB no total")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "dryrun"
    if cmd == "dryrun":
        dryrun(int(sys.argv[2]) if len(sys.argv) > 2 else 5)
    elif cmd == "run":
        run()
    else:
        print("uso: dryrun [N] | run")
