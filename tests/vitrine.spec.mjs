import { test, expect } from '@playwright/test';

// A vitrine e uma tela EM PE. Estes testes protegem o enquadramento e o guia de
// gestos que aparece nela. Precisam da camera FALSA do Chrome porque a cena 3D
// so e criada dentro de startApp, depois do getUserMedia - sem isso nao existe
// canvas nem window.ENQ para medir.
test.use({
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
});

// Espera o app terminar de subir (ENQ so e preenchido em ajustarEnquadramento,
// que roda quando o canvas ja esta no DOM).
async function esperarCena(page) {
  await expect.poll(async () => await page.evaluate(
    () => (window.ENQ && window.ENQ.visW > 0) ? 'ok' : 'subindo'
  ), { timeout: 60000, intervals: [500] }).toBe('ok');
}

// Mede o canvas: resolucao interna (o buffer) e a caixa que o CSS lhe da.
async function medirCanvas(page) {
  return await page.evaluate(() => {
    const c = document.querySelector('#threejs-container canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      propBuffer: c.width / c.height,
      propCaixa: r.width / r.height,
      enq: { fracX: window.ENQ.fracX, fracY: window.ENQ.fracY },
    };
  });
}

test.describe('vitrine em pe', () => {
  test.describe.configure({ timeout: 120000 });

  // O DEFEITO CORRIGIDO em v4.32.0: o canvas era criado no tamanho do VIDEO
  // (deitado) e o CSS o esticava para 100%x100% da tela. Numa tela em pe isso
  // nao dava barra preta, dava DISTORCAO - rosto alto e fino. A prova de que
  // acabou e o buffer do canvas ter a MESMA proporcao da caixa em que ele e
  // desenhado: se as duas batem, esticar para 100% nao deforma nada.
  test('tela em pe: imagem cortada, nunca esticada', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 1280 }); // 9:16
    await page.goto('/');
    await esperarCena(page);

    const m = await medirCanvas(page);
    expect(m, 'canvas nao foi criado').not.toBeNull();
    console.log('EM PE:', JSON.stringify(m));

    // Sem distorcao: buffer e caixa com a mesma proporcao.
    expect(m.propBuffer).toBeCloseTo(m.propCaixa, 1);
    // E a proporcao e mesmo a da tela em pe (mais alta que larga).
    expect(m.propBuffer).toBeLessThan(1);
    // Numa tela mais estreita que a webcam, sao as LATERAIS que saem.
    expect(m.enq.fracX).toBeLessThan(1);
    expect(m.enq.fracY).toBeCloseTo(1, 5);
  });

  // Protege o que ja estava aprovado na camera: numa tela deitada normal a
  // imagem nao e deformada. Nao da para exigir corte aqui, porque a camera FALSA
  // do Chrome entrega 16:9 e a tela tambem e 16:9 - nesse caso nada precisa
  // mesmo ser cortado, e exigir corte seria testar o cenario de teste, nao o app.
  test('tela deitada: sem deformacao', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    await esperarCena(page);

    const m = await medirCanvas(page);
    console.log('DEITADA:', JSON.stringify(m));
    expect(m.propBuffer).toBeCloseTo(m.propCaixa, 1);
    // A invariante do enquadramento, valida em qualquer combinacao de tela e
    // camera: um lado SEMPRE cabe inteiro (frac = 1) e o outro e no maximo
    // inteiro. Frac > 1 significaria esticar, que e exatamente o defeito antigo.
    expect(Math.max(m.enq.fracX, m.enq.fracY)).toBeCloseTo(1, 5);
    expect(m.enq.fracX).toBeLessThanOrEqual(1.0001);
    expect(m.enq.fracY).toBeLessThanOrEqual(1.0001);
  });

  // Tela BEM mais larga que qualquer webcam: aqui o corte tem de ser em cima e
  // embaixo, provando que o outro ramo do enquadramento tambem funciona.
  test('tela muito larga: corta topo e base', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 600 }); // 2.67:1
    await page.goto('/');
    await esperarCena(page);

    const m = await medirCanvas(page);
    console.log('LARGA:', JSON.stringify(m));
    expect(m.propBuffer).toBeCloseTo(m.propCaixa, 1);
    expect(m.enq.fracX).toBeCloseTo(1, 5);
    expect(m.enq.fracY).toBeLessThan(1);
  });

  // A faixa RGB passou a ser medida na TELA e nao no video. Sem isso, com as
  // laterais cortadas, a ponta do arco-iris ficaria fora do quadro e a pessoa
  // teria de mover a mao para onde nao consegue se ver.
  test('faixa RGB alcancavel dentro da tela cortada', async ({ page }) => {
    await page.setViewportSize({ width: 720, height: 1280 });
    await page.goto('/');
    await esperarCena(page);

    const r = await page.evaluate(() => {
      const fx = window.ENQ.fracX;
      const inicio = 0.5 - fx / 2, fim = 0.5 + fx / 2;
      // A conta da faixa RGB, tal como esta em runPrediction.
      const faixa = xVideo => Math.min(1, Math.max(0, (0.47 - window.xNaTela(xVideo)) / 0.38));
      return {
        fracX: fx,
        // xNaTela nas bordas do que se VE tem de cobrir 0..1 inteiro.
        bordaEsq: window.xNaTela(inicio),
        bordaDir: window.xNaTela(fim),
        // E as duas pontas do arco-iris tem de ser alcancaveis SEM sair da tela.
        corNaBordaVisivel: faixa(inicio),
        corNoCentro: faixa(0.5),
      };
    });
    console.log('FAIXA:', JSON.stringify(r));
    expect(r.fracX).toBeLessThan(1);
    expect(r.bordaEsq).toBeCloseTo(0, 5);
    expect(r.bordaDir).toBeCloseTo(1, 5);
    // Vermelho (1) alcancado ainda DENTRO da tela - era isto que o corte quebrava.
    expect(r.corNaBordaVisivel).toBeCloseTo(1, 3);
    expect(r.corNoCentro).toBeLessThan(1);
  });
});

