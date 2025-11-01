// Utility
function sanitizeHTML(text) {
  return text
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;');
}
function distance(v1, v2) {
  return Math.hypot(v2[0]-v1[0], v2[1]-v1[1]);
}
let oklchToHexCache = new Map();
function oklchToHex(L, c, hDeg) {
  let k = L+'-'+c+'-'+hDeg;
  if (oklchToHexCache.has(k)) return oklchToHexCache.get(k);
  L = parseFloat(L), c = parseFloat(c), hDeg = parseFloat(hDeg);
  const h = hDeg*Math.PI/180, a = Math.cos(h)*c, b = Math.sin(h)*c;
  const l = (L+0.3963377774*a+0.2158037573*b)**3;
  const m = (L-0.1055613458*a-0.0638541728*b)**3;
  const s = (L-0.0894841775*a-1.2914855480*b)**3;
  let R =  4.0767416621*l-3.3077115913*m+0.2309699292*s;
  let G = -1.2684380046*l+2.6097574011*m-0.3413193965*s;
  let B = -0.0041960863*l-0.7034186147*m+1.7076147010*s;
  const gamma = x => x<=0.0031308?12.92*x:1.055*x**(1/2.4)-0.055;
  const toHex = n => Math.round(Math.min(1,Math.max(0,gamma(n)))*255).toString(16).padStart(2,'0');
  let v = `#${toHex(R)}${toHex(G)}${toHex(B)}`;
  oklchToHexCache.set(k, v);
  return v;
}
function nameColor(color) {
  let list = colorNamer(color);
  list = [list.html[0], list.ntc[0], list.pantone[0], list.x11[0]];
  return list.toSorted((a,b)=>b.distance-a.distance)[0].name
}
function isHWAOff() {
  const gl = document.createElement('canvas').getContext('webgl');
  if (!gl) return true;
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return /swiftshader|software|basic render/i.test(renderer||'');
}

// Saving
let lastsave = 0;
let savededupe;
function save() {
  let now = Date.now();
  lastsave = now;
  window.projectdata.lastsave = now;
  window.projectdata.layers = window.projectdata.layers.map(l=>{
    if (l.type==='draw') {
      l.data = document.getElementById(l.id).toDataURL();
    } else if (l.type==='shapes') {
      l.data = document.getElementById(l.id).innerHTML.replaceAll(' class="select"','').replaceAll(' onclick="window.svgclick(this)"','');
    }
    return l;
  });
  let tx = db.transaction(['projectdata'], 'readwrite');
  let dstore = tx.objectStore('projectdata');
  dstore.put(window.projectdata);
  compositeLayers(true).then(res=>res.convertToBlob()).then(blob=>{
    let reader = new FileReader();
    reader.onload = ()=>{
      document.getElementById('preview').src = reader.result;
      let tx = db.transaction(['projects'], 'readwrite');
      let pstore = tx.objectStore('projects');
      pstore.put({
        id: window.projectdata.id,
        name: window.projectdata.name,
        width: window.projectdata.width,
        height: window.projectdata.height,
        thumbnail: reader.result
      });
    };
    reader.readAsDataURL(blob);
  });
}
function trysave() {
  if (savededupe) clearTimeout(savededupe);
  savededupe = setTimeout(async()=>{
    savededupe = null;
    save()
  }, 10);
}
window.trysave = trysave;

// Actions
function setActions() {
  document.querySelectorAll('#actions button').forEach(btn=>{
    btn.onclick = ()=>{
      let act = btn.getAttribute('action');
      switch(act) {
        case 'save':
          trysave();
          break;
        case 'export':
          document.getElementById('export').showModal();
          break;
      }
    };
  });
}

