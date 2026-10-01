/* =========================================================
   Ajusta logo no navegador antes do envio.
   Remove margem branca ou preta ligada à borda, recorta
   o desenho e devolve um PNG com um respiro curto.
   ========================================================= */

(function (global) {
  const LADO_MAX = 1024;
  const LIMIAR_BRANCO = 240;
  const LIMIAR_PRETO = 25;
  const BORDA_UNIFORME = 0.8;
  const MARGEM = 0.08;
  const ALFA_CONTEUDO = 16;

  function ehBranco(r, g, b) {
    return r >= LIMIAR_BRANCO && g >= LIMIAR_BRANCO && b >= LIMIAR_BRANCO;
  }

  function ehPreto(r, g, b) {
    return r <= LIMIAR_PRETO && g <= LIMIAR_PRETO && b <= LIMIAR_PRETO;
  }

  function ehFundo(data, offset, modo) {
    if (data[offset + 3] < ALFA_CONTEUDO) return false;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    return modo === "branco" ? ehBranco(r, g, b) : ehPreto(r, g, b);
  }

  function temTransparencia(data) {
    const total = data.length / 4;
    const limite = Math.max(8, total * 0.01);
    let n = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 128) {
        n += 1;
        if (n >= limite) return true;
      }
    }
    return false;
  }

  function modoDaBorda(data, w, h) {
    let brancos = 0;
    let pretos = 0;
    let total = 0;

    function amostra(x, y) {
      const o = (y * w + x) * 4;
      if (data[o + 3] < 250) return;
      total += 1;
      const r = data[o];
      const g = data[o + 1];
      const b = data[o + 2];
      if (ehBranco(r, g, b)) brancos += 1;
      else if (ehPreto(r, g, b)) pretos += 1;
    }

    for (let x = 0; x < w; x += 1) {
      amostra(x, 0);
      if (h > 1) amostra(x, h - 1);
    }
    for (let y = 1; y < h - 1; y += 1) {
      amostra(0, y);
      if (w > 1) amostra(w - 1, y);
    }

    if (!total) return null;
    if (brancos / total >= BORDA_UNIFORME) return "branco";
    if (pretos / total >= BORDA_UNIFORME) return "preto";
    return null;
  }

  function contarNaoFundo(data, w, h, modo) {
    let n = 0;
    const total = w * h;
    for (let i = 0; i < total; i += 1) {
      if (!ehFundo(data, i * 4, modo)) n += 1;
    }
    return n;
  }

  function contarOpacos(data) {
    let n = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] >= ALFA_CONTEUDO) n += 1;
    }
    return n;
  }

  function apagarFundoDaBorda(data, w, h, modo) {
    const total = w * h;
    const visitado = new Uint8Array(total);
    const fila = new Int32Array(total);
    let ini = 0;
    let fim = 0;

    function enfileirar(x, y) {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const i = y * w + x;
      if (visitado[i]) return;
      if (!ehFundo(data, i * 4, modo)) return;
      visitado[i] = 1;
      fila[fim] = i;
      fim += 1;
    }

    for (let x = 0; x < w; x += 1) {
      enfileirar(x, 0);
      enfileirar(x, h - 1);
    }
    for (let y = 0; y < h; y += 1) {
      enfileirar(0, y);
      enfileirar(w - 1, y);
    }

    while (ini < fim) {
      const i = fila[ini];
      ini += 1;
      data[i * 4 + 3] = 0;
      const x = i % w;
      const y = (i - x) / w;
      enfileirar(x - 1, y);
      enfileirar(x + 1, y);
      enfileirar(x, y - 1);
      enfileirar(x, y + 1);
    }
  }

  function removerFundoSePreciso(imageData) {
    const { data, width: w, height: h } = imageData;
    if (temTransparencia(data)) return;
    const modo = modoDaBorda(data, w, h);
    if (!modo) return;
    const copia = new Uint8ClampedArray(data);
    const naoFundo = contarNaoFundo(data, w, h, modo);
    apagarFundoDaBorda(data, w, h, modo);
    if (naoFundo === 0 || contarOpacos(data) < 16) data.set(copia);
  }

  function limitesConteudo(data, w, h) {
    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (data[(y * w + x) * 4 + 3] < ALFA_CONTEUDO) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return null;
    return { minX, minY, maxX, maxY };
  }

  function recortarComMargem(origem, limites) {
    const bw = limites.maxX - limites.minX + 1;
    const bh = limites.maxY - limites.minY + 1;
    const pad = Math.max(1, Math.round(Math.max(bw, bh) * MARGEM));
    const saida = document.createElement("canvas");
    saida.width = bw + pad * 2;
    saida.height = bh + pad * 2;
    const ctx = saida.getContext("2d");
    ctx.drawImage(origem, limites.minX, limites.minY, bw, bh, pad, pad, bw, bh);
    return saida;
  }

  function nomePng(nomeOriginal) {
    const base = String(nomeOriginal || "logo").replace(/\.[^.]+$/, "") || "logo";
    return `${base}.png`;
  }

  function carregarImagem(file) {
    if (typeof createImageBitmap === "function") {
      return createImageBitmap(file).catch(() => carregarViaImage(file));
    }
    return carregarViaImage(file);
  }

  function carregarViaImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não foi possível ler o logo."));
      };
      img.src = url;
    });
  }

  function desenharLimitado(img) {
    const largura = img.naturalWidth || img.width;
    const altura = img.naturalHeight || img.height;
    if (!largura || !altura) throw new Error("Não foi possível ler o logo.");
    const escala = Math.min(1, LADO_MAX / Math.max(largura, altura));
    const w = Math.max(1, Math.round(largura * escala));
    const h = Math.max(1, Math.round(altura * escala));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, w, h);
    return { canvas, ctx, w, h };
  }

  function paraArquivo(canvas, nomeOriginal) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Não foi possível ajustar o logo."));
          return;
        }
        resolve(new File([blob], nomePng(nomeOriginal), { type: "image/png" }));
      }, "image/png");
    });
  }

  async function prepararLogo(file) {
    if (!file) throw new Error("Não foi possível ajustar o logo.");
    const img = await carregarImagem(file);
    try {
      const { canvas, ctx, w, h } = desenharLimitado(img);
      const imageData = ctx.getImageData(0, 0, w, h);
      removerFundoSePreciso(imageData);
      ctx.putImageData(imageData, 0, 0);
      const limites = limitesConteudo(imageData.data, w, h);
      if (!limites) throw new Error("Não foi possível ajustar o logo.");
      return await paraArquivo(recortarComMargem(canvas, limites), file.name);
    } finally {
      img.close?.();
    }
  }

  global.MyRepLogo = { prepararLogo };
})(typeof window !== "undefined" ? window : globalThis);
