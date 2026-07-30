import { test, expect } from '@playwright/test';

// Os modelos GLB so sao carregados depois que a camera abre (loadAllModels roda
// dentro de startApp). Sem camera, nada disso existe e o teste nao teria o que
// medir - por isso aqui se usa a camera FALSA do proprio Chrome, que faz o
// pipeline inteiro rodar sem hardware nenhum e sem pedir permissao.
test.use({
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
});

// Confere que o corte das astes continua funcionando depois da mudanca do pivo,
// e que a conta do encurtamento prende a dobradica no lugar.
test('astes: corte, pivo e encurtamento', async ({ page }) => {
  test.setTimeout(120000); // carregar 3 GLB + MediaPipe pela CDN demora

  // O corte da aste vive num shader remendado a mao, e GLSL quebrado NAO falha no
  // JS: o Three.js so imprime o erro no console e a aste some da tela. Sem vigiar
  // o console, todo o resto deste teste passaria com a aste invisivel.
  const errosDeShader = [];
  page.on('console', m => {
    if (m.type() === 'error' && /shader|webglprogram|glsl/i.test(m.text())) errosDeShader.push(m.text());
  });

  await page.goto('/');

  // Os GLB carregam de forma assincrona; diagAstes avisa quando ainda nao chegaram.
  await expect.poll(async () => await page.evaluate(() => {
    if (!window.diagAstes) return 'sem diagAstes';
    return window.diagAstes().every(x => x.carregado) ? 'ok' : 'carregando';
  }), { timeout: 60000, intervals: [1000] }).toBe('ok');

  const diag = await page.evaluate(() => window.diagAstes());
  console.log('DIAG:', JSON.stringify(diag));

  for (const d of diag) {
    expect(d.ok, `${d.estilo} nao separou as astes`).toBe(true);
    expect(d.pivo, `${d.estilo} sem pivo: a aste nao encurta`).toBe(true);
  }

  // Contrato medido nos GLB, o mesmo do CLAUDE.md.
  const porEstilo = Object.fromEntries(diag.map(d => [d.estilo, d]));
  expect(porEstilo.square.trisEsq).toBe(126);
  expect(porEstilo.aviator.trisEsq).toBe(126);
  expect(porEstilo.cateye.malhasEsq).toBe(2);

  // O corte da aste (v4.31.0). Antes o encurtamento era mesh.scale.z, que
  // COMPRIME: o Z encolhia e o Y nao, entao a ponta retorcida ficava em pe colada
  // na dobradica - o risco vertical que aparecia de frente. Agora o pedaco alem do
  // corte simplesmente nao e desenhado. Estas asserts medem a geometria REAL dos
  // GLB carregados, e nao uma copia da conta.
  // diagAstes ja compilou os materiais da aste (renderer.compile), entao um GLSL
  // quebrado no corte ja teria aparecido aqui.
  expect(errosDeShader, 'o shader do corte da aste nao compilou').toEqual([]);

  for (const d of diag) {
    expect(d.corte, `${d.estilo} sem o uniform do corte: a aste apareceria inteira`).toBe(true);
    for (const [lado, f] of [['esq', d.faixaEsq], ['dir', d.faixaDir]]) {
      expect(f.comp, `${d.estilo}/${lado} sem comprimento de aste`).toBeGreaterThan(0);
    }
  }

  const corte = await page.evaluate(() => {
    const T = window.TEMPLE;
    // Mesma conta de applyTempleFade: o corte anda da ponta para a dobradica.
    const onde = (hinge, tip, k) => hinge - (hinge - tip) * k;
    // A ponta retorcida e os ultimos 20% da aste, medido nos GLB (ate 80% do
    // comprimento a queda em Y e 0.0000; so depois disso ela dobra).
    const inicioDaPonta = (hinge, tip) => hinge - (hinge - tip) * 0.80;
    return window.diagAstes().map(d => {
      const { hinge, tip } = d.faixaEsq;
      return {
        estilo: d.estilo,
        // De frente / so inclinado: k = minLen.
        corteDeFrente: onde(hinge, tip, T.minLen),
        // De perfil: k = 1, nada cortado.
        corteDePerfil: onde(hinge, tip, 1),
        inicioDaPonta: inicioDaPonta(hinge, tip),
        tip,
      };
    });
  });
  console.log('CORTE:', JSON.stringify(corte));

  for (const c of corte) {
    // O DEFEITO CORRIGIDO: de frente o corte tem de cair ANTES da ponta comecar,
    // senao a ponta retorcida volta a ser desenhada junto da dobradica.
    expect(c.corteDeFrente,
      `${c.estilo}: de frente o corte nao esconde a ponta retorcida`
    ).toBeGreaterThan(c.inicioDaPonta);
    // De perfil a aste sai inteira, ponta inclusive.
    expect(c.corteDePerfil).toBeCloseTo(c.tip, 6);
    expect(c.corteDePerfil).toBeLessThan(c.inicioDaPonta);
  }

  // A revelacao por giro: de frente e so um toco, de perfil e inteira.
  const rev = await page.evaluate(() => {
    const T = window.TEMPLE;
    const comp = giro => {
      const r = Math.min(1, Math.max(0, (giro - T.showStart) / (T.showFull - T.showStart)));
      return T.minLen + (1 - T.minLen) * r;
    };
    return { frente: comp(0), inclinado: comp(0.05), meio: comp(0.3), perfil: comp(0.8) };
  });
  console.log('COMPRIMENTO POR GIRO:', JSON.stringify(rev));
  expect(rev.frente).toBeCloseTo(0.15, 3);      // de frente: toco
  expect(rev.inclinado).toBeCloseTo(0.15, 3);   // inclinacao pura: tambem toco
  expect(rev.perfil).toBeCloseTo(1, 3);         // de perfil: inteira
});
