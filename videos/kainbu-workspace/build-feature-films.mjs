import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import postcss from 'postcss';

const root = path.dirname(fileURLToPath(import.meta.url));
const snapshots = JSON.parse(fs.readFileSync(path.join(root, 'assets/workspace-snapshots.json'), 'utf8'));
const scale = 1.2;
const canvas = { width: 1440, height: 864 };
const durations = { ai: 14, manual: 9, notes: 11, agent: 9 };

function scaledCss(css) {
	const sheet = postcss.parse(css);
	sheet.walkAtRules('media', (rule) => {
		rule.params = rule.params.replace(/(\d*\.?\d+)(px|rem|em)\b/g, (_, n, unit) => `${Number(n) * scale}${unit}`);
	});
	sheet.walkDecls((decl) => {
		decl.value = decl.value.replace(/(\d*\.?\d+)(dvh|dvw|vh|vw)\b/g, (_, n, unit) => `${Number(n) / scale}${unit}`);
	});
	return sheet.toString();
}

function productScene(key) {
	const source = key === 'ai' ? 'board-chat' : 'board';
	const snapshot = snapshots[`desktop-${source}`];
	const fragment = JSDOM.fragment(snapshot.html);
	let extraMarkup = '';
	if (key === 'ai') {
		const composer = fragment.querySelector('[data-chat-composer]');
		const request = 'We open the beta on Friday. The homepage is underway, but I am worried we will miss something. Use the brief and board to make a must-ship plan with acceptance checks, then draft the announcement in a page.';
		composer.textContent = request;
		composer.setAttribute('rows', '4');
		composer.style.height = '112px';
		const model = fragment.querySelector('[aria-label="Choose model"] span');
		if (model) model.textContent = 'Claude Opus 5.5';
		fragment.querySelector('[aria-label="Send message"]')?.removeAttribute('disabled');
		const thread = fragment.querySelector('[data-chat-message-id]')?.parentElement;
		if (!thread) throw new Error('Chat thread markup changed');
		thread.classList.add('film-chat-thread');
		thread.querySelector('[data-chat-message-id]')?.remove();
		thread.insertAdjacentHTML('beforeend', `<div class="film-prior-user">Kainbu is for small teams who want one calm place for boards, notes, and AI.</div><div class="film-prior-ai"><span class="film-ai-orb"></span><p>That gives us a clear beta story. When are you opening it?</p></div><div class="film-current-user">${request}</div><div class="film-ai-progress"><span class="film-ai-orb"></span><span>Reading the launch brief and board…</span></div><div class="film-ai-response"><span class="film-ai-orb"></span><div><strong>Friday beta launch</strong><p class="film-ai-summary">I kept the homepage in progress, tightened the story and mobile cards, and added two must-ship tasks with acceptance checks.</p><div class="film-ai-checks"><b>Must ship before Friday</b><p><span>01</span> Test the first project — create a project, add a card, invite a teammate.</p><p><span>02</span> Verify sign-up — confirm the email arrives and opens the workspace.</p></div><p class="film-ai-draft"><b>Drafted in Beta launch brief</b><br>“Meet Kainbu: a shared home for projects, with boards and notes together and AI ready to help.”</p></div></div>`);
		const story = fragment.querySelector('[data-task-id="story"]');
		const smallScreens = fragment.querySelector('[data-task-id="small-screens"]');
		const todo = fragment.querySelector('[data-column-viewport="todo"]');
		const homepage = fragment.querySelector('[data-task-id="homepage"]');
		if (!story || !smallScreens || !todo || !homepage) throw new Error('Board plan markup changed');
		fragment.querySelector('[data-column-viewport="done"]')?.parentElement.remove();
		const storyTitle = story.querySelector('.kainbu-prose p');
		story.classList.add('film-ai-card');
		storyTitle.classList.add('film-old-title');
		storyTitle.setAttribute('data-layout-allow-overlap', '');
		storyTitle.insertAdjacentHTML('afterend', '<p class="film-new-title" data-layout-allow-overlap>Publish beta announcement</p>');
		smallScreens.querySelector('.kainbu-prose p').classList.add('film-mobile-title');
		const homepageTag = homepage.querySelector('.kainbu-tag-tone');
		if (homepageTag) {
			const mustShip = homepageTag.cloneNode(true);
			mustShip.className = 'kainbu-tag-tone kainbu-tag-tone--red film-homepage-priority';
			mustShip.firstChild.textContent = 'Must ship ';
			homepageTag.parentElement.append(mustShip);
		}
		for (const [sourceCard, title, name] of [[story, 'Test the first project', 'onboarding'], [smallScreens, 'Verify sign-up', 'signup']]) {
			const card = sourceCard.cloneNode(true);
			card.removeAttribute('data-task-id');
			card.classList.remove('film-ai-card');
			card.querySelector('.film-new-title')?.remove();
			card.querySelector('.kainbu-prose p').textContent = title;
			card.querySelector('.kainbu-prose p').classList.remove('film-old-title', 'film-mobile-title');
			const tag = card.querySelector('.kainbu-tag-tone');
			if (tag) {
				tag.className = 'kainbu-tag-tone kainbu-tag-tone--red';
				tag.firstChild.textContent = 'Must ship ';
			}
			const slot = fragment.ownerDocument.createElement('div');
			slot.className = `film-plan-slot film-plan-${name}`;
			slot.append(card);
			todo.append(slot);
		}
		const page = JSDOM.fragment(snapshots['desktop-page'].html);
		for (const node of page.querySelectorAll('*')) if (node.childElementCount === 0 && node.textContent?.trim() === 'The launch brief') node.textContent = 'Beta launch brief';
		const editor = page.querySelector('.markdown-editor__surface .tiptap');
		if (!editor) throw new Error('Page editor markup changed');
		editor.innerHTML = '<h1>Friday beta launch</h1><p>For small teams who want one calm place for boards, notes, and AI.</p><h2>Announcement</h2><p>Meet Kainbu: a shared home for projects, with boards and notes together and AI ready to help. Open a workspace, bring in your team, and move the work forward.</p><h2>Must ship before Friday</h2><ul><li><p>First project: create a project, add a card, invite a teammate.</p></li><li><p>Sign-up: confirm the email arrives and opens the workspace.</p></li><li><p>Mobile: open the workspace at 390px with no blocked actions.</p></li></ul><p>Publish the announcement after these checks pass.</p>';
		for (const node of editor.querySelectorAll('h1,h2,p,li')) node.setAttribute('data-layout-allow-occlusion', '');
		for (const button of fragment.querySelectorAll('button')) if (button.textContent?.trim() === 'Add column') button.setAttribute('data-layout-allow-occlusion', '');
		const boardHolder = fragment.ownerDocument.createElement('div');
		boardHolder.className = 'product-snapshot film-ai-board';
		boardHolder.append(fragment);
		const pageHolder = page.ownerDocument.createElement('div');
		pageHolder.className = 'product-snapshot film-ai-page';
		pageHolder.append(page);
		return {
			markup: `${boardHolder.outerHTML}${pageHolder.outerHTML}`,
			styles: [...JSDOM.fragment(snapshot.head).querySelectorAll('style')].map((node) => { node.textContent = scaledCss(node.textContent); return node.outerHTML; }).join('')
		};
	}
	if (key === 'manual') {
		const card = fragment.querySelector('[data-task-id="story"]');
		const target = fragment.querySelector('[data-column-viewport="progress"]');
		if (!card || !target) throw new Error('Board columns changed');
		card.classList.add('film-source-card');
		card.querySelector('.kainbu-prose')?.insertAdjacentHTML('beforeend', '<div class="film-editbox"><span class="film-edit-text"></span><span class="film-caret"></span></div>');
		const landed = card.cloneNode(true);
		landed.removeAttribute('data-task-id');
		landed.classList.remove('film-source-card');
		landed.classList.add('film-landed-card');
		landed.querySelector('.kainbu-prose p').textContent = 'Draft the Kainbu story';
		landed.querySelector('.film-editbox')?.remove();
		target.prepend(landed);
		const ghost = landed.cloneNode(true);
		ghost.classList.remove('film-landed-card');
		ghost.classList.add('film-ghost');
		for (const node of [card, landed, ghost]) {
			for (const textNode of node.querySelectorAll('p,span,button')) textNode.setAttribute('data-layout-allow-overlap', '');
		}
		extraMarkup = `${ghost.outerHTML}<div class="film-drop-target"></div>`;
	}
	if (key === 'notes') {
		const page = JSDOM.fragment(snapshots['desktop-page'].html);
		const editor = page.querySelector('.markdown-editor__surface .tiptap');
		if (!editor) throw new Error('Page editor markup changed');
		for (const node of editor.querySelectorAll('h1,h2,h3,p,li')) node.setAttribute('data-layout-allow-occlusion', '');
		editor.insertAdjacentHTML('beforeend', '<p class="film-markdown-line"><span class="film-markdown-prefix"></span><span class="film-caret film-markdown-caret"></span></p><h1 class="film-note-added film-note-heading"><span class="film-note-title"></span><span class="film-caret film-title-caret"></span></h1><p class="film-note-added"><span class="film-note-body"></span><span class="film-caret film-body-caret"></span></p>');
		const boardHolder = fragment.ownerDocument.createElement('div');
		boardHolder.className = 'product-snapshot film-notes-board';
		boardHolder.append(fragment);
		const pageHolder = page.ownerDocument.createElement('div');
		pageHolder.className = 'product-snapshot film-notes-page';
		pageHolder.append(page);
		return {
			markup: `${boardHolder.outerHTML}${pageHolder.outerHTML}`,
			styles: [...JSDOM.fragment(snapshot.head).querySelectorAll('style')].map((node) => { node.textContent = scaledCss(node.textContent); return node.outerHTML; }).join('')
		};
	}
	const holder = fragment.ownerDocument.createElement('div');
	holder.append(fragment);
	const styles = [...JSDOM.fragment(snapshot.head).querySelectorAll('style')]
		.map((node) => { node.textContent = scaledCss(node.textContent); return node.outerHTML; })
		.join('');
	return { markup: `<div class="product-snapshot">${holder.innerHTML}</div>${extraMarkup}`, styles };
}

