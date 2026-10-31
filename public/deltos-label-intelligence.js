/* Deltos local predictive label ranking: no message content is sent to third-party AI services. */
(function(root){
 'use strict';
 const THEMES = {
  finance:'invoice receipt payment purchase bank transfer credit debit refund deposit accounting tax salary money expense subscription',
  bills:'bill billing statement due payment invoice utility electricity water gas internet phone rent mortgage autopay overdue',
  legal:'legal attorney lawyer counsel case court litigation filing hearing subpoena contract evidence lawsuit settlement jurisdiction',
  va:'veterans veteran va benefits disability claim service connected compensation pension vba vso rating appeal military',
  storage:'storage unit lease facility locker rent gate access moving move in move out monthly climate controlled',
  travel:'flight airport itinerary hotel booking trip reservation ticket boarding passport airbnb rental',
  work:'job interview recruitment office employment payroll meeting employer project company client',
  medical:'doctor clinic pharmacy prescription health hospital appointment insurance patient treatment',
  insurance:'policy premium claim coverage deductible adjuster benefits insured',
  family:'family friends birthday children home spouse dinner personal',
  shopping:'order shipping delivery tracking package returns retail store product purchase',
  subscriptions:'newsletter membership subscription renewal monthly annual plan cancellation',
  education:'school university class course tuition homework assignment student college',
  government:'government agency federal state benefits application notice service public',
  security:'password verify login security alert authentication account recovery',
  property:'home house apartment rent lease property real estate tenant landlord mortgage',
  taxes:'irs income tax tax return w2 1099 refund filing deduction',
  utilities:'electricity water utility bill internet gas meter service payment',
  social:'social profile linkedin followers message invite community network',
  promotions:'promotion discount coupon sale offer deal advertisement marketing',
  updates:'update notification announcement notice news newsletter digest'
 };
 const COMMON=new Set('the and for with from have this that your you are was were will been they them our out not but has had can all now new please about here there into sent re fwd email mail com www https message to of a an in on at is it or as by my we'.split(' '));
 const normalize=t=>String(t||'').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
 const words=t=>normalize(t).split(/\s+/).filter(x=>x.length>2&&!COMMON.has(x));
 const keyOf=t=>normalize(t).replace(/\s+/g,'');
 const family=(label)=> {
   let name=normalize(label);
   let hits=[];
   for(const [topic,terms] of Object.entries(THEMES)){
     if(name.includes(topic)||topic.includes(name)&&name.length>2||
        words(name).some(word=>word.length>3&&terms.split(' ').includes(word)))hits.push(topic);
   }
   return hits;
 };
 function rank(message,labels,history=[],rules=[]){
  const sender=normalize(message?.sender||'');
  const address=String(message?.from||'').toLowerCase();
  const domain=(address.split('@')[1]||'').split('>')[0].split('.')[0]||'';
  const subject=normalize(message?.subject);
  const snippet=normalize((message?.body||message?.snippet||'').slice(0,5000));
  const combined=[sender,address,subject,snippet].join(' ');
  const titleWords=new Set(words(sender+' '+subject));
  const bodyWords=new Set(words(snippet));
  const mailWords=new Set(words(combined));
  const evidence=new Map();
  for(const other of history||[]){
    if(!other||other.id===message?.id)continue;
    const senderMatch=other.from&&String(other.from).toLowerCase()===address;
    const domainMatch=domain&&String(other.from||'').toLowerCase().includes('@'+domain+'.');
    if(!senderMatch&&!domainMatch)continue;
    for(const id of other.labels||[])evidence.set(id,(evidence.get(id)||0)+(senderMatch?22:7));
  }
  const feedback={};
  try{Object.assign(feedback,JSON.parse(localStorage.getItem('deltos-label-learning-v1')||'{}'))}catch{}
  const senderHash=hash(address);
  const valid=(labels||[]).filter(l=>l?.id&&l?.name&&!l.id.startsWith('CATEGORY_')&&!l.id.startsWith('SYSTEM_')&&!['INBOX','UNREAD','STARRED','TRASH','SPAM','SENT','DRAFT','IMPORTANT','CHAT','DELTOS_OPENED'].includes(l.id));
  return valid.map(label=>{
    const labelName=normalize(label.name);
    const labelWords=words(labelName);
    const themes=family(label.name);
    let score=evidence.get(label.id)||0;
    for(const word of labelWords){
      if(titleWords.has(word))score+=24;
      if(bodyWords.has(word))score+=8;
      if(domain.includes(word)||sender.includes(word))score+=14;
      if(word.length>4&&[...mailWords].some(w=>w!==word&&(w.startsWith(word)||word.startsWith(w))))score+=4;
    }
    if(labelName&&combined.includes(labelName))score+=16;
    for(const theme of themes){
      const terms=THEMES[theme].split(' ');
      let count=0;
      for(const term of terms){if(titleWords.has(term))count+=3;else if(bodyWords.has(term))count+=1;}
      score+=Math.min(36,count*3);
    }
    for(const rule of rules||[]){
      const assigned=(rule.action?.addLabelIds||[]).includes(label.id);
      if(!assigned)continue;
      const from=String(rule.criteria?.from||'').toLowerCase().trim();
      if(from&&(address===from||address.includes(from)||from.includes(domain)&&domain.length>3))score+=45;
    }
    score+=Math.min(90,Number(feedback[senderHash+':'+label.id])||0)*3;
    if((message.labels||[]).includes(label.id))score+=10;
    return {...label,score};
  }).sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,4).map(({score,...label})=>label);
 }
 function hash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return (h>>>0).toString(36);}
 function learn(message,labelId){
  const address=String(message?.from||'').toLowerCase();
  if(!address||!labelId)return;
  try{
   const storageKey='deltos-label-learning-v1',data=JSON.parse(localStorage.getItem(storageKey)||'{}');
   const key=hash(address)+':'+labelId;data[key]=Math.min(30,(Number(data[key])||0)+1);
   const entries=Object.entries(data);if(entries.length>300)for(const [oldKey] of entries.slice(0,entries.length-300))delete data[oldKey];
   localStorage.setItem(storageKey,JSON.stringify(data));
  }catch{}
 }
 root.DeltosLabelIntelligence={rank,learn};
})(typeof window!=='undefined'?window:globalThis);
