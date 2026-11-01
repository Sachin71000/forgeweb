import { StitchToolClient } from "@google/stitch-sdk";
import { setTimeout as sleep } from "node:timers/promises";
import type { MasterSpecification } from "../domain.ts";
import { ApiError, now } from "../lib.ts";

export type StitchDesign = { projectId: string; screenId: string; html: string; createdAt: string; source?: "zip" | "api"; pageCount?: number };
export type StitchRequest = { projectId: string; screenId?: string; generationStarted?: boolean };
export interface StitchDesigner { design(specification: MasterSpecification, checkpoint?: (request: StitchRequest) => Promise<void>): Promise<StitchDesign> }
type ScreenData = { name?: string; id?: string; htmlCode?: { downloadUrl?: string }; html_code?: { download_url?: string } };
export interface StitchClient { callTool<T>(name: string, args: Record<string, unknown>): Promise<T>; close(): Promise<void> }

function screenIdentity(screen: ScreenData): string | undefined { return screen.id ?? screen.name?.split('/screens/')[1]; }
function screenUrl(screen: ScreenData): string | undefined { return screen.htmlCode?.downloadUrl ?? screen.html_code?.download_url; }

/** Refresh metadata on each attempt; cached generation URLs can expire. */
export async function retrieveStitchDesign(client: StitchClient, request: StitchRequest, delay: (ms: number) => Promise<unknown> = sleep, apiKey?: string): Promise<StitchDesign> {
  let lastFailure: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await delay(1500 * attempt);
    try {
      let screen: ScreenData | undefined;
      if (request.screenId) {
        screen = await client.callTool<ScreenData>('get_screen', { name: `projects/${request.projectId}/screens/${request.screenId}` });
      } else {
        const listed = await client.callTool<{ screens?: ScreenData[] }>('list_screens', { projectId: request.projectId });
        screen = listed.screens?.[0];
        if (!screen) {
          const project = await client.callTool<{ screenInstances?: Array<ScreenData & { screen?: ScreenData }> }>('get_project', { name: `projects/${request.projectId}` });
          const instance = project.screenInstances?.[0];
          screen = instance?.screen ?? instance;
        }
        const id = screen && screenIdentity(screen);
        if (id) { request.screenId = id; screen = await client.callTool<ScreenData>('get_screen', { name: `projects/${request.projectId}/screens/${id}` }); }
      }
      const url = screen && screenUrl(screen);
      if (!url || !request.screenId) throw new ApiError(503, 'STITCH_DESIGN_PENDING', 'Stitch has not exposed a downloadable screen yet. Open the saved project in Stitch, then retry or import its ZIP.');
      const html = await downloadStitchHtml(url, apiKey);
      return { projectId: request.projectId, screenId: request.screenId, html, source: 'api', createdAt: now() };
    } catch (error) {
      lastFailure = error;
      if (error instanceof ApiError && ['STITCH_ARTIFACT_INVALID', 'STITCH_ARTIFACT_TOO_LARGE'].includes(error.code)) throw error;
    }
  }
  if (lastFailure instanceof ApiError) throw lastFailure;
  throw new ApiError(503, 'STITCH_ARTIFACT_UNAVAILABLE', 'Stitch screen retrieval did not complete after three attempts. The project is preserved; retry or import its ZIP.');
}

