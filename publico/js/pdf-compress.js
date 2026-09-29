/* =========================================================
   Compacta PDF no navegador (pdf.js + pdf-lib, sob demanda)
   Só entra em ação quando o arquivo passa do limite de upload.
   ========================================================= */

(function (global) {
  const PDFJS_SRC = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js";
  const PDFJS_WORKER = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";
  const PDFLIB_SRC = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js";

  const TENTATIVAS = [
    { dpi: 150, qualidade: 0.75 },
    { dpi: 120, qualidade: 0.6 },
    { dpi: 96, qualidade: 0.5 }
  ];

  const LADO_MAX_PX = 2200;

  const scripts = new Map();

  function carregarScript(src) {
    if (scripts.has(src)) return scripts.get(src);
    const promessa = new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = () => resolve();
      el.onerror = () => {
        scripts.delete(src);
        reject(new Error("Não foi possível preparar a compactação do PDF."));
      };
      document.head.appendChild(el);
    });
    scripts.set(src, promessa);
    return promessa;
  }

  let libsProntas = null;

  function garantirLibs() {
    if (!libsProntas) {
      libsProntas = (async () => {
        if (!global.pdfjsLib) await carregarScript(PDFJS_SRC);
        if (!global.PDFLib) await carregarScript(PDFLIB_SRC);
        if (!global.pdfjsLib || !global.PDFLib) {
          throw new Error("Não foi possível preparar a compactação do PDF.");
        }
        global.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      })().catch((erro) => {
        libsProntas = null;
        throw erro;
      });
    }
    return libsProntas;
  }

  function canceladoErro() {
    const erro = new Error("Compactação cancelada.");
    erro.cancelado = true;
    return erro;
  }

  function checarCancelamento(signal) {
    if (signal?.aborted) throw canceladoErro();
  }

  function pausa() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  let usarWorker = true;

  async function abrirPdf(pdfjs, original) {
    const data = original.slice(0);
    const opcoes = { data };
    if (!usarWorker) opcoes.disableWorker = true;
    try {
      const tarefa = pdfjs.getDocument(opcoes);
      return await tarefa.promise;
    } catch (erro) {
      const msg = String(erro?.message || erro || "");
      if (/password/i.test(msg)) {
        throw new Error("Este PDF está protegido por senha. Envie uma versão sem senha.");
      }
      if (usarWorker) {
        usarWorker = false;
        return abrirPdf(pdfjs, original);
      }
      throw new Error("Não foi possível ler este PDF para compactar.");
    }
  }

  async function jpegDaPagina(page, dpi, qualidade, canvas, ctx) {
    const pontos = page.getViewport({ scale: 1 });
    let escala = dpi / 72;
    let largura = pontos.width * escala;
    let altura = pontos.height * escala;
    const maior = Math.max(largura, altura);
    if (maior > LADO_MAX_PX) {
      escala *= LADO_MAX_PX / maior;
      largura = pontos.width * escala;
      altura = pontos.height * escala;
    }
    canvas.width = Math.max(1, Math.round(largura));
    canvas.height = Math.max(1, Math.round(altura));
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const viewport = page.getViewport({ scale: escala });
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", qualidade));
    if (!blob) throw new Error("Não foi possível compactar uma página deste PDF.");
    return {
      bytes: new Uint8Array(await blob.arrayBuffer()),
      largura: pontos.width,
      altura: pontos.height
    };
  }

  async function compactarUmaVez(original, opcoes, onProgress, signal) {
    const pdfjs = global.pdfjsLib;
    const { PDFDocument } = global.PDFLib;
    const doc = await abrirPdf(pdfjs, original);
    const saida = await PDFDocument.create();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { alpha: false });
    const total = doc.numPages;
    try {
      for (let i = 1; i <= total; i += 1) {
        checarCancelamento(signal);
        if (onProgress) onProgress({ pagina: i, total });
        const page = await doc.getPage(i);
        const jpeg = await jpegDaPagina(page, opcoes.dpi, opcoes.qualidade, canvas, ctx);
        const img = await saida.embedJpg(jpeg.bytes);
        const folha = saida.addPage([jpeg.largura, jpeg.altura]);
        folha.drawImage(img, { x: 0, y: 0, width: jpeg.largura, height: jpeg.altura });
        page.cleanup?.();
        await pausa();
      }
    } finally {
      canvas.width = 0;
      canvas.height = 0;
      await doc.destroy?.();
    }
    return saida.save();
  }

  function arquivoDeBytes(nome, bytes) {
    const base = String(nome || "catalogo").replace(/\.pdf$/i, "") || "catalogo";
    return new File([bytes], `${base}.pdf`, { type: "application/pdf" });
  }

  async function compactarPdf(file, opcoes = {}) {
    checarCancelamento(opcoes.signal);
    await garantirLibs();
    checarCancelamento(opcoes.signal);
    const limite = Number(opcoes.limiteBytes) || 0;
    const alvo = Number(opcoes.alvoBytes) || limite;
    const original = new Uint8Array(await file.arrayBuffer());
    let ultimo = null;
    for (const tentativa of TENTATIVAS) {
      checarCancelamento(opcoes.signal);
      const bytes = await compactarUmaVez(original, tentativa, opcoes.onProgress, opcoes.signal);
      ultimo = bytes;
      if (!limite || bytes.byteLength <= alvo) {
        return arquivoDeBytes(file.name, bytes);
      }
    }
    if (ultimo && limite && ultimo.byteLength <= limite) {
      return arquivoDeBytes(file.name, ultimo);
    }
    const erro = new Error("PDF ainda grande demais depois de compactar.");
    erro.naoCoube = true;
    erro.tamanhoFinal = ultimo ? ultimo.byteLength : file.size;
    throw erro;
  }

  global.MyRepPdf = { compactarPdf };
})(typeof window !== "undefined" ? window : globalThis);
