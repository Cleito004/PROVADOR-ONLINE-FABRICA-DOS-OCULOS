/*
 * Painel de ajuste do kiosk (sliders de máscara e óculos).
 *
 * Escondido por padrão. Para abrir:
 *   - abra a página com ?ajuste=1  na URL, ou
 *   - aperte a tecla  T  a qualquer momento
 *
 * Os sliders escrevem em window.OCC / window.GLS (criados pelo WebARRocksMirror),
 * então o efeito é imediato na tela. "Copiar valores" gera o trecho pronto para
 * colar no kiosk.js. Os valores ficam salvos no localStorage e são reaplicados
 * ao recarregar, para não perder o ajuste no meio do caminho.
 */

(function(){
  'use strict';

  const STORAGE_KEY = 'kioskTuning';

  // definição dos sliders: [alvo, propriedade, rótulo, min, max, passo, padrão, casas decimais]
  const CONTROLS = [
    ['OCC', 'z',     'Recuo',       -80,   40,  1,     0,    0],
    ['OCC', 'y',     'Altura',      -40,   40,  1,     0,    0],
    ['OCC', 'scale', 'Tamanho',     0.6,  1.4,  0.01,  1,    2],
    ['GLS', 'z',     'Distância',    20,  110,  1,     53,   0],
    ['GLS', 'y',     'Altura',        0,   80,  1,     40,   0],
    ['GLS', 'scale', 'Tamanho',      50,  110,  1,     78,   0],
    ['GLS', 'rotX',  'Inclinação', -0.8,  0.3,  0.01, -0.3,  2]
  ];

  let panel = null;
  const rows = {}; // "OCC.z" -> {input, valueEl}
  let values = {}; // "OCC.z" -> number

  function key(target, prop){
    return target + '.' + prop;
  }

  // ── persistência ────────────────────────────────────────────────
  function load_values(){
    values = {};
    CONTROLS.forEach(function(c){
      values[key(c[0], c[1])] = c[6];
    });
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      Object.keys(saved).forEach(function(k){
        if (k in values && typeof saved[k] === 'number'){
          values[k] = saved[k];
        }
      });
    } catch(e){
      console.warn('[Ajuste] localStorage ilegível, usando padrões');
    }
  }

  function save_values(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
    } catch(e){}
  }

  // ── aplicação no motor 3D ───────────────────────────────────────
  function is_engineReady(){
    return (typeof window.OCC !== 'undefined' && typeof window.GLS !== 'undefined');
  }

  function apply_all(){
    if (!is_engineReady()) return false;
    CONTROLS.forEach(function(c){
      window[c[0]][c[1]] = values[key(c[0], c[1])];
    });
    return true;
  }

  // ── UI ──────────────────────────────────────────────────────────
  function inject_css(){
    const css = `
      .tuning-panel {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 300;
        width: 250px;
        padding: 14px 16px;
        background: rgba(10, 10, 20, 0.88);
        backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 14px;
        color: #e8e8f0;
        font-family: 'Segoe UI', system-ui, sans-serif;
        display: none;
      }
      .tuning-panel.visible { display: block; }
      .tuning-panel h3 {
        font-size: 11px;
        letter-spacing: 1.5px;
        text-transform: uppercase;
        color: #6C63FF;
        margin-bottom: 10px;
        font-weight: 700;
      }
      .tuning-panel h3:not(:first-child) {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
      }
      .tuning-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 7px;
      }
      .tuning-row label {
        font-size: 11px;
        color: #8888aa;
        min-width: 62px;
        text-align: right;
      }
      .tuning-row input[type="range"] {
        -webkit-appearance: none;
        appearance: none;
        flex: 1;
        height: 3px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 2px;
        outline: none;
      }
      .tuning-row input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #6C63FF;
        cursor: pointer;
        border: none;
      }
      .tuning-value {
        font-size: 11px;
        min-width: 34px;
        text-align: left;
        font-variant-numeric: tabular-nums;
        color: #e8e8f0;
      }
      .tuning-check {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        color: #8888aa;
        margin: 10px 0 4px;
        cursor: pointer;
      }
      .tuning-buttons {
        display: flex;
        gap: 8px;
        margin-top: 14px;
      }
      .tuning-btn {
        flex: 1;
        padding: 8px 10px;
        border: none;
        border-radius: 9px;
        font-size: 11px;
        font-weight: 600;
        font-family: inherit;
        cursor: pointer;
        transition: all 0.2s;
      }
      .tuning-btn.primary { background: #6C63FF; color: #fff; }
      .tuning-btn.primary:hover { background: #5A52D5; }
      .tuning-btn.ghost {
        background: rgba(255, 255, 255, 0.07);
        color: #8888aa;
      }
      .tuning-btn.ghost:hover { background: rgba(255, 255, 255, 0.14); }
      .tuning-hint {
        font-size: 10px;
        color: #555577;
        margin-top: 10px;
        line-height: 1.5;
      }
    `;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
  }

  function build_row(target, prop, label, min, max, step, decimals){
    const row = document.createElement('div');
    row.className = 'tuning-row';

    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = min;
    input.max = max;
    input.step = step;
    input.value = values[key(target, prop)];

    const valueEl = document.createElement('span');
    valueEl.className = 'tuning-value';
    valueEl.textContent = Number(input.value).toFixed(decimals);

    input.addEventListener('input', function(){
      const v = parseFloat(input.value);
      values[key(target, prop)] = v;
      valueEl.textContent = v.toFixed(decimals);
      if (is_engineReady()){
        window[target][prop] = v;
      }
      save_values();
    });

    row.appendChild(labelEl);
    row.appendChild(input);
    row.appendChild(valueEl);
    rows[key(target, prop)] = {input: input, valueEl: valueEl, decimals: decimals};
    return row;
  }

  function get_snippet(){
    return 'occluderScale: ' + values['OCC.scale']
      + ',\noccluderOffset: [0, ' + values['OCC.y'] + ', ' + values['OCC.z'] + ']'
      + ',\nglassesScale: ' + values['GLS.scale']
      + ',\nglassesPosition: [0, ' + values['GLS.y'] + ', ' + values['GLS.z'] + ']'
      + ',\nglassesRotationX: ' + values['GLS.rotX'] + ',';
  }

  function show_feedback(button, text){
    const original = button.textContent;
    button.textContent = text;
    setTimeout(function(){ button.textContent = original; }, 1600);
  }

  function build_panel(){
    panel = document.createElement('div');
    panel.className = 'tuning-panel';

    const titleMask = document.createElement('h3');
    titleMask.textContent = 'Máscara da cabeça';
    panel.appendChild(titleMask);

    CONTROLS.filter(function(c){ return c[0] === 'OCC'; }).forEach(function(c){
      panel.appendChild(build_row(c[0], c[1], c[2], c[3], c[4], c[5], c[7]));
    });

    // mostrar/esconder a máscara colorida:
    const checkLabel = document.createElement('label');
    checkLabel.className = 'tuning-check';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.addEventListener('change', function(){
      if (is_engineReady()){
        window.OCC.debug = check.checked;
      }
    });
    checkLabel.appendChild(check);
    checkLabel.appendChild(document.createTextNode('Mostrar a máscara'));
    panel.appendChild(checkLabel);

    const titleGlasses = document.createElement('h3');
    titleGlasses.textContent = 'Óculos';
    panel.appendChild(titleGlasses);

    CONTROLS.filter(function(c){ return c[0] === 'GLS'; }).forEach(function(c){
      panel.appendChild(build_row(c[0], c[1], c[2], c[3], c[4], c[5], c[7]));
    });

    const buttons = document.createElement('div');
    buttons.className = 'tuning-buttons';

    const btnCopy = document.createElement('button');
    btnCopy.className = 'tuning-btn primary';
    btnCopy.textContent = 'Copiar valores';
    btnCopy.addEventListener('click', function(){
      const snippet = get_snippet();
      console.log('=== VALORES DE AJUSTE ===\n' + snippet);
      if (navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(snippet).then(function(){
          show_feedback(btnCopy, 'Copiado!');
        }, function(){
          show_feedback(btnCopy, 'Veja o console');
        });
      } else {
        show_feedback(btnCopy, 'Veja o console');
      }
    });

    const btnReset = document.createElement('button');
    btnReset.className = 'tuning-btn ghost';
    btnReset.textContent = 'Resetar';
    btnReset.addEventListener('click', function(){
      CONTROLS.forEach(function(c){
        const k = key(c[0], c[1]);
        values[k] = c[6];
        rows[k].input.value = c[6];
        rows[k].valueEl.textContent = Number(c[6]).toFixed(c[7]);
      });
      save_values();
      apply_all();
    });

    buttons.appendChild(btnCopy);
    buttons.appendChild(btnReset);
    panel.appendChild(buttons);

    const hint = document.createElement('p');
    hint.className = 'tuning-hint';
    hint.textContent = 'Tecla T abre e fecha este painel.';
    panel.appendChild(hint);

    document.body.appendChild(panel);
  }

  function toggle_panel(isVisible){
    const show = (typeof isVisible === 'boolean') ? isVisible : !panel.classList.contains('visible');
    panel.classList.toggle('visible', show);
  }

  // ── inicialização ───────────────────────────────────────────────
  function init(){
    load_values();
    inject_css();
    build_panel();

    if (/[?&]ajuste=1/.test(window.location.search)){
      toggle_panel(true);
    }

    window.addEventListener('keydown', function(evt){
      // ignora se o usuário estiver digitando em algum campo:
      const tag = (evt.target && evt.target.tagName) ? evt.target.tagName.toLowerCase() : '';
      if (tag === 'input' || tag === 'textarea') return;
      if (evt.key === 't' || evt.key === 'T'){
        toggle_panel();
      }
    });

    // OCC/GLS só existem depois que o motor 3D termina de carregar:
    const timer = setInterval(function(){
      if (apply_all()){
        clearInterval(timer);
        console.log('[Ajuste] painel conectado ao motor 3D (tecla T para abrir)');
      }
    }, 300);
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
