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

  // A conta do encurtamento: a dobradica fica parada, a ponta se aproxima dela.
  const enc = await page.evaluate(() => {
    const hingeZ = 0.37;
    const mapear = (k, z) => hingeZ * (1 - k) + k * z;
    return {
      dobradicaK1: mapear(1, hingeZ), dobradicaK02: mapear(0.2, hingeZ),
      pontaK1: mapear(1, hingeZ - 1), pontaK02: mapear(0.2, hingeZ - 1),
    };
  });
  console.log('ENCURTAMENTO:', JSON.stringify(enc));
  expect(enc.dobradicaK02).toBeCloseTo(enc.dobradicaK1, 6);
  expect(enc.pontaK02).toBeGreaterThan(enc.pontaK1);

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
