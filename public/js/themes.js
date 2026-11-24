(() => {
  'use strict';
  const root = document.documentElement;
  const themes = {
    rose:['#fff7f9','#ffffff','#c2587a','#4a2f38',24,'serif'],
    dark:['#18171d','#292630','#bd91e9','#f5effa',16,'sans'],
    lavender:['#f3edff','#ffffff','#7953ae','#403054',24,'serif'],
    nature:['#edf3e8','#fcfff9','#52764a','#30482c',14,'serif'],
    minimal:['#f7f0e6','#fffdf8','#87603e','#503d2e',4,'sans'],
    ocean:['#eaf6fc','#ffffff','#246f96','#20465c',18,'sans'],
    sunset:['#fff0e6','#fffaf5','#b94f36','#663d30',24,'serif'],
    luxury:['#161512','#27241e','#cba66a','#f4e7cf',2,'serif'],
    cherry:['#fcecf0','#fff9fa','#a82d50','#581d30',12,'serif'],
    nordic:['#f1f3f4','#ffffff','#536875','#28363d',6,'sans'],
    retro:['#f4e6c9','#fff4dc','#94502f','#63452e',3,'retro'],
    neon:['#101020','#22223b','#da70ff','#f4eaff',10,'sans']
  };
  const labels={ru:['Оформление','Розовая','Тёмная','Лавандовая','Природная','Минимализм','Океан','Закат','Люкс','Вишнёвая','Скандинавская','Ретро','Неон','Как в системе','Случайная тема','Свой цвет','Сбросить'],kk:['Безендіру','Қызғылт','Қараңғы','Лаванда','Табиғат','Минимализм','Мұхит','Күн батуы','Сән-салтанат','Шие','Скандинавиялық','Ретро','Неон','Жүйе бойынша','Кездейсоқ тақырып','Өз түсім','Қалпына келтіру'],en:['Appearance','Rose','Dark','Lavender','Nature','Minimal','Ocean','Sunset','Luxury','Cherry','Nordic','Retro','Neon','System','Random theme','Custom color','Reset'],fr:['Apparence','Rose','Sombre','Lavande','Nature','Minimaliste','Océan','Coucher de soleil','Luxe','Cerise','Nordique','Rétro','Néon','Système','Thème aléatoire','Couleur personnalisée','Réinitialiser']};
  const get=(k,d)=>{try{return localStorage.getItem(k)||d;}catch{return d;}};
  const save=(k,v)=>{try{localStorage.setItem(k,v);}catch{}};
  const keys=Object.keys(themes), media=matchMedia('(prefers-color-scheme: dark)');
  let choice=get('ce-theme','rose'), custom=get('ce-theme-color','#a45d87');
  if(!/^#[0-9a-f]{6}$/i.test(custom)) custom='#a45d87';
  if(![...keys,'system','custom'].includes(choice)) choice='rose';
  const rgb=h=>h.slice(1).match(/../g).map(x=>parseInt(x,16));
  const mix=(a,b,p)=>'#'+rgb(a).map((v,i)=>Math.round(v*(1-p)+rgb(b)[i]*p).toString(16).padStart(2,'0')).join('');
  const lum=h=>rgb(h).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>(Math.max(lum(a),lum(b))+.05)/(Math.min(lum(a),lum(b))+.05);
  function apply(){
    const id=choice==='system'?(media.matches?'dark':'rose'):choice;
    let [bg,surface,accent,ink,r,font]=id==='custom'?[mix(custom,'#ffffff',.94),'#ffffff',custom,'#30252d',18,'sans']:themes[id];
    const dark=lum(bg)<.15;
    while(contrast(accent,bg)<4.5) accent=mix(accent,dark?'#ffffff':'#000000',.12);
    const fg=contrast(accent,'#ffffff')>=4.5?'#ffffff':'#101010';
    root.dataset.theme=id;
    const vars={'--rose-50':bg,'--rose-100':mix(bg,accent,.10),'--rose-200':mix(bg,accent,.19),'--rose-300':mix(bg,accent,.35),'--rose-400':mix(bg,accent,.58),'--rose-500':accent,'--rose-600':accent,'--rose-700':mix(accent,ink,.22),'--ink':ink,'--muted':mix(ink,bg,.24),'--line':mix(bg,ink,.17),'--white':surface,'--theme-surface':surface,'--theme-button':fg,'--theme-scheme':dark?'dark':'light','--theme-error':dark?'#ff9aaa':'#a92a42','--radius':r+'px','--radius-sm':Math.max(2,Math.round(r*.6))+'px','--theme-button-radius':r>=18?'999px':r+'px','--shadow':`0 8px 26px ${accent}25`,'--shadow-lg':`0 16px 42px ${accent}35`,'--font-serif':font==='sans'?'Manrope, system-ui, sans-serif':font==='retro'?'Georgia, serif':'"Cormorant Garamond", Georgia, serif','--font-sans':font==='retro'?'Georgia, serif':'Manrope, system-ui, sans-serif'};
    for(const [k,v] of Object.entries(vars)) { if(id==='rose')root.style.removeProperty(k);else root.style.setProperty(k,v); }
    document.querySelectorAll('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===choice)));
  }
  function select(id){choice=id;save('ce-theme',id);apply();}
  apply(); media.addEventListener('change',()=>{if(choice==='system')apply();});
  document.addEventListener('DOMContentLoaded',()=>{
    const picker=document.createElement('div');picker.className='theme-picker';picker.id='themePicker';
    const l=labels[get('ce-lang','ru')]||labels.ru;
    picker.innerHTML='<button type="button" class="theme-toggle" aria-expanded="false" aria-controls="themeMenu"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.5-3.3 1.5 1.5 0 0 1 1.2-2.5H18a3 3 0 0 0 3-3C21 7 17 3 12 3Z"/><circle cx="7.5" cy="11" r=".8"/><circle cx="10" cy="7" r=".8"/><circle cx="15" cy="7.5" r=".8"/><circle cx="18" cy="11" r=".8"/></svg></button><div class="theme-menu" id="themeMenu" hidden><div class="theme-heading"></div><div class="theme-options"></div><div class="theme-tools"></div></div>';
    const anchor=document.getElementById('languagePicker');if(!anchor)return;anchor.after(picker);
    const toggle=picker.querySelector('button'),menu=picker.querySelector('.theme-menu'),options=picker.querySelector('.theme-options'),tools=picker.querySelector('.theme-tools');
    toggle.setAttribute('aria-label',l[0]);picker.querySelector('.theme-heading').textContent=l[0];
    const open=v=>{menu.hidden=!v;toggle.setAttribute('aria-expanded',String(v));};
    const button=(label,fn,id,color)=>{const b=document.createElement('button');b.type='button';b.className=id?'theme-option':'theme-action';if(id)b.dataset.themeChoice=id;if(color){const s=document.createElement('span');s.className='theme-swatch';s.style.background=color;b.append(s);}b.append(document.createTextNode(label));b.onclick=fn;return b;};
    keys.forEach((id,i)=>options.append(button(l[i+1],()=>select(id),id,themes[id][2])));
    tools.append(button(l[13],()=>select('system'),'system','#888888'),button(l[14],()=>{const a=keys.filter(k=>k!==choice);select(a[Math.floor(Math.random()*a.length)]);}),button(l[16],()=>select('rose')));
    const label=document.createElement('label');label.className='theme-custom';label.textContent=l[15];const input=document.createElement('input');input.type='color';input.value=custom;input.oninput=()=>{custom=input.value;save('ce-theme-color',custom);select('custom');};label.append(input);tools.append(label);
    toggle.onclick=()=>open(menu.hidden);document.addEventListener('click',e=>{if(!picker.contains(e.target))open(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!menu.hidden){open(false);toggle.focus();}});apply();
  });
})();
