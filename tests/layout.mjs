import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { chromium } from '@playwright/test'
import { createServer } from 'vite'
import AxeBuilder from '@axe-core/playwright'

let server
let browser
let baseUrl

before(async () => {
  server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  baseUrl = server.resolvedUrls.local[0]
  browser = await chromium.launch()
})

after(async () => {
  await browser?.close()
  await server?.close()
})

const viewports = [
  { width: 1920, height: 1080, maxPageHeight: 1700 },
  { width: 1366, height: 768, maxPageHeight: 1800 },
  { width: 1099, height: 763, maxPageHeight: 1900 },
  { width: 1050, height: 800 },
  { width: 768, height: 1024 },
  { width: 700, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 640 },
]

for (const width of [1366, 320]) {
  test(`filter grouping and quadratic envelope sliders work at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(baseUrl)
      const filter = page.getByRole('region', { name: 'Filter', exact: true })
      const controls = filter.locator('.web-filter-tone-controls [role="slider"]')
      assert.deepEqual(await controls.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label'))), ['Filter cutoff', 'Filter envelope amount', 'Filter resonance'])
      const boxes = await controls.evaluateAll((elements) => elements.map((element) => {
        const box = element.getBoundingClientRect()
        return { x: box.x, y: box.y }
      }))
      assert.ok(boxes[0].x < boxes[1].x && boxes[1].x < boxes[2].x)
      assert.equal(boxes[0].y, boxes[1].y)
      assert.equal(boxes[1].y, boxes[2].y)
      const attack = page.getByRole('slider', { name: 'Amplifier attack', exact: true })
      await attack.fill('500')
      assert.equal(await attack.getAttribute('aria-valuenow'), '5000')
      assert.equal(await attack.getAttribute('aria-valuetext'), '5 s')
      await attack.press('Home')
      await attack.press('ArrowUp')
      assert.equal(await attack.getAttribute('aria-valuenow'), '1')
      await attack.press('End')
      await attack.press('ArrowDown')
      assert.equal(await attack.getAttribute('aria-valuenow'), '19960')
      await page.getByRole('button', { name: /^Edit amplifier attack value:/ }).click()
      await page.getByRole('spinbutton', { name: 'Amplifier attack value', exact: true }).fill('25')
      await page.getByRole('spinbutton', { name: 'Amplifier attack value', exact: true }).press('Enter')
      assert.equal(await attack.getAttribute('aria-valuenow'), '25')
      assert.ok(Math.abs(Number(await attack.inputValue()) - Math.sqrt(25 / 20000) * 1000) < 0.001)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const results = await new AxeBuilder({ page }).include('.web-filter-module').include('.web-synth-envelope-grid').analyze()
      assert.deepEqual(results.violations.map(({ id }) => id), [])
    } finally {
      await context.close()
    }
  })

  test(`debug diagnostics are visible and reflow across profiles at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(baseUrl)
      const debug = page.getByRole('button', { name: 'Debug', exact: true })
      await debug.click()
      const diagnostics = page.getByRole('region', { name: 'Debug diagnostics', exact: true })
      for (const profile of ['web-synth', 'summit', 'ultranova']) {
        await page.getByRole('combobox', { name: 'Synth profile' }).selectOption(profile)
        await diagnostics.scrollIntoViewIfNeeded()
        assert.equal(await diagnostics.isVisible(), true)
        assert.equal(await diagnostics.getByText('Audio status', { exact: true }).count(), profile === 'web-synth' ? 1 : 0)
        await diagnostics.locator('summary').click()
        const values = diagnostics.getByRole('region', { name: 'Debug parameter values' })
        assert.equal(await values.isVisible(), true)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Diagnostics must not overflow the viewport')
        assert.equal(await values.evaluate((element) => element.scrollWidth <= element.clientWidth), true, 'Raw values must not overflow horizontally')
        if (profile !== 'web-synth') assert.equal(await page.locator('.midi-address').first().isVisible(), true)
        const results = await new AxeBuilder({ page }).include('#debug-panel').analyze()
        assert.deepEqual(results.violations.map(({ id }) => id), [])
      }
      await debug.click()
      assert.equal(await diagnostics.count(), 0)
      assert.equal(await page.locator('.midi-address').first().isVisible(), false)
    } finally {
      await context.close()
    }
  })
}

for (const { width, height } of viewports) {
  test(`UltraNova blue panel reflows without clipping at ${width} x ${height}`, async () => {
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.goto(baseUrl)
      await page.getByRole('combobox', { name: 'Synth profile' }).selectOption('ultranova')
      await page.evaluate(() => document.fonts.ready)
      await page.getByRole('button', { name: 'LFO 3', exact: true }).click()
      await page.getByRole('button', { name: 'Env 6', exact: true }).click()
      const layout = await page.evaluate(() => ({
        pageWidth: document.documentElement.scrollWidth,
        clipped: [...document.querySelectorAll('.ultranova-panel .parameter-control, .ultranova-panel .peak-module-title, .ultranova-panel .lfo-selector button')]
          .filter((element) => element.getClientRects().length > 0 && element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.id || element.textContent),
        chassis: getComputedStyle(document.querySelector('.ultranova-panel')).borderLeftColor,
        led: getComputedStyle(document.querySelector('.ultranova-panel .rotary-indicator')).backgroundColor,
        envelopeDirection: getComputedStyle(document.querySelector('#env6Attack')).writingMode,
      }))
      assert.ok(layout.pageWidth <= width, 'UltraNova must not overflow horizontally')
      assert.deepEqual(layout.clipped, [])
      assert.equal(layout.chassis, 'rgb(35, 93, 164)')
      assert.equal(layout.led, 'rgb(255, 82, 108)')
      assert.equal(layout.envelopeDirection, 'vertical-lr')
      assert.equal(await page.getByRole('button', { name: /^Fetch/ }).count(), 0)
      await page.getByRole('combobox', { name: 'Synth profile' }).selectOption('summit')
      assert.equal(await page.locator('.ultranova-theme').count(), 0)
      assert.equal(await page.locator('.peak-panel').evaluate((panel) => getComputedStyle(panel).borderLeftColor), 'rgb(113, 88, 67)')
    } finally {
      await page.close()
    }
  })
}

