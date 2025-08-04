import WebSocket from 'ws';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// === LOAD GOOGLE CREDENTIALS FROM ENV ===
const creds = JSON.parse(process.env.GOOGLE_CREDS_JSON);

// === CONFIG ===
const sheetId = '1y2SIXUEosQZG8F1sOMazF4N8WopDJ__adEtWMKrbAzc'; // Your sheet ID
const pairs = [
  'xrp_idr', 'btc_idr', 'eth_idr', 'ada_idr', 'hbar_idr', 'sol_idr',
  'pepe_idr', 'doge_idr', 'pengu_idr', 'avax_idr', 'shib_idr',
  'trollsol_idr', 'alpaca_idr'
];
const ASK_WALL_THRESHOLD = 100000;     // Adjust as needed
const LARGE_TRADE_SIZE = 1.5;          // Example whale size

const ws = new WebSocket('wss://streamer.indodax.com/ws/');
const doc = new GoogleSpreadsheet(sheetId);

(async () => {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle['WhaleMonitor'];

  ws.on('open', () => {
    console.log('✅ WebSocket connected. Subscribing to pairs...');
    pairs.forEach(pair => {
      ws.send(JSON.stringify({ event: 'subscribe', channel: `depth.${pair}` }));
      ws.send(JSON.stringify({ event: 'subscribe', channel: `trades.${pair}` }));
    });
  });

  ws.on('message', async (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      console.warn('⚠️ Invalid JSON:', msg);
      return;
    }
    if (!data.data || !data.channel) return;

    const [channelType, pair] = data.channel.split('.');
    const now = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Jakarta" });

    if (channelType === 'depth') {
      const topAsk = data.data.asks?.[0];
      if (topAsk && parseFloat(topAsk[1]) > ASK_WALL_THRESHOLD) {
        await sheet.addRow({
          Timestamp: now,
          Pair: pair,
          Type: 'ask_wall',
          Event: 'Large Ask Wall',
          Volume: topAsk[1],
          Price: topAsk[0],
          Note: 'Wall exceeds threshold'
        });
        console.log(`[${pair}] 🚧 Ask Wall logged: ${topAsk[1]} @ ${topAsk[0]}`);
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
          console.log(`[${pair}] 🐋 Whale Buy logged: ${t.amount} @ ${t.price}`);
        }
      }
    }
  });

  ws.on('close', () => {
    console.log('❌ WebSocket closed. Restart app on Render.');
    process.exit(1);
  });
})();

