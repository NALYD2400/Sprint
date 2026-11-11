const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { entry, projects } = require('./fixtures/ui.cjs');
(async()=>{
 const {createServer}=await import('vite');
 const server=await createServer({logLevel:'silent',server:{host:'127.0.0.1',port:0,strictPort:true}});
 await server.listen();
 const base='http://127.0.0.1:'+server.httpServer.address().port;
 const catalog=[...projects,{id:'api',name:'API locale',root:'D:/API',servers:[{id:'api-error',name:'API',command:'npm run api',port:4100,state:'error',lastExitReason:'Code de sortie 1',env:{}}]},{id:'empty',name:'Nouveau projet',root:'D:/Nouveau',servers:[]}];
 const uxEntry = entry.replace(JSON.stringify(projects),JSON.stringify(catalog)).replace('mockIPC((cmd, args) => {', `mockIPC((cmd, args) => {
  if (cmd === 'plugin:dialog|open') return 'D:/AddedProject';
  if (cmd === 'save_projects_cmd') for (const project of args.projects || []) {
    if (project.root === 'D:/AddedProject') window.__projectIcons[project.id] = window.__projectIcons.project1;
  }
 `);
 let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1320,height:860}});const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(base+'/**',async route=>{const url=new URL(route.request().url());if(url.pathname==='/__ux.js')return route.fulfill({contentType:'text/javascript',body:uxEntry});if(url.pathname==='/'){const response=await route.fetch();return route.fulfill({response,body:(await response.text()).replace(/src="\/src\/main\.jsx[^"]*"/,'src="/__ux.js"')});}return route.continue();});
  await page.route('https://api.github.com/**',route=>route.fulfill({json:{}}));
  await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({body:'',contentType:'text/css'}));
  await page.route(/^http:\/\/localhost:300[01]\//,route=>route.fulfill({body:'<meta charset="utf-8"><h1>Projet de démonstration</h1>',contentType:'text/html; charset=utf-8'}));
  await page.addInitScript(()=>{
   localStorage.setItem('sprint_ui_prefs',JSON.stringify({theme:'light',reduceMotion:'on'}));
   window.__projectIcons={project1:{dataUrl:'data:image/svg+xml;base64,'+btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="teal"/><path d="m9 16 5 5 9-11" fill="none" stroke="white" stroke-width="3"/></svg>')},api:{dataUrl:'data:image/png;base64,invalid'}};
  });
  await page.goto(base);const nav=page.getByRole('navigation',{name:'Pages'});
  await page.locator('.server-overview-row').first().waitFor();
  await page.locator('.server-overview-row[data-server-id="server1"] .project-avatar img').waitFor();
  assert.equal(await page.locator('.resource-chart').count(),0,'charts start collapsed');
  const search=page.getByRole('textbox',{name:'Rechercher un serveur'});
  await search.fill('3002');assert.equal(await page.locator('.server-overview-row').count(),1);
  await search.fill('introuvable');await page.getByText('Aucun serveur ne correspond à cette recherche.').waitFor();
  await page.getByRole('button',{name:'Afficher tous les serveurs',exact:true}).click();assert.equal(await search.inputValue(),'');
  await page.getByRole('button',{name:/Afficher les graphiques/}).click();assert.equal(await page.locator('.resource-chart').count(),2);
  await page.getByRole('button',{name:/Masquer les graphiques/}).click();
  await nav.getByRole('button',{name:'Projets',exact:true}).click();
  const logo=page.locator('[data-project-id="project1"] .project-section-header .project-avatar img');
  await logo.waitFor();
  assert.equal(await logo.evaluate(image=>image.complete && image.naturalWidth>0),true,'detected project logo loads');
  assert.equal(await page.locator('[data-project-id="project1"] .server-project-avatar img').count(),12,'server rows use the real project logo too');
  await page.waitForFunction(()=>document.querySelector('[data-project-id="api"] .project-section-header .project-avatar svg'));
  assert.equal(await page.locator('[data-project-id="api"] .project-avatar img').count(),0,'broken logo falls back to a framework icon');
  assert.equal(await page.locator('[data-project-id="empty"] .project-avatar svg').count(),1,'missing logo has a fallback');
  const filters=page.getByRole('group',{name:'Filtrer les projets'});
  await filters.getByRole('button',{name:/Favoris/}).click();await page.getByText('Épinglez un projet pour le retrouver ici.').waitFor();
  await page.getByRole('button',{name:'Afficher tous les projets'}).click();
  await page.getByRole('button',{name:'Épingler '+catalog[0].name,exact:true}).click();
  await filters.getByRole('button',{name:/Favoris/}).click();assert.equal(await page.locator('[data-project-id]').count(),1);
  await filters.getByRole('button',{name:/À vérifier/}).click();assert.equal(await page.locator('[data-project-id]').getAttribute('data-project-id'),'api');
  await filters.getByRole('button',{name:/Actifs/}).click();assert.equal(await page.locator('[data-project-id]').count(),1);
  await filters.getByRole('button',{name:/Tous/}).click();
  await page.getByRole('searchbox',{name:'Filtrer les projets'}).fill('4100');assert.equal(await page.locator('[data-project-id]').count(),1);
  await page.getByRole('searchbox',{name:'Filtrer les projets'}).fill('');
  const iconScans = await page.evaluate(()=>window.__commands.filter(item=>item.cmd==='get_project_icons_cmd').length);
  assert.equal(iconScans,1,'one shared icon scan across navigation');
  await page.getByRole('button',{name:'Nouveau',exact:true}).click();
  const addDialog = page.getByRole('dialog');
  await addDialog.getByRole('button',{name:'Parcourir',exact:true}).click();
  await addDialog.getByRole('button',{name:'Ajouter le projet',exact:true}).click();
  await addDialog.waitFor({state:'hidden'});
  const added = page.locator('[data-project-id]').filter({hasText:'AddedProject'});
  await added.locator('.project-section-header .project-avatar img').waitFor();
  assert.equal(await page.evaluate(()=>window.__commands.filter(item=>item.cmd==='get_project_icons_cmd').length),iconScans+1,'adding a project automatically rescans logos');
  await nav.getByRole('button',{name:'Tableau de bord',exact:true}).click();
  const addedRow=page.locator('.server-overview-row').filter({hasText:'AddedProject'});
  await addedRow.locator('.project-avatar img').waitFor();
  await nav.getByRole('button',{name:'Logs',exact:true}).click();
  await page.getByRole('button',{name:'Deux consoles',exact:true}).click();assert.equal(await page.locator('.terminal-panel').count(),2);
  for(const panel of await page.locator('.terminal-panel').all())assert.equal(await panel.locator('.console-selector').count(),1,'selector stays with its own console');
  await page.setViewportSize({width:960,height:620});
  for(const screen of await page.locator('.terminal-log-screen').all())assert.ok((await screen.boundingBox()).height>=150,'split consoles retain room for logs');
  await page.setViewportSize({width:1320,height:860});
  for(let i=0;i<12;i++)await page.evaluate(i=>window.__emit('server-log-line',{server_id:'server1',line:i===4?'Error: exemple à examiner':'Ligne de sortie '+i}),i);
  await nav.getByRole('button',{name:'Ports',exact:true}).click();await page.locator('.ports-table tbody tr').first().waitFor();
  await page.getByRole('textbox',{name:'Filtrer les ports'}).fill('introuvable');await page.getByRole('button',{name:'Afficher tous les ports'}).click();assert.ok(await page.locator('.ports-table tbody tr').count()>0);
  fs.mkdirSync('test-results',{recursive:true});
  for(const theme of ['light','dark']){
   await page.evaluate(async theme=>{const{applyPrefs,loadPrefs}=await import('/src/lib/prefs.js');applyPrefs({...loadPrefs(),theme});},theme);
   for(const [width,height]of[[1320,860],[960,620]]){
    await page.setViewportSize({width,height});
    for(const [id,label]of[['dashboard','Tableau de bord'],['projects','Projets'],['browser','Aperçu web'],['ports','Ports'],['terminal','Logs'],['settings','Paramètres']]){
     await page.getByRole('button',{name:label,exact:true}).first().click();
     await page.getByRole('heading',{name:label,exact:true}).first().waitFor();
     assert.ok(await page.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1),`${id} ${theme} ${width} horizontal overflow`);
     if(id==='browser'){const bounds=await page.locator('.preview-stage').boundingBox();assert.ok(bounds.height>=150,`${width} preview still usable: ${bounds.height}`);}
     if(id==='terminal'){const bounds=await page.locator('.terminal-panel').first().boundingBox();assert.ok(bounds.height>=250,`${width} console usable: ${bounds.height}`);}
     await page.screenshot({path:path.resolve(`test-results/ux-${theme}-${width}-${id}.png`)});
    }
   }
  }
  assert.deepEqual(errors,[]);console.log('Workspace UX: search, project filters, resources, console selection, recovery and 24 layout states passed.');
 }finally{await browser?.close();await server.close();}
})().catch(error=>{console.error(error);process.exit(1)});