test('guia de gestos existe, comeca escondido e tem os 4 passos', async ({ page }) => {
  await page.goto('/');

  const el = page.locator('#guia-dica');
  await expect(el).toHaveCount(1);
  await expect(el).toHaveClass(/hidden/);

  // Os passos sao o contrato do guia: se um sumir, a pessoa deixa de aprender
  // aquele gesto. A ordem importa - e a ordem em que a dica aparece.
  const passos = await page.evaluate(() =>
    window.PASSOS_GUIA ? window.PASSOS_GUIA.map(p => p.id) : null
  );
  expect(passos).toEqual(['modelo', 'lente', 'cor', 'fim']);

  const cfg = await page.evaluate(() => window.GUIA);
  expect(cfg.enabled).toBe(true);
  expect(cfg.reiniciarMs).toBeGreaterThan(0);
});

test('guia recomeca quando a tela fica vazia', async ({ page }) => {
  await page.goto('/');
  await expect.poll(async () => await page.evaluate(
    () => typeof window.guiaTick === 'function' ? 'ok' : 'esperando'
  ), { timeout: 30000, intervals: [300] }).toBe('ok');

  const r = await page.evaluate(async () => {
    window.guiaReiniciar();
    window.guiaFeito('modelo');
    const depoisDeAprender = window.guiaEstado().feitos.length;

    // Ninguem na tela por mais que reiniciarMs -> volta ao primeiro passo.
    const antes = window.GUIA.reiniciarMs;
    window.GUIA.reiniciarMs = 1;
    window.guiaTick(0);                       // marca o inicio da ausencia
    await new Promise(r => setTimeout(r, 30));
    window.guiaTick(0);                       // agora ja passou do prazo
    const depoisDeEsvaziar = window.guiaEstado().feitos.length;
    window.GUIA.reiniciarMs = antes;

    return { depoisDeAprender, depoisDeEsvaziar };
  });

  console.log('GUIA:', JSON.stringify(r));
  expect(r.depoisDeAprender).toBe(1);   // aprendeu um passo
  expect(r.depoisDeEsvaziar).toBe(0);   // e o proximo visitante ve tudo de novo
});