const terminal = `<div class="terminal-window">
  <div class="terminal-bar"><span class="traffic"><i></i><i></i><i></i></span><span>kainbu — agent session</span><span class="terminal-bar-right">Example workflow</span></div>
  <div class="terminal-screen">
    <div class="terminal-line agent-line"><span class="agent-mark">◆</span> Use the Kainbu skill to find the next task and finish it.</div>
    <div class="terminal-line terminal-read"><span class="dim">Read</span> <span class="path">.agents/skills/kainbu/SKILL.md</span></div>
    <div class="terminal-line terminal-cmd-one"><span class="prompt">~/kainbu ❯</span> <span class="terminal-typed-one"></span><span class="terminal-input-caret">▍</span></div>
    <div class="terminal-output terminal-list"><div><span class="ref">C1</span> <span class="name">To do</span></div><div class="indent"><span class="ref">T2</span> <span class="dim">[ ]</span> Review the mobile layout <span class="id">small-screens</span></div><div><span class="ref">C2</span> <span class="name">In progress</span></div><div class="indent"><span class="ref">T3</span> <span class="dim">[ ]</span> Design the homepage <span class="id">homepage</span></div></div>
    <div class="terminal-line terminal-work"><span class="agent-mark">◆</span> Check the small-screen layout, then update the task.</div>
    <div class="terminal-line terminal-edit"><span class="dim">Edit</span> <span class="path">src/routes/landing/+page.svelte</span> <span class="success">+ mobile spacing</span></div>
    <div class="terminal-line terminal-cmd-two"><span class="prompt">~/kainbu ❯</span> <span class="terminal-typed-two"></span><span class="terminal-input-caret">▍</span></div>
    <div class="terminal-line terminal-check"><span class="success">✓</span> svelte-check found 0 errors and 0 warnings</div>
    <div class="terminal-line terminal-cmd-three"><span class="prompt">~/kainbu ❯</span> <span class="terminal-typed-three"></span><span class="terminal-input-caret">▍</span></div>
    <div class="terminal-line terminal-done"><span class="success">✓ Updated</span> <span class="ref">T2</span> <span class="id">small-screens</span></div>
    <div class="terminal-line terminal-end"><span class="prompt">~/kainbu ❯</span><span class="terminal-caret"></span></div>
  </div>
</div>`;

