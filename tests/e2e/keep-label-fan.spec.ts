import {test,expect,type Page,type Locator} from '@playwright/test';

async function beginRightSwipe(page:Page,row:Locator){
 const box=await row.boundingBox();
 if(!box)throw Error('Swipe target not rendered');
 const sx=box.x+box.width*.5,sy=box.y+box.height*.5;
 await page.mouse.move(sx,sy);
 await page.mouse.down();
 await page.mouse.move(sx+85,sy,{steps:8});
 return {sx,sy};
}

async function releaseOn(page:Page,target:Locator){
 const box=await target.boundingBox();
 if(!box)throw Error('Bubble not rendered');
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:10});
 await page.mouse.up();
}


test('Only an active rightward drag opens the label fan, and release closes it',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await expect(row).toBeVisible();
 const id=await row.getAttribute('data-id');
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await row.focus();
 await page.keyboard.press('ArrowRight');
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await beginRightSwipe(page,row);
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toBeVisible();
 await expect(page.locator('.deltos-fan-choice:not(.deltos-fan-add)')).toHaveCount(4);
 await expect(page.getByRole('button',{name:'Create a new label'})).toBeVisible();
 await expect(page.locator('.compact-message[data-id="'+id+'"]')).toBeVisible();
 await page.mouse.up();
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('.compact-message[data-id="'+id+'"]')).toBeVisible();
});

test('New label bubble creates and applies a Gmail label in the demo',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await beginRightSwipe(page,row);
 await releaseOn(page,page.getByRole('button',{name:'Create a new label'}));
 await expect(page.getByRole('textbox',{name:'New Gmail label'})).toBeFocused();
 await page.getByRole('textbox',{name:'New Gmail label'}).fill('Storage Statements');
 await page.keyboard.press('Enter');
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText('Storage Statements');
});

test('Triage right-drag can release directly over a predicted bubble',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Triage',exact:true}).click();
 const card=page.locator('.deck-card.deck-top');
 await expect(card).toBeVisible();
 const original=await card.locator('.deck-subject').innerText();
 const box=await card.boundingBox();
 if(!box)throw Error('No deck position');
 const sx=box.x+box.width*.5,sy=box.y+box.height*.5;
 await page.mouse.move(sx,sy);
 await page.mouse.down();
 await page.mouse.move(sx+85,sy,{steps:8});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toBeVisible();
 const target=page.locator('.deltos-fan-choice[data-deltos-rank="1"]');
 await expect(target).toBeVisible();
 const targetBox=await target.boundingBox();
 if(!targetBox)throw Error('No prediction bubble');
 await page.mouse.move(targetBox.x+targetBox.width/2,targetBox.y+targetBox.height/2,{steps:10});
 await page.mouse.up();
 await expect(page.locator('.triage-notif')).toContainText('Archived into');
 await expect(page.locator('.deck-card.deck-top .deck-subject')).not.toHaveText(original);
});

test('The four prediction bubbles appear in the requested 3 / 1 / + / 2 / 4 arc',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await beginRightSwipe(page,row);
 const xy=async selector=>{
   const box=await page.locator(selector).boundingBox();
   if(!box)throw Error('Bubble not rendered: '+selector);
   return {x:box.x+box.width/2,y:box.y+box.height/2};
 };
 const [a,b,c,d,plus]=await Promise.all([
  xy('[data-deltos-rank="1"]'),xy('[data-deltos-rank="2"]'),
  xy('[data-deltos-rank="3"]'),xy('[data-deltos-rank="4"]'),
  xy('.deltos-fan-add')
 ]);
 expect(c.y).toBeLessThan(a.y);expect(a.y).toBeLessThan(plus.y);
 expect(plus.y).toBeLessThan(b.y);expect(b.y).toBeLessThan(d.y);
 expect(c.x).toBeLessThan(a.x);expect(a.x).toBeLessThan(plus.x);
 expect(d.x).toBeLessThan(b.x);expect(b.x).toBeLessThan(plus.x);
 await page.mouse.up();
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
});


