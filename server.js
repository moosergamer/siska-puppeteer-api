const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('✅ Server is up. Try /api/videos?page=1');
});

app.get('/api/videos', async (req, res) => {
  console.log("🔍 /api/videos endpoint hit");

  const pageNum = parseInt(req.query.page || '1');
  const perPage = 10;

  try {
    const browser = await puppeteer.launch({
      executablePath: '/usr/bin/chromium-browser',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.goto('https://xtime.video', { waitUntil: 'networkidle2' });

    const allVideos = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="video.php?videoID="]'));
      return anchors.map(a => {
        const idMatch = a.href.match(/videoID=(\d+)/);
        const img = a.querySelector('img')?.src || '';
        const title = a.getAttribute('title') || a.textContent.trim();
        return {
          video_id: idMatch ? idMatch[1] : null,
          title,
          thumbnail: img
        };
      }).filter(v => v.video_id);
    });

    const paged = allVideos.slice((pageNum - 1) * perPage, pageNum * perPage);

    for (const video of paged) {
      const videoPage = await browser.newPage();
      await videoPage.goto(`https://xtime.video/video.php?videoID=${video.video_id}`, {
        waitUntil: 'domcontentloaded'
      });

      const embed_links = await videoPage.evaluate(() =>
        Array.from(document.querySelectorAll('iframe')).map(i => i.src)
      );

      video.embed_links = embed_links;
      await videoPage.close();
    }

    await browser.close();

    res.json({
      page: pageNum,
      per_page: perPage,
      total: allVideos.length,
      videos: paged
    });

  } catch (err) {
    console.error("🔥 Scraper error:", err);
    res.status(500).json({ error: err.message });
  }
});

process.on('unhandledRejection', err => {
  console.error('🔥 Unhandled Rejection:', err);
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
