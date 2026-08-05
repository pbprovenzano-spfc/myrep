/* =========================================================
   Leitor de ZIP sem dependências (deflate + stored)
   ========================================================= */

const zlib = require("zlib");

const MAX_ENTRY = 25 * 1024 * 1024;
const MAX_FILES = 80;

function findEocd(buffer) {
  // EOCD: signature 0x06054b50, mínimo 22 bytes no fim
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i--) {
    if (
      buffer[i] === 0x50 &&
      buffer[i + 1] === 0x4b &&
      buffer[i + 2] === 0x05 &&
      buffer[i + 3] === 0x06
    ) {
      return i;
    }
  }
  return -1;
}

function readU16(buf, off) {
  return buf.readUInt16LE(off);
}

function readU32(buf, off) {
  return buf.readUInt32LE(off);
}

/**
 * Extrai entradas de um Buffer ZIP.
 * @returns {{ nome: string, data: Buffer }[]}
 */
function lerZip(buffer, { maxEntry = MAX_ENTRY, maxFiles = MAX_FILES } = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) {
    throw Object.assign(new Error("ZIP inválido."), { status: 400 });
  }

  const eocd = findEocd(buffer);
  if (eocd < 0) {
    throw Object.assign(new Error("ZIP sem End of Central Directory."), { status: 400 });
  }

  const totalEntries = readU16(buffer, eocd + 10);
  const cdOffset = readU32(buffer, eocd + 16);
  const entradas = [];
  let offset = cdOffset;

  for (let i = 0; i < totalEntries && entradas.length < maxFiles; i++) {
    if (offset + 46 > buffer.length) break;
    if (readU32(buffer, offset) !== 0x02014b50) break;

    const method = readU16(buffer, offset + 10);
    const compressedSize = readU32(buffer, offset + 20);
    const uncompressedSize = readU32(buffer, offset + 24);
    const nameLen = readU16(buffer, offset + 28);
    const extraLen = readU16(buffer, offset + 30);
    const commentLen = readU16(buffer, offset + 32);
    const localOffset = readU32(buffer, offset + 42);
    const nome = buffer.slice(offset + 46, offset + 46 + nameLen).toString("utf8");
    offset += 46 + nameLen + extraLen + commentLen;

    if (!nome || nome.endsWith("/")) continue;
    if (uncompressedSize > maxEntry || compressedSize > maxEntry) {
      throw Object.assign(new Error(`Arquivo grande demais no ZIP: ${nome}`), { status: 413 });
    }

    if (localOffset + 30 > buffer.length) continue;
    if (readU32(buffer, localOffset) !== 0x04034b50) continue;

    const localNameLen = readU16(buffer, localOffset + 26);
    const localExtraLen = readU16(buffer, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);

    let data;
    if (method === 0) {
      data = Buffer.from(compressed);
    } else if (method === 8) {
      try {
        data = zlib.inflateRawSync(compressed);
      } catch (erro) {
        throw Object.assign(new Error(`Falha ao descomprimir ${nome}: ${erro.message}`), {
          status: 400
        });
      }
    } else {
      throw Object.assign(new Error(`Método ZIP não suportado (${method}) em ${nome}.`), {
        status: 400
      });
    }

    if (data.length > maxEntry) {
      throw Object.assign(new Error(`Arquivo grande demais no ZIP: ${nome}`), { status: 413 });
    }

    entradas.push({ nome: nome.replace(/\\/g, "/"), data });
  }

  return entradas;
}

module.exports = { lerZip };
