import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';

const project = path.dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(
	fs.readFileSync(path.join(project, 'assets/workspace-snapshots.json'), 'utf8')
);
const phone = process.argv.includes('--phone');
const device = phone ? 'phone' : 'desktop';
const width = phone ? 360 : 1200;
const height = phone ? 600 : 720;
const scale = phone ? 2 : 1.2;
// The capture is enlarged without changing the product's logical viewport.
const viewportCss = (css) => {
	const root = postcss.parse(css);
	root.walkAtRules('media', (rule) => {
		rule.params = rule.params.replace(
			/(\d*\.?\d+)(px|rem|em)\b/g,
			(_, value, unit) => `${Number(value) * scale}${unit}`
		);
	});
	root.walkDecls((rule) => {
		rule.value = rule.value.replace(
			/(\d*\.?\d+)(dvh|dvw|vh|vw)\b/g,
			(_, value, unit) => `${Number(value) / scale}${unit}`
		);
	});
	return root.toString();
};
const scenes = ['board', 'page', 'chat'];
const markup = scenes
	.map((scene) => {
		const fragment = JSDOM.fragment(snapshots[`${device}-${scene}`].html);
		for (const element of fragment.querySelectorAll('[id]')) element.id = `${scene}-${element.id}`;
		const firstColumn = fragment.querySelector(
			'[data-kanban-board-root] [data-is-dnd-shadow-item-hint]'
		);
		if (firstColumn) firstColumn.parentElement.classList.add('film-columns');
		const holder = fragment.ownerDocument.createElement('div');
		holder.append(fragment);
		return `<div class="snapshot scene-${scene}">${holder.innerHTML}</div>`;
	})
	.join('');
