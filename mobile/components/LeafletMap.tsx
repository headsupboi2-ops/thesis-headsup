import { useEffect, useRef } from 'react'
import { WebView } from 'react-native-webview'
import { PAR_BOUNDARY } from '../lib/par'
import { CAT_COLOR } from '../lib/theme'
import type { LiveStorm, ForecastStep, ModelTrack } from '../lib/types'
import type { WeatherGrid, MarineGrid } from '../lib/weather'
import type { WeatherLayer, BasemapId } from '../lib/weatherLayers'

interface Props {
  storms: LiveStorm[]
  forecasts: Record<string, ForecastStep[]>
  spaghetti?: { storm: string; models: ModelTrack[] } | null
  weatherGrid?: WeatherGrid | null
  marineGrid?: MarineGrid | null
  layer?: WeatherLayer | null       // active weather overlay, or null for none
  forecastHour: number              // 0..168
  basemap: BasemapId
  focusStorm?: string               // storm name to fly the map to
  focusKey?: string                 // nonce so re-tapping the same storm re-focuses
  parKey?: string                   // nonce: bump to fit the map to the PAR region
}

/**
 * Dark Leaflet map in a WebView. Built once as a static shell exposing a
 * `window.HeadsUp` message API; React pushes data via injectJavaScript so the
 * map never reloads (smooth layer switching + timeline scrubbing). Draws the
 * PAR polygon, storm tracks (position interpolated to the selected hour), the
 * 10-model spaghetti, and a smooth Windy-style weather overlay.
 */
export function LeafletMap({
  storms, forecasts, spaghetti, weatherGrid, marineGrid, layer, forecastHour, basemap,
  focusStorm, focusKey, parKey,
}: Props) {
  const ref = useRef<WebView>(null)
  const ready = useRef(false)

  const inject = (js: string) => ref.current?.injectJavaScript(js + '\ntrue;')

  const stormsPayload = () => JSON.stringify(storms.map(s => ({
    name: s.name, lat: s.lat, lon: s.lon, cat: s.category, wind: Math.round(s.wind_speed),
    path: (s.path ?? []).map(p => [p.lat, p.lon]),
    forecast: (forecasts[s.name] ?? []).map(f => ({ lat: f.lat, lon: f.lon, hour: f.hour, wind: f.wind_speed ?? s.wind_speed })),
  }))).replace(/</g, '\\u003c')

  const spaghettiPayload = () => JSON.stringify(spaghetti
    ? { storm: spaghetti.storm, models: spaghetti.models.map(m => ({ color: m.color, source: m.source, pts: m.points.map(p => [p.lat, p.lon]) })) }
    : null).replace(/</g, '\\u003c')

  const weatherPayload = () => JSON.stringify({ weather: weatherGrid ?? null, marine: marineGrid ?? null }).replace(/</g, '\\u003c')
  const layerPayload = () => JSON.stringify(layer ?? null).replace(/</g, '\\u003c')

  const syncAll = () => {
    inject(`HU.setBasemap(${JSON.stringify(basemap)})`)
    inject(`HU.setWeather(${weatherPayload()})`)
    inject(`HU.setLayer(${layerPayload()})`)
    inject(`HU.setHour(${forecastHour})`)
    inject(`HU.setStorms(${stormsPayload()})`)
    inject(`HU.setSpaghetti(${spaghettiPayload()})`)
    // Focus the tapped storm if one was requested; otherwise fit all storms.
    if (focusStorm) inject(`HU.focus(${JSON.stringify(focusStorm)})`)
    else inject(`HU.fit()`)
  }

  // Incremental updates once the map is ready.
  useEffect(() => { if (ready.current) inject(`HU.setBasemap(${JSON.stringify(basemap)})`) }, [basemap])
  useEffect(() => { if (ready.current) inject(`HU.setWeather(${weatherPayload()})`) }, [weatherGrid, marineGrid])
  useEffect(() => { if (ready.current) inject(`HU.setLayer(${layerPayload()})`) }, [layer])
  useEffect(() => { if (ready.current) inject(`HU.setHour(${forecastHour})`) }, [forecastHour])
  useEffect(() => { if (ready.current) { inject(`HU.setStorms(${stormsPayload()})`); if (!focusStorm) inject(`HU.fit()`) } }, [storms, forecasts])
  useEffect(() => { if (ready.current) inject(`HU.setSpaghetti(${spaghettiPayload()})`) }, [spaghetti])
  // Fly to a storm when tapped from the Storms tab (focusKey nonce re-triggers).
  useEffect(() => { if (ready.current && focusStorm) inject(`HU.focus(${JSON.stringify(focusStorm)})`) }, [focusStorm, focusKey])
  // Fit the map to the PAR region when the PAR button is tapped.
  useEffect(() => { if (ready.current && parKey) inject(`HU.fitPar()`) }, [parKey])

  return (
    <WebView
      ref={ref}
      originWhitelist={['*']}
      source={{ html: MAP_HTML }}
      style={{ flex: 1, backgroundColor: '#0a1a3a' }}
      javaScriptEnabled
      domStorageEnabled
      startInLoadingState
      androidLayerType="hardware"
      onLoadEnd={() => { ready.current = true; syncAll() }}
    />
  )
}

