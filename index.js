import { readFile } from 'fs/promises';
import WebSocket from 'ws';
import { GoogleSpreadsheet } from 'google-spreadsheet';

const creds = JSON.parse(
  await readFile(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')
);

// === CONFIG ===
const sheetId = '1y2SIXUEosQZG8F1sOMazF4N8WopDJ__adEtWMKrbAzc';
const pairs = ['xrp_idr', 'btc_idr'];
const ASK_WALL_THRESHOLD = 100000;
const LARGE_TRADE_SIZE = 1.5;

const ws = new WebSocket('wss://streamer.indodax.com/ws/');
const doc = new GoogleSpreadsheet(sheetId);

(async () => {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['WhaleMonitor'];

  ws.on('open', () => {
    console.log('WebSocket connected');
    pairs.forEach(pair => {
      ws.send(JSON.stringify({ event: 'subscribe', channel: `depth.${pair}` }));
      ws.send(JSON.stringify({ event: 'subscribe', channel: `trades.${pair}` }));
    });
  });

  ws.on('message', async (msg) => {
    const data = JSON.parse(msg);
    if (!data.data || !data.channel) return;

    const [channelType, pair] = data.channel.split('.');
    const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });

    if (channelType === 'depth') {
      const topAsk = data.data.asks[0];
      if (parseFloat(topAsk[1]) > ASK_WALL_THRESHOLD) {
        await sheet.addRow({
          Timestamp: now,
          Pair: pair,
          Type: 'ask_wall',
          Event: 'Large Ask Wall',
          Volume: topAsk[1],
          Price: topAsk[0],
          Note: 'Wall exceeds threshold'
        });
      }
    }

    if (channelType === 'trades') {
      const trades = data.data;
      for (let t of trades) {
        if (t.type === 'buy' && parseFloat(t.amount) > LARGE_TRADE_SIZE) {
          await sheet.addRow({
            Timestamp: now,
            Pair: pair,
            Type: 'whale_buy',
            Event: 'Large Buy Detected',
            Volume: t.amount,
            Price: t.price,
            Note: 'Big buyer activity'
          });
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('WebSocket closed. Restart app on Render.');
    process.exit(1);
  });
})();