test('The wider fan forms a rounded arc with separated circular targets on desktop, mobile and short screens',async({page})=>{
 for(const size of [{width:1280,height:800},{width:390,height:844},{width:900,height:580},{width:375,height:600}]){
  await page.setViewportSize(size);
  await page.goto('/');
  const row=page.locator('.compact-folder-inbox .compact-message').first();
  await expect(row).toBeVisible();
  await beginRightSwipe(page,row);
  await expect(page.locator('.deltos-fan-choice')).toHaveCount(5);
  await expect(page.locator('.deltos-fan-add')).toHaveCSS('left','0px');
  const boxes=await Promise.all(['3','1','new','2','4'].map(async rank=>{
   const selector=rank==='new'?'.deltos-fan-add':'[data-deltos-rank="'+rank+'"]';
   const box=await page.locator(selector).boundingBox();
   if(!box)throw Error('Missing fan bubble at '+size.width+'x'+size.height+': '+rank);
   expect(box.x).toBeGreaterThanOrEqual(3);
   expect(box.y).toBeGreaterThanOrEqual(3);
   expect(box.x+box.width).toBeLessThanOrEqual(size.width-3);
   expect(box.y+box.height).toBeLessThanOrEqual(size.height-3);
   return {rank,cx:box.x+box.width/2,cy:box.y+box.height/2,r:box.width/2};
  }));
  const [three,one,plus,two,four]=boxes;
  // Exact 25% size reduction relative to the previous fan at each breakpoint.
  const mobile=size.width<=600,short=size.height<=650;
  const circle=mobile?(short?48:51.75):(short?54:64.5);
  const addCircle=mobile?(short?48:50.25):58.5;
  await expect(page.locator('[data-deltos-rank="1"]')).toHaveCSS('width',circle+'px');
  await expect(page.locator('[data-deltos-rank="1"]')).toHaveCSS('height',circle+'px');
  await expect(page.locator('.deltos-fan-add')).toHaveCSS('width',addCircle+'px');
  await expect(page.locator('.deltos-fan-add')).toHaveCSS('height',addCircle+'px');
  // A true smooth circular arc has a consistent effective radius at both stations.
  const arcRadius=(point:{cx:number,cy:number})=>{
   const dx=plus.cx-point.cx,dy=plus.cy-point.cy;
   return (dx*dx+dy*dy)/(2*dx);
  };
  expect(Math.abs(arcRadius(one)-arcRadius(three))).toBeLessThan(13);
  expect(Math.abs(arcRadius(two)-arcRadius(four))).toBeLessThan(13);
  expect(three.cx).toBeLessThan(one.cx-45);
  expect(one.cx).toBeLessThan(plus.cx-15);
  expect(four.cx).toBeLessThan(two.cx-45);
  expect(two.cx).toBeLessThan(plus.cx-15);
  expect(three.cy).toBeLessThan(one.cy-40);
  expect(one.cy).toBeLessThan(plus.cy-40);
  expect(plus.cy).toBeLessThan(two.cy-40);
  expect(two.cy).toBeLessThan(four.cy-40);
  // Both arcs mirror vertically about the literal center of the + button.
  expect(Math.abs(plus.cy-(one.cy+two.cy)/2)).toBeLessThan(1);
  expect(Math.abs(plus.cy-(three.cy+four.cy)/2)).toBeLessThan(1);
  for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){
   const first=boxes[a],second=boxes[b];
   const distance=Math.hypot(first.cx-second.cx,first.cy-second.cy);
   expect(distance).toBeGreaterThan(first.r+second.r+4);
  }
  // Finish the gesture in empty viewport space, rather than over a label bubble.
  await page.mouse.move(10,10,{steps:8});
  await page.mouse.up();
  await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 }
});


test('Four predictive bubbles remain visible when the Gmail account has no user labels',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>{
  const engine=(window as any).DeltosLabelIntelligence;
  const realSuggest=engine.suggest;
  engine.suggest=(message:any,_labels:any[],history:any[],rules:any[])=>realSuggest(message,[],history,rules);
 });
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 await expect(row).toBeVisible();
 await beginRightSwipe(page,row);
 const choices=page.locator('.deltos-fan-choice:not(.deltos-fan-add)');
 await expect(choices).toHaveCount(4);
 await expect(page.getByRole('button',{name:'Create a new label'})).toBeVisible();
 const names=await choices.allTextContents();
 expect(new Set(names.map(n=>n.trim())).size).toBe(4);
 for(const name of names)expect(name.trim().length).toBeGreaterThan(1);
 // Selecting a suggested (not existing) label must create it and apply it.
 const first=choices.first();
 const chosen=(await first.innerText()).trim();
 await releaseOn(page,first);
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await expect(page.locator('#toast-root')).toContainText(chosen);
});

