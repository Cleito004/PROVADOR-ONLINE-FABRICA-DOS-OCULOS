import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LM = {
  leftEyeOuter: 33, rightEyeOuter: 263,
  leftEyeInner: 133, rightEyeInner: 362,
  leftTemple: 127, rightTemple: 356,
  leftCheek: 234, rightCheek: 454,
  forehead: 10, chin: 175,
  noseBridge: 168, noseTip: 1, noseBottom: 2, midEye: 168,
  leftEyePupil: 143, rightEyePupil: 372
};

const HM = {
  wrist: 0,
  thumbCMC: 1, thumbMCP: 2, thumbIP: 3, thumbTip: 4,
  indexMCP: 5, indexPIP: 6, indexDIP: 7, indexTip: 8,
  middleMCP: 9, middlePIP: 10, middleDIP: 11, middleTip: 12,
  ringMCP: 13, ringPIP: 14, ringDIP: 15, ringTip: 16,
  pinkyMCP: 17, pinkyPIP: 18, pinkyDIP: 19, pinkyTip: 20,
};

const LENS_COLORS = [
  { color: '#111111', opacity: 0.85, name: 'Preto' },
  { color: '#ffffff', opacity: 0.08, name: 'Transparente' },
  { color: '#ffcc00', opacity: 0.35, name: 'Amarelo' },
];

const FRAME_COLORS_RAINBOW = [
  { r: 255, g: 0,   b: 0   },
  { r: 255, g: 136, b: 0   },
  { r: 255, g: 255, b: 0   },
  { r: 0,   g: 255, b: 0   },
  { r: 0,   g: 136, b: 255 },
  { r: 136, g: 0,   b: 255 },
  { r: 255, g: 0,   b: 255 },
  { r: 139, g: 69,  b: 19  },
  { r: 128, g: 128, b: 128 },
  { r: 0,   g: 0,   b: 0   },
  { r: 255, g: 255, b: 255 },
];

const STYLES = ['square', 'aviator', 'cateye'];

// Rótulos em português, para os avisos na tela combinarem com o #style-matrix.
const STYLE_LABELS = { square: 'Quadrado', aviator: 'Aviador', cateye: 'Gatinho' };

const REF_MODEL_WIDTH = 50;

const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDepth: 2,
  glassesDown: 2,
  glassesCenterX: 0,
  // 2.98 = os 3.5 de antes x 0.85, que era o fator que o slider de distância
  // aplicava na escala quando estava em -150. A escala não depende mais da
  // distância (eram duas coisas diferentes acopladas), e o tamanho na tela
  // continua o mesmo de antes.
  glassesScale: 2.98,
};

const STYLE_CONFIG = {
  square:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
  aviator: { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0.5, scaleFactor: 0.01, flipY: true },
  cateye:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
};

// ── Modo vitrine ────────────────────────────────────────────────────────────
// Liga com ?vitrine=1 na URL. É para a tela que fica atrás do vidro da loja:
// ninguém toca nela e ninguém está por perto para consertar se travar.
//   - some o cursor do mouse e os sliders de ajuste (não há como usá-los)
//   - a tela não apaga sozinha (Wake Lock)
//   - a câmera é reconectada indefinidamente, em vez de desistir na 3ª tentativa
//   - um vigia reinicia o app se o loop de detecção parar de rodar
// Tela cheia de verdade o navegador só dá com gesto do usuário, então isso vem
// de fora: iniciar-vitrine.ps1 abre o navegador já em modo quiosque.
const MODO_VITRINE = new URLSearchParams(location.search).has('vitrine');

window.VITRINE = {
  travouMs: 12000,  // sem nenhum frame processado por este tempo => reinicia
  religarMs: 4000,  // espera entre tentativas de reconectar a câmera
};

let ultimoFrameEm = Date.now();

let faceLandmarker;
let handLandmarker;
// Cada pessoa detectada ganha o seu próprio par de óculos e a sua máscara de
// cabeça — é isso que permite mais de uma criança na frente da tela ao mesmo
// tempo. O modelo e as cores continuam sendo os mesmos para todos: os gestos
// valem para a cena inteira, então quem gesticular troca os óculos de todo mundo.
const MAX_FACES = 4;
const faceSlots = [];
let videoTexture;
let videoSprite;
let renderer, scene, camera;

// Occluder ("máscara invisível da cabeça"): esconde automaticamente as astes
// que ficam atrás da cabeça quando o rosto gira. Ajustável ao vivo pelo console
// via window.OCC (ex: OCC.debug = true; OCC.rz = 0.6).
window.OCC = {
  debug: false,    // true = mostra a máscara em vermelho para ajuste visual
  // A máscara é um elipsoide SÓLIDO, posicionado de modo que a frente dele pare
  // um pouco atrás da armação (frontGap): assim ela engole tudo o que passa pela
  // cabeça sem nunca cobrir as lentes.
  //
  // NÃO cortar a máscara com plano: cortar deixa a malha aberta e, pelo buraco,
  // a GPU não encontra superfície para escrever profundidade — a máscara para de
  // ocluir justamente onde foi cortada. Era o que fazia as astes reaparecerem
  // soltas ao lado do rosto quando a cabeça inclinava.
  //
  // O rx era 1.10 — RAIO em larguras de rosto, ou seja uma máscara com 2,2
  // larguras de rosto, mais que o dobro de uma cabeça. As astes correm em ±0.5,
  // então ficavam enterradas fundo dentro dela SEMPRE: era isso que deixava a
  // aste curta em todos os ângulos, e não o tamanho do modelo. O rx foi inflado
  // para compensar o elipsoide fechar rápido nas laterais, e a compensação saiu
  // pior que o defeito (daí ter surgido o recuo da máscara, remendo do remendo).
  //
  // Agora a máscara é mais ESTREITA que a linha das astes: elas passam por fora
  // e nunca são engolidas. Quem esconde a aste de trás é applyTempleFade, por
  // profundidade real. Cada mecanismo com um trabalho só, sem gangorra entre eles.
  rx: 0.45,        // raio horizontal (x largura do rosto) - menor que as astes (0.5)
  ry: 0.62,        // raio vertical (x altura do rosto)
  rz: 1.00,        // raio de profundidade (x largura do rosto)
  frontGap: 0.15,  // folga entre a frente da máscara e a armação (x largura do rosto)
  // Cabeça é mais caixa arredondada que bola. Este é o expoente da superelipse da
  // seção horizontal (ver geometriaCabeca): 2 = elipsoide puro, maior = lateral
  // mais reta, mantendo profundidade até perto da borda em vez de afinar. É o que
  // evita ter de inflar o rx de novo para compensar a forma.
  lados: 4.0,
};

// Aste do lado que o rosto mostra. O modelo tem astes curtas, e a máscara da
// cabeça ainda engole parte delas, então de perfil sobra um toco pequeno. Aqui a
// aste virada para a câmera é revelada (deixa de ser ocultada pela máscara) e
// cresce conforme o rosto gira, ficando parecida com um óculos de verdade.
// A aste oposta nunca muda: continua escondida atrás da cabeça.
// O crescimento é gradual; a volta é imediata, como pedido.
// Aste do lado mostrado: quanto mais o rosto vira, mais a máscara da cabeça
// recua, e mais aste fica à mostra. De frente a máscara volta para perto da
// armação e as astes somem — que é o que mantém o rosto limpo, inclusive quando
// a cabeça está inclinada para cima ou para baixo.
//
// O que faz a aste parecer curta não é o tamanho dela: é onde a máscara começa.
// Por isso mexer aqui funciona, e esticar o modelo não funcionava (esticar joga
// a aste mais para dentro da máscara, e o pedaço à mostra continua igual).
//
// Como a aste oposta fica atrás da cabeça, ela segue escondida mesmo com a
// máscara recuada: na tela cresce só a aste do lado para onde o rosto virou.
window.TEMPLE = {
  enabled: true,

  // ONDE A ASTE COMEÇA, no corte da malha (fração da profundidade do modelo).
  // Não é valor calibrado a olho: varrendo 0.15..0.50 nos três GLBs existe um
  // platô em 0.20..0.30 em que o corte devolve exatamente as mesmas 126
  // triângulos por aste nos três modelos. A aste é uma peça separada da malha, e
  // qualquer valor dessa faixa a pega inteira e sem aro. 0.25 é o meio do platô.
  cutZ: 0.25,

  // QUAL ASTE APAGAR, e quanto: pela diferença de PROFUNDIDADE REAL entre as
  // duas na cena, normalizada pela largura do rosto. Antes o gatilho era só o
  // seno do yaw, o que obrigava a inventar um limiar por eixo e falhava em
  // movimento combinado (baixo + esquerda). A diferença de profundidade já
  // embute yaw, pitch e roll juntos, em uma conta só:
  //   rosto reto  -> as duas na mesma profundidade -> diferença 0 -> as duas aparecem
  //   virou       -> uma afunda                    -> ela apaga
  // Como é geometria e não limiar, não existe caso especial para acrescentar, e o
  // bug antigo de "cabeça toda abaixada some as duas astes" fica impossível por
  // construção: pitch puro mantém as duas na mesma profundidade.
  hideStart: 0.04, // diferença a partir da qual a aste de trás começa a sumir
  hideFull: 0.14,  // diferença em que ela já está 100% invisível
  hideFade: 0.45,  // suavização por frame; alto porque o pedido é sumir rápido

  // COMPRIMENTO DA ASTE, o segundo mecanismo (v4.30.0).
  //
  // Comparando os screenshots do provador com fotos de óculos de verdade nos
  // MESMOS movimentos, o defeito não era o ângulo da aste: com a cabeça abaixada
  // 40°, uma aste que aponta para trás realmente se projeta quase na vertical na
  // tela, e nos óculos reais acontece igual. A diferença é que na vida real a
  // CABEÇA TAPA a aste quase inteira, sobrando um toco junto da dobradiça — e no
  // provador ela era desenhada inteira por cima da testa e do cabelo.
  //
  // Apagar por profundidade não resolvia isso e nunca resolveria: em inclinação
  // pura nenhuma aste está atrás da outra, a diferença é ZERO, e continuaria zero
  // por menor que fosse o hideStart. Faltava um mecanismo, não um limiar melhor.
  //
  // A regra: o comprimento à mostra vem de QUANTO O ROSTO ESTÁ VIRADO. De frente
  // ou apenas inclinado, a aste fica um toco (minLen), que é o que os óculos reais
  // mostram; conforme o rosto vira, ela cresce até o comprimento inteiro. Como o
  // gatilho é o giro, a aste de perfil continua exatamente como está hoje.
  //
  // Encurtar é melhor que só apagar porque é o que a realidade faz: a silhueta da
  // cabeça come a aste da ponta para a dobradiça, e não some com ela por inteiro.
  //
  // v4.31.0: este comprimento virou um CORTE, e deixou de ser uma escala. Escalar
  // COMPRIMIA a aste (o Z encolhia, o Y não), o que punha a ponta retorcida em pé,
  // colada na dobradiça — o risco vertical que se via de frente. Os quatro números
  // abaixo continuam significando exatamente a mesma coisa; mudou só quem aplica o
  // resultado (ver prepararCorteAste e applyTempleFade).
  //
  // A saber antes de mexer no minLen: como a aste é reta nos primeiros 80% e só
  // dobra nos últimos 20%, a ponta retorcida só reaparece quando compVisivel passa
  // de 0.80 — com estes valores, por volta de 22° de giro. Subir muito o minLen
  // traz a ponta de volta para a vista de frente, que é o defeito que saiu daqui.
  showStart: 0.12, // giro (seno do yaw) em que a aste começa a crescer (~7°)
  showFull: 0.45,  // giro em que ela já está inteira (~27°)
  minLen: 0.15,    // fração do comprimento que sobra de frente / só inclinado
  lenFade: 0.25,   // suavização do comprimento por frame
};

// Tamanho dos óculos no rosto, como multiplicador do tamanho calibrado.
// 1.0 = o de sempre; 1.05 = 5% maior. Serve para afinar o encaixe sem ter de
// republicar: mexa aqui, veja na tela, e me passe o valor que ficar bom.
window.FIT = { scale: 1.0 };

// ENQUADRAMENTO (v4.32.0). A vitrine é uma tela EM PÉ e a webcam entrega imagem
// DEITADA. O canvas era criado no tamanho do VÍDEO e o CSS o esticava para
// 100%x100% do container sem preservar proporção — numa tela 9:16 isso não dava
// barra preta, dava DISTORÇÃO: o rosto (e os óculos) saíam altos e finos.
//
// Aqui fica quanto do vídeo sobrou VISÍVEL depois do corte que faz a imagem
// caber na proporção da tela. 1 = nada cortado (tela deitada igual à webcam).
// Numa tela 9:16 com webcam 4:3 sobra ~42% da largura.
//
// Quem consulta isto é a faixa RGB (ver xNaTela): sem essa conta a ponta do
// arco-íris cairia FORA da tela, e a pessoa teria de pôr a mão onde não se vê.
window.ENQ = { fracX: 1, fracY: 1, visW: 0, visH: 0 };

