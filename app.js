const STORAGE_KEY = 'forno-di-casa-v1';
const seed = {
  eventDate: '', guests: 4,
  ingredients: [
    {id:'ing-1',name:'Mozzarella fiordilatte',unit:'pz'}, {id:'ing-2',name:'Pomodoro San Marzano',unit:'pz'},
    {id:'ing-3',name:'Basilico fresco',unit:'pz'}, {id:'ing-4',name:'Olio extravergine',unit:'pz'},
    {id:'ing-5',name:'Parmigiano Reggiano',unit:'pz'}, {id:'ing-6',name:'Prosciutto cotto',unit:'pz'},
    {id:'ing-7',name:'Funghi champignon',unit:'pz'}, {id:'ing-8',name:'Olive nere',unit:'pz'},
    {id:'ing-9',name:'Salame piccante',unit:'pz'}, {id:'ing-10',name:'Gorgonzola',unit:'pz'},
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
state.pizzas ||= []; state.specials ||= []; state.ingredients ||= []; state.checked ||= []; state.events ||= []; state.activeEventId ||= null; state.eventNotes ||= ''; state.doughWeight ??= null; state.hydration ??= null; state.ballCount ??= null; state.ballWeight ??= null; state.maturationHours ??= null;
if(state.activeEventId&&state.events.some(event=>event.id===state.activeEventId)){state.eventDate='';state.guests=4;state.eventNotes='';state.doughWeight=null;state.hydration=null;state.ballCount=null;state.ballWeight=null;state.maturationHours=null;state.checked=[];state.pizzas.forEach(item=>item.count=0);state.specials.forEach(item=>item.count=0);}
state.activeEventId=null;
let currentFilter = 'tutte'; let toastTimer; let editingPizzaId=null; let editingSpecialId=null; let editingIngredientId=null; let calendarViewDate=new Date(); let authMode='signin';
let supabaseClient = null; let currentUser = null; let loadedUserId = null; let cloudSyncTimer; let realtimeReloadTimer; let realtimeChannel = null; let cloudSyncChain = Promise.resolve();
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labelUnit = unit => ({pz:'pezzi',g:'grammi',ml:'millilitri',qb:'quanto basta'}[unit] || unit);
function saveLocal(){captureActiveEvent();localStorage.setItem(STORAGE_KEY,JSON.stringify(state));render();}
function save(){saveLocal();if(currentUser)scheduleCloudSync();}
function ingredientById(id){return state.ingredients.find(item=>item.id===id);}
function getMenuItems(){
  return [...state.pizzas.filter(item=>item.count>0).map(item=>({id:item.id,name:item.name,quantity:item.count,kind:'pizza'})),...state.specials.filter(item=>item.count>0).map(item=>({id:item.id,name:item.name,quantity:item.count,kind:'preparazione'}))];
}
function getShopping(){
  const totals=new Map();
  const addRecipes=(recipes,countKey)=>recipes.filter(item=>item.count>0).forEach(item=>item.ingredients.forEach(id=>{
    const ingredient=ingredientById(id);if(!ingredient)return;
    const current=totals.get(id)||{name:ingredient.name,unit:ingredient.unit,quantity:0,pizzaCount:0,preparationCount:0};
    current.quantity+=item.count;current[countKey]+=item.count;totals.set(id,current);
  }));
  addRecipes(state.pizzas,'pizzaCount');addRecipes(state.specials,'preparationCount');
  return [...totals.entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'it')).map(([id,item])=>({id,...item}));
}
function quantityLabel(item){if(item.unit==='pz'){const forItems=[];if(item.pizzaCount)forItems.push(`${item.pizzaCount} ${item.pizzaCount===1?'pizza':'pizze'}`);if(item.preparationCount)forItems.push(`${item.preparationCount} ${item.preparationCount===1?'preparazione':'preparazioni'}`);return `× ${item.quantity} ${item.quantity===1?'pezzo':'pezzi'} · per ${forItems.join(' + ')}`;}if(item.unit==='qb')return item.quantity===1?'q.b. × 1 preparazione':`q.b. × ${item.quantity} preparazioni`;const unitShort={g:' g',ml:' ml'}[item.unit]??` ${item.unit}`;return `× ${item.quantity}${unitShort}`;}
function formatDate(value){if(!value)return 'La tua prossima serata';const d=new Date(`${value}T12:00:00`);return new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long',year:'numeric'}).format(d);}
function pizzaCard(pizza,showQuantity=false){
  const names=pizza.ingredients.map(id=>ingredientById(id)?.name).filter(Boolean);
  const actions=showQuantity?'':`<div class="card-actions"><button class="card-menu edit-pizza" title="Modifica ${escapeHtml(pizza.name)}" aria-label="Modifica ${escapeHtml(pizza.name)}" data-edit-pizza="${escapeHtml(pizza.id)}">✎</button><button class="card-menu" title="Elimina ${escapeHtml(pizza.name)}" aria-label="Elimina ${escapeHtml(pizza.name)}" data-delete-pizza="${escapeHtml(pizza.id)}">×</button></div>`;
  return `<article class="pizza-card" data-pizza-card="${escapeHtml(pizza.id)}"><div class="card-top"><div><h3 class="pizza-name">${escapeHtml(pizza.name)}</h3><span class="pizza-kind"><i class="kind-dot ${pizza.type==='bianca'?'white':''}"></i>${pizza.type}</span></div>${actions}</div><p class="pizza-ingredients">${names.length?names.map(escapeHtml).join(' · '):'Nessun ingrediente selezionato'}</p>${pizza.notes?`<p class="pizza-notes"><strong>Note:</strong> ${escapeHtml(pizza.notes)}</p>`:''}<div class="card-bottom"><span class="portion-label">${showQuantity?'NEL MENU':'RICETTA'}</span>${showQuantity?`<div class="quantity-control"><button aria-label="Riduci ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="-1">−</button><span class="quantity">${pizza.count}</span><button aria-label="Aggiungi ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="1">+</button></div>`:`<span class="portion-label">${names.length} ${names.length===1?'ingrediente':'ingredienti'}</span>`}</div></article>`;
}
function specialCard(special,showQuantity=false){
  const names=special.ingredients.map(id=>ingredientById(id)?.name).filter(Boolean);
  const actions=showQuantity?'':`<div class="card-actions"><button class="card-menu edit-pizza" title="Modifica ${escapeHtml(special.name)}" aria-label="Modifica ${escapeHtml(special.name)}" data-edit-special="${escapeHtml(special.id)}">✎</button><button class="card-menu" title="Elimina ${escapeHtml(special.name)}" aria-label="Elimina ${escapeHtml(special.name)}" data-delete-special="${escapeHtml(special.id)}">×</button></div>`;
  return `<article class="pizza-card special-card"><div class="card-top"><div><h3 class="pizza-name">${escapeHtml(special.name)}</h3><span class="special-kind">PREPARAZIONE</span></div>${actions}</div><p class="pizza-ingredients">${names.length?names.map(escapeHtml).join(' · '):'Nessun ingrediente selezionato'}</p>${special.notes?`<p class="pizza-notes"><strong>Note:</strong> ${escapeHtml(special.notes)}</p>`:''}<div class="card-bottom"><span class="portion-label">${showQuantity?'NEL MENU':'PREPARAZIONE'}</span>${showQuantity?`<div class="quantity-control"><button aria-label="Riduci ${escapeHtml(special.name)}" data-special-quantity="${escapeHtml(special.id)}" data-step="-1">−</button><span class="quantity">${special.count}</span><button aria-label="Aggiungi ${escapeHtml(special.name)}" data-special-quantity="${escapeHtml(special.id)}" data-step="1">+</button></div>`:`<span class="portion-label">${names.length} ${names.length===1?'ingrediente':'ingredienti'}</span>`}</div></article>`;
}
function render(){
  $('#event-date').value=state.eventDate||'';$('#event-date-label').textContent=state.eventDate?formatDate(state.eventDate):'Seleziona una data';$('#guests').value=state.guests||4;$('#event-notes').value=state.eventNotes||'';$('#event-dough-weight').value=state.doughWeight??'';$('#event-hydration').value=state.hydration??'';$('#event-ball-count').value=state.ballCount??'';$('#event-ball-weight').value=state.ballWeight??'';$('#event-maturation-hours').value=state.maturationHours??'';
  $('#pizza-count').textContent=state.pizzas.length;$('#all-count').textContent=state.pizzas.length;$('#special-count').textContent=state.specials.length;
  $('#shop-date').textContent=formatDate(state.eventDate);$('#shop-guests').textContent=`${state.guests||4} ${(state.guests||4)===1?'persona':'persone'} a tavola`;
  const homeQuery=$('#pizza-search').value.trim().toLocaleLowerCase('it');
  const selectedType=({rosse:'rossa',bianche:'bianca'})[currentFilter];
  const homePizzas=state.pizzas.filter(p=> (!selectedType||p.type===selectedType)&&p.name.toLocaleLowerCase('it').includes(homeQuery)).sort((a,b)=>a.name.localeCompare(b.name,'it',{sensitivity:'base'}));
  $('#pizza-grid').innerHTML=homePizzas.length?homePizzas.map(p=>pizzaCard(p,true)).join(''):'<div class="empty-filter">Nessuna pizza trovata con questi filtri.</div>';
  $('#special-order-grid').innerHTML=state.specials.map(special=>specialCard(special,true)).join('')||'<div class="empty-filter">Aggiungi una preparazione in “Le speciali” per inserirla nella serata.</div>';
  const catalogQuery=$('#catalog-search').value.trim().toLocaleLowerCase('it');const catalogPizzas=state.pizzas.filter(p=>p.name.toLocaleLowerCase('it').includes(catalogQuery));
  $('#catalog-grid').innerHTML=catalogPizzas.length?catalogPizzas.map(p=>pizzaCard(p,false)).join(''):'<div class="empty-catalog"><strong>Il ricettario ti aspetta.</strong><p>Aggiungi la tua prima pizza e componi un menu tutto tuo.</p><button class="primary-button" id="empty-new-pizza">＋ Aggiungi una pizza</button></div>';
  $('#catalog-summary').textContent=`${state.pizzas.length} ${state.pizzas.length===1?'ricetta':'ricette'} nel ricettario`;
  const specialQuery=$('#special-search').value.trim().toLocaleLowerCase('it');const visibleSpecials=state.specials.filter(item=>item.name.toLocaleLowerCase('it').includes(specialQuery));
  $('#special-grid').innerHTML=visibleSpecials.length?visibleSpecials.map(item=>specialCard(item,false)).join(''):'<div class="empty-catalog"><strong>Le tue speciali ti aspettano.</strong><p>Aggiungi una preparazione e collegala agli ingredienti della dispensa.</p><button class="primary-button" id="empty-new-special">＋ Aggiungi una speciale</button></div>';
  $('#special-summary').textContent=`${state.specials.length} ${state.specials.length===1?'preparazione':'preparazioni'} nel ricettario`;
  $('#ingredient-list').innerHTML=state.ingredients.map(item=>`<div class="ingredient-row"><span class="ingredient-symbol">✳</span><div class="ingredient-detail"><strong>${escapeHtml(item.name)}</strong><small>Unità di misura · ${labelUnit(item.unit)}</small></div><button class="edit-ingredient" data-edit-ingredient="${escapeHtml(item.id)}" aria-label="Modifica ${escapeHtml(item.name)}" title="Modifica ingrediente">✎</button><button class="delete-ingredient" data-delete-ingredient="${escapeHtml(item.id)}" title="Rimuovi ${escapeHtml(item.name)}" aria-label="Rimuovi ${escapeHtml(item.name)}">×</button></div>`).join('')||'<div class="empty-catalog"><strong>La dispensa è vuota.</strong><p>Aggiungi gli ingredienti che ami usare.</p></div>';
  const menuItems=getMenuItems();const list=getShopping();$('#menu-count').textContent=menuItems.reduce((sum,item)=>sum+item.quantity,0);$('#planned-menu-list').innerHTML=menuItems.map(item=>`<div class="shopping-menu-item"><span>${escapeHtml(item.name)} <small>${item.kind==='pizza'?'Pizza':'Preparazione'}</small></span><strong>× ${item.quantity}</strong></div>`).join('')||'<div class="shopping-menu-empty">Nessuna pizza o preparazione selezionata.</div>';
  $('#shopping-count').textContent=list.length;$('#shopping-total').innerHTML=`${list.length} <small>${list.length===1?'voce':'voci'}</small>`;
  $('#shopping-empty').hidden=list.length>0;$('#shopping-list').innerHTML=list.map(item=>`<label class="shopping-item ${state.checked.includes(item.id)?'checked':''}"><input class="shopping-check" type="checkbox" data-check="${escapeHtml(item.id)}" ${state.checked.includes(item.id)?'checked':''} aria-label="Segna ${escapeHtml(item.name)} come preso" /><span class="shopping-name">${escapeHtml(item.name)}</span><span class="shopping-qty">${quantityLabel(item)}</span></label>`).join('');
  $('#copy-list-btn').disabled=list.length===0&&menuItems.length===0;const menuTotal=menuItems.reduce((sum,item)=>sum+item.quantity,0);$('#shop-bar-summary').textContent=`${menuTotal} nel menu · ${list.length} ${list.length===1?'ingrediente':'ingredienti'}`;
  renderSavedEvents();
}
function currentMenu(){return state.pizzas.filter(pizza=>pizza.count>0).map(pizza=>({pizza_id:pizza.id,quantity:pizza.count}));}
function currentSpecialMenu(){return state.specials.filter(item=>item.count>0).map(item=>({special_id:item.id,quantity:item.count}));}
function captureActiveEvent(){
  if(!state.activeEventId)return;
  const event={id:state.activeEventId,event_date:state.eventDate||null,guest_count:Number(state.guests)||4,event_notes:state.eventNotes||'',dough_weight_g:state.doughWeight===''||state.doughWeight==null?null:Number(state.doughWeight),hydration_percent:state.hydration===''||state.hydration==null?null:Number(state.hydration),ball_count:state.ballCount===''||state.ballCount==null?null:Number(state.ballCount),ball_weight_g:state.ballWeight===''||state.ballWeight==null?null:Number(state.ballWeight),maturation_hours:state.maturationHours===''||state.maturationHours==null?null:Number(state.maturationHours),checked_ingredients:[...state.checked],menu:currentMenu(),special_menu:currentSpecialMenu(),updated_at:new Date().toISOString()};
  const index=state.events.findIndex(item=>item.id===event.id);
  if(index>=0)state.events[index]=event;else state.events.push(event);
}
function renderSavedEvents(){
  const events=[...(state.events||[])].sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')||(b.updated_at||'').localeCompare(a.updated_at||''));
  $('#event-status').textContent=state.activeEventId?'Stai modificando '+(state.eventDate?formatDate(state.eventDate):'una serata senza data'):'Nuova serata: scegli la data e le pizze, poi salva.';
  $('#save-event-btn').innerHTML=state.activeEventId?'Aggiorna la serata <span>↗</span>':'Salva la serata <span>↗</span>';
  $('#saved-events-list').innerHTML=events.length?events.map(event=>{
    const menu=[...(event.menu||[]).filter(item=>Number(item.quantity)>0).map(item=>{const pizza=state.pizzas.find(p=>p.id===item.pizza_id);return pizza?escapeHtml(pizza.name)+' ×'+item.quantity:null;}),...(event.special_menu||[]).filter(item=>Number(item.quantity)>0).map(item=>{const special=state.specials.find(row=>row.id===item.special_id);return special?escapeHtml(special.name)+' ×'+item.quantity:null;})].filter(Boolean);
    const date=event.event_date?formatDate(event.event_date):'Data da definire';
    const guests=Number(event.guest_count)||4;
    return '<article class="saved-event-row '+(event.id===state.activeEventId?'active':'')+'"><div class="saved-event-copy"><strong>'+escapeHtml(date)+'</strong><small>'+guests+' '+(guests===1?'ospite':'ospiti')+' · '+(menu.length?menu.join(' · '):'Nessuna preparazione selezionata')+'</small></div><div class="event-row-actions"><button class="event-open-button" data-open-event="'+escapeHtml(event.id)+'">Apri</button><button class="event-edit-button" data-edit-event="'+escapeHtml(event.id)+'">Modifica</button><button class="event-delete-button" data-delete-event="'+escapeHtml(event.id)+'" title="Elimina serata" aria-label="Elimina serata del '+escapeHtml(date)+'">Elimina</button></div></article>';
  }).join(''):'<div class="saved-events-empty">Le serate che salvi appariranno qui, con la data e le pizze scelte.</div>';
}
function showSavedEvent(eventId){
  const event=state.events.find(item=>item.id===eventId);if(!event)return;
  const pizzas=(event.menu||[]).filter(item=>Number(item.quantity)>0).map(item=>({kind:'pizza',item:state.pizzas.find(row=>row.id===item.pizza_id),quantity:Number(item.quantity)||0})).filter(row=>row.item);
  const specials=(event.special_menu||[]).filter(item=>Number(item.quantity)>0).map(item=>({kind:'speciale',item:state.specials.find(row=>row.id===item.special_id),quantity:Number(item.quantity)||0})).filter(row=>row.item);
  const number=value=>value==null||value===''?'—':Number(value).toLocaleString('it-IT');
  const renderCommandItems=items=>items.map(({kind,item,quantity})=>{
    const recipeIngredients=(item.ingredients||[]).map(id=>ingredientById(id)?.name).filter(Boolean);
    const details=[kind==='pizza'?(item.type==='bianca'?'Pizza bianca':'Pizza rossa'):'Preparazione',recipeIngredients.length?recipeIngredients.map(escapeHtml).join(' · '):'',item.notes?'Note: '+escapeHtml(item.notes):''].filter(Boolean);
    return '<li class="command-item"><div><strong>'+escapeHtml(item.name)+'</strong><span class="command-quantity">× '+quantity+'</span></div><small>'+details.join(' · ')+'</small></li>';
  }).join('');
  const specialItems=specials.length?'<div class="command-group-heading special-group-heading">✦ PREPARAZIONI SPECIALI</div><ul>'+renderCommandItems(specials)+'</ul>':'';
  const pizzaItems=pizzas.length?(specials.length?'<div class="command-separator" role="separator"><span>INIZIO PIZZE</span></div>':'')+'<div class="command-group-heading pizza-group-heading">◉ LE PIZZE</div><ul>'+renderCommandItems(pizzas)+'</ul>':'';
  const menuItems=specialItems+pizzaItems||'<p class="command-empty">Nessuna pizza o preparazione selezionata.</p>';
  const doughDetails=[
    ['Impasto',event.dough_weight_g==null?'—':number(event.dough_weight_g)+' g'],
    ['Idratazione',event.hydration_percent==null?'—':number(event.hydration_percent)+'%'],
    ['Panetti',event.ball_count==null&&event.ball_weight_g==null?'—':(event.ball_count==null?'—':number(event.ball_count))+' × '+(event.ball_weight_g==null?'—':number(event.ball_weight_g)+' g')],
    ['Maturazione',event.maturation_hours==null?'—':number(event.maturation_hours)+' H']
  ].map(([label,value])=>'<div class="command-detail"><span>'+label+'</span><strong>'+value+'</strong></div>').join('');
  $('#command-title').textContent=event.event_date?formatDate(event.event_date):'Data da definire';
  $('#command-body').innerHTML='<div class="command-meta"><div class="command-detail"><span>Partecipanti</span><strong>'+number(event.guest_count||4)+'</strong></div><div class="command-detail"><span>Note della serata</span><strong class="command-note">'+(event.event_notes?escapeHtml(event.event_notes):'Nessuna nota')+'</strong></div>'+doughDetails+'</div><section class="command-menu"><div class="command-section-title"><span>COMANDA</span><strong>'+pizzas.reduce((total,row)=>total+row.quantity,0)+' pizze · '+specials.reduce((total,row)=>total+row.quantity,0)+' speciali</strong></div>'+menuItems+'</section>';
  $('#command-edit-button').dataset.editEvent=event.id;
  $('#command-dialog').showModal();
}
function openSavedEvent(eventId){
  const event=state.events.find(item=>item.id===eventId);if(!event)return;
  state.activeEventId=event.id;state.eventDate=event.event_date||'';state.guests=Number(event.guest_count)||4;state.eventNotes=event.event_notes||'';state.doughWeight=event.dough_weight_g??null;state.hydration=event.hydration_percent??null;state.ballCount=event.ball_count??null;state.ballWeight=event.ball_weight_g??null;state.maturationHours=event.maturation_hours??null;state.checked=[...(event.checked_ingredients||[])];
  const quantities=new Map((event.menu||[]).map(item=>[item.pizza_id,Number(item.quantity)||0]));
  state.pizzas.forEach(pizza=>pizza.count=quantities.get(pizza.id)||0);
  const specialQuantities=new Map((event.special_menu||[]).map(item=>[item.special_id,Number(item.quantity)||0]));state.specials.forEach(item=>item.count=specialQuantities.get(item.id)||0);
  save();showToast('Serata caricata nel menu.');
}
function startNewEvent(){
  state.activeEventId=null;state.eventDate='';state.guests=4;state.eventNotes='';state.doughWeight=null;state.hydration=null;state.ballCount=null;state.ballWeight=null;state.maturationHours=null;state.checked=[];state.pizzas.forEach(pizza=>pizza.count=0);state.specials.forEach(item=>item.count=0);
  saveLocal();showToast('Nuova serata pronta da organizzare.');
}
async function deleteSavedEvent(eventId){
  const event=state.events.find(item=>item.id===eventId);if(!event)return;
  const date=event.event_date?formatDate(event.event_date):'senza data';
  if(!confirm('Eliminare la serata del '+date+'? La cancellazione non si può annullare.'))return;
  const userId=currentUser?.id;if(!userId){showToast('Accedi per eliminare una serata.');return;}
  setCloudStatus('Eliminazione serata…');
  cloudSyncChain=cloudSyncChain.catch(()=>{}).then(async()=>{
    const result=await supabaseClient.from('pizza_events').delete().eq('user_id',userId).eq('id',eventId);
    requireCloud(result);
  });
  try{
    await cloudSyncChain;
    state.events=state.events.filter(item=>item.id!==eventId);
    if(state.activeEventId===eventId){state.activeEventId=null;state.eventDate='';state.guests=4;state.eventNotes='';state.doughWeight=null;state.hydration=null;state.ballCount=null;state.ballWeight=null;state.maturationHours=null;state.checked=[];state.pizzas.forEach(pizza=>pizza.count=0);state.specials.forEach(item=>item.count=0);}
    saveLocal();if(currentUser?.id===userId)setCloudStatus('Sincronizzato su Supabase');
    showToast('Serata eliminata.');
  }catch(error){
    console.error('Forno di casa delete event:',error);
    if(currentUser?.id===userId){setCloudStatus('Eliminazione non riuscita');showToast('Non riesco a eliminare la serata. Riprova tra poco.');}
  }
}
async function saveCurrentEvent(){
  const menu=currentMenu();
  if(!state.eventDate){showToast('Scegli prima la data della serata.');return;}
  if(!menu.length&&!currentSpecialMenu().length){showToast('Aggiungi almeno una pizza o una speciale al menu.');return;}
  if(!currentUser){showToast('Accedi per salvare la serata su tutti i dispositivi.');return;}
  const isNew=!state.activeEventId;
  if(isNew)state.activeEventId=crypto.randomUUID();
  captureActiveEvent();saveLocal();
  const button=$('#save-event-btn');button.disabled=true;setCloudStatus('Salvataggio serata…');
  const userId=currentUser.id;
  cloudSyncChain=cloudSyncChain.catch(()=>{}).then(()=>syncCloudSnapshot(userId));
  try{await cloudSyncChain;if(currentUser?.id===userId){state.activeEventId=null;saveLocal();setCloudStatus('Sincronizzato su Supabase');showToast(isNew?'Serata salvata nel calendario!':'Serata aggiornata!');}}
  catch(error){console.error('Forno di casa save event:',error);if(currentUser?.id===userId){setCloudStatus('Salvataggio non riuscito');showToast('Non riesco a salvare la serata. Riprova tra poco.');}}
  finally{button.disabled=false;render();}
}
function toggleShoppingSheet(open){document.body.classList.toggle('shop-open',open);$('#shop-bar').setAttribute('aria-expanded',String(open));if(open)$('#shop-close').focus();}
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('shop-open'))toggleShoppingSheet(false);});
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}
function navigate(view){$$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));$$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#crumb-current').textContent=({serata:'LA SERATA',pizze:'LE PIZZE',speciali:'LE SPECIALI',ingredienti:'INGREDIENTI'})[view];window.scrollTo({top:0,behavior:'smooth'});}
function openPizzaDialog(pizzaId=null){
  const pizza=pizzaId?state.pizzas.find(item=>item.id===pizzaId):null;
  if(pizzaId&&!pizza)return;
  if(!state.ingredients.length&&!pizza){showToast('Aggiungi prima qualche ingrediente alla dispensa.');navigate('ingredienti');return;}
  editingPizzaId=pizza?.id||null;$('#pizza-form').reset();
  $('#pizza-dialog-kicker').textContent=pizza?'MODIFICA RICETTA':'NUOVA RICETTA';
  $('#pizza-dialog-title').innerHTML=pizza?'Modifica la tua pizza<span class="period">.</span>':'Una pizza tutta tua<span class="period">.</span>';
  $('#pizza-save-button').innerHTML=pizza?'Salva le modifiche <span>↗</span>':'Salva la pizza <span>↗</span>';
  $('#pizza-name').value=pizza?.name||'';$('#pizza-notes').value=pizza?.notes||'';
  $$('input[name="pizza-type"]').forEach(input=>input.checked=input.value===(pizza?.type||'rossa'));
  const selected=new Set(pizza?.ingredients||[]);
  $('#pizza-ingredient-options').innerHTML=state.ingredients.map(item=>`<label class="ingredient-check"><input type="checkbox" name="pizza-ingredients" value="${escapeHtml(item.id)}" ${selected.has(item.id)?'checked':''} /><span>${escapeHtml(item.name)}</span><small>${labelUnit(item.unit)}</small></label>`).join('')||'<span class="muted">Aggiungi ingredienti dalla dispensa per completare la ricetta.</span>';
  $('#pizza-dialog').showModal();
}
function openSpecialDialog(specialId=null){
  const special=specialId?state.specials.find(item=>item.id===specialId):null;
  if(specialId&&!special)return;
  if(!state.ingredients.length&&!special){showToast('Aggiungi prima qualche ingrediente alla dispensa.');navigate('ingredienti');return;}
  editingSpecialId=special?.id||null;$('#special-form').reset();
  $('#special-dialog-kicker').textContent=special?'MODIFICA PREPARAZIONE':'NUOVA PREPARAZIONE';
  $('#special-dialog-title').innerHTML=special?'Modifica la tua speciale<span class="period">.</span>':'Una preparazione tutta tua<span class="period">.</span>';
  $('#special-save-button').innerHTML=special?'Salva le modifiche <span>↗</span>':'Salva la speciale <span>↗</span>';
  $('#special-name').value=special?.name||'';$('#special-notes').value=special?.notes||'';
  const selected=new Set(special?.ingredients||[]);
  $('#special-ingredient-options').innerHTML=state.ingredients.map(item=>`<label class="ingredient-check"><input type="checkbox" name="special-ingredients" value="${escapeHtml(item.id)}" ${selected.has(item.id)?'checked':''} /><span>${escapeHtml(item.name)}</span><small>${labelUnit(item.unit)}</small></label>`).join('')||'<span class="muted">Aggiungi ingredienti dalla dispensa per completare la preparazione.</span>';
  $('#special-dialog').showModal();
}
function openIngredientDialog(ingredientId=null){
  const ingredient=ingredientId?ingredientById(ingredientId):null;
  if(ingredientId&&!ingredient)return;
  editingIngredientId=ingredient?.id||null;$('#ingredient-form').reset();$('#ingredient-id').value=ingredient?.id||'';
  $('#ingredient-name').value=ingredient?.name||'';
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

async function copyShopping(){const list=getShopping(),menuItems=getMenuItems();if(!list.length&&!menuItems.length)return;const date=formatDate(state.eventDate);const menuText=menuItems.length?`PIZZE E PREPARAZIONI\n${menuItems.map(item=>`• ${item.name} × ${item.quantity}`).join('\n')}`:'PIZZE E PREPARAZIONI\nNessuna selezionata';const ingredientText=list.length?`INGREDIENTI\n${list.map(item=>`☐ ${item.name} ${quantityLabel(item)}`).join('\n')}`:'INGREDIENTI\nNessun ingrediente necessario';const text=`LISTA DELLA SERATA — ${date}\n\n${menuText}\n\n${ingredientText}`;try{await navigator.clipboard.writeText(text);showToast('Lista della serata copiata!');}catch{showToast('Il browser non consente di copiare la lista.');}}
function renderShoppingDialog(){
  const menuItems=getMenuItems(),ingredients=getShopping();
  $('#dialog-shopping-list').innerHTML=`<section class="dialog-list-section"><h3>Pizze e preparazioni</h3>${menuItems.length?menuItems.map(item=>`<div class="dialog-shop-item"><span>${escapeHtml(item.name)} <small>${item.kind==='pizza'?'Pizza':'Preparazione'}</small></span><strong>× ${item.quantity}</strong></div>`).join(''):'<p class="dialog-list-empty">Nessuna selezionata.</p>'}</section><section class="dialog-list-section"><h3>Ingredienti</h3>${ingredients.length?ingredients.map(item=>`<div class="dialog-shop-item"><span>${escapeHtml(item.name)}</span><strong>${quantityLabel(item)}</strong></div>`).join(''):'<p class="dialog-list-empty">Nessun ingrediente necessario.</p>'}</section>`;
}

function setCloudStatus(message){const status=$('.saved-status');if(status)status.innerHTML=`<i></i> ${escapeHtml(message)}`;}
function requireCloud(result){if(result.error)throw result.error;return result.data;}
async function loadCloudState(user){
  const [ingredientResult,pizzaResult,linkResult,eventResult,eventPizzaResult,specialResult,specialLinkResult,eventSpecialResult]=await Promise.all([
    supabaseClient.from('ingredients').select('id,name,unit').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizzas').select('id,name,type,notes').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizza_ingredients').select('pizza_id,ingredient_id,quantity_per_pizza').eq('user_id',user.id),
    supabaseClient.from('pizza_events').select('id,event_date,guest_count,event_notes,dough_weight_g,hydration_percent,ball_count,ball_weight_g,maturation_hours,checked_ingredients,updated_at').eq('user_id',user.id),
    supabaseClient.from('event_pizzas').select('event_id,pizza_id,quantity').eq('user_id',user.id),
    supabaseClient.from('specials').select('id,name,notes').eq('user_id',user.id).order('name'),
    supabaseClient.from('special_ingredients').select('special_id,ingredient_id,quantity_per_preparation').eq('user_id',user.id),
    supabaseClient.from('event_specials').select('event_id,special_id,quantity').eq('user_id',user.id)
  ]);
  const ingredients=requireCloud(ingredientResult)||[];const pizzas=requireCloud(pizzaResult)||[];const links=requireCloud(linkResult)||[];const eventRows=requireCloud(eventResult)||[];const eventPizzas=requireCloud(eventPizzaResult)||[];const specials=requireCloud(specialResult)||[];const specialLinks=requireCloud(specialLinkResult)||[];const eventSpecials=requireCloud(eventSpecialResult)||[];
  if(!ingredients.length&&!pizzas.length&&!specials.length&&!eventRows.length){state.events=[];state.activeEventId=null;await syncCloudSnapshot(user.id);return;}
  const local=state;const previousActiveId=state.activeEventId;
  const events=eventRows.map(row=>({...row,menu:eventPizzas.filter(item=>item.event_id===row.id).map(item=>({pizza_id:item.pizza_id,quantity:Number(item.quantity)||0})),special_menu:eventSpecials.filter(item=>item.event_id===row.id).map(item=>({special_id:item.special_id,quantity:Number(item.quantity)||0}))}));
  events.sort((a,b)=>(b.event_date||'').localeCompare(a.event_date||'')||(b.updated_at||'').localeCompare(a.updated_at||''));
  const active=events.find(event=>event.id===previousActiveId)||null;
  const quantities=new Map((active?.menu||[]).map(item=>[item.pizza_id,item.quantity]));
  const localQuantities=new Map(local.pizzas.map(pizza=>[pizza.id,pizza.count||0]));const localSpecialQuantities=new Map((local.specials||[]).map(item=>[item.id,item.count||0]));
  state={events,activeEventId:active?.id||null,eventDate:active?.event_date||(!events.length?(local.eventDate||''):''),guests:active?.guest_count||(!events.length?(local.guests||4):4),eventNotes:active?.event_notes??(!events.length?(local.eventNotes||''):''),doughWeight:active?.dough_weight_g??(!events.length?(local.doughWeight??null):null),hydration:active?.hydration_percent??(!events.length?(local.hydration??null):null),ballCount:active?.ball_count??(!events.length?(local.ballCount??null):null),ballWeight:active?.ball_weight_g??(!events.length?(local.ballWeight??null):null),maturationHours:active?.maturation_hours??(!events.length?(local.maturationHours??null):null),
    ingredients:ingredients.map(item=>({id:item.id,name:item.name,unit:'pz'})),
    pizzas:pizzas.map(pizza=>({id:pizza.id,name:pizza.name,type:pizza.type,notes:pizza.notes||'',count:active?(quantities.get(pizza.id)||0):(localQuantities.get(pizza.id)||0),ingredients:links.filter(link=>link.pizza_id===pizza.id).map(link=>link.ingredient_id)})),
    specials:specials.map(item=>({id:item.id,name:item.name,notes:item.notes||'',count:active?(new Map((active.special_menu||[]).map(row=>[row.special_id,row.quantity])).get(item.id)||0):(localSpecialQuantities.get(item.id)||0),ingredients:specialLinks.filter(link=>link.special_id===item.id).map(link=>link.ingredient_id)})),
    checked:active?(active.checked_ingredients||[]).filter(id=>ingredients.some(item=>item.id===id)):(!events.length?(local.checked||[]):[])};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
async function persistActiveEvent(userId){
  if(!state.activeEventId)return;
  captureActiveEvent();
  const active=state.events.find(item=>item.id===state.activeEventId);if(!active)return;
  const saved=requireCloud(await supabaseClient.from('pizza_events').upsert({id:active.id,user_id:userId,event_date:active.event_date,guest_count:active.guest_count,event_notes:active.event_notes,dough_weight_g:active.dough_weight_g,hydration_percent:active.hydration_percent,ball_count:active.ball_count,ball_weight_g:active.ball_weight_g,maturation_hours:active.maturation_hours,checked_ingredients:active.checked_ingredients,updated_at:new Date().toISOString()},{onConflict:'user_id,id'}).select('id').single());
  requireCloud(await supabaseClient.from('event_pizzas').delete().eq('user_id',userId).eq('event_id',saved.id));
  const menu=active.menu.filter(item=>item.quantity>0).map(item=>({user_id:userId,event_id:saved.id,pizza_id:item.pizza_id,quantity:item.quantity}));
  if(menu.length)requireCloud(await supabaseClient.from('event_pizzas').insert(menu));
  requireCloud(await supabaseClient.from('event_specials').delete().eq('user_id',userId).eq('event_id',saved.id));
  const specialMenu=(active.special_menu||[]).filter(item=>item.quantity>0).map(item=>({user_id:userId,event_id:saved.id,special_id:item.special_id,quantity:item.quantity}));
  if(specialMenu.length)requireCloud(await supabaseClient.from('event_specials').insert(specialMenu));
}
async function syncCloudSnapshot(userId){
  const ingredients=state.ingredients.map(({id,name})=>({id,user_id:userId,name,unit:'pz'}));
  const pizzas=state.pizzas.map(({id,name,type,notes})=>({id,user_id:userId,name,type,notes:notes||''}));
  const specials=state.specials.map(({id,name,notes})=>({id,user_id:userId,name,notes:notes||''}));
  if(ingredients.length)requireCloud(await supabaseClient.from('ingredients').upsert(ingredients,{onConflict:'user_id,id'}));
  if(pizzas.length)requireCloud(await supabaseClient.from('pizzas').upsert(pizzas,{onConflict:'user_id,id'}));
  if(specials.length)requireCloud(await supabaseClient.from('specials').upsert(specials,{onConflict:'user_id,id'}));
  const remoteIngredients=requireCloud(await supabaseClient.from('ingredients').select('id').eq('user_id',userId))||[];
  const keepIngredients=new Set(state.ingredients.map(item=>item.id));const removedIngredients=remoteIngredients.map(item=>item.id).filter(id=>!keepIngredients.has(id));
  if(removedIngredients.length)requireCloud(await supabaseClient.from('ingredients').delete().eq('user_id',userId).in('id',removedIngredients));
  const remotePizzas=requireCloud(await supabaseClient.from('pizzas').select('id').eq('user_id',userId))||[];
  const keepPizzas=new Set(state.pizzas.map(item=>item.id));const removedPizzas=remotePizzas.map(item=>item.id).filter(id=>!keepPizzas.has(id));
  if(removedPizzas.length)requireCloud(await supabaseClient.from('pizzas').delete().eq('user_id',userId).in('id',removedPizzas));
  const remoteSpecials=requireCloud(await supabaseClient.from('specials').select('id').eq('user_id',userId))||[];
  const keepSpecials=new Set(state.specials.map(item=>item.id));const removedSpecials=remoteSpecials.map(item=>item.id).filter(id=>!keepSpecials.has(id));
  if(removedSpecials.length)requireCloud(await supabaseClient.from('specials').delete().eq('user_id',userId).in('id',removedSpecials));
  requireCloud(await supabaseClient.from('pizza_ingredients').delete().eq('user_id',userId));
  const relations=state.pizzas.flatMap(pizza=>pizza.ingredients.map(ingredientId=>({user_id:userId,pizza_id:pizza.id,ingredient_id:ingredientId,quantity_per_pizza:1})));
  if(relations.length)requireCloud(await supabaseClient.from('pizza_ingredients').insert(relations));
  requireCloud(await supabaseClient.from('special_ingredients').delete().eq('user_id',userId));
  const specialRelations=state.specials.flatMap(item=>item.ingredients.map(ingredientId=>({user_id:userId,special_id:item.id,ingredient_id:ingredientId,quantity_per_preparation:1})));
  if(specialRelations.length)requireCloud(await supabaseClient.from('special_ingredients').insert(specialRelations));
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
  for(const table of ['ingredients','pizzas','pizza_ingredients','pizza_events','event_pizzas','specials','special_ingredients','event_specials']){
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
  if(event.target.closest('#shop-bar')){toggleShoppingSheet(true);return;}
  if(event.target.closest('#shop-close')){toggleShoppingSheet(false);return;}
  const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
  const go=event.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
  if(event.target.closest('#calendar-trigger')){openCalendar();return;}
  if(event.target.closest('#calendar-prev')){calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()-1,1);renderCalendar();return;}
  if(event.target.closest('#calendar-next')){calendarViewDate=new Date(calendarViewDate.getFullYear(),calendarViewDate.getMonth()+1,1);renderCalendar();return;}
  if(event.target.closest('#calendar-clear')){state.eventDate='';save();$('#calendar-dialog').close();return;}
  if(event.target.closest('#save-event-btn')){saveCurrentEvent();return;}
  if(event.target.closest('#new-event-btn')){startNewEvent();return;}
  const deleteEvent=event.target.closest('[data-delete-event]');if(deleteEvent){deleteSavedEvent(deleteEvent.dataset.deleteEvent);return;}
  const openEvent=event.target.closest('[data-open-event]');if(openEvent){showSavedEvent(openEvent.dataset.openEvent);return;}
  const editEvent=event.target.closest('[data-edit-event]');if(editEvent){openSavedEvent(editEvent.dataset.editEvent);navigate('serata');$('#planning-card').scrollIntoView({behavior:'smooth',block:'start'});return;}
  const day=event.target.closest('[data-calendar-date]');if(day){state.eventDate=day.dataset.calendarDate;save();$('#calendar-dialog').close();return;}
  const close=event.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}
  if(event.target.closest('#command-edit-button')){const id=event.target.closest('#command-edit-button').dataset.editEvent;$('#command-dialog').close();openSavedEvent(id);navigate('serata');$('#planning-card').scrollIntoView({behavior:'smooth',block:'start'});return;}
  const qty=event.target.closest('[data-quantity]');if(qty){const pizza=state.pizzas.find(p=>p.id===qty.dataset.quantity);pizza.count=Math.max(0,Math.min(99,pizza.count+Number(qty.dataset.step)));save();return;}
  const specialQty=event.target.closest('[data-special-quantity]');if(specialQty){const item=state.specials.find(row=>row.id===specialQty.dataset.specialQuantity);item.count=Math.max(0,Math.min(99,item.count+Number(specialQty.dataset.step)));save();return;}
  const editPizza=event.target.closest('[data-edit-pizza]');if(editPizza){openPizzaDialog(editPizza.dataset.editPizza);return;}
  const editSpecial=event.target.closest('[data-edit-special]');if(editSpecial){openSpecialDialog(editSpecial.dataset.editSpecial);return;}
  const delPizza=event.target.closest('[data-delete-pizza]');if(delPizza){const pizza=state.pizzas.find(p=>p.id===delPizza.dataset.deletePizza);if(!pizza)return;if(!confirm(`Eliminare “${pizza.name}” dal ricettario?`))return;state.pizzas=state.pizzas.filter(p=>p.id!==pizza.id);state.events.forEach(item=>item.menu=item.menu.filter(row=>row.pizza_id!==pizza.id));save();showToast('Pizza rimossa dal ricettario.');return;}
  const delSpecial=event.target.closest('[data-delete-special]');if(delSpecial){const special=state.specials.find(item=>item.id===delSpecial.dataset.deleteSpecial);if(!special)return;if(!confirm(`Eliminare “${special.name}” da Le speciali?`))return;state.specials=state.specials.filter(item=>item.id!==special.id);state.events.forEach(item=>item.special_menu=(item.special_menu||[]).filter(row=>row.special_id!==special.id));save();showToast('Preparazione rimossa da Le speciali.');return;}
  const editIngredient=event.target.closest('[data-edit-ingredient]');if(editIngredient){openIngredientDialog(editIngredient.dataset.editIngredient);return;}
  const delIngredient=event.target.closest('[data-delete-ingredient]');if(delIngredient){const ingredient=ingredientById(delIngredient.dataset.deleteIngredient);if(!ingredient)return;if(!confirm(`Rimuovere “${ingredient.name}” dalla dispensa, dalle pizze e dalle speciali?`))return;state.ingredients=state.ingredients.filter(i=>i.id!==ingredient.id);state.pizzas.forEach(p=>p.ingredients=p.ingredients.filter(id=>id!==ingredient.id));state.specials.forEach(item=>item.ingredients=item.ingredients.filter(id=>id!==ingredient.id));state.checked=state.checked.filter(id=>id!==ingredient.id);save();showToast('Ingrediente rimosso dalla dispensa.');return;}
  if(event.target.id==='new-pizza-btn'||event.target.id==='empty-new-pizza'){openPizzaDialog();return;}
  if(event.target.id==='new-special-btn'||event.target.id==='empty-new-special'){openSpecialDialog();return;}
  if(event.target.id==='new-ingredient-btn'){openIngredientDialog();return;}
  if(event.target.id==='copy-list-btn'){const date=formatDate(state.eventDate);$('#dialog-event-date').textContent=`${date} · ${state.guests||4} ${(state.guests||4)===1?'persona':'persone'}`;renderShoppingDialog();$('#shopping-dialog').showModal();return;}
  if(event.target.closest('#dialog-copy-btn')){copyShopping();$('#shopping-dialog').close();return;}
  if(event.target.id==='help-btn'){showToast('Scegli pizze e speciali, imposta le quantità e la lista si aggiorna da sola.');return;}
});
document.addEventListener('change',event=>{
  if(event.target.id==='event-date'){state.eventDate=event.target.value;save();}
  if(event.target.id==='guests'){state.guests=Math.max(1,Math.min(99,Number(event.target.value)||1));save();}
  const eventFields={'event-notes':'eventNotes','event-dough-weight':'doughWeight','event-hydration':'hydration','event-ball-count':'ballCount','event-ball-weight':'ballWeight','event-maturation-hours':'maturationHours'};
  if(eventFields[event.target.id]){const field=eventFields[event.target.id];state[field]=event.target.value===''?(field==='eventNotes'?'':null):(field==='eventNotes'?event.target.value:Number(event.target.value));save();}
  if(event.target.matches('[data-check]')){const id=event.target.dataset.check;state.checked=event.target.checked?[...new Set([...state.checked,id])]:state.checked.filter(value=>value!==id);save();}
});
$('#pizza-filters').addEventListener('click',event=>{const chip=event.target.closest('[data-filter]');if(!chip)return;currentFilter=chip.dataset.filter;$$('.filter-chip').forEach(item=>item.classList.toggle('selected',item===chip));render();});
$('#pizza-search').addEventListener('input',render);$('#catalog-search').addEventListener('input',render);$('#special-search').addEventListener('input',render);
$('#pizza-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#pizza-name').value.trim();if(!name)return;
  const duplicate=state.pizzas.some(item=>item.id!==editingPizzaId&&item.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'));
  if(duplicate){showToast('Esiste già una pizza con questo nome.');return;}
  const selected=$$('input[name="pizza-ingredients"]:checked').map(input=>input.value);const type=$('input[name="pizza-type"]:checked').value;const notes=$('#pizza-notes').value.trim();
  if(editingPizzaId){const pizza=state.pizzas.find(item=>item.id===editingPizzaId);if(!pizza)return;pizza.name=name;pizza.type=type;pizza.notes=notes;pizza.ingredients=selected;}
  else state.pizzas.push({id:`pizza-${crypto.randomUUID()}`,name,type,notes,ingredients:selected,count:0});
  const edited=Boolean(editingPizzaId);editingPizzaId=null;$('#pizza-dialog').close();save();showToast(edited?'Ricetta aggiornata!':'La nuova pizza è nel tuo ricettario!');
});
$('#special-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#special-name').value.trim();if(!name)return;
  const duplicate=state.specials.some(item=>item.id!==editingSpecialId&&item.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'));
  if(duplicate){showToast('Esiste già una preparazione con questo nome.');return;}
  const ingredients=$$('input[name="special-ingredients"]:checked').map(input=>input.value);const notes=$('#special-notes').value.trim();
  if(editingSpecialId){const item=state.specials.find(row=>row.id===editingSpecialId);if(!item)return;item.name=name;item.ingredients=ingredients;item.notes=notes;}
  else state.specials.push({id:`special-${crypto.randomUUID()}`,name,ingredients,notes,count:0});
  const edited=Boolean(editingSpecialId);editingSpecialId=null;$('#special-dialog').close();save();showToast(edited?'Preparazione aggiornata!':'La speciale è nel tuo ricettario!');
});
$('#ingredient-form').addEventListener('submit',event=>{
  event.preventDefault();const name=$('#ingredient-name').value.trim();if(!name)return;const unit='pz';
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
