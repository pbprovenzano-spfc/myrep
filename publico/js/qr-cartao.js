/* =========================================================
   qr-cartao.js — QR code da página do rep (painel)
   Gera no navegador com vendor/qrcode.js; baixa em PNG ou SVG.
   ========================================================= */

(function (global) {
  const MARGEM = 4; // módulos de borda branca, o mínimo da norma
  const NIVEL = "M"; // ~15% de correção: aguenta impressão e pequenos danos

  function gerar(url) {
    const qr = global.qrcode(0, NIVEL);
    qr.addData(url);
    qr.make();
    return qr;
  }

  /** Desenha o QR no canvas, com lado aproximado `lado` em pixels. */
  function desenhar(canvas, url, lado) {
    const qr = gerar(url);
    const n = qr.getModuleCount();
    const total = n + MARGEM * 2;
    const escala = Math.max(1, Math.floor(lado / total));
    canvas.width = total * escala;
    canvas.height = total * escala;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (qr.isDark(y, x)) ctx.fillRect((x + MARGEM) * escala, (y + MARGEM) * escala, escala, escala);
      }
    }
    return canvas;
  }

  function svg(url) {
    const qr = gerar(url);
    const n = qr.getModuleCount();
    const total = n + MARGEM * 2;
    let d = "";
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        if (qr.isDark(y, x)) d += `M${x + MARGEM} ${y + MARGEM}h1v1h-1z`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="1024" height="1024" shape-rendering="crispEdges"><rect width="${total}" height="${total}" fill="#FFFFFF"/><path d="${d}" fill="#000000"/></svg>`;
  }

  function baixar(blob, nome) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function baixarPng(url, nome) {
    const canvas = desenhar(document.createElement("canvas"), url, 1024);
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error("Não foi possível gerar o PNG."));
        baixar(blob, `${nome}.png`);
        resolve();
      }, "image/png");
    });
  }

  function baixarSvg(url, nome) {
    baixar(new Blob([svg(url)], { type: "image/svg+xml" }), `${nome}.svg`);
  }

  global.MyRepQr = { desenhar, svg, baixarPng, baixarSvg };
})(typeof window !== "undefined" ? window : globalThis);
