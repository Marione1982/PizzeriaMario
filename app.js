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
state.pizzas ||= []; state.ingredients ||= []; state.checked ||= [];
let currentFilter = 'tutte'; let toastTimer;
let supabaseClient = null; let currentUser = null; let loadedUserId = null; let cloudSyncTimer; let cloudSyncChain = Promise.resolve();
const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const labelUnit = unit => ({pz:'pezzi',g:'grammi',ml:'millilitri',qb:'quanto basta'}[unit] || unit);
function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); render(); if(currentUser)scheduleCloudSync();}
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
  return `<article class="pizza-card" data-pizza-card="${escapeHtml(pizza.id)}"><div class="card-top"><div><h3 class="pizza-name">${escapeHtml(pizza.name)}</h3><span class="pizza-kind"><i class="kind-dot ${pizza.type==='bianca'?'white':''}"></i>${pizza.type}</span></div>${showQuantity?'':`<button class="card-menu" title="Elimina ${escapeHtml(pizza.name)}" data-delete-pizza="${escapeHtml(pizza.id)}">×</button>`}</div><p class="pizza-ingredients">${names.length?names.map(escapeHtml).join(' · '):'Nessun ingrediente selezionato'}</p><div class="card-bottom"><span class="portion-label">${showQuantity?'NEL MENU':'RICETTA'}</span>${showQuantity?`<div class="quantity-control"><button aria-label="Riduci ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="-1">−</button><span class="quantity">${pizza.count}</span><button aria-label="Aggiungi ${escapeHtml(pizza.name)}" data-quantity="${escapeHtml(pizza.id)}" data-step="1">+</button></div>`:`<span class="portion-label">${names.length} ${names.length===1?'ingrediente':'ingredienti'}</span>`}</div></article>`;
}
function render(){
  $('#event-date').value=state.eventDate||'';$('#guests').value=state.guests||4;
  $('#pizza-count').textContent=state.pizzas.length;$('#all-count').textContent=state.pizzas.length;
  $('#shop-date').textContent=formatDate(state.eventDate);$('#shop-guests').textContent=`${state.guests||4} ${(state.guests||4)===1?'persona':'persone'} a tavola`;
  const homeQuery=$('#pizza-search').value.trim().toLocaleLowerCase('it');
  const selectedType=({rosse:'rossa',bianche:'bianca'})[currentFilter];
  const homePizzas=state.pizzas.filter(p=> (!selectedType||p.type===selectedType)&&p.name.toLocaleLowerCase('it').includes(homeQuery));
  $('#pizza-grid').innerHTML=homePizzas.length?homePizzas.map(p=>pizzaCard(p,true)).join():'<div class="empty-filter">Nessuna pizza trovata con questi filtri.</div>';
  const catalogQuery=$('#catalog-search').value.trim().toLocaleLowerCase('it');const catalogPizzas=state.pizzas.filter(p=>p.name.toLocaleLowerCase('it').includes(catalogQuery));
  $('#catalog-grid').innerHTML=catalogPizzas.length?catalogPizzas.map(p=>pizzaCard(p,false)).join():'<div class="empty-catalog"><strong>Il ricettario ti aspetta.</strong><p>Aggiungi la tua prima pizza e componi un menu tutto tuo.</p><button class="primary-button" id="empty-new-pizza">＋ Aggiungi una pizza</button></div>';
  $('#catalog-summary').textContent=`${state.pizzas.length} ${state.pizzas.length===1?'ricetta':'ricette'} nel ricettario`;
  $('#ingredient-list').innerHTML=state.ingredients.map(item=>`<div class="ingredient-row"><span class="ingredient-symbol">✳</span><div class="ingredient-detail"><strong>${escapeHtml(item.name)}</strong><small>Quantità per pizza · ${labelUnit(item.unit)}</small></div><button class="delete-ingredient" data-delete-ingredient="${escapeHtml(item.id)}" title="Rimuovi ${escapeHtml(item.name)}">×</button></div>`).join('')||'<div class="empty-catalog"><strong>La dispensa è vuota.</strong><p>Aggiungi gli ingredienti che ami usare.</p></div>';
  const list=getShopping();$('#shopping-count').textContent=list.length;$('#shopping-total').innerHTML=`${list.length} <small>${list.length===1?'voce':'voci'}</small>`;
  $('#shopping-empty').hidden=list.length>0;$('#shopping-list').innerHTML=list.map(item=>`<div class="shopping-item ${state.checked.includes(item.id)?'checked':''}"><input class="shopping-check" type="checkbox" data-check="${escapeHtml(item.id)}" ${state.checked.includes(item.id)?'checked':''} aria-label="Segna ${escapeHtml(item.name)} come preso" /><label>${escapeHtml(item.name)}</label><span class="shopping-qty">${quantityLabel(item)}</span></div>`).join('');
  $('#copy-list-btn').disabled=list.length===0;
}
function showToast(message){const toast=$('#toast');toast.textContent=message;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),2200);}
function navigate(view){$$('.view').forEach(el=>el.classList.toggle('active',el.id===`view-${view}`));$$('.nav-item').forEach(el=>el.classList.toggle('active',el.dataset.view===view));$('#crumb-current').textContent=({serata:'LA SERATA',pizze:'LE PIZZE',ingredienti:'INGREDIENTI'})[view];window.scrollTo({top:0,behavior:'smooth'});}
function openPizzaDialog(){if(!state.ingredients.length){showToast('Aggiungi prima qualche ingrediente alla dispensa.');navigate('ingredienti');return;}$('#pizza-form').reset();$('#pizza-ingredient-options').innerHTML=state.ingredients.map(item=>`<label class="ingredient-check"><input type="checkbox" name="pizza-ingredients" value="${escapeHtml(item.id)}" /><span>${escapeHtml(item.name)}</span><small>${labelUnit(item.unit)}</small></label>`).join('');$('#pizza-dialog').showModal();}
async function copyShopping(){const list=getShopping();if(!list.length)return;const date=formatDate(state.eventDate);const text=`LISTA DELLA SPESA — ${date}\n${list.map(item=>`☐ ${item.name} ${quantityLabel(item)}`).join('\n')}`;try{await navigator.clipboard.writeText(text);showToast('Lista copiata negli appunti!');}catch{showToast('Il browser non consente di copiare la lista.');}}

