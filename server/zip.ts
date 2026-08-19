import type { GeneratedFile } from "./domain.ts";
import { safePath } from "./lib.ts";

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let checksum = value;
  for (let bit = 0; bit < 8; bit += 1) checksum = (checksum & 1) ? 0xedb88320 ^ (checksum >>> 1) : checksum >>> 1;
  return checksum >>> 0;
});

function crc32(content: Buffer): number {
  let checksum = 0xffffffff;
  for (const byte of content) checksum = crcTable[(checksum ^ byte) & 0xff] ^ (checksum >>> 8);
  return (checksum ^ 0xffffffff) >>> 0;
}

export function createProjectZip(files: GeneratedFile[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const path = Buffer.from(safePath(file.path), "utf8");
    const content = Buffer.from(file.content, "utf8");
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(path.length, 26);
    localParts.push(local, path, content);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(content.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(path.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, path);
    offset += local.length + path.length + content.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}