export async function downloadStitchHtml(url: string, apiKey?: string): Promise<string> {
  const target = new URL(url);
  if (target.protocol !== "https:" || target.username || target.password || !["googleusercontent.com", "googleapis.com"].some((domain) => target.hostname === domain || target.hostname.endsWith('.' + domain))) {
    throw new ApiError(502, "STITCH_ARTIFACT_INVALID", "Stitch returned an untrusted artifact URL. Retry the design stage.");
  }
  // Current Stitch assets can be authenticated API resources, not public signed URLs.
  // Never forward the credential to image/storage hosts or across redirects.
  const response = await fetch(target, { redirect: "error", signal: AbortSignal.timeout(30_000), ...(target.hostname === 'stitch.googleapis.com' && apiKey ? { headers: { 'X-Goog-Api-Key': apiKey } } : {}) });
  if (!response.ok || !response.body) throw new ApiError(502, "STITCH_ARTIFACT_UNAVAILABLE", `Stitch design download returned HTTP ${response.status}. Generation is paused; check the design in Stitch and retry.`);
  const reader = response.body.getReader();
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 512_000) throw new ApiError(502, "STITCH_ARTIFACT_TOO_LARGE", "Stitch design exceeds the supported size. Retry with a simpler design.");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  let html = Buffer.concat(chunks).toString('utf8');
  if (response.headers.get('content-type')?.includes('application/json')) {
    let payload: unknown;
    try { payload = JSON.parse(html); }
    catch { throw new ApiError(502, 'STITCH_ARTIFACT_INVALID', 'Stitch returned an invalid artifact envelope.'); }
    if (!payload || typeof payload !== 'object' || !('dataString' in payload) || typeof payload.dataString !== 'string') {
      throw new ApiError(502, 'STITCH_ARTIFACT_INVALID', 'Stitch artifact envelope did not contain HTML dataString.');
    }
    html = payload.dataString;
  }
  if (Buffer.byteLength(html) > 512_000) throw new ApiError(502, 'STITCH_ARTIFACT_TOO_LARGE', 'Decoded Stitch design exceeds the supported size.');
  if (!/<html[\s>]/i.test(html) || !/<body[\s>]/i.test(html)) throw new ApiError(502, "STITCH_ARTIFACT_INVALID", "Stitch did not return a complete HTML design. Retry the design stage.");
  return html;
}

export function createStitchDesignerFromEnv(environment: Record<string, string | undefined> = process.env, options: { clientFactory?: (key: string) => StitchClient; delay?: (ms: number) => Promise<unknown> } = {}): StitchDesigner | undefined {
  if (environment.FORGEWEB_STITCH_ENABLED !== "true") return undefined;
  return {
    async design(specification, checkpoint) {
      if (!environment.STITCH_API_KEY?.trim()) throw new ApiError(503, "STITCH_NOT_CONFIGURED", "Stitch is required but its server-side key is missing. Add STITCH_API_KEY, then retry.");
      const client = options.clientFactory?.(environment.STITCH_API_KEY) ?? new StitchToolClient({ apiKey: environment.STITCH_API_KEY, timeout: 240_000 });
      try {
        const request: StitchRequest = { ...specification.stitchRequest, projectId: specification.stitchRequest?.projectId ?? '' };
        if (!request.projectId) {
          const project = await client.callTool<{ name?: string }>('create_project', { title: `ForgeWeb · ${specification.productName}` });
          if (!project.name?.match(/^projects\/[A-Za-z0-9_-]+$/)) throw new ApiError(502, 'STITCH_RESPONSE_INVALID', 'Stitch returned an invalid project identifier.');
          request.projectId = project.name.split('/')[1];
          await checkpoint?.({ ...request });
        }
        if (!request.generationStarted && !request.screenId) {
          request.generationStarted = true;
          await checkpoint?.({ ...request });
          const result = await client.callTool<{ outputComponents?: Array<{ design?: { screens?: ScreenData[] } }>; output_components?: Array<{ design?: { screens?: ScreenData[] } }> }>('generate_screen_from_text', { projectId: request.projectId, deviceType: 'DESKTOP', prompt: [
          "Design the customer's responsive website from this approved brief, not the ForgeWeb application. Honor explicit colors, layout, product name and navigation. Provide a coherent desktop design adaptable to mobile. Do not imply forms save data or external integrations exist.",
          JSON.stringify({ prompt: specification.prompt, productName: specification.productName, pages: specification.architecture.frontend.pages, visualDirection: specification.architecture.frontend.visualDirection, requirements: specification.requirements.map(({ title, description }) => ({ title, description })), seed: specification.designContext?.seed }),
          ].join('\n\n') });
          const screen = (result.outputComponents ?? result.output_components ?? []).flatMap((component) => component.design?.screens ?? [])[0];
          request.screenId = screen && screenIdentity(screen);
          await checkpoint?.({ ...request });
        }
        const design = await retrieveStitchDesign(client, request, options.delay, environment.STITCH_API_KEY);
        await checkpoint?.({ ...request, screenId: design.screenId });
        return design;
      } catch (error) {
        if (error instanceof ApiError) throw error;
        // Never expose SDK errors that can include credentials or signed URLs.
        throw new ApiError(503, "STITCH_UNAVAILABLE", "Stitch design could not complete. Generation is paused; the saved request will be checked on retry instead of creating a duplicate design. No frontend or backend was generated.");
      } finally { await client.close().catch(() => {}); }
    },
  };
}