// Tools
let tool = 'pencil';
window.tooloptions = { size: 20, step: 0, tolerance: 20, malpha: true, shape: 'square', tsize: 10 };
const ExtraTool = document.getElementById('extra');
const shapes = [
  { name: 'square', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect width="256" height="256" rx="20"/></svg>' },
  { name: 'circle', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><circle cx="128" cy="128" r="128"/></svg>' },
  { name: 'line', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="218.233" y="16" width="32" height="286" rx="16" transform="rotate(45 218.233 16)"/></svg>' }
];
window.setTool = (tol, _this)=>{
  tool = tol;
  document.querySelector('.tools [selected]').removeAttribute('selected');
  _this.setAttribute('selected', true);

  switch(tool) {
    case 'pencil':
    case 'eraser':
      if (ExtraTool.getAttribute('type')!=='draw') {
        ExtraTool.setAttribute('type', 'draw');
        ExtraTool.innerHTML = `<label>Size: <input id="e-size" type="number" min="1" value="${window.tooloptions.size}" onchange="window.tooloptions.size=this.value"></label>
<label>Cap: <select id="e-cap"><option>round</option><option>butt</option><option>square</option></select></label>
<label>Step: <input id="e-step" type="number" min="0" value="${window.tooloptions.step}" onchange="window.tooloptions.step=this.value"></label>`;
      }
      break;
    case 'fill':
      if (ExtraTool.getAttribute('type')!=='fill') {
        ExtraTool.setAttribute('type', 'fill');
        ExtraTool.innerHTML = `<label>Tolerance: <input id="e-tol" type="number" min="0" value="${window.tooloptions.tolerance}" onchange="window.tooloptions.tolerance=this.value"></label>
<label>Maintain alpha: <input id="e-malpha" type="checkbox" ${window.tooloptions.malpha?'checked':''} onchange="window.tooloptions.malpha=this.value"></label>`;
      }
      break;

    case 'select':
      if (ExtraTool.getAttribute('type')!=='select') {
        ExtraTool.setAttribute('type', 'select');
        ExtraTool.innerText = '';
      }
      break;
    case 'shapes':
      if (ExtraTool.getAttribute('type')!=='shapes') {
        ExtraTool.setAttribute('type', 'shapes');
        ExtraTool.innerHTML = shapes.map(s=>`<button name="${s.name}"${window.tooloptions.shape===s.name?' selected':''} aria-label="${s.name}" title="${s.name}">${s.svg}</button>`).join('');
        ExtraTool.querySelectorAll('button').forEach(btn=>{
          btn.onclick = ()=>{
            let name = btn.getAttribute('name');
            window.tooloptions.shape = name;
            document.querySelector('#extra button[selected]').removeAttribute('selected');
            btn.setAttribute('selected', true);
          };
        });
      }
      break;
    case 'text':
      if (ExtraTool.getAttribute('type')!=='text') {
        ExtraTool.setAttribute('type', 'text');
        ExtraTool.innerHTML = `<label>Size: <input id="e-tsize" type="number" min="1" value="${window.tooloptions.tsize}" onchange="window.tooloptions.tsize=this.value"></label>`;
      }
      break;

    case 'image':
      if (ExtraTool.getAttribute('type')!=='image') {
        ExtraTool.setAttribute('type', 'image');
        ExtraTool.innerText = '';
      }
      break;
  }
};

// Colors
let colors = ['oklch(0.7404 0.1257 20.83)','oklch(0.7404 0.1257 67.83)','oklch(0.7404 0.1257 94.54)','oklch(0.7404 0.1257 140.47)','oklch(0.7404 0.1257 245.16)','oklch(0.7404 0.1257 308.19)','#ffffff',
'oklch(0.6187 0.2311 20.83)','oklch(0.7552 0.1466 67.83)','oklch(0.8116 0.1543 94.54)','oklch(0.8027 0.2256 140.47)','oklch(0.6869 0.1663 245.16)','oklch(0.647 0.2487 308.19)','#888888',
'oklch(0.3813 0.1311 20.83)','oklch(0.5178 0.0966 67.83)','oklch(0.5504 0.1043 94.54)','oklch(0.4377 0.1256 140.47)','oklch(0.4618 0.1163 245.16)','oklch(0.3724 0.1487 308.19)','#000000'];
let primary = document.getElementById('primary');
let secondary = document.getElementById('secondary');
const colorPicker = document.getElementById('colorpicker');
window.setColor = (color, what=primary)=>{
  what.style.setProperty('--color', color);
  what.dataset.value = color;
  what.dispatchEvent(new Event('input', { bubbles: true }));
};
let boxPicker = new iro.ColorPicker("#colorpicker", {
  width: 200,
  layoutDirection: 'horizontal',
  color: '#f00',
  borderWidth: 1,
  borderColor: 'var(--text-2)',
  layout: [
    { component: iro.ui.Box },
    {
      component: iro.ui.Slider,
      options: {
        id: 'hue-slider',
        sliderType: 'hue'
      }
    },
    {
      component: iro.ui.Slider,
      options: {
        sliderType: 'alpha'
      }
    }
  ]
});
function showColors() {
  primary.onclick = secondary.onclick = (evt)=>{
    if (colorPicker.open) colorPicker.close();
    colorPicker.show();
    colorPicker.style.left = (evt.target.getBoundingClientRect()).left.toFixed(2)+'px';
    boxPicker.setColors([evt.target.dataset.value]);
    let edit = (color)=>{window.setColor(color.hex8String, evt.target)};
    boxPicker.on('input:change', edit);
    colorPicker.onclose = ()=>{
      boxPicker.off('input:change', edit);
    };
  };
  document.getElementById('rotatecolor').onclick = ()=>{
    let pi = primary.dataset.value;
    window.setColor(secondary.dataset.value);
    window.setColor(pi, secondary);
  };
  document.getElementById('colors').innerHTML = colors.map(c=>{
    let name = c.startsWith('oklch(')?nameColor(oklchToHex(...c.slice(6,c.length-1).split(' '))):nameColor(c);
    return `<button onclick="window.setColor('${c.startsWith('oklch(')?oklchToHex(...c.slice(6,c.length-1).split(' ')):c}')" style="--color:${c}" aria-label="${name}" title="${name}"></button>`
  }).join('');
}

// Layers
const layerIcons = {
  draw: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M42.4876 170.991C59.9825 149.957 91.1969 147.111 112.19 164.656C133.182 182.201 136.017 213.475 118.523 234.51L116.663 236.746C99.8583 256.951 70.3108 260.66 49.0383 245.236L5.21509 213.462C1.65427 210.88 -0.307134 206.625 0.0393098 202.234C0.491684 196.503 4.75066 191.804 10.3987 190.805L18.7815 189.321C23.7638 188.44 28.3307 185.976 31.8088 182.294L42.4876 170.991ZM189.217 11.1699C204.048 -2.06402 226.313 -2.42185 241.57 10.3291C256.827 23.0803 260.481 45.1 250.161 62.1045L182.339 173.861C177.989 181.029 171.502 186.646 163.793 189.917L152.13 194.866C149.776 195.865 147.048 194.92 145.811 192.677L134.174 171.573C131.177 166.138 127.198 161.308 122.44 157.331L118.74 154.239C113.981 150.262 108.526 147.207 102.654 145.23L79.8518 137.551C77.4274 136.734 76.0086 134.214 76.5657 131.713L79.3254 119.322C81.1492 111.133 85.4936 103.725 91.7454 98.1465L189.217 11.1699Z"/></svg>',
  shapes: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M248 89.8242C252.418 89.8242 256 93.4061 256 97.8242V248C256 252.418 252.418 256 248 256H97.8242C93.4061 256 89.8242 252.418 89.8242 248V154.748C89.8244 150.944 92.5215 147.71 96.1689 146.628C120.37 139.452 139.452 120.37 146.628 96.1689C147.71 92.5213 150.944 89.8242 154.749 89.8242H248ZM68.8652 0C106.899 0 137.731 30.832 137.731 68.8652C137.731 106.899 106.899 137.731 68.8652 137.731C30.832 137.731 0 106.899 0 68.8652C0.00014019 30.8321 30.8321 0.000140208 68.8652 0Z"/></svg>'
};
const visibilityIcons = {
  'false': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 33C201.325 33 244.261 105.583 253.91 123.861C255.285 126.465 255.285 129.535 253.91 132.139C244.261 150.417 201.325 223 128 223C54.675 223 11.7386 150.417 2.0889 132.139C0.714388 129.535 0.714385 126.465 2.0889 123.861C11.7386 105.583 54.675 33 128 33ZM128 67C94.3107 67 67 94.3106 67 128C67 161.689 94.3107 189 128 189C161.689 189 189 161.689 189 128C189 94.3106 161.689 67 128 67Z"/><rect x="118" y="84" width="54" height="54" rx="27"/></svg>',
  'true': '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M128 33C201.325 33.0003 244.261 105.584 253.911 123.861C255.285 126.465 255.285 129.535 253.911 132.139C244.261 150.416 201.325 223 128 223C54.6753 223 11.7389 150.417 2.08926 132.139C0.714647 129.535 0.714644 126.465 2.08926 123.861C11.7389 105.583 54.6753 33 128 33ZM128 67C94.311 67 67.0004 94.3106 67.0004 128C67.0004 161.689 94.311 189 128 189C161.69 189 189 161.689 189 128C189 94.3108 161.69 67.0002 128 67Z"/><rect x="118" y="84" width="54" height="54" rx="27"/><path d="M20 20L236 236" stroke-width="40" stroke-linecap="round" fill="none"/></svg>'
};
const FullArea = document.getElementById('area');
const TransformArea = document.getElementById('transforms');
const LayersArea = document.getElementById('layers');
const LayerList = LayersArea.querySelector('div.list');
new Sortable(LayerList, {
  animation: 150,
  onEnd: (evt)=>{
    if (evt.oldIndex===evt.newIndex) return;
    TransformArea.children[window.projectdata.layers.length-1-evt.newIndex][evt.oldIndex>evt.newIndex?'after':'before'](document.getElementById(window.projectdata.layers[evt.oldIndex].id));
    let item = window.projectdata.layers.splice(evt.oldIndex, 1)[0];
    window.projectdata.layers.splice(evt.newIndex, 0, item);
    trysave();
    showLayers();
  }
});
let selectedLayer = '';
window.createLayer = (type)=>{
  let id = Math.round(Math.random()*10**9).toString(36);
  window.projectdata.layers.unshift({ id, type, name: 'New layer', hidden: false });
  if (type==='draw') {
    TransformArea.insertAdjacentHTML('beforeend', `<canvas id="${id}" width="${window.projectdata.width}" height="${window.projectdata.height}"></canvas>`);
  } else if (type==='shapes') {
    TransformArea.insertAdjacentHTML('beforeend', `<svg id="${id}" width="${window.projectdata.width}" height="${window.projectdata.height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${window.projectdata.width} ${window.projectdata.height}"></svg>`);
  }
  if (LayerList.innerText.includes('No layers')) LayerList.innerText = '';
  LayerList.insertAdjacentHTML('afterbegin', `<div id="l-${id}"${id===selectedLayer?' selected':''}>
  <button onclick="window.selectLayer('${id}')">${layerIcons[type]??''} <input class="new" value="New layer" maxlength="50" onkeydown="if(event.key==='Enter')this.blur();" onblur="window.projectdata.layers[window.projectdata.layers.findIndex(l=>l.id==='${id}')].name=this.value;window.showLayers();window.trysave()"></button>
</div>`);
  LayerList.querySelector('input.new').focus();
  LayerList.querySelector('input.new').select();
  window.selectLayer(id);
  trysave();
};
window.selectLayer = (id)=>{
  let type = window.projectdata.layers.find(l=>l.id===id).type;
  document.getElementById('l-'+selectedLayer)?.removeAttribute('selected');
  document.getElementById('l-'+id).setAttribute('selected', true);
  if (document.getElementById(selectedLayer)) document.getElementById(selectedLayer).style.pointerEvents = '';
  selectedLayer = id;
  TransformArea.querySelectorAll('canvas').forEach(canvas=>canvas.onpointerdown=canvas.onpointermove=canvas.onpointerup=canvas.onpointercancel=()=>{});
  document.getElementById(id).style.pointerEvents = 'all';
  if (type==='draw') {
    if (!['pencil','eraser','fill'].includes(tool)) window.setTool('pencil', document.getElementById('tools-draw').children[0]);
    document.getElementById('tools-draw').style.display = '';
    document.getElementById('tools-shapes').style.display = 'none';
    handleActiveCanvas(document.getElementById(id));
  } else if (type==='shapes') {
    if (!['select','shapes','text'].includes(tool)) window.setTool('select', document.getElementById('tools-shapes').children[0]);
    document.getElementById('tools-shapes').style.display = '';
    document.getElementById('tools-draw').style.display = 'none';
    handleActiveSVG(document.getElementById(id));
  }
};
window.togvisLayer = (id,_this)=>{
  let idx = window.projectdata.layers.findIndex(l=>l.id===id);
  let hidden = !window.projectdata.layers[idx].hidden;
  window.projectdata.layers[idx].hidden = hidden;
  _this.innerHTML = visibilityIcons[hidden.toString()];
  _this.parentElement.style.color = hidden?'var(--text-3)':'';
  _this.setAttribute('aria-label', hidden?'Show':'Hide');
  _this.setAttribute('title', hidden?'Show':'Hide');
  document.getElementById(id).style.opacity = hidden?'0':1;
  trysave();
};
window.dupeLayer = async(id)=>{
  let idx = window.projectdata.layers.findIndex(l=>l.id===id);
  let copy = structuredClone(window.projectdata.layers[idx]);
  copy.name = copy.name+' Copy';
  copy.id = Math.round(Math.random()*10**9).toString(36);
  window.projectdata.layers.splice(idx+1, 0, copy);
  let before = document.getElementById(id);
  let after = before.cloneNode(true);
  after.id = copy.id;
  before.before(after);
  after.getContext('2d').drawImage(before, 0, 0);
  showLayers();
  window.selectLayer(copy.id);
  trysave();
};
window.rasterLayer = async(id)=>{
  let idx = window.projectdata.layers.findIndex(l=>l.id===id);
  window.projectdata.layers[idx].type = 'draw';
  let img = await svgToImg(document.getElementById(id));
  document.getElementById(id).outerHTML = `<canvas id="${id}" width="${window.projectdata.width}" height="${window.projectdata.height}"></canvas>`;
  document.getElementById(id).getContext('2d').drawImage(img, 0, 0);
  window.selectLayer(id);
  showLayers();
  trysave();
};
window.deleteLayer = (id)=>{
  window.projectdata.layers = window.projectdata.layers.filter(l=>l.id!==id);
  document.getElementById(id).remove();
  if (selectedLayer===id) window.selectLayer(window.projectdata.layers[0]?.id??'');
  showLayers();
  trysave();
};
window.renameLayer = (_this, id, name, type)=>{
  LayersArea.classList.remove('contracted')
  _this.innerHTML = `${layerIcons[type]??''} <input class="new" value="${name}" maxlength="50" onkeydown="if(event.key==='Enter')this.blur();" onblur="window.projectdata.layers[window.projectdata.layers.findIndex(l=>l.id==='${id}')].name=this.value;window.showLayers();window.trysave()">`;
  LayerList.querySelector('input.new')?.focus();
  LayerList.querySelector('input.new')?.select();
};
function showLayers() {
  LayerList.innerHTML = window.projectdata.layers
    .map(layer=>`<div id="l-${layer.id}"${layer.hidden?' style="color:var(--text-3)"':''}${layer.id===selectedLayer?' selected':''}>
  <button onclick="window.selectLayer('${layer.id}')" ondblclick="window.renameLayer(this, '${layer.id}', '${layer.name}', '${layer.type}')" data-namesec>${layerIcons[layer.type]??''} ${layer.name}</button>
  <button onclick="window.togvisLayer('${layer.id}', this)" class="other" aria-label="${layer.hidden?'Show':'Hide'}" title="${layer.hidden?'Show':'Hide'}">${visibilityIcons[layer.hidden.toString()]}</button>
  <button class="other" data-id="${layer.id}" data-name="${layer.name}" data-type="${layer.type}"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path fill-rule="evenodd" clip-rule="evenodd" d="M128 158C111.431 158 98 144.569 98 128C98 111.431 111.431 98 128 98C144.569 98 158 111.431 158 128C158 144.569 144.569 158 128 158ZM128 60C111.432 60 98.0001 46.5685 98.0001 30C98.0001 13.4315 111.432 -5.87112e-07 128 -1.31135e-06C144.569 -2.03558e-06 158 13.4315 158 30C158 46.5685 144.569 60 128 60ZM98 226C98 242.569 111.431 256 128 256C144.569 256 158 242.569 158 226C158 209.431 144.569 196 128 196C111.431 196 98 209.431 98 226Z"/></svg></button>
</div>`)
    .join('')||'No layers, create one';
  LayerList.querySelectorAll('button.other[data-id]').forEach(btn=>{
    let id = btn.getAttribute('data-id');
    let name = btn.getAttribute('data-name');
    let type = btn.getAttribute('data-type');
    tippy(btn, {
      allowHTML: true,
      content: `<button onclick="window.renameLayer(document.querySelector('#l-${id} [data-namesec]'), '${id}', '${name}', '${type}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M72.5096 256C71.9573 256 71.5096 255.552 71.5096 255V238.941C71.5096 238.389 71.9573 237.941 72.5096 237.941H79.7382C84.9855 237.941 89.7557 237.463 94.0489 236.507C98.5806 235.312 102.158 233.041 104.782 229.695C107.644 226.109 109.075 220.932 109.075 214V17.9272H74.7295C67.8127 17.9272 62.3269 19.3614 58.2723 22.2297C54.2176 24.859 51.2362 28.4444 49.3281 32.986C47.42 37.2885 46.1082 42.0691 45.3927 47.3277L43.7065 61.8604C43.648 62.3647 43.2209 62.7451 42.7132 62.7451H26.0289C25.4655 62.7451 25.0133 62.2798 25.0293 61.7166L26.7611 0.971502C26.7766 0.430536 27.2195 0 27.7607 0H227.239C227.78 0 228.223 0.430535 228.239 0.971502L229.971 61.7166C229.987 62.2798 229.535 62.7451 228.971 62.7451H212.287C211.779 62.7451 211.352 62.3647 211.294 61.8604L209.607 47.3277C209.13 42.0691 207.819 37.2885 205.672 32.986C203.764 28.4444 200.782 24.859 196.728 22.2297C192.673 19.3614 187.068 17.9272 179.913 17.9272H145.209V214C145.209 221.41 146.521 225.866 149.145 229.69C151.768 233.275 155.346 235.315 159.878 236.51C164.41 237.705 169.299 237.941 174.546 237.941H181.775C182.327 237.941 182.775 238.389 182.775 238.941V255C182.775 255.552 182.327 256 181.775 256H72.5096Z"/></svg> Rename</button>
<button onclick="window.dupeLayer('${id}')"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="88.5" y="88.5" width="155" height="155" rx="17.5" stroke-width="25" fill="none"/><rect width="180" height="180" rx="30"/></svg> Duplicate</button>`+
(type==='shapes'?`<button onclick="window.rasterLayer('${id}')">Rasterize</button>`:'')+
`<button onclick="window.deleteLayer('${id}')" style="color:var(--red-1)"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><path d="M42.6776 7.32227C32.9145 -2.44063 17.0852 -2.44077 7.32214 7.32227C-2.44082 17.0853 -2.44069 32.9146 7.32214 42.6777L92.2616 127.617L7.32214 212.557C-2.44091 222.32 -2.44083 238.149 7.32214 247.912C17.0852 257.675 32.9145 257.675 42.6776 247.912L127.617 162.973L212.557 247.912C222.32 257.675 238.149 257.675 247.912 247.912C257.675 238.149 257.675 222.32 247.912 212.557L162.973 127.617L247.912 42.6777C257.675 32.9146 257.675 17.0853 247.912 7.32227C238.149 -2.44079 222.32 -2.44068 212.557 7.32227L127.617 92.2617L42.6776 7.32227Z"/></svg> Delete</button>`,
      interactive: true,
      trigger: 'click',
      placement: 'left-start',
      sticky: true
    });
  });
  LayersArea.querySelector('button.toggle').onclick = ()=>{
    LayersArea.classList.toggle('contracted');
    LayersArea.querySelector('button.toggle').style.transform = LayersArea.classList.contains('contracted')?'rotateY(180deg)':'';
  };
  let instance = tippy(LayersArea.querySelector('button.add'), {
    allowHTML: true,
    content: `<button onclick="window.createLayer('draw')">${layerIcons.draw} Free draw</button>
<button onclick="window.createLayer('shapes')">${layerIcons.shapes} Shapes</button>`,
    interactive: true,
    trigger: 'click',
    placement: 'bottom-end',
    sticky: true
  });
  instance.popper.addEventListener('click', (evt)=>{
    if (evt.target&&evt.target.tagName.toLowerCase()==='button') instance.hide();
  });
}
window.showLayers = showLayers;

// Drawing
function svgToImg(elem) {
  return new Promise((resolve)=>{
    let data = new XMLSerializer().serializeToString(elem);
    data = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    let img = new Image();
    img.onload = ()=>{
      resolve(img);
      URL.revokeObjectURL(img.src);
    }
    img.src = URL.createObjectURL(data);
  });
}
async function compositeLayers(preview=true, transparency=true) {
  let w = window.projectdata.width;
  let ws = window.projectdata.width/(preview?2:1);
  let h = window.projectdata.height;
  let hs = window.projectdata.height/(preview?2:1);
  let offscreen = new OffscreenCanvas(ws, hs);
  const ctx = offscreen.getContext('2d');

  if (transparency) {
    ctx.clearRect(0, 0, ws, hs);
  } else {
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, ws, hs);
  }

  let layers = window.projectdata.layers.toReversed();
  for (const layer of layers) {
    if (layer.hidden) continue;
    if (layer.type==='draw') {
      ctx.drawImage(document.getElementById(layer.id), 0, 0, w, h, 0, 0, ws, hs);
    } else if (layer.type==='shapes') {
      ctx.drawImage((await svgToImg(document.getElementById(layer.id))), 0, 0, w, h, 0, 0, ws, hs);
    }
  }

  return offscreen;
}
window.compositeLayers = compositeLayers;

function globalXToLocal(x, b) {
  return (x-b.left)/b.width*window.projectdata.width;
}
function globalYToLocal(y, b) {
  return (y-b.top)/b.height*window.projectdata.height;
}

function colorCompare(a,b,tol) {
  return (Math.abs(a[0]-b[0])<=tol)&&(Math.abs(a[1]-b[1])<=tol)&&(Math.abs(a[2]-b[2])<=tol);
}
function floodfill(imageData, x, y, target, color, tol) {
  let offset = (y * imageData.width + x) * 4;
  if (!colorCompare(imageData.data.slice(offset, offset+4),target,tol)) return;

  imageData.data.set(color, offset);

  floodfill(imageData, Math.max(x-1, 0), y, target, color, tol);
  floodfill(imageData, Math.min(x+1, imageData.width), y, target, color, tol);
  floodfill(imageData, x, Math.max(y-1, 0), target, color, tol);
  floodfill(imageData, x, Math.min(y+1, imageData.height), target, color, tol);
}

function handleActiveCanvas(canvas) {
  let pointers = new Map();
  let ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.onpointerdown = (evt)=>{
    evt.preventDefault();
    canvas.setPointerCapture(evt.pointerId);
    pointers.set(evt.pointerId, { x: evt.clientX, y: evt.clientY, button: evt.button });
    if (evt.button===1) {
      TransformArea.style.cursor = 'move';
    } else if (evt.button===0&&tool==='fill') {
      let b = canvas.getBoundingClientRect();
      let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let x = Math.floor(globalXToLocal(evt.clientX,b));
      let y = Math.floor(globalYToLocal(evt.clientY,b));
      let target = imageData.data.slice((y*imageData.width+x)*4, (y*imageData.width+x+1)*4);
      let color = [parseInt(primary.dataset.value.slice(1,3),16),parseInt(primary.dataset.value.slice(3,5),16),parseInt(primary.dataset.value.slice(5,7),16),255];
      let alpha = parseInt(primary.dataset.value.slice(7,9),16);
      color[3] = Number.isNaN(alpha)?255:alpha;
      if (colorCompare(color,target)) return;
      let malpha = document.getElementById('e-malpha').checked??false;
      if (malpha) color = color.slice(0,3);
      floodfill(imageData, x, y, target, color, document.getElementById('e-tol').value||0);
      ctx.putImageData(imageData, 0, 0);
      trysave();
    } else if (evt.button===0&&tool==='image') {
      document.getElementById('tool-image-up').click();
      document.getElementById('tool-image-up').onchange = (evt2)=>{
        let file = evt2.target.files[0];
        evt2.target.value = '';
        if (!file) return;
        putImage(file, evt);
      };
    }
  };
  canvas.onpointermove = (evt, coal=true)=>{
    if (coal) {
      let events = evt.getCoalescedEvents();
      if (events) {
        events.forEach(event=>{canvas.onpointermove(event, false)});
        return;
      }
    }
    if (!pointers.has(evt.pointerId)) return;
    let pointer = pointers.get(evt.pointerId);
    if (pointer.button===1) {
      x += (evt.clientX-pointer.x)/zoom;
      y += (evt.clientY-pointer.y)/zoom;
      pointer.x = evt.clientX;
      pointer.y = evt.clientY;
      pointers.set(evt.pointerId,pointer);
      transform();
    } else if (pointer.button===0) {
      if (['fill','image'].includes(tool)) return;
      if ((document.getElementById('e-step')?.value||0)>distance([pointer.x,pointer.y], [evt.clientX,evt.clientY])) return;
      let b = canvas.getBoundingClientRect();
      ctx.globalCompositeOperation = tool==='eraser'?'destination-out':'source-over';
      ctx.strokeStyle = primary.dataset.value;
      ctx.lineWidth = document.getElementById('e-size').value||10;
      ctx.lineCap = document.getElementById('e-cap').value||'round';
      ctx.beginPath();
      ctx.moveTo(globalXToLocal(pointer.x,b), globalYToLocal(pointer.y,b));
      ctx.lineTo(globalXToLocal(evt.clientX,b), globalYToLocal(evt.clientY,b));
      ctx.stroke();
      pointer.x = evt.clientX;
      pointer.y = evt.clientY;
      pointers.set(evt.pointerId,pointer);
      trysave();
    }
  };
  canvas.onpointerup = canvas.onpointercancel = (evt)=>{
    canvas.releasePointerCapture(evt.pointerId);
    if (pointers.get(evt.pointerId).button===1) TransformArea.style.cursor = '';
    pointers.delete(evt.pointerId);
  };
}
window.svgactive = null;
window.svgclick = (_this)=>{
  if (tool!=='select') return;
  window.svgactive = _this;
  _this.parentElement.querySelector('.select')?.classList?.remove('select');
  _this.classList.add('select');
  primary.oninput = ()=>{
    _this.setAttribute((_this.tagName.toLowerCase()==='line')?'stroke':'fill', primary.dataset.value);
    trysave();
  };
  window.setColor(_this.getAttribute((_this.tagName.toLowerCase()==='line')?'stroke':'fill'));
  switch(_this.tagName.toLowerCase()) {
    case 'rect':
      ExtraTool.innerHTML = `<label>Roundness: <input type="number" value="${_this.getAttribute('rx')}" min="0" oninput="window.svgactive.setAttribute('rx',this.value);window.trysave()"></label>`;
      break;
    case 'line':
      ExtraTool.innerHTML = `<label>Width: <input type="number" value="${_this.getAttribute('stroke-width')}" min="1" oninput="window.svgactive.setAttribute('stroke-width',this.value);window.trysave()"></label>
<label>Cap: <select id="e-cap" onchange="window.svgactive.setAttribute('stroke-linecap',this.value);window.trysave()"><option>round</option><option>butt</option><option>square</option></select></label>`;
      ExtraTool.querySelector('select').value = _this.getAttribute('stroke-linecap');
      break;
    default:
      ExtraTool.innerHTML = 'No options';
      break;
  }
  FullArea.onclick = (evt)=>{
    if (evt.target===_this) return;
    FullArea.onclick = ()=>{};
    primary.oninput = ()=>{};
    _this.classList.remove('select');
    ExtraTool.innerText = '';
  };
};
function handleActiveSVG(svg) {
  let drag = false;
  let firstpos = [0,0];
  TransformArea.onpointerdown = (evt)=>{
    if (tool==='shapes') {
      drag = true;
      firstpos = [evt.clientX,evt.clientY];
    } else if (tool==='image') {
      document.getElementById('tool-image-up').click();
      document.getElementById('tool-image-up').onchange = (evt2)=>{
        let file = evt2.target.files[0];
        evt2.target.value = '';
        if (!file) return;
        putImage(file, evt);
      };
    }
  };
  TransformArea.onpointerup = (evt)=>{
    if (!drag) return;
    drag = false;
    let content = '';
    let b = svg.getBoundingClientRect();
    let secpos = [evt.clientX,evt.clientY];
    if (window.tooloptions.shape!=='line') {
      if (firstpos[0]>secpos[0]) { secpos[0] = firstpos[0]; firstpos[0] = evt.clientX };
      if (firstpos[1]>secpos[1]) { secpos[1] = firstpos[1]; firstpos[1] = evt.clientY };
    }
    let w = Math.abs(globalXToLocal(firstpos[0],b)-globalXToLocal(secpos[0],b));
    let h = Math.abs(globalYToLocal(firstpos[1],b)-globalYToLocal(secpos[1],b));
    if (w===0&&h===0) {
      w = 10;
      h = 10;
    }
    w = Math.max(w,1);
    h = Math.max(h,1);
    switch(window.tooloptions.shape) {
      case 'square':
        content = `<rect onclick="window.svgclick(this)" fill="${primary.dataset.value}" width="${w}" height="${h}" x="${globalXToLocal(firstpos[0],b)}" y="${globalYToLocal(firstpos[1],b)}" rx="0" stroke="none"></rect>`;
        break;
      case 'circle':
        content = `<ellipse onclick="window.svgclick(this)" fill="${primary.dataset.value}" cx="${globalXToLocal(firstpos[0],b)+Math.floor(w/2)}" rx="${Math.floor(w/2)}" cy="${globalYToLocal(firstpos[1],b)+Math.floor(h/2)}" ry="${Math.floor(h/2)}" stroke="none"></ellipse>`;
        break;
      case 'line':
        content = `<line onclick="window.svgclick(this)" stroke="${primary.dataset.value}" stroke-width="10" stroke-linecap="round" x1="${globalXToLocal(firstpos[0],b)}" y1="${globalYToLocal(firstpos[1],b)}" x2="${globalXToLocal(secpos[0],b)}" y2="${globalYToLocal(secpos[1],b)}" fill="none"></line>`;
        break;
    }
    svg.insertAdjacentHTML('beforeend', content);
    trysave();
  };
}

// Drawing images
function putImage(file, oevt) {
  const reader = new FileReader();
  reader.onload = function() {
    let layer = window.projectdata.layers.find(l=>l.id===selectedLayer);
    let b = document.getElementById(layer.id).getBoundingClientRect();
    let img = new Image();
    img.onload = ()=>{
      if (layer.type==='draw') {
        document.getElementById(layer.id).getContext('2d').drawImage(img, globalXToLocal(oevt.clientX,b), globalYToLocal(oevt.clientY,b));
      } else if (layer.type==='shapes') {
        document.getElementById(layer.id).insertAdjacentHTML('afterbegin', `<image href="${reader.result}" width="${Math.round(img.width/window.projectdata.width*b.width)}" height="${Math.round(img.height/window.projectdata.height*b.height)}" x="${globalXToLocal(oevt.clientX,b)}" y="${globalYToLocal(oevt.clientY,b)}"/>`);
      }
      trysave();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
FullArea.ondrop = (evt)=>{
  evt.preventDefault();
  let files = evt.dataTransfer.files;
  if (!files[0]) return;
  if (!files[0].type.startsWith('image/')) return;
  putImage(files[0], evt);
};
FullArea.ondragover = (evt)=>{
  evt.preventDefault();
};
FullArea.ondragleave = (evt)=>{
  evt.preventDefault();
};
document.onpaste = (evt)=>{
  let items = Array.from(evt.clipboardData.items).filter(item=>item.type.startsWith('image/'));
  if (!items[0]) return;
  putImage(items[0].getAsFile(), evt);
};

// User move & zoom
let x = 0;
let y = 0;
let zoom = 1;
let woh = true;
const Cursor = document.getElementById('cursor');
const gcd = (a,b)=>b===0?a:gcd(b,a%b);
function transform() { // Apply transforms
  TransformArea.style.transform = `translate${woh?'Y':'X'}(-50%) scale(${zoom}) translate(${x}px, ${y}px)`;
}
function mzinter() {
  // Size
  let d = gcd(window.projectdata.width, window.projectdata.height);
  let aspect = [window.projectdata.width/d, window.projectdata.height/d];
  woh = window.projectdata.width>window.projectdata.height;
  TransformArea.style.aspectRatio = aspect.join(' / ');
  TransformArea.style[woh?'top':'left'] = '50%';
  TransformArea.style[woh?'height':'width'] = 'unset';
  TransformArea.style.transform = `translate${woh?'Y':'X'}(-50%)`;
  document.getElementById('preview').style.aspectRatio = aspect.join(' / ');
  document.getElementById('preview').style.height = 'unset';

  // Focus
  FullArea.onpointerdown = ()=>{
    if (['input','select'].includes(document.activeElement.tagName.toLowerCase())) {
      document.activeElement.blur();
    }
  };
  // Move
  FullArea.onpointermove = (evt)=>{
    if (evt.pointerType==='touch') return;
    let b = TransformArea.getBoundingClientRect();
    Cursor.style.left = (globalXToLocal(evt.clientX,b)/(window.projectdata.width*zoom)*b.width).toFixed(2)+'px';
    Cursor.style.top = (globalYToLocal(evt.clientY,b)/(window.projectdata.height*zoom)*b.height).toFixed(2)+'px';
    switch(tool) {
      case 'pencil':
      case 'eraser':
        Cursor.style.display = '';
        Cursor.style.width = Cursor.style.height = Math.round((document.getElementById('e-size')?.value||10)*(TransformArea.offsetWidth/window.projectdata.width))+'px';
        Cursor.style.borderRadius = document.getElementById('e-cap').value==='round'?'100rem':'0px';
        if (TransformArea.style.cursor==='crosshair') TransformArea.style.cursor = '';
        break;
      case 'select':
        Cursor.style.display = 'none';
        if (TransformArea.style.cursor!=='move') TransformArea.style.cursor = 'crosshair';
        break;
      case 'shapes':
        Cursor.style.display = '';
        Cursor.style.width = '15px';
        Cursor.style.height = '15px';
        Cursor.style.borderRadius = window.tooloptions.shape==='square'?'0px':'100rem';
        if (TransformArea.style.cursor==='crosshair') TransformArea.style.cursor = '';
        break;
    }
  };
  // On scroll zoom
  FullArea.addEventListener('wheel', (evt)=>{
    if (evt.ctrlKey) evt.preventDefault();
  }, { passive: false });
  FullArea.addEventListener('wheel', (evt)=>{
    zoom += evt.deltaY/-(evt.shiftKey?500:(evt.altKey?2000:1000));
    zoom = Math.max(parseFloat(zoom.toFixed(5)), 0.1);
    transform();
  }, { passive: true });
  // Keybinds
  document.onkeydown = (evt)=>{
    if (['input','select'].includes(document.activeElement.tagName.toLowerCase())) return;
    let amount = (evt.shiftKey?50:(evt.altKey?5:10));
    switch(evt.key) {
      // Move
      case 'ArrowUp':
        y += amount;
        break;
      case 'ArrowDown':
        y -= amount;
        break;
      case 'ArrowLeft':
        x += amount;
        break;
      case 'ArrowRight':
        x -= amount;
        break;
      // Zoom
      case '+':
        if (!evt.ctrlKey) return;
        evt.preventDefault();
        zoom += (evt.shiftKey?0.2:(evt.altKey?0.05:0.1));
        zoom = Math.max(parseFloat(zoom.toFixed(5)), 0.1);
        break;
      case '-':
        if (!evt.ctrlKey) return;
        evt.preventDefault();
        zoom -= (evt.shiftKey?0.2:(evt.altKey?0.05:0.1));
        zoom = Math.max(parseFloat(zoom.toFixed(5)), 0.1);
        break;
      case '0':
        if (!evt.ctrlKey) return;
        zoom = 1;
        x = 0;
        y = 0;
        break;
      // Del
      case 'Backspace':
      case 'Delete':
        if (document.querySelector('#transforms svg .select')) {
          document.querySelector('#transforms svg .select').remove();
          trysave();
        }
        break;
      default:
        return;
    }
    transform();
  };
}

// Projects
window.loadProject = (id)=>{
  HelloModal.close();
  let tx = db.transaction('projectdata', 'readwrite');
  let store = tx.objectStore('projectdata');
  let request = store.get(id);
  request.onsuccess = ()=>{
    window.projectdata = request.result;
    showLayers();
    mzinter();
    window.projectdata.layers.forEach(l=>{
      if (l.type==='draw') {
        TransformArea.insertAdjacentHTML('afterbegin', `<canvas id="${l.id}" width="${window.projectdata.width}" height="${window.projectdata.height}"${l.hidden?' style="opacity:0"':''}></canvas>`);
      } else if (l.type==='shapes') {
        TransformArea.insertAdjacentHTML('afterbegin', `<svg id="${l.id}" width="${window.projectdata.width}" height="${window.projectdata.height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${window.projectdata.width} ${window.projectdata.height}"${l.hidden?' style="opacity:0"':''}></svg>`);
      }
      if (l.data) {
        if (l.type==='draw') {
          let img = new Image();
          img.onload = ()=>{
            document.getElementById(l.id).getContext('2d').drawImage(img, 0, 0);
          };
          img.src = l.data;
        } else if (l.type==='shapes') {
          document.getElementById(l.id).innerHTML = l.data;
          Array.from(document.getElementById(l.id).children).forEach(elem=>elem.setAttribute('onclick','window.svgclick(this)'));
        }
      }
    });
    if (window.projectdata.layers[0]) {
      selectedLayer = window.projectdata.layers[0].id;
      showLayers();
      window.selectLayer(window.projectdata.layers[0].id);
    }
    trysave();
  };
};
window.deleteProject = (id)=>{
  let tx = db.transaction(['projects','projectdata'], 'readwrite');
  let pstore = tx.objectStore('projects');
  let dstore = tx.objectStore('projectdata');
  pstore.delete(id);
  dstore.delete(id);
  tx.oncomplete = ()=>{showProjects()};
};
function showProjects() {
  let readTx = window.db.transaction('projects', 'readonly');
  let readStore = readTx.objectStore('projects');
  let getReq = readStore.getAll();
  getReq.onsuccess = ()=>{
    document.querySelector('#hello div.list').innerHTML = getReq.result
      .map(pr=>`<div class="project">
  ${pr.thumbnail?`<span style="flex:1"></span><img src="${pr.thumbnail}"><span style="flex:1"></span>`:''}
  <span>${sanitizeHTML(pr.name)}</span>
  <span class="small">${pr.width}x${pr.height}</span>
  <span>
    <button onclick="window.loadProject(${pr.id})">Open</button>
    <button onclick="window.deleteProject(${pr.id})">Delete</button>
  </span>
</div>`)
      .join('')||'No projects';
  };
}

// Start
let dbRequest = indexedDB.open('data', 1);
dbRequest.onupgradeneeded = function(e) {
  let db = e.target.result;
  if (!db.objectStoreNames.contains('projects')) {
    db.createObjectStore('projects', { keyPath: 'id', autoIncrement: true });
  }
  if (!db.objectStoreNames.contains('projectdata')) {
    db.createObjectStore('projectdata', { keyPath: 'id', autoIncrement: false });
  }
};
const HelloModal = document.getElementById('hello');
dbRequest.onsuccess = function(e) {
  let db = e.target.result;
  window.db = db;

  // General setup
  setActions();
  showColors();

  // Hello modal
  HelloModal.showModal();
  HelloModal.querySelector('button.new').onclick = ()=>{
    document.getElementById('newp').showModal();
    document.querySelector('#newp input.name').focus();
    document.querySelector('#newp input.name').select();
  };
  HelloModal.querySelector('button.img').onclick = ()=>{
    HelloModal.querySelector('input').click();
  };
  HelloModal.querySelector('input').onchange = (evt)=>{
    let file = evt.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function() {
      let img = new Image();
      img.onload = ()=>{
        let tx = db.transaction(['projects','projectdata'], 'readwrite');
        let pstore = tx.objectStore('projects');
        let dstore = tx.objectStore('projectdata');
        let pidreq = pstore.add({ name: file.name, width: img.width, height: img.height, thumbnail: reader.result });
        let pid;
        pidreq.onsuccess = (e) => {
          pid = e.target.result;
          dstore.add({
            id: pid,
            name: file.name,
            width: img.width,
            height: img.height,
            lastsave: Date.now(),
            layers: [{ id: 'base', type: 'draw', name: 'Base', hidden: false, data: reader.result }]
          });
        };
        tx.oncomplete = ()=>{window.loadProject(pid)};
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
  document.querySelector('#newp button.create').onclick = ()=>{
    let tx = db.transaction(['projects','projectdata'], 'readwrite');
    let pstore = tx.objectStore('projects');
    let dstore = tx.objectStore('projectdata');
    let name = document.querySelector('#newp input.name').value;
    let width = Math.max(Number(document.querySelector('#newp input.x').value)||1, 1);
    let height = Math.max(Number(document.querySelector('#newp input.y').value)||1, 1);
    let pidreq = pstore.add({ name, width, height, thumbnail: '' });
    let pid;
    pidreq.onsuccess = (e) => {
      pid = e.target.result;
      dstore.add({
        id: pid,
        name,
        width,
        height,
        lastsave: Date.now(),
        layers: [{ id: 'base', type: 'draw', name: 'Base', hidden: false }]
      });
    };
    tx.oncomplete = ()=>{
      document.getElementById('newp').close();
      window.loadProject(pid);
    };
  };
  showProjects();
};

if (isHWAOff()) {
  document.getElementById('hwanotice').style.display = '';
}