function setCloudStatus(message){const status=$('.saved-status');if(status)status.innerHTML=`<i></i> ${escapeHtml(message)}`;}
function requireCloud(result){if(result.error)throw result.error;return result.data;}
async function loadCloudState(user){
  const [ingredientResult,pizzaResult,linkResult,eventResult]=await Promise.all([
    supabaseClient.from('ingredients').select('id,name,unit').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizzas').select('id,name,type').eq('user_id',user.id).order('name'),
    supabaseClient.from('pizza_ingredients').select('pizza_id,ingredient_id,quantity_per_pizza').eq('user_id',user.id),
    supabaseClient.from('pizza_events').select('id,event_date,guest_count').eq('user_id',user.id).maybeSingle()
  ]);
  const ingredients=requireCloud(ingredientResult)||[];const pizzas=requireCloud(pizzaResult)||[];const links=requireCloud(linkResult)||[];const event=requireCloud(eventResult);
  if(!ingredients.length&&!pizzas.length){await syncCloudSnapshot(user.id);return;}
  const eventPizzas=event?requireCloud(await supabaseClient.from('event_pizzas').select('pizza_id,quantity').eq('user_id',user.id).eq('event_id',event.id))||[]:[];
  const quantities=new Map(eventPizzas.map(row=>[row.pizza_id,row.quantity]));
  state={eventDate:event?.event_date||'',guests:event?.guest_count||4,
    ingredients:ingredients.map(item=>({id:item.id,name:item.name,unit:item.unit})),
    pizzas:pizzas.map(pizza=>({id:pizza.id,name:pizza.name,type:pizza.type,count:quantities.get(pizza.id)||0,ingredients:links.filter(link=>link.pizza_id===pizza.id).map(link=>link.ingredient_id)})),
    checked:state.checked.filter(id=>ingredients.some(item=>item.id===id))};
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
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
  const event=requireCloud(await supabaseClient.from('pizza_events').upsert({user_id:userId,event_date:state.eventDate||null,guest_count:Number(state.guests)||4,updated_at:new Date().toISOString()},{onConflict:'user_id'}).select('id').single());
  requireCloud(await supabaseClient.from('event_pizzas').delete().eq('user_id',userId).eq('event_id',event.id));
  const menu=state.pizzas.map(pizza=>({user_id:userId,event_id:event.id,pizza_id:pizza.id,quantity:pizza.count||0}));
  if(menu.length)requireCloud(await supabaseClient.from('event_pizzas').insert(menu));
}
function scheduleCloudSync(){
  setCloudStatus('Sincronizzazione…');clearTimeout(cloudSyncTimer);
  cloudSyncTimer=setTimeout(()=>{const userId=currentUser?.id;if(!userId)return;cloudSyncChain=cloudSyncChain.catch(()=>{}).then(()=>syncCloudSnapshot(userId)).then(()=>{if(currentUser?.id===userId)setCloudStatus('Sincronizzato su Supabase');}).catch(error=>{console.error('Forno di casa sync:',error);if(currentUser?.id===userId)setCloudStatus('Sincronizzazione in pausa');});},450);
}
async function handleAuthSession(session){
  const authScreen=$('#auth-screen');const appShell=$('#app-shell');
  if(!session?.user){currentUser=null;loadedUserId=null;authScreen.hidden=false;appShell.hidden=true;return;}
  currentUser=session.user;authScreen.hidden=true;appShell.hidden=false;$('.profile strong').textContent=session.user.email||'Il tuo ricettario';$('.profile small').textContent='Sincronizzazione attiva';
  if(loadedUserId===session.user.id)return;loadedUserId=session.user.id;setCloudStatus('Caricamento ricettario…');
  try{await loadCloudState(session.user);render();setCloudStatus('Sincronizzato su Supabase');}
  catch(error){loadedUserId=null;console.error('Forno di casa load:',error);setCloudStatus('Connessione non riuscita');showToast('Non riesco a leggere il ricettario. Riprova tra poco.');}
}
async function initializeCloud(){
  const config=window.FORNO_SUPABASE;
  if(!window.supabase?.createClient||!config?.url||!config?.publishableKey){$('#auth-message').textContent='Collegamento Supabase non configurato.';$('#auth-message').classList.add('error');return;}
  supabaseClient=window.supabase.createClient(config.url,config.publishableKey);
  supabaseClient.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>handleAuthSession(session),0);});
  const {data,error}=await supabaseClient.auth.getSession();if(error){$('#auth-message').textContent='Non riesco a verificare l’accesso. Ricarica la pagina.';$('#auth-message').classList.add('error');return;}await handleAuthSession(data.session);
}

