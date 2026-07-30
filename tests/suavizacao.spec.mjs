import { test, expect } from '@playwright/test';

// A curva de resposta do rastreamento (window.SMOOTH). Nao precisa de camera:
// SMOOTH e so configuracao, e o que se testa aqui e a CONTA que usa esses
// numeros - a mesma de updateSlotFromFace.
//
// Defeito que originou estes testes (30/07): "movendo o rosto muito rapido ele
// nao acompanha e chega atrasado". Com fator `a` por frame e velocidade `v`, o
// atraso que sobra em regime e v*(1-a)/a, entao quem manda no movimento rapido
// e o TETO, nao o piso.
test.describe('suavizacao do rastreamento', () => {

  async function curva(page) {
    return await page.evaluate(() => {
      const S = window.SMOOTH;
      const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      // mov em LARGURAS DE ROSTO por frame, como em updateSlotFromFace
      const aPos = mov => cl(S.pos + mov * S.posBoost, S.pos, S.posMax);
      const aEsc = mov => cl(S.scale + mov * S.scaleBoost, S.scale, S.scaleMax);
      const aRot = rad => cl(S.rot + rad * S.rotBoost, S.rot, S.rotMax);
      const atraso = a => (1 - a) / a;  // multiplo da velocidade, em regime
      return {
        S,
        parado: aPos(0),
        normal: aPos(0.03),
        rapido: aPos(0.20),
        escRapido: aEsc(0.20),
        rotRapido: aRot(0.25),
        atrasoRapido: atraso(aPos(0.20)),
      };
    });
  }

  // A PROMESSA feita ao usuario: com a pessoa parada nada mudou. So os tetos e os
  // aceleradores foram mexidos; o piso continua sendo quem manda no repouso, e e
  // ele que segura o tremor que ja tinha sido aprovado na camera.
  test('parado: continua exatamente no piso', async ({ page }) => {
    await page.goto('/');
    const c = await curva(page);
    console.log('CURVA:', JSON.stringify(c));

    expect(c.parado).toBeCloseTo(c.S.pos, 10);
    expect(c.S.pos).toBeCloseTo(0.22, 10);       // o valor aprovado na camera
    expect(c.S.deadZone).toBeCloseTo(0.035, 10); // zona morta intocada
  });

  // O DEFEITO CORRIGIDO: no movimento rapido o fator tem de chegar perto do teto,
  // e o atraso remanescente virar uma fracao pequena da velocidade.
  test('rapido: quase alcanca o alvo no mesmo frame', async ({ page }) => {
    await page.goto('/');
    const c = await curva(page);

    expect(c.rapido).toBeGreaterThan(0.9);
    // Antes o teto era 0.65, que deixa 0.54*v de atraso permanente. Tem de ter
    // caido para menos de um decimo da velocidade.
    expect(c.atrasoRapido).toBeLessThan(0.1);
    // E nao pode ir a 1.0: em movimento rapido a imagem borra e os pontos do
    // MediaPipe ficam ruidosos - 1.0 copiaria esse ruido inteiro.
    expect(c.S.posMax).toBeLessThan(1.0);
  });

  test('movimento normal ja sai bem do piso', async ({ page }) => {
    await page.goto('/');
    const c = await curva(page);
    // O acelerador antigo (0.02 em pixels) mal saia do piso em uso normal.
    expect(c.normal).toBeGreaterThan(c.S.pos * 1.3);
  });

  // A escala tem de continuar CALMA mesmo no movimento rapido, senao o tamanho
  // dos oculos pulsa a cada erro de medida do rosto.
  test('escala segue mais lenta que a posicao', async ({ page }) => {
    await page.goto('/');
    const c = await curva(page);
    expect(c.escRapido).toBeLessThan(c.rapido);
    expect(c.S.scaleMax).toBeLessThan(c.S.posMax);
  });

  test('rotacao tambem acompanha o giro rapido', async ({ page }) => {
    await page.goto('/');
    const c = await curva(page);
    // ~0.25 rad/frame e um giro rapido de cabeca.
    expect(c.rotRapido).toBeGreaterThan(0.85);
    expect(c.S.rot).toBeCloseTo(0.25, 10); // piso da rotacao intocado
  });
});
