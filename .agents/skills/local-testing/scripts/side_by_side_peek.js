// Run with playwright-cli run-code --filename=... after opening Example.java in MR !1.
// Tests the real Monaco references preview, not a DOM or editor mock. Read-only on GitLab.
async function testSideBySidePeek(page) {
  await page.bringToFront();
  await page.locator('.tab', { hasText: 'Example.java (!1)' }).click({ force: true });
  let frame;
  for (const candidate of page.frames().filter(f => f.url().includes('fake.html'))) {
    if (
      await candidate
        .evaluate(() => document.body.textContent.includes('EXAMPLE_SYMBOL'))
        .catch(() => false)
    ) {
      frame = candidate;
      break;
    }
  }
  if (!frame) throw new Error('Open Example.java in the side-by-side viewer for MR !1.');
  await frame.waitForFunction(() => !document.hidden, undefined, { timeout: 10000 });
  // Access the real editor through its mounted Vue component; no navigation or model is mocked.
  await frame.evaluate(() => {
    function visit(vnode) {
      if (!vnode) return;
      if (vnode.component) {
        if (vnode.component.type.name === 'DiffLayout') {
          window.__peekTestView = vnode.component.ctx.diffView;
        }
        visit(vnode.component.subTree);
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(visit);
    }
    visit(document.querySelector('#app').__vue_app__._container._vnode);
  });

  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const previewState = () =>
    frame.evaluate(() => {
      const preview = document.querySelector('.peekview-widget .preview .monaco-editor');
      if (!preview) return undefined;
      const rect = preview.getBoundingClientRect();
      const lines = [...preview.querySelectorAll('.view-line')];
      const declaration = lines.find(line => line.textContent.includes('EXAMPLE_SYMBOL'));
      const symbol =
        declaration &&
        [...declaration.querySelectorAll('span')].find(
          span => span.textContent === 'EXAMPLE_SYMBOL',
        );
      const symbolRect = symbol?.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        symbolVisible: !!symbolRect && symbolRect.bottom > rect.top && symbolRect.top < rect.bottom,
      };
    });
  const checkPreview = async () => {
    // The old automatic-layout feedback loop initially renders correctly, then shrinks the
    // preview over successive ResizeObserver callbacks. An immediate assertion misses it.
    await page.waitForTimeout(6000);
    await frame.waitForFunction(
      () => {
        const preview = document.querySelector('.peekview-widget .preview .monaco-editor');
        const rect = preview?.getBoundingClientRect();
        return rect && rect.width >= 200 && rect.height >= 200;
      },
      undefined,
      { timeout: 10000 },
    );
    const state = await previewState();
    assert(state.symbolVisible, 'The selected symbol must be visible in the preview.');
    return state;
  };
  const results = [];
  const checkAlignment = async aligned => {
    await frame.waitForFunction(
      align => {
        const view = window.__peekTestView;
        const count = view.layout.fillers.old.length + view.layout.fillers.new.length;
        if (align) {
          return (
            count > 0 &&
            view.editors.old.getTopForLineNumber(11) === view.editors.new.getTopForLineNumber(12)
          );
        }
        return count === 0 && document.querySelectorAll('.gl-diff-filler').length === 0;
      },
      aligned,
      { timeout: 10000 },
    );
  };
  for (const aligned of [true, false]) {
    await frame.evaluate(align => window.__peekTestView.setAligned(align), aligned);
    for (let run = 0; run < 3; run += 1) {
      await frame.evaluate(() => {
        const view = window.__peekTestView;
        const editor = view.editors.new;
        editor.getContribution('editor.contrib.referencesController').closeWidget();
        view.editors.old.setScrollTop(0);
        editor.setScrollTop(0);
        editor.setPosition({ lineNumber: 11, column: 41 });
        editor.focus();
        // The same command F12 runs, with the real Java provider on the host.
        editor.trigger('peek-regression', 'editor.action.revealDefinition', {});
      });
      await frame.waitForSelector('.peekview-widget .monaco-list-row');
      // Keep the peek's anchor in the viewport after Monaco restores its previous scroll state.
      await frame.evaluate(() => window.__peekTestView.editors.new.setScrollTop(0));
      const preview = await checkPreview();
      await checkAlignment(aligned);
      results.push({ aligned, run, preview });
    }
  }

  // Toggle while the same peek remains open: Align off must remove every empty filler,
  // without closing or shrinking the preview. Turning Align on restores row alignment.
  for (const aligned of [true, false, true, false]) {
    await frame.evaluate(align => window.__peekTestView.setAligned(align), aligned);
    await checkAlignment(aligned);
    await checkPreview();
  }

  // Resize the actual workbench via its sidebar, then check both pane and preview dimensions.
  const paneWidth = () =>
    frame
      .locator('.gl-diff-editor')
      .nth(1)
      .evaluate(e => e.clientWidth);
  const editorWidth = () =>
    frame
      .locator('.gl-diff-editor')
      .nth(1)
      .locator('.monaco-editor')
      .first()
      .evaluate(e => e.clientWidth);
  const before = await paneWidth();
  await page.keyboard.press('Meta+b');
  try {
    await frame.waitForFunction(
      width => document.querySelectorAll('.gl-diff-editor')[1].clientWidth !== width,
      before,
    );
    await checkPreview();
    assert(
      Math.abs((await paneWidth()) - (await editorWidth())) <= 1,
      'Pane editor must follow the resized container.',
    );
  } finally {
    await page.keyboard.press('Meta+b');
  }
  await checkPreview();
  const usage = frame.locator('.peekview-widget .monaco-list-row').nth(1);
  await usage.click({ force: true });
  await checkPreview();
  await usage.dblclick({ force: true });
  await frame.waitForFunction(
    () => window.__peekTestView.editors.new.getPosition().lineNumber === 43,
  );
  await checkAlignment(false);
  await frame.evaluate(() =>
    window.__peekTestView.editors.new.trigger(
      'peek-regression',
      'editor.action.revealDefinition',
      {},
    ),
  );
  await frame.waitForFunction(
    () => window.__peekTestView.editors.new.getPosition().lineNumber === 11,
  );
  return {
    passed: true,
    results,
    openPeekToggles: 'on → off → on → off: no fillers when off',
    navigation: 'usage line 43 → definition line 11',
  };
}
