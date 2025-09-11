// Utility
function sanitizeHTML(text) {
  return text
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;');
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
let savetimeout = 1000; // 1 second
function trysave() {
  let now = Date.now();
  if (now<lastsave+savetimeout) return;
  lastsave = now;
  window.projectdata.lastsave = now;
  window.projectdata.layers = window.projectdata.layers.map(l=>{
    if (l.type==='draw') {
      l.data = document.getElementById(l.id).toDataURL();
    }
    return l;
  });
  let tx = db.transaction(['projectdata'], 'readwrite');
  let dstore = tx.objectStore('projectdata');
  dstore.put(window.projectdata);
}

// Colors
let colors = ['oklch(0.7404 0.1257 20.83)','oklch(0.7404 0.1257 67.83)','oklch(0.7404 0.1257 94.54)','oklch(0.7404 0.1257 140.47)','oklch(0.7404 0.1257 245.16)','oklch(0.7404 0.1257 308.19)','#ffffff',
'oklch(0.6187 0.2311 20.83)','oklch(0.7552 0.1466 67.83)','oklch(0.8116 0.1543 94.54)','oklch(0.8027 0.2256 140.47)','oklch(0.6869 0.1663 245.16)','oklch(0.647 0.2487 308.19)','#888888',
'oklch(0.3813 0.1311 20.83)','oklch(0.5178 0.0966 67.83)','oklch(0.5504 0.1043 94.54)','oklch(0.4377 0.1256 140.47)','oklch(0.4618 0.1163 245.16)','oklch(0.3724 0.1487 308.19)','#000000'];
let primary = document.getElementById('primary');
let secondary = document.getElementById('secondary');
function showColors() {
  document.getElementById('colors').innerHTML = colors.map(c=>{
    let name = c.startsWith('oklch(')?nameColor(oklchToHex(...c.slice(6,c.length-1).split(' '))):nameColor(c);
    return `<button onclick="document.getElementById('primary').value='${c.startsWith('oklch(')?oklchToHex(...c.slice(6,c.length-1).split(' ')):c}'" style="--color:${c}" aria-label="${name}" title="${name}"></button>`
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
const TransformArea = document.getElementById('transforms');
let selectedLayer = '';
window.createLayer = (type)=>{
  window.projectdata.layers.unshift({ id: Math.round(Math.random()*10**9).toString(36), type, name: 'New layer' });
  let layer = document.createElement(type==='draw'?'canvas':'svg');
  layer.id = window.projectdata.layers[0].id;
  if (type==='draw') {
    layer.width = window.projectdata.width;
    layer.height = window.projectdata.height;
  }
  TransformArea.insertAdjacentElement('beforeend', layer);
  selectedLayer = layer.id;
  showLayers();
  window.selectLayer(layer.id);
};
window.selectLayer = (id)=>{
  document.getElementById('l-'+selectedLayer)?.removeAttribute('selected');
  document.getElementById('l-'+id).setAttribute('selected', true);
  document.getElementById(selectedLayer).style.pointerEvents = '';
  selectedLayer = id;
  TransformArea.querySelectorAll('canvas').forEach(canvas=>canvas.onmousedown=canvas.onmousemove=canvas.onmouseup=canvas.onmouseenter=canvas.onmouseleave=()=>{});
  document.getElementById(id).style.pointerEvents = 'all';
  handleActiveCanvas(document.getElementById(id));
};
function showLayers() {
  document.querySelector('#layers div.list').innerHTML = window.projectdata.layers
    .map(layer=>`<div id="l-${layer.id}"${layer.id===selectedLayer?' selected':''}>
  <button onclick="window.selectLayer('${layer.id}')">${layerIcons[layer.type]??''} ${layer.name}</button>
  <button>x</button>
</div>`)
    .join('')||'No layers, create one';
  tippy(document.querySelector('#layers button.add'), {
    allowHTML: true,
    content: `<button onclick="window.createLayer('draw')">Free draw</button>
<button onclick="window.createLayer('shapes')">Shapes</button>`,
    interactive: true,
    trigger: 'click',
    placement: 'bottom-end',
    sticky: true
  });
}

// Drawing
let mouse = [false, false, false];
function handleActiveCanvas(canvas) {
  let lastpos;
  let ctx = canvas.getContext('2d');
  canvas.onmousedown = (evt)=>{
    evt.preventDefault();
    mouse[evt.button] = true;
    lastpos = [evt.clientX, evt.clientY];
    if (mouse[1]) TransformArea.style.cursor = 'move';
  };
  canvas.onmousemove = (evt)=>{
    if (mouse[1]) {
      x += (evt.clientX-lastpos[0])/zoom;
      y += (evt.clientY-lastpos[1])/zoom;
      lastpos = [evt.clientX, evt.clientY];
      transform();
    } else if (mouse[0]) {
      let b = canvas.getBoundingClientRect();
      ctx.strokeStyle = primary.value;
      ctx.lineWidth = document.getElementById('e-size').value||10;
      ctx.lineCap = document.getElementById('e-cap').value||'round';
      ctx.beginPath();
      ctx.moveTo((lastpos[0]-b.left)/b.width*window.projectdata.width, (lastpos[1]-b.top)/b.height*window.projectdata.height);
      ctx.lineTo((evt.clientX-b.left)/b.width*window.projectdata.width, (evt.clientY-b.top)/b.height*window.projectdata.height);
      ctx.stroke();
      lastpos = [evt.clientX, evt.clientY];
      trysave();
    }
  };
  canvas.onmouseup = (evt)=>{
    mouse[evt.button] = false;
    if (!mouse[1]) TransformArea.style.cursor = '';
  };
  canvas.onmouseenter = (evt)=>{
    mouse = [(evt.buttons>>0&1)===1, (evt.buttons>>1&1)===1, (evt.buttons>>2&1)===1];
    lastpos = [evt.clientX, evt.clientY];
    if (mouse[1]) TransformArea.style.cursor = 'move';
  };
  canvas.onmouseleave = (evt)=>{
    if (mouse[0]) {
      let b = canvas.getBoundingClientRect();
      ctx.beginPath();
      ctx.moveTo((lastpos[0]-b.left)/b.width*window.projectdata.width, (lastpos[1]-b.top)/b.height*window.projectdata.height);
      ctx.lineTo((evt.clientX-b.left)/b.width*window.projectdata.width, (evt.clientY-b.top)/b.height*window.projectdata.height);
      ctx.stroke();
      trysave();
    }
    mouse = [false, false, false];
    TransformArea.style.cursor = '';
  };
}

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

  // On scroll zoom
  document.getElementById('area').onwheel = (evt)=>{
    if (evt.ctrlKey) evt.preventDefault();
    zoom += evt.deltaY/-(evt.shiftKey?500:(evt.altKey?2000:1000));
    zoom = Math.max(parseFloat(zoom.toFixed(5)), 0.1);
    transform();
  };
  // On arrow keys move
  document.onkeydown = (evt)=>{
    let amount = (evt.shiftKey?50:(evt.altKey?5:10));
    switch(evt.key) {
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
      let layer = document.createElement(l.type==='draw'?'canvas':'svg');
      layer.id = l.id;
      if (l.type==='draw') {
        layer.width = window.projectdata.width;
        layer.height = window.projectdata.height;
        if (l.data) {
          let img = new Image();
          img.src = l.data;
          img.onload = ()=>{
            layer.getContext('2d').drawImage(img, 0, 0);
          };
        }
      }
      TransformArea.insertAdjacentElement('beforeend', layer);
    });
    if (window.projectdata.layers[0]) {
      selectedLayer = window.projectdata.layers[0].id;
      showLayers();
      window.selectLayer(window.projectdata.layers[0].id);
    }
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
  <img src="${pr.thumbnail}">
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
  showColors();

  // Hello modal
  document.getElementById('hello').showModal();
  document.querySelector('#hello button.new').onclick = ()=>{
    document.getElementById('newp').showModal();
  };
  document.querySelector('#newp button.create').onclick = ()=>{
    let tx = db.transaction(['projects','projectdata'], 'readwrite');
    let pstore = tx.objectStore('projects');
    let dstore = tx.objectStore('projectdata');
    let width = Number(document.querySelector('#newp input.x').value)||0;
    let height = Number(document.querySelector('#newp input.y').value)||0;
    let pidreq = pstore.add({
      name: document.querySelector('#newp input.name').value,
      width,
      height,
      thumbnail: ''
    });
    pidreq.onsuccess = (e) => {
      let pid = e.target.result;
      dstore.add({
        id: pid,
        width,
        height,
        lastsave: Date.now(),
        layers: []
      });
    };
    tx.oncomplete = ()=>{
      document.getElementById('newp').close();
      showProjects();
    };
  };
  showProjects();
};