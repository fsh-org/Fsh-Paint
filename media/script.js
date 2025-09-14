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
  compositeLayers(true).then(res=>res.convertToBlob({ type: 'image/webp', quality: 0.5 })).then(blob=>{
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
  savededupe = setTimeout(()=>{
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
window.tooloptions = { size: 10, step: 0, shape: 'square' };
const ExtraTool = document.getElementById('extra');
const shapes = [
  { name: 'square', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect width="256" height="256" rx="20"/></svg>' },
  { name: 'circle', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><circle cx="128" cy="128" r="128"/></svg>' },
  { name: 'line', svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 256 256"><rect x="218.233" y="16" width="32" height="286" rx="16" transform="rotate(45 218.233 16)"/></svg>' }
];
window.setTool = (tol, _this)=>{
  tool = tol;
  document.querySelector('#tools [selected]').removeAttribute('selected');
  document.getElementById('t-'+tool).setAttribute('selected', true);

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
    case 'select':
      if (ExtraTool.getAttribute('type')!=='select') {
        ExtraTool.setAttribute('type', 'select');
        ExtraTool.innerHTML = '';
      }
      break;
    case 'shapes':
      if (ExtraTool.getAttribute('type')!=='shapes') {
        ExtraTool.setAttribute('type', 'shapes');
        ExtraTool.innerHTML = shapes.map(s=>`<button onclick="window.tooloptions.shape='${s.name}'" aria-label="${s.name}" title="${s.name}">${s.svg}</button>`).join('');
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
window.setColor = (color)=>{
  primary.value = color;
  primary.dispatchEvent(new Event('input', { bubbles: true }));
};
function showColors() {
  document.getElementById('colors').innerHTML = colors.map(c=>{
    let name = c.startsWith('oklch(')?nameColor(oklchToHex(...c.slice(6,c.length-1).split(' '))):nameColor(c);
    return `<button onclick="window.setColor('${c.startsWith('oklch(')?oklchToHex(...c.slice(6,c.length-1).split(' ')):c}')" style="--color:${c}" aria-label="${name}" title="${name}"></button>`
  }).join('');
  document.getElementById('rotatecolor').onclick = ()=>{
    let pi = primary.value;
    primary.value = secondary.value;
    secondary.value = pi;
  };
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
let selectedLayer = '';
window.createLayer = (type)=>{
  let id = Math.round(Math.random()*10**9).toString(36);
  window.projectdata.layers.unshift({ id, type, name: 'New layer', hidden: false });
  if (type==='draw') {
    TransformArea.insertAdjacentHTML('beforeend', `<canvas id="${id}" width="${window.projectdata.width}" height="${window.projectdata.height}"></canvas>`);
  } else if (type==='shapes') {
    TransformArea.insertAdjacentHTML('beforeend', `<svg id="${id}" width="${window.projectdata.width}" height="${window.projectdata.height}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${window.projectdata.width} ${window.projectdata.height}"></svg>`);
  }
  document.querySelector('#layers div.list').insertAdjacentHTML('afterbegin', `<div id="l-${id}"${id===selectedLayer?' selected':''}>
  <button onclick="window.selectLayer('${id}')">${layerIcons[type]??''} <input class="new" value="New layer" onkeydown="if(event.key==='Enter')this.blur();" onblur="window.projectdata.layers[window.projectdata.layers.findIndex(l=>l.id==='${id}')].name=this.value;window.showLayers();window.trysave()"></button>
  <button onclick="window.togvisLayer('${id}', this)" class="other">${visibilityIcons.false}</button>
  <button onclick="window.deleteLayer('${id}')" class="other">x</button>
</div>`);
  document.querySelector('#layers div.list input.new').focus();
  document.querySelector('#layers div.list input.new').select();
  window.selectLayer(id);
  trysave();
};
window.selectLayer = (id)=>{
  let type = window.projectdata.layers.find(l=>l.id===id).type;
  document.getElementById('l-'+selectedLayer)?.removeAttribute('selected');
  document.getElementById('l-'+id).setAttribute('selected', true);
  document.getElementById(selectedLayer).style.pointerEvents = '';
  selectedLayer = id;
  TransformArea.querySelectorAll('canvas').forEach(canvas=>canvas.onmousedown=canvas.onmousemove=canvas.onmouseup=canvas.onmouseenter=canvas.onmouseleave=()=>{});
  document.getElementById(id).style.pointerEvents = 'all';
  if (type==='draw') {
    if (!['pencil','eraser'].includes(tool)) window.setTool('pencil');
    document.getElementById('t-pencil').style.display = '';
    document.getElementById('t-eraser').style.display = '';
    document.getElementById('t-select').style.display = 'none';
    document.getElementById('t-shapes').style.display = 'none';
    handleActiveCanvas(document.getElementById(id));
  } else {
    if (!['select','shapes'].includes(tool)) window.setTool('select');
    document.getElementById('t-pencil').style.display = 'none';
    document.getElementById('t-eraser').style.display = 'none';
    document.getElementById('t-select').style.display = '';
    document.getElementById('t-shapes').style.display = '';
    handleActiveSVG(document.getElementById(id));
  }
};
window.togvisLayer = (id,_this)=>{
  let idx = window.projectdata.layers.findIndex(l=>l.id===id);
  let hidden = !window.projectdata.layers[idx].hidden;
  window.projectdata.layers[idx].hidden = hidden;
  _this.innerHTML = visibilityIcons[hidden.toString()];
  _this.parentElement.style.color = hidden?'var(--text-3)':'';
  document.getElementById(id).style.opacity = hidden?'0':1;
  trysave();
};
window.deleteLayer = (id)=>{
  window.projectdata.layers = window.projectdata.layers.filter(l=>l.id!==id);
  document.getElementById(id).remove();
  selectedLayer = window.projectdata.layers[0]?.id??'';
  showLayers();
  trysave();
};
window.renameLayer = (_this, id, name, type)=>{
  _this.innerHTML = `${layerIcons[type]??''} <input class="new" value="${name}" onkeydown="if(event.key==='Enter')this.blur();" onblur="window.projectdata.layers[window.projectdata.layers.findIndex(l=>l.id==='${id}')].name=this.value;window.showLayers();window.trysave()">`;
  document.querySelector('#layers div.list input.new').focus();
  document.querySelector('#layers div.list input.new').select();
};
function showLayers() {
  document.querySelector('#layers div.list').innerHTML = window.projectdata.layers
    .map(layer=>`<div id="l-${layer.id}"${layer.hidden?' style="color:var(--text-3)"':''}${layer.id===selectedLayer?' selected':''}>
  <button onclick="window.selectLayer('${layer.id}')" ondblclick="window.renameLayer(this, '${layer.id}', '${layer.name}', '${layer.type}')">${layerIcons[layer.type]??''} ${layer.name}</button>
  <button onclick="window.togvisLayer('${layer.id}', this)" class="other">${visibilityIcons[layer.hidden.toString()]}</button>
  <button onclick="window.deleteLayer('${layer.id}')" class="other">x</button>
</div>`)
    .join('')||'No layers, create one';
  let instance = tippy(document.querySelector('#layers button.add'), {
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
  let ws = window.projectdata.width/(preview?4:1);
  let h = window.projectdata.height;
  let hs = window.projectdata.height/(preview?4:1);
  let offscreen = new OffscreenCanvas(ws, hs);
  const ctx = offscreen.getContext('2d');
  ctx.clearRect(0, 0, ws, hs);

  if (!transparency) {
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

let mouse = [false, false, false];
function handleActiveCanvas(canvas) {
  let lastpos;
  let ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  canvas.onpointerdown = (evt)=>{
    evt.preventDefault();
    mouse[evt.button] = true;
    lastpos = [evt.clientX, evt.clientY];
    if (mouse[1]) TransformArea.style.cursor = 'move';
  };
  canvas.onpointermove = (evt)=>{
    if (mouse[1]) {
      x += (evt.clientX-lastpos[0])/zoom;
      y += (evt.clientY-lastpos[1])/zoom;
      lastpos = [evt.clientX, evt.clientY];
      transform();
    } else if (mouse[0]) {
      if ((document.getElementById('e-step').value||0)>distance(lastpos, [evt.clientX, evt.clientY])) return;
      let b = canvas.getBoundingClientRect();
      ctx.globalCompositeOperation = tool==='eraser'?'destination-out':'source-over';
      ctx.strokeStyle = primary.value;
      ctx.lineWidth = document.getElementById('e-size').value||10;
      ctx.lineCap = document.getElementById('e-cap').value||'round';
      ctx.beginPath();
      ctx.moveTo(globalXToLocal(lastpos[0],b), globalYToLocal(lastpos[1],b));
      ctx.lineTo(globalXToLocal(evt.clientX,b), globalYToLocal(evt.clientY,b));
      ctx.stroke();
      lastpos = [evt.clientX, evt.clientY];
      trysave();
    }
  };
  canvas.onpointerup = (evt)=>{
    mouse[evt.button] = false;
    if (!mouse[1]) TransformArea.style.cursor = '';
  };
  canvas.onpointerenter = (evt)=>{
    mouse = [(evt.buttons>>0&1)===1, (evt.buttons>>1&1)===1, (evt.buttons>>2&1)===1];
    lastpos = [evt.clientX, evt.clientY];
    if (mouse[1]) TransformArea.style.cursor = 'move';
  };
  canvas.onpointerleave = (evt)=>{
    if (mouse[0]) {
      let b = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo(globalXToLocal(lastpos[0],b), globalYToLocal(lastpos[1],b));
      ctx.lineTo(globalXToLocal(evt.clientX,b), globalYToLocal(evt.clientY,b));
      ctx.stroke();
      trysave();
    }
    mouse = [false, false, false];
    TransformArea.style.cursor = '';
  };
}
window.svgactive = null;
window.svgprevc = null;
window.svgclick = (_this)=>{
  if (tool!=='select') return;
  window.svgactive = _this;
  _this.classList.add('select');
  let prevc = primary.value;
  window.svgprevc = prevc;
  primary.value = _this.getAttribute((_this.tagName.toLowerCase()==='line')?'stroke':'fill');
  primary.oninput = ()=>{
    _this.setAttribute((_this.tagName.toLowerCase()==='line')?'stroke':'fill', primary.value);
    trysave();
  };
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
  setTimeout(()=>{
    FullArea.onclick = (evt)=>{
      if (evt.target===_this) return;
      _this.classList.remove('select');
      if (_this.parentElement!==evt.target&&_this.parentElement.contains(evt.target)) {
        window.svgprevc = prevc;
        return;
      }
      primary.value = window.svgprevc;
      primary.oninput = ()=>{};
      FullArea.onclick = ()=>{};
      ExtraTool.innerHTML = '';
    };
  }, 0);
};
function handleActiveSVG(svg) {
  let drag = false;
  let firstpos = [0,0];
  TransformArea.onpointerdown = (evt)=>{
    if (tool==='shapes') {
      drag = true;
      firstpos = [evt.clientX,evt.clientY];
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
        content = `<rect onclick="window.svgclick(this)" fill="${primary.value}" width="${w}" height="${h}" x="${globalXToLocal(firstpos[0],b)}" y="${globalYToLocal(firstpos[1],b)}" rx="0" stroke="none"></rect>`;
        break;
      case 'circle':
        content = `<ellipse onclick="window.svgclick(this)" fill="${primary.value}" cx="${globalXToLocal(firstpos[0],b)+Math.floor(w/2)}" rx="${Math.floor(w/2)}" cy="${globalYToLocal(firstpos[1],b)+Math.floor(h/2)}" ry="${Math.floor(h/2)}" stroke="none"></ellipse>`;
        break;
      case 'line':
        content = `<line onclick="window.svgclick(this)" stroke="${primary.value}" stroke-width="10" stroke-linecap="round" x1="${globalXToLocal(firstpos[0],b)}" y1="${globalYToLocal(firstpos[1],b)}" x2="${globalXToLocal(secpos[0],b)}" y2="${globalYToLocal(secpos[1],b)}" fill="none"></line>`;
        break;
    }
    svg.insertAdjacentHTML('beforeend', content);
    trysave();
  };
}

// Drawing images
function putImage(file, oevt) {
  const reader = new FileReader();
  reader.onload = function(evt) {
    let layer = window.projectdata.layers.find(l=>l.id===selectedLayer);
    let b = document.getElementById(layer.id).getBoundingClientRect();
    let img = new Image();
    img.onload = ()=>{
      if (layer.type==='shapes') {
        document.getElementById(layer.id).insertAdjacentHTML('afterbegin', `<image href="${evt.target.result}" width="${Math.round(img.width/window.projectdata.width*b.width)}" height="${Math.round(img.height/window.projectdata.height*b.height)}" x="${globalXToLocal(oevt.clientX,b)}" y="${globalYToLocal(oevt.clientY,b)}"></image>`)
      }
    };
    img.src = evt.target.result;
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
  FullArea.onmousedown = ()=>{
    if (['input','select'].includes(document.activeElement.tagName.toLowerCase())) {
      document.activeElement.blur();
    }
  };
  // On scroll zoom
  FullArea.onwheel = (evt)=>{
    if (evt.ctrlKey) evt.preventDefault();
    zoom += evt.deltaY/-(evt.shiftKey?500:(evt.altKey?2000:1000));
    zoom = Math.max(parseFloat(zoom.toFixed(5)), 0.1);
    transform();
  };
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
  document.getElementById('hello').close();
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
  ${pr.thumbnail?`<img src="${pr.thumbnail}"><span style="flex:1"></span>`:''}
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
dbRequest.onsuccess = function(e) {
  let db = e.target.result;
  window.db = db;

  // General setup
  setActions();
  showColors();

  // Hello modal
  document.getElementById('hello').showModal();
  document.querySelector('#hello button.new').onclick = ()=>{
    document.getElementById('newp').showModal();
    document.querySelector('#newp input.name').focus();
    document.querySelector('#newp input.name').select();
  };
  document.querySelector('#newp button.create').onclick = ()=>{
    let tx = db.transaction(['projects','projectdata'], 'readwrite');
    let pstore = tx.objectStore('projects');
    let dstore = tx.objectStore('projectdata');
    let name = document.querySelector('#newp input.name').value;
    let width = Math.max(Number(document.querySelector('#newp input.x').value)||1, 1);
    let height = Math.max(Number(document.querySelector('#newp input.y').value)||1, 1);
    let pidreq = pstore.add({
      name,
      width,
      height,
      thumbnail: ''
    });
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