test('Prediction engine infers Storage and Bills from mail even without preexisting labels',async({page})=>{
 await page.goto('/');
 const suggestions=await page.evaluate(()=>{
  const engine=(window as any).DeltosLabelIntelligence;
  return engine.suggest({
   id:'example',sender:'Extra Space Storage',from:'billing@extraspace.com',
   subject:'Your monthly storage unit invoice is due',
   snippet:'Please pay your storage bill for this month.'
  },[],[],[]);
 });
 expect(suggestions).toHaveLength(4);
 expect(suggestions[0].name).toBe('Storage');
 expect(suggestions.some((l:{name:string})=>l.name==='Bills')).toBe(true);
 expect(suggestions.every((l:{createName:string})=>!!l.createName)).toBe(true);
});

test('The fan never appears on a left/up drag and closes on a decisive reversal',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 const box=await row.boundingBox();
 if(!box)throw Error('No inbox row');
 const sx=box.x+box.width/2,sy=box.y+box.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();
 await page.mouse.move(sx-90,sy,{steps:8});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await page.mouse.move(sx,sy-90,{steps:8});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await page.mouse.move(sx+90,sy,{steps:8});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toBeVisible();
 await page.mouse.move(sx-190,sy,{steps:12});
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
 await page.mouse.up();
 await expect(page.getByRole('group',{name:'Predictive Read and Keep labels'})).toHaveCount(0);
});

test('Triage fan is visible only while a card is actively swiped right',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Triage',exact:true}).click();
 const card=page.locator('.deck-card.deck-top');
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
 const box=await card.boundingBox();
 if(!box)throw Error('No triage card');
 const sx=box.x+box.width/2,sy=box.y+box.height/2;
 await page.mouse.move(sx,sy);await page.mouse.down();
 await page.mouse.move(sx-95,sy,{steps:8});
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
 await page.mouse.move(sx+85,sy,{steps:12});
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(5);
 await page.mouse.up();
 await expect(page.locator('.deltos-fan-choice')).toHaveCount(0);
 await expect(card).toBeVisible();
});

test('Inbox right-swipe fan disappears immediately at center and when turned vertically',async({page})=>{
 await page.goto('/');
 const row=page.locator('.compact-folder-inbox .compact-message').first();
 const {sx,sy}=await beginRightSwipe(page,row);
 const fan=page.getByRole('group',{name:'Predictive Read and Keep labels'});
 await expect(fan).toBeVisible();
 await page.mouse.move(sx+8,sy,{steps:7});
 await expect(fan).toHaveCount(0);
 await page.mouse.move(sx+95,sy,{steps:8});
 await expect(fan).toBeVisible();
 await page.mouse.move(sx+32,sy+185,{steps:10});
 await expect(fan).toHaveCount(0);
 await page.mouse.move(sx+95,sy,{steps:8});
 await expect(fan).toBeVisible();
 await page.mouse.up();
 await expect(fan).toHaveCount(0);
});

test('Triage right-swipe fan disappears at center and when direction changes',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Triage',exact:true}).click();
 const card=page.locator('.deck-card.deck-top');
 const {sx,sy}=await beginRightSwipe(page,card);
 const fan=page.getByRole('group',{name:'Predictive Read and Keep labels'});
 await expect(fan).toBeVisible();
 await page.mouse.move(sx+7,sy,{steps:8});
 await expect(fan).toHaveCount(0);
 await page.mouse.move(sx+95,sy,{steps:8});
 await expect(fan).toBeVisible();
 await page.mouse.move(sx+30,sy+170,{steps:10});
 await expect(fan).toHaveCount(0);
 await page.mouse.move(sx+95,sy,{steps:10});
 await expect(fan).toBeVisible();
 await page.mouse.move(12,12,{steps:10});
 await page.mouse.up();
 await expect(fan).toHaveCount(0);
});