// Suavização do rastreamento. Ajustável ao vivo pelo console (window.SMOOTH).
// Valores MENORES = mais suave e mais tremor filtrado, porém com leve atraso;
// MAIORES = mais colado no rosto, porém tremendo mais. Se ainda tremer, baixe
// SMOOTH.pos e SMOOTH.rot; se parecer "arrastando", suba os dois.
window.SMOOTH = {
  // PISOS — valem com a pessoa PARADA e não mudaram no v4.34.0. É o que segura o
  // tremor, e foi conferido na câmera; mexer aqui é que traz o tremor de volta.
  pos: 0.22,       // posição: piso do fator por frame
  scale: 0.15,     // escala: mais lenta ainda, o tamanho quase não muda
  rot: 0.25,       // rotação: piso

  // TETOS — valem no movimento RÁPIDO. Eram o defeito relatado em 30/07: "quando
  // move o rosto muito rápido ele não acompanha e chega atrasado".
  //
  // Com fator `a` por frame e velocidade `v`, o atraso que sobra em regime é
  // v*(1-a)/a. Com o teto antigo de 0.65 isso dá 0.54*v — num movimento rápido
  // de ~30 px por frame, uns 16 px de atraso permanente, que é exatamente o que
  // se via. Em 0.95 cai para 0.05*v, ~1,5 px. Não vai a 1.0 porque em movimento
  // rápido a imagem borra e os pontos do MediaPipe ficam ruidosos: 1.0 copiaria
  // esse ruído inteiro para os óculos.
  //
  // Subir o TETO não afeta quem está parado — lá quem manda é o piso.
  posMax: 0.95,    // era 0.65
  rotMax: 0.95,    // era 0.70

  // A escala tem teto PRÓPRIO, e baixo de propósito. Ela seguia o mesmo teto da
  // posição, e levá-la a 0.95 faria o tamanho dos óculos pulsar a cada erro de
  // medida do rosto — o tamanho de uma pessoa não muda depressa, só a posição.
  scaleMax: 0.60,

  // ACELERADORES: quanto de movimento é preciso para sair do piso e chegar ao
  // teto. O posBoost era 0.02 medido em PIXELS DA CENA, e por isso praticamente
  // não ligava: para tirar a posição do piso ao teto exigia ~21 px por frame.
  // Pior, por ser em pixels a resposta dependia da DISTÂNCIA — quem estava mais
  // longe move menos pixels e recebia menos aceleração, ficando mais lento justo
  // onde o rosto é menor. Agora o movimento é medido em LARGURAS DE ROSTO, então
  // o número é adimensional e vale igual perto e longe.
  //   ~0.03 largura/frame (movimento normal) -> posição já bem solta
  //   ~0.20 largura/frame (movimento rápido) -> no teto
  posBoost: 4.0,   // era 0.02, e em outra unidade
  scaleBoost: 1.2, // a escala sobe bem mais devagar, de propósito
  // A rotação já era adimensional (qDelta devolve radianos), então aqui só
  // faltava ganho: com 0.9 um giro rápido de ~0.25 rad/frame chegava a 0.47, bem
  // abaixo do teto. Com 2.5 chega perto de 0.9.
  rotBoost: 2.5,   // era 0.9
  // Zona morta: variação menor que isto é considerada ruído do rastreamento e
  // simplesmente ignorada, o que trava os óculos no rosto com a pessoa parada.
  // Filtrar mais (baixar pos/rot) resolveria o tremor, mas ao custo de atraso
  // quando a pessoa realmente se mexe; a zona morta não cobra esse preço.
  // Se o movimento lento começar a andar "em degraus", é sinal de que está alta.
  deadZone: 0.035,    // fração da largura do rosto (~5 px num rosto de 140 px)
  deadZoneRot: 0.018, // radianos (~1 grau)
};

// Limiares dos gestos de mão. Ajustáveis ao vivo pelo console (window.GEST),
// no mesmo espírito do OCC: GEST.debug = true mostra as métricas na tela.
window.GEST = {
  debug: false,
  fingerCurl: 1.05,  // ponta mais perto do punho que a base x este fator => dedo abaixado
  thumbTuck: 0.95,   // dist(polegar, base do médio) / tamanho da mão abaixo disto => recolhido
  holdMs: 800,       // tempo que o gesto precisa ficar parado para valer
  edgeMargin: 0.02,  // faixa nas bordas do quadro onde a mão é considerada saindo
};
let video;
let predictionInFlight = false;
let isActive = false;

const smooth = {
  readyPos: false,
  readyRot: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(1,1,1),
  prev: new THREE.Vector3(),
  buffer: [],
  scanning: false,
  scanFrames: [],
  scanCompleted: false,
  handScanning: false,
  handScanFrames: 0,
  handScanCompleted: false,
};

let currentStyle = 'square';
let currentColor = '#000000';
let currentLensIdx = 0; // índice em LENS_COLORS da lente que está valendo
let currentLensColor = LENS_COLORS[currentLensIdx].color;
let currentLensOpacity = LENS_COLORS[currentLensIdx].opacity;

const gestureState = {
  frameHandClosed: false, // punho fechado da mão da armação => barra RGB ativa
  frameColorIdx: 5,
  frameHandFingers: 0,
  lensHandFingers: 0,
};

function releaseColorStrip() {
  if (!gestureState.frameHandClosed) return;
  gestureState.frameHandClosed = false;
  const strip = document.getElementById('color-strip');
  if (strip) strip.classList.remove('active');
}

// Correções finas do encaixe, todas constantes desde o v4.33.0. Altura e
// Distância ainda eram sliders na tela; sumiram porque o produto é uma tela
// atrás do vidro, onde ninguém alcança um controle — no modo vitrine já eram
// escondidos por CSS, então na prática só existiam para quem desenvolvia.
// Os valores são exatamente aqueles em que os sliders estavam, e portanto o
// encaixe no rosto não mudou. Para afinar sem republicar: window.FIT.scale.
const adjHeight = -10;
const adjRotation = 0;
const adjLateral = 0;
// Ajuste fino em torno do recuo correto, que vem da geometria do modelo. Era
// -150 (o recuo inteiro, fixo em pixels), o que desalinhava os óculos ao
// inclinar a cabeça — ver o cálculo de zOffset em runPrediction.
const adjDistance = 0;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function qDelta(a, b) { return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1)); }

function toVec3(pts, i) {
  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  return new THREE.Vector3(pts[i][0] - vw/2, -pts[i][1] + vh/2, -pts[i][2]);
}

function dist2D(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Tamanho da mão na imagem (punho -> base do dedo médio). Serve de régua para
// normalizar as outras medidas, então os gestos funcionam a qualquer distância.
function handSpan(pts) {
  return Math.max(dist2D(pts[HM.wrist], pts[HM.middleMCP]), 1);
}

// Um dedo está abaixado quando a ponta chega mais perto do punho que a própria
// junta da base. Diferente de comparar Y da ponta com Y da PIP, isto não depende
// da mão estar na vertical.
function isFingerCurled(pts, tip, mcp) {
  const wrist = pts[HM.wrist];
  return dist2D(pts[tip], wrist) < dist2D(pts[mcp], wrist) * window.GEST.fingerCurl;
}

// O polegar só conta como recolhido quando a ponta encosta na palma. Esticado
// para o lado (ou para cima, tipo 👍) a distância cresce e o punho não é aceito.
function isThumbTucked(pts) {
  return dist2D(pts[HM.thumbTip], pts[HM.middleMCP]) < handSpan(pts) * window.GEST.thumbTuck;
}

// Punho fechado de verdade: os 4 dedos abaixados E o polegar recolhido.
function isHandFullyClosed(pts) {
  if (!pts || pts.length < 21) return false;
  const allCurled =
    isFingerCurled(pts, HM.indexTip, HM.indexMCP) &&
    isFingerCurled(pts, HM.middleTip, HM.middleMCP) &&
    isFingerCurled(pts, HM.ringTip, HM.ringMCP) &&
    isFingerCurled(pts, HM.pinkyTip, HM.pinkyMCP);
  return allCurled && isThumbTucked(pts);
}

// A confiabilidade dos landmarks cai quando a mão está entrando ou saindo do
// quadro: no modo vídeo o MediaPipe rastreia pelo bounding box do frame anterior,
// e é justamente aí que a contagem de dedos erra. Nessas bordas ignoramos a
// leitura em vez de aplicar uma troca errada.
// Atenção: não usar na barra RGB, que precisa da mão perto da borda lateral
// para alcançar os extremos do arco-íris.
function isHandFullyVisible(pts) {
  if (!pts || pts.length < 21) return false;
  const w = (video && video.videoWidth) || 640;
  const h = (video && video.videoHeight) || 480;
  const mx = w * window.GEST.edgeMargin;
  const my = h * window.GEST.edgeMargin;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] < mx || pts[i][0] > w - mx) return false;
    if (pts[i][1] < my || pts[i][1] > h - my) return false;
  }
  return true;
}

// Um gesto só vale depois de ficar parado por GEST.holdMs (padrão "dwell" das
// interfaces sem toque). Evita trocas acidentais enquanto a mão entra ou sai do
// quadro — era o que fazia a lente escolhida voltar para a primeira opção.
// `applied` guarda o que já está valendo, para a mão voltar com os mesmos dedos
// sem reaplicar nem repetir o aviso.
const gestureDwell = {
  lens:  { value: null, since: 0, applied: null, locked: false },
  style: { value: null, since: 0, applied: null, locked: false },
};

function trackDwell(slot, value) {
  const st = gestureDwell[slot];
  const now = Date.now();
  if (st.value !== value) {
    st.value = value;
    st.since = now;
  }
  if (st.applied === value) return { progress: 1, fired: false };
  const progress = clamp((now - st.since) / window.GEST.holdMs, 0, 1);
  if (progress >= 1) {
    st.applied = value;
    st.locked = false;
    return { progress: 1, fired: true };
  }
  return { progress, fired: false };
}

// Mão aberta: para de trocar e trava o que está valendo. É o gesto que permite
// tirar a mão da tela sem alterar a escolha.
function lockDwell(slot) {
  const st = gestureDwell[slot];
  st.value = null;
  st.locked = true;
}

const dwellEl = {
  box: null, label: null, fill: null,
};

function showDwellFeedback(text, progress) {
  if (!dwellEl.box) {
    dwellEl.box = document.getElementById('gesture-dwell');
    dwellEl.label = document.getElementById('gesture-dwell-label');
    dwellEl.fill = document.getElementById('gesture-dwell-fill');
  }
  if (!dwellEl.box) return;
  dwellEl.label.textContent = text;
  dwellEl.fill.style.width = Math.round(clamp(progress, 0, 1) * 100) + '%';
  dwellEl.box.classList.add('show');
}

function hideDwellFeedback() {
  if (dwellEl.box) dwellEl.box.classList.remove('show');
}

// countOpenFingers ignora o polegar, então 4 é o máximo: a mão inteira aberta.
const OPEN_HAND_FINGERS = 4;

// Regras dos gestos de contagem de dedos. Lente e modelo se comportam igual:
//   mão entrando/saindo do quadro -> ignora (leitura não confiável)
//   0 dedos                       -> não muda nada
//   1..N dedos                    -> escolhe a opção, valendo após o dwell
//   mão aberta (4)                -> trava o que está valendo
// Devolve null quando não há nada a fazer, ou { idx, progress, fired }.
function readFingerSelection(slot, pts, optionCount, label, currentName) {
  if (!isHandFullyVisible(pts)) return null;

  const fingers = countOpenFingers(pts);

  if (fingers >= OPEN_HAND_FINGERS) {
    lockDwell(slot);
    showDwellFeedback(`🔒 ${label}: ${currentName}`, 1);
    return null;
  }

  // A contagem cai para 0 quando a mão sai do quadro, e antes isso devolvia a
  // lente para a primeira opção (o preto).
  if (fingers < 1) {
    hideDwellFeedback();
    return null;
  }

  const idx = Math.min(fingers - 1, optionCount - 1);
  const { progress, fired } = trackDwell(slot, idx);
  return { idx, progress, fired };
}

function countOpenFingers(pts) {
  if (!pts || pts.length < 21) return 0;
  let count = 0;
  if (pts[HM.indexTip][1] < pts[HM.indexPIP][1]) count++;
  if (pts[HM.middleTip][1] < pts[HM.middlePIP][1]) count++;
  if (pts[HM.ringTip][1] < pts[HM.ringPIP][1]) count++;
  if (pts[HM.pinkyTip][1] < pts[HM.pinkyPIP][1]) count++;
  return count;
}

