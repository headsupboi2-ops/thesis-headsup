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
    inject(`HU.fit()`)
  }

  // Incremental updates once the map is ready.
  useEffect(() => { if (ready.current) inject(`HU.setBasemap(${JSON.stringify(basemap)})`) }, [basemap])
  useEffect(() => { if (ready.current) inject(`HU.setWeather(${weatherPayload()})`) }, [weatherGrid, marineGrid])
  useEffect(() => { if (ready.current) inject(`HU.setLayer(${layerPayload()})`) }, [layer])
  useEffect(() => { if (ready.current) inject(`HU.setHour(${forecastHour})`) }, [forecastHour])
  useEffect(() => { if (ready.current) { inject(`HU.setStorms(${stormsPayload()})`); inject(`HU.fit()`) } }, [storms, forecasts])
  useEffect(() => { if (ready.current) inject(`HU.setSpaghetti(${spaghettiPayload()})`) }, [spaghetti])

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

  function layerPoints(){
    var L2 = STATE.layer; if(!L2) return [];
    var h = STATE.hour;
    if(L2.source==='wave'){
      if(!STATE.marine) return [];
      return STATE.marine.points.map(function(p){ var v=(p.wave_height||[])[h]; return {lat:p.lat,lon:p.lon,v:(v==null?null:v)}; });
    }
    if(!STATE.weather) return [];
    return STATE.weather.points.map(function(p){
      var v=null;
      if(L2.source==='thunder'){ var c=(p.cloud||[])[h], r=(p.precip||[])[h];
        if(c!=null&&r!=null) v=Math.max(0,Math.min(100,c*0.35+r*10)); }
      else { var arr=p[L2.source]; if(arr) v=arr[h]; }
      return {lat:p.lat,lon:p.lon,v:(v==null?null:v),dir:(p.wind_dir||[])[h]};
    });
  }

  var rafPending=false;
  function scheduleOverlay(){ if(rafPending) return; rafPending=true; requestAnimationFrame(function(){ rafPending=false; renderOverlay(); }); }

  function renderOverlay(){
    var size=map.getSize();
    [fieldC,arrowC].forEach(function(c){ if(c.width!==size.x||c.height!==size.y){ c.width=size.x; c.height=size.y; } });
    var fx=fieldC.getContext('2d'), ax=arrowC.getContext('2d');
    fx.clearRect(0,0,size.x,size.y); ax.clearRect(0,0,size.x,size.y);
    var L2=STATE.layer;
    fieldC.style.display = L2?'block':'none'; arrowC.style.display = L2?'block':'none';
    if(!L2) return;
    var pts=layerPoints();
    if(!pts.length) return;
    // blurred colour field
    fieldC.style.mixBlendMode = L2.blend || 'screen';
    fieldC.style.opacity = (L2.blend==='multiply'?0.75:0.72);
    fx.save(); fx.filter='blur('+(L2.blur||16)+'px)';
    pts.forEach(function(p){
      if(p.v==null||isNaN(p.v)) return;
      var cp=map.latLngToContainerPoint([p.lat,p.lon]);
      var col=colorRamp(L2.stops,p.v);
      fx.fillStyle='rgb('+col[0]+','+col[1]+','+col[2]+')';
      fx.beginPath(); fx.arc(cp.x,cp.y,(L2.radius||88),0,Math.PI*2); fx.fill();
    });
    fx.restore();
    // wind arrows
    if(L2.arrows){
      ax.strokeStyle='rgba(255,255,255,.8)'; ax.fillStyle='rgba(255,255,255,.8)'; ax.lineWidth=1.5;
      pts.forEach(function(p){
        if(p.v==null||isNaN(p.v)||p.dir==null) return;
        var cp=map.latLngToContainerPoint([p.lat,p.lon]);
        var ang=(p.dir+180)*Math.PI/180; // dir = FROM; arrow points TO
        var len=8+Math.min(16,p.v/3);
        var dx=Math.sin(ang)*len, dy=-Math.cos(ang)*len;
        ax.beginPath(); ax.moveTo(cp.x-dx,cp.y-dy); ax.lineTo(cp.x+dx,cp.y+dy); ax.stroke();
        var ha=0.5; // arrowhead
        ax.beginPath(); ax.moveTo(cp.x+dx,cp.y+dy);
        ax.lineTo(cp.x+dx-(Math.sin(ang-ha)*5),cp.y+dy+(Math.cos(ang-ha)*5));
        ax.lineTo(cp.x+dx-(Math.sin(ang+ha)*5),cp.y+dy+(Math.cos(ang+ha)*5));
        ax.closePath(); ax.fill();
      });
    }
  }

  // Windy-style per-city value labels for the active layer (IDW-sampled).
  function renderCities(){
    cityLayer.clearLayers();
    var L2=STATE.layer; if(!L2) return;
    var pts=layerPoints(); if(!pts.length) return;
    var unit=L2.unit||'';
    CITIES.forEach(function(c){
      var num=0,den=0,got=false,exact=null;
      for(var i=0;i<pts.length;i++){ var p=pts[i]; if(p.v==null||isNaN(p.v)) continue;
        var dlat=c.lat-p.lat,dlon=c.lon-p.lon,d2=dlat*dlat+dlon*dlon;
        if(d2<1e-6){ exact=p.v; break; } var w=1/d2; num+=w*p.v; den+=w; got=true; }
      var v = exact!=null?exact:(got?num/den:null);
      if(v==null||isNaN(v)) return;
      var val = (unit==='m'||unit==='mm/h') ? (Math.round(v*10)/10) : Math.round(v);
      var html='<div class="cityval"><div class="cn">'+c.n+'</div><div class="cv">'+val+' '+unit+'</div></div>';
      L.marker([c.lat,c.lon],{icon:L.divIcon({className:'',html:html,iconSize:[100,30],iconAnchor:[50,15]}),interactive:false}).addTo(cityLayer);
    });
  }

  map.on('move zoom resize', scheduleOverlay);

  window.HU = {
    setBasemap: function(name){ try{ if(name===curBase) return; map.removeLayer(tiles[curBase]); tiles[name].addTo(map); curBase=name; }catch(e){} },
    setWeather: function(o){ try{ STATE.weather=o?o.weather:null; STATE.marine=o?o.marine:null; scheduleOverlay(); renderCities(); }catch(e){} },
    setLayer: function(l){ try{ STATE.layer=l; scheduleOverlay(); renderCities(); }catch(e){} },
    setHour: function(h){ try{ STATE.hour=h|0; renderMarks(); scheduleOverlay(); renderCities(); }catch(e){} },
    setStorms: function(arr){ try{ STATE.storms=arr||[]; renderTracks(); renderMarks(); }catch(e){} },
    setSpaghetti: function(o){ try{ spag.clearLayers(); if(o&&o.models) o.models.forEach(function(m){ if(m.pts.length>1) L.polyline(m.pts,{color:m.color,weight:1.8,opacity:m.source==='live'?.9:.6,dashArray:m.source==='live'?null:'4 4'}).addTo(spag); }); }catch(e){} },
    fit: function(){ try{ var b=STATE.storms.map(function(s){return [s.lat,s.lon];}); if(b.length){ map.fitBounds(b,{padding:[60,90],maxZoom:6}); } }catch(e){} }
  };
})();
</script>
</body></html>`