for (const width of [800, 801, 900, 1366, 390, 320]) {
  test(`harmonic labels reflow with enlarged text at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    try {
      await page.goto(baseUrl)
      await page.getByRole('button', { name: 'Start tutorial', exact: true }).click()
      await page.addStyleTag({ content: `
        html { font-size: 200% !important; }
        .synth-tutorial * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
      ` })
      const layout = await page.locator('.harmonic-comparison').evaluate((chart) => ({
        pageWidth: document.documentElement.scrollWidth,
        ticks: chart.querySelectorAll('.harmonic-tick').length,
        clipped: [...chart.querySelectorAll('span, strong, p')]
          .filter((element) => element.scrollWidth > element.clientWidth + 1)
          .map((element) => element.textContent),
      }))
      assert.ok(layout.pageWidth <= width, 'Enlarged harmonic charts must not overflow the page')
      assert.equal(layout.ticks, 16)
      assert.deepEqual(layout.clipped, [], 'Enlarged harmonic labels must fit their cells')
    } finally {
      await page.close()
    }
  })
}

for (const width of [1366, 390, 320]) {
  test(`envelope editor makes millisecond units visible at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    try {
      await page.goto(baseUrl)
      await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
      await page.getByRole('button', { name: /^Edit amplifier attack value:/ }).click()
      const input = page.getByRole('spinbutton', { name: 'Amplifier attack value', exact: true })
      await input.fill('1500')
      await input.press('Enter')
      const button = page.getByRole('button', { name: /^Edit amplifier attack value:/ })
      assert.equal(await button.innerText(), '1.5 s')
      await button.click()
      assert.equal(await input.inputValue(), '1500')
      const unit = page.getByText('Milliseconds (ms)', { exact: true })
      assert.equal(await unit.isVisible(), true)
      assert.equal(await unit.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), true)
      await input.press('Escape')
      assert.equal(await unit.count(), 0)
    } finally {
      await page.close()
    }
  })

  test(`tutorial skip and exit persist across reloads at ${width}px`, async () => {
    const page = await browser.newPage({ viewport: { width, height: 844 } })
    try {
      await page.goto(baseUrl)
      await page.getByRole('button', { name: 'Skip tutorial', exact: true }).click()
      assert.equal(await page.getByRole('heading', { name: 'Learn subtractive synthesis', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Start tutorial', exact: true }).evaluate((button) => button === document.activeElement), true)
      await page.reload()
      assert.equal(await page.getByRole('button', { name: 'Skip tutorial', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Start tutorial', exact: true }).click()
      await page.getByRole('group', { name: 'Oscillator 1 waveform', exact: true }).getByRole('radio', { name: 'Square' }).check()
      await page.getByRole('button', { name: 'Exit tutorial', exact: true }).click()
      assert.equal(await page.getByRole('region', { name: 'Voice / unison', exact: true }).isVisible(), true)
      assert.equal(await page.getByRole('group', { name: 'Oscillator 1 waveform', exact: true }).getByRole('radio', { name: 'Square' }).isChecked(), true)
      assert.equal(await page.getByRole('button', { name: 'Start tutorial', exact: true }).evaluate((button) => button === document.activeElement), true)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.reload()
      assert.equal(await page.getByRole('heading', { name: 'Learn subtractive synthesis', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Skip tutorial', exact: true }).count(), 0)
      assert.equal(await page.getByRole('progressbar', { name: 'Tutorial progress', exact: true }).count(), 0)
    } finally {
      await page.close()
    }
  })

  test(`subtractive tutorial unlocks, plays, and saves without overflow at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 844 } })
    const page = await context.newPage()
    try {
      await page.goto(baseUrl)
      await page.getByRole('button', { name: 'Start tutorial', exact: true }).click()
      const assertLayout = async () => {
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Tutorial must not overflow horizontally')
        assert.equal(await page.getByRole('heading', { name: /Step \d/ }).evaluate((heading) => heading === document.activeElement), true)
        const tutorial = page.getByRole('region', { name: 'Subtractive synthesis tutorial', exact: true })
        for (const name of ['Learn', 'See the idea', 'Try it', 'Listen for']) {
          assert.equal(await tutorial.getByRole('heading', { name, exact: true }).isVisible(), true)
        }
        assert.equal(await tutorial.getByRole('img').count(), 1)
        assert.equal(await tutorial.getByRole('list', { name: 'Tutorial steps', exact: true }).locator('[aria-current="step"]').count(), 1)
        const checklist = tutorial.getByRole('list', { name: 'Tutorial steps', exact: true })
        const currentStep = await checklist.locator('li[aria-current="step"]').evaluate((item) => [...item.parentElement.children].indexOf(item))
        assert.equal(await checklist.locator('.tutorial-step-done').count(), currentStep)
        assert.equal(await checklist.getByText('Completed', { exact: true }).count(), currentStep)
        assert.equal(await checklist.getByText('Pending', { exact: true }).count(), 6 - currentStep)
        assert.equal(/badge|\bXP\b/i.test(await tutorial.innerText()), false)
        assert.equal(await tutorial.locator('.tutorial-learn p').first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize)), 15)
        if (width === 1366) {
          const height = await tutorial.evaluate((element) => element.getBoundingClientRect().height)
          assert.ok(height <= 600, `Desktop tutorial must leave room for controls; measured ${height}px`)
        }
        assert.ok(await tutorial.getByRole('button', { name: 'Exit tutorial', exact: true }).evaluate((button) => button.getBoundingClientRect().height) >= 44)
        const waveformLabels = page.locator('.tutorial-controls .waveform-option span')
        assert.ok(await waveformLabels.count() >= 4)
        assert.deepEqual(await waveformLabels.evaluateAll((labels) => labels.filter((label) => {
          const bounds = label.getBoundingClientRect()
          const button = label.closest('.waveform-option').getBoundingClientRect()
          return getComputedStyle(label).clipPath !== 'none' || label.scrollWidth > label.clientWidth + 1
            || bounds.width <= 1 || bounds.height <= 1
            || bounds.left < button.left || bounds.right > button.right || bounds.top < button.top || bounds.bottom > button.bottom
        }).map((label) => label.textContent)), [], 'Tutorial waveform names must be visible inside their buttons')
        const scan = await new AxeBuilder({ page }).include('.synth-tutorial').analyze()
        assert.deepEqual(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) })), [])
        const resizedText = await page.addStyleTag({ content: `
          html { font-size: 200% !important; }
          .synth-tutorial * { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
          .synth-tutorial p { margin-bottom: 2em !important; }
        ` })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Enlarged and spaced tutorial text must reflow')
        const clipped = await tutorial.locator('h3, h4, p, li, button, figcaption, .tutorial-visual-labels span').evaluateAll((elements) =>
          elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent))
        assert.deepEqual(clipped, [], 'Enlarged and spaced text must not be clipped')
        assert.deepEqual(await waveformLabels.evaluateAll((labels) => labels.filter((label) =>
          label.scrollWidth > label.clientWidth + 1 || label.scrollHeight > label.clientHeight + 1
        ).map((label) => label.textContent)), [], 'Waveform names must reflow with enlarged text')
        await resizedText.evaluate((element) => element.remove())
      }
      await assertLayout()
      const spectrumLayout = await page.locator('.harmonic-spectrum').evaluateAll((spectra) => spectra.map((spectrum) => {
        const plot = spectrum.querySelector('.harmonic-plot')
        const bars = [...spectrum.querySelectorAll('.harmonic-bar')].map((bar) => bar.getBoundingClientRect().height)
        return {
          width: spectrum.getBoundingClientRect().width,
          plotWidth: plot.getBoundingClientRect().width,
          bars,
          clipped: [...spectrum.querySelectorAll('span, strong')].filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent),
        }
      }))
      assert.equal(spectrumLayout.length, 2)
      for (const spectrum of spectrumLayout) {
        assert.ok(Math.abs(spectrum.width - spectrum.plotWidth) <= 1, 'Spectrum must fill its chart')
        assert.deepEqual(spectrum.clipped, [])
      }
      assert.ok(spectrumLayout[0].bars[0] >= 60)
      assert.deepEqual(spectrumLayout[0].bars.slice(1), Array(7).fill(0))
      for (const [index, height] of spectrumLayout[1].bars.entries()) {
        assert.ok(Math.abs(height - spectrumLayout[1].bars[0] / (index + 1)) < 1, 'Sawtooth harmonic heights must decrease as 1/n')
      }
      await page.emulateMedia({ forcedColors: 'active' })
      const forcedColors = await page.locator('.harmonic-bar').first().evaluate((bar) => ({
        bar: getComputedStyle(bar).backgroundColor,
        canvas: getComputedStyle(document.querySelector('.tutorial-visual')).backgroundColor,
      }))
      assert.notEqual(forcedColors.bar, forcedColors.canvas, 'Harmonic bars must remain visible in forced colors')
      await page.emulateMedia({ forcedColors: 'none' })
      assert.equal(await page.getByRole('region', { name: 'Filter', exact: true }).count(), 0)
      await page.getByRole('button', { name: 'Start audio', exact: true }).click()
      await page.getByRole('button', { name: 'Resume audio', exact: true }).waitFor()
      const key = page.getByRole('button', { name: 'Play C 2', exact: true })
      await key.focus()
      await key.press('Space')
      assert.equal(await key.isEnabled(), true)
      await page.getByRole('group', { name: 'Oscillator 1 waveform', exact: true }).getByRole('radio', { name: 'Sawtooth' }).check()
      const next = page.getByRole('button', { name: 'Continue', exact: true })
      await next.click()
      await assertLayout()
      const level = page.getByRole('slider', { name: 'Oscillator 2 level', exact: true })
      await level.press('Home')
      for (let i = 0; i < 30; i++) await level.press('ArrowUp')
      await next.click()
      await assertLayout()
      const drag = async (control, offset) => {
        await control.scrollIntoViewIfNeeded()
        const bounds = await control.boundingBox()
        assert.ok(bounds)
        const x = bounds.x + bounds.width / 2
        const y = bounds.y + bounds.height / 2
        await page.mouse.move(x, y)
        await page.mouse.down()
        await page.mouse.move(x, y + offset)
        await page.mouse.up()
      }
      {
        const cutoff = page.getByRole('slider', { name: 'Filter cutoff', exact: true })
        await cutoff.press('Home')
        await drag(cutoff, -14)
        await page.getByRole('button', { name: /^Edit filter cutoff value:/ }).click()
        const exactCutoff = page.getByRole('spinbutton', { name: 'Filter cutoff value', exact: true })
        await exactCutoff.fill('350')
        await exactCutoff.press('Enter')
        assert.equal(await cutoff.getAttribute('aria-valuenow'), '350')
        await page.getByRole('slider', { name: 'Filter resonance', exact: true }).press('PageUp')
      }
      await next.click()
      await assertLayout()
      const sustain = page.getByRole('slider', { name: 'Amplifier sustain', exact: true })
      await sustain.press('Home')
      for (let i = 0; i < 10; i++) await sustain.press('ArrowUp')
      await page.getByRole('button', { name: /^Edit amplifier decay value:/ }).click()
      await page.getByRole('spinbutton', { name: 'Amplifier decay value', exact: true }).fill('250')
      await page.getByRole('spinbutton', { name: 'Amplifier decay value', exact: true }).press('Enter')
      await next.click()
      await assertLayout()
      const amount = page.getByRole('slider', { name: 'Filter envelope amount', exact: true })
      await amount.press('PageUp')
      await amount.press('PageUp')
      await amount.press('PageUp')
      await page.getByRole('button', { name: /^Edit filter decay value:/ }).click()
      await page.getByRole('spinbutton', { name: 'Filter decay value', exact: true }).fill('180')
      await page.getByRole('spinbutton', { name: 'Filter decay value', exact: true }).press('Enter')
      await page.getByRole('slider', { name: 'Filter sustain', exact: true }).fill('0')
      await next.click()
      await assertLayout()
      await page.getByRole('slider', { name: 'LFO pitch depth', exact: true }).press('PageUp')
      assert.equal(await next.isDisabled(), true)
      await page.getByRole('slider', { name: 'LFO pitch depth', exact: true }).press('Home')
      await next.click()
      await assertLayout()
      await page.getByRole('textbox', { name: 'Preset name', exact: true }).fill('Browser plucky bass')
      await page.getByRole('button', { name: 'Save preset', exact: true }).click()
      assert.equal(await page.getByText('Tutorial complete. Your classic plucky bass is saved. All controls are unlocked.').isVisible(), true)
      const completedChecklist = page.getByRole('list', { name: 'Tutorial steps', exact: true })
      assert.equal(await completedChecklist.locator('.tutorial-step-done').count(), 7)
      assert.equal(await completedChecklist.getByText('Completed', { exact: true }).count(), 7)
      assert.equal(await completedChecklist.locator('[aria-current]').count(), 0)
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Completed checklist must not overflow')
      assert.ok(await page.locator('.waveform-option span').evaluateAll((labels) =>
        labels.every((label) => getComputedStyle(label).position === 'absolute' && label.getBoundingClientRect().width === 1)
      ), 'Waveform names must return to visually hidden labels after exiting the tutorial')
      assert.equal(await page.getByRole('button', { name: 'Start tutorial', exact: true }).evaluate((button) => button === document.activeElement), true)
      const preset = await page.getByRole('combobox', { name: 'Web synth preset', exact: true }).inputValue()
      assert.match(preset, /^user-/)
      await page.reload()
      assert.equal(await page.getByRole('heading', { name: 'Build a classic plucky synth bass', exact: true }).count(), 0)
      assert.equal(await page.getByRole('button', { name: 'Skip tutorial', exact: true }).count(), 0)
      await page.getByRole('combobox', { name: 'Web synth preset', exact: true }).selectOption(preset)
      assert.equal(await page.getByRole('slider', { name: 'Amplifier sustain', exact: true }).inputValue(), '10')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    } finally {
      await context.close()
    }
  })
}

for (const { width, height, maxPageHeight } of viewports) {
  test(`compact panel reflows without clipping at ${width} x ${height}`, async () => {
    const page = await browser.newPage({ viewport: { width, height } })
    try {
      await page.goto(baseUrl)
      await page.getByRole('combobox', { name: 'Synth profile' }).selectOption('summit')
      await page.evaluate(() => document.fonts.ready)
      const verifyLayout = async () => {
        const layout = await page.evaluate(() => {
          const visible = (element) => element.getClientRects().length > 0
          const describe = (element) => element.id || element.getAttribute('aria-label') || element.textContent
          return {
            pageWidth: document.documentElement.scrollWidth,
            pageHeight: document.documentElement.scrollHeight,
            debugHeight: document.getElementById('debug-panel')?.getBoundingClientRect().height ?? 0,
            clipped: [...document.querySelectorAll('.parameter-control, .peak-module-title, .lfo-selector button')]
              .filter(visible)
              .filter((element) => element.scrollWidth > element.clientWidth + 1)
              .map(describe),
            smallTargets: [...document.querySelectorAll('button, select, [role="slider"], input[type="range"]')]
              .filter(visible)
              .filter((element) => {
                const bounds = element.getBoundingClientRect()
                return bounds.width < 24 || bounds.height < 24
              })
              .map(describe),
          }
        })
        assert.ok(layout.pageWidth <= width, `Page overflows horizontally: ${layout.pageWidth}px`)
        if (maxPageHeight) {
          const compactHeight = layout.pageHeight - layout.debugHeight
          assert.ok(compactHeight <= maxPageHeight, `Synth layout exceeds ${maxPageHeight}px budget: ${compactHeight}px (excluding optional diagnostics)`)
        }
        assert.deepEqual(layout.clipped, [], 'Control content must not be clipped')
        assert.deepEqual(layout.smallTargets, [], 'Interactive targets must be at least 24 x 24px')
      }
      await verifyLayout()
      const keybed = await page.locator('.piano-bed').evaluate((bed) => {
        const whites = [...bed.querySelectorAll('.white-key')]
        const blacks = [...bed.querySelectorAll('.black-key')]
        const whiteBounds = whites[0].getBoundingClientRect()
        const blackBounds = blacks[0].getBoundingClientRect()
        const boundaries = [1, 2, 4, 5, 6]
        return {
          whiteCount: whites.length,
          blackCount: blacks.length,
          availableWidth: bed.clientWidth,
          overflows: bed.scrollWidth > bed.clientWidth || bed.parentElement.scrollWidth > bed.parentElement.clientWidth,
          first: whites[0].getAttribute('aria-label'),
          last: whites.at(-1).getAttribute('aria-label'),
          blackHeightRatio: blackBounds.height / whiteBounds.height,
          aligned: blacks.every((key, index) => {
            const bounds = key.getBoundingClientRect()
            const boundary = whites[Math.floor(index / 5) * 7 + boundaries[index % 5]].getBoundingClientRect().left
            return Math.abs(bounds.left + bounds.width / 2 - boundary) < 1
          }),
        }
      })
      const expectedOctaves = Math.max(1, Math.min(5, Math.floor((keybed.availableWidth * 0.7 / 24 - 1) / 7)))
      assert.equal(keybed.whiteCount, expectedOctaves * 7 + 1)
      assert.equal(keybed.blackCount, expectedOctaves * 5)
      assert.equal(keybed.overflows, false, 'The keyboard must fit without horizontal scrolling')
      assert.equal(keybed.first, 'Play C 2')
      assert.equal(keybed.last, `Play C ${2 + expectedOctaves}`)
      assert.ok(Math.abs(keybed.blackHeightRatio - 0.61) < 0.01)
      assert.equal(keybed.aligned, true, 'Black keys must follow the two/three-key grouping across all five octaves')
      const mixer = await page.locator('.mixer-module .parameter-grid').evaluate((grid) => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length,
        rows: getComputedStyle(grid).gridTemplateRows.split(' ').length,
      }))
      assert.deepEqual(mixer, { columns: 2, rows: 3 }, 'Mixer must have two columns and three rows')
      const mixerControls = await page.locator('.mixer-module .rotary-control').evaluateAll((controls) =>
        controls.map((control) => ({ id: control.id, x: control.getBoundingClientRect().x, y: control.getBoundingClientRect().y })),
      )
      assert.deepEqual(mixerControls.map(({ id }) => id), ['osc1Mix', 'ringModMix', 'osc2Mix', 'noiseMix', 'osc3Mix', 'vcaLevel'])
      for (let row = 0; row < 3; row++) {
        assert.ok(mixerControls[row * 2].x < mixerControls[row * 2 + 1].x)
        assert.equal(mixerControls[row * 2].y, mixerControls[row * 2 + 1].y)
      }
      assert.equal(await page.locator('.rotary-control').evaluateAll((knobs) => knobs.every((knob) => {
        const output = knob.nextElementSibling
        if (!output?.classList.contains('rotary-value')) return false
        const dialBounds = knob.getBoundingClientRect()
        const valueBounds = output.getBoundingClientRect()
        return valueBounds.top >= dialBounds.bottom - 1
          && Math.abs(valueBounds.x + valueBounds.width / 2 - dialBounds.x - dialBounds.width / 2) < 1
      })), true, 'Rotary values must be centered below their knobs')
      assert.equal(await page.locator('.midi-address').first().isVisible(), false)
      await page.getByRole('button', { name: 'Debug', exact: true }).click()
      assert.equal(await page.locator('.midi-address').first().isVisible(), true)
      await verifyLayout()
      await page.getByRole('button', { name: 'Debug', exact: true }).click()

      for (const name of ['Oscillator 1', 'Oscillator 2', 'Oscillator 3', 'Mixer', 'Filter', 'LFOs', 'Amp envelope', 'Mod envelopes', 'Voice & oscillator menus']) {
        assert.equal(await page.getByRole('region', { name, exact: true }).isVisible(), true, `${name} must remain visible`)
      }
      for (const name of ['LFO 2', 'LFO 3', 'LFO 4']) {
        await page.getByRole('button', { name, exact: true }).click()
        assert.equal(await page.getByRole('button', { name, exact: true }).getAttribute('aria-pressed'), 'true')
        await verifyLayout()
      }
      await page.getByRole('button', { name: 'LFO 1', exact: true }).click()
      await page.locator('#lfo1Wave').selectOption('3')
      await page.locator('#lfo1Range').selectOption('2')
      await page.locator('#filterShape').selectOption('3')
      assert.equal(await page.locator('.dual-filter').isVisible(), true)
      await page.locator('#filterShape').selectOption('0')
      assert.equal(await page.locator('.dual-filter').isVisible(), false)
      await page.locator('#filterShape').selectOption('3')
      await page.getByRole('button', { name: 'Mod env 2', exact: true }).click()
      await verifyLayout()
      const menus = page.getByRole('region', { name: 'Voice & oscillator menus' })
      for (const name of ['Osc common', 'Osc 1', 'Osc 2', 'Osc 3', 'Noise']) {
        await menus.getByRole('tab', { name, exact: true }).click()
        assert.equal(await menus.getByRole('tab', { name, exact: true }).getAttribute('aria-selected'), 'true')
        await verifyLayout()
      }
      const expandedHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      const toggles = page.locator('.section-toggle')
      for (let index = (await toggles.count()) - 1; index >= 0; index--) {
        const toggle = toggles.nth(index)
        if (await toggle.getAttribute('aria-expanded') === 'true') {
          await toggle.click()
        }
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
        for (const id of (await toggle.getAttribute('aria-controls')).split(' ')) {
          assert.equal(await page.locator(`[id="${id}"]`).isVisible(), false)
        }
      }
      const collapsedHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      assert.ok(collapsedHeight < expandedHeight, 'Collapsing sections must reduce the page footprint')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      const filterToggle = page.getByRole('button', { name: 'Filter', exact: true })
      await filterToggle.focus()
      await filterToggle.press('Space')
      assert.equal(await filterToggle.getAttribute('aria-expanded'), 'true')
      assert.equal(await page.getByRole('slider', { name: 'Filter frequency', exact: true }).isVisible(), true)
    } finally {
      await page.close()
    }
  })
}

test('compact knobs preserve keyboard and pointer editing', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  try {
    await page.goto(baseUrl)
    await page.getByRole('combobox', { name: 'Synth profile' }).selectOption('summit')
    const knob = page.getByRole('slider', { name: 'Oscillator 1 coarse tuning', exact: true })
    await knob.focus()
    await knob.press('ArrowUp')
    assert.equal(await knob.getAttribute('aria-valuenow'), '65')
    await knob.press('Shift+ArrowDown')
    assert.equal(await knob.getAttribute('aria-valuenow'), '55')
    await knob.scrollIntoViewIfNeeded()
    const bounds = await knob.boundingBox()
    assert.ok(bounds)
    const x = bounds.x + bounds.width / 2
    const y = bounds.y + bounds.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y - 20)
    await page.mouse.up()
    assert.ok(Number(await knob.getAttribute('aria-valuenow')) > 55)
    assert.notEqual(await knob.evaluate((element) => getComputedStyle(element).outlineStyle), 'none')
    await knob.dblclick()
    assert.equal(await knob.getAttribute('aria-valuenow'), '64')
    assert.equal(await knob.getAttribute('aria-valuetext'), '0')
  } finally {
    await page.close()
  }
})

test('control help appears on hover and focus and dismisses on Escape', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  try {
    await page.goto(baseUrl)
    await page.getByRole('combobox', { name: 'Synth profile' }).selectOption('summit')
    await page.locator('#filterShape').selectOption('3')
    const help = page.getByRole('button', { name: 'Dual filter help', exact: true })
    const tooltip = page.getByRole('tooltip').filter({ hasText: 'runs in series' })
    assert.equal(await tooltip.isVisible(), false)
    await help.hover()
    assert.equal(await tooltip.isVisible(), true)
    await tooltip.hover()
    assert.equal(await tooltip.isVisible(), true)
    await page.mouse.move(0, 0)
    assert.equal(await tooltip.isVisible(), false)
    await help.focus()
    assert.equal(await tooltip.isVisible(), true)
    await help.press('Escape')
    assert.equal(await tooltip.isVisible(), false)
    await page.getByRole('slider', { name: 'Filter frequency', exact: true }).focus()
    await help.focus()
    assert.equal(await tooltip.isVisible(), true)
  } finally {
    await page.close()
  }
})

test('Web Synth envelope controls sit beside their graphs without an output visualizer', async () => {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })
  try {
    await page.goto(baseUrl)
    const envelope = page.getByRole('region', { name: 'Amp envelope', exact: true })
    const layout = await envelope.locator('.web-envelope-layout').evaluate((element) => {
      const controls = element.querySelector('.envelope-controls').getBoundingClientRect()
      const graph = element.querySelector('.web-envelope-graph').getBoundingClientRect()
      const sliderHeights = [...element.querySelectorAll('.envelope-controls input[type="range"]')]
        .map((slider) => slider.getBoundingClientRect().height)
      return {
        controlsRight: controls.right,
        graphLeft: graph.left,
        controlsWidth: controls.width,
        graphWidth: graph.width,
        controlsHeight: controls.height,
        graphHeight: graph.height,
        sliderHeights,
        controlsCenterY: controls.top + controls.height / 2,
        graphCenterY: graph.top + graph.height / 2,
      }
    })

    for (const { width, height } of [
      { width: 1366, height: 768 },
      { width: 768, height: 1024 },
      { width: 390, height: 844 },
      { width: 320, height: 640 },
    ]) {
      test(`hardware envelope graphs sit beside compact sliders at ${width}px`, async () => {
        const page = await browser.newPage({ viewport: { width, height } })
        try {
          await page.goto(baseUrl)
          const profile = page.getByRole('combobox', { name: 'Synth profile' })
          const assertEnvelopeRows = async (panel, sections) => {
            for (const section of sections) {
              const rows = await page.getByRole('region', { name: section, exact: true })
                .locator('.hardware-envelope-layout')
                .evaluateAll((elements) => elements.map((element) => {
                  const controls = element.querySelector('.envelope-controls').getBoundingClientRect()
                  const graph = element.querySelector('.envelope-graph').getBoundingClientRect()
                  return {
                    controlsRight: controls.right,
                    controlsWidth: controls.width,
                    graphLeft: graph.left,
                    graphWidth: graph.width,
                    controlsCenterY: controls.top + controls.height / 2,
                    graphCenterY: graph.top + graph.height / 2,
                  }
                }))
              assert.ok(rows.length > 0, `${panel} ${section} should render an envelope row`)
              for (const row of rows) {
                assert.ok(row.graphWidth > 50, `${panel} ${section} graph should have visible width`)
                if (width > 360) {
                  assert.ok(row.graphLeft >= row.controlsRight, `${panel} ${section} graph should be beside its sliders`)
                  assert.ok(Math.abs(row.controlsCenterY - row.graphCenterY) < 2, `${panel} ${section} graph should be vertically aligned`)
                  assert.ok(row.controlsWidth <= 180, `${panel} ${section} sliders should use a compact column`)
                }
              }
            }
          }

          await profile.selectOption('summit')
          await assertEnvelopeRows('Summit', ['Amp envelope', 'Mod envelopes'])
          await profile.selectOption('ultranova')
          await assertEnvelopeRows('UltraNova', ['Amp envelope', 'Filter / mod envelopes'])
          assert.equal(await page.getByRole('img', { name: 'UltraNova amplifier envelope curve' }).count(), 1)
          assert.equal(await page.getByRole('img', { name: 'UltraNova envelope 2 curve' }).count(), 1)
          await page.getByRole('button', { name: 'Env 6', exact: true }).click()
          assert.equal(await page.getByRole('img', { name: 'UltraNova envelope 6 curve' }).count(), 1)
        } finally {
          await page.close()
        }
      })
    }

    assert.ok(layout.graphLeft >= layout.controlsRight)
    assert.ok(layout.graphWidth > layout.controlsWidth)
    assert.ok(layout.controlsHeight >= 150)
    assert.ok(layout.graphHeight >= 160)
    assert.ok(layout.sliderHeights.every((height) => height >= 115))
    assert.ok(Math.abs(layout.controlsCenterY - layout.graphCenterY) < 2)
    assert.equal(await page.getByRole('img', { name: 'Live audio output waveform' }).count(), 0)
    const mixer = page.getByRole('region', { name: 'Mixer', exact: true })
    const mixerBounds = await mixer.boundingBox()
    assert.ok(mixerBounds && mixerBounds.width <= 150, 'Web Synth mixer must have a narrow profile')
    for (const oscillator of [1, 2]) {
      const level = mixer.getByRole('slider', { name: `Oscillator ${oscillator} level` })
      const bounds = await level.boundingBox()
      assert.ok(bounds && bounds.width >= 24 && bounds.width <= 32 && bounds.height >= 115)
      assert.equal(await level.getAttribute('aria-orientation'), 'vertical')
    }
  } finally {
    await page.close()
  }
})

test('Web Synth panels align compactly and graphical waveform radios work with the keyboard', async () => {
  const page = await browser.newPage()
  try {
    for (const { width, height } of [...viewports, { width: 601, height: 900 }, { width: 600, height: 900 }]) {
      await page.setViewportSize({ width, height })
      await page.goto(baseUrl)
      await page.evaluate(() => document.fonts.ready)
      await page.waitForFunction(() => {
        const keybed = document.querySelector('.piano-bed')
        return keybed && keybed.scrollWidth <= keybed.clientWidth
      })

      const layout = await page.evaluate(() => {
        const panels = [...document.querySelectorAll('.web-synth-signal-grid > section')]
          .map((panel) => {
            const bounds = panel.getBoundingClientRect()
            return { top: bounds.top, bottom: bounds.bottom, left: bounds.left, right: bounds.right }
          })
        return {
          pageWidth: document.documentElement.scrollWidth,
          panels,
          overflow: [...document.querySelectorAll('body *')]
            .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
            .map((element) => element.id || element.getAttribute('class') || element.tagName),
          clipped: [...document.querySelectorAll('.web-synth-control, .waveform-option')]
            .filter((element) => element.scrollWidth > element.clientWidth + 1)
            .map((element) => element.textContent),
        }
      })
      assert.ok(layout.pageWidth <= width, `Web Synth overflows at ${width}px: ${JSON.stringify(layout)}`)
      assert.deepEqual(layout.clipped, [], `Controls clipped at ${width}px`)
      assert.ok(await page.locator('.waveform-option span').evaluateAll((labels) =>
        labels.every((label) => getComputedStyle(label).position === 'absolute' && label.getBoundingClientRect().width === 1)
      ), 'Normal editor waveform buttons must remain icon-only')
      if (width > 1200) {
        for (const panel of layout.panels) {
          assert.equal(panel.top, layout.panels[0].top, 'Signal panels must share a top edge')
          assert.equal(panel.bottom, layout.panels[0].bottom, 'Signal panels must share a bottom edge')
        }
        for (let index = 1; index < layout.panels.length; index++) {
          assert.ok(layout.panels[index].left - layout.panels[index - 1].right <= 9, 'No unused mixer grid space')
        }
      }
    }
    const oscillator1 = page.getByRole('group', { name: 'Oscillator 1 waveform', exact: true })
    const oscillator2 = page.getByRole('group', { name: 'Oscillator 2 waveform', exact: true })
    await oscillator1.getByRole('radio', { name: 'Sawtooth' }).focus()
    await page.keyboard.press('ArrowRight')
    assert.equal(await oscillator1.getByRole('radio', { name: 'Square' }).isChecked(), true)
    assert.equal(await oscillator2.getByRole('radio', { name: 'Sawtooth' }).isChecked(), true)
    await page.keyboard.press('Delete')
    assert.equal(await oscillator1.getByRole('radio', { name: 'Sawtooth' }).isChecked(), true)
  } finally {
    await page.close()
  }
})

test('Web Synth allocates space to controls rather than oversized filter columns', async () => {
  const page = await browser.newPage()
  try {
    for (const width of [1920, 1366, 1201, 1200, 1099, 768, 701, 700, 601]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(baseUrl)
      await page.evaluate(() => document.fonts.ready)
      const layout = await page.evaluate(() => {
        const bounds = (selector) => {
          const box = document.querySelector(selector).getBoundingClientRect()
          return { width: box.width, top: box.top, bottom: box.bottom, left: box.left, right: box.right }
        }
        return {
          panel: bounds('.web-synth-panel'),
          filter: bounds('.web-filter-module'),
          lfo: bounds('.web-lfo-module'),
          mixer: bounds('.web-mixer-module'),
          oscillator: bounds('.web-oscillator-1-module'),
          filterType: bounds('.web-filter-type'),
          filterControls: [...document.querySelectorAll('.web-filter-tone-controls .web-synth-control')]
            .map((element) => element.getBoundingClientRect().width),
          lfoRows: [...document.querySelectorAll('.web-lfo-module [role="slider"]')]
            .map((element) => element.getBoundingClientRect().top),
          pageWidth: document.documentElement.scrollWidth,
        }
      })
      assert.ok(layout.panel.width <= 1480, 'Ultrawide screens must not stretch the control surface indefinitely')
      assert.ok(layout.pageWidth <= width, `Web Synth must fit at ${width}px`)
      assert.ok(Math.abs(layout.filter.width - layout.lfo.width) < 1, 'Filter and LFO must share space evenly')
      assert.ok(layout.filterControls.every((controlWidth) => controlWidth <= 170), `Filter encoder cells must stay compact at ${width}px: ${layout.filterControls}`)
      assert.ok(Math.abs(layout.filterType.width - (layout.filter.width - 2)) < 1, 'Filter type row must not leave an unused strip')
      assert.equal(new Set(layout.lfoRows).size, 2, `LFO encoders must align in two rows at ${width}px: ${layout.lfoRows}`)
      if (width <= 1200) {
        assert.equal(layout.filter.top, layout.lfo.top, 'Filter and LFO must sit side by side')
        assert.equal(layout.mixer.top, layout.oscillator.top)
        assert.equal(layout.mixer.bottom, layout.filter.bottom, 'Mixer must share both signal rows without unused grid space')
        assert.ok(layout.lfo.right <= layout.mixer.left, 'The spanning mixer must not overlap the LFO')
      }
    }
  } finally {
    await page.close()
  }
})

test('Web Synth help is keyboard operable and stays within every viewport', async () => {
  const page = await browser.newPage()
  try {
    for (const { width, height } of viewports) {
      await page.setViewportSize({ width, height })
      await page.goto(baseUrl)
      const helps = page.locator('.click-control-help')
      assert.equal(await helps.count(), 33)
      for (const help of await helps.all()) {
        await help.scrollIntoViewIfNeeded()
        await help.focus()
        assert.equal(await page.getByRole('tooltip').count(), 0, 'Focus alone must not open help')
        await page.keyboard.press('Enter')
        const tooltip = page.getByRole('tooltip')
        await tooltip.waitFor({ state: 'visible' })
        const bounds = await tooltip.boundingBox()
        assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0
          && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height,
        `Help must fit at ${width}px: ${JSON.stringify(bounds)}`)
        const target = await help.boundingBox()
        assert.ok(target && target.width >= 24 && target.height >= 24, 'Help target must be at least 24px')
        await page.keyboard.press('Escape')
        assert.equal(await tooltip.count(), 0)
        assert.equal(await help.evaluate((element) => element === document.activeElement), true)
      }
    }
    const help = page.getByRole('button', { name: 'Filter cutoff help', exact: true })
    await help.click()
    await page.getByRole('button', { name: 'Filter resonance help', exact: true }).click()
    assert.equal(await page.getByRole('tooltip').count(), 1)
    await page.getByRole('heading', { name: 'Built-in Web Synth', exact: true }).click()
    assert.equal(await page.getByRole('tooltip').count(), 0)
  } finally {
    await page.close()
  }
})

test('Web Synth renders a shared LP/HP/BP filter, unison, and oscillator shape in real Web Audio', async () => {
  const page = await browser.newPage()
  try {
    await page.goto(baseUrl)
    const audio = await page.evaluate(async () => {
      const { WebAudioSynth } = await import('/src/audio/webAudioSynth.ts')
      const { webSynthDefaultValues } = await import('/src/model/webSynthProfile.ts')
      const render = async (values) => {
        const offline = new OfflineAudioContext(1, 24000, 48000)
        const context = {
          state: 'running',
          currentTime: 0,
          sampleRate: offline.sampleRate,
          destination: offline.destination,
          createOscillator: () => offline.createOscillator(),
          createGain: () => offline.createGain(),
          createBiquadFilter: () => offline.createBiquadFilter(),
          createPeriodicWave: (...args) => offline.createPeriodicWave(...args),
        }
        const synth = new WebAudioSynth(() => context)
        synth.setParameters({
          ...webSynthDefaultValues, osc1Wave: 0, osc2Wave: 0, osc1Detune: 0, osc2Detune: 0,
          filterCutoff: 12000, filterResonance: 0,
          filterEnvelopeAmount: 0, ampAttack: 0, ampDecay: 0, ampSustain: 100, ...values,
        })
        await synth.start()
        synth.noteOn(69)
        const buffer = await offline.startRendering()
        const samples = buffer.getChannelData(0).slice(4800)
        const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length)
        return { rms, samples }
      }
      const only1 = await render({ osc2Level: 0 })
      const only2 = await render({ osc1Level: 0 })
      const highpass1 = await render({ osc2Level: 0, filterType: 1, filterCutoff: 4000 })
      const highpass2 = await render({ osc1Level: 0, filterType: 1, filterCutoff: 4000 })
      const lowpass = await render({ osc2Level: 0, filterCutoff: 100 })
      const bandCenter = await render({ osc2Level: 0, filterType: 2, filterCutoff: 440, filterResonance: 25 })
      const bandOff = await render({ osc2Level: 0, filterType: 2, filterCutoff: 4000, filterResonance: 25 })
      const unison = await render({ osc2Level: 0, unisonVoices: 4, unisonDetune: 0 })
      const phase = await render({ osc1Shape: 1 })
      const mixed = await render({})
      const square = await render({ osc2Level: 0, osc1Wave: 3 })
      const pulse = await render({ osc2Level: 0, osc1Wave: 3, osc1Shape: 25 })
      const harmonic = (samples, frequency) => {
        let real = 0
        let imag = 0
        samples.forEach((sample, index) => {
          const angle = 2 * Math.PI * frequency * index / 48000
          real += sample * Math.cos(angle)
          imag += sample * Math.sin(angle)
        })
        return Math.hypot(real, imag) / samples.length
      }
      return {
        only1: only1.rms, only2: only2.rms,
        highpass1: highpass1.rms, highpass2: highpass2.rms, lowpass: lowpass.rms,
        bandCenter: bandCenter.rms, bandOff: bandOff.rms,
        unison: unison.rms, phase: phase.rms, mixed: mixed.rms,
        squareEvenHarmonic: harmonic(square.samples, 880),
        pulseEvenHarmonic: harmonic(pulse.samples, 880),
        finite: [only1, only2, unison, phase, pulse].every(({ samples }) => samples.every(Number.isFinite)),
      }
    })
    assert.equal(audio.finite, true, 'Rendered output must contain only finite samples')
    assert.ok(audio.only1 > 0.001 && audio.only2 > 0.001, 'Both oscillator branches must produce audio')
    assert.ok(Math.abs(audio.mixed - (audio.only1 + audio.only2)) < 0.00001, 'The shared filter must preserve the summed level of aligned oscillators')
    assert.ok(Math.abs(audio.only1 - audio.only2) < 0.00001, 'Either oscillator through the shared filter must sound equally loud')
    assert.ok(audio.highpass1 < audio.only1 * 0.05, 'Shared HP must attenuate oscillator 1 low frequencies')
    assert.ok(audio.highpass2 < audio.only2 * 0.05, 'Shared HP must attenuate oscillator 2 low frequencies')
    assert.ok(audio.lowpass < audio.only1 * 0.1, 'LP must attenuate high frequencies')
    assert.ok(audio.bandCenter > audio.bandOff * 10, 'BP must pass its center frequency')
    assert.ok(Math.abs(audio.unison - audio.only1) < 0.00001, 'Aligned unison copies must not increase volume')
    assert.ok(audio.phase < audio.mixed * 0.05, 'Near-opposite sine phase must change the mixed output')
    assert.ok(audio.pulseEvenHarmonic > audio.squareEvenHarmonic * 10, 'Pulse width must change the audible harmonic spectrum')
  } finally {
    await page.close()
  }
})