function handXNormalized(pts) {
  if (!pts || pts.length < 21) return 0.5;
  const wrist = pts[HM.wrist];
  const middleMcp = pts[HM.middleMCP];
  return (wrist[0] + middleMcp[0]) / 2 / (video ? video.videoWidth : 640);
}

function frameColorFromPosition(xNorm) {
  xNorm = clamp(xNorm, 0, 1);
  const idx = xNorm * (FRAME_COLORS_RAINBOW.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, FRAME_COLORS_RAINBOW.length - 1);
  const t = idx - lo;
  const c0 = FRAME_COLORS_RAINBOW[lo];
  const c1 = FRAME_COLORS_RAINBOW[hi];
  const r = Math.round(c0.r + (c1.r - c0.r) * t);
  const g = Math.round(c0.g + (c1.g - c0.g) * t);
  const b = Math.round(c0.b + (c1.b - c0.b) * t);
  return { r, g, b, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}` };
}

function colorAtPosition(xNorm) {
  xNorm = clamp(xNorm, 0, 1);
  const idx = xNorm * (FRAME_COLORS_RAINBOW.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, FRAME_COLORS_RAINBOW.length - 1);
  const t = idx - lo;
  const c0 = FRAME_COLORS_RAINBOW[lo];
  const c1 = FRAME_COLORS_RAINBOW[hi];
  return `rgb(${Math.round(c0.r + (c1.r - c0.r) * t)},${Math.round(c0.g + (c1.g - c0.g) * t)},${Math.round(c0.b + (c1.b - c0.b) * t)})`;
}

function midpoint(a, b) {
  return a.clone().add(b).multiplyScalar(0.5);
}

function eyeMidpoint(pts, inner, outer) {
  return midpoint(toVec3(pts, inner), toVec3(pts, outer));
}

function toPixels(landmarks, v) {
  const w = v.videoWidth, h = v.videoHeight;
  return landmarks.map(l => [l.x * w, l.y * h, l.z * w]);
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

function showGestureStatus(msg) {
  const el = document.getElementById('hand-gesture-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}

// ── GUIA DOS GESTOS NA PRÓPRIA TELA (v4.32.0) ───────────────────────────────
//
// O guia existia só em papel (onboarding.html -> onboarding_new3.pdf). Numa
// vitrine isso não funciona: a criança chega andando, olha a tela por alguns
// segundos e vai embora — ninguém vai ler um cartaz para depois voltar. Então o
// guia passa a viver DENTRO do provador.
//
// Ele não é um tutorial de passar slide: cada dica sai da tela quando a pessoa
// EXECUTA aquele gesto de verdade. Quem já sabe nunca vê a dica seguinte parada
// esperando, e quem não sabe fica com a instrução na frente até conseguir.
//
// Os passos são marcados como feitos INDEPENDENTEMENTE um do outro, e a tela
// mostra o primeiro que ainda falta. Assim, se a criança começar pela cor da
// lente, esse passo já conta como aprendido em vez de ficar cobrando dela a
// ordem que o guia imaginou.
//
// Recomeça do zero quando a tela fica vazia — o gatilho é ausência de rosto, e
// não um "já mostrei uma vez". Na vitrine as crianças se trocam o tempo todo e
// cada uma precisa ver desde o começo.
window.GUIA = {
  enabled: true,
  reiniciarMs: 4000, // sem nenhum rosto por este tempo -> volta ao primeiro passo
  fimMs: 5000,       // quanto tempo a última dica (informativa) fica na tela
};

// O texto sai do onboarding.html, encurtado para ser lido de passagem: título
// = o que fazer com o corpo, subtítulo = o que aquilo muda nos óculos.
const PASSOS_GUIA = [
  { id: 'modelo', emoji: '👋', txt: 'Mostre 1, 2 ou 3 dedos', sub: 'com a mão direita — troca o modelo' },
  { id: 'lente',  emoji: '🕶️', txt: 'Agora a outra mão',      sub: '1, 2 ou 3 dedos — muda a lente' },
  { id: 'cor',    emoji: '✊', txt: 'Feche a mão e arraste',   sub: 'para os lados — pinta a armação' },
  { id: 'fim',    emoji: '🖐️', txt: 'Mão aberta trava',        sub: 'pronto, divirta-se!' },
];

const guia = { feitos: new Set(), desde: 0, semRostoDesde: 0, concluido: false };

function guiaReiniciar() {
  guia.feitos.clear();
  guia.desde = 0;
  guia.semRostoDesde = 0;
  guia.concluido = false;
}

// Chamado quando a pessoa realmente executou a ação — não quando ela só tentou.
function guiaFeito(id) {
  if (!window.GUIA.enabled || guia.concluido || guia.feitos.has(id)) return;
  guia.feitos.add(id);
  guia.desde = performance.now(); // o próximo passo começa a contar agora
}

function guiaPintar(p) {
  const el = document.getElementById('guia-dica');
  if (!el) return;
  const emoji = document.getElementById('guia-emoji');
  const titulo = document.getElementById('guia-titulo');
  const sub = document.getElementById('guia-sub');
  // Só escreve quando muda de passo: mexer no DOM a cada frame custaria layout
  // sem nenhum ganho, já que o texto é o mesmo.
  if (el.dataset.passo !== p.id) {
    el.dataset.passo = p.id;
    if (emoji) emoji.textContent = p.emoji;
    if (titulo) titulo.textContent = p.txt;
    if (sub) sub.textContent = p.sub;
  }
  el.classList.remove('hidden');
}

// Roda uma vez por frame, com quantos rostos o MediaPipe achou.
function guiaTick(nRostos) {
  const el = document.getElementById('guia-dica');
  if (!el) return;
  const T = window.GUIA;
  const agora = performance.now();

  if (!T.enabled) { el.classList.add('hidden'); return; }

  // Tela vazia: esconde na hora, mas só REINICIA depois de reiniciarMs. A folga
  // existe porque o rastreamento pisca (a pessoa vira o rosto, alguém passa na
  // frente); sem ela o guia voltaria ao passo 1 no meio do uso.
  if (nRostos === 0) {
    if (!guia.semRostoDesde) guia.semRostoDesde = agora;
    if (agora - guia.semRostoDesde > T.reiniciarMs) guiaReiniciar();
    el.classList.add('hidden');
    return;
  }
  guia.semRostoDesde = 0;

  if (guia.concluido) { el.classList.add('hidden'); return; }
  if (!guia.desde) guia.desde = agora;

  const p = PASSOS_GUIA.find(x => !guia.feitos.has(x.id));
  if (!p) { guia.concluido = true; el.classList.add('hidden'); return; }

  // O último passo não tem gesto próprio para detectar (travar é justamente
  // "parar de fazer gesto"), então ele sai sozinho depois de fimMs.
  if (p.id === 'fim' && agora - guia.desde > T.fimMs) {
    guia.concluido = true;
    el.classList.add('hidden');
    return;
  }

  guiaPintar(p);
}

// Exposto para ajuste ao vivo e diagnóstico pelo console, no mesmo espírito de
// window.OCC / window.GEST / diagAstes. PASSOS_GUIA é `const`, e const de script
// clássico NÃO vira propriedade de window sozinho — daí a atribuição explícita.
//
// ATENÇÃO: script.js é carregado com `type="module"` (ver index.html), e em
// módulo NADA declarado no topo vira propriedade de window — nem `function`,
// nem `const`. É por isso que tudo que precisa ser alcançado do console ou dos
// testes tem de ser atribuído a window na mão, como já era o caso de diagAstes.
window.PASSOS_GUIA = PASSOS_GUIA;
window.guiaTick = guiaTick;
window.guiaFeito = guiaFeito;
window.guiaReiniciar = guiaReiniciar;
window.guiaEstado = function () {
  const p = PASSOS_GUIA.find(x => !guia.feitos.has(x.id));
  return {
    feitos: [...guia.feitos],
    passoAtual: p ? p.id : null,
    concluido: guia.concluido,
    semRostoHa: guia.semRostoDesde ? Math.round(performance.now() - guia.semRostoDesde) : 0,
  };
};
function hideGestureStatus() {
  const el = document.getElementById('hand-gesture-status');
  if (el) el.classList.remove('show');
}

function updateStyleMatrix(activeStyle) {
  document.querySelectorAll('#style-matrix .style-item').forEach(item => {
    item.classList.toggle('active', item.dataset.style === activeStyle);
  });
}

function updateNeedleColor(xNorm) {
  const needle = document.getElementById('color-needle');
  if (needle) {
    needle.style.backgroundColor = colorAtPosition(xNorm);
    needle.style.boxShadow = `0 0 12px ${colorAtPosition(xNorm)}`;
  }
}

const MODEL_CACHE = {};
function getModelEntry(style) { return MODEL_CACHE[style]; }
const MODEL_URLS = {
  square: 'core/assets/models/square.glb',
  aviator: 'core/assets/models/aviator.glb',
  cateye: 'core/assets/models/cateye.glb',
};
let gltfLoader = null;
function getLoader() {
  if (!gltfLoader) gltfLoader = new GLTFLoader();
  return gltfLoader;
}

async function loadAllModels() {
  const loader = getLoader();
  const entries = Object.entries(MODEL_URLS);
  await Promise.all(entries.map(([key, url]) => {
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        const gltfScene = gltf.scene;
        const hasArm = [...gltfScene.children].some(c => {
          let found = false;
          c.traverse(m => {
            if (m.isMesh) {
              const n = (m.name || '').toLowerCase();
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) found = true;
            }
          });
          return found;
        });
        if (hasArm) {
          const hidden = [];
          gltfScene.traverse(c => {
            if (c.isMesh) {
              const n = (c.name || '').toLowerCase();
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) {
                hidden.push(c);
                c.visible = false;
              }
            }
          });
          const box = new THREE.Box3().setFromObject(gltfScene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          hidden.forEach(c => c.visible = true);
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1;
          MODEL_CACHE[key] = { scene: gltfScene, normFactor };
        } else {
          const box = new THREE.Box3().setFromObject(gltfScene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1;
          MODEL_CACHE[key] = { scene: gltfScene, normFactor };
        }
        resolve();
      }, undefined, reject);
    });
  }));
}

// modelMinZ/modelMaxZ são a profundidade do MODELO INTEIRO, não desta malha. É
// obrigatório: no cateye as astes vivem numa primitiva separada, cuja própria
// profundidade é só o pedaço de trás — medindo a si mesma, o limiar cairia dentro
// da aste e cortaria fora quase toda ela.
// geoHalfW tem de vir em coordenadas de GEOMETRIA, as mesmas de posAttr (ver o
// comentário em buildFromModel sobre o bug de unidade do corte antigo).
function splitFrameMesh(mesh, frameMat, leftMat, rightMat, geoHalfW, modelMinZ, modelMaxZ) {
  const geo = mesh.geometry;
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const uvAttr = geo.getAttribute('uv');
  const idx = geo.getIndex();
  if (!posAttr || !idx || idx.count < 3) return null;

  const minZ = modelMinZ;
  const maxZ = modelMaxZ;

  // Aste é a parte que corre PARA TRÁS da armação — não "o terço lateral". O
  // corte antigo era por X (|x| > 0.32 da meia-largura), e medindo os três GLBs
  // isso punha na fatia chamada de "aste" 37% de todos os triângulos, dos quais
  // ~60% eram aro da lente. Apagar essa fatia deformava a armação, então o
  // apagamento nunca pôde ser agressivo o bastante para a aste sumir de verdade.
  //
  // Agora o critério primário é a profundidade (é isso que distingue aste de aro),
  // e o X só decide de que lado ela está. O limiar vive em TEMPLE.cutZ e cai no
  // meio de um platô medido nos três modelos — ver o comentário lá.
  const zLim = maxZ - (maxZ - minZ) * window.TEMPLE.cutZ;
  const xGuard = geoHalfW * 0.25;
  const leftTris = [], frameTris = [], rightTris = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const avgX = (posAttr.getX(a) + posAttr.getX(b) + posAttr.getX(c)) / 3;
    const avgZ = (posAttr.getZ(a) + posAttr.getZ(b) + posAttr.getZ(c)) / 3;
    const atras = avgZ < zLim;
    if (atras && avgX < -xGuard) leftTris.push(a, b, c);
    else if (atras && avgX > xGuard) rightTris.push(a, b, c);
    else frameTris.push(a, b, c);
  }
  // Malha sem aste alguma não é erro: no cateye as astes estão em OUTRA primitiva
  // do arquivo, e quem chama percorre todas as malhas da armação. Só a fatia do
  // meio pode sair vazia (numa malha que seja só aste), e isso também é válido.
  if (leftTris.length === 0 || rightTris.length === 0) return null;

  const IndexArr = idx.count > 65535 ? Uint32Array : Uint16Array;

  function buildRegion(tris) {
    const unique = [...new Set(tris)];
    const remap = new Map();
    unique.forEach((old, i) => remap.set(old, i));
    const p = new Float32Array(unique.length * 3);
    const n = normAttr ? new Float32Array(unique.length * 3) : null;
    const u = uvAttr ? new Float32Array(unique.length * 2) : null;
    unique.forEach((oi, ni) => {
      p[ni * 3] = posAttr.getX(oi); p[ni * 3 + 1] = posAttr.getY(oi); p[ni * 3 + 2] = posAttr.getZ(oi);
      if (n) { n[ni * 3] = normAttr.getX(oi); n[ni * 3 + 1] = normAttr.getY(oi); n[ni * 3 + 2] = normAttr.getZ(oi); }
      if (u) { u[ni * 2] = uvAttr.getX(oi); u[ni * 2 + 1] = uvAttr.getY(oi); }
    });
    const ix = new IndexArr(tris.length);
    tris.forEach((oi, i) => ix[i] = remap.get(oi));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (n) g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    if (u) g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    return g;
  }

  function regionZRange(tris) {
    let rMinZ = Infinity, rMaxZ = -Infinity;
    const seen = new Set();
    for (let i = 0; i < tris.length; i++) {
      const vi = tris[i];
      if (seen.has(vi)) continue;
      seen.add(vi);
      const z = posAttr.getZ(vi);
      if (z < rMinZ) rMinZ = z;
      if (z > rMaxZ) rMaxZ = z;
    }
    return { minZ: rMinZ, maxZ: rMaxZ };
  }

  const leftGeo = buildRegion(leftTris);
  const frameGeo = buildRegion(frameTris);
  const rightGeo = buildRegion(rightTris);
  const leftZ = regionZRange(leftTris);
  const rightZ = regionZRange(rightTris);

  const meshes = [
    { geo: leftGeo, mat: leftMat, name: 'leftTemple' },
    // Sem fatia do meio (malha que é só aste) não se cria malha vazia à toa.
    ...(frameTris.length ? [{ geo: frameGeo, mat: frameMat, name: 'frameCenter' }] : []),
    { geo: rightGeo, mat: rightMat, name: 'rightTemple' },
  ].map(({ geo: g, mat: m, name: n }) => {
    const ms = new THREE.Mesh(g, m);
    ms.position.copy(mesh.position);
    ms.quaternion.copy(mesh.quaternion);
    ms.scale.copy(mesh.scale);
    ms.frustumCulled = false;
    ms.renderOrder = 1;
    ms.name = n;
    ms.userData.isLens = false;
    return ms;
  });

  const temFrente = frameTris.length > 0;
  const leftMesh = meshes[0];
  const rightMesh = meshes[temFrente ? 2 : 1];

  return {
    leftMesh, rightMesh,
    frameMesh: temFrente ? meshes[1] : null,
    // A aste é comida DA PONTA PARA A DOBRADIÇA, como a silhueta da cabeça faz.
    // A dobradiça é o extremo FRONTAL da fatia (maxZ) e a ponta o traseiro (minZ);
    // é entre esses dois que o corte do shader corre. O pivô carrega a
    // transformação do nó do GLB e deixa a malha com transformação neutra, de modo
    // que o `position.z` que chega ao shader seja o Z cru da geometria — o mesmo
    // em que estes dois extremos foram medidos.
    leftPivot: envolverEmPivo(leftMesh, leftZ.maxZ, leftZ.minZ),
    rightPivot: envolverEmPivo(rightMesh, rightZ.maxZ, rightZ.minZ),
    leftZ, rightZ,
  };
}

// Põe a malha dentro de um grupo que herda a transformação dela, deixando a malha
// com transformação neutra. É o que garante que o `position.z` visto pelo shader
// do corte seja o Z cru da geometria, e não o Z já torcido pela posição/rotação/
// escala do nó do GLB — que varia de modelo para modelo.
//
// (Até o v4.30.0 este pivô existia para poder escalar mesh.scale.z sem brigar com
// a transformação do nó. O encurtamento por escala saiu no v4.31.0, mas o pivô
// continua valendo pelo motivo acima e por manter centroNaCena medindo um
// referencial que nunca é tocado.)
function envolverEmPivo(ms, hingeZ, tipZ) {
  const pivo = new THREE.Group();
  pivo.position.copy(ms.position);
  pivo.quaternion.copy(ms.quaternion);
  pivo.scale.copy(ms.scale);
  pivo.frustumCulled = false;
  pivo.renderOrder = 1;

  ms.position.set(0, 0, 0);
  ms.quaternion.identity();
  ms.scale.set(1, 1, 1);
  pivo.add(ms);

  ms.userData.hingeZ = hingeZ;
  ms.userData.tipZ = tipZ;
  ms.userData.pivo = pivo;
  return pivo;
}

// CORTE DA ASTE (v4.31.0). O encurtamento era `mesh.scale.z = k`, e escalar
// COMPRIME a aste em vez de cortá-la: o Z encolhe, o Y não. Medindo os GLB, a
// aste é RETA nos primeiros 80% (queda em Y = 0.0000) e só dobra nos últimos 20%
// — a ponta que passa atrás da orelha, que cai 15,6% do comprimento. Comprimindo,
// a proporção Y/Z da peça inteira salta de 0.24 para 1.58 no square e para 6.38
// no cateye: de DEITADA para EM PÉ. Era exatamente isso o risco vertical que
// aparecia colado na dobradiça com o rosto de frente — a ponta retorcida
// espremida contra a armação, não uma aste comprida demais.
//
// Uma cabeça de verdade não comprime a aste: ela TAPA a aste da ponta para a
// dobradiça. Então a aste passa a ser CORTADA, não escalada — o pedaço além do
// corte simplesmente não é desenhado. Com isso nenhum vértice se move, a
// distorção fica impossível por construção, o pedaço visível fica no lugar
// geométrico certo, e a ponta reaparece sozinha quando o corte recua o bastante.
//
// O corte é em Z de MODELO, dentro do shader, e não com THREE.Plane: planos do
// Three.js são em coordenadas de MUNDO e precisariam ser recalculados a cada
// frame e para cada pessoa — foi por isso que os planos antigos foram removidos
// daqui. Como cada slot chama buildFromModel e ganha os seus próprios materiais
// de aste, o corte de um rosto nunca alcança o de outro.
function prepararCorteAste(mat) {
  // O uniform mora no material para ser atualizado a cada frame sem recompilar:
  // trocar o valor é de graça, mexer em define custaria um shader novo.
  // -1e9 = nada cortado enquanto applyTempleFade não mandar o primeiro valor.
  const corte = { value: -1e9 };
  mat.userData.corteZ = corte;
  mat.onBeforeCompile = shader => {
    shader.uniforms.uCorteZ = corte;
    // position é a coordenada CRUA da geometria, a mesma em que hingeZ e tipZ
    // foram medidos — por isso o corte não depende da transformação do nó do GLB.
    shader.vertexShader = 'varying float vAsteZ;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n\tvAsteZ = position.z;'
    );
    shader.fragmentShader = 'varying float vAsteZ;\nuniform float uCorteZ;\n' + shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      '#include <clipping_planes_fragment>\n\tif ( vAsteZ < uCorteZ ) discard;'
    );
  };
  return mat;
}

function buildFromModel(style, frameColor, lensColor, lensOpacity) {
  const entry = MODEL_CACHE[style];
  if (!entry || !entry.scene) return new THREE.Group();
  const clone = entry.scene.clone(true);
  const normFactor = entry.normFactor || 1;

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  });
  const leftTempleMat = prepararCorteAste(new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  }));
  const rightTempleMat = prepararCorteAste(new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  }));
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.0, roughness: 0.7, side: THREE.DoubleSide,
  });

  const meshes = [];
  clone.traverse(c => {
    if (c.isMesh) { c.frustumCulled = false; meshes.push(c); }
  });

  let lensCount = 0, frameCount = 0;
  const frameMeshes = new Set();
  meshes.forEach(c => {
    const origMat = c.material;
    const meshName = (c.name || '').toLowerCase();
    const matName = (origMat?.name || '').toLowerCase();
    const transParent = origMat?.transparent || origMat?.alphaMode === 'BLEND' || (typeof origMat?.opacity === 'number' && origMat.opacity < 0.99);

    let isLens = c.userData.isLens;
    if (isLens === undefined) {
      if (meshName.includes('temple') || meshName.includes('arm') || meshName.includes('hastes') || meshName.includes('braço')) {
        isLens = false;
      } else if (meshName.includes('lens') || meshName.includes('lente') || meshName.includes('vidro') || meshName.includes('crystal')) {
        isLens = true;
      } else if (matName.includes('lens') || matName.includes('lente') || matName.includes('vidro') || matName.includes('crystal')) {
        isLens = true;
      } else if (transParent) {
        isLens = true;
      } else {
        isLens = false;
      }
    }
    c.material = isLens ? lensMat : frameMat;
    c.userData.isLens = isLens;
    if (isLens) lensCount++;
    else { frameCount++; frameMeshes.add(c); }
  });

  if (lensCount === 0 && frameCount > 0 && meshes.length >= 2) {
    const candidates = meshes.filter(m => {
      const name = (m.name || '').toLowerCase();
      return !name.includes('temple') && !name.includes('arm') && !name.includes('hastes') && !name.includes('braço');
    });
    if (candidates.length >= 2) {
      const sorted = candidates.map(m => {
        const box = new THREE.Box3().setFromObject(m);
        const size = box.max.clone().sub(box.min);
        return { mesh: m, volume: size.x * size.y * size.z };
      }).sort((a, b) => a.volume - b.volume);
      const nLens = Math.max(1, Math.floor(sorted.length / 2));
      sorted.slice(0, nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: lensColor, transparent: true, opacity: lensOpacity,
          metalness: 0.0, roughness: 0.7, side: THREE.DoubleSide,
        });
      });
      sorted.slice(nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide });
        frameMeshes.add(mesh);
      });
    }
  }

  meshes.forEach(m => { m.renderOrder = 1; m.depthTest = true; m.scale.z = 1.25; });

  const modelBox = new THREE.Box3().setFromObject(clone);
  const modelHalfW = (modelBox.max.x - modelBox.min.x) * 0.5;

  // Medidas do modelo em coordenadas de GEOMETRIA, que é onde o corte trabalha.
  // ATENÇÃO: não usar modelHalfW (vem de Box3.setFromObject) para comparar com
  // posAttr.getX(). Era esse o bug do corte antigo: setFromObject já aplica a
  // escala do node do GLB, então o limiar saía centenas de vezes maior que as
  // coordenadas cruas, a condição por X nunca era verdadeira e TODO modelo caía no
  // fallback por Z — que cortava a 60% da profundidade e só pegava a metade de
  // trás da aste. A metade da frente ficava com a armação e nunca era apagada:
  // era isso que fazia "a aste oposta não sumir".
  // Todas as primitivas destes GLBs dividem o mesmo node, então unir as caixas das
  // geometrias direto é válido.
  let modelMinZ = Infinity, modelMaxZ = -Infinity;
  let modelMinX = Infinity, modelMaxX = -Infinity;
  frameMeshes.forEach(m => {
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const bb = m.geometry.boundingBox;
    modelMinZ = Math.min(modelMinZ, bb.min.z);
    modelMaxZ = Math.max(modelMaxZ, bb.max.z);
    modelMinX = Math.min(modelMinX, bb.min.x);
    modelMaxX = Math.max(modelMaxX, bb.max.x);
  });
  const geoHalfW = (modelMaxX - modelMinX) * 0.5;

  // Antes só a MAIOR malha era cortada. No cateye a maior é só a frente, e as
  // astes ficam noutra primitiva — que nunca era tocada, então lá o apagamento da
  // aste de trás não tinha como funcionar de jeito nenhum. Agora percorre todas, e
  // cada lado acumula suas astes numa lista (um modelo pode trazer mais de uma).
  const astesEsq = [], astesDir = [];
  Array.from(frameMeshes).forEach(m => {
    const split = splitFrameMesh(
      m, frameMat, leftTempleMat, rightTempleMat, geoHalfW, modelMinZ, modelMaxZ
    );
    if (!split) return; // malha sem aste: fica inteira, como estava
    const parent = m.parent;
    parent.remove(m);
    // Entram os PIVÔS, não as malhas: é o pivô que carrega a transformação do nó
    // do GLB, e a malha por dentro dele fica livre para encurtar em Z.
    parent.add(split.leftPivot);
    parent.add(split.rightPivot);
    frameMeshes.delete(m);
    // A fatia do meio pode sair vazia se a malha for só aste (caso do cateye).
    if (split.frameMesh) {
      parent.add(split.frameMesh);
      frameMeshes.add(split.frameMesh);
    }
    astesEsq.push(split.leftMesh);
    astesDir.push(split.rightMesh);
  });

  // Aqui existiam planos de corte para aparar a ponta das astes. Planos do
  // Three.js são em coordenadas de MUNDO, não do modelo, então eles cortavam num
  // ponto fixo da cena — e com mais de uma pessoa cortariam no lugar errado.
  // Quem esconde a aste hoje é a máscara da cabeça (ver updateOccluder).

  const frameMats = [];
  clone.traverse(c => {
    if (c.isMesh && !c.userData.isLens && c.name !== 'leftTemple' && c.name !== 'rightTemple')
      frameMats.push(c.material);
  });

  const box = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const centerOffset = new THREE.Vector3().copy(center).negate();
  const centered = new THREE.Group();
  centered.position.copy(centerOffset);
  centered.add(clone);

  const normGroup = new THREE.Group();
  normGroup.frustumCulled = false;
  normGroup.renderOrder = 1;
  normGroup.scale.set(normFactor, normFactor, normFactor);
  normGroup.add(centered);

  const wrapper = new THREE.Group();
  wrapper.frustumCulled = false;
  wrapper.renderOrder = 1;
  wrapper.userData.frameMaterials = frameMats;
  wrapper.userData.frameMat = frameMat;
  wrapper.userData.leftTempleMat = leftTempleMat;
  wrapper.userData.rightTempleMat = rightTempleMat;
  const bSize = new THREE.Vector3();
  box.getSize(bSize);
  wrapper.userData.templeLen = bSize.z * 0.5;
  // Metade da profundidade do modelo, já em unidades normalizadas: é o recuo
  // que põe as lentes sobre os olhos (ver o cálculo de zOffset em runPrediction).
  wrapper.userData.depthHalf = bSize.z * 0.5 * normFactor;
  wrapper.userData.halfW = bSize.x * 0.5;
  wrapper.userData.halfH = bSize.y * 0.5;
  // Listas, e não uma malha por lado: um modelo pode guardar a aste em mais de uma
  // primitiva (o cateye guarda). Vazias = modelo que não se deixou cortar, e aí
  // quem esconde a aste continua sendo só a máscara.
  wrapper.userData.astesEsq = astesEsq;
  wrapper.userData.astesDir = astesDir;
  // Aqui ficavam leftHingeZ/rightHingeZ e templeGrow, do crescimento da aste
  // (v4.25.0). O crescimento foi desligado no v4.25.1 porque a ponta escapava, e
  // medindo os GLBs a aste tem ~70% da profundidade do modelo: ela nunca foi
  // curta, era a máscara que a engolia. Estado morto, removido.
  wrapper.add(normGroup);
  return wrapper;
}

// ── Slots de rosto ──────────────────────────────────────────────────────────

function disposeObject3D(obj) {
  obj.traverse(c => {
    if (c.isMesh) {
      c.geometry && c.geometry.dispose();
      c.material && c.material.dispose();
    }
  });
}

// Geometria da máscara: esfera de raio 1 com a SEÇÃO HORIZONTAL empurrada para
// perto de um quadrado arredondado (superelipse), mantendo o perfil vertical
// redondo. Vista de cima, uma cabeça é bem mais caixa que círculo: com círculo a
// máscara perde profundidade rápido nas laterais, que é justo por onde as astes
// correm — e foi para compensar isso que o rx tinha sido inflado a 1.10, o que
// acabou engolindo as astes. Corrigir a forma é o que permite o rx ser realista.
// Cache por expoente para dar ajuste ao vivo sem recriar malha a cada frame.
const _geoCabeca = new Map();

function geometriaCabeca(p) {
  const chave = Math.round(p * 100) / 100;
  if (_geoCabeca.has(chave)) return _geoCabeca.get(chave);

  const geo = new THREE.SphereGeometry(1, 32, 24);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue; // polos: nada a deformar
    // Leva a direção (x,z) do círculo até a borda da superelipse. p = 2 devolve a
    // esfera original; p maior deixa a lateral mais reta.
    const norma = Math.pow(
      Math.pow(Math.abs(x / r), p) + Math.pow(Math.abs(z / r), p), 1 / p
    );
    const k = 1 / Math.max(norma, 1e-6);
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  _geoCabeca.set(chave, geo);
  return geo;
}

function createFaceSlot() {
  // Máscara da cabeça: invisível na tela (colorWrite:false) mas escreve
  // profundidade, escondendo o que estiver atrás dela. renderOrder entre o vídeo
  // de fundo (0) e os óculos (1).
  const occluder = new THREE.Mesh(
    geometriaCabeca(window.OCC.lados),
    new THREE.MeshBasicMaterial({ colorWrite: false })
  );
  occluder.renderOrder = 0.5;
  occluder.visible = false;
  scene.add(occluder);

  const slot = {
    glasses: buildFromModel(currentStyle, currentColor, currentLensColor, currentLensOpacity),
    occluder,
    motion: {
      readyPos: false,
      readyRot: false,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      prev: new THREE.Vector3(),
    },
    anchor: new THREE.Vector3(), // meio dos olhos no frame anterior
    opEsq: 1,                    // opacidade das astes: a de tras e apagada ao virar
    opDir: 1,
    templeDif: 0,                // diferença de profundidade entre as astes (diagnóstico)
    inUse: false,
  };
  slot.glasses.visible = false;
  scene.add(slot.glasses);
  faceSlots.push(slot);
  return slot;
}

function hideSlot(slot) {
  slot.glasses.visible = false;
  slot.occluder.visible = false;
  slot.motion.readyPos = false;
  slot.motion.readyRot = false;
  slot.inUse = false;
}

// O MediaPipe não garante que os rostos venham na mesma ordem a cada frame, e
// não dá um identificador por pessoa. Sem casar rosto com slot, os óculos
// pulariam de uma criança para outra. Casamos pelo mais próximo do frame
// anterior, com uma folga proporcional ao tamanho do rosto.
function matchSlot(eMid, fW, taken) {
  let best = null;
  let bestDist = Infinity;
  for (const slot of faceSlots) {
    if (taken.has(slot) || !slot.inUse) continue;
    const d = slot.anchor.distanceTo(eMid);
    if (d < bestDist) { bestDist = d; best = slot; }
  }
  if (best && bestDist < fW * 1.2) return best;

  for (const slot of faceSlots) {
    if (!taken.has(slot) && !slot.inUse) return slot;
  }
  if (faceSlots.length < MAX_FACES) return createFaceSlot();
  return null;
}

// Diagnóstico pelo console: diz se as astes de cada modelo puderam ser separadas
// da armação. É essa separação que permite apagar a aste de trás; sem ela, aquele
// modelo depende só da máscara para escondê-la.
// Devolve os dados além de imprimir, para poder ser conferido por script.
window.diagAstes = function () {
  const res = STYLES.map(estilo => {
    // Modelo ainda não carregado dá um grupo vazio, o que antes era relatado como
    // "não separou" — falso negativo que confundia o diagnóstico com o defeito.
    if (!MODEL_CACHE[estilo] || !MODEL_CACHE[estilo].scene) {
      console.log(`[diag] ${estilo}: modelo ainda NAO CARREGADO (rode de novo em alguns segundos)`);
      return { estilo, carregado: false };
    }
    const g = buildFromModel(estilo, currentColor, currentLensColor, currentLensOpacity);
    const contaTris = lista => (lista || []).reduce((s, m) => {
      const i = m.geometry.getIndex();
      return s + (i ? i.count / 3 : 0);
    }, 0);
    const todas = [...(g.userData.astesEsq || []), ...(g.userData.astesDir || [])];
    // Extremos do lado INTEIRO: a dobradiça é o Z mais frontal e a ponta o mais
    // traseiro, somando todas as malhas daquele lado (o cateye tem duas). É entre
    // esses dois que o corte do shader corre — ver applyTempleFade.
    const faixa = lista => {
      let hinge = -Infinity, tip = Infinity;
      (lista || []).forEach(m => {
        if (typeof m.userData.hingeZ === 'number') hinge = Math.max(hinge, m.userData.hingeZ);
        if (typeof m.userData.tipZ === 'number') tip = Math.min(tip, m.userData.tipZ);
      });
      return { hinge, tip, comp: hinge - tip };
    };
    const d = {
      estilo, carregado: true,
      malhasEsq: (g.userData.astesEsq || []).length,
      malhasDir: (g.userData.astesDir || []).length,
      trisEsq: contaTris(g.userData.astesEsq),
      trisDir: contaTris(g.userData.astesDir),
      // Sem pivô o `position.z` que chega ao shader viria torcido pela
      // transformação do nó do GLB, e o corte cairia no lugar errado.
      pivo: todas.length > 0 && todas.every(m => !!m.userData.pivo),
      faixaEsq: faixa(g.userData.astesEsq),
      faixaDir: faixa(g.userData.astesDir),
      // Sem o uniform do corte a aste volta a aparecer inteira em qualquer ângulo.
      corte: !!(g.userData.leftTempleMat && g.userData.leftTempleMat.userData.corteZ
        && g.userData.rightTempleMat && g.userData.rightTempleMat.userData.corteZ),
    };
    d.ok = d.malhasEsq > 0 && d.malhasDir > 0;
    // DESENHA um frame com os materiais da aste. O corte vive num shader remendado
    // à mão (prepararCorteAste), e GLSL quebrado não falha no JS: o Three.js só
    // imprime "THREE.WebGLProgram: Shader Error" no console e a aste some da tela.
    // Sem este passo o diagnóstico e os testes passariam com a aste invisível.
    //
    // Tem de ser render(), e não compile(): desde o r155 o Three.js adia a
    // checagem de erro do shader para o primeiro USO do programa, então
    // compile() liga e linka sem nunca relatar o erro.
    d.compilou = !!(renderer && camera && scene);
    if (d.compilou) {
      scene.add(g);
      renderer.render(scene, camera);
      scene.remove(g);
    }
    console.log(`[diag] ${estilo}: ${d.ok
      ? `astes separadas - esq ${d.malhasEsq} malha(s)/${d.trisEsq} tri, dir ${d.malhasDir}/${d.trisDir} - apagamento ativo, pivo ${d.pivo ? 'OK' : 'FALTANDO'}`
      : 'NAO separou - aste de tras fica so por conta da mascara'}`);
    disposeObject3D(g);
    return d;
  });
  return res;
};

function rebuildGlasses() {
  if (!scene) return;
  faceSlots.forEach(slot => {
    if (slot.glasses) {
      scene.remove(slot.glasses);
      disposeObject3D(slot.glasses);
    }
    slot.glasses = buildFromModel(currentStyle, currentColor, currentLensColor, currentLensOpacity);
    if (slot.motion.readyPos) {
      slot.glasses.position.copy(slot.motion.pos);
      slot.glasses.quaternion.copy(slot.motion.quat);
      slot.glasses.scale.copy(slot.motion.scale);
    }
    slot.glasses.visible = isActive && slot.inUse;
    scene.add(slot.glasses);
  });
}

// Põe a imagem na proporção da TELA cortando o que não cabe, em vez de esticar.
//
// O truque é não mexer no sistema de coordenadas da cena: ele continua sendo
// PIXELS DE VÍDEO, que é o que toda a matemática do rosto usa
// (landmark.x * videoWidth). O que muda é só o que a câmera ENXERGA — a janela
// ortográfica encolhe até ter a proporção da tela, e o que fica de fora dela
// simplesmente não aparece. Assim nenhuma conta de posicionamento, escala ou
// profundidade precisou ser tocada para a tela em pé funcionar.
//
// O sprite do vídeo continua com o tamanho inteiro (vw x vh) de propósito: é a
// câmera que recorta, não ele. Encolher o sprite deixaria borda vazia na tela.
function ajustarEnquadramento() {
  if (!camera || !renderer || !video) return;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  const cont = document.getElementById('threejs-container');
  const tw = (cont && cont.clientWidth) || window.innerWidth || vw;
  const th = (cont && cont.clientHeight) || window.innerHeight || vh;

  const propVideo = vw / vh;
  const propTela = tw / th;

  // Um lado sempre cabe inteiro e o outro é cortado. Tela mais estreita que o
  // vídeo (o caso da vitrine em pé) corta as laterais; tela mais larga corta em
  // cima e embaixo. Nunca sobra barra preta, e nunca estica.
  let visW, visH;
  if (propTela < propVideo) { visH = vh; visW = vh * propTela; }
  else { visW = vw; visH = vw / propTela; }

  camera.left = -visW / 2;
  camera.right = visW / 2;
  camera.top = visH / 2;
  camera.bottom = -visH / 2;
  camera.updateProjectionMatrix();

  // O canvas passa a ter a resolução da TELA, não a do vídeo. É isso que faz o
  // `width:100%; height:100%` do CSS parar de deformar: agora as duas proporções
  // são a mesma, então esticar para 100% não distorce mais nada.
  renderer.setSize(tw, th);

  ENQ.visW = visW; ENQ.visH = visH;
  ENQ.fracX = visW / vw;
  ENQ.fracY = visH / vh;
}

// Converte um x normalizado do VÍDEO (0..1) para x normalizado da TELA (0..1),
// levando em conta o pedaço cortado. Sem crop os dois são a mesma coisa, então
// numa tela deitada nada muda de comportamento.
function xNaTela(xVideo) {
  const inicio = 0.5 - ENQ.fracX / 2;
  return clamp((xVideo - inicio) / Math.max(ENQ.fracX, 1e-4), 0, 1);
}
// Módulo não põe nada em window sozinho (ver o bloco do guia mais abaixo).
window.xNaTela = xNaTela;
window.ajustarEnquadramento = ajustarEnquadramento;

async function initScene(videoEl) {
  video = videoEl;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  await loadAllModels();

  camera = new THREE.OrthographicCamera(-vw/2, vw/2, vh/2, -vh/2, 0.1, 5000);
  camera.position.set(0, 0, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh);
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const container = document.getElementById('threejs-container');
  container.appendChild(renderer.domElement);
  // Só depois de estar no DOM o container tem tamanho para medir.
  ajustarEnquadramento();

  scene = new THREE.Scene();

  videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.wrapS = THREE.ClampToEdgeWrapping;

  const videoEnhanceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: videoTexture },
      uBrightness: { value: 0.06 },
      uContrast: { value: 0.08 },
      uSaturation: { value: 1.08 },
      uSharpen: { value: 0.35 },
      uTexelSize: { value: new THREE.Vector2(1.0 / vw, 1.0 / vh) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uSharpen;
      uniform vec2 uTexelSize;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        color.rgb += uBrightness;
        if (uContrast > 0.0) {
          color.rgb = (color.rgb - 0.5) / (1.0 - uContrast) + 0.5;
        } else {
          color.rgb = (color.rgb - 0.5) * (1.0 + uContrast) + 0.5;
        }
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(luma), color.rgb, uSaturation);
        if (uSharpen > 0.0) {
          vec4 n  = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y));
          vec4 s  = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y));
          vec4 e  = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0));
          vec4 w  = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0));
          vec4 blur = (n + s + e + w) * 0.25;
          color.rgb += (color.rgb - blur.rgb) * uSharpen;
        }
        color.rgb = clamp(color.rgb, 0.0, 1.0);
        gl_FragColor = color;
      }
    `,
    depthWrite: false,
  });

  videoSprite = new THREE.Sprite(videoEnhanceMaterial);
  videoSprite.center.set(0.5, 0.5);
  videoSprite.scale.set(vw, vh, 1);
  videoSprite.position.set(0, 0, 0);
  scene.add(videoSprite);

  scene.environment = makeEnvMap();
  scene.environmentIntensity = 0.08;

  const amb = new THREE.HemisphereLight(0xffffff, 0x8888cc, 0.8);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(0, 200, 300);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.6);
  fill.position.set(-150, 50, 150);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(80, 100, -150);
  scene.add(rim);

  // Os óculos e a máscara de cada pessoa são criados sob demanda, conforme os
  // rostos vão sendo detectados (ver createFaceSlot / matchSlot).

  const aoRedimensionar = () => {
    const vw2 = video.videoWidth || 640;
    const vh2 = video.videoHeight || 480;
    // O sprite continua do tamanho INTEIRO do vídeo; quem recorta é a câmera.
    videoSprite.scale.set(vw2, vh2, 1);
    videoSprite.position.set(0, 0, 0);
    if (videoEnhanceMaterial.uniforms) {
      videoEnhanceMaterial.uniforms.uTexelSize.value.set(1.0 / vw2, 1.0 / vh2);
    }
    ajustarEnquadramento();
  };
  window.addEventListener('resize', aoRedimensionar);
  // Girar a tela da vitrine (ou o navegador entrar em tela cheia) nem sempre
  // dispara 'resize' na hora certa; orientationchange cobre esse caso.
  window.addEventListener('orientationchange', () => setTimeout(aoRedimensionar, 100));

  function animate() {
    requestAnimationFrame(animate);
    if (videoTexture) videoTexture.needsUpdate = true;
    renderer.render(scene, camera);
  }
  animate();
}

function makeEnvMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, '#d8d8f0');
  grad.addColorStop(0.6, '#8888bb');
  grad.addColorStop(1, '#222244');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function initMediaPipe(delegate) {
  const dl = delegate || 'GPU';
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.7';
  try {
    // Legendas lúdicas em vez das técnicas: quem lê isto é uma criança parada na
    // calçada, não quem programou. Cada frase continua dizendo o que está mesmo
    // acontecendo — só que na linguagem do provador, não na do console.
    loadingText.textContent = '🤖 Acordando o provador...';
    const vision = await withTimeout(
      import(`${VISION_CDN}/vision_bundle.mjs`), 15000, 'import vision_bundle'
    );

    loadingText.textContent = '🔧 Montando a bancada da ótica... 👓';
    const fileset = await withTimeout(
      vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`), 15000, 'FilesetResolver'
    );

    // O (GPU)/(CPU) fica no fim, discreto: serve para diagnóstico à distância
    // sem estragar a frase para quem está do lado de fora do vidro.
    loadingText.textContent = `👀 Aprendendo a enxergar rostos... (${dl})`;
    faceLandmarker = await withTimeout(
      vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
          delegate: dl
        },
        runningMode: 'VIDEO',
        numFaces: MAX_FACES,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      }), 20000, 'FaceLandmarker'
    );

    loadingText.textContent = '🖐️ Aprendendo a ler as suas mãos... 🤚';
    handLandmarker = await withTimeout(
      vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
          delegate: dl
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }), 20000, 'HandLandmarker'
    );

    return true;
  } catch (e) {
    console.warn(`MediaPipe ${dl} falhou:`, e.message || e);
    if (dl === 'GPU') {
      console.log('Tentando fallback para CPU...');
      return initMediaPipe('CPU');
    }
    console.error('Falha ao carregar MediaPipe:', e);
    return false;
  }
}

function schedulePrediction() {
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(runPrediction);
  } else {
    requestAnimationFrame(runPrediction);
  }
}

// Mede o rosto e monta os eixos da cabeça a partir dos landmarks. Fica separado
// do posicionamento porque o resultado é usado antes, para descobrir a qual
// pessoa (slot) este rosto pertence.
function computeFaceFrame(pts) {
  const lEye = eyeMidpoint(pts, LM.leftEyeInner, LM.leftEyeOuter);
  const rEye = eyeMidpoint(pts, LM.rightEyeInner, LM.rightEyeOuter);
  const nose = toVec3(pts, LM.noseBridge);
  const nTip = toVec3(pts, LM.noseTip);
  const fHead = toVec3(pts, LM.forehead);
  const chn = toVec3(pts, LM.chin);
  const lTmp = toVec3(pts, LM.leftTemple);
  const rTmp = toVec3(pts, LM.rightTemple);
  const lChk = toVec3(pts, LM.leftCheek);
  const rChk = toVec3(pts, LM.rightCheek);

  const eMid = midpoint(lEye, rEye);
  const fW = Math.max(lEye.distanceTo(rEye), lTmp.distanceTo(rTmp), lChk.distanceTo(rChk));
  const fH = fHead.distanceTo(chn);

  const yAxis = fHead.clone().sub(chn).normalize();
  const xRaw = lTmp.clone().sub(rTmp).normalize();
  const zAxis = xRaw.clone().cross(yAxis).normalize();
  if (zAxis.dot(nTip.clone().sub(nose).normalize()) < 0) zAxis.negate();
  const xAxis = yAxis.clone().cross(zAxis).normalize();

  // Profundidade do nariz normalizada pelo tamanho do rosto: adimensional, ao
  // contrário do valor em pixels, que cresce junto com a proximidade da câmera.
  const noseDepth = (nTip.z - nose.z) / Math.max(fW, 1);

  return { eMid, fW, fH, xAxis, yAxis, zAxis, noseDepth };
}

// Máscara invisível da cabeça desta pessoa: escreve profundidade sem pintar,
// então a GPU descarta sozinha a aste que ficar atrás da cabeça.
function updateOccluder(slot, f) {
  const O = window.OCC;
  const occluder = slot.occluder;

  // Recuo do centro = raio de profundidade + folga. Assim a frente do elipsoide
  // fica sempre frontGap x fW atrás do plano dos olhos, independentemente do
  // tamanho da máscara: ela nunca alcança a armação, e não precisa ser cortada.
  // Aqui a folga crescia com o giro (TEMPLE.reveal * slot.templeReveal): a máscara
  // recuava para descobrir a aste da frente. Só que recuar descobre os DOIS lados,
  // então precisava de um segundo mecanismo para reesconder a de trás, e os dois
  // brigavam. Com a máscara mais estreita que a linha das astes o recuo não é mais
  // necessário: a aste de cá nunca entra na máscara, e a de trás é apagada por
  // applyTempleFade. Folga fixa, um mecanismo para cada trabalho.
  const back = (O.rz + O.frontGap) * f.fW;
  occluder.position.copy(f.eMid).addScaledVector(f.zAxis, -back);
  occluder.quaternion.setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(f.xAxis, f.yAxis, f.zAxis)
  );
  occluder.scale.set(O.rx * f.fW, O.ry * f.fH, O.rz * f.fW);
  occluder.visible = true;

  // Permite mexer em OCC.lados pelo console: troca a malha só quando o valor muda.
  const geoAtual = geometriaCabeca(O.lados);
  if (occluder.geometry !== geoAtual) occluder.geometry = geoAtual;

  const m = occluder.material;

  // Modo debug: pinta a máscara de vermelho para conferir posição e tamanho. Só
  // reconfigura quando o modo muda — needsUpdate por frame recompila o shader.
  if (m.userData.debugApplied !== O.debug) {
    m.userData.debugApplied = O.debug;
    if (O.debug) {
      m.colorWrite = true;
      m.transparent = true;
      m.opacity = 0.45;
      m.color.set(0xff0033);
    } else {
      m.colorWrite = false;
      m.transparent = false;
      m.opacity = 1.0;
    }
    m.needsUpdate = true;
  }
}

// Apaga a aste que ficou do lado de trás quando o rosto vira.
// splitFrameMesh já separou cada aste da armação, e cada lado tem o seu próprio
// material, então dá para sumir com um lado sem tocar no resto.
//
// Qual lado está atrás sai da posição REAL na cena, não do lado do modelo: a
// câmera olha de frente, então Z menor = mais longe. Assim não importa a convenção
// de eixos do GLB nem para que lado a pessoa virou — não há sinal para inverter
// por engano. E como a MESMA medida serve de gatilho e de intensidade, yaw, pitch,
// roll e qualquer combinação deles entram na conta sem tratamento próprio.
const _centroAste = new THREE.Vector3();

// Mede pelo PIVÔ, não pela malha: a malha encolhe, e medir nela realimentaria a
// conta (encurtar move o centro da aste -> muda a diferença de profundidade ->
// muda o encurtamento -> a aste ficaria bombeando sozinha). O pivô nunca é tocado,
// então esta medida depende só de onde a cabeça está.
function centroNaCena(mesh) {
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const ref = mesh.userData.pivo || mesh;
  return mesh.geometry.boundingBox.getCenter(_centroAste).applyMatrix4(ref.matrixWorld);
}

// Profundidade média de um lado. É média porque um lado pode ter mais de uma
// malha de aste (o cateye tem).
function mediaZ(malhas) {
  let soma = 0;
  for (const m of malhas) soma += centroNaCena(m).z;
  return soma / malhas.length;
}

function applyTempleFade(slot, f) {
  const ud = slot.glasses.userData;
  const esq = ud.astesEsq || [];
  const dir = ud.astesDir || [];
  const matEsq = ud.leftTempleMat;
  const matDir = ud.rightTempleMat;
  // Sem o corte em astes não há o que apagar; quem esconde a aste nesse caso
  // continua sendo só a máscara.
  if (!esq.length || !dir.length || !matEsq || !matDir) return;

  const T = window.TEMPLE;

  // Profundidade de cada lado na CENA, normalizada pela largura do rosto para a
  // conta não depender da distância da pessoa à câmera. Z maior = mais perto.
  const zEsq = mediaZ(esq);
  const zDir = mediaZ(dir);
  const dif = (zEsq - zDir) / Math.max(f.fW, 1);

  // Uma só rampa serve para os dois lados: o sinal da diferença já diz quem está
  // atrás, e o módulo diz o quanto. Nenhum limiar por eixo, nenhum caso especial —
  // é o que faz isso valer para cima, baixo, diagonal e combinações de uma vez.
  const forca = T.enabled
    ? clamp((Math.abs(dif) - T.hideStart) / Math.max(T.hideFull - T.hideStart, 1e-4), 0, 1)
    : 0;
  const atrasEhEsquerda = dif < 0;

  // QUANTO DA ASTE APARECER. f.xAxis é o eixo lateral da cabeça, então xAxis.z é o
  // seno do giro: 0 de frente, 1 de perfil. É a medida de quanto a aste saiu de
  // trás da cabeça — de frente ou só inclinado ela continua na sombra da cabeça e
  // os óculos reais mostram apenas um toco. Uma conta só cobre girar e inclinar.
  const giro = Math.abs(f.xAxis.z);
  const revelacao = T.enabled
    ? clamp((giro - T.showStart) / Math.max(T.showFull - T.showStart, 1e-4), 0, 1)
    : 1;
  const compVisivel = T.minLen + (1 - T.minLen) * revelacao;

  slot.templeDif = dif;   // exposto para o painel de ajuste e para diagnóstico
  slot.templeComp = compVisivel;

  [[esq, matEsq, 'opEsq', 'cpEsq', atrasEhEsquerda], [dir, matDir, 'opDir', 'cpDir', !atrasEhEsquerda]].forEach(
    ([malhas, mat, chave, chaveComp, estaAtras]) => {
      const alvo = estaAtras ? 1 - forca : 1;
      const atual = slot[chave];
      const novo = atual + (alvo - atual) * T.hideFade;
      slot[chave] = Math.abs(novo - alvo) < 0.01 ? alvo : novo;

      // A aste de trás encolhe ALÉM de apagar: mesmo que sobre um resto de
      // opacidade, sobra pouco comprimento e o usuário não repara. Era o pedido —
      // "se aparecer, que nem se note".
      const alvoComp = estaAtras ? compVisivel * (1 - forca) : compVisivel;
      const atualComp = slot[chaveComp] === undefined ? alvoComp : slot[chaveComp];
      slot[chaveComp] = atualComp + (alvoComp - atualComp) * T.lenFade;

      // O corte anda DA PONTA PARA A DOBRADIÇA, que é o caminho por onde a
      // silhueta da cabeça come a aste. k = 1 deixa o corte no extremo traseiro
      // (aste inteira, ponta retorcida inclusive); k = minLen o traz para perto da
      // dobradiça e a ponta deixa de ser desenhada — sobra o toco RETO que os
      // óculos reais mostram de frente. Nenhum vértice se move, então a ponta não
      // tem como ser espremida contra a armação (ver prepararCorteAste).
      //
      // Dobradiça e ponta vêm do CONJUNTO do lado, não de cada malha: no cateye a
      // aste chega em duas primitivas, em faixas de Z que não se sobrepõem, e são
      // pedaços sequenciais da MESMA aste física. Um corte só para o lado inteiro
      // as trata como a peça única que elas são.
      const k = Math.max(slot[chaveComp], 0.001);
      let hinge = -Infinity, tip = Infinity;
      malhas.forEach(mesh => {
        const h = mesh.userData.hingeZ, t = mesh.userData.tipZ;
        if (typeof h === 'number' && h > hinge) hinge = h;
        if (typeof t === 'number' && t < tip) tip = t;
      });
      if (mat.userData.corteZ && Number.isFinite(hinge) && Number.isFinite(tip)) {
        mat.userData.corteZ.value = hinge - (hinge - tip) * k;
      }

      mat.opacity = slot[chave];
      mat.depthWrite = slot[chave] > 0.5;
      malhas.forEach(mesh => { mesh.visible = slot[chave] > 0.02; });

      // Trocar `transparent` exige recompilar o shader, então só quando muda de
      // fato — fazer isso a cada frame derrubaria o desempenho.
      const precisaTransparencia = slot[chave] < 0.999;
      if (mat.transparent !== precisaTransparencia) {
        mat.transparent = precisaTransparencia;
        mat.needsUpdate = true;
      }
    }
  );
}

function updateSlotFromFace(slot, f) {
  const sc = STYLE_CONFIG[currentStyle] || STYLE_CONFIG.square;

  const wS = f.fW / CFG.refHeadWidth;
  const hS = f.fH / CFG.refFaceHeight;
  const bS = wS * 0.7 + hS * 0.3;

  // Tamanho do rosto em relação à distância de referência: 1.0 quando a largura
  // medida é igual a CFG.refHeadWidth. Só a largura (e não bS) porque a altura
  // encurta quando a cabeça inclina, o que fazia os óculos escorregarem no pitch.
  const fwNorm = f.fW / CFG.refHeadWidth;
  const depAdj = clamp(f.noseDepth * CFG.refHeadWidth * 0.06, -1, 3);

  const tScaleVal = bS * CFG.glassesScale * window.FIT.scale;
  const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal);

  // Aqui era calculado slot.templeReveal, o quanto a máscara recuava conforme o
  // yaw. Não existe mais: a máscara tem folga fixa e a aste de trás é apagada por
  // profundidade real em applyTempleFade (ver updateOccluder).

  // O wrapper é centrado no meio da armação e as astes ocupam a metade de trás,
  // então o centro recua metade da profundidade do modelo para as LENTES caírem
  // sobre os olhos. Um recuo fixo em pixels criava um braço de alavanca ao longo
  // do eixo do nariz: como o eixo gira com a cabeça, inclinar jogava os óculos
  // para a testa ou para o queixo e amplificava o ruído do rastreamento.
  const depthHalf = (slot.glasses.userData && slot.glasses.userData.depthHalf) || 0;
  const zOffset = -depthHalf * tScaleVal + (CFG.glassesDepth + depAdj + adjDistance) * fwNorm;

  const tPos = f.eMid.clone()
    .addScaledVector(f.xAxis, sc.centerX + adjLateral)
    .addScaledVector(f.yAxis, adjHeight)
    .addScaledVector(f.zAxis, zOffset);

  const rotMat = new THREE.Matrix4().makeBasis(f.xAxis, f.yAxis, f.zAxis);
  if (adjRotation !== 0) {
    rotMat.multiply(new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(adjRotation)));
  }
  const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

  // O fator do lerp é quanto do caminho até o alvo se percorre por frame: 1.0
  // pula direto (nenhum filtro), valores baixos suavizam. A base baixa segura o
  // tremor com a pessoa parada; o termo de movimento devolve resposta rápida
  // quando ela realmente se mexe.
  const m = slot.motion;
  // Movimento em LARGURAS DE ROSTO por frame, não em pixels: assim a resposta é
  // a mesma perto e longe da câmera. Em pixels, quem estava mais longe movia
  // menos e era acelerado menos, ficando mais lento onde o rosto já era menor.
  const mov = tPos.distanceTo(m.prev) / Math.max(f.fW, 1);
  m.prev.copy(tPos);

  const S = window.SMOOTH;
  const aP = clamp(S.pos + mov * S.posBoost, S.pos, S.posMax);
  // Escala com acelerador e teto próprios: o tamanho de uma pessoa não muda
  // depressa, e deixá-lo tão solto quanto a posição faria os óculos pulsar.
  const aS = clamp(S.scale + mov * S.scaleBoost, S.scale, S.scaleMax);

  if (!m.readyPos) {
    m.pos.copy(tPos);
    m.scale.copy(tScale);
    m.readyPos = true;
  } else {
    // A comparação é contra a posição já suavizada, não contra o alvo do frame
    // anterior: assim uma sequência de passos pequenos no mesmo sentido não vai
    // acumulando deriva por ficar sempre logo abaixo do limiar.
    if (tPos.distanceTo(m.pos) > S.deadZone * f.fW) {
      m.pos.lerp(tPos, aP);
    }
    m.scale.lerp(tScale, aS);
  }

  if (!m.readyRot) {
    m.quat.copy(targetQuat);
    m.readyRot = true;
  } else {
    const aR = qDelta(m.quat, targetQuat);
    if (aR > S.deadZoneRot) {
      m.quat.slerp(targetQuat, clamp(S.rot + aR * S.rotBoost, S.rot, S.rotMax));
    }
  }

  slot.glasses.position.copy(m.pos);
  slot.glasses.quaternion.copy(m.quat);
  slot.glasses.scale.copy(m.scale);
  slot.glasses.visible = true;
  slot.glasses.updateWorldMatrix(true, true);

  applyTempleFade(slot, f);

  slot.anchor.copy(f.eMid);
  slot.inUse = true;

  updateOccluder(slot, f);
}

function runPrediction() {
  if (predictionInFlight) { schedulePrediction(); return; }
  predictionInFlight = true;

  if (!faceLandmarker || !scene) {
    predictionInFlight = false;
    schedulePrediction();
    return;
  }

  try {
    const detection = faceLandmarker.detectForVideo(video, performance.now());
    const faces = detection.faceLandmarks || [];

    // O guia acompanha a presença de gente na tela: some quando não há ninguém e
    // recomeça do zero para a próxima pessoa.
    guiaTick(faces.length);

    if (faces.length > 0) {
      // Um conjunto de óculos + máscara por pessoa. Rostos que somem neste frame
      // têm o seu slot escondido logo abaixo.
      const taken = new Set();
      for (let i = 0; i < faces.length && i < MAX_FACES; i++) {
        const pts = toPixels(faces[i], video);
        const f = computeFaceFrame(pts);
        const slot = matchSlot(f.eMid, f.fW, taken);
        if (!slot) continue;
        taken.add(slot);
        updateSlotFromFace(slot, f);
      }
      faceSlots.forEach(slot => { if (!taken.has(slot)) hideSlot(slot); });

      // O scan inicial serve só para dar tempo do rastreamento estabilizar antes
      // de mostrar os óculos, e vale para a cena toda (não por pessoa).
      if (!smooth.scanCompleted) {
        if (!smooth.scanning) {
          smooth.scanning = true;
          smooth.scanFrames = [];
          scanOverlay.classList.remove('hidden');
          scanStatus.textContent = 'Escaneando...';
          scanProgressBar.style.width = '0%';
        }
        smooth.scanFrames.push(1);
        const pct = Math.min(smooth.scanFrames.length / 10, 1) * 100;
        scanProgressBar.style.width = pct + '%';
        if (smooth.scanFrames.length >= 10) {
          smooth.scanCompleted = true;
          smooth.scanning = false;
          scanOverlay.classList.add('hidden');
        } else {
          scanStatus.textContent = `${smooth.scanFrames.length}/10`;
        }
      }

      const fi = document.getElementById('face-info');
      if (fi) {
        fi.textContent = taken.size > 1 ? `${taken.size} pessoas` : 'Formato: detectado';
        fi.classList.remove('hidden');
      }
    } else {
      faceSlots.forEach(hideSlot);
      smooth.scanning = false;
      smooth.scanCompleted = false;
      smooth.scanFrames = [];
      if (!scanOverlay.classList.contains('hidden')) {
        scanOverlay.classList.add('hidden');
      }
      const fi = document.getElementById('face-info');
      if (fi) fi.classList.add('hidden');
    }

    if (handLandmarker) {
      try {
        const handResult = handLandmarker.detectForVideo(video, performance.now());
        const handLandmarks = handResult.landmarks || [];

        if (smooth.scanCompleted) {
          if (!smooth.handScanCompleted) {
            if (!smooth.handScanning) {
              smooth.handScanning = true;
              smooth.handScanFrames = 0;
              showGestureStatus('Mostre as duas mãos abertas');
            }
            if (handLandmarks.length >= 1) smooth.handScanFrames++;
            if (smooth.handScanFrames >= 15) {
              smooth.handScanCompleted = true;
              smooth.handScanning = false;
              hideGestureStatus();
              showToast('Mãos calibradas! Use gestos para controlar');
            }
            predictionInFlight = false;
            schedulePrediction();
            return;
          }

          // O MediaPipe recebe a imagem NÃO espelhada (o scaleX(-1) do #webcam e
          // do #threejs-container é só exibição). Nessa imagem a pessoa aparece
          // como se estivesse de frente para você: a mão DIREITA dela cai na
          // metade esquerda (x < 0.5) e a ESQUERDA na metade direita (x >= 0.5).
          // Daí o mapeamento: mão direita comanda armação + modelo, mão esquerda
          // comanda a lente (é o que o guia em onboarding.html documenta).
          // A metade da imagem é mais confiável que deduzir a mão pela anatomia
          // (indexMCP vs pinkyMCP), que troca de resultado com a palma virada.
          let handFrame = null; // mão direita da pessoa: cor da armação + modelo
          let handLens = null;  // mão esquerda da pessoa: cor da lente

          for (let h = 0; h < handLandmarks.length; h++) {
            const hpts = handLandmarks[h].map(l => [l.x * (video.videoWidth || 640), l.y * (video.videoHeight || 480), l.z * (video.videoWidth || 640)]);
            if (handXNormalized(hpts) < 0.5) handFrame = hpts;
            else handLens = hpts;
          }

          // ── Mão da lente: 1 = Preto, 2 = Transparente, 3 = Amarelo ────────
          if (handLens) {
            const sel = readFingerSelection(
              'lens', handLens, LENS_COLORS.length, 'Lente', LENS_COLORS[currentLensIdx].name
            );
            if (sel) {
              const opt = LENS_COLORS[sel.idx];
              if (sel.fired) {
                currentLensIdx = sel.idx;
                currentLensColor = opt.color;
                currentLensOpacity = opt.opacity;
                rebuildGlasses();
                showToast(`Lente: ${opt.name}`);
                showDwellFeedback(`Lente: ${opt.name} ✓`, 1);
                guiaFeito('lente');
              } else {
                showDwellFeedback(`Lente: ${opt.name}`, sel.progress);
              }
            }
            gestureState.lensHandFingers = countOpenFingers(handLens);
          } else {
            gestureState.lensHandFingers = 0;
          }

          // ── Mão da armação: punho fechado arrasta a barra RGB ─────────────
          if (handFrame) {
            const isClosed = isHandFullyClosed(handFrame);

            if (window.GEST.debug) {
              const tuck = (dist2D(handFrame[HM.thumbTip], handFrame[HM.middleMCP]) / handSpan(handFrame)).toFixed(2);
              showGestureStatus(`punho:${isClosed ? 'sim' : 'nao'} polegar:${tuck} dedos:${countOpenFingers(handFrame)}`);
            }

            if (isClosed) {
              if (!gestureState.frameHandClosed) {
                gestureState.frameHandClosed = true;
                const strip = document.getElementById('color-strip');
                if (strip) strip.classList.add('active');
              }
              // Medido na TELA, e não no vídeo: numa vitrine em pé as laterais
              // do vídeo estão cortadas, e a conta antiga pedia a mão em x=0.09
              // do vídeo para chegar ao vermelho — um ponto que fica FORA da
              // tela. A pessoa teria de mover a mão para onde não consegue se
              // ver. Sem corte (tela deitada) xNaTela é identidade e o gesto
              // continua exatamente como foi aprovado na câmera.
              const sensitiveX = clamp((0.47 - xNaTela(handXNormalized(handFrame))) / 0.38, 0, 1);

              const fc = frameColorFromPosition(sensitiveX);
              if (fc.hex !== currentColor) {
                currentColor = fc.hex;
                gestureState.frameColorIdx = Math.round(sensitiveX * (FRAME_COLORS_RAINBOW.length - 1));
                rebuildGlasses();
                // Só conta como aprendido quando a cor MUDOU de fato: fechar a
                // mão sem arrastar não ensina o gesto que a dica está pedindo.
                guiaFeito('cor');
              }

              const needle = document.getElementById('color-needle');
              if (needle) needle.style.left = (sensitiveX * 100) + '%';
              updateNeedleColor(sensitiveX);
              if (!window.GEST.debug) showGestureStatus('Armação: cor RGB');
            } else {
              releaseColorStrip();

              // Dedos abertos trocam o modelo: 1 = Quadrado, 2 = Aviador, 3 = Gatinho.
              const sel = readFingerSelection(
                'style', handFrame, STYLES.length, 'Modelo', STYLE_LABELS[currentStyle]
              );
              if (sel) {
                const styleId = STYLES[sel.idx];
                if (sel.fired) {
                  if (styleId !== currentStyle) {
                    currentStyle = styleId;
                    rebuildGlasses();
                    updateStyleMatrix(currentStyle);
                    showToast(`Modelo: ${STYLE_LABELS[styleId]}`);
                    guiaFeito('modelo');
                  }
                  showDwellFeedback(`Modelo: ${STYLE_LABELS[styleId]} ✓`, 1);
                } else {
                  showDwellFeedback(`Modelo: ${STYLE_LABELS[styleId]}`, sel.progress);
                }
              }
              gestureState.frameHandFingers = countOpenFingers(handFrame);
              if (!window.GEST.debug) hideGestureStatus();
            }
          } else {
            releaseColorStrip();
            if (!window.GEST.debug) hideGestureStatus();
          }

          // Sem nenhuma mão em cena não há gesto em andamento para mostrar.
          // As escolhas já aplicadas continuam valendo.
          if (!handFrame && !handLens) hideDwellFeedback();
        }
      } catch (e) { /* hand error */ }
    }
  } catch (e) {
    console.warn('Prediction error:', e);
  }

  predictionInFlight = false;
  ultimoFrameEm = Date.now(); // batimento do loop, vigiado no modo vitrine
  schedulePrediction();
}

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const webcam = document.getElementById('webcam');

const scanOverlay = document.getElementById('scan-overlay');
const scanTitle = document.getElementById('scan-title');
const scanMessage = document.getElementById('scan-message');
const scanProgressBar = document.getElementById('scan-progress-bar');
const scanStatus = document.getElementById('scan-status');

// Aqui ficava o listener dos sliders de Distância e Altura. Eles saíram no
// v4.33.0: o produto é uma tela atrás do vidro, onde ninguém alcança um slider —
// no modo vitrine eles já eram escondidos por CSS. Os valores em que estavam
// (0 e -10) viraram constantes, então o encaixe na cara continua idêntico.
// Para afinar o encaixe sem republicar, use window.FIT.scale pelo console.

function showError(title, msg) {
  loadingOverlay.classList.add('hidden');
  errorTitle.textContent = title;
  errorMessage.textContent = msg;
  errorOverlay.classList.remove('hidden');
}

function stopStream() {
  if (webcam.srcObject) {
    webcam.srcObject.getTracks().forEach(t => t.stop());
    webcam.srcObject = null;
  }
  if (renderer) {
    const container = document.getElementById('threejs-container');
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
  video = null;
  videoTexture = null;
  videoSprite = null;
  predictionInFlight = false;
  isActive = false;
  faceSlots.forEach(hideSlot);
  smooth.scanning = false;
  smooth.scanCompleted = false;
  smooth.scanFrames = [];
}

let autoRetryCount = 0;
// Na vitrine ninguem esta por perto para clicar em "tentar de novo", entao a
// reconexao nao desiste: a camera pode falhar quando o PC acorda, quando outro
// programa a toma por um instante ou quando o cabo e esbarrado.
const MAX_AUTO_RETRY = MODO_VITRINE ? Infinity : 3;
let autoStartDone = false;

async function startApp() {
  console.log('[DEBUG] startApp called');
  stopStream();
  errorOverlay.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = '📷 Ligando o espelho mágico...';

  try {
    console.log('[DEBUG] Requesting camera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    console.log('[DEBUG] Camera stream obtained');
    webcam.srcObject = stream;
    await webcam.play();
    console.log('[DEBUG] Video playing, dimensions:', webcam.videoWidth, 'x', webcam.videoHeight);
    await new Promise(r => { const c = () => { if (webcam.videoWidth > 0) r(); else requestAnimationFrame(c); }; requestAnimationFrame(c); });
  } catch (e) {
    console.error('[DEBUG] Camera error:', e.message);
    loadingOverlay.classList.add('hidden');
    if (autoRetryCount < MAX_AUTO_RETRY) {
      autoRetryCount++;
      showToast(MODO_VITRINE ? 'Reconectando a camera...' : `Tentativa ${autoRetryCount}/${MAX_AUTO_RETRY}...`);
      setTimeout(startApp, MODO_VITRINE ? window.VITRINE.religarMs : 3000);
    } else {
      showToast('Câmera indisponível. Verifique as permissões.');
    }
    return;
  }

  loadingText.textContent = '🕶️ Arrumando a vitrine de óculos...';
  await new Promise(r => setTimeout(r, 100));

  console.log('[DEBUG] Initializing scene...');
  await initScene(webcam);
  console.log('[DEBUG] Scene initialized');

  loadingText.textContent = '✨ Chamando o provador...';

  console.log('[DEBUG] Loading MediaPipe...');
  const ok = await initMediaPipe();
  if (!ok) {
    console.error('[DEBUG] MediaPipe failed');
    loadingOverlay.classList.add('hidden');
    if (autoRetryCount < MAX_AUTO_RETRY) {
      autoRetryCount++;
      showToast(MODO_VITRINE ? 'Reconectando...' : `Reconectando... (${autoRetryCount}/${MAX_AUTO_RETRY})`);
      setTimeout(startApp, MODO_VITRINE ? window.VITRINE.religarMs : 3000);
    } else {
      showToast('Falha ao carregar IA. Verifique sua conexão.');
    }
    return;
  }

  console.log('[DEBUG] All ready!');
  autoRetryCount = 0;
  loadingText.textContent = '😎 Pronto! Chegue mais perto';
  await new Promise(r => setTimeout(r, 200));
  loadingOverlay.classList.add('hidden');

  isActive = true;
  schedulePrediction();
}

// ── Auto-start ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (MODO_VITRINE) iniciarModoVitrine();
  if (!autoStartDone) {
    autoStartDone = true;
    setTimeout(startApp, 500);
  }
});

// ── Modo vitrine: manter de pé sem ninguém por perto ────────────────────
let wakeLockAtual = null;

async function manterTelaAcesa() {
  if (!('wakeLock' in navigator)) return;
  try {
    wakeLockAtual = await navigator.wakeLock.request('screen');
    // O sistema solta o wake lock sozinho ao minimizar ou bloquear a tela;
    // o visibilitychange abaixo pede de novo quando a página volta.
    wakeLockAtual.addEventListener('release', () => { wakeLockAtual = null; });
  } catch (e) {
    console.warn('[Vitrine] nao foi possivel manter a tela acesa:', e.message);
  }
}

function iniciarModoVitrine() {
  document.body.classList.add('vitrine');
  manterTelaAcesa();

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!wakeLockAtual) manterTelaAcesa();
      // Voltar de uma suspensão costuma derrubar o stream da câmera.
      if (!isActive) { autoRetryCount = 0; startApp(); }
    }
  });

  // Vigia: o loop de detecção marca a hora a cada frame. Se parar de marcar,
  // alguma coisa travou (câmera sumiu, contexto WebGL perdido, aba congelada)
  // e o caminho mais confiável é recomeçar do zero.
  setInterval(() => {
    if (!isActive) return;
    if (Date.now() - ultimoFrameEm > window.VITRINE.travouMs) {
      console.warn('[Vitrine] deteccao parada, reiniciando');
      ultimoFrameEm = Date.now();
      autoRetryCount = 0;
      startApp();
    }
  }, 5000);

  // Contexto WebGL perdido (driver reiniciou, GPU ocupada) devolve a tela preta
  // sem lançar erro nenhum: aqui vira um reinício.
  window.addEventListener('webglcontextlost', () => {
    console.warn('[Vitrine] contexto WebGL perdido, reiniciando');
    autoRetryCount = 0;
    setTimeout(startApp, 1000);
  }, true);

  console.log('[Vitrine] modo vitrine ligado');
}

// ── Python Backend WebSocket Client ─────────────────────────────────────

const BACKEND_WS_URL = 'ws://localhost:8080/ws';
let backendWs = null;
let backendConnected = false;
let backendReconnectTimer = null;

// O backend opcional roda na maquina de quem desenvolve. Numa pagina servida por
// HTTPS o navegador bloqueia ws:// por mixed content e o console enche de erro
// sem nenhum ganho, entao so tentamos conectar quando a propria pagina e local.
const isLocalPage = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
let backendAvailable = isLocalPage;

function connectBackend() {
  if (!backendAvailable) return;
  if (backendWs && backendWs.readyState <= 1) return;

  try {
    backendWs = new WebSocket(BACKEND_WS_URL);

    backendWs.onopen = () => {
      backendConnected = true;
      console.log('Python backend connected');
    };

    backendWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleBackendMessage(msg);
      } catch { /* ignore */ }
    };

    backendWs.onclose = () => {
      backendConnected = false;
      backendReconnectTimer = setTimeout(connectBackend, 5000);
    };

    backendWs.onerror = () => {
      backendAvailable = false;
      if (backendWs) backendWs.close();
      console.log('Python backend not available, running without server-side OpenCV');
    };
  } catch {
    backendAvailable = false;
  }
}

function handleBackendMessage(msg) {
  // A barra RGB é controlada só pelo gesto local (punho fechado). O backend
  // chegava a abri-la com hand.isOpen — invertido, já que a barra existe para a
  // mão FECHADA — e disputava o controle com o gesto, fazendo a barra aparecer
  // sozinha. O contorno de mão do OpenCV não distingue polegar esticado de
  // punho fechado, então não serve para esse gatilho.
  void msg;
}

function sendFrameToBackend() {
  if (!backendConnected || !backendWs || !video || !isActive) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth || 640, 320);
    canvas.height = Math.min(video.videoHeight || 480, 240);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

    backendWs.send(JSON.stringify({
      type: 'frame',
      image: dataUrl,
      frame: frame_counter++,
    }));
  } catch { /* ignore */ }
}

let frame_counter = 0;
let backendFrameTimer = null;

function startBackendFrameStream() {
  if (backendFrameTimer) return;
  backendFrameTimer = setInterval(sendFrameToBackend, 100);
}

connectBackend();

// Start backend frame streaming when camera starts
const origStartAppFn = startApp;
startApp = async function() {
  await origStartAppFn.call(this);
  if (isActive) {
    startBackendFrameStream();
  }
};