const commonCss = `*{box-sizing:border-box}html,body{margin:0;width:1440px;height:864px;overflow:hidden}body{font-family:Inter,Arial,sans-serif;color:#eeeef2;background:#101012}#root{position:relative;width:100%;height:100%;overflow:hidden}.clip{position:absolute;inset:0}.stage{position:relative;width:1200px;height:720px;transform:scale(1.2);transform-origin:top left;--safe-top:0px;--safe-bottom:0px;--safe-left:0px;--safe-right:0px;--color-app-bg:#101012;--color-app-surface:#19191c;--color-app-column:#141417;--color-app-surface-hover:#27272c;--color-app-element:#222226;--color-app-border:#323239;--color-app-text:#eeeef2;--color-app-subtext:#b0b0bb;--color-app-primary:#92aeed;--color-app-accent:#92aeed}.product-snapshot{position:absolute;inset:0;overflow:hidden}.product-snapshot>div{height:100%!important}.product-snapshot *{animation:none!important;transition:none!important}.product-snapshot .sr-only{display:none!important}.film-user-message{max-width:92%;margin:12px 0 0 auto;padding:10px 12px;border:1px solid #424853;border-radius:12px;background:#292d35;color:#eff2f8;font-size:13px;line-height:1.5}.film-ai-response{display:flex;gap:9px;align-items:flex-start;margin-top:18px;color:#e8edf6;font-size:13px;line-height:1.5}.film-ai-orb{width:18px;height:18px;flex:none;border-radius:50%;background:#99b6f3;box-shadow:0 0 12px #8baaf188}.film-user-message,.film-ai-response{opacity:0}.film-ai-card .kainbu-prose{position:relative}.film-old-title{position:relative}.film-new-title{position:absolute;top:0;left:0;opacity:0;background:#19191c}.film-source-card .kainbu-prose{position:relative}.film-editbox{position:absolute;inset:-4px -2px auto;min-height:28px;padding:4px 5px;border:1px solid #92aeed;border-radius:4px;background:#19191c;box-shadow:0 0 0 2px #92aeed2a;color:#fff;opacity:0;font-size:14px}.film-caret{display:inline-block;width:1px;height:1.1em;margin-left:2px;background:#b5c9fa;vertical-align:-.15em}.film-landed-card{opacity:0}.film-ghost{position:absolute;z-index:90;margin:0;box-shadow:0 18px 40px #0009;opacity:0;pointer-events:none}.film-pointer{position:absolute;z-index:100;width:21px;height:27px;filter:drop-shadow(0 2px 3px #0008)}.film-note-added{opacity:0}.film-note-added .film-caret{background:#a4b9f1}`;
const interactionCss = `.film-pointer{left:0;top:0;opacity:0;pointer-events:none;transform-origin:3px 3px}.film-ghost{transform-origin:0 0;transition:none!important;animation:none!important}.film-drop-target{position:absolute;z-index:80;border:2px dashed #92aeed;border-radius:9px;background:#92aeed12;opacity:0;pointer-events:none}.film-notes-board,.film-notes-page{position:absolute;inset:0}.film-notes-page{opacity:0}.film-notes-page .tiptap{padding-bottom:360px!important}.film-notes-page .film-note-added{min-height:1em}.film-notes-page .film-caret{opacity:0}.film-notes-page .film-note-body{white-space:pre-wrap}`;
const featureCss = `.film-chat-thread{display:flex;flex-direction:column;gap:13px}.film-chat-thread>*{margin-top:0!important}.film-ai-board .desktop-chat-sidebar,.film-ai-board .desktop-chat-sidebar__panel{width:29rem!important}.film-ai-board [data-chat-composer]{font-size:15px!important;line-height:1.45!important}.film-prior-user,.film-current-user{max-width:92%;margin-left:auto;padding:10px 12px;border:1px solid #424853;border-radius:12px;background:#292d35;color:#eff2f8;font-size:14px;line-height:1.45}.film-current-user{opacity:0;font-size:15px}.film-prior-ai,.film-ai-progress{display:flex;align-items:flex-start;gap:9px;color:#e8edf6;font-size:14px;line-height:1.45}.film-ai-progress{opacity:0;color:#b9c8e2}.film-prior-ai p,.film-ai-response p{margin:0}.film-ai-response{margin-top:0;font-size:15px;line-height:1.42}.film-ai-response strong{display:block;margin-bottom:7px;font-size:17px;font-weight:650}.film-ai-response p+p{margin-top:9px}.film-ai-checks{margin-top:12px}.film-ai-checks b,.film-ai-draft b{font-size:13px;letter-spacing:.025em}.film-ai-checks p{margin-top:7px}.film-ai-checks p span{margin-right:5px;color:#91b2ed;font-weight:700}.film-ai-draft{margin-top:13px!important;padding-left:10px;border-left:2px solid #92aeed;color:#c8d8f3}.film-ai-page{opacity:0}.film-ai-page .tiptap{font-size:17px!important;line-height:1.58!important}.film-ai-page .tiptap h1{font-size:34px!important}.film-ai-page .tiptap h2{font-size:24px!important}.film-homepage-priority{opacity:0}.film-plan-slot{display:none;height:0;flex:none;overflow:hidden;opacity:0}.film-plan-slot>[role=button]{width:100%}.film-markdown-line{min-height:1.4em;opacity:0}.film-note-heading{display:none;margin:14px 0 10px!important;font-family:Georgia,serif!important;font-size:32px!important;font-weight:500!important;letter-spacing:-.035em;line-height:1.2!important}.film-note-heading .film-caret{height:1em}.film-markdown-prefix{font-weight:500}`;
const pointerMarkup = `<div class="film-pointer"><svg width="23" height="29" viewBox="0 0 23 29" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 2v21l5.2-5.2 3.7 8.4 4.2-1.9-3.7-8.1H20L2 2Z" fill="#F7FAFF" stroke="#17202E" stroke-width="1.8" stroke-linejoin="round"/></svg></div>`;
const terminalCss = `.terminal-window{position:absolute;left:75px;top:60px;width:1290px;height:744px;border:1px solid #41444c;border-radius:10px;overflow:hidden;background:#0e1117;box-shadow:0 28px 80px #0008;font-family:monospace}.terminal-bar{height:48px;display:flex;align-items:center;gap:20px;padding:0 20px;border-bottom:1px solid #2c333e;background:#1a1e27;color:#b8c2d1;font-size:15px}.traffic{display:flex;gap:9px}.traffic i{display:block;width:12px;height:12px;border-radius:50%;background:#ff5f57}.traffic i:nth-child(2){background:#febc2e}.traffic i:nth-child(3){background:#28c840}.terminal-bar-right{margin-left:auto;color:#7f8c9e}.terminal-screen{padding:32px 40px;font-size:20px;line-height:1.65;white-space:nowrap}.terminal-line,.terminal-output{opacity:0}.terminal-output{padding:4px 0 8px 28px}.terminal-output .indent{padding-left:22px}.prompt{color:#77c7a3}.agent-mark{color:#c49af8}.dim{color:#8c96a7}.path{color:#8fc5e9}.ref{color:#f4ce75}.name{color:#7ac6df;font-weight:700}.id{color:#7b8797}.success{color:#81d5a2}.terminal-caret{display:inline-block;width:11px;height:22px;margin-left:10px;background:#a4cbb7;vertical-align:-4px}.terminal-input-caret{display:inline-block;color:#9dbba9}.terminal-work{margin-top:10px}.terminal-end{margin-top:10px}`;

