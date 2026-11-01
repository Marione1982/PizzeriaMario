const STORAGE_KEY = 'forno-di-casa-v1';
const seed = {
  eventDate: '', guests: 4,
  ingredients: [
    {id:'ing-1',name:'Mozzarella fiordilatte',unit:'pz'}, {id:'ing-2',name:'Pomodoro San Marzano',unit:'pz'},
    {id:'ing-3',name:'Basilico fresco',unit:'pz'}, {id:'ing-4',name:'Olio extravergine',unit:'qb'},
    {id:'ing-5',name:'Parmigiano Reggiano',unit:'g'}, {id:'ing-6',name:'Prosciutto cotto',unit:'pz'},
    {id:'ing-7',name:'Funghi champignon',unit:'pz'}, {id:'ing-8',name:'Olive nere',unit:'pz'},
    {id:'ing-9',name:'Salame piccante',unit:'pz'}, {id:'ing-10',name:'Gorgonzola',unit:'g'},
    {id:'ing-11',name:'Rucola',unit:'pz'}, {id:'ing-12',name:'Pomodorini',unit:'pz'}
  ],
  pizzas: [
    {id:'pizza-1',name:'Margherita',type:'rossa',ingredients:['ing-1','ing-2','ing-3','ing-4'],count:2},
    {id:'pizza-2',name:'Diavola',type:'rossa',ingredients:['ing-1','ing-2','ing-9'],count:1},
    {id:'pizza-3',name:'Quattro formaggi',type:'bianca',ingredients:['ing-1','ing-5','ing-10'],count:1},
    {id:'pizza-4',name:'Prosciutto e funghi',type:'rossa',ingredients:['ing-1','ing-2','ing-6','ing-7'],count:0},
    {id:'pizza-5',name:'Ortolana',type:'bianca',ingredients:['ing-1','ing-7','ing-11','ing-12'],count:0},
    {id:'pizza-6',name:'Marinara',type:'rossa',ingredients:['ing-2','ing-3','ing-4'],count:0}
  ], checked: []
};
let state;
try { state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(seed); } catch { state = structuredClone(seed); }
state.pizzas ||= []; state.ingredients ||= []; state.checked ||= []; state.events ||= []; state.activeEventId ||= null;
let currentFilter = 'tutte'; let toastTimer; let editingPizzaId=null; let editingIngredientId=null; let calendarViewDate=new Date(); let authMode='signin';
let supabaseClient = null; let currentUser = null; let loadedUserId = null; let cloudSyncTimer; let realtimeReloadTimer; let realtimeChannel = null; let cloudSyncChain = Promise.resolve();
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labelUnit = unit => ({pz:'pezzi',g:'grammi',ml:'millilitri',qb:'quanto basta'}[unit] || unit);
function saveLocal(){captureActiveEvent();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();}
function save(){saveLocal();if(currentUser)scheduleCloudSync();}
function ingredientById(id){return state.ingredients.find(item=>item.id===id);}
function getShopping(){
  const totals=new Map();
  state.pizzas.filter(pizza=>pizza.count>0).forEach(pizza=>pizza.ingredients.forEach(id=>{
    const ingredient=ingredientById(id); if(!ingredient)return;
    const current=totals.get(id)||{name:ingredient.name,unit:ingredient.unit,quantity:0};
    current.quantity+=pizza.count; totals.set(id,current);
  }));
  return [...totals.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'it')).map(([id,item])=>({id,...item}));
}
function quantityLabel(item){if(item.unit==='qb')return item.quantity===1?'q.b. × 1 pizza':`q.b. × ${item.quantity} pizze`;const unitShort={pz:'',g:' g',ml:' ml'}[item.unit]??` ${item.unit}`;return `× ${item.quantity}${unitShort}`;}
function formatDate(value){if(!value)return 'La tua prossima serata';const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(d);}
function pizzaCard(pizza,showQuantity=false){
  const names=pizza.ingredients.map(id=>ingredientById(id)?.name).filter(Boolean);
  const actions=showQuantity?'':`<div class="card-actions"><button class="card-menu edit-pizza" title="Modifica ${escapeHtml(pizza.name)}" aria-label="Modifica ${escapeHtml(pizza.name)}" data-edit-pizza="${escapeHtml(pizza.id)}">✎</button><button class="card-menu" title="Elimina ${escapeHtml(pizza.name)}" aria-label="Elimina ${escapeHtml(pizza.name)}" data-delete-pizza="${escapeHtml(pizza.id)}">×</button></div>`;
  return `<article class="pizza-card" data-pizza-card="${escapeHtml(pizza.id)}"><div class="card-top"><div><h3 class="pizza-name">${escapeHtml(pizza.name)}</h3><span class="pizza-kind"><i class="kind-dot ${pizza.type==='bianca'?'white':''}"></i>${pizza.type}</span></div>${actions}</div><p class="pizza-ingredients">${names.length?names.map(escapeHtml).join(' · '):'Nessun ingrediente selezionato'}</p><div class="card-bottom"><span class="portion-label">${showQuantity?'NEL MENU':'RICETTA'}</span>${showQuantity?`<div class="quantity-control"><button aria-label="Riduci ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="-1">−</button><span class="quantity">${pizza.count}</span><button aria-label="Aggiungi ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="1">+</button></div>`:`<span class="portion-label">${names.length} ${names.length===1?'ingrediente':'ingredienti'}</span>`}</div></article>`;
}
function render(){
  $('#event-date').value=state.eventDate||'';$('#event-date-label').textContent=state.eventDate?formatDate(state.eventDate):'Seleziona una data';$('#guests').value=state.guests||4;
  $('#pizza-count').textContent=state.pizzas.length;$('#all-count').textContent=state.pizzas.length;
  $('#shop-date').textContent=formatDate(state.eventDate);$('#shop-guests').textContent=`${state.guests||4} ${(state.guests||4)===1?'persona':'persone'} a tavola`;
  const homeQuery=$('#pizza-search').value.trim().toLocaleLowerCase('it');
  const selectedType=({rosse:'rossa',bianche:'bianca'})[currentFilter];
  const homePizzas=state.pizzas.filter(p=> (!selectedType||p.type===selectedType)&&p.name.toLocaleLowerCase('it').includes(homeQuery));
  $('#pizza-grid').innerHTML=homePizzas.length?homePizzas.map(p=>pizzaCard(p,true)).join():'<div class="empty-filter">Nessuna pizza trovata con questi filtri.</div>';
  const catalogQuery=$('#catalog-search').value.trim().toLocaleLowerCase('it');const catalogPizzas=state.pizzas.filter(p=>p.name.toLocaleLowerCase('it').includes(catalogQuery));
  $('#catalog-grid').innerHTML=catalogPizzas.length?catalogPizzas.map(p=>pizzaCard(p,false)).join():'<div class="empty-catalog"><strong>Il ricettario ti aspetta.</strong><p>Aggiungi la tua prima pizza e componi un menu tutto tuo.</p><button class="primary-button" id="empty-new-pizza">＋ Aggiungi una pizza</button></div>';
  $('#catalog-summary').textContent=`${state.pizzas.length} ${state.pizzas.length===1?'ricetta':'ricette'} nel ricettario`;
  $('#ingredient-list').innerHTML=state.ingredients.map(item=>`<div class="ingredient-row"><span class="ingredient-symbol">✳</span><div class="ingredient-detail"><strong>${escapeHtml(item.name)}</strong><small>Unità di misura · ${labelUnit(item.unit)}</small></div><button class="edit-ingredient" data-edit-ingredient="${escapeHtml(item.id)}" aria-label="Modifica ${escapeHtml(item.name)}" title="Modifica ingrediente">✎</button><button class="delete-ingredient" data-delete-ingredient="${escapeHtml(item.id)}" title="Rimuovi ${escapeHtml(item.name)}" aria-label="Rimuovi ${escapeHtml(item.name)}">×</button></div>`).join('')||'<div class="empty-catalog"><strong>La dispensa è vuota.</strong><p>Aggiungi gli ingredienti che ami usare.</p></div>';
  const list=getShopping();$('#shopping-count').textContent=list.length;$('#shopping-total').innerHTML=`${list.length} <small>${list.length===1?'voce':'voci'}</small>`;
  $('#shopping-empty').hidden=list.length>0;$('#shopping-list').innerHTML=list.map(item=>`<div class="shopping-item ${state.checked.includes(item.id)?'checked':''}"><input class="shopping-check" type="checkbox" data-check="${escapeHtml(item.id)}" ${state.checked.includes(item.id)?'checked':''} aria-label="Segna ${escapeHtml(item.name)} come preso" /><label>${escapeHtml(item.name)}</label><span class="shopping-qty">${quantityLabel(item)}</span></div>`).join('');
  $('#copy-list-btn').disabled=list.length===0;
  renderSavedEvents();
}
function currentMenu(){return state.pizzas.filter(pizza=>pizza.count>0).map(pizza=>({pizza_id:pizza.id,quantity:pizza.count}));}
function captureActiveEvent(){
  if(!state.activeEventId)return;
  const event={id:state.activeEventId,event_date:state.eventDate||null,guest_count:Number(state.guests)||4,checked_ingredients:[...state.checked],menu:currentMenu(),updated_at:new Date().toISOString()};
  const index=state.events.findIndex(item=>item.id===event.id);
  if(index>=0)state.events[index]=event;else state.events.push(event);
}
function renderSavedEvents(){
  const events=[...(state.events||[])].sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')||(b.updated_at||'').localeCompare(a.updated_at||''));
  $('#event-status').textContent=state.activeEventId?'Stai modificando '+(state.eventDate?formatDate(state.eventDate):'una serata senza data'):'Nuova serata: scegli la data e le pizze, poi salva.';
  $('#save-event-btn').innerHTML=state.activeEventId?'Aggiorna la serata <span>↗</span>':'Salva la serata <span>↗</span>';
  $('#saved-events-list').innerHTML=events.length?events.map(event=>{
    const menu=(event.menu||[]).map(item=>{const pizza=state.pizzas.find(p=>p.id===item.pizza_id);return pizza?escapeHtml(pizza.name)+' ×'+item.quantity:null;}).filter(Boolean);
    const date=event.event_date?formatDate(event.event_date):'Data da definire';
    const guests=Number(event.guest_count)||4;
    return '<article class="saved-event-row '+(event.id===state.activeEventId?'active':'')+'"><div class="saved-event-copy"><strong>'+escapeHtml(date)+'</strong><small>'+guests+' '+(guests===1?'ospite':'ospiti')+' · '+(menu.length?menu.join(' · '):'Nessuna pizza selezionata')+'</small></div><button class="event-open-button" data-open-event="'+escapeHtml(event.id)+'">'+(event.id===state.activeEventId?'In modifica':'Apri')+'</button></article>';
  }).join(''):'<div class="saved-events-empty">Le serate che salvi appariranno qui, con la data e le pizze scelte.</div>';
}
function openSavedEvent(eventId){
  const event=state.events.find(item=>item.id===eventId);if(!event)return;
  state.activeEventId=event.id;state.eventDate=event.event_date||'';state.guests=Number(event.guest_count)||4;state.checked=[...(event.checked_ingredients||[])];
  const quantities=new Map((event.menu||[]).map(item=>[item.pizza_id,Number(item.quantity)||0]));
  state.pizzas.forEach(pizza=>pizza.count=quantities.get(pizza.id)||0);
  save();showToast('Serata caricata nel menu.');
}
function startNewEvent(){
  state.activeEventId=null;state.eventDate='';state.guests=4;state.checked=[];state.pizzas.forEach(pizza=>pizza.count=0);
  saveLocal();showToast('Nuova serata pronta da organizzare.');
}
async function saveCurrentEvent(){
  const menu=currentMenu();
  if(!state.eventDate){showToast('Scegli prima la data della serata.');return;}
  if(!menu.length){showToast('Aggiungi almeno una pizza al menu.');return;}
  if(!currentUser){showToast('Accedi per salvare la serata su tutti i dispositivi.');return;}
  const isNew=!state.activeEventId;
  if(isNew)state.activeEventId=crypto.randomUUID();
  captureActiveEvent();saveLocal();
  const button=$('#save-event-btn');button.disabled=true;setCloudStatus('Salvataggio serata…');
  const userId=currentUser.id;
  cloudSyncChain=cloudSyncChain.catch(()=>{}).then(()=>syncCloudSnapshot(userId));
  try{await cloudSyncChain;if(currentUser?.id===userId){setCloudStatus('Sincronizzato su Supabase');showToast(isNew?'Serata salvata nel calendario!':'Serata aggiornata!');}}
  catch(error){console.error('Forno di casa save event:',error);if(currentUser?.id===userId){setCloudStatus('Salvataggio non riuscito');showToast('Non riesco a salvare la serata. Riprova tra poco.');}}
  finally{button.disabled=false;render();}
}
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}
function navigate(view){$$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));$$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#crumb-current').textContent=({serata:'LA SERATA',pizze:'LE PIZZE',ingredienti:'INGREDIENTI'})[view];window.scrollTo({top:0,behavior:'smooth'});}
function openPizzaDialog(pizzaId=null){
  const pizza=pizzaId?state.pizzas.find(item=>item.id===pizzaId):null;
  if(pizzaId&&!pizza)return;
  if(!state.ingredients.length&&!pizza){showToast('Aggiungi prima qualche ingrediente alla dispensa.');navigate('ingredienti');return;}
  editingPizzaId=pizza?.id||null;$('#pizza-form').reset();
  $('#pizza-dialog-kicker').textContent=pizza?'MODIFICA RICETTA':'NUOVA RICETTA';
  $('#pizza-dialog-title').innerHTML=pizza?'Modifica la tua pizza<span class="period">.</span>':'Una pizza tutta tua<span class="period">.</span>';
  $('#pizza-save-button').innerHTML=pizza?'Salva le modifiche <span>↗</span>':'Salva la pizza <span>↗</span>';
  $('#pizza-name').value=pizza?.name||'';
  $$('input[name="pizza-type"]').forEach(input=>input.checked=input.value===(pizza?.type||'rossa'));
  const selected=new Set(pizza?.ingredients||[]);
  $('#pizza-ingredient-options').innerHTML=state.ingredients.map(item=>`<label class="ingredient-check"><input type="checkbox" name="pizza-ingredients" value="${escapeHtml(item.id)}" ${selected.has(item.id)?'checked':''} /><span>${escapeHtml(item.name)}</span><small>${labelUnit(item.unit)}</small></label>`).join('')||'<span class="muted">Aggiungi ingredienti dalla dispensa per completare la ricetta.</span>';
  $('#pizza-dialog').showModal();
}
function openIngredientDialog(ingredientId=null){
  const ingredient=ingredientId?ingredientById(ingredientId):null;
  if(ingredientId&&!ingredient)return;
  editingIngredientId=ingredient?.id||null;$('#ingredient-form').reset();$('#ingredient-id').value=ingredient?.id||'';
  $('#ingredient-name').value=ingredient?.name||'';$('#ingredient-unit').value=ingredient?.unit||'pz';
  $('#ingredient-dialog-title').innerHTML=ingredient?'Modifica ingrediente<span class="period">.</span>':'Un nuovo ingrediente<span class="period">.</span>';
  $('#ingredient-save-button').innerHTML=ingredient?'Salva le modifiche <span>↗</span>':'Aggiungi alla dispensa <span>↗</span>';
  $('#ingredient-dialog').showModal();
}
function dateIso(year,month,day){return `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;}
function openCalendar(){
  const parts=(state.eventDate||'').split('-').map(Number);
  calendarViewDate=state.eventDate?new Date(parts[0],parts[1]-1,1):new Date(new Date().getFullYear(),new Date().getMonth(),1);
  renderCalendar();$('#calendar-dialog').showModal();
}
function renderCalendar(){
  const year=calendarViewDate.getFullYear(),month=calendarViewDate.getMonth();
  $('#calendar-month').textContent=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'}).format(calendarViewDate);
  const firstOffset=(new Date(year,month,1).getDay()+6)%7,daysInMonth=new Date(year,month+1,0).getDate();
  const today=new Date(),todayIso=dateIso(today.getFullYear(),today.getMonth(),today.getDate());
  const selected=state.eventDate;
  const blanks=Array.from({length:firstOffset},()=>'<span class="calendar-blank"></span>').join('');
  const days=Array.from({length:daysInMonth},(_,i)=>{const day=i+1,iso=dateIso(year,month,day),classes=['calendar-day'];if(iso===todayIso)classes.push('today');if(iso===selected)classes.push('selected');return `<button type="button" class="${classes.join(' ')}" data-calendar-date="${iso}" aria-pressed="${iso===selected}">${day}</button>`;}).join('');
  $('#calendar-days').innerHTML=blanks+days;
}

async function copyShopping(){const list=getShopping();if(!list.length)return;const date=formatDate(state.eventDate);const text=`LISTA DELLA SPESA — ${date}\n${list.map(item=>`☐ ${item.name} ${quantityLabel(item)}`).join('\n')}`;try{await navigator.clipboard.writeText(text);showToast('Lista copiata negli appunti!');}catch{showToast('Il browser non consente di copiare la lista.');}}

function setCloudStatus(message){const status=$('.saved-status');if(status)status.innerHTML=`<i></i> ${escapeHtml(message)}`;}
function requireCloud(result){if(result.error)throw result.error;return result.data;}
async function loadCloudState(user){
  const [ingredientResult,pizzaResult,linkResult,eventResult,eventPizzaResult]=await Promise.all([
    supabaseClient.from('ingredients').select('id,name,unit').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizzas').select('id,name,type').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizza_ingredients').select('pizza_id,ingredient_id,quantity_per_pizza').eq('user_id',user.id),
    supabaseClient.from('pizza_events').select('id,event_date,guest_count,checked_ingredients,updated_at').eq('user_id',user.id),
    supabaseClient.from('event_pizzas').select('event_id,pizza_id,quantity').eq('user_id',user.id)
  ]);
  const ingredients=requireCloud(ingredientResult)||[];const pizzas=requireCloud(pizzaResult)||[];const links=requireCloud(linkResult)||[];const eventRows=requireCloud(eventResult)||[];const eventPizzas=requireCloud(eventPizzaResult)||[];
  if(!ingredients.length&&!pizzas.length&&!eventRows.length){state.events=[];state.activeEventId=null;await syncCloudSnapshot(user.id);return;}
  const local=state;const previousActiveId=state.activeEventId;
  const events=eventRows.map(row=>({...row,menu:eventPizzas.filter(item=>item.event_id===row.id).map(item=>({pizza_id:item.pizza_id,quantity:Number(item.quantity)||0}))}));
  events.sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')||(b.updated_at||'').localeCompare(a.updated_at||''));
  const active=events.find(event=>event.id===previousActiveId)||events[0]||null;
  const quantities=new Map((active?.menu||[]).map(item=>[item.pizza_id,item.quantity]));
  const localQuantities=new Map(local.pizzas.map(pizza=>[pizza.id,pizza.count||0]));
  state={events,activeEventId:active?.id||null,eventDate:active?.event_date||(!events.length?(local.eventDate||''):''),guests:active?.guest_count||(!events.length?(local.guests||4):4),
    ingredients:ingredients.map(item=>({id:item.id,name:item.name,unit:item.unit})),
    pizzas:pizzas.map(pizza=>({id:pizza.id,name:pizza.name,type:pizza.type,count:active?(quantities.get(pizza.id)||0):(localQuantities.get(pizza.id)||0),ingredients:links.filter(link=>link.pizza_id===pizza.id).map(link=>link.ingredient_id)})),
    checked:active?(active.checked_ingredients||[]).filter(id=>ingredients.some(item=>item.id===id)):(!events.length?(local.checked||[]):[])};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
async function persistActiveEvent(userId){
  if(!state.activeEventId)return;
  captureActiveEvent();
  const active=state.events.find(item=>item.id===state.activeEventId);if(!active)return;
  const saved=requireCloud(await supabaseClient.from('pizza_events').upsert({id:active.id,user_id:userId,event_date:active.event_date,guest_count:active.guest_count,checked_ingredients:active.checked_ingredients,updated_at:new Date().toISOString()},{onConflict:'user_id,id'}).select('id').single());
  requireCloud(await supabaseClient.from('event_pizzas').delete().eq('user_id',userId).eq('event_id',saved.id));
  const menu=active.menu.filter(item=>item.quantity>0).map(item=>({user_id:userId,event_id:saved.id,pizza_id:item.pizza_id,quantity:item.quantity}));
  if(menu.length)requireCloud(await supabaseClient.from('event_pizzas').insert(menu));
}
async function syncCloudSnapshot(userId){
  const ingredients=state.ingredients.map(({id,name,unit})=>({id,user_id:userId,name,unit}));
  const pizzas=state.pizzas.map(({id,name,type})=>({id,user_id:userId,name,type}));
  if(ingredients.length)requireCloud(await supabaseClient.from('ingredients').upsert(ingredients,{onConflict:'user_id,id'}));
  if(pizzas.length)requireCloud(await supabaseClient.from('pizzas').upsert(pizzas,{onConflict:'user_id,id'}));
  const remoteIngredients=requireCloud(await supabaseClient.from('ingredients').select('id').eq('user_id',userId))||[];
  const keepIngredients=new Set(state.ingredients.map(item=>item.id));const removedIngredients=remoteIngredients.map(item=>item.id).filter(id=>!keepIngredients.has(id));
  if(removedIngredients.length)requireCloud(await supabaseClient.from('ingredients').delete().eq('user_id',userId).in('id',removedIngredients));
  const remotePizzas=requireCloud(await supabaseClient.from('pizzas').select('id').eq('user_id',userId))||[];
  const keepPizzas=new Set(state.pizzas.map(item=>item.id));const removedPizzas=remotePizzas.map(item=>item.id).filter(id=>!keepPizzas.has(id));
  if(removedPizzas.length)requireCloud(await supabaseClient.from('pizzas').delete().eq('user_id',userId).in('id',removedPizzas));
  requireCloud(await supabaseClient.from('pizza_ingredients').delete().eq('user_id',userId));
  const relations=state.pizzas.flatMap(pizza=>pizza.ingredients.map(ingredientId=>({user_id:userId,pizza_id:pizza.id,ingredient_id:ingredientId,quantity_per_pizza:1})));
  if(relations.length)requireCloud(await supabaseClient.from('pizza_ingredients').insert(relations));
  await persistActiveEvent(userId);
}

function scheduleCloudSync(){
  setCloudStatus('Sincronizzazione…');clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>{const userId=currentUser?.id;if(!userId)return;cloudSyncChain=cloudSyncChain.catch(()=>{}).then(()=>syncCloudSnapshot(userId)).then(()=>{if(currentUser?.id===userId)setCloudStatus('Sincronizzato su Supabase');}).catch(error=>{console.error('Forno di casa sync:',error);if(currentUser?.id===userId)setCloudStatus('Sincronizzazione in pausa');});},450);
}
function refreshFromRealtime(){
  clearTimeout(realtimeReloadTimer);
  realtimeReloadTimer=setTimeout(async()=>{
    const user=currentUser;if(!user)return;
    try{await cloudSyncChain.catch(()=>{});await loadCloudState(user);if(currentUser?.id===user.id)render();}
    catch(error){console.error('Forno di casa realtime:',error);}
  },900);
}
function subscribeToUserData(userId){
  if(realtimeChannel)supabaseClient.removeChannel(realtimeChannel);
  let channel=supabaseClient.channel(`forno-user-${userId}`);
  for(const table of ['ingredients','pizzas','pizza_ingredients','pizza_events','event_pizzas']){
    channel=channel.on('postgres_changes',{event:'*',schema:'public',table,filter:`user_id=eq.${userId}`},refreshFromRealtime);
  }
  realtimeChannel=channel.subscribe();
}
async function handleAuthSession(session){
  const authScreen=$('#auth-screen');const appShell=$('#app-shell');
  if(!session?.user){currentUser=null;loadedUserId=null;if(realtimeChannel){supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null;}authScreen.hidden=false;appShell.hidden=true;return;}
  if(currentUser?.id&&currentUser.id!==session.user.id&&realtimeChannel){supabaseClient.removeChannel(realtimeChannel);realtimeChannel=null;loadedUserId=null;}
  currentUser=session.user;authScreen.hidden=true;appShell.hidden=false;$('.profile strong').textContent=session.user.email||'Il tuo ricettario';$('.profile small').textContent='Sincronizzazione attiva';
  if(loadedUserId===session.user.id)return;loadedUserId=session.user.id;setCloudStatus('Caricamento ricettario…');
  try{await loadCloudState(session.user);render();setCloudStatus('Sincronizzato su Supabase');subscribeToUserData(session.user.id);}
  catch(error){loadedUserId=null;console.error('Forno di casa load:',error);setCloudStatus('Connessione non riuscita');showToast('Non riesco a leggere il ricettario. Riprova tra poco.');}
}
async function initializeCloud(){
  const config=window.FORNO_SUPABASE;
  if(!window.supabase?.createClient||!config?.url||!config?.publishableKey){$('#auth-message').textContent='Collegamento Supabase non configurato.';$('#auth-message').classList.add('error');return;}
  supabaseClient=window.supabase.createClient(config.url,config.publishableKey);
  supabaseClient.auth.onAuthStateChange((event,session)=>{setTimeout(()=>{handleAuthSession(session);if(event==='PASSWORD_RECOVERY')$('#password-reset-dialog').showModal();},0);});
  const {data,error}=await supabaseClient.auth.getSession();if(error){$('#auth-message').textContent='Non riesco a verificare l’accesso. Ricarica la pagina.';$('#auth-message').classList.add('error');return;}await handleAuthSession(data.session);
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
  const go=event.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
  if(event.target.closest('#calendar-trigger')){openCalendar();return;}
  if(event.target.closest('#calendar-prev')){calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()-1,1);renderCalendar();return;}
  if(event.target.closest('#calendar-next')){calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+1,1);renderCalendar();return;}
  if(event.target.closest('#calendar-clear')){state.eventDate='';save();$('#calendar-dialog').close();return;}
  if(event.target.closest('#save-event-btn')){saveCurrentEvent();return;}
  if(event.target.closest('#new-event-btn')){startNewEvent();return;}
  const openEvent=event.target.closest('[data-open-event]');if(openEvent){openSavedEvent(openEvent.dataset.openEvent);return;}
  const day=event.target.closest('[data-calendar-date]');if(day){state.eventDate=day.dataset.calendarDate;save();$('#calendar-dialog').close();return;}
  const close=event.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}
  const qty=event.target.closest('[data-quantity]');if(qty){const pizza=state.pizzas.find(p=>p.id===qty.dataset.quantity);pizza.count=Math.max(0,Math.min(99,pizza.count+Number(qty.dataset.step)));save();return;}
  const editPizza=event.target.closest('[data-edit-pizza]');if(editPizza){openPizzaDialog(editPizza.dataset.editPizza);return;}
  const delPizza=event.target.closest('[data-delete-pizza]');if(delPizza){const pizza=state.pizzas.find(p=>p.id===delPizza.dataset.deletePizza);if(!pizza)return;if(!confirm(`Eliminare “${pizza.name}” dal ricettario?`))return;state.pizzas=state.pizzas.filter(p=>p.id!==pizza.id);state.events.forEach(item=>item.menu=item.menu.filter(row=>row.pizza_id!==pizza.id));save();showToast('Pizza rimossa dal ricettario.');return;}
  const editIngredient=event.target.closest('[data-edit-ingredient]');if(editIngredient){openIngredientDialog(editIngredient.dataset.editIngredient);return;}
  const delIngredient=event.target.closest('[data-delete-ingredient]');if(delIngredient){const ingredient=ingredientById(delIngredient.dataset.deleteIngredient);if(!ingredient)return;if(!confirm(`Rimuovere “${ingredient.name}” dalla dispensa e dalle ricette?`))return;state.ingredients=state.ingredients.filter(i=>i.id!==ingredient.id);state.pizzas.forEach(p=>p.ingredients=p.ingredients.filter(id=>id!==ingredient.id));state.checked=state.checked.filter(id=>id!==ingredient.id);save();showToast('Ingrediente rimosso dalla dispensa.');return;}
  if(event.target.id==='new-pizza-btn'||event.target.id==='empty-new-pizza'){openPizzaDialog();return;}
  if(event.target.id==='new-ingredient-btn'){openIngredientDialog();return;}
  if(event.target.id==='copy-list-btn'){const date=formatDate(state.eventDate);$('#dialog-event-date').textContent=`${date} · ${state.guests||4} ${(state.guests||4)===1?'persona':'persone'}`;$('#dialog-shopping-list').innerHTML=getShopping().map(item=>`<div class="dialog-shop-item"><span>${escapeHtml(item.name)}</span><strong>${quantityLabel(item)}</strong></div>`).join('');$('#shopping-dialog').showModal();return;}
  if(event.target.id==='help-btn'){showToast('Scegli una pizza, imposta le quantità e la lista si aggiorna da sola.');return;}
});
document.addEventListener('change',event=>{
  if(event.target.id==='event-date'){state.eventDate=event.target.value;save();}
  if(event.target.id==='guests'){state.guests=Math.max(1,Math.min(99,Number(event.target.value)||1));save();}
  if(event.target.matches('[data-check]')){const id=event.target.dataset.check;state.checked=event.target.checked?[...new Set([...state.checked,id])]:state.checked.filter(value=>value!==id);save();}
});
$('#pizza-filters').addEventListener('click',event=>{const chip=event.target.closest('[data-filter]');if(!chip)return;currentFilter=chip.dataset.filter;$$('.filter-chip').forEach(item=>item.classList.toggle('selected',item===chip));render();});
$('#pizza-search').addEventListener('input',render);$('#catalog-search').addEventListener('input',render);
$('#pizza-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#pizza-name').value.trim();if(!name)return;
  const duplicate=state.pizzas.some(item=>item.id!==editingPizzaId&&item.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'));
  if(duplicate){showToast('Esiste già una pizza con questo nome.');return;}
  const selected=$('input[name="pizza-ingredients"]:checked').map(input=>input.value);const type=$('input[name="pizza-type"]:checked').value;
  if(editingPizzaId){const pizza=state.pizzas.find(item=>item.id===editingPizzaId);if(!pizza)return;pizza.name=name;pizza.type=type;pizza.ingredients=selected;}
  else state.pizzas.push({id:`pizza-${crypto.randomUUID()}`,name,type,ingredients:selected,count:0});
  const edited=Boolean(editingPizzaId);editingPizzaId=null;$('#pizza-dialog').close();save();showToast(edited?'Ricetta aggiornata!':'La nuova pizza è nel tuo ricettario!');
});
$('#ingredient-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#ingredient-name').value.trim();if(!name)return;const unit=$('#ingredient-unit').value;
  const duplicate=state.ingredients.some(item=>item.id!==editingIngredientId&&item.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'));
  if(duplicate){showToast('Questo ingrediente è già in dispensa.');return;}
  if(editingIngredientId){const ingredient=ingredientById(editingIngredientId);if(!ingredient)return;ingredient.name=name;ingredient.unit=unit;}
  else state.ingredients.push({id:`ing-${crypto.randomUUID()}`,name,unit});
  const edited=Boolean(editingIngredientId);editingIngredientId=null;$('#ingredient-dialog').close();save();showToast(edited?'Ingrediente aggiornato!':'Ingrediente aggiunto alla dispensa!');
});
function setAuthMessage(message,type=''){const el=$('#auth-message');el.textContent=message;el.className='auth-message'+(type?' '+type:'');}
$('#auth-toggle').addEventListener('click',()=>{
  authMode=authMode==='signin'?'signup':'signin';
  const signup=authMode==='signup';
  $('#auth-submit').innerHTML=signup?'Crea account <span>↗</span>':'Accedi <span>↗</span>';
  $('#auth-password').autocomplete=signup?'new-password':'current-password';
  $('#auth-toggle').textContent=signup?'Hai già un account? Accedi':'Crea un account';
  $('#auth-forgot').hidden=signup;
  setAuthMessage(signup?'Crea il tuo account con email e password. Dopo la registrazione, conferma l’indirizzo dalla tua email.':'Usa lo stesso account per accedere da computer e telefono.');
});
$('#auth-forgot').addEventListener('click',async()=>{
  const email=$('#auth-email').value.trim();
  if(!email){$('#auth-email').focus();setAuthMessage('Inserisci la tua email e riprova.','error');return;}
  const button=$('#auth-forgot');button.disabled=true;setAuthMessage('Invio della richiesta…');
  try{
    const {error}=await supabaseClient.auth.resetPasswordForEmail(email,{redirectTo:`${location.origin}${location.pathname}`});
    if(error)throw error;
    setAuthMessage('Se l’indirizzo è associato a un account, riceverai un link per impostare la password.','success');
  }catch(error){console.error('Forno di casa password reset:',error);setAuthMessage('Invio non riuscito. Controlla la connessione e riprova.','error');}
  finally{button.disabled=false;}
});
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();const email=$('#auth-email').value.trim();const password=$('#auth-password').value;const button=$('#auth-submit');
  if(location.protocol==='file:'){setAuthMessage('Apri l’app dal sito pubblicato o da http://localhost:3000.','error');return;}
  button.disabled=true;$('#auth-toggle').disabled=true;$('#auth-forgot').disabled=true;setAuthMessage(authMode==='signup'?'Creazione account…':'Accesso…');
  try{
    if(authMode==='signup'){
      const {data,error}=await supabaseClient.auth.signUp({email,password,options:{emailRedirectTo:`${location.origin}${location.pathname}`}});
      if(error)throw error;
      if(data.session){await handleAuthSession(data.session);}
      else{setAuthMessage('Account creato. Controlla la tua email per confermare l’indirizzo, poi accedi.','success');authMode='signin';$('#auth-submit').innerHTML='Accedi <span>↗</span>';$('#auth-toggle').textContent='Crea un account';$('#auth-forgot').hidden=false;$('#auth-password').autocomplete='current-password';}
    }else{
      const {error}=await supabaseClient.auth.signInWithPassword({email,password});
      if(error)throw error;
    }
  }catch(error){
    console.error('Forno di casa auth:',error);
    setAuthMessage(authMode==='signup'?(error.message||'Creazione account non riuscita. Controlla i dati e riprova.'):'Email o password non corretti. Se avevi già usato il link email, scegli “Password dimenticata?”.','error');
  }finally{button.disabled=false;$('#auth-toggle').disabled=false;$('#auth-forgot').disabled=false;}
});
$('#password-reset-form').addEventListener('submit',async event=>{
  event.preventDefault();const password=$('#reset-password').value;const confirmPassword=$('#reset-password-confirm').value;const message=$('#password-reset-message');
  message.className='auth-message';message.textContent='';
  if(password!==confirmPassword){message.classList.add('error');message.textContent='Le password non coincidono.';return;}
  const button=$('#password-reset-form button[type="submit"]');button.disabled=true;
  try{
    const {error}=await supabaseClient.auth.updateUser({password});
    if(error)throw error;
    $('#password-reset-dialog').close();$('#password-reset-form').reset();showToast('Password aggiornata.');authMode='signin';
  }catch(error){console.error('Forno di casa password update:',error);message.className='auth-message error';message.textContent='Non riesco ad aggiornare la password. Richiedi un nuovo link e riprova.';}
  finally{button.disabled=false;}
});
$('#signout-btn').addEventListener('click',async()=>{if(!supabaseClient)return;const {error}=await supabaseClient.auth.signOut();if(error)showToast('Non riesco a completare la disconnessione.');});
render();
initializeCloud();
