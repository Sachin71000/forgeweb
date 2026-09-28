import type { MasterSpecification } from "./domain.ts";

export const GENERATED_GENERIC_TEMPLATE = "forgeweb-client-site-v2";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function hash(value: string): number {
  let result = 2166136261;
  for (const character of value.toLocaleLowerCase()) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function title(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().replace(/\b\w/g, (character) => character.toUpperCase());
}

function siteModel(specification: MasterSpecification) {
  const prompt = specification.prompt.toLocaleLowerCase();
  const explicitSections = ["home", "about", "services", "work", "portfolio", "pricing", "contact"].filter((section) => new RegExp(`\\b${section}\\b`, "i").test(prompt));
  const sections = [...new Set(["home", ...(explicitSections.length ? explicitSections.filter((section) => section !== "home") : ["services", "about", "contact"])])].slice(0, 6);
  if (!sections.includes("contact")) sections.push("contact");
  const excluded = /auth|security|quality|responsive|access|performance|administr|owner|technical/i;
  const serviceRequirements = specification.requirements.filter((requirement) => !excluded.test(requirement.title)).slice(0, 3);
  const services = (serviceRequirements.length >= 3 ? serviceRequirements : specification.requirements.slice(0, 3)).map((requirement, index) => ({
    number: String(index + 1).padStart(2, "0"),
    title: title(requirement.title),
    description: requirement.description,
  }));
  const headline = /basic|simple|clean|minimal/.test(prompt)
    ? "Simple by design. Ready for every screen."
    : /portfolio|creative|studio|designer/.test(prompt)
      ? "Distinct work, presented with intent."
      : /agency|marketing|brand/.test(prompt)
        ? "Ideas shaped into measurable impact."
        : /consult|advis|professional service/.test(prompt)
          ? "Clarity for the decisions that matter."
          : `${specification.productName}, built around what matters.`;
  const seed = hash(`${specification.prompt}|${specification.architecture.frontend.visualDirection ?? ""}`);
  const palette = [
    { background: "#f4f1e9", surface: "#fffdf8", ink: "#141915", muted: "#596059", accent: "#2457ff" },
    { background: "#0d1110", surface: "#151b18", ink: "#f3f5ef", muted: "#9ea9a1", accent: "#c9ff48" },
    { background: "#f5e8df", surface: "#fff7f0", ink: "#261b18", muted: "#74605a", accent: "#bc3f2d" },
  ][seed % 3];
  const layout = seed % 3;
  const inquiryRoute = specification.architecture.backend.routes?.map((route) => route.match(/^POST\s+(\/\S+)/i)?.[1]).find((route) => /inquir|contact|lead/i.test(route ?? "")) ?? "/api/records";
  return { sections, services, headline, palette, layout, inquiryRoute };
}

export function buildGenericFrontend(specification: MasterSpecification): { app: string; styles: string; preview: string } {
  const model = siteModel(specification);
  const name = specification.productName;
  const summary = specification.summary;
  const app = `// ${GENERATED_GENERIC_TEMPLATE}
import { useState, type FormEvent } from "react";
import { api } from "./lib/api.js";
import "./styles.css";

const sections = ${JSON.stringify(model.sections)};
const services = ${JSON.stringify(model.services)};
const inquiryRoute = ${JSON.stringify(model.inquiryRoute)};

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  async function submitInquiry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSending(true); setStatus("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    try { await api(inquiryRoute, { method: "POST", body: JSON.stringify(values) }); setStatus("Thanks — your message has been received."); form.reset(); }
    catch { setStatus("Your message is ready, but the API is unavailable. Please try again shortly."); }
    finally { setSending(false); }
  }
  return <div className="client-site layout-${model.layout}" data-forgeweb-template="${GENERATED_GENERIC_TEMPLATE}">
    <header className="site-nav"><a className="site-brand" href="#home">${escapeHtml(name)}</a><nav className={menuOpen ? "is-open" : ""} aria-label="Primary navigation">{sections.map((section) => <a href={\`#\${section}\`} onClick={() => setMenuOpen(false)} key={section}>{section}</a>)}</nav><button className="menu-toggle" type="button" aria-expanded={menuOpen} aria-label="Toggle navigation" onClick={() => setMenuOpen((value) => !value)}><span/><span/></button></header>
    <main><section className="hero" id="home"><div className="hero-index">Independent digital presence · {new Date().getFullYear()}</div><div className="hero-copy"><p className="kicker">${escapeHtml(name)}</p><h1>${escapeHtml(model.headline)}</h1><p>${escapeHtml(summary)}</p><div className="hero-actions"><a className="primary" href="#services">Explore what we do</a><a href="#contact">Start a conversation</a></div></div><div className="hero-art" aria-hidden="true"><i/><i/><span>${escapeHtml(name.slice(0, 1).toUpperCase())}</span></div></section>
      <section className="about" id="about"><p className="section-label">About</p><div><h2>Clear thinking.<br/>Thoughtful execution.</h2><p>${escapeHtml(summary)} Every detail is shaped to make the experience understandable, useful, and easy to act on.</p></div></section>
      <section className="services" id="services"><div className="section-heading"><p className="section-label">Services</p><h2>Focused on the work that moves you forward.</h2></div><div className="service-grid">{services.map((service) => <article key={service.number}><span>{service.number}</span><h3>{service.title}</h3><p>{service.description}</p></article>)}</div></section>
      <section className="contact" id="contact"><div><p className="section-label">Contact</p><h2>Have something in mind?</h2><p>Tell us where you want to go. We’ll respond with a clear next step.</p></div><form onSubmit={submitInquiry}><label>Name<input name="name" autoComplete="name" required /></label><label>Email<input name="email" type="email" autoComplete="email" required /></label><label>Message<textarea name="message" rows={4} required /></label><button type="submit" disabled={sending}>{sending ? "Sending…" : "Send enquiry"}</button><p role="status" aria-live="polite">{status}</p></form></section>
    </main><footer><a className="site-brand" href="#home">${escapeHtml(name)}</a><p>Designed around clarity, accessibility, and real customer intent.</p><a href="#home">Back to top ↑</a></footer>
  </div>;
}
`;
  const { background, surface, ink, muted, accent } = model.palette;
  const styles = `:root{font-family:Inter,ui-sans-serif,system-ui;color:${ink};background:${background};--bg:${background};--surface:${surface};--ink:${ink};--muted:${muted};--accent:${accent}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg)}button,input,textarea{font:inherit}a{color:inherit}.client-site{min-height:100vh;overflow:hidden}.site-nav{position:relative;z-index:10;display:grid;grid-template-columns:1fr auto;align-items:center;min-height:84px;padding:0 clamp(22px,5vw,76px);border-bottom:1px solid color-mix(in srgb,var(--ink) 16%,transparent)}.site-brand{font-size:.82rem;font-weight:850;letter-spacing:.12em;text-decoration:none;text-transform:uppercase}.site-nav nav{display:flex;gap:30px}.site-nav nav a{font-size:.74rem;text-decoration:none;text-transform:capitalize}.menu-toggle{display:none;border:0;background:transparent}.hero{position:relative;display:grid;min-height:calc(100vh - 84px);grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);align-items:center;gap:7vw;padding:80px clamp(22px,7vw,110px)}.hero-index,.kicker,.section-label{font-size:.64rem;font-weight:800;letter-spacing:.16em;text-transform:uppercase}.hero-index{position:absolute;top:28px;left:clamp(22px,7vw,110px);color:var(--muted)}.kicker,.section-label{color:var(--accent)}.hero h1{max-width:850px;margin:18px 0 26px;font:500 clamp(3.5rem,7.2vw,7.6rem)/.88 Georgia,serif;letter-spacing:-.055em}.hero-copy>p:not(.kicker){max-width:620px;color:var(--muted);font-size:1rem;line-height:1.75}.hero-actions{display:flex;align-items:center;gap:24px;margin-top:36px}.hero-actions a{font-size:.78rem;font-weight:700;text-underline-offset:5px}.hero-actions .primary{border-radius:99px;padding:15px 22px;color:var(--bg);background:var(--accent);text-decoration:none}.hero-art{position:relative;aspect-ratio:4/5;max-height:610px;background:var(--surface);box-shadow:0 35px 90px color-mix(in srgb,var(--ink) 14%,transparent);transform:rotate(2deg)}.hero-art:before{position:absolute;inset:8%;border:1px solid color-mix(in srgb,var(--ink) 24%,transparent);content:""}.hero-art i{position:absolute;width:46%;aspect-ratio:1;border-radius:50%;background:var(--accent);filter:blur(.2px)}.hero-art i:first-child{top:10%;right:8%;opacity:.85}.hero-art i:nth-child(2){bottom:10%;left:7%;background:color-mix(in srgb,var(--accent) 35%,var(--surface));}.hero-art span{position:absolute;z-index:1;inset:0;display:grid;place-items:center;font:500 clamp(8rem,16vw,17rem)/1 Georgia,serif;color:var(--ink);mix-blend-mode:difference}.about,.services,.contact{padding:clamp(80px,11vw,160px) clamp(22px,7vw,110px)}.about{display:grid;grid-template-columns:.35fr 1fr;gap:8vw;background:var(--surface)}.about>div{display:grid;grid-template-columns:1fr .7fr;gap:7vw;align-items:end}.about h2,.section-heading h2,.contact h2{margin:0;font:500 clamp(2.8rem,5.2vw,6rem)/.95 Georgia,serif;letter-spacing:-.045em}.about div p,.contact>div>p:last-child{color:var(--muted);line-height:1.75}.section-heading{display:grid;grid-template-columns:.35fr 1fr;gap:8vw}.section-heading h2{max-width:850px}.service-grid{display:grid;grid-template-columns:repeat(3,1fr);margin-top:70px;border-top:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.service-grid article{min-height:300px;padding:28px 28px 38px 0;border-right:1px solid color-mix(in srgb,var(--ink) 18%,transparent)}.service-grid article+article{padding-left:28px}.service-grid span{color:var(--accent);font-size:.68rem;font-weight:800}.service-grid h3{margin:70px 0 14px;font:500 1.7rem Georgia,serif}.service-grid p{color:var(--muted);font-size:.86rem;line-height:1.65}.contact{display:grid;grid-template-columns:1fr 1fr;gap:10vw;color:var(--surface);background:var(--ink)}.contact .section-label{color:var(--accent)}.contact>div>p:last-child{max-width:440px;color:color-mix(in srgb,var(--surface) 62%,transparent)}.contact form{display:grid;gap:17px}.contact label{display:grid;gap:8px;color:color-mix(in srgb,var(--surface) 70%,transparent);font-size:.7rem}.contact input,.contact textarea{border:0;border-bottom:1px solid color-mix(in srgb,var(--surface) 28%,transparent);border-radius:0;padding:12px 0;color:var(--surface);outline:none;background:transparent}.contact input:focus,.contact textarea:focus{border-color:var(--accent)}.contact button{justify-self:start;border:0;border-radius:99px;padding:14px 22px;color:var(--ink);background:var(--accent);font-weight:800;cursor:pointer}.contact [role=status]{min-height:1.2em;color:var(--accent);font-size:.76rem}footer{display:flex;align-items:center;justify-content:space-between;gap:30px;padding:35px clamp(22px,5vw,76px);border-top:1px solid color-mix(in srgb,var(--ink) 14%,transparent);font-size:.7rem}footer p{color:var(--muted)}.layout-1 .hero{grid-template-columns:.8fr 1.2fr}.layout-1 .hero-copy{order:2}.layout-1 .hero-art{order:1;transform:rotate(-2deg)}.layout-2 .hero{grid-template-columns:1fr}.layout-2 .hero-copy{position:relative;z-index:2;max-width:1050px}.layout-2 .hero-art{position:absolute;right:7vw;width:min(35vw,450px);opacity:.32;transform:rotate(8deg)}@media(max-width:760px){.site-nav{min-height:72px}.site-nav nav{position:absolute;top:72px;right:0;left:0;display:none;flex-direction:column;gap:0;padding:14px 22px 24px;border-bottom:1px solid color-mix(in srgb,var(--ink) 16%,transparent);background:var(--bg)}.site-nav nav.is-open{display:flex}.site-nav nav a{padding:13px 0}.menu-toggle{display:grid;width:42px;height:42px;place-content:center;gap:6px}.menu-toggle span{display:block;width:20px;height:1px;background:var(--ink)}.hero,.layout-1 .hero{min-height:auto;grid-template-columns:1fr;padding-top:90px}.layout-1 .hero-copy,.layout-1 .hero-art{order:initial}.hero-art{width:82%;justify-self:end;max-height:none}.hero-actions{align-items:flex-start;flex-direction:column}.about,.about>div,.section-heading,.contact{grid-template-columns:1fr}.service-grid{grid-template-columns:1fr}.service-grid article,.service-grid article+article{min-height:auto;border-right:0;border-bottom:1px solid color-mix(in srgb,var(--ink) 18%,transparent);padding:26px 0}.service-grid h3{margin-top:35px}footer{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`;
  const navHtml = model.sections.map((section) => `<a href="#${escapeHtml(section)}">${escapeHtml(title(section))}</a>`).join("");
  const servicesHtml = model.services.map((service) => `<article><span>${service.number}</span><h3>${escapeHtml(service.title)}</h3><p>${escapeHtml(service.description)}</p></article>`).join("");
  const preview = `<!doctype html>
<!-- ${GENERATED_GENERIC_TEMPLATE} -->
<html lang="en" data-forgeweb-template="${GENERATED_GENERIC_TEMPLATE}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${escapeHtml(summary)}"><title>${escapeHtml(name)}</title><style>${styles}</style></head><body><div class="client-site layout-${model.layout}"><header class="site-nav"><a class="site-brand" href="#home">${escapeHtml(name)}</a><nav aria-label="Primary navigation">${navHtml}</nav><button class="menu-toggle" type="button" aria-expanded="false" aria-label="Toggle navigation" data-action="menu"><span></span><span></span></button></header><main><section class="hero" id="home"><div class="hero-index">Independent digital presence · 2026</div><div class="hero-copy"><p class="kicker">${escapeHtml(name)}</p><h1>${escapeHtml(model.headline)}</h1><p>${escapeHtml(summary)}</p><div class="hero-actions"><a class="primary" href="#services">Explore what we do</a><a href="#contact">Start a conversation</a></div></div><div class="hero-art" aria-hidden="true"><i></i><i></i><span>${escapeHtml(name.slice(0, 1).toUpperCase())}</span></div></section><section class="about" id="about"><p class="section-label">About</p><div><h2>Clear thinking.<br>Thoughtful execution.</h2><p>${escapeHtml(summary)} Every detail is shaped to make the experience understandable, useful, and easy to act on.</p></div></section><section class="services" id="services"><div class="section-heading"><p class="section-label">Services</p><h2>Focused on the work that moves you forward.</h2></div><div class="service-grid">${servicesHtml}</div></section><section class="contact" id="contact"><div><p class="section-label">Contact</p><h2>Have something in mind?</h2><p>Tell us where you want to go. We’ll respond with a clear next step.</p></div><form><label>Name<input name="name" autocomplete="name" required></label><label>Email<input name="email" type="email" autocomplete="email" required></label><label>Message<textarea name="message" rows="4" required></textarea></label><button type="submit" data-action="inquiry">Send enquiry</button><p role="status" aria-live="polite"></p></form></section></main><footer><a class="site-brand" href="#home">${escapeHtml(name)}</a><p>Designed around clarity, accessibility, and real customer intent.</p><a href="#home">Back to top ↑</a></footer></div><script>(()=>{const nav=document.querySelector('.site-nav nav');const menu=document.querySelector('[data-action="menu"]');menu.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';menu.setAttribute('aria-expanded',String(open));nav.classList.toggle('is-open',open)});nav.addEventListener('click',()=>{menu.setAttribute('aria-expanded','false');nav.classList.remove('is-open')});document.querySelector('form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;if(!form.reportValidity())return;const button=form.querySelector('button');const status=form.querySelector('[role="status"]');button.disabled=true;button.textContent='Sending…';setTimeout(()=>{status.textContent='Thanks — your message has been received.';button.textContent='Enquiry sent';form.reset()},180)})})();</script></body></html>`;
  return { app, styles, preview };
}