document.addEventListener('click',event=>{
  const nav=event.target.closest('[data-view]');if(nav){navigate(nav.dataset.view);return;}
  const go=event.target.closest('[data-go]');if(go){navigate(go.dataset.go);return;}
  const close=event.target.closest('[data-close]');if(close){close.closest('dialog').close();return;}
  const qty=event.target.closest('[data-quantity]');if(qty){const pizza=state.pizzas.find(p=>p.id===qty.dataset.quantity);pizza.count=Math.max(0,Math.min(99,pizza.count+Number(qty.dataset.step)));save();return;}
  const delPizza=event.target.closest('[data-delete-pizza]');if(delPizza){const pizza=state.pizzas.find(p=>p.id===delPizza.dataset.deletePizza);if(!pizza)return;if(!confirm(`Eliminare “${pizza.name}” dal ricettario?`))return;state.pizzas=state.pizzas.filter(p=>p.id!==pizza.id);save();showToast('Pizza rimossa dal ricettario.');return;}
  const delIngredient=event.target.closest('[data-delete-ingredient]');if(delIngredient){const ingredient=ingredientById(delIngredient.dataset.deleteIngredient);if(!ingredient)return;if(!confirm(`Rimuovere “${ingredient.name}” dalla dispensa e dalle ricette?`))return;state.ingredients=state.ingredients.filter(i=>i.id!==ingredient.id);state.pizzas.forEach(p=>p.ingredients=p.ingredients.filter(id=>id!==ingredient.id));state.checked=state.checked.filter(id=>id!==ingredient.id);save();showToast('Ingrediente rimosso dalla dispensa.');return;}
  if(event.target.id==='new-pizza-btn'||event.target.id==='empty-new-pizza'){openPizzaDialog();return;}
  if(event.target.id==='new-ingredient-btn'){$('#ingredient-form').reset();$('#ingredient-dialog').showModal();return;}
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
$('#pizza-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#pizza-name').value.trim();if(!name)return;const selected=$$('input[name="pizza-ingredients"]:checked').map(input=>input.value);state.pizzas.push({id:`pizza-${crypto.randomUUID()}`,name,type:$('input[name="pizza-type"]:checked').value,ingredients:selected,count:0});$('#pizza-dialog').close();save();showToast('La nuova pizza è nel tuo ricettario!');});
$('#ingredient-form').addEventListener('submit',event=>{event.preventDefault();const name=$('#ingredient-name').value.trim();if(!name)return;const duplicate=state.ingredients.some(item=>item.name.toLocaleLowerCase('it')===name.toLocaleLowerCase('it'));if(duplicate){showToast('Questo ingrediente è già in dispensa.');return;}state.ingredients.push({id:`ing-${crypto.randomUUID()}`,name,unit:$('#ingredient-unit').value});$('#ingredient-dialog').close();save();showToast('Ingrediente aggiunto alla dispensa!');});
$('#auth-form').addEventListener('submit',async event=>{
  event.preventDefault();const message=$('#auth-message');const email=$('#auth-email').value.trim();const button=$('#auth-send');
  if(location.protocol==='file:'){message.textContent='Apri l’app da http://localhost:3000 per collegare l’accesso cloud.';message.className='auth-message error';return;}
  button.disabled=true;message.className='auth-message';message.textContent='Invio del link…';
  try{const {error}=await supabaseClient.auth.signInWithOtp({email,options:{emailRedirectTo:`${location.origin}${location.pathname}`,shouldCreateUser:true}});if(error)throw error;message.textContent='Link inviato. Apri la tua email sullo stesso dispositivo per accedere.';message.className='auth-message success';}
  catch(error){console.error('Forno di casa auth:',error);message.textContent='Invio non riuscito. Controlla l’indirizzo e riprova.';message.className='auth-message error';}
  finally{button.disabled=false;}
});
$('#signout-btn').addEventListener('click',async()=>{if(!supabaseClient)return;const {error}=await supabaseClient.auth.signOut();if(error)showToast('Non riesco a completare la disconnessione.');});
render();
initializeCloud();
