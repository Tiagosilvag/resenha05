"""
Recorte de fundo de foto — serviço interno do Resenha05.

Um único modelo ONNX (silueta, família U^2-Net) rodando em CPU via
onnxruntime. Sem torch, sem rembg: só o pré/pós-processamento que a
silueta espera. A foto entra e sai pela rede interna do docker-compose;
nunca vai pra fora do servidor.

  POST /remove   multipart  campo "file"  ->  PNG com canal alfa
  GET  /health              ->  {"ok": true}
"""
import io
import os

import numpy as np
import onnxruntime as ort
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from PIL import Image, ImageOps

MODEL_PATH = os.environ.get("MODEL_PATH", "/app/silueta.onnx")
TAMANHO = 320  # entrada fixa da silueta
MEDIA = (0.485, 0.456, 0.406)
DESVIO = (0.229, 0.224, 0.225)
LADO_MAX_SAIDA = 1200  # não devolve nada maior que isso

_opcoes = ort.SessionOptions()
_opcoes.intra_op_num_threads = int(os.environ.get("ORT_THREADS", "2"))
_opcoes.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
_sessao = ort.InferenceSession(MODEL_PATH, sess_options=_opcoes, providers=["CPUExecutionProvider"])
_entrada = _sessao.get_inputs()[0].name

app = FastAPI(title="resenha05-bgremove")


def _mascara(img: Image.Image) -> Image.Image:
    amostra = img.convert("RGB").resize((TAMANHO, TAMANHO), Image.LANCZOS)
    ary = np.array(amostra).astype(np.float64)
    pico = np.max(ary)
    ary = ary / pico if pico > 0 else ary
    for i in range(3):
        ary[:, :, i] = (ary[:, :, i] - MEDIA[i]) / DESVIO[i]
    tensor = np.expand_dims(ary.transpose((2, 0, 1)), 0).astype(np.float32)

    pred = _sessao.run(None, {_entrada: tensor})[0][:, 0, :, :]
    lo, hi = float(np.min(pred)), float(np.max(pred))
    pred = (pred - lo) / (hi - lo) if hi > lo else pred
    pred = np.squeeze(pred) * 255.0

    return Image.fromarray(pred.astype("uint8"), mode="L").resize(img.size, Image.LANCZOS)


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/remove")
async def remove(file: UploadFile = File(...)):
    bruto = await file.read()
    if not bruto:
        raise HTTPException(400, "arquivo vazio")
    try:
        img = Image.open(io.BytesIO(bruto))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        raise HTTPException(415, "imagem inválida")

    if max(img.size) > LADO_MAX_SAIDA:
        escala = LADO_MAX_SAIDA / max(img.size)
        img = img.resize((round(img.width * escala), round(img.height * escala)), Image.LANCZOS)

    recorte = img.convert("RGBA")
    recorte.putalpha(_mascara(img))

    # recorta pra caixa do sujeito, com uma folga
    caixa = recorte.getbbox()
    if caixa:
        folga = round(max(recorte.size) * 0.02)
        caixa = (
            max(0, caixa[0] - folga),
            max(0, caixa[1] - folga),
            min(recorte.width, caixa[2] + folga),
            min(recorte.height, caixa[3] + folga),
        )
        recorte = recorte.crop(caixa)

    saida = io.BytesIO()
    recorte.save(saida, format="PNG", optimize=True)
    return Response(content=saida.getvalue(), media_type="image/png")