// Static HTML shell. All data arrives later via window.HU.* (injectJavaScript).
const PAR_JSON = JSON.stringify(PAR_BOUNDARY)
const CAT_JSON = JSON.stringify(CAT_COLOR)

const MAP_HTML = `<!DOCTYPE html><html><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
  integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous"/>
<style>
  html,body,#map{height:100%;margin:0;background:#0a1a3a}
  .leaflet-container{background:#0a1a3a}
  #wxfield,#wxarrows{position:absolute;top:0;left:0;pointer-events:none;z-index:400}
  #wxfield{z-index:390}
  .storm-num{display:flex;align-items:center;justify-content:center;border-radius:50%;
    border:3px solid #fff;color:#fff;font:700 13px system-ui;box-shadow:0 2px 10px rgba(0,0,0,.55)}
  .lbl{color:#fff;font:700 11px system-ui;white-space:nowrap;text-shadow:0 1px 4px #000,0 0 6px #000}
  .cityval{text-align:center;pointer-events:none}
  .cityval .cn{color:#fff;font:600 10px system-ui;text-shadow:0 1px 3px #000,0 0 5px #000;line-height:1.15;white-space:nowrap}
  .cityval .cv{color:#fff;font:800 12.5px system-ui;text-shadow:0 1px 3px #000,0 0 5px #000;line-height:1.15;white-space:nowrap}
  .leaflet-popup-content-wrapper{background:#12275a;color:#fff;border-radius:10px}
  .leaflet-popup-tip{background:#12275a}
</style>
</head><body><div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
  integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
<script>
(function(){
  var PAR = ${PAR_JSON};
  var CATC = ${CAT_JSON};
  var CITIES = [
    {n:'Laoag',lat:18.20,lon:120.59},{n:'Tuguegarao',lat:17.61,lon:121.73},{n:'Baguio',lat:16.41,lon:120.60},
    {n:'Tarlac City',lat:15.49,lon:120.59},{n:'Manila',lat:14.60,lon:120.98},{n:'Naga',lat:13.62,lon:123.18},
    {n:'Legazpi',lat:13.14,lon:123.74},{n:'Puerto Princesa',lat:9.74,lon:118.74},{n:'Roxas City',lat:11.59,lon:122.75},
    {n:'Iloilo',lat:10.72,lon:122.56},{n:'Bacolod',lat:10.67,lon:122.95},{n:'Cebu City',lat:10.32,lon:123.90},
    {n:'Tacloban',lat:11.24,lon:125.00},{n:'Cagayan de Oro',lat:8.48,lon:124.65},{n:'Zamboanga',lat:6.91,lon:122.08},
    {n:'Davao',lat:7.07,lon:125.61},{n:'General Santos',lat:6.11,lon:125.17}
  ];

  var map = L.map('map',{zoomControl:true,attributionControl:false}).setView([15,128],5);
  var tiles = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:19}),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:17})
  };
  var curBase = 'dark';
  tiles.dark.addTo(map);
  L.polyline(PAR,{color:'#4d9bff',weight:1.5,dashArray:'6 4',opacity:.65}).addTo(map);

  var stormTracks = L.layerGroup().addTo(map);
  var stormMarks = L.layerGroup().addTo(map);
  var spag = L.layerGroup().addTo(map);
  var cityLayer = L.layerGroup().addTo(map);

  // Weather overlay canvases (field = blurred/blended, arrows = crisp)
  var mapEl = document.getElementById('map');
  var fieldC = document.createElement('canvas'); fieldC.id='wxfield'; mapEl.appendChild(fieldC);
  var arrowC = document.createElement('canvas'); arrowC.id='wxarrows'; mapEl.appendChild(arrowC);

  var STATE = { storms: [], hour: 0, weather: null, marine: null, layer: null };

  function catColor(c){ return CATC[c] || '#87ceeb'; }
  function colorRamp(stops, t){
    var lo=stops[0][0], hi=stops[stops.length-1][0];
    var c=Math.max(lo,Math.min(hi,t));
    for(var i=0;i<stops.length-1;i++){
      var t0=stops[i][0],c0=stops[i][1],t1=stops[i+1][0],c1=stops[i+1][1];
      if(c>=t0&&c<=t1){ var f=(c-t0)/(t1-t0);
        return [Math.round(c0[0]+f*(c1[0]-c0[0])),Math.round(c0[1]+f*(c1[1]-c0[1])),Math.round(c0[2]+f*(c1[2]-c0[2]))]; }
    }
    return stops[stops.length-1][1];
  }

  // Storm position interpolated to a forecast hour
  function interp(s, hour){
    var fc = s.forecast || [];
    if(hour<=0 || !fc.length) return {lat:s.lat, lon:s.lon, cat:s.cat, wind:s.wind};
    var steps = fc.slice().sort(function(a,b){return a.hour-b.hour;});
    if(hour<=steps[0].hour){ var t=hour/steps[0].hour;
      return {lat:s.lat+(steps[0].lat-s.lat)*t, lon:s.lon+(steps[0].lon-s.lon)*t, cat:s.cat, wind:s.wind}; }
    var last=steps[steps.length-1];
    if(hour>=last.hour) return {lat:last.lat, lon:last.lon, cat:s.cat, wind:Math.round(last.wind||s.wind)};
    for(var i=0;i<steps.length-1;i++){
      if(hour>=steps[i].hour && hour<steps[i+1].hour){
        var f=(hour-steps[i].hour)/(steps[i+1].hour-steps[i].hour);
        return {lat:steps[i].lat+(steps[i+1].lat-steps[i].lat)*f, lon:steps[i].lon+(steps[i+1].lon-steps[i].lon)*f,
                cat:s.cat, wind:Math.round((steps[i].wind||s.wind)+(( steps[i+1].wind||s.wind)-(steps[i].wind||s.wind))*f)}; }
    }
    return {lat:s.lat, lon:s.lon, cat:s.cat, wind:s.wind};
  }

  function renderTracks(){
    stormTracks.clearLayers();
    STATE.storms.forEach(function(s){
      if(s.path && s.path.length>1) L.polyline(s.path,{color:'#8aa',weight:2,opacity:.5}).addTo(stormTracks);
      if(s.forecast && s.forecast.length>1){
        var fc=[[s.lat,s.lon]].concat(s.forecast.map(function(f){return [f.lat,f.lon];}));
        L.polyline(fc,{color:catColor(s.cat),weight:2.5,dashArray:'8 5',opacity:.85}).addTo(stormTracks);
        s.forecast.filter(function(f){return f.hour>0&&f.hour%24===0;}).forEach(function(f){
          var day=Math.round(f.hour/24);
          L.marker([f.lat,f.lon],{icon:L.divIcon({className:'',html:'<div class="storm-num" style="width:18px;height:18px;font-size:10px;background:'+catColor(s.cat)+'">'+day+'</div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(stormTracks);
        });
      }
    });
  }

  function renderMarks(){
    stormMarks.clearLayers();
    STATE.storms.forEach(function(s){
      var p=interp(s, STATE.hour);
      var glow = STATE.hour>0 ? 'box-shadow:0 0 0 5px rgba(255,255,255,.22),0 2px 12px rgba(0,0,0,.6);' : 'box-shadow:0 2px 10px rgba(0,0,0,.55);';
      L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<div class="storm-num" style="width:34px;height:34px;background:'+catColor(p.cat)+';'+glow+'">'+p.cat+'</div>',iconSize:[34,34],iconAnchor:[17,17]})})
        .addTo(stormMarks).bindPopup('<b>'+s.name+'</b><br/>Cat '+p.cat+' · '+p.wind+' kt'+(STATE.hour>0?'<br/>+'+STATE.hour+'h':''));
      L.marker([p.lat,p.lon],{icon:L.divIcon({className:'',html:'<div class="lbl">'+s.name+(STATE.hour>0?' <span style="opacity:.75;font-size:9px">+'+STATE.hour+'h</span>':'')+'</div>',iconSize:[130,20],iconAnchor:[-20,10]}),interactive:false}).addTo(stormMarks);
    });
  }

  // ── Build a regular 2D value grid for the active layer at this hour ──
  // (points are ordered idx = yi*nx + xi). For wind we also build the u/v
  // vector components so particles can be advected by a smooth flow field.
  function buildGrid(){
    var L2=STATE.layer; if(!L2) return null;
    var h=STATE.hour, src;
    if(L2.source==='wave'){ if(!STATE.marine) return null; src=STATE.marine; }
    else { if(!STATE.weather) return null; src=STATE.weather; }
    var nx=src.nx, ny=src.ny, pts=src.points;
    if(!nx||!ny||!pts||!pts.length) return null;
    var latMin=90,latMax=-90,lonMin=200,lonMax=-200;
    for(var i=0;i<pts.length;i++){ var q=pts[i];
      if(q.lat<latMin)latMin=q.lat; if(q.lat>latMax)latMax=q.lat;
      if(q.lon<lonMin)lonMin=q.lon; if(q.lon>lonMax)lonMax=q.lon; }
    var val=[], U=null, V=null;
    if(L2.arrows){ U=[]; V=[]; }
    for(var yi=0;yi<ny;yi++){ val[yi]=[]; if(U){U[yi]=[];V[yi]=[];}
      for(var xi=0;xi<nx;xi++){ var p=pts[yi*nx+xi], v=null;
        if(p){
          if(L2.source==='wave'){ v=(p.wave_height||[])[h]; }
          else if(L2.source==='thunder'){ var cc=(p.cloud||[])[h], rr=(p.precip||[])[h];
            if(cc!=null&&rr!=null) v=Math.max(0,Math.min(100,cc*0.35+rr*10)); }
          else { var arr=p[L2.source]; if(arr) v=arr[h]; }
        }
        val[yi][xi]=(v==null||isNaN(v))?null:v;
        if(U){ var sp=(p&&p.wind_speed)?p.wind_speed[h]:null, d=(p&&p.wind_dir)?p.wind_dir[h]:null;
          if(sp!=null&&d!=null){ var dr=d*Math.PI/180; U[yi][xi]=-sp*Math.sin(dr); V[yi][xi]=-sp*Math.cos(dr); }
          else { U[yi][xi]=null; V[yi][xi]=null; } }
      }
    }
    return {val:val,U:U,V:V,nx:nx,ny:ny,latMin:latMin,latMax:latMax,lonMin:lonMin,lonMax:lonMax};
  }

  // Bilinear sample of a grid array at a lat/lon (null outside coverage).
  function sample(G, arr, lat, lon){
    var gx=(lon-G.lonMin)/(G.lonMax-G.lonMin)*(G.nx-1);
    var gy=(lat-G.latMin)/(G.latMax-G.latMin)*(G.ny-1);
    if(gx<0||gx>G.nx-1||gy<0||gy>G.ny-1) return null;
    var x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(x0+1,G.nx-1),y1=Math.min(y0+1,G.ny-1),fx=gx-x0,fy=gy-y0;
    var a=arr[y0][x0],b=arr[y0][x1],c=arr[y1][x0],d=arr[y1][x1];
    if(a==null||b==null||c==null||d==null){
      var best=null,bd=99,cd=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]];
      for(var k=0;k<4;k++){ var vv=arr[cd[k][1]][cd[k][0]];
        if(vv!=null){ var dd=Math.abs(cd[k][0]-gx)+Math.abs(cd[k][1]-gy); if(dd<bd){bd=dd;best=vv;} } }
      return best;
    }
    return a*(1-fx)*(1-fy)+b*fx*(1-fy)+c*(1-fx)*fy+d*fx*fy;
  }

  var GRID=null;

  var rafPending=false;
  function scheduleOverlay(){ if(rafPending) return; rafPending=true; requestAnimationFrame(function(){ rafPending=false; renderField(); }); }

  // Smooth continuous colour field: bilinear-sample onto a low-res offscreen
  // canvas, then upscale with smoothing (Windy-style, no more blobs).
  function renderField(){
    var size=map.getSize();
    if(fieldC.width!==size.x||fieldC.height!==size.y){ fieldC.width=size.x; fieldC.height=size.y; }
    var fx=fieldC.getContext('2d'); fx.clearRect(0,0,size.x,size.y);
    var L2=STATE.layer; fieldC.style.display=(L2&&GRID)?'block':'none';
    if(!L2||!GRID) return;
    fieldC.style.mixBlendMode=L2.blend||'screen';
    fieldC.style.opacity=(L2.blend==='multiply'?0.85:0.82);
    var stepPx=5;
    var w=Math.max(2,Math.ceil(size.x/stepPx)), h=Math.max(2,Math.ceil(size.y/stepPx));
    // accurate lat per row / lon per col via the real projection
    var lats=new Array(h), lons=new Array(w);
    for(var j=0;j<h;j++){ lats[j]=map.containerPointToLatLng([0, j*(size.y/(h-1))]).lat; }
    for(var i=0;i<w;i++){ lons[i]=map.containerPointToLatLng([i*(size.x/(w-1)), 0]).lng; }
    var off=document.createElement('canvas'); off.width=w; off.height=h;
    var octx=off.getContext('2d'), im=octx.createImageData(w,h), dat=im.data;
    for(var jy=0;jy<h;jy++){ var lat=lats[jy];
      for(var ix=0;ix<w;ix++){ var v=sample(GRID,GRID.val,lat,lons[ix]); var o=(jy*w+ix)*4;
        if(v==null||isNaN(v)){ dat[o+3]=0; continue; }
        var col=colorRamp(L2.stops,v); dat[o]=col[0]; dat[o+1]=col[1]; dat[o+2]=col[2]; dat[o+3]=255;
      }
    }
    octx.putImageData(im,0,0);
    fx.imageSmoothingEnabled=true; fx.imageSmoothingQuality='high';
    fx.drawImage(off,0,0,w,h,0,0,size.x,size.y);
  }

  // ── Animated wind particles (advected by the interpolated flow field) ──
  var particles=[], windRAF=null, windC=arrowC;
  windC.style.mixBlendMode='screen';
  function spawn(p){ p.lat=GRID.latMin+Math.random()*(GRID.latMax-GRID.latMin);
    p.lon=GRID.lonMin+Math.random()*(GRID.lonMax-GRID.lonMin); p.age=0; p.max=50+Math.random()*70; }
  function initParticles(){ particles=[]; if(!GRID) return;
    for(var i=0;i<500;i++){ var p={}; spawn(p); p.age=Math.random()*p.max; particles.push(p); } }
  function stepParticles(){
    if(!(STATE.layer && STATE.layer.arrows && GRID)){ windRAF=null; return; }
    var size=map.getSize();
    if(windC.width!==size.x||windC.height!==size.y){ windC.width=size.x; windC.height=size.y; }
    var wx=windC.getContext('2d');
    wx.globalCompositeOperation='destination-out'; wx.fillStyle='rgba(0,0,0,0.09)'; wx.fillRect(0,0,size.x,size.y);
    wx.globalCompositeOperation='source-over'; wx.lineWidth=1.25; wx.lineCap='round';
    for(var i=0;i<particles.length;i++){ var p=particles[i];
      if(p.age>p.max){ spawn(p); continue; }
      var u=sample(GRID,GRID.U,p.lat,p.lon), v=sample(GRID,GRID.V,p.lat,p.lon);
      if(u==null||v==null){ spawn(p); continue; }
      var a=map.latLngToContainerPoint([p.lat,p.lon]);
      var k=0.00045;
      p.lat += v*k; p.lon += u*k/Math.cos(p.lat*Math.PI/180); p.age++;
      if(p.lat<GRID.latMin||p.lat>GRID.latMax||p.lon<GRID.lonMin||p.lon>GRID.lonMax){ spawn(p); continue; }
      var b=map.latLngToContainerPoint([p.lat,p.lon]);
      var col=colorRamp(STATE.layer.stops, Math.sqrt(u*u+v*v));
      wx.strokeStyle='rgba('+col[0]+','+col[1]+','+col[2]+',0.9)';
      wx.beginPath(); wx.moveTo(a.x,a.y); wx.lineTo(b.x,b.y); wx.stroke();
    }
    windRAF=requestAnimationFrame(stepParticles);
  }
  function updateWind(){
    var on = STATE.layer && STATE.layer.arrows && GRID;
    if(on){ var size=map.getSize(); windC.width=size.x; windC.height=size.y;
      windC.style.display='block'; initParticles(); if(!windRAF) windRAF=requestAnimationFrame(stepParticles); }
    else { if(windRAF){ cancelAnimationFrame(windRAF); windRAF=null; }
      var wx=windC.getContext('2d'); if(wx) wx.clearRect(0,0,windC.width,windC.height); windC.style.display='none'; }
  }

  // Rebuild the grid + repaint everything (field, wind, city labels).
  function refresh(){ GRID=buildGrid(); scheduleOverlay(); updateWind(); renderCities(); }

  // Windy-style per-city value labels — bilinear-sampled from the same grid.
  function renderCities(){
    cityLayer.clearLayers();
    var L2=STATE.layer; if(!L2||!GRID) return;
    var unit=L2.unit||'';
    CITIES.forEach(function(c){
      var v=sample(GRID,GRID.val,c.lat,c.lon);
      if(v==null||isNaN(v)) return;
      var val = (unit==='m'||unit==='mm/h') ? (Math.round(v*10)/10) : Math.round(v);
      var html='<div class="cityval"><div class="cn">'+c.n+'</div><div class="cv">'+val+' '+unit+'</div></div>';
      L.marker([c.lat,c.lon],{icon:L.divIcon({className:'',html:html,iconSize:[100,30],iconAnchor:[50,15]}),interactive:false}).addTo(cityLayer);
    });
  }

  // On pan/zoom, repaint the field and wipe the particle trails so they don't
  // smear across the re-projected map (the loop rebuilds them immediately).
  map.on('move zoom resize', function(){ scheduleOverlay();
    if(windC.width){ var wx=windC.getContext('2d'); if(wx) wx.clearRect(0,0,windC.width,windC.height); } });

  window.HU = {
    setBasemap: function(name){ try{ if(name===curBase) return; map.removeLayer(tiles[curBase]); tiles[name].addTo(map); curBase=name; }catch(e){} },
    setWeather: function(o){ try{ STATE.weather=o?o.weather:null; STATE.marine=o?o.marine:null; refresh(); }catch(e){} },
    setLayer: function(l){ try{ STATE.layer=l; refresh(); }catch(e){} },
    setHour: function(h){ try{ STATE.hour=h|0; renderMarks(); refresh(); }catch(e){} },
    setStorms: function(arr){ try{ STATE.storms=arr||[]; renderTracks(); renderMarks(); }catch(e){} },
    setSpaghetti: function(o){ try{ spag.clearLayers(); if(o&&o.models) o.models.forEach(function(m){ if(m.pts.length>1) L.polyline(m.pts,{color:m.color,weight:1.8,opacity:m.source==='live'?.9:.6,dashArray:m.source==='live'?null:'4 4'}).addTo(spag); }); }catch(e){} },
    fit: function(){ try{ var b=STATE.storms.map(function(s){return [s.lat,s.lon];}); if(b.length){ map.fitBounds(b,{padding:[60,90],maxZoom:6}); } }catch(e){} },
    focus: function(name){ try{ var s=null; for(var i=0;i<STATE.storms.length;i++){ if(STATE.storms[i].name===name){ s=STATE.storms[i]; break; } } if(!s) return; var p=interp(s, STATE.hour); map.setView([p.lat,p.lon], 6, {animate:true}); var mk=null; stormMarks.eachLayer(function(l){ if(l.getPopup && l.getLatLng && Math.abs(l.getLatLng().lat-p.lat)<0.05 && Math.abs(l.getLatLng().lng-p.lon)<0.05 && l.getPopup) { mk=l; } }); if(mk && mk.openPopup) setTimeout(function(){ try{ mk.openPopup(); }catch(e){} }, 400); }catch(e){} },
    fitPar: function(){ try{ map.fitBounds(PAR, {padding:[30,30], animate:true}); }catch(e){} }
  };
})();
</script>
</body></html>`