const styleMap = new Map();
for (const scene of scenes)
	for (const style of JSDOM.fragment(snapshots[`${device}-${scene}`].head).querySelectorAll(
		'style'
	)) {
		style.textContent = viewportCss(style.textContent);
		styleMap.set(style.id, style.outerHTML);
	}
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kainbu workspace</title><link rel="stylesheet" href="assets/product.css"><script src="assets/gsap.min.js"></script>${[...styleMap.values()].join('')}<style>
*{box-sizing:border-box}html,body{margin:0;width:${width * scale}px;height:${height * scale}px;overflow:hidden}body{font-family:Inter,Arial,sans-serif;color:#eeeef2}#root{position:relative;width:100%;height:100%;overflow:hidden}.ground{position:absolute;inset:0;background:#101012}.clip{position:absolute;inset:0}.stage{position:absolute;width:${width}px;height:${height}px;transform:scale(${scale});transform-origin:top left;--safe-top:0px;--safe-bottom:0px;--safe-left:0px;--safe-right:0px;--color-app-bg:#101012;--color-app-surface:#19191c;--color-app-column:#141417;--color-app-surface-hover:#27272c;--color-app-element:#222226;--color-app-border:#323239;--color-app-text:#eeeef2;--color-app-subtext:#b0b0bb;--color-app-primary:#92aeed;--color-app-accent:#92aeed}.snapshot{position:absolute;inset:0;overflow:hidden}.snapshot>div{height:100%!important}.snapshot *{animation:none!important;transition:none!important}.scene-board .chat-orb__gooey{filter:url(#board-chat-orb-gooey)}.scene-page .chat-orb__gooey{filter:url(#page-chat-orb-gooey)}.scene-chat .chat-orb__gooey{filter:url(#chat-chat-orb-gooey)}.pointer{position:absolute;width:20px;height:25px;z-index:80;filter:drop-shadow(0 2px 3px #0008)}.tap{position:absolute;width:32px;height:32px;border:1px solid #e1e9f4;border-radius:50%;z-index:80;pointer-events:none}.snapshot .sr-only{display:none!important}
</style></head><body><div id="root" data-composition-id="workspace" data-start="0" data-duration="18" data-width="${width * scale}" data-height="${height * scale}"><div id="film-background" class="ground clip" data-start="0" data-duration="18" data-track-index="0"></div><div id="product-scene" class="clip" data-start="0" data-duration="18" data-track-index="1"><div class="stage">${markup}${phone ? '' : `<div class="pointer" data-layout-ignore><svg viewBox="0 0 24 30"><path d="M3 2L4 23L10 17L15 27L19 25L14 15L22 14Z" fill="#f8fafc" stroke="#14151a" stroke-width="1.5"/></svg></div>`}<div class="tap" data-layout-ignore></div></div></div></div><script>
window.__timelines=window.__timelines||{};
const tl=gsap.timeline({paused:true,defaults:{ease:'power3.inOut'}});
gsap.set('.scene-page,.scene-chat',{opacity:0});gsap.set('.tap',{opacity:0,scale:.5});
${
	phone
		? `
tl.to('.scene-board .film-columns',{x:-312,duration:1},1.5);
tl.set('.tap',{x:164,y:556,opacity:.7,scale:.5},5.05).to('.tap',{scale:1.2,opacity:0,duration:.45},5.05);
`
		: `
gsap.set('.pointer',{x:1040,y:510,opacity:0});
const pages=document.querySelector('.scene-board [title="Pages"]').getBoundingClientRect();
const canvas=document.querySelector('.stage').getBoundingClientRect();
tl.to('.pointer',{opacity:1,duration:.4},.5).to('.pointer',{x:(pages.left-canvas.left+pages.width/2)/${scale},y:(pages.top-canvas.top+pages.height/2)/${scale},duration:1.3},3.6);
`
}
tl.to('.scene-board',{opacity:0,duration:.3},5.4).fromTo('.scene-page',{opacity:0,y:12},{opacity:1,y:0,duration:.55},5.4);
${
	phone
		? `
tl.to('.scene-page .tiptap',{y:-235,duration:1.5},7.1);
tl.set('.tap',{x:284,y:556,opacity:.7,scale:.5},10.05).to('.tap',{scale:1.2,opacity:0,duration:.45},10.05);
`
		: `
tl.to('.pointer',{opacity:0,duration:.35},5.55);
tl.set('.pointer',{x:1080,y:590},8.9).to('.pointer',{opacity:1,duration:.3},8.9);
const orb=document.querySelector('.scene-page .chat-orb');const stage=document.querySelector('.stage');
const o=orb.getBoundingClientRect(),s=stage.getBoundingClientRect();
const ox=(o.left-s.left)/${scale}+o.width/${scale}/2,oy=(o.top-s.top)/${scale}+o.height/${scale}/2;
tl.to('.pointer',{x:ox,y:oy,duration:.8},9.2);
tl.to('.scene-page .chat-orb',{scale:.91,duration:.12},10.1).to('.scene-page .chat-orb',{scale:1.05,duration:.22},10.22);
`
}
tl.to('.scene-page',{opacity:0,duration:.3},10.5).fromTo('.scene-chat',{opacity:0,x:12},{opacity:1,x:0,duration:.6},10.5);
${phone ? '' : "tl.to('.pointer',{opacity:0,duration:.3},10.7);"}
tl.to('.scene-chat',{opacity:0,duration:.5},15.8).to('.scene-board',{opacity:1,duration:.5},15.8);
${phone ? "tl.to('.scene-board .film-columns',{x:0,duration:.8},16.3);" : ''}
window.__timelines.workspace=tl;
</script></body></html>`;
if (phone) {
	fs.mkdirSync(path.join(project, 'phone/assets'), { recursive: true });
	fs.copyFileSync(
		path.join(project, 'assets/gsap.min.js'),
		path.join(project, 'phone/assets/gsap.min.js')
	);
}
fs.writeFileSync(
	path.join(project, phone ? 'phone/assets/product-film.css' : 'assets/product-film.css'),
	viewportCss(fs.readFileSync(path.join(project, 'assets/product.css'), 'utf8'))
);
fs.writeFileSync(
	path.join(project, phone ? 'phone/index.html' : 'index.html'),
	html.replace('href="assets/product.css"', 'href="assets/product-film.css"')
);
console.log(`Built ${device} film using the complete product workspace.`);