function timeline(key) {
	if (key === 'ai') return `
const stage=document.querySelector('.stage'),board=document.querySelector('.film-ai-board'),page=document.querySelector('.film-ai-page');
const pointer=document.querySelector('.film-pointer'),send=board.querySelector('[aria-label="Send message"]');
gsap.set(stage,{scale:1.2});
const stageRect=stage.getBoundingClientRect(),sendRect=send.getBoundingClientRect(),pagesRect=board.querySelector('[title="Pages"]').getBoundingClientRect();
const sendX=(sendRect.left+sendRect.width/2-stageRect.left)/1.2,sendY=(sendRect.top+sendRect.height/2-stageRect.top)/1.2;
const pagesX=(pagesRect.left+pagesRect.width/2-stageRect.left)/1.2,pagesY=(pagesRect.top+pagesRect.height/2-stageRect.top)/1.2;
const chatScroller=document.querySelector('.film-chat-thread').parentElement;
const firstSlot=document.querySelector('.film-plan-onboarding'),secondSlot=document.querySelector('.film-plan-signup'),planSlots=[firstSlot,secondSlot];
gsap.set(planSlots,{display:'block',height:'auto',visibility:'hidden'});
const planHeights=planSlots.map(slot=>slot.getBoundingClientRect().height/1.2);
gsap.set(planSlots,{display:'none',height:0,opacity:0,visibility:'visible'});
const todoCount=document.querySelector('[data-column-viewport="todo"]').parentElement.querySelector('[aria-label="2 cards"]');
const chatEnd=Math.max(0,chatScroller.scrollHeight-chatScroller.clientHeight);
gsap.set(page,{x:56,opacity:0});
gsap.set(pointer,{x:sendX-95,y:sendY+45});
gsap.set('.film-current-user,.film-ai-progress,.film-ai-response,.film-new-title',{opacity:0});
gsap.set('.film-ai-response > div > *',{opacity:0,y:8});
tl.to(pointer,{opacity:1,duration:.2},.25)
  .to(pointer,{x:sendX,y:sendY,duration:.7,ease:'power2.inOut'},.3)
  .to([pointer,send],{scale:.86,duration:.09,yoyo:true,repeat:1},1.05)
  .fromTo('.film-current-user',{opacity:0,y:12},{opacity:1,y:0,duration:.42},1.26)
  .set('[data-chat-composer]',{value:''},1.7)
  .to(pointer,{opacity:0,duration:.18},1.75)
  .fromTo('.film-ai-progress',{opacity:0,y:8},{opacity:1,y:0,duration:.3},2.05)
  .to('.film-ai-progress',{opacity:0,duration:.25},3.18)
  .set('.film-ai-progress',{display:'none'},3.45)
  .fromTo('.film-ai-response',{opacity:0,y:12},{opacity:1,y:0,duration:.38},3.45)
  .to('.film-ai-response strong',{opacity:1,y:0,duration:.32},3.55)
  .to('.film-ai-response .film-ai-summary',{opacity:1,y:0,duration:.42},4.12)
  .to(chatScroller,{scrollTop:chatEnd,duration:2.2,ease:'power2.inOut'},3.65)
  .to('.film-homepage-priority',{opacity:1,duration:.35},4.35)
  .to('.film-old-title',{opacity:0,duration:.26},4.72)
  .to('.film-new-title',{opacity:1,duration:.26},4.72)
  .to('.film-ai-response .film-ai-checks',{opacity:1,y:0,duration:.42},5.0)
  .to('.film-mobile-title',{opacity:0,duration:.15},5.45)
  .set('.film-mobile-title',{textContent:'Check the mobile flow'},5.6)
  .to('.film-mobile-title',{opacity:1,duration:.2},5.6)
  .set(firstSlot,{display:'block'},6.12)
  .to(firstSlot,{height:planHeights[0],opacity:1,duration:.56,ease:'power2.out'},6.12)
  .set(todoCount,{textContent:'3'},6.7)
  .to('.film-ai-response .film-ai-draft',{opacity:1,y:0,duration:.5},6.72)
  .set(secondSlot,{display:'block'},7.12)
  .to(secondSlot,{height:planHeights[1],opacity:1,duration:.56,ease:'power2.out'},7.12)
  .set(todoCount,{textContent:'4'},7.7)
  .set(pointer,{x:pagesX+95,y:pagesY+48},8.35)
  .to(pointer,{opacity:1,duration:.2},8.4)
  .to(pointer,{x:pagesX,y:pagesY,duration:.68,ease:'power2.inOut'},8.52)
  .to(pointer,{scale:.86,duration:.09,yoyo:true,repeat:1},9.22)
  .to(board,{x:-45,opacity:0,duration:.7,ease:'power2.inOut'},9.46)
  .fromTo(page,{x:56,opacity:0},{x:0,opacity:1,duration:.7,ease:'power2.inOut',immediateRender:false},9.46)
  .to(pointer,{opacity:0,duration:.18},9.5)
  .fromTo('.film-ai-page .tiptap',{opacity:.45,y:12},{opacity:1,y:0,duration:.85,ease:'power2.out'},10.05);`;
	if (key === 'manual') return `
const stage=document.querySelector('.stage'),card=document.querySelector('.film-source-card'),landed=document.querySelector('.film-landed-card');
gsap.set(stage,{scale:1.2});
const ghost=document.querySelector('.film-ghost'),drop=document.querySelector('.film-drop-target'),pointer=document.querySelector('.film-pointer');
const sr=stage.getBoundingClientRect(),a=card.getBoundingClientRect(),b=landed.getBoundingClientRect();
const next=card.nextElementSibling,progressCards=[...landed.parentElement.children].filter(node=>node!==landed);
const sourceShift=(next.getBoundingClientRect().top-a.top)/1.2,destShift=(progressCards[0].getBoundingClientRect().top-b.top)/1.2;
const todoCount=card.closest('[data-column-viewport]').parentElement.querySelector('[aria-label="2 cards"]');
const progressCount=landed.closest('[data-column-viewport]').parentElement.querySelector('[aria-label="2 cards"]');
const sx=(a.left-sr.left)/1.2,sy=(a.top-sr.top)/1.2,dx=(b.left-a.left)/1.2,dy=(b.top-a.top)/1.2;
const gripX=sx+42,gripY=sy+20;
gsap.set(ghost,{left:sx,top:sy,width:a.width/1.2});
gsap.set(drop,{left:(b.left-sr.left)/1.2,top:(b.top-sr.top)/1.2,width:b.width/1.2,height:b.height/1.2});
gsap.set(landed,{display:'none'});
gsap.set(pointer,{x:gripX+92,y:gripY-70});
const edit=document.querySelector('.film-edit-text'),editState={n:0},editValue='Draft the Kainbu story';
tl.to(pointer,{opacity:1,duration:.2},.18)
  .to(pointer,{x:gripX,y:gripY,duration:.58,ease:'power2.inOut'},.26)
  .to(pointer,{scale:.86,duration:.08,yoyo:true,repeat:1},.91)
  .set('.film-source-card .kainbu-prose p',{opacity:0},.98)
  .fromTo('.film-editbox',{opacity:0,y:4},{opacity:1,y:0,duration:.22},1.02)
  .to(pointer,{opacity:0,duration:.16},1.16)
  .to(editState,{n:editValue.length,duration:1.35,ease:'none',onUpdate:()=>{edit.textContent=editValue.slice(0,Math.round(editState.n));}},1.3)
  .to('.film-editbox',{opacity:0,duration:.2},2.78)
  .set('.film-source-card .kainbu-prose p',{textContent:editValue},2.98)
  .to('.film-source-card .kainbu-prose p',{opacity:1,duration:.18},2.98)
  .set(pointer,{x:gripX+100,y:gripY+60},3.12)
  .to(pointer,{opacity:1,duration:.14},3.14)
  .to(pointer,{x:gripX,y:gripY,duration:.65,ease:'power2.inOut'},3.22)
  .to(stage,{scale:1.28,x:-8,y:-4,duration:2.6,ease:'power1.inOut'},3.4)
  .to(pointer,{scale:.84,duration:.09,yoyo:true,repeat:1},3.98)
  .set(card,{opacity:0},4.13)
  .set(card,{display:'none'},4.13)
  .set(next,{y:sourceShift},4.13)
  .to(next,{y:0,duration:.5,ease:'power3.out'},4.13)
  .set(todoCount,{textContent:'1'},4.13)
  .set(ghost,{opacity:.96},4.13)
  .to([ghost,pointer],{y:'-=8',duration:.16,ease:'power3.out'},4.14)
  .to(ghost,{scale:1.035,rotation:-2.2,boxShadow:'0 26px 50px #000b',duration:.16},4.14)
  .set(landed,{display:'block'},5.04)
  .set(progressCards,{y:-destShift},5.04)
  .to(progressCards,{y:0,duration:.52,ease:'power3.out'},5.04)
  .to(drop,{opacity:.6,duration:.2},5.17)
  .to(ghost,{x:dx*.34,y:dy*.16-29,duration:.55,ease:'power2.in'},4.4)
  .to(pointer,{x:gripX+dx*.34,y:gripY+dy*.16-29,duration:.55,ease:'power2.in'},4.4)
  .to(ghost,{x:dx*.72,y:dy*.66-25,duration:.6,ease:'none'},4.95)
  .to(pointer,{x:gripX+dx*.72,y:gripY+dy*.66-25,duration:.6,ease:'none'},4.95)
  .to(ghost,{x:dx,y:dy,duration:.5,ease:'power2.out'},5.55)
  .to(pointer,{x:gripX+dx,y:gripY+dy,duration:.5,ease:'power2.out'},5.55)
  .to(ghost,{rotation:0,duration:.38,ease:'power2.out'},5.67)
  .set(ghost,{opacity:0},6.05)
  .set(landed,{opacity:1,scale:.97},6.05)
  .set(progressCount,{textContent:'3'},6.05)
  .to(landed,{scale:1,duration:.25,ease:'back.out(1.45)'},6.05)
  .to(drop,{opacity:0,duration:.22},6.05)
  .to(pointer,{x:gripX+dx+75,y:gripY+dy-35,opacity:0,duration:.6,ease:'power2.out'},6.27);`;
	if (key === 'notes') return `
const stage=document.querySelector('.stage'),board=document.querySelector('.film-notes-board'),page=document.querySelector('.film-notes-page');
gsap.set(stage,{scale:1.2});
const pointer=document.querySelector('.film-pointer'),button=board.querySelector('[title="Pages"]');
const sr=stage.getBoundingClientRect(),br=button.getBoundingClientRect(),nr=page.querySelector('.film-markdown-line').getBoundingClientRect();
const bx=(br.left+br.width/2-sr.left)/1.2,by=(br.top+br.height/2-sr.top)/1.2;
const nx=(nr.left-sr.left)/1.2+7,ny=(nr.top-sr.top)/1.2-300+11;
gsap.set(page,{x:56,opacity:0});
gsap.set(pointer,{x:bx-135,y:by+150});
gsap.set('.film-title-caret,.film-body-caret',{opacity:0});
const heading=document.querySelector('.film-note-heading'),markdown=document.querySelector('.film-markdown-line');
const title=document.querySelector('.film-note-title'),body=document.querySelector('.film-note-body');
const titleValue='Launch checklist',bodyValue='Review the mobile layout before launch.';
const titleState={n:0},bodyState={n:0};
tl.to(pointer,{opacity:1,duration:.2},.25)
  .to(pointer,{x:bx,y:by,duration:.88,ease:'power2.inOut'},.42)
  .to([pointer,button],{scale:.86,duration:.09,yoyo:true,repeat:1},1.43)
  .to(board,{x:-45,opacity:0,duration:.65,ease:'power2.inOut'},1.77)
  .fromTo(page,{x:56,opacity:0},{x:0,opacity:1,duration:.65,ease:'power2.inOut',immediateRender:false},1.77)
  .to(stage,{scale:1.27,x:-8,y:-4,duration:2.5,ease:'power1.inOut'},1.8)
  .to(pointer,{opacity:0,duration:.18},1.8)
  .to(page.querySelector('.markdown-editor__surface').parentElement.parentElement,{scrollTop:300,duration:.85,ease:'power2.inOut'},2.6)
  .set(pointer,{x:nx+175,y:ny+90},3.52)
  .to(pointer,{opacity:1,duration:.15},3.55)
  .to(pointer,{x:nx,y:ny,duration:.8,ease:'power2.inOut'},3.65)
  .to(pointer,{scale:.86,duration:.08,yoyo:true,repeat:1},4.57)
  .set(markdown,{opacity:1},4.76)
  .set('.film-markdown-caret',{opacity:1},4.76)
  .to(pointer,{opacity:0,duration:.12},4.77)
  .set('.film-markdown-prefix',{textContent:'#'},4.98)
  .set(markdown,{display:'none'},5.34)
  .set(heading,{display:'block',opacity:1},5.34)
  .set('.film-markdown-caret',{opacity:0},5.34)
  .set('.film-title-caret',{opacity:1},5.34)
  .to(titleState,{n:titleValue.length,duration:1.48,ease:'none',onUpdate:()=>{title.textContent=titleValue.slice(0,Math.round(titleState.n));}},5.58)
  .set('.film-title-caret',{opacity:0},7.15)
  .set('.film-note-added:not(.film-note-heading)',{opacity:1},7.15)
  .set('.film-body-caret',{opacity:1},7.15)
  .to(bodyState,{n:bodyValue.length,duration:2.45,ease:'none',onUpdate:()=>{body.textContent=bodyValue.slice(0,Math.round(bodyState.n));}},7.28)
  .to('.film-note-added',{color:'#dce7ff',duration:.25},9.85);`;
	return `
const cues=['.agent-line','.terminal-read','.terminal-cmd-one','.terminal-list','.terminal-work','.terminal-edit','.terminal-cmd-two','.terminal-check','.terminal-cmd-three','.terminal-done','.terminal-end'];
const at=[.25,.85,1.35,2.3,3.08,3.58,4.12,4.86,5.56,6.9,7.45];
cues.forEach((sel,i)=>tl.fromTo(sel,{opacity:0,y:8},{opacity:1,y:0,duration:.24},at[i]));
function typeCommand(selector,value,start,duration){
  const node=document.querySelector(selector),state={n:0};
  tl.to(state,{n:value.length,duration,ease:'none',onUpdate:()=>{node.textContent=value.slice(0,Math.round(state.n));}},start);
}
typeCommand('.terminal-typed-one','kainbu ls --checked false',1.48,.72);
typeCommand('.terminal-typed-two','npm run check',4.24,.5);
typeCommand('.terminal-typed-three','kainbu task update T2 --checked true',5.7,1.03);
tl.set('.terminal-cmd-one .terminal-input-caret',{opacity:0},2.24)
  .set('.terminal-cmd-two .terminal-input-caret',{opacity:0},4.8)
  .set('.terminal-cmd-three .terminal-input-caret',{opacity:0},6.8);`;
}

