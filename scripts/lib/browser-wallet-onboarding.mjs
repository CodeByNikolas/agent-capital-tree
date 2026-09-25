export async function openRecoveryPhraseImport(page) {
  const entry = page.getByTestId('onboarding-import-wallet');
  await entry.click();
  await entry.waitFor({ state: 'hidden', timeout: 30000 });
  const phrase = page.locator('textarea');
  const choice = page.getByRole('button', { name: 'Import using Secret Recovery Phrase', exact: true });
  const next = await Promise.any([
    phrase.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'phrase'),
    choice.waitFor({ state: 'visible', timeout: 30000 }).then(() => 'choice'),
  ]);
  if (next === 'choice') await choice.click();
  await phrase.waitFor({ state: 'visible', timeout: 30000 });
}
