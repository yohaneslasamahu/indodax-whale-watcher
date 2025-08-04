import WebSocket from 'ws';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import creds from './google-creds.json' assert { type: 'json' };

// === CONFIGURATION ===
const sheetId = '1y2SIXUEosQZG8F1sOMazF4N8WopDJ__adEtWMKrbAzc';
const pairs = ['xrp_idr', 'btc_idr'];
const ASK_WALL_THRESHOLD = 100000;   // Adjust as needed
const LARGE_TRADE_SIZE = 1.5;        // Adjust as needed

const ws = new WebSocket('wss://streamer.indodax.com/ws/');
const doc = new GoogleSpreadsheet(sheetId);

(async () => {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['WhaleMonitor'];

  ws.on('open', () => {
    console.log('✅ WebSocket connected.');
    pairs.forEach(pair => {
      ws.send(JSON.stringify({ event: 'subscribe', channel: `depth.${pair}` }));
      ws.send(JSON.stringify({ event: 'subscribe', channel: `trades.${pair}` }));
    });
  });

  ws.on('message', async (msg) => {
    const data = JSON.parse(msg);
    if (!data.data || !data.channel) return;

    const [channelType, pair] = data.channel.split('.');
    const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // === Ask Wall Monitoring ===
    if (channelType === 'depth') {
      const topAsk = data.data.asks[0];
      const askVolume = parseFloat(topAsk[1]);

      if (askVolume > ASK_WALL_THRESHOLD) {
        await sheet.addRow({
          Timestamp: now,
          Pair: pair,
          Type: 'ask_wall',
          Event: 'Large Ask Wall',
          Volume: askVolume,
          Price: topAsk[0],
          Note: 'Wall exceeds threshold'
        });
        console.log(`📉 Ask Wall on ${pair}: ${askVolume} @ ${topAsk[0]}`);
      }
    }

    // === Whale Buy Detection ===
    if (channelType === 'trades') {
      const trades = data.data;

      for (let t of trades) {
        const tradeAmount = parseFloat(t.amount);
        if (t.type === 'buy' && tradeAmount > LARGE_TRADE_SIZE) {
          await sheet.addRow({
            Timestamp: now,
            Pair: pair,
            Type: 'whale_buy',
            Event: 'Large Buy Detected',
            Volume: tradeAmount,
            Price: t.price,
            Note: 'Big buyer activity'
          });
          console.log(`🐋 Whale Buy on ${pair}: ${tradeAmount} @ ${t.price}`);
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('⚠️ WebSocket closed. App will exit.');
    process.exit(1);
  });
})();