for (const key of ['ai', 'manual', 'notes', 'agent']) {
	const dir = path.join(root, 'features', key);
	const assets = path.join(dir, 'assets');
	fs.mkdirSync(assets, { recursive: true });
	fs.copyFileSync(path.join(root, 'assets/gsap.min.js'), path.join(assets, 'gsap.min.js'));
	if (key !== 'agent') fs.writeFileSync(path.join(assets, 'product.css'), scaledCss(fs.readFileSync(path.join(root, 'assets/product.css'), 'utf8')));
	const scene = key === 'agent' ? { markup: terminal, styles: '' } : productScene(key);
	const duration = durations[key];
	const pointer = key === 'agent' ? '' : pointerMarkup;
	const sceneCss = key === 'agent' ? commonCss : commonCss.replace('transform:scale(1.2);transform-origin:top left', 'transform-origin:top left');
	const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Kainbu ${key} demo</title>${key === 'agent' ? '' : '<link rel="stylesheet" href="assets/product.css">'}<script src="assets/gsap.min.js"></script>${scene.styles}<style>${sceneCss}${interactionCss}${featureCss}${terminalCss}</style></head><body><div id="root" data-composition-id="kainbu-${key}" data-start="0" data-duration="${duration}" data-width="${canvas.width}" data-height="${canvas.height}"><div id="${key}-scene" class="clip" data-start="0" data-duration="${duration}" data-track-index="0"><div class="stage">${scene.markup}${pointer}</div></div></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true,defaults:{ease:'power2.out'}});${timeline(key)}window.__timelines['kainbu-${key}']=tl;</script></body></html>`;
	fs.writeFileSync(path.join(dir, 'index.html'), html);
	console.log(`Built ${key} feature composition`);
}
