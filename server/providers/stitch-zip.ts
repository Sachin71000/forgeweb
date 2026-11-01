import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { posix } from "node:path";
import { ApiError, digest, now } from "../lib.ts";
import type { StitchDesign } from "./stitch-design.ts";

export const MAX_STITCH_ZIP = 8 * 1024 * 1024;
const invalid = (message: string) => new ApiError(400, "INVALID_STITCH_ZIP", message);

/** Reads into bounded memory only. Never extracts or executes archive contents. */
export async function importStitchZip(buffer: Buffer): Promise<StitchDesign> {
  if (!buffer.length || buffer.length > MAX_STITCH_ZIP) throw invalid("Stitch ZIP must be between 1 byte and 8 MiB.");
  const files = await new Promise<Map<string, Buffer>>((resolve, reject) => {
    let zip: ZipFile | undefined;
    let count = 0, expanded = 0;
    const files = new Map<string, Buffer>();
    const names = new Set<string>();
    const fail = (error: unknown) => { zip?.close(); reject(error instanceof ApiError ? error : invalid("The archive is corrupt or unsupported.")); };
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (error, archive) => {
      if (error || !archive) { fail(error); return; }
      zip = archive;
      zip.on('error', fail);
      zip.on('end', () => resolve(files));
      zip.on('entry', (entry: Entry) => {
        const path = entry.fileName;
        const parts = path.split('/');
        if (++count > 200 || !path || path.startsWith('/') || /^[a-z]:/i.test(path) || parts.includes('..') || path.includes('\\') || /[\x00-\x1f]/.test(path) || names.has(path.toLowerCase()) || parts.some((part) => /^\.env(?:\.|$)|^\.git$/i.test(part)) || ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000 || (entry.generalPurposeBitFlag & 1)) {
          fail(invalid("Archive contains unsafe, duplicate, encrypted or too many entries.")); return;
        }
        names.add(path.toLowerCase());
        expanded += entry.uncompressedSize;
        if (entry.uncompressedSize > 2 * 1024 * 1024 || expanded > 16 * 1024 * 1024) { fail(invalid("Archive exceeds expanded size limits.")); return; }
        if (!/\.(html?|css|png|jpe?g|webp|gif)$/i.test(path)) { zip!.readEntry(); return; }
        zip!.openReadStream(entry, (error, stream) => {
          if (error || !stream) { fail(error); return; }
          let size = 0;
          const chunks: Buffer[] = [];
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > entry.uncompressedSize || size > 2 * 1024 * 1024) { stream.destroy(); fail(invalid("Archive entry exceeded its declared size.")); return; }
            chunks.push(chunk);
          });
          stream.on('end', () => { files.set(path, Buffer.concat(chunks)); zip!.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
  const pages = [...files.keys()].filter((path) => /\.html?$/i.test(path));
  if (!pages.length) throw invalid("Export HTML/code from Stitch. This ZIP contains no HTML design.");
  pages.sort((a, b) => Number(!/(^|\/)index\.html?$/i.test(a)) - Number(!/(^|\/)index\.html?$/i.test(b)) || a.localeCompare(b));
  const resolveAsset = (base: string, ref: string) => {
    if (/^(?:[a-z]+:|\/\/|#|\/)/i.test(ref)) return undefined;
    const path = posix.normalize(posix.join(posix.dirname(base), ref.split(/[?#]/)[0]));
    return path.startsWith('../') ? undefined : path;
  };
  const prepared = pages.map((page) => {
    let html = files.get(page)!.toString('utf8');
    if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw invalid("The ZIP contains an incomplete HTML page.");
    html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const inlineImage = (base: string, reference: string) => {
      const path = resolveAsset(base, reference);
      const bytes = path ? files.get(path) : undefined;
      const extension = path?.match(/\.(png|jpe?g|webp|gif)$/i)?.[1].toLowerCase();
      if (!bytes || !extension) return reference;
      if (bytes.length > 64_000) return reference; // Large images stay references, not oversized model input.
      return `data:image/${extension === 'jpg' ? 'jpeg' : extension};base64,${bytes.toString('base64')}`;
    };
    html = html.replace(/(<img\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/gi, (_match, before, reference, after) => `${before}${inlineImage(page, reference)}${after}`);
    html = html.replace(/<link\b[^>]*>/gi, (tag) => {
      const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i)?.[1];
      if (!href || !/\.css(?:[?#]|$)/i.test(href)) return tag;
      const path = resolveAsset(page, href);
      if (!path) return tag;
      const css = files.get(path);
      if (!css) throw invalid("A referenced local stylesheet is missing from the ZIP.");
      const content = css.toString('utf8').replace(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi, (_match, reference) => `url("${inlineImage(path, reference)}")`);
      return `<style>/* ZIP stylesheet: ${path.replace(/[<>]/g, '')} */\n${content}</style>`;
    });
    return `<!-- Stitch ZIP page: ${page.replace(/[<>]/g, '')} -->\n${html}`;
  }).join('\n');
  if (Buffer.byteLength(prepared) > 400_000) throw invalid("Combined HTML/styles exceed the supported design size. Export fewer screens.");
  const hash = digest(buffer.toString('base64')).slice(-24);
  return { projectId: `zip-${hash}`, screenId: pages[0], html: prepared, createdAt: now(), source: "zip", pageCount: pages.length };
}
