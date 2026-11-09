window.decoders = {};

function uint8ToDataUri(bytes, type) {
  let binary = '';
  let chunk = 0x8000; // Chunked to bypass max argument count
  for (let i=0; i<bytes.length; i+=chunk) binary += String.fromCharCode(...bytes.subarray(i, i+chunk));
  return `data:${type};base64,${btoa(binary)}`;
}
async function rgbaToDataUri(bytes, width, height, layerWidth, layerHeight, sides) {
  let canvas = new OffscreenCanvas(width, height);
  let ctx = canvas.getContext('2d');
  ctx.putImageData(new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, layerWidth*layerHeight*4), layerWidth, layerHeight),
    0, 0, -sides[0], -sides[2], width, height);
  let buffer = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
  return uint8ToDataUri(new Uint8Array(buffer), 'image/png');
}
function lzfDecompress(input, outputLength) {
  let ip = 0;
  let op = 0;
  let output = new Uint8Array(outputLength);
  while(ip<input.length) {
    let ctrl = input[ip++];
    if (ctrl<32) {
      let len = ctrl+1;
      if (ip+len>input.length) throw new Error('Run exceeds input');
      if (op+len>output.length) throw new Error('Run exceeds output');

      output.set(input.subarray(ip, ip+len), op);
      ip += len;
      op += len;
    } else {
      let len = ctrl>>5;
      let ref = op-((ctrl&0x1f)<<8)-1;

      if (len===7) {
        if (ip>=input.length) throw new Error('Missing length');
        len += input[ip++];
      }
      if (ip>=input.length) throw new Error('Missing reference');

      ref -= input[ip++];
      len += 2;

      if (ref<0) throw new Error('Invalid reference');
      if (op+len>output.length) throw new Error('Back reference exceeds output');

      for (let i=0; i<len; i++) output[op++] = output[ref++];
    }
  }
  return output;
}
function interleave(data, channels) {
  const result = new Uint8Array(data.length);
  let len = data.length/channels;
  for (let i=0; i<len; i++) {
    for (let c=0; c<channels; c++) result[i*channels+c] = data[c*len+i];
  }
  return result;
}

// Unknown zip like
window.decoders.zip = async(file)=>{
  let zip = UZIP.parse(await file.arrayBuffer());
  let decoder = new TextDecoder();
  let type = decoder.decode(zip.mimetype);
  if (type==='application/x-krita') return window.decoders.kra(file);
  return false;
};

// Krita
window.decoders.kra = async(file)=>{
  let zip = UZIP.parse(await file.arrayBuffer());
  let decoder = new TextDecoder();
  if (decoder.decode(zip.mimetype)!=='application/x-krita') return false;
  let parser = new DOMParser();
  let doc = parser.parseFromString(decoder.decode(zip['maindoc.xml']), 'application/xml');
  let imgdata = doc.querySelector('IMAGE');
  let width = Number(imgdata.getAttribute('width'));
  let height = Number(imgdata.getAttribute('height'));

  // Layers
  let layers = Array.from(doc.querySelectorAll('layers layer'))
  for (let lidx=0; lidx<layers.length; lidx++) {
    let bytes = zip['OC/layers/'+layers[lidx].getAttribute('filename')];
    let data = [[]];
    let size = 0;
    for (let i=0; i<bytes.length; i++) {
      if (bytes[i]==='\n'.codePointAt(0)||(data.length>5&&data.length%2===1&&data[data.length-1].length>=size)) {
        if (data.length<6||data.length%2===0||data[data.length-1].length>=size) {
          if (data.length>5&&data.length%2!==1) size = Number(decoder.decode(new Uint8Array(data[data.length-1])).split(',')[3]);
          data.push([]);
          continue;
        }
      }
      data[data.length-1].push(bytes[i]);
    }
    let getVal = ()=>String.fromCodePoint(...data.shift());
    let getNumVal = ()=>Number(getVal().split(' ')[1]);
    if (getNumVal()!==2) throw new Error('Unsupported version');
    let tileW = getNumVal();
    let tileH = getNumVal();
    let channels = getNumVal();
    if (channels!==4) throw new Error('Unhandled channel count '+channels);
    let number = getNumVal();

    let chunks = [];
    let chunkNum = data.length;
    let sides = [Infinity, -Infinity, Infinity, -Infinity];
    for (let idx=0; idx+1<chunkNum; idx+=2) {
      let obj = {
        info: getVal().split(','),
        segment: data.shift()
      };
      obj.info[0] = Number(obj.info[0]);
      if (obj.info[0]<sides[0]) sides[0] = obj.info[0];
      if (obj.info[0]>sides[1]) sides[1] = obj.info[0];
      obj.info[1] = Number(obj.info[1]);
      if (obj.info[1]<sides[2]) sides[2] = obj.info[1];
      if (obj.info[1]>sides[3]) sides[3] = obj.info[1];
      obj.segment.shift(); // Remove compressed flag

      // Handle compression
      if (obj.info[2]==='LZF') obj.segment = lzfDecompress(new Uint8Array(obj.segment), tileW*tileH*channels);
      // Untangle channels
      obj.segment = interleave(obj.segment, channels);

      chunks.push(obj);
    }
    sides = sides.map(p=>!Number.isFinite(p)?0:p);

    let layerWidth = sides[1]-sides[0]+tileW;
    let layerHeight = sides[3]-sides[2]+tileH;
    let image = new Uint8Array(layerWidth*layerHeight*channels);
    chunks.forEach(chunk=>{
      let tileX = chunk.info[0] - sides[0];
      let tileY = chunk.info[1] - sides[2];
      for (let i=0; i<Math.min(chunk.segment.length/channels, tileW*tileH); i++) {
        let x = tileX + (i%tileW);
        let y = tileY + Math.floor(i/tileW);
        if (x<0||x>=layerWidth||y<0||y>=layerHeight) continue;
        image.set(chunk.segment.slice(i*channels, i*channels+4), (x+y*layerWidth)*channels);
      }
    });
    // Number(layers[lidx].getAttribute('x')) Number(layers[lidx].getAttribute('y'))
    image = await rgbaToDataUri(image, width, height, layerWidth, layerHeight, sides);
    layers[lidx] = {
      id: layers[lidx].getAttribute('uuid'),
      type: 'draw',
      name: layers[lidx].getAttribute('name'),
      hidden: layers[lidx].getAttribute('visible')==='0',
      blendmode: layers[lidx].getAttribute('compositeop'),
      ...(layers[lidx].getAttribute('opacity')?{
        effects: [
          { type: 'opacity', value: Number(layers[lidx].getAttribute('opacity'))/255*100 }
        ]
      }:{}),
      data: image
    }
  }

  // Save to db
  let tx = db.transaction(['projects','projectdata'], 'readwrite');
  let pstore = tx.objectStore('projects');
  let dstore = tx.objectStore('projectdata');
  let pidreq = pstore.add({
    name: imgdata.getAttribute('name'),
    width,
    height,
    thumbnail: uint8ToDataUri(zip['preview.png'], 'image/png')
  });
  let pid;
  pidreq.onsuccess = (e) => {
    pid = e.target.result;
    dstore.add({
      id: pid,
      name: imgdata.getAttribute('name'),
      width,
      height,
      lastsave: Date.now(),
      layers
    });
  };
  tx.oncomplete = ()=>{window.loadProject(pid)};
